import { describe, it, expect, vi, beforeEach } from "vitest";
import { relativeTime, pushRecentSession } from "./recent-sessions";
import type { SavedTab, RecentSession } from "./session-state";
import type TerminalPlugin from "./main";

// ---------------------------------------------------------------------------
// relativeTime
// ---------------------------------------------------------------------------

describe("relativeTime", () => {
  it("returns 'just now' for <= 1 second", () => {
    expect(relativeTime(500)).toBe("just now");
    expect(relativeTime(1000)).toBe("just now");
  });

  it("returns seconds for < 60 seconds", () => {
    expect(relativeTime(30_000)).toBe("30s ago");
    expect(relativeTime(59_000)).toBe("59s ago");
  });

  it("returns minutes for < 60 minutes", () => {
    expect(relativeTime(90_000)).toBe("1m ago");
    expect(relativeTime(120_000)).toBe("2m ago");
  });

  it("returns hours for < 24 hours", () => {
    expect(relativeTime(90 * 60_000)).toBe("1h ago");
    expect(relativeTime(23 * 60 * 60_000)).toBe("23h ago");
  });

  it("returns days for >= 24 hours", () => {
    expect(relativeTime(48 * 60 * 60_000)).toBe("2d ago");
    expect(relativeTime(7 * 24 * 60 * 60_000)).toBe("7d ago");
  });
});

// ---------------------------------------------------------------------------
// pushRecentSession
// ---------------------------------------------------------------------------

const makeTab = (name: string): SavedTab => ({
  name,
  color: "",
  cwd: "/tmp",
});

const makePlugin = (maxSessions: number, existing: RecentSession[] = []) => ({
  settings: {
    recentSessions: [...existing],
    recentSessionsMax: maxSessions,
  },
  saveSettings: vi.fn().mockResolvedValue(undefined),
});

describe("pushRecentSession", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("adds entry at the front of recentSessions", async () => {
    const plugin = makePlugin(5);
    await pushRecentSession(plugin as unknown as TerminalPlugin, makeTab("Shell"));
    expect(plugin.settings.recentSessions).toHaveLength(1);
    expect(plugin.settings.recentSessions[0].name).toBe("Shell");
  });

  it("sets closedAt to a recent timestamp", async () => {
    const before = Date.now();
    const plugin = makePlugin(5);
    await pushRecentSession(plugin as unknown as TerminalPlugin, makeTab("T"));
    const after = Date.now();
    expect(plugin.settings.recentSessions[0].closedAt).toBeGreaterThanOrEqual(before);
    expect(plugin.settings.recentSessions[0].closedAt).toBeLessThanOrEqual(after);
  });

  it("prepends to existing entries (most recent first)", async () => {
    const existing: RecentSession[] = [
      { name: "Old", color: "", cwd: "/", closedAt: 1000 },
    ];
    const plugin = makePlugin(5, existing);
    await pushRecentSession(plugin as unknown as TerminalPlugin, makeTab("New"));
    expect(plugin.settings.recentSessions[0].name).toBe("New");
    expect(plugin.settings.recentSessions[1].name).toBe("Old");
  });

  it("trims list to recentSessionsMax via splice", async () => {
    const plugin = makePlugin(2);
    await pushRecentSession(plugin as unknown as TerminalPlugin, makeTab("A"));
    await pushRecentSession(plugin as unknown as TerminalPlugin, makeTab("B"));
    await pushRecentSession(plugin as unknown as TerminalPlugin, makeTab("C"));
    expect(plugin.settings.recentSessions).toHaveLength(2);
    expect(plugin.settings.recentSessions[0].name).toBe("C");
    expect(plugin.settings.recentSessions[1].name).toBe("B");
  });

  it("skips entirely when recentSessionsMax is 0", async () => {
    const plugin = makePlugin(0);
    await pushRecentSession(plugin as unknown as TerminalPlugin, makeTab("X"));
    expect(plugin.settings.recentSessions).toHaveLength(0);
    expect(plugin.saveSettings).not.toHaveBeenCalled();
  });

  it("calls saveSettings exactly once per push", async () => {
    const plugin = makePlugin(5);
    await pushRecentSession(plugin as unknown as TerminalPlugin, makeTab("Y"));
    expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
  });
});
