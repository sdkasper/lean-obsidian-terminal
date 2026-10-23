import { requestUrl } from "obsidian";
// @ts-ignore — esbuild raw-text plugin inlines this file as a string at build time
import WINDOWS_CONOUT_PATCH from "../patches/windowsConoutConnection.js?raw";
import {
  requireNode,
  nodeProcess,
  type FsApi,
  type PathApi,
  type ChildProcessApi,
  type CryptoApi,
} from "./node-api";
import { unsafeZipEntry } from "./zip-entries";
import { psSingleQuote } from "./path-links";

export type BinaryStatus = "not-installed" | "checking" | "downloading" | "ready" | "error";

interface BinaryManifest {
  version: string;
  platform: string;
  arch: string;
  installedAt: string;
}

const REPO_OWNER = "sdkasper";
const REPO_NAME = "lean-obsidian-terminal";


export class BinaryManager {
  private status: BinaryStatus = "not-installed";
  private statusMessage = "";
  private pluginDir: string;
  private nodePtyDir: string;
  private manifestPath: string;
  private readonly fs: FsApi;
  private readonly path: PathApi;
  private readonly childProcess: ChildProcessApi;
  private readonly crypto: CryptoApi;

  constructor(pluginDir: string) {
    this.pluginDir = pluginDir;
    this.fs = requireNode("fs");
    this.path = requireNode("path");
    this.childProcess = requireNode("child_process");
    this.crypto = requireNode("crypto");

    this.nodePtyDir = this.path.join(pluginDir, "node_modules", "node-pty");
    this.manifestPath = this.path.join(this.nodePtyDir, ".binary-manifest.json");
  }

  checkInstalled(): boolean {
    this.setStatus("checking");

    try {
      const platform = nodeProcess.platform;
      const arch = nodeProcess.arch;

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

      // Manifest is informational only (version display via getVersion()).
      // A stale or mismatched manifest does not override a passing binary check —
      // the files above are the authoritative signal.

      this.setStatus("ready");
      return true;
    } catch {
      this.setStatus("not-installed");
      return false;
    }
  }

  /** Names of the entries in the zip, read without extracting it. */
  private listZipEntries(platform: string, zipPath: string): string[] {
    const out =
      platform === "win32"
        ? this.childProcess.execFileSync(
            "powershell",
            [
              "-NoProfile",
              "-Command",
              `Add-Type -AssemblyName System.IO.Compression.FileSystem; [IO.Compression.ZipFile]::OpenRead(${psSingleQuote(zipPath)}).Entries | ForEach-Object { $_.FullName }`,
            ],
            { encoding: "utf8", timeout: 30000, windowsHide: true }
          )
        : this.childProcess.execFileSync("unzip", ["-Z1", zipPath], { encoding: "utf8", timeout: 30000 });
    return out.split(/\r?\n/).filter((line) => line.length > 0);
  }

  private inflight: Promise<void> | null = null;

  /** Concurrent callers share one download instead of racing on the install dir. */
  download(version?: string): Promise<void> {
    if (this.inflight) return this.inflight;
    const run = this.runDownload(version).finally(() => {
      this.inflight = null;
    });
    this.inflight = run;
    return run;
  }

