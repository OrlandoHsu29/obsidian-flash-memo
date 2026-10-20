import {
  App, FileSystemAdapter, Notice, Plugin, PluginSettingTab, Setting, TFile,
  WorkspaceLeaf, WorkspaceWindow, setIcon,
} from 'obsidian';
// Desktop timers keep initialization and cleanup responsive when the main
// renderer is background-throttled.
import { setTimeout, clearTimeout } from 'node:timers';
import { join } from 'node:path';
import { GlobalHotkey, HotkeyStatus } from './global-hotkey';
import { HotkeyRecorder } from './hotkey-recorder';
import { ArchiveConfirm } from './archive-confirm';
import { archiveDrawing, availableDrawingPath, drawingFolder, ensureDrawingFolder } from './drawing-files';
import { drawingName, renamedDrawingPath } from './drawing-name';

interface Bounds { x: number; y: number; width: number; height: number }
// Obsidian exposes this on desktop popouts, but it is outside the public API.
interface DesktopWindow {
  isDestroyed(): boolean;
  show(): void;
  hide(): void;
  getOpacity?(): number;
  setOpacity?(opacity: number): void;
  focus(): void;
  isFocused(): boolean;
  setAlwaysOnTop(value: boolean): void;
  getBounds(): Bounds;
  setBounds(value: Bounds): void;
  on(event: string, listener: () => void): void;
  off(event: string, listener: () => void): void;
  getNativeWindowHandle?(): Buffer;
  webContents?: {
    getBackgroundThrottling(): boolean;
    setBackgroundThrottling(value: boolean): void;
  };
}
interface DrawingView {
  file?: TFile;
  forceSave?: () => Promise<unknown>;
  excalidrawAPI?: { getAppState(): { editingTextElement?: unknown; openDialog?: unknown; openMenu?: unknown } };
}
interface DrawingPlugin {
  getBlankDrawing(): Promise<string>;
  settings?: { compatibilityMode?: boolean };
}
interface MemoSettings {
  folder: string;
  file: string;
  leafId: string;
  pinned: boolean;
  hideOnBlur: boolean;
  bounds: Bounds | null;
  globalHotkeyEnabled: boolean;
  globalHotkey: string;
}
const DEFAULTS: MemoSettings = { folder: 'Flash Memo', file: '', leafId: '', pinned: false, hideOnBlur: true, bounds: null, globalHotkeyEnabled: process.platform === 'win32' && process.arch === 'x64', globalHotkey: 'Ctrl+Alt+Y' };

export default class FlashMemo extends Plugin {
  settings: MemoSettings = { ...DEFAULTS };
  private leaf: WorkspaceLeaf | null = null;
  private popout: WorkspaceWindow | null = null;
  private native: DesktopWindow | null = null;
  private hidden = false;
  private hiddenOpacity: number | null = null;
  private opening = false;
  private disposed = false;
  private hideGeneration = 0;
  private hiding = false;
  private blurTimer: ReturnType<typeof setTimeout> | null = null;
  private boundsTimer: ReturnType<typeof setTimeout> | null = null;
  private detach: (() => void) | null = null;
  private pinButton: HTMLButtonElement | null = null;
  private wakeContents: DesktopWindow['webContents'] | null = null;
  private previousThrottling: boolean | null = null;
  private lastTrigger = 0;
  private settingTab: MemoSettingTab | null = null;
  private recorder: HotkeyRecorder | null = null;
  private recording = false;
  private archiving = false;
  private archiveDialog: ArchiveConfirm | null = null;
  private archiveButton: HTMLButtonElement | null = null;
  private nameButton: HTMLButtonElement | null = null;
  private renaming = false;
  private globalHotkey = new GlobalHotkey(() => this.triggerToggle(), () => this.settingTab?.updateStatus());

  t(zh: string, en: string): string {
    return (window.localStorage.getItem('language') ?? navigator.language).toLowerCase().startsWith('zh') ? zh : en;
  }

