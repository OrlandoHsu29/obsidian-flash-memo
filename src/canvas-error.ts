import { App, Modal, Setting } from 'obsidian';

export class CanvasError extends Modal {
  private confirmed = false;
  constructor(app: App, private t: (zh: string, en: string) => string,
    private message: string, private owner: Document | undefined,
    private finished: (confirmed: boolean) => void) {
    super(app);
    this.scope.register([], 'Enter', () => { this.confirm(); return false; });
  }
  private confirm() { this.confirmed = true; this.close(); }
  onOpen() {
    // Keep recovery usable when the main Obsidian window is minimized.
    if (this.owner && this.containerEl.ownerDocument !== this.owner) this.owner.body.append(this.containerEl);
    this.modalEl.classList.add('glimmer-memo-error');
    this.setTitle(this.t('Glimmer Memo 遇到错误', 'Glimmer Memo encountered an error'));
    this.contentEl.createEl('p', {text: this.message, cls: 'glimmer-memo-error-details'});
    this.contentEl.createEl('p', {text: this.t('确认后将关闭速记窗口。未保存的修改可能丢失，已保存的笔记和画板文件会保留；之后可再次呼出速记。', 'Confirm to close the quick memo window. Unsaved changes may be lost; saved notes and drawings will remain. You can open the memo again afterward.')});
    new Setting(this.contentEl).addButton(button => {
      button.setButtonText(this.t('确认并关闭', 'Confirm and close')).setCta().onClick(() => this.confirm());
      button.buttonEl.focus();
    });
  }
  onClose() { this.contentEl.empty(); this.finished(this.confirmed); }
}
