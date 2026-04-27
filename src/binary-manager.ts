import { requestUrl } from "obsidian";

export type BinaryStatus = "not-installed" | "checking" | "downloading" | "ready" | "error";

interface BinaryManifest {
  version: string;
  platform: string;
  arch: string;
  installedAt: string;
}

const REPO_OWNER = "sdkasper";
const REPO_NAME = "lean-obsidian-terminal";

// Patched ConoutConnection for Windows — replaces Worker-based implementation
// with inline socket piping (Worker threads unavailable in Obsidian's renderer).
const WINDOWS_CONOUT_PATCH = `"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConoutConnection = void 0;
var net = require("net");
var conout_1 = require("./shared/conout");
var ConoutConnection = (function () {
    function ConoutConnection(_conoutPipeName, _useConptyDll) {
        var _this = this;
        this._conoutPipeName = _conoutPipeName;
        this._useConptyDll = _useConptyDll;
        this._isDisposed = false;
        this._readyCallbacks = [];
        this._isReady = false;
        this._conoutSocket = null;
        this._server = null;
        this._drainTimeout = null;
        this._conoutSocket = new net.Socket();
        this._conoutSocket.setEncoding('utf8');
        this._conoutSocket.connect(_conoutPipeName, function () {
            _this._server = net.createServer(function (workerSocket) {
                _this._conoutSocket.pipe(workerSocket);
            });
            _this._server.listen(conout_1.getWorkerPipeName(_conoutPipeName));
            _this._isReady = true;
            _this._readyCallbacks.forEach(function (cb) { cb(); });
            _this._readyCallbacks = [];
        });
        this._conoutSocket.on('error', function () {});
    }
    ConoutConnection.prototype.onReady = function (listener) {
        if (this._isReady) { listener(); } else { this._readyCallbacks.push(listener); }
        return { dispose: function () {} };
    };
    ConoutConnection.prototype.connectSocket = function (socket) {
        socket.connect(conout_1.getWorkerPipeName(this._conoutPipeName));
    };
    ConoutConnection.prototype.dispose = function () {
        var _this = this;
        if (!this._useConptyDll && this._isDisposed) { return; }
        this._isDisposed = true;
        if (this._drainTimeout) { clearTimeout(this._drainTimeout); }
        this._drainTimeout = setTimeout(function () {
            try {
                if (_this._server) _this._server.close();
                if (_this._conoutSocket) _this._conoutSocket.destroy();
            } catch (e) {}
        }, 1000);
    };
    return ConoutConnection;
}());
exports.ConoutConnection = ConoutConnection;
`;

export class BinaryManager {
  private status: BinaryStatus = "not-installed";
  private statusMessage = "";
  private pluginDir: string;
  private nodePtyDir: string;
  private manifestPath: string;
  private callbacks: Set<(status: BinaryStatus) => void> = new Set();

  private readonly fs: typeof import("fs");
  private readonly path: typeof import("path");
  private readonly os: typeof import("os");
  private readonly childProcess: typeof import("child_process");
  private readonly crypto: typeof import("crypto");

  constructor(pluginDir: string) {
    this.pluginDir = pluginDir;
    this.fs = window.require("fs") as typeof import("fs");
    this.path = window.require("path") as typeof import("path");
    this.os = window.require("os") as typeof import("os");
    this.childProcess = window.require("child_process") as typeof import("child_process");
    this.crypto = window.require("crypto") as typeof import("crypto");

    this.nodePtyDir = this.path.join(pluginDir, "node_modules", "node-pty");
    this.manifestPath = this.path.join(this.nodePtyDir, ".binary-manifest.json");
  }

  checkInstalled(): boolean {
    this.setStatus("checking");

    try {
      const platform = process.platform;
      const arch = process.arch;

      // Check core JS entry point
      const indexPath = this.path.join(this.nodePtyDir, "lib", "index.js");
      if (!this.fs.existsSync(indexPath)) {
        this.setStatus("not-installed");
        return false;
      }

      // Check for native binary — prebuilds (win32/darwin) or build/Release (linux)
      const prebuildDir = this.path.join(this.nodePtyDir, "prebuilds", `${platform}-${arch}`);
      const buildReleaseDir = this.path.join(this.nodePtyDir, "build", "Release");
      const hasPrebuild = this.fs.existsSync(this.path.join(prebuildDir, "pty.node"));
      const hasBuildRelease = this.fs.existsSync(this.path.join(buildReleaseDir, "pty.node"));

      if (!hasPrebuild && !hasBuildRelease) {
        this.setStatus("not-installed");
        return false;
      }

      // Platform-specific checks
      // winpty.dll is only shipped for win32-x64; ARM64 Windows uses ConPTY natively.
      if (platform === "win32" && arch !== "arm64" && hasPrebuild) {
        const winpty = this.path.join(prebuildDir, "winpty.dll");
        if (!this.fs.existsSync(winpty)) {
          this.setStatus("not-installed");
          return false;
        }
      } else if (platform !== "win32" && hasPrebuild) {
        const spawnHelper = this.path.join(prebuildDir, "spawn-helper");
        if (!this.fs.existsSync(spawnHelper)) {
          this.setStatus("not-installed");
          return false;
        }
      }

      // Check manifest matches current platform
      if (this.fs.existsSync(this.manifestPath)) {
        const manifest: BinaryManifest = JSON.parse(
          this.fs.readFileSync(this.manifestPath, "utf-8")
        );
        if (manifest.platform !== platform || manifest.arch !== arch) {
          this.setStatus("not-installed");
          return false;
        }
      }

      this.setStatus("ready");
      return true;
    } catch {
      this.setStatus("not-installed");
      return false;
    }
  }

