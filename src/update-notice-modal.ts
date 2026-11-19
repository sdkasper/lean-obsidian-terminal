import { App, Modal } from "obsidian";
import { SUPPORT_URL } from "./update-notice";

/** Short what's-new lines for the current minor release. Edit per release. */
export const WHATS_NEW: string[] = [
  "Pasting several lines into a shell that runs each line (cmd, PowerShell) now shows the full text and asks first. Hidden characters are removed from pasted text.",
  "Files you drop into the terminal, or insert with [[, are quoted correctly for your shell.",
  "Clicking a path in the output opens documents and media only. Programs and scripts are revealed in your file manager instead of being run.",
  "A restored terminal now ends with a restored output, new session line, so old output no longer looks like a live program.",
  "A failed binary download no longer leaves the terminal without working binaries.",
];

export class UpdateNoticeModal extends Modal {
  constructor(app: App, private readonly version: string) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    this.setTitle(`Lean Terminal updated to v${this.version}`);

    contentEl.createEl("p", { text: "What's new:" });
    const list = contentEl.createEl("ul");
    for (const line of WHATS_NEW) list.createEl("li", { text: line });

    contentEl.createEl("p", {
      text:
        "Lean Terminal is free and built in my spare time. If it makes your " +
        "day easier, a small tip helps me keep improving it. Thank you!",
    });

    const buttons = contentEl.createDiv({ cls: "modal-button-container" });
    const support = buttons.createEl("button", { text: "Support development", cls: "mod-cta" });
    support.addEventListener("click", () => {
      window.open(SUPPORT_URL, "_blank", "noopener");
      this.close();
    });
    const later = buttons.createEl("button", { text: "Maybe later" });
    later.addEventListener("click", () => this.close());
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