  async onload() {
    this.settings = { ...DEFAULTS, ...await this.loadData() };
    this.addCommand({
      id: 'toggle', name: this.t('显示/隐藏速记画板', 'Show/hide quick canvas'),
      hotkeys: [{ modifiers: ['Mod', 'Shift'], key: 'y' }],
      callback: () => this.triggerToggle(),
    });
    this.addCommand({
      id: 'pin', name: this.t('固定/取消固定速记窗口', 'Pin/unpin quick canvas'),
      checkCallback: checking => {
        if (!this.alive() || this.hidden) return false;
        if (!checking) this.togglePin();
        return true;
      },
    });
    this.addRibbonIcon('pencil-ruler', this.t('速记画板', 'Quick canvas'), () => {
      this.triggerToggle();
    });
    this.registerObsidianProtocolHandler('flash-memo', params => {
      if (params.vault && params.vault !== this.app.vault.getName()) return;
      this.triggerToggle();
    });
    this.settingTab = new MemoSettingTab(this.app, this);
    this.addSettingTab(this.settingTab);
    this.registerEvent(this.app.vault.on('rename', (file, oldPath) => {
      if (oldPath !== this.settings.file) return;
      this.settings.file = file.path;
      this.updateName();
      if (!this.archiving) void this.saveData(this.settings);
    }));
    this.registerEvent(this.app.workspace.on('window-close', win => {
      if (win !== this.popout) return;
      this.reset();
      this.settings.leafId = '';
      void this.saveData(this.settings);
    }));
    this.app.workspace.onLayoutReady(() => {
      if (this.disposed) return;
      void this.configureGlobalHotkey().then(success => {
        if (!success && this.settings.globalHotkeyEnabled && !this.disposed) new Notice(this.hotkeyDescription());
      }).catch(error => this.report(error));
      if (!this.settings.leafId) return;
      let restored: WorkspaceLeaf | null = null;
      this.app.workspace.iterateAllLeaves(leaf => {
        if ((leaf as WorkspaceLeaf & { id: string }).id === this.settings.leafId) restored = leaf;
      });
      if (restored) void this.attach(restored).then(() => {
        if (!this.settings.pinned) return this.hide('escape');
      }).catch(error => this.report(error));
    });
  }

  private triggerToggle() {
    // One physical keypress can reach both a global registration and a local
    // Obsidian binding if the user assigns them the same combination.
    const now = Date.now();
    if (this.disposed || now - this.lastTrigger < 250) return;
    this.lastTrigger = now;
    void this.toggle().catch(error => this.report(error));
  }

  async configureGlobalHotkey(candidate?: string): Promise<boolean> {
    const adapter = this.app.vault.adapter;
    if (!(adapter instanceof FileSystemAdapter) || !this.manifest.dir || this.disposed) return false;
    const handle = (window as Window & { electronWindow?: DesktopWindow }).electronWindow?.getNativeWindowHandle?.();
    const owner = handle && handle.length >= 8 ? handle.readBigUInt64LE().toString() : '0';
    const executable = join(adapter.getBasePath(), this.manifest.dir, 'flash-memo-hotkey.exe');
    return this.globalHotkey.configure(this.settings.globalHotkeyEnabled && (!this.recording || candidate !== undefined), candidate ?? this.settings.globalHotkey, executable, owner);
  }

  recordGlobalHotkey() {
    if (this.recorder || this.disposed) return;
    this.recording = true;
    const modal = new HotkeyRecorder(this.app, (zh,en)=>this.t(zh,en), async()=>{ await this.configureGlobalHotkey(); }, async candidate=>{
      const success = await this.configureGlobalHotkey(candidate);
      if (this.recorder !== modal || this.disposed) return false;
      if (!success) throw Error(this.hotkeyDescription());
      this.settings.globalHotkey = candidate;
      this.recording = false;
      await this.saveData(this.settings);
      return true;
    }, ()=>{
      this.recorder = null;
      const resume = this.recording;
      this.recording = false;
      if (resume && !this.disposed) void this.configureGlobalHotkey().catch(error=>this.report(error));
      if (!this.disposed) this.settingTab?.display();
    });
    this.recorder = modal; modal.open();
  }