  async download(version?: string): Promise<void> {
    this.setStatus("downloading", "Fetching release info...");

    try {
      // Get latest release version if not specified
      if (!version) {
        const releaseUrl = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest`;
        const releaseResp = await requestUrl({ url: releaseUrl });
        version = releaseResp.json.tag_name.replace(/^v/, "");
      }

      const platform = process.platform;
      const arch = process.arch;
      const assetName = `node-pty-${platform}-${arch}.zip`;
      const tag = version;
      const baseUrl = `https://github.com/${REPO_OWNER}/${REPO_NAME}/releases/download/${tag}`;

      // Download checksums
      this.setStatus("downloading", "Downloading checksums...");
      let checksums: Record<string, string> = {};
      try {
        const checksumResp = await requestUrl({ url: `${baseUrl}/checksums.json` });
        checksums = checksumResp.json;
      } catch {
        // Checksums optional — warn but continue
        console.warn("Terminal: checksums.json not found, skipping verification");
      }

      // Download binary zip
      this.setStatus("downloading", `Downloading ${assetName}...`);
      const zipResp = await requestUrl({
        url: `${baseUrl}/${assetName}`,
        contentType: "application/octet-stream",
      });
      const zipBuffer = Buffer.from(zipResp.arrayBuffer);

      // Verify checksum if available
      if (checksums[assetName]) {
        const hash = this.crypto
          .createHash("sha256")
          .update(zipBuffer)
          .digest("hex");
        if (hash !== checksums[assetName]) {
          throw new Error(
            `Checksum mismatch for ${assetName}: expected ${checksums[assetName]}, got ${hash}`
          );
        }
      }

      // Write zip to temp file
      this.setStatus("downloading", "Extracting...");
      const tmpDir = this.os.tmpdir();
      const tmpZip = this.path.join(tmpDir, assetName);
      this.fs.writeFileSync(tmpZip, zipBuffer);

      // Clean existing node-pty dir
      if (this.fs.existsSync(this.nodePtyDir)) {
        this.fs.rmSync(this.nodePtyDir, { recursive: true, force: true });
      }
      this.fs.mkdirSync(this.nodePtyDir, { recursive: true });

      // Extract zip using platform-native tools
      if (platform === "win32") {
        this.childProcess.execSync(
          `powershell -NoProfile -Command "Expand-Archive -Path '${tmpZip}' -DestinationPath '${this.nodePtyDir}' -Force"`,
          { timeout: 30000 }
        );
      } else {
        this.childProcess.execSync(
          `unzip -o "${tmpZip}" -d "${this.nodePtyDir}"`,
          { timeout: 30000 }
        );
        // Ensure spawn-helper is executable
        const spawnHelper = this.path.join(
          this.nodePtyDir, "prebuilds", `${platform}-${arch}`, "spawn-helper"
        );
        if (this.fs.existsSync(spawnHelper)) {
          this.fs.chmodSync(spawnHelper, 0o755);
        }
      }

      // Clean up temp file
      try {
        this.fs.unlinkSync(tmpZip);
      } catch {
        // ignore
      }

      // Apply Windows patch
      if (platform === "win32") {
        const patchDest = this.path.join(this.nodePtyDir, "lib", "windowsConoutConnection.js");
        this.fs.writeFileSync(patchDest, WINDOWS_CONOUT_PATCH, "utf-8");
      }

      // Write binary manifest
      const manifest: BinaryManifest = {
        version: version!,
        platform,
        arch,
        installedAt: new Date().toISOString(),
      };
      this.fs.writeFileSync(this.manifestPath, JSON.stringify(manifest, null, 2), "utf-8");

      this.setStatus("ready");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("Terminal: binary download failed", err);
      this.setStatus("error", message);
      throw err;
    }
  }

  remove(): void {
    try {
      if (this.fs.existsSync(this.nodePtyDir)) {
        this.fs.rmSync(this.nodePtyDir, { recursive: true, force: true });
      }
      this.setStatus("not-installed");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.setStatus("error", message);
      throw err;
    }
  }

  getVersion(): string | null {
    try {
      if (this.fs.existsSync(this.manifestPath)) {
        const manifest: BinaryManifest = JSON.parse(
          this.fs.readFileSync(this.manifestPath, "utf-8")
        );
        return manifest.version;
      }
    } catch {
      // ignore
    }
    return null;
  }

  getPlatformInfo(): { platform: string; arch: string } {
    return { platform: process.platform, arch: process.arch };
  }

  isReady(): boolean {
    return this.status === "ready";
  }

  getStatus(): BinaryStatus {
    return this.status;
  }

  getStatusMessage(): string {
    return this.statusMessage;
  }

  onStatusChange(cb: (status: BinaryStatus) => void): () => void {
    this.callbacks.add(cb);
    return () => this.callbacks.delete(cb);
  }

  private setStatus(status: BinaryStatus, message = ""): void {
    this.status = status;
    this.statusMessage = message;
    for (const cb of this.callbacks) {
      cb(status);
    }
  }
}
