import { App, Modal, Scope, Setting, ButtonComponent } from 'obsidian';
import { hotkeyFromEvent } from './global-hotkey';

export class HotkeyRecorder extends Modal {
  private active = false;
  private ready = false;
  private saving = false;
  private candidate = '';
  private preview!: HTMLElement;
  private hint!: HTMLElement;
  private saveButton!: ButtonComponent;
  private owner: Window | null = null;
  private readonly lostFocus = () => this.close();

  constructor(app: App, private t: (zh:string,en:string)=>string,
    private suspend: ()=>Promise<void>, private save: (value:string)=>Promise<boolean>, private finished: ()=>void) {
    super(app);
    // An isolated scope prevents recording from falling through to editor commands.
    this.scope = new Scope();
    this.scope.register(null, null, event => {
      if (event.key === 'Escape' && !event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey) { this.close(); return false; }
      if (!this.ready || this.saving || event.repeat) return false;
      if (event.key === 'Tab' && !event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey) return;
      if (event.key === 'Enter' && this.candidate && !event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey) { void this.commit(); return false; }
      try {
        const hotkey = hotkeyFromEvent(event);
        if (hotkey) { this.candidate = hotkey.label; this.preview.setText(hotkey.label); this.hint.setText(''); this.saveButton.setDisabled(false); }
      } catch {
        this.candidate = ''; this.saveButton.setDisabled(true);
        this.preview.setText(this.t('请重新按下组合键', 'Press another combination'));
        this.hint.setText(this.t('请包含 Ctrl、Alt 或 Win；不支持 F12。', 'Include Ctrl, Alt or Win. F12 is not supported.'));
      }
      return false;
    });
  }

  async onOpen() {
    this.active = true;
    this.setTitle(this.t('修改全局快捷键', 'Change global shortcut'));
    this.contentEl.createEl('p', {text:this.t('直接按下组合键，然后保存。按 Esc 或点击其他位置取消。', 'Press a key combination, then save. Press Esc or click outside to cancel.')});
    this.preview = this.contentEl.createEl('kbd', {cls:'flash-memo-key-preview',text:this.t('准备中…', 'Preparing…')});
    this.hint = this.contentEl.createDiv({cls:'setting-item-description'});
    new Setting(this.contentEl)
      .addButton(button => button.setButtonText(this.t('取消','Cancel')).onClick(()=>this.close()))
      .addButton(button => { this.saveButton=button; button.setButtonText(this.t('保存','Save')).setCta().setDisabled(true).onClick(()=>{void this.commit();}); });
    this.owner = this.containerEl.ownerDocument.defaultView;
    this.owner?.addEventListener('blur',this.lostFocus);
    this.owner?.addEventListener('pagehide',this.lostFocus);
    try {
      await this.suspend();
      if (!this.active) return;
      this.ready = true; this.preview.setText(this.t('等待按键…', 'Waiting for keys…'));
    } catch {
      if (this.active) this.hint.setText(this.t('暂时无法修改快捷键，请取消后重试。', 'Could not change the shortcut. Cancel and try again.'));
    }
  }

  private async commit() {
    if (!this.active || !this.candidate || this.saving) return;
    this.saving = true; this.saveButton.setDisabled(true);
    try { if (await this.save(this.candidate)) this.close(); }
    catch (error) { if (this.active) this.hint.setText(error instanceof Error ? error.message : String(error)); }
    finally { this.saving = false; if (this.active) this.saveButton.setDisabled(!this.candidate); }
  }

  onClose() {
    this.active = false; this.ready = false;
    this.owner?.removeEventListener('blur', this.lostFocus);
    this.owner?.removeEventListener('pagehide', this.lostFocus); this.owner = null;
    this.contentEl.empty(); this.finished();
  }
}
