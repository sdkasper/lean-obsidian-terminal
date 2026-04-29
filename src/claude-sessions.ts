import { Notice, TFile, FileSystemAdapter } from "obsidian";
import type TerminalPlugin from "./main";
import { openTabOrView } from "./terminal-opener";

export interface ClaudeSessionEntry {
  sessionId: string;
  cwd: string;
  firstPrompt: string;
  summary: string;
  modified: string; // ISO 8601
  messageCount: number;
  gitBranch: string;
}

interface SessionsIndexEntry {
  sessionId: string;
  firstPrompt?: string;
  summary?: string;
  modified?: string;
  messageCount?: number;
  gitBranch?: string;
}

/**
 * Encode a filesystem path the way Claude Code does for its project directories.
 * Any character outside [A-Za-z0-9-] becomes a hyphen.
 * E.g. "C:\\_fg2" -> "C---fg2", "/home/user" -> "-home-user".
 */
export function encodeProjectDir(cwd: string): string {
  return cwd.replace(/[^a-zA-Z0-9-]/g, "-");
}

/**
 * Scan ~/.claude/projects/<encoded>/ for session JSONL files.
 * Cross-references sessions-index.json for AI-generated summaries.
 * Returns entries sorted by modified desc, capped at `max`.
 */
export async function scanClaudeProjectSessions(
  cwd: string,
  max: number
): Promise<ClaudeSessionEntry[]> {
  const path = window.require("path") as typeof import("path");
  const os = window.require("os") as typeof import("os");
  const fs = (window.require("fs") as typeof import("fs")).promises;

  const encoded = encodeProjectDir(cwd);
  const projectDir = path.join(os.homedir(), ".claude", "projects", encoded);

  let files: string[];
  try {
    files = (await fs.readdir(projectDir)).filter((f) => f.endsWith(".jsonl"));
  } catch {
    return []; // no project directory for this vault
  }

  const indexMap = await readSessionsIndex(projectDir);

  const entries: ClaudeSessionEntry[] = [];
  for (const file of files) {
    const fullPath = path.join(projectDir, file);
    const sessionId = file.replace(/\.jsonl$/, "");
    const indexed = indexMap.get(sessionId);

    let firstPrompt = indexed?.firstPrompt ?? "";
    let modified = indexed?.modified ?? "";
    const messageCount = indexed?.messageCount ?? 0;
    const gitBranch = indexed?.gitBranch ?? "";
    const summary = indexed?.summary ?? "";

    // Fill gaps from the JSONL itself (the sessions-index.json can lag)
    if (!firstPrompt || !modified) {
      try {
        if (!modified) {
          const stat = await fs.stat(fullPath);
          modified = stat.mtime.toISOString();
        }
        if (!firstPrompt) {
          firstPrompt = await readFirstUserPrompt(fullPath);
        }
      } catch {
        continue; // skip unreadable files
      }
    }

    entries.push({
      sessionId,
      cwd,
      firstPrompt: cleanPrompt(firstPrompt),
      summary: cleanPrompt(summary),
      modified,
      messageCount,
      gitBranch,
    });
  }

  entries.sort((a, b) => Date.parse(b.modified) - Date.parse(a.modified));
  return entries.slice(0, max);
}

async function readSessionsIndex(projectDir: string): Promise<Map<string, SessionsIndexEntry>> {
  const path = window.require("path") as typeof import("path");
  const fs = (window.require("fs") as typeof import("fs")).promises;
  const map = new Map<string, SessionsIndexEntry>();

  try {
    const indexPath = path.join(projectDir, "sessions-index.json");
    const content = await fs.readFile(indexPath, "utf-8");
    const data = JSON.parse(content) as { entries?: SessionsIndexEntry[] };
    if (Array.isArray(data.entries)) {
      for (const e of data.entries) {
        if (e.sessionId) map.set(e.sessionId, e);
      }
    }
  } catch {
    // missing or malformed index — scanner falls back to JSONL stats
  }
  return map;
}

/** Read the first user (non-meta) message in a JSONL session file, truncated. */
export async function readFirstUserPrompt(filePath: string): Promise<string> {
  const fs = (window.require("fs") as typeof import("fs")).promises;
  try {
    const content = await fs.readFile(filePath, "utf-8");
    const lines = content.split("\n");
    for (const line of lines) {
      if (!line.trim()) continue;
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(line) as Record<string, unknown>;
      } catch {
        continue;
      }
      if (msg.type !== "user" || msg.isMeta) continue;
      const message = msg.message as { content?: unknown } | undefined;
      const msgContent = message?.content;
      if (typeof msgContent === "string") return truncate(msgContent);
      if (Array.isArray(msgContent)) {
        for (const block of msgContent) {
          if (
            block && typeof block === "object" &&
            (block as { type?: unknown }).type === "text" &&
            typeof (block as { text?: unknown }).text === "string"
          ) {
            return truncate((block as { text: string }).text);
          }
        }
      }
    }
  } catch {
    // IO error — return empty string
  }
  return "";
}

