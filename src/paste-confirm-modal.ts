import { App, Modal } from "obsidian";

/**
 * Asks before a multi-line paste reaches a shell that has not enabled bracketed
 * paste (cmd.exe never does): there every line would run as soon as it arrives.
 */
export class PasteConfirmModal extends Modal {
  constructor(app: App, private readonly text: string, private readonly onConfirm: () => void) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    this.setTitle("Paste multiple lines?");
    const shown = this.text.replace(/\r\n?/g, "\n");
    const lines = shown.replace(/\n$/, "").split("\n").length;
    contentEl.createEl("p", {
      text:
        `This terminal runs each line as soon as it is pasted (${lines} lines). ` +
        "Scroll through all of the text before you continue.",
    });
    // The whole text is shown, never a prefix: a long harmless start could hide the payload.
    contentEl.createEl("pre", { cls: "lean-paste-preview", text: shown });

    const buttons = contentEl.createDiv({ cls: "modal-button-container" });
    const paste = buttons.createEl("button", { text: "Paste", cls: "mod-warning" });
    paste.addEventListener("click", () => {
      this.close();
      this.onConfirm();
    });
    const cancel = buttons.createEl("button", { text: "Cancel", cls: "mod-cta" });
    cancel.addEventListener("click", () => this.close());
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
