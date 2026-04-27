import { FuzzySuggestModal, Notice, FileSystemAdapter } from "obsidian";
import type TerminalPlugin from "./main";
import type { RecentSession, SavedTab } from "./session-state";
import type { CreateTabOpts } from "./terminal-tab-manager";
import { openTabOrView } from "./terminal-opener";
import {
  scanClaudeProjectSessions,
  getVaultBasePath,
  type ClaudeSessionEntry,
} from "./claude-sessions";

/**
 * Push a closed tab onto the recents ring buffer, trimmed to the configured max.
 * Called from TerminalTabManager via the onSessionClose callback.
 */
export async function pushRecentSession(plugin: TerminalPlugin, tab: SavedTab): Promise<void> {
  const max = plugin.settings.recentSessionsMax;
  if (max <= 0) return;

  const entry: RecentSession = { ...tab, closedAt: Date.now() };
  plugin.settings.recentSessions.unshift(entry);
  if (plugin.settings.recentSessions.length > max) {
    plugin.settings.recentSessions.length = max;
  }
  await plugin.saveSettings();
}

/**
 * Open the unified "Restore recent terminal session" picker.
 * Shows recents always; also shows Claude sessions when that integration is enabled.
 */
export async function openRecentSessionPicker(plugin: TerminalPlugin): Promise<void> {
  const recents = plugin.settings.recentSessions;

  let claudeEntries: ClaudeSessionEntry[] = [];
  if (plugin.settings.enableClaudeIntegration) {
    const cwd = getVaultBasePath(plugin);
    if (cwd) {
      claudeEntries = await scanClaudeProjectSessions(cwd, plugin.settings.claudeSessionsMax);
    }
  }

  if (recents.length === 0 && claudeEntries.length === 0) {
    new Notice("No recent or Claude sessions to restore.");
    return;
  }

  const items: PickerItem[] = [
    ...recents.map((s): PickerItem => ({ kind: "recent", session: s, ts: s.closedAt })),
    ...claudeEntries.map((s): PickerItem => ({
      kind: "claude",
      session: s,
      ts: s.modified ? Date.parse(s.modified) : 0,
    })),
  ];

  // Merge by recency — most recent first, regardless of source
  items.sort((a, b) => b.ts - a.ts);

  new UnifiedSessionPicker(plugin, items).open();
}

type PickerItem =
  | { kind: "recent"; session: RecentSession; ts: number }
  | { kind: "claude"; session: ClaudeSessionEntry; ts: number };

class UnifiedSessionPicker extends FuzzySuggestModal<PickerItem> {
  private plugin: TerminalPlugin;
  private items: PickerItem[];

  constructor(plugin: TerminalPlugin, items: PickerItem[]) {
    super(plugin.app);
    this.plugin = plugin;
    this.items = items;
    this.setPlaceholder("Pick a session to restore…");
  }

  getItems(): PickerItem[] {
    return this.items;
  }

  getItemText(item: PickerItem): string {
    if (item.kind === "recent") {
      const s = item.session;
      const age = relativeTime(Date.now() - s.closedAt);
      return `[Recent] ${s.name} - ${s.cwd} (${age})`;
    }
    const s = item.session;
    const title = s.summary || s.firstPrompt || `(${s.sessionId.slice(0, 8)})`;
    const when = s.modified ? s.modified.slice(0, 10) : "unknown";
    return `[Claude] ${title} (${when})`;
  }

  onChooseItem(item: PickerItem): void {
    if (item.kind === "recent") {
      void restoreRecent(this.plugin, item.session);
    } else {
      void restoreClaude(this.plugin, item.session);
    }
  }
}

/**
 * Restore a recent terminal session: create a tab (or open a view) with the saved state.
 * Consumes the entry from recents — closing the tab again will re-add it.
 */
async function restoreRecent(plugin: TerminalPlugin, session: RecentSession): Promise<void> {
  const idx = plugin.settings.recentSessions.indexOf(session);
  if (idx >= 0) {
    plugin.settings.recentSessions.splice(idx, 1);
    await plugin.saveSettings();
  }

  const opts: CreateTabOpts = {
    name: session.name,
    color: session.color,
    cwd: session.cwd,
    bufferSerial: session.bufferSerial,
    resumeCommand: session.resumeCommand,
  };
  await openTabOrView(plugin, opts);
}

/** Restore a Claude Code session by running `claude --resume <uuid>` in a new tab. */
async function restoreClaude(plugin: TerminalPlugin, entry: ClaudeSessionEntry): Promise<void> {
  const opts: CreateTabOpts = {
    name: `Claude ${entry.sessionId.slice(0, 8)}`,
    color: "",
    cwd: entry.cwd || getVaultBasePath(plugin),
    resumeCommand: `claude --resume ${entry.sessionId}`,
  };
  await openTabOrView(plugin, opts);
}

function relativeTime(ms: number): string {
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return sec <= 1 ? "just now" : `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.floor(hr / 24);
  return `${days}d ago`;
}