  hotkeyProblem(): string {
    return ['conflict','invalid','missing','failed','unsupported'].includes(this.globalHotkey.status) ? this.hotkeyDescription() : '';
  }

  cancelHotkeyRecording() { this.recorder?.close(); }

  hotkeyDescription(): string {
    const messages: Record<HotkeyStatus, [string,string]> = {
      off: ['已关闭；仅使用 Obsidian 内快捷键。','Disabled; the in-app shortcut remains available.'],
      starting: ['正在注册全局快捷键…','Registering global shortcut…'],
      ready: [`已启用 ${this.settings.globalHotkey}，在其他软件或 Obsidian 最小化时也可呼出。`,`Active: ${this.settings.globalHotkey}. Works from other apps and while Obsidian is minimized.`],
      conflict: ['快捷键已被其他程序或笔记库占用，请更换组合。','Shortcut is already registered by another application or vault. Choose a different combination.'],
      invalid: ['快捷键格式无效，例如 Ctrl+Alt+Y；不支持单独按键、仅 Shift 修饰或 F12。','Invalid shortcut. Example: Ctrl+Alt+Y. Bare keys, Shift-only combinations and F12 are not supported.'],
      missing: ['缺少快捷键辅助程序，请重新安装完整安装包。','Hotkey helper is missing. Reinstall the complete plugin package.'],
      failed: ['无法注册全局快捷键；可重新开关或更换组合。','Global shortcut could not be registered. Toggle it off/on or choose another combination.'],
      unsupported: ['内置全局快捷键目前仅支持 Windows x64。','Built-in global shortcuts currently require Windows x64.'],
    };
    return this.t(...messages[this.globalHotkey.status]);
  }

  private drawingPlugin(): DrawingPlugin {
    const registry = (this.app as App & { plugins: { plugins: Record<string, unknown> } }).plugins.plugins;
    const plugin = registry['obsidian-excalidraw-plugin'] as DrawingPlugin | undefined;
    if (!plugin?.getBlankDrawing) throw Error(this.t('请先安装并启用 Excalidraw 插件。', 'Please install and enable the Excalidraw plugin first.'));
    return plugin;
  }

  private async ensureDrawing(): Promise<TFile> {
    const plugin = this.drawingPlugin();
    const existing = this.settings.file && this.app.vault.getFileByPath(this.settings.file);
    if (existing) return existing;
    const folder = await ensureDrawingFolder(this.app, this.settings.folder);
    const content = await plugin.getBlankDrawing();
    const extension = plugin.settings?.compatibilityMode ? '.excalidraw' : '.excalidraw.md';
    const path = availableDrawingPath(this.app, folder, 'Quick sketch', extension, undefined, true);
    const file = await this.app.vault.create(path, content);
    this.settings.file = file.path;
    await this.saveData(this.settings);
    return file;
  }

  async toggle() {
    if (this.disposed || this.opening || this.archiving || this.renaming) return;
    if (this.alive()) {
      if (this.hidden || this.hiding) this.show();
      else await this.hide('escape');
      return;
    }
    this.reset();
    this.opening = true;
    this.keepRendererAwake();
    let created: WorkspaceLeaf | null = null;
    try {
      const file = await this.ensureDrawing();
      if (this.disposed) return;
      created = this.app.workspace.getLeaf('window');
      await created.setViewState({ type: 'excalidraw', state: { file: file.path }, active: true });
      await this.attach(created);
      if (this.disposed) return;
      this.settings.leafId = (created as WorkspaceLeaf & { id: string }).id;
      await this.saveData(this.settings);
      this.show();
    } catch (error) {
      this.reset();
      created?.detach();
      throw error;
    } finally {
      this.opening = false;
      if (!this.alive()) this.restoreThrottling();
    }
  }

