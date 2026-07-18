/**
 * Typed access to the Node.js APIs this plugin uses via Electron's
 * `window.require`.
 *
 * The interfaces below are deliberately self-contained structural types
 * instead of `typeof import("fs")` etc.: Obsidian's plugin review tooling
 * runs type-aware lint WITHOUT `@types/node`, so Node module types, the
 * `NodeJS` namespace, `process`, and `Buffer` all resolve to error types
 * there and every downstream use gets flagged as unsafe. Keeping the
 * boundary typed by hand makes the code check out in both environments.
 * Only the members actually used by the plugin are declared - extend them
 * here when new Node API surface is needed.
 */

export interface FsStats {
  mtime: Date;
  isFile(): boolean;
}

export interface FsReadStream {
  destroy(): void;
  on(event: "error", listener: () => void): this;
}

export interface FsPromisesApi {
  readdir(dir: string): Promise<string[]>;
  stat(path: string): Promise<FsStats>;
  readFile(path: string, encoding: "utf-8"): Promise<string>;
}

export interface FsApi {
  existsSync(path: string): boolean;
  statSync(path: string): FsStats;
  mkdirSync(path: string, options?: { recursive?: boolean }): void;
  readFileSync(path: string, encoding: "utf-8"): string;
  writeFileSync(path: string, data: string | Uint8Array, encoding?: "utf-8"): void;
  rmSync(path: string, options?: { recursive?: boolean; force?: boolean }): void;
  unlinkSync(path: string): void;
  chmodSync(path: string, mode: number): void;
  createReadStream(path: string, options?: { encoding?: "utf-8" }): FsReadStream;
  promises: FsPromisesApi;
}

export interface PathApi {
  join(...parts: string[]): string;
  isAbsolute(path: string): boolean;
  sep: string;
}

export interface ChildProcessApi {
  execFileSync(file: string, args: string[], options?: { timeout?: number }): unknown;
}

export interface CryptoHash {
  update(data: Uint8Array): CryptoHash;
  digest(encoding: "hex"): string;
}

export interface CryptoApi {
  createHash(algorithm: string): CryptoHash;
}

export interface ReadlineInterface {
  on(event: "line", listener: (line: string) => void): this;
  on(event: "close" | "error", listener: () => void): this;
}

export interface ReadlineApi {
  createInterface(options: { input: FsReadStream; crlfDelay?: number }): ReadlineInterface;
}

export interface ProcessApi {
  platform: string;
  arch: string;
  env: Record<string, string | undefined>;
  cwd(): string;
}

interface NodeModuleMap {
  fs: FsApi;
  path: PathApi;
  child_process: ChildProcessApi;
  crypto: CryptoApi;
  readline: ReadlineApi;
}

/** Load a Node built-in through Electron's require, typed by NodeModuleMap. */
export function requireNode<K extends keyof NodeModuleMap>(id: K): NodeModuleMap[K] {
  return window.require(id) as NodeModuleMap[K];
}

// The renderer's global `process` (Obsidian runs with Node integration).
// Declared locally so the type does not depend on @types/node.
declare const process: ProcessApi;

export const nodeProcess: ProcessApi = process;
