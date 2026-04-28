declare global {
  interface Window {
    require: NodeJS.Require;
  }
}

// Files imported with the `?raw` suffix are inlined as strings by esbuild.
declare module "*?raw" {
  const content: string;
  export default content;
}

export {};
