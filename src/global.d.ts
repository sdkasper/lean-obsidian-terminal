declare global {
  interface Window {
    // Electron's renderer require. Returns unknown (not NodeJS.Require) so
    // every call site must assert a self-contained structural type - see
    // src/node-api.ts for why ambient Node typings cannot be relied on.
    require: (id: string) => unknown;
  }
}

// Files imported with the `?raw` suffix are inlined as strings by esbuild.
declare module "*?raw" {
  const content: string;
  export default content;
}

export {};
