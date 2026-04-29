// Minimal stubs for the obsidian module used in test files.
// Only the symbols that the tested source files import at module level are included.

export class Notice {
  constructor(_msg: string, _timeout?: number) {}
}

export class TFile {
  path = "";
  name = "";
  basename = "";
  extension = "";
  parent = null;
  stat = { mtime: 0, ctime: 0, size: 0 };
}

export class FileSystemAdapter {
  getBasePath(): string { return ""; }
}

export class FuzzySuggestModal<T> {
  constructor(_app: unknown) {}
  open(): void {}
  close(): void {}
  setPlaceholder(_s: string): this { return this; }
  getItems(): T[] { return []; }
  getItemText(_item: T): string { return ""; }
  onChooseItem(_item: T, _evt: MouseEvent | KeyboardEvent): void {}
}

export class App {}

export const Platform = {
  isWin: false,
  isMac: false,
  isLinux: true,
  isDesktop: true,
  isMobile: false,
};

export type EventRef = object;
