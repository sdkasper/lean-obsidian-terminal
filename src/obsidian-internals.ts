import type { App, TFile } from "obsidian";

/** Obsidian's internal drag-and-drop manager — not part of the public API. */
export interface DragManagerInternal {
  draggable?: { file?: TFile } | null;
}

/** App cast that exposes the internal drag manager. */
export interface AppWithDrag extends App {
  dragManager?: DragManagerInternal;
}

/** Electron 32+ webUtils for resolving filesystem paths from File objects. */
export interface ElectronWithWebUtils {
  webUtils: { getPathForFile(file: File): string };
}

/** Legacy Electron File extension — .path was available before Electron 32. */
export interface FileWithPath extends File {
  path?: string;
}