  private async runDownload(version?: string): Promise<void> {
    this.setStatus("downloading", "Fetching release info...");

    try {
      // Get latest release version if not specified
      if (!version) {
        const releaseUrl = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest`;
        const releaseResp = await requestUrl({ url: releaseUrl });
        version = (releaseResp.json as { tag_name: string }).tag_name.replace(/^v/, "");
      }

      const platform = nodeProcess.platform;
      const arch = nodeProcess.arch;
      const assetName = `node-pty-${platform}-${arch}.zip`;
      const tag = version;
      const baseUrl = `https://github.com/${REPO_OWNER}/${REPO_NAME}/releases/download/${tag}`;

      // Download checksums — required; abort if unavailable
      this.setStatus("downloading", "Downloading checksums...");
      const checksumResp = await requestUrl({ url: `${baseUrl}/checksums.json` });
      const checksums = checksumResp.json as Record<string, string>;

      // Download binary zip
      this.setStatus("downloading", `Downloading ${assetName}...`);
      const zipResp = await requestUrl({
        url: `${baseUrl}/${assetName}`,
        contentType: "application/octet-stream",
      });
      // Uint8Array instead of Buffer: works for both hashing and writeFileSync,
      // and avoids depending on the Node Buffer global (see node-api.ts).
      const zipBuffer = new Uint8Array(zipResp.arrayBuffer);

      // Verify checksum — always required
      const expectedHash = checksums[assetName];
      if (!expectedHash) {
        throw new Error(`No checksum found for ${assetName} in checksums.json`);
      }
      const actualHash = this.crypto.createHash("sha256").update(zipBuffer).digest("hex");
      if (actualHash !== expectedHash) {
        throw new Error(
          `Checksum mismatch for ${assetName}: expected ${expectedHash}, got ${actualHash}`
        );
      }

      // Write zip to temp file
      this.setStatus("downloading", "Extracting...");
      const tmpDir = this.path.join(this.pluginDir, "tmp");
      this.fs.mkdirSync(tmpDir, { recursive: true });
      const tmpZip = this.path.join(tmpDir, assetName);
      this.fs.writeFileSync(tmpZip, zipBuffer);

      // Extract into a staging directory next to the install, so a failed or
      // blocked extraction never leaves the working install half deleted.
      const stagingDir = `${this.nodePtyDir}.new`;
      // Unique per run: a locked leftover from an earlier run (loaded pty.node on
      // Windows) must not block this one.
      const oldDir = `${this.nodePtyDir}.old-${Date.now()}`;
      let movedOld = false;
      let swapped = false;

      try {
        this.fs.rmSync(stagingDir, { recursive: true, force: true });
        this.fs.mkdirSync(stagingDir, { recursive: true });

        // Refuse archives with entries that would land outside the target folder.
        const entries = this.listZipEntries(platform, tmpZip);
        const bad = entries.find(unsafeZipEntry);
        if (bad !== undefined) throw new Error(`Unsafe path in ${assetName}: ${bad}`);

        // Extract zip using platform-native tools
        if (platform === "win32") {
          this.childProcess.execFileSync(
            "powershell",
            [
              "-NoProfile",
              "-Command",
              `Expand-Archive -LiteralPath ${psSingleQuote(tmpZip)} -DestinationPath ${psSingleQuote(stagingDir)} -Force`,
            ],
            { timeout: 30000 }
          );
        } else {
          this.childProcess.execFileSync(
            "unzip",
            ["-o", tmpZip, "-d", stagingDir],
            { timeout: 30000 }
          );
          // Ensure spawn-helper is executable
          const spawnHelper = this.path.join(
            stagingDir, "prebuilds", `${platform}-${arch}`, "spawn-helper"
          );
          if (this.fs.existsSync(spawnHelper)) {
            this.fs.chmodSync(spawnHelper, 0o755);
          }
        }

        // Apply Windows patch
        if (platform === "win32") {
          const patchDest = this.path.join(stagingDir, "lib", "windowsConoutConnection.js");
          this.fs.writeFileSync(patchDest, WINDOWS_CONOUT_PATCH as string, "utf-8");
        }

        // Swap the staged install in, keeping the old one until the swap succeeds.
        if (this.fs.existsSync(this.nodePtyDir)) {
          try {
            this.fs.renameSync(this.nodePtyDir, oldDir);
            movedOld = true;
          } catch {
            throw new Error(
              "The current terminal binaries could not be replaced. Restart Obsidian and try again."
            );
          }
        }
        try {
          this.fs.renameSync(stagingDir, this.nodePtyDir);
          swapped = true;
        } catch (err) {
          // Put the previous install back before reporting the failure.
          if (movedOld) {
            try {
              this.fs.renameSync(oldDir, this.nodePtyDir);
              movedOld = false;
            } catch (restoreErr) {
              console.error("Terminal: could not restore the previous binaries", restoreErr);
            }
          }
          throw err;
        }
      } finally {
        const cleanUp = (p: string): void => {
          try {
            this.fs.rmSync(p, { recursive: true, force: true });
          } catch {
            // a locked leftover only wastes disk space; the next run uses a new name
          }
        };
        cleanUp(stagingDir);
        // The old install is only deleted once the new one is in place; if the
        // rollback itself failed it is the only copy left and stays on disk.
        if (swapped) cleanUp(oldDir);
        try {
          this.fs.unlinkSync(tmpZip);
        } catch {
          // ignore
        }
      }

      // Write binary manifest
      const manifest: BinaryManifest = {
        version: version,
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

  /** Reads version from the binary manifest. For display only — may be stale
   *  if the manifest was written by a prior install. Never gate behaviour on it. */
  getVersion(): string | null {
    try {
      if (this.fs.existsSync(this.manifestPath)) {
        const manifest = JSON.parse(
          this.fs.readFileSync(this.manifestPath, "utf-8")
        ) as BinaryManifest;
        return manifest.version;
      }
    } catch {
      // ignore
    }
    return null;
  }

  getPlatformInfo(): { platform: string; arch: string } {
    return { platform: nodeProcess.platform, arch: nodeProcess.arch };
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

  private setStatus(status: BinaryStatus, message = ""): void {
    this.status = status;
    this.statusMessage = message;
  }
}