/**
 * Clean a prompt string that may contain Claude Code slash-command markup
 * (e.g. "<command-name>/model</command-name> <command-message>model</command-message>...").
 * Extracts the command name if present; otherwise strips any stray HTML-like tags.
 */
function cleanPrompt(raw: string): string {
  if (!raw) return "";
  const cmdMatch = raw.match(/<command-name>([^<]+)<\/command-name>/);
  if (cmdMatch) return cmdMatch[1].trim();
  return raw.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

function truncate(s: string, max = 100): string {
  const oneline = cleanPrompt(s);
  return oneline.length > max ? oneline.slice(0, max - 1) + "\u2026" : oneline;
}

/**
 * Refresh the Claude session registry note.
 * Writes a markdown table at the configured path; creates the file if missing.
 */
export async function refreshClaudeRegistry(plugin: TerminalPlugin): Promise<void> {
  if (!plugin.settings.enableClaudeIntegration) {
    new Notice("Enable Claude code integration in settings first.");
    return;
  }

  const cwd = getVaultBasePath(plugin);
  if (!cwd) {
    new Notice("Could not determine vault path.");
    return;
  }

  const entries = await scanClaudeProjectSessions(cwd, plugin.settings.claudeSessionsMax);
  const markdown = generateRegistryMarkdown(entries);

  try {
    const abstract = plugin.app.vault.getAbstractFileByPath(plugin.settings.claudeRegistryPath);
    if (abstract instanceof TFile) {
      await plugin.app.vault.modify(abstract, markdown);
    } else {
      await plugin.app.vault.create(plugin.settings.claudeRegistryPath, markdown);
    }
    new Notice(`Claude registry: ${entries.length} session${entries.length === 1 ? "" : "s"}.`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    new Notice(`Failed to write registry: ${msg}`);
  }
}

function generateRegistryMarkdown(entries: ClaudeSessionEntry[]): string {
  const header = [
    "# Claude Sessions",
    "",
    `*Auto-maintained by Lean Terminal - last refreshed ${new Date().toISOString()}. Click a Resume link to reopen that Claude Code conversation in a new terminal tab.*`,
    "",
    "",
  ].join("\n");

  if (entries.length === 0) {
    return header + "*No Claude sessions found for this vault.*\n";
  }

  const rows = entries.map((e) => {
    const title = e.summary || e.firstPrompt || `(session ${e.sessionId.slice(0, 8)})`;
    const branch = e.gitBranch || "-";
    const modified = e.modified ? e.modified.slice(0, 10) : "-";
    const msgs = e.messageCount > 0 ? String(e.messageCount) : "-";
    const resumeUri = `obsidian://lean-terminal?resume=${e.sessionId}`;
    return `| ${escapeTableCell(title)} | ${branch} | ${msgs} | ${modified} | [Resume](${resumeUri}) |`;
  });

  return header + [
    "| Session | Branch | Messages | Modified | |",
    "|---------|--------|----------|----------|--|",
    ...rows,
    "",
  ].join("\n");
}

function escapeTableCell(s: string): string {
  return s.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

/**
 * Open a terminal tab that runs `claude --resume <sessionId>` on shell spawn.
 * Called from the obsidian://lean-terminal?resume=... protocol handler.
 */
export async function resumeClaudeSession(
  plugin: TerminalPlugin,
  sessionId: string
): Promise<void> {
  if (!plugin.settings.enableClaudeIntegration) {
    new Notice("Claude integration is disabled in settings.");
    return;
  }

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sessionId)) {
    new Notice("Invalid Claude session ID.");
    return;
  }

  await openTabOrView(plugin, {
    name: `Claude ${sessionId.slice(0, 8)}`,
    color: "",
    cwd: getVaultBasePath(plugin),
    resumeCommand: `claude --resume ${sessionId}`,
  });
}

export function getVaultBasePath(plugin: TerminalPlugin): string {
  const adapter = plugin.app.vault.adapter;
  if (adapter instanceof FileSystemAdapter) return adapter.getBasePath();
  return "";
}