  private alive(): boolean {
    return !!this.leaf && !!this.native && !this.native.isDestroyed();
  }

  private async attach(leaf: WorkspaceLeaf) {
    const container = leaf.getContainer();
    if (!(container instanceof WorkspaceWindow)) throw Error('Flash Memo: a desktop popout window is required.');
    // Creating a popout and initializing its renderer are asynchronous.
    let native: DesktopWindow | undefined;
    for (let i = 0; i < 60 && !this.disposed; i++) {
      native = (container.win as Window & { electronWindow?: DesktopWindow }).electronWindow;
      if (native) break;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    if (this.disposed) { leaf.detach(); return; }
    if (!native || native.isDestroyed()) throw Error(this.t('无法初始化速记窗口。', 'Could not initialize the quick canvas window.'));
    this.leaf = leaf;
    this.popout = container;
    this.native = native;
    this.keepRendererAwake();
    const doc = container.doc;
    doc.body.classList.add('flash-memo-window');
    native.setAlwaysOnTop(this.settings.pinned);
    const bounds = this.settings.bounds;
    if (bounds && Object.values(bounds).every(Number.isFinite)) {
      const screen = container.win.screen;
      // Bring a remembered window back onto the current monitor after a display change.
      const width = Math.max(440, Math.min(bounds.width, screen.availWidth));
      const height = Math.max(360, Math.min(bounds.height, screen.availHeight));
      const area = screen as Screen & { availLeft?: number; availTop?: number };
      const left = area.availLeft ?? 0, top = area.availTop ?? 0;
      native.setBounds({width,height,x:Math.max(left,Math.min(bounds.x,left+screen.availWidth-width)),y:Math.max(top,Math.min(bounds.y,top+screen.availHeight-height))});
    } else {
      const current = native.getBounds();
      native.setBounds({...current,width:760,height:600});
    }
    const bar = doc.createElement('div');
    bar.className = 'flash-memo-bar';
    const title = bar.createSpan({text: 'Flash memo', cls: 'flash-memo-title'});
    title.setAttribute('aria-hidden', 'true');
    const nameContainer = bar.createDiv({cls: 'flash-memo-name-container'});
    this.nameButton = nameContainer.createEl('button', {cls: 'flash-memo-name'});
    this.nameButton.setAttribute('aria-label', this.t('修改画板文件名', 'Rename canvas file'));
    const nameInput = nameContainer.createEl('input', {cls: 'flash-memo-name-input', type: 'text'});
    nameInput.hidden = true;
    nameInput.setAttribute('aria-label', this.t('文件名（不含扩展名）', 'File name (without extension)'));
    const finishEdit = () => { nameInput.hidden = true; if (this.nameButton) this.nameButton.hidden = false; };
    const onRename = () => {
      if (this.archiving || this.renaming) return;
      nameInput.value = drawingName(this.settings.file).name;
      this.nameButton!.hidden = true; nameInput.hidden = false;
      nameInput.focus(); nameInput.select();
    };
    const onNameBlur = () => {
      if (nameInput.hidden) return;
      const value = nameInput.value;
      finishEdit(); void this.renameDrawing(value);
    };
    const onNameKey = (event: KeyboardEvent) => {
      if (event.key !== 'Enter' && event.key !== 'Escape') return;
      event.preventDefault(); event.stopPropagation();
      if (event.key === 'Enter') onNameBlur(); else finishEdit();
      this.nameButton?.focus();
    };
    this.nameButton.addEventListener('click', onRename);
    nameInput.addEventListener('blur', onNameBlur);
    nameInput.addEventListener('keydown', onNameKey);
    this.updateName();
    const actions = bar.createDiv({cls: 'flash-memo-actions'});
    this.archiveButton = actions.createEl('button', {cls:'clickable-icon flash-memo-archive'});
    setIcon(this.archiveButton, 'archive');
    const archiveLabel = this.t('归档并新建画板', 'Archive and create canvas');
    this.archiveButton.setAttribute('aria-label',archiveLabel);
    const onArchive = () => this.confirmArchive();
    this.archiveButton.addEventListener('click',onArchive);
    this.pinButton = actions.createEl('button', {cls: 'clickable-icon flash-memo-pin'});
    const onPin = () => this.togglePin();
    this.pinButton.addEventListener('click', onPin);
    const closeButton = actions.createEl('button', {cls: 'clickable-icon flash-memo-close'});
    setIcon(closeButton, 'x');
    closeButton.setAttribute('aria-label', this.t('关闭', 'Close'));
    const onClose = () => { void this.hide('close'); };
    closeButton.addEventListener('click', onClose);
    doc.body.append(bar);
    this.updatePin();
    const onBlur = () => {
      this.clearBlur();
      if (!this.settings.hideOnBlur || this.settings.pinned || this.hidden) return;
      this.blurTimer = setTimeout(() => {
        this.blurTimer = null;
        if (!native!.isDestroyed() && !native!.isFocused()) void this.hide('blur');
      }, 0);
    };
    const onFocus = () => { this.clearBlur(); this.hideGeneration++; this.hiding = false; };
    const onBounds = () => {
      if (this.boundsTimer) clearTimeout(this.boundsTimer);
      this.boundsTimer = setTimeout(() => {
        this.boundsTimer = null;
        if (!this.alive() || this.hidden) return;
        this.settings.bounds = native!.getBounds();
        void this.saveData(this.settings);
      }, 300);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      if (doc.querySelector('.modal-container, .menu, .suggestion-container, .excalidraw .popover')) return;
      const state = (this.leaf?.view as DrawingView | undefined)?.excalidrawAPI?.getAppState();
      if (state?.editingTextElement || state?.openDialog || state?.openMenu) return;
      event.preventDefault();
      void this.hide('escape');
    };
    native.on('blur', onBlur); native.on('focus', onFocus);
    native.on('resize', onBounds); native.on('moved', onBounds);
    doc.addEventListener('keydown', onKey);
    this.detach = () => {
      native!.off('blur', onBlur); native!.off('focus', onFocus);
      native!.off('resize', onBounds); native!.off('moved', onBounds);
      doc.removeEventListener('keydown', onKey);
      this.pinButton?.removeEventListener('click', onPin);
      closeButton.removeEventListener('click', onClose);
      this.nameButton?.removeEventListener('click', onRename); this.nameButton = null;
      nameInput.removeEventListener('blur', onNameBlur);
      nameInput.removeEventListener('keydown', onNameKey);
      this.archiveButton?.removeEventListener('click',onArchive); this.archiveButton = null;
      bar.remove(); doc.body.classList.remove('flash-memo-window');
    };
  }

  private show() {
    if (!this.alive()) return;
    this.hideGeneration++; this.hiding = false; this.clearBlur();
    this.hidden = false;
    this.keepRendererAwake();
    this.restoreWindowOpacity();
    this.native!.show();
    this.native!.focus();
  }

  private async hide(reason: 'blur' | 'escape' | 'close') {
    if (!this.alive() || this.hidden || this.archiving || this.renaming || (reason === 'blur' && (!this.settings.hideOnBlur || this.settings.pinned))) return;
    const generation = ++this.hideGeneration;
    this.hiding = true;
    try {
      const view = this.leaf!.view as DrawingView;
      if (!view.forceSave) throw Error(this.t('当前 Excalidraw 版本不支持保存接口，请更新插件。', 'Please update Excalidraw: its save interface is unavailable.'));
      await view.forceSave();
      if (generation !== this.hideGeneration || !this.alive()) return;
      if (reason === 'blur' && (!this.settings.hideOnBlur || this.settings.pinned || this.native!.isFocused())) return;
      // Make the saved canvas disappear before Windows animates the native hide.
      if (reason === 'blur' && process.platform === 'win32' && this.native!.setOpacity) {
        const opacity = this.native!.getOpacity?.() ?? 1;
        this.native!.setOpacity(0);
        this.hiddenOpacity = opacity;
      }
      this.hidden = true;
      this.native!.hide();
      this.restoreThrottling();
    } catch (error) { this.restoreWindowOpacity(); this.report(error); }
    finally { if (generation === this.hideGeneration) this.hiding = false; }
  }

  private confirmArchive() {
    if (!this.alive() || this.disposed || this.archiving || this.renaming || this.archiveDialog) return;
    try {
      const folder = drawingFolder(this.settings.folder);
      if (!folder) throw Error('invalid-folder');
      this.archiveDialog = new ArchiveConfirm(this.app,(zh,en)=>this.t(zh,en),folder,
        ()=>this.archiveCurrentDrawing(),()=>{this.archiveDialog=null;});
      this.archiveDialog.open();
    } catch(error) { this.report(error); }
  }

  private async archiveCurrentDrawing() {
    if (!this.alive() || this.disposed || this.archiving || this.renaming) return;
    const leaf = this.leaf!, view = leaf.view as DrawingView, current = view.file;
    if (!current || !view.forceSave) { this.report(Error(this.t('当前画板暂时无法保存，请稍后重试。','The current canvas cannot be saved yet. Try again shortly.'))); return; }
    this.archiving = true; this.archiveButton!.disabled = true;
    this.hideGeneration++; this.hiding = false; this.clearBlur(); this.keepRendererAwake();
    let result: Awaited<ReturnType<typeof archiveDrawing>> | undefined;
    try {
      await view.forceSave();
      if (this.disposed || !this.alive() || this.leaf !== leaf || leaf.view !== view) return;
      const plugin = this.drawingPlugin();
      const blank = await plugin.getBlankDrawing();
      if (this.disposed || !this.alive() || this.leaf !== leaf || leaf.view !== view) return;
      result = await archiveDrawing(this.app,current,this.settings.folder,blank,new Date(),plugin.settings?.compatibilityMode?'.excalidraw':'.excalidraw.md');
      this.settings.file = result.fresh.path;
      await this.saveData(this.settings);
      if (!this.disposed && this.alive() && this.leaf === leaf) {
        await leaf.setViewState({type:'excalidraw',state:{file:result.fresh.path},active:true});
        this.updateName();
        this.show();
      }
      if (!this.disposed) this.settingTab?.display();
    } catch(error) {
      // Keep the saved original reachable even when a later step fails.
      this.settings.file = result?.archived.path ?? current.path;
      try { await this.saveData(this.settings); } catch { /* Original files are never deleted. */ }
      this.report(error);
    } finally {
      this.archiving = false;
      if (this.archiveButton) this.archiveButton.disabled = false;
      if (this.alive() && !this.settings.pinned && !this.native!.isFocused()) void this.hide('blur');
    }
  }

  private updateName() {
    if (this.nameButton) this.nameButton.setText(drawingName(this.settings.file).name || this.t('速记画板', 'Quick canvas'));
  }

  private async renameDrawing(value: string) {
    if (!this.alive() || this.disposed || this.archiving || this.renaming) return;
    const view = this.leaf!.view as DrawingView, file = view.file;
    if (!file) return;
    let renamed = false;
    try {
      const target = renamedDrawingPath(file.path, value);
      if (target === file.path) return;
      const existing = this.app.vault.getAbstractFileByPath(target);
      if (existing && existing !== file) throw Error(this.t('已有同名文件或文件夹，请使用其他名称。', 'A file or folder with that name already exists. Choose another name.'));
      if (!view.forceSave) throw Error(this.t('当前画板暂时无法保存，请稍后重试。', 'The current canvas cannot be saved yet. Try again shortly.'));
      this.renaming = true;
      this.hideGeneration++; this.hiding = false; this.clearBlur();
      this.nameButton!.disabled = true;
      await view.forceSave();
      if (this.disposed || !this.alive() || this.leaf!.view !== view) return;
      await this.app.fileManager.renameFile(file, target);
      this.settings.file = file.path;
      await this.saveData(this.settings);
      renamed = true;
    } catch (error) {
      if (error instanceof Error && error.message === 'invalid-drawing-name') this.report(Error(this.t('请输入有效文件名，不要包含路径或特殊字符。', 'Enter a valid file name without a path or special characters.')));
      else this.report(error);
    } finally {
      this.renaming = false;
      if (this.nameButton) this.nameButton.disabled = false;
      this.updateName();
      if (renamed && this.alive() && !this.native!.isFocused()) void this.hide('blur');
    }
  }

  private togglePin() {
    if (!this.alive()) return;
    this.hideGeneration++; this.hiding = false; this.clearBlur();
    this.settings.pinned = !this.settings.pinned;
    this.native!.setAlwaysOnTop(this.settings.pinned);
    this.updatePin();
    void this.saveData(this.settings);
  }

  private updatePin() {
    const button = this.pinButton;
    if (!button) return;
    setIcon(button, this.settings.pinned ? 'pin-off' : 'pin');
    const label = this.settings.pinned ? this.t('取消固定', 'Unpin') : this.t('固定到屏幕', 'Pin to screen');
    button.setAttribute('aria-label', label);
    button.setAttribute('aria-pressed', String(this.settings.pinned));
    button.classList.toggle('is-active', this.settings.pinned);
  }

  private restoreWindowOpacity() {
    if (this.hiddenOpacity === null) return;
    if (this.native && !this.native.isDestroyed()) this.native.setOpacity?.(this.hiddenOpacity);
    this.hiddenOpacity = null;
  }
  private clearBlur() { if (this.blurTimer) clearTimeout(this.blurTimer); this.blurTimer = null; }
  private keepRendererAwake() {
    if (this.wakeContents) return;
    const mainWindow = window as Window & { electronWindow?: DesktopWindow };
    const contents = mainWindow?.electronWindow?.webContents;
    if (!contents?.getBackgroundThrottling || !contents.setBackgroundThrottling) return;
    this.previousThrottling = contents.getBackgroundThrottling();
    this.wakeContents = contents;
    // Excalidraw's save coordinator runs in the main renderer. Wake it only
    // while this canvas is visible or awaiting its final save.
    contents.setBackgroundThrottling(false);
  }
  private restoreThrottling() {
    if (this.wakeContents && this.previousThrottling !== null) this.wakeContents.setBackgroundThrottling(this.previousThrottling);
    this.wakeContents = null; this.previousThrottling = null;
  }
  private reset() {
    this.restoreWindowOpacity();
    this.hideGeneration++; this.hiding = false; this.clearBlur();
    if (this.boundsTimer) clearTimeout(this.boundsTimer);
    this.boundsTimer = null;
    this.detach?.(); this.detach = null; this.pinButton = null;
    this.restoreThrottling();
    this.leaf = null; this.popout = null; this.native = null; this.hidden = false;
  }
  private report(error: unknown) {
    const code = error instanceof Error ? error.message : String(error);
    const message = code==='invalid-folder' ? this.t('请填写相对于知识库根目录的文件夹路径。','Enter a folder path relative to the vault root.') : code==='folder-is-file' ? this.t('指定路径已存在同名文件，请更换文件夹路径。','A file already exists at the folder path. Choose another folder.') : code;
    new Notice(`Flash Memo: ${message}`);
    console.error('Flash Memo', error);
  }

  onunload() {
    this.disposed = true;
    this.recorder?.close();
    this.archiveDialog?.close();
    this.globalHotkey.dispose();
    // Leave a usable normal Excalidraw window after disabling the controller.
    if (this.alive()) { this.restoreWindowOpacity(); this.native!.show(); this.native!.setAlwaysOnTop(false); }
    this.reset();
  }
}

class MemoSettingTab extends PluginSettingTab {
  private statusEl: HTMLElement | null = null;
  constructor(app: App, private plugin: FlashMemo) { super(app, plugin); }
  hide() { this.plugin.cancelHotkeyRecording(); super.hide(); }
  updateStatus() {
    if (!this.statusEl?.isConnected) return;
    const description = this.plugin.t('在任意应用中显示或隐藏速记画板，Obsidian 在后台或最小化时也可使用。', 'Show or hide the quick canvas from any app, even when Obsidian is in the background or minimized.');
    const problem = this.plugin.hotkeyProblem();
    this.statusEl.setText(problem ? `${description} ${problem}` : description);
  }
  display() {
    const {containerEl} = this, p = this.plugin;
    containerEl.empty();
    new Setting(containerEl)
      .setName(p.t('失焦时自动隐藏', 'Hide on focus loss'))
      .setDesc(p.t('默认开启。未固定时，点击其他窗口会保存并隐藏画板；关闭后画板保持显示。', 'Enabled by default. When unpinned, clicking another window saves and hides the canvas. Turn off to keep it visible.'))
      .addToggle(toggle => toggle.setValue(p.settings.hideOnBlur).onChange(async value => {
        p.settings.hideOnBlur = value;
        await p.saveData(p.settings);
      }));
    const supported = process.platform === 'win32' && process.arch === 'x64';
    new Setting(containerEl)
      .setName(p.t('系统全局快捷键', 'System-wide shortcut'))
      .setDesc(p.t('Obsidian 在后台或最小化时也可呼出。仅 Windows x64；停用插件时自动释放。', 'Open the canvas while Obsidian is in the background or minimized. Windows x64 only; released when the plugin is disabled.'))
      .addToggle(toggle => toggle.setValue(p.settings.globalHotkeyEnabled).setDisabled(!supported).onChange(async value => {
        p.settings.globalHotkeyEnabled = value;
        await p.saveData(p.settings); await p.configureGlobalHotkey();
      }));
    const shortcutSetting = new Setting(containerEl)
      .setName(p.t('显示/隐藏画板的全局快捷键', 'Global shortcut to show/hide canvas'))
      .setDesc('');
    shortcutSetting.controlEl.createEl('kbd', {text:p.settings.globalHotkey,cls:'flash-memo-shortcut'});
    shortcutSetting.addButton(button=>button.setButtonText(p.t('修改','Change')).setDisabled(!supported).onClick(()=>p.recordGlobalHotkey()));
    this.statusEl = shortcutSetting.descEl;
    this.updateStatus();
    new Setting(containerEl)
      .setName(p.t('画板创建路径', 'Canvas creation folder'))
      .setDesc(p.t('相对于知识库根目录，例如 画板/速记。新画板和归档画板均保存在此路径。', 'Relative to the vault root, for example Drawings/Quick notes. New and archived canvases are saved here.'))
      .addText(text => text.setValue(p.settings.folder).onChange(async value => {
        p.settings.folder = value; await p.saveData(p.settings);
      }));
    new Setting(containerEl)
      .setName(p.t('当前画板', 'Current canvas'))
      .setDesc(p.settings.file || p.t('首次呼出时自动创建。', 'Created automatically on first use.'));
    new Setting(containerEl)
      .setName(p.t('快捷键', 'Keyboard shortcut'))
      .setDesc(p.t('Obsidian 内默认 Ctrl/Cmd + Shift + Y；可在快捷键设置中修改，与上方全局组合独立。', 'In-app default: Ctrl/Cmd + Shift + Y. Change it in Obsidian hotkey settings; it is separate from the global shortcut above.'));
  }
}
