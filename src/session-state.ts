/**
 * Shared types for terminal session persistence.
 *
 * SavedTab is the unit of persistence — one per terminal session (tab).
 * SavedViewState is what TerminalView.getState/setState serialize.
 */

export interface SavedTab {
  /** User-visible tab name (e.g. "Terminal 3" or a renamed value). */
  name: string;
  /** Tab accent color (hex or empty). Matches TAB_COLORS values. */
  color: string;
  /** Working directory when the session was started. */
  cwd: string;
  /**
   * Serialized xterm.js buffer (from @xterm/addon-serialize).
   * Absent when persistBuffer setting is off, or when nothing has been written yet.
   */
  bufferSerial?: string;
  /**
   * Command to run after the shell spawns on restore
   * (e.g. "claude --resume <uuid>").
   */
  resumeCommand?: string;
  /** Whether this tab was pinned when state was captured. */
  pinned?: boolean;
}

export interface SavedViewState {
  /** Tabs in their original left-to-right order. */
  tabs: SavedTab[];
  /** Index of the tab that was active when state was captured. */
  activeIndex: number;
}

/**
 * A SavedTab captured at close time, for the recent-sessions rescue buffer.
 * Stored in plugin data (data.json), not in workspace.json.
 */
export interface RecentSession extends SavedTab {
  /** Epoch ms when the tab was closed. */
  closedAt: number;
}
