import type TerminalPlugin from "./main";
import type { CreateTabOpts } from "./terminal-tab-manager";
import type { TerminalView } from "./terminal-view";
import { VIEW_TYPE_TERMINAL } from "./constants";

/**
 * Open a tab in the existing terminal view, or open a fresh view and replace
 * its default tab with our opts. We can't round-trip opts through setViewState's
 * state field because CreateTabOpts fields like `runResumeCommand` aren't part
 * of SavedTab — they're transient creation hints. Destroy-and-recreate
 * preserves them; the default tab has no user activity yet, so saveToRecents=false.
 */
export async function openTabOrView(plugin: TerminalPlugin, opts: CreateTabOpts): Promise<void> {
  const existingLeaves = plugin.app.workspace.getLeavesOfType(VIEW_TYPE_TERMINAL);
  if (existingLeaves.length > 0) {
    const view = existingLeaves[0].view as TerminalView;
    const manager = view.getTabManager();
    if (manager) {
      manager.createTab(opts);
      void plugin.app.workspace.revealLeaf(existingLeaves[0]);
      return;
    }
  }

  const leaf =
    plugin.settings.defaultLocation === "right"
      ? plugin.app.workspace.getRightLeaf(false)
      : plugin.app.workspace.getLeaf("split", "horizontal");
  if (!leaf) return;

  await leaf.setViewState({ type: VIEW_TYPE_TERMINAL, active: true });
  void plugin.app.workspace.revealLeaf(leaf);

  const view = leaf.view as TerminalView;
  const manager = view.getTabManager();
  if (!manager) return;

  // onOpen just created a default tab (no saved state came in via setViewState);
  // replace it with our configured tab.
  manager.destroyAll(false);
  manager.createTab(opts);
}
