import {
  App, FileSystemAdapter, Notice, Plugin, PluginSettingTab, Setting, TFile,
  WorkspaceLeaf, WorkspaceWindow, setIcon, KeymapEventHandler,
} from 'obsidian';
// Desktop timers keep initialization and cleanup responsive when the main
// renderer is background-throttled.
import { setTimeout, clearTimeout } from 'node:timers';
import { join } from 'node:path';
import { GlobalHotkey, HotkeyStatus, localHotkey } from './global-hotkey';
import { HotkeyRecorder } from './hotkey-recorder';
import { ArchiveConfirm } from './archive-confirm';
import { archiveDrawing, availableDrawingPath, drawingFiles, drawingFolder, ensureDrawingFolder } from './drawing-files';
import { drawingName, renamedDrawingPath } from './drawing-name';
import { DrawingPicker } from './drawing-picker';
import { CanvasError } from './canvas-error';
import { TrayIntegration, TrayPluginManager } from './tray-integration';
import { WindowFade } from './window-fade';
import { SettingsStore } from './settings-store';
import { withoutMemoPopout } from './workspace-layout';

interface Bounds { x: number; y: number; width: number; height: number }
// Obsidian exposes this on desktop popouts, but it is outside the public API.
interface DesktopWindow {
  isDestroyed(): boolean;
  show(): void;
  hide(): void;
  destroy?(): void;
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
  private windowFade = new WindowFade();
  private hideLayerHeld = false;
  private opening = false;
  private startupRestore: Promise<void> | null = null;
  private quitting = false;
  private settingsStore: SettingsStore | null = null;
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
  private localHotkeyHandler: KeymapEventHandler | null = null;
  private archiving = false;
  private archiveDialog: ArchiveConfirm | null = null;
  private archiveButton: HTMLButtonElement | null = null;
  private nameButton: HTMLButtonElement | null = null;
  private renaming = false;
  private cancelNameEdit: (() => void) | null = null;
  private drawingPicker: DrawingPicker | null = null;
  private switching = false;
  private errorDialog: CanvasError | null = null;
  private errorClosing = false;
  readonly tray = new TrayIntegration(() => (this.app as App & {plugins: TrayPluginManager}).plugins, () => {
    const main = (window as Window & {electronWindow?: DesktopWindow}).electronWindow;
    main?.show(); main?.focus();
  });
  private globalHotkey = new GlobalHotkey(() => this.triggerToggle(), () => this.settingTab?.updateStatus());

  t(zh: string, en: string): string {
    return (window.localStorage.getItem('language') ?? navigator.language).toLowerCase().startsWith('zh') ? zh : en;
  }

  private getSettingsStore() {
    if (this.settingsStore) return this.settingsStore;
    const adapter = this.app.vault.adapter;
    if (!(adapter instanceof FileSystemAdapter) || !this.manifest.dir) throw Error('Flash Memo requires a desktop vault.');
    return this.settingsStore = new SettingsStore(join(adapter.getBasePath(), this.manifest.dir, 'data.json'));
  }

  async loadData() {
    const saved = await this.getSettingsStore().load();
    if (saved.recovered) new Notice(this.t('Flash Memo 设置文件异常，已从有效备份恢复。', 'Flash Memo settings were damaged and have been restored from a valid backup.'));
    return saved.data;
  }

  async saveData(data: unknown) {
    await this.getSettingsStore().save(data);
  }

  async onload() {
    this.settings = { ...DEFAULTS, ...await this.loadData() };
    this.filterSavedLayout();
    this.addCommand({
      id: 'toggle', name: this.t('显示/隐藏速记画板', 'Show/hide quick canvas'),
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
      if (!this.archiving) void this.saveData(this.settings).catch(error => this.report(error, true));
    }));
    this.registerEvent(this.app.vault.on('delete', file => this.onDrawingDeleted(file.path)));
    this.registerEvent(this.app.workspace.on('window-close', win => {
      if (win !== this.popout) return;
      this.reset();
      this.settings.leafId = '';
      void this.saveData(this.settings).catch(error => this.report(error));
    }));
    this.registerEvent(this.app.workspace.on('quit', tasks => {
      tasks.addPromise(this.prepareQuit());
    }));
    this.app.workspace.onLayoutReady(() => {
      if (this.disposed) return;
      void this.configureGlobalHotkey().then(success => {
        if (!success && this.settings.globalHotkeyEnabled && !this.disposed) new Notice(this.hotkeyDescription());
      }).catch(error => this.report(error));
      const restoring = this.restoreDrawingWindow().catch(error => this.report(error));
      this.startupRestore = restoring;
      void restoring.finally(() => { if (this.startupRestore === restoring) this.startupRestore = null; });
    });
  }

  private filterSavedLayout() {
    const plugin = this, workspace = this.app.workspace, original = workspace.getLayout;
    let enabled = true;
    const filtered: typeof original = function (this: typeof workspace) {
      const layout = original.call(this);
      const owned = (plugin.leaf as WorkspaceLeaf & { id: string } | null)?.id
        || plugin.settings.leafId;
      return enabled ? withoutMemoPopout(layout, owned) : layout;
    };
    workspace.getLayout = filtered;
    this.register(() => {
      // Keep filtering through final shutdown even if asynchronous quit cleanup
      // is interrupted. Normal plugin disable restores the original behavior.
      if (this.quitting) return;
      enabled = false;
      if (workspace.getLayout === filtered) workspace.getLayout = original;
      workspace.requestSaveLayout();
    });
  }

  private async restoreDrawingWindow() {
    if (this.disposed || this.alive() || !this.settings.file) return;
    const leaves: WorkspaceLeaf[] = [];
    this.app.workspace.iterateAllLeaves(leaf => leaves.push(leaf));
    const candidates = leaves.filter(leaf => {
      const container = leaf.getContainer();
      if (!(container instanceof WorkspaceWindow)) return false;
      // Never take over main-window tabs or a popout containing other tabs.
      if (leaves.filter(other => other.getContainer() === container).length !== 1) return false;
      const state = leaf.getViewState();
      return state.type === 'excalidraw' && state.state?.file === this.settings.file;
    });
    const restored = candidates.find(leaf => (leaf as WorkspaceLeaf & { id: string }).id === this.settings.leafId)
      ?? (candidates.length === 1 ? candidates[0] : undefined);
    if (!restored) return;
    const native = ((restored.getContainer() as WorkspaceWindow).win as Window & { electronWindow?: DesktopWindow }).electronWindow;
    this.hidden = true;
    try {
      // Startup only restores saved content; do not wait for Excalidraw to save
      // or show a pinned canvas before its editor has finished loading.
      if (native && !native.isDestroyed()) native.hide();
      await this.attach(restored);
      if (this.disposed || !this.alive()) return;
      this.native!.hide();
      this.restoreThrottling();
      this.settings.leafId = (restored as WorkspaceLeaf & { id: string }).id;
      await this.saveData(this.settings);
      this.app.workspace.requestSaveLayout();
      await this.app.workspace.requestSaveLayout.run();
    } catch (error) {
      this.reset();
      if (!this.disposed && native && !native.isDestroyed()) native.show();
      throw error;
    }
  }

  private async prepareQuit() {
    if (this.quitting) return;
    this.quitting = true;
    try {
      if (this.startupRestore) await this.startupRestore;
      const leaf = this.leaf;
      if (!this.alive() || !leaf) return;
      this.keepRendererAwake();
      if (this.settings.file && await this.app.vault.adapter.exists(this.settings.file)) {
        const view = leaf.view as DrawingView;
        if (!view.forceSave) throw Error(this.t('当前画板暂时无法保存，请稍后重试。', 'The current canvas cannot be saved yet. Try again shortly.'));
        await view.forceSave();
      }
      // Layout filtering already excludes the popout. Do not tear down tabs or
      // start another settings/layout write during application shutdown.
    } catch (error) {
      this.quitting = false;
      this.report(error, true);
      throw error;
    }
  }

  private triggerToggle() {
    // One physical keypress can reach both a global registration and a local
    // Obsidian binding if the user assigns them the same combination.
    const now = Date.now();
    if (this.disposed || now - this.lastTrigger < 250) return;
    this.lastTrigger = now;
    void this.toggle().catch(error => this.report(error, true));
  }

  async configureGlobalHotkey(candidate?: string): Promise<boolean> {
    this.clearLocalHotkey();
    const adapter = this.app.vault.adapter;
    if (!(adapter instanceof FileSystemAdapter) || !this.manifest.dir || this.disposed) return false;
    const handle = (window as Window & { electronWindow?: DesktopWindow }).electronWindow?.getNativeWindowHandle?.();
    const owner = handle && handle.length >= 8 ? handle.readBigUInt64LE().toString() : '0';
    const executable = join(adapter.getBasePath(), this.manifest.dir, 'flash-memo-hotkey.exe');
    const success = await this.globalHotkey.configure(this.settings.globalHotkeyEnabled && (!this.recording || candidate !== undefined), candidate ?? this.settings.globalHotkey, executable, owner);
    if (success) this.configureLocalHotkey();
    return success;
  }

  private clearLocalHotkey() {
    if (this.localHotkeyHandler) this.app.scope.unregister(this.localHotkeyHandler);
    this.localHotkeyHandler = null;
  }

  private configureLocalHotkey() {
    this.clearLocalHotkey();
    if (this.settings.globalHotkeyEnabled || this.recording || this.disposed) return;
    const hotkey = localHotkey(this.settings.globalHotkey);
    this.localHotkeyHandler = this.app.scope.register(hotkey.modifiers, hotkey.key, event => {
      if (!event.repeat) this.triggerToggle();
      return false;
    });
  }

  recordGlobalHotkey() {
    if (this.recorder || this.disposed) return;
    this.recording = true;
    const modal = new HotkeyRecorder(this.app, (zh,en)=>this.t(zh,en), async()=>{ await this.configureGlobalHotkey(); }, async candidate=>{
      const success = await this.configureGlobalHotkey(candidate);
      if (this.recorder !== modal || this.disposed) return false;
      if (!success) throw Error(this.hotkeyDescription());
      const previous = this.settings.globalHotkey;
      this.settings.globalHotkey = candidate;
      try { await this.saveData(this.settings); }
      catch (error) { this.settings.globalHotkey = previous; await this.configureGlobalHotkey(); throw error; }
      this.recording = false;
      this.configureLocalHotkey();
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
      off: ['仅在 Obsidian 内生效。','Available inside Obsidian only.'],
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
    if (existing && await this.app.vault.adapter.exists(existing.path)) return existing;
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
    if (this.startupRestore) await this.startupRestore;
    if (this.quitting) return;
    if (this.errorClosing) return;
    if (this.errorDialog) { this.show(); return; }
    if (this.disposed || this.opening || this.archiving || this.renaming || this.switching) return;
    this.opening = true;
    let created: WorkspaceLeaf | null = null;
    try {
      this.keepRendererAwake();
      // A popout can survive after its drawing has been deleted or its view cleared.
      // Validate the file even when the existing native window is still alive.
      const file = await this.ensureDrawing();
      if (this.disposed) return;
      if (this.alive()) {
        if ((this.leaf!.view as DrawingView).file !== file) {
          this.hideGeneration++; this.hiding = false; this.clearBlur();
          this.keepRendererAwake();
          await this.leaf!.setViewState({type:'excalidraw',state:{file:file.path},active:true});
          if (this.disposed || !this.alive()) return;
          this.updateName();
          this.show();
        } else if (this.hidden || this.hiding) this.show();
        else await this.hide('escape');
        return;
      }
      this.reset();
      this.keepRendererAwake();
      created = this.app.workspace.getLeaf('window');
      await created.setViewState({ type: 'excalidraw', state: { file: file.path }, active: true });
      await this.attach(created);
      if (this.disposed) return;
      this.settings.leafId = (created as WorkspaceLeaf & { id: string }).id;
      await this.saveData(this.settings);
      this.show();
    } catch (error) {
      if (created) { this.reset(); created.detach(); }
      throw error;
    } finally {
      this.opening = false;
      if (!this.alive() || (this.hidden && !this.hiding)) this.restoreThrottling();
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
    this.nameButton.setAttribute('aria-label', this.t('单击选择画板，双击修改文件名', 'Click to choose a canvas; double-click to rename'));
    const nameInput = nameContainer.createEl('input', {cls: 'flash-memo-name-input', type: 'text'});
    nameInput.hidden = true;
    nameInput.setAttribute('aria-label', this.t('文件名（不含扩展名）', 'File name (without extension)'));
    const finishEdit = () => { nameInput.hidden = true; if (this.nameButton) this.nameButton.hidden = false; };
    this.cancelNameEdit = finishEdit;
    this.drawingPicker = new DrawingPicker(this.nameButton, () => {
      const files = drawingFiles(this.app, this.settings.folder);
      const current = this.app.vault.getFileByPath(this.settings.file);
      if (current && !files.includes(current)) files.unshift(current);
      return files;
    }, () => this.settings.file, file => this.runWindowAction(() => this.switchDrawing(file)), (zh, en) => this.t(zh, en));
    const onRename = () => this.runWindowAction(() => {
      if (this.errorDialog || this.archiving || this.renaming || this.switching) return;
      this.drawingPicker?.hide();
      nameInput.value = drawingName(this.settings.file).name;
      this.nameButton!.hidden = true; nameInput.hidden = false;
      nameInput.focus(); nameInput.select();
    });
    const onNameBlur = () => {
      if (nameInput.hidden) return;
      const value = nameInput.value;
      finishEdit(); this.runWindowAction(() => this.renameDrawing(value));
    };
    const onNameKey = (event: KeyboardEvent) => {
      if (event.key !== 'Enter' && event.key !== 'Escape') return;
      event.preventDefault(); event.stopPropagation();
      if (event.key === 'Enter') onNameBlur(); else finishEdit();
      this.nameButton?.focus();
    };
    const onNameClick = (event: MouseEvent) => this.runWindowAction(() => {
      if (event.detail > 1 || this.errorDialog || this.archiving || this.renaming || this.switching) return;
      this.drawingPicker?.toggle();
    });
    const onNameButtonKey = (event: KeyboardEvent) => this.runWindowAction(() => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault(); event.stopPropagation(); this.drawingPicker?.focus();
      } else if (event.key === 'F2') { event.preventDefault(); event.stopPropagation(); onRename(); }
      else if (event.key === 'Escape' && this.nameButton?.getAttribute('aria-expanded') === 'true') {
        event.preventDefault(); event.stopPropagation(); this.drawingPicker?.hide();
      }
    });
    this.nameButton.addEventListener('click', onNameClick);
    this.nameButton.addEventListener('dblclick', onRename);
    this.nameButton.addEventListener('keydown', onNameButtonKey);
    nameInput.addEventListener('blur', onNameBlur);
    nameInput.addEventListener('keydown', onNameKey);
    this.updateName();
    const actions = bar.createDiv({cls: 'flash-memo-actions'});
    this.archiveButton = actions.createEl('button', {cls:'clickable-icon flash-memo-archive'});
    setIcon(this.archiveButton, 'archive');
    const archiveLabel = this.t('归档并新建画板', 'Archive and create canvas');
    this.archiveButton.setAttribute('aria-label',archiveLabel);
    const onArchive = () => this.runWindowAction(() => this.confirmArchive());
    this.archiveButton.addEventListener('click',onArchive);
    this.pinButton = actions.createEl('button', {cls: 'clickable-icon flash-memo-pin'});
    const onPin = () => this.runWindowAction(() => this.togglePin());
    this.pinButton.addEventListener('click', onPin);
    const closeButton = actions.createEl('button', {cls: 'clickable-icon flash-memo-close'});
    setIcon(closeButton, 'x');
    closeButton.setAttribute('aria-label', this.t('关闭', 'Close'));
    const onClose = () => this.requestHide('close');
    closeButton.addEventListener('click', onClose);
    doc.body.append(bar);
    this.updatePin();
    const onBlur = () => this.runWindowAction(() => {
      this.drawingPicker?.hide();
      this.clearBlur();
      if (!this.settings.hideOnBlur || this.settings.pinned || this.hidden) {
        if (!this.settings.hideOnBlur) this.restoreHideLayer();
        return;
      }
      if (this.errorDialog || this.errorClosing || this.hiding || this.archiving || this.renaming || this.switching) return;
      // Already held while focused: do not change the layer after activation moves.
      this.holdHideLayer();
      this.blurTimer = setTimeout(() => {
        this.blurTimer = null;
        if (!native!.isDestroyed() && !native!.isFocused()) this.requestHide('blur');
        else this.restoreHideLayer();
      }, 0);
    });
    const onFocus = () => this.runWindowAction(() => {
      this.clearBlur(); this.hideGeneration++; this.hiding = false;
      this.restoreWindowOpacity(true); this.prepareHideLayer();
    });
    const onNativeShow = () => this.runWindowAction(() => {
      // Tray restores all known windows. A canvas hidden by Flash Memo should
      // stay hidden until the user explicitly opens it.
      if (this.hidden && !this.errorDialog) native!.hide();
    });
    const onNativeHide = () => this.runWindowAction(() => {
      if (this.hidden || this.hiding) return;
      if (this.errorDialog) this.show();
      else this.requestHide('close');
    });
    const onBounds = () => {
      if (this.boundsTimer) clearTimeout(this.boundsTimer);
      this.boundsTimer = setTimeout(() => {
        this.boundsTimer = null;
        if (!this.alive() || this.hidden) return;
        this.settings.bounds = native!.getBounds();
        void this.saveData(this.settings).catch(error => this.report(error, true));
      }, 300);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      if (doc.querySelector('.modal-container, .menu, .suggestion-container, .excalidraw .popover')) return;
      const state = (this.leaf?.view as DrawingView | undefined)?.excalidrawAPI?.getAppState();
      if (state?.editingTextElement || state?.openDialog || state?.openMenu) return;
      event.preventDefault();
      this.requestHide('escape');
    };
    native.on('blur', onBlur); native.on('focus', onFocus);
    native.on('show', onNativeShow); native.on('hide', onNativeHide);
    native.on('resize', onBounds); native.on('moved', onBounds);
    doc.addEventListener('keydown', onKey);
    if (native.isFocused()) this.prepareHideLayer();
    this.detach = () => {
      native!.off('blur', onBlur); native!.off('focus', onFocus);
      native!.off('show', onNativeShow); native!.off('hide', onNativeHide);
      native!.off('resize', onBounds); native!.off('moved', onBounds);
      doc.removeEventListener('keydown', onKey);
      this.pinButton?.removeEventListener('click', onPin);
      closeButton.removeEventListener('click', onClose);
      this.drawingPicker?.hide(); this.drawingPicker = null;
      this.nameButton?.removeEventListener('click', onNameClick);
      this.nameButton?.removeEventListener('dblclick', onRename);
      this.nameButton?.removeEventListener('keydown', onNameButtonKey); this.nameButton = null;
      this.cancelNameEdit = null;
      nameInput.removeEventListener('blur', onNameBlur);
      nameInput.removeEventListener('keydown', onNameKey);
      this.archiveButton?.removeEventListener('click',onArchive); this.archiveButton = null;
      bar.remove(); doc.body.classList.remove('flash-memo-window');
    };
    this.app.workspace.requestSaveLayout();
  }

  private show() {
    if (!this.alive()) return;
    this.hideGeneration++; this.hiding = false; this.clearBlur();
    this.hidden = false;
    this.keepRendererAwake();
    this.restoreWindowOpacity(true);
    this.prepareHideLayer();
    this.native!.show();
    this.native!.focus();
  }

  private runWindowAction(action: () => void | Promise<void>) {
    if (this.disposed || this.quitting || this.errorClosing) return;
    try { void Promise.resolve(action()).catch(error => this.report(error, true)); }
    catch (error) { this.report(error, true); }
  }

  private requestHide(reason: 'blur' | 'escape' | 'close') {
    this.runWindowAction(() => this.hide(reason));
  }

  private async hide(reason: 'blur' | 'escape' | 'close') {
    if (this.errorDialog || this.errorClosing || !this.alive() || this.hidden || this.hiding || this.archiving || this.renaming || this.switching || (reason === 'blur' && (!this.settings.hideOnBlur || this.settings.pinned))) {
      if (!this.hiding) this.restoreHideLayer();
      return;
    }
    this.drawingPicker?.hide();
    const generation = ++this.hideGeneration;
    this.hiding = true;
    try {
      this.holdHideLayer();
      const exists = !!this.settings.file && await this.app.vault.adapter.exists(this.settings.file);
      if (generation !== this.hideGeneration || !this.alive()) return;
      if (!exists) { this.hideDeletedDrawing(); return; }
      const view = this.leaf!.view as DrawingView;
      if (!view.forceSave) throw Error(this.t('当前 Excalidraw 版本不支持保存接口，请更新插件。', 'Please update Excalidraw: its save interface is unavailable.'));
      await view.forceSave();
      if (generation !== this.hideGeneration || !this.alive()) return;
      if (reason === 'blur' && (!this.settings.hideOnBlur || this.settings.pinned || this.native!.isFocused())) return;
      // Animate explicitly: native hide does not reliably animate on Windows.
      if (!await this.windowFade.fadeOut(this.native!)) return;
      if (generation !== this.hideGeneration || !this.alive()) return;
      this.hidden = true;
      this.native!.hide();
      this.restoreThrottling();
    } catch (error) {
      if (generation !== this.hideGeneration || !this.alive()) return;
      try {
        if (!await this.app.vault.adapter.exists(this.settings.file)) { this.hideDeletedDrawing(); return; }
      } catch { /* Report the original save/storage error when deletion cannot be confirmed. */ }
      if (generation !== this.hideGeneration || !this.alive()) return;
      this.restoreWindowOpacity(); this.report(error, true);
    }
    finally {
      if (generation === this.hideGeneration) { this.hiding = false; this.restoreHideLayer(); }
    }
  }

  private onDrawingDeleted(path: string) {
    if (path !== this.settings.file && !this.settings.file.startsWith(path + '/')) return;
    // A replacement may already have been created before a delayed delete event.
    if (this.app.vault.getFileByPath(this.settings.file)) return;
    this.hideDeletedDrawing();
  }

  private hideDeletedDrawing() {
    if (this.disposed || !this.alive()) return;
    this.restoreWindowOpacity();
    this.hideGeneration++; this.hiding = false; this.clearBlur();
    this.cancelNameEdit?.(); this.archiveDialog?.close();
    this.drawingPicker?.hide();
    if (process.platform === 'win32' && this.native!.setOpacity && this.hiddenOpacity === null) {
      const opacity = this.native!.getOpacity?.() ?? 1;
      this.native!.setOpacity(0); this.hiddenOpacity = opacity;
    }
    this.hidden = true;
    this.native!.hide();
    this.restoreThrottling();
  }

  private confirmArchive() {
    if (this.errorDialog || !this.alive() || this.disposed || this.archiving || this.renaming || this.switching || this.archiveDialog) return;
    try {
      const folder = drawingFolder(this.settings.folder);
      if (!folder) throw Error('invalid-folder');
      this.archiveDialog = new ArchiveConfirm(this.app,(zh,en)=>this.t(zh,en),folder,
        ()=>this.archiveCurrentDrawing(),()=>{this.archiveDialog=null;});
      this.archiveDialog.open();
    } catch(error) { this.report(error); }
  }

  private async archiveCurrentDrawing() {
    if (this.errorDialog || !this.alive() || this.disposed || this.archiving || this.renaming || this.switching) return;
    const leaf = this.leaf!, view = leaf.view as DrawingView, current = view.file;
    if (!current || !view.forceSave) { this.report(Error(this.t('当前画板暂时无法保存，请稍后重试。','The current canvas cannot be saved yet. Try again shortly.')), true); return; }
    this.archiving = true; this.archiveButton!.disabled = true;
    this.hideGeneration++; this.hiding = false; this.clearBlur(); this.restoreWindowOpacity(true); this.keepRendererAwake();
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
      this.report(error, true);
    } finally {
      this.archiving = false;
      if (this.archiveButton) this.archiveButton.disabled = false;
      if (this.alive() && !this.settings.pinned && !this.native!.isFocused()) this.requestHide('blur');
    }
  }

  private updateName() {
    if (this.nameButton) this.nameButton.setText(drawingName(this.settings.file).name || this.t('速记画板', 'Quick canvas'));
  }

  private async switchDrawing(file: TFile) {
    if (this.errorDialog || !this.alive() || this.disposed || this.archiving || this.renaming || this.switching || file.path === this.settings.file) return;
    const leaf = this.leaf!, view = leaf.view as DrawingView;
    const previous = this.settings.file;
    this.switching = true;
    this.hideGeneration++; this.hiding = false; this.clearBlur();
    this.restoreWindowOpacity(true);
    this.drawingPicker?.hide(); this.cancelNameEdit?.();
    if (this.nameButton) this.nameButton.disabled = true;
    this.keepRendererAwake();
    let changingView = false;
    try {
      if (this.app.vault.getFileByPath(file.path) !== file || !await this.app.vault.adapter.exists(file.path)) throw Error(this.t('所选画板已不存在，请重新选择。', 'The selected canvas no longer exists. Choose another canvas.'));
      if (await this.app.vault.adapter.exists(previous)) {
        if (!view.forceSave) throw Error(this.t('当前画板暂时无法保存，请稍后重试。', 'The current canvas cannot be saved yet. Try again shortly.'));
        await view.forceSave();
      }
      if (this.disposed || !this.alive() || this.leaf !== leaf || this.hidden) return;
      if (this.app.vault.getFileByPath(file.path) !== file || !await this.app.vault.adapter.exists(file.path)) throw Error(this.t('所选画板已不存在，请重新选择。', 'The selected canvas no longer exists. Choose another canvas.'));
      changingView = true;
      await leaf.setViewState({type:'excalidraw',state:{file:file.path},active:true});
      if (this.disposed || !this.alive() || this.leaf !== leaf || this.hidden) return;
      this.settings.file = file.path;
      changingView = false;
      this.updateName();
      await this.saveData(this.settings);
      this.show();
    } catch (error) {
      if (this.disposed || !this.alive() || (this.hidden && !this.app.vault.getFileByPath(previous))) return;
      if (changingView && !this.disposed && this.alive() && this.leaf === leaf) {
        try {
          if (await this.app.vault.adapter.exists(previous)) await leaf.setViewState({type:'excalidraw',state:{file:previous},active:true});
        } catch { /* Keep both files intact if the view cannot be restored. */ }
      }
      this.report(error, true);
    } finally {
      this.switching = false;
      if (this.nameButton) this.nameButton.disabled = false;
      this.updateName();
      if (this.hidden || !this.alive()) this.restoreThrottling();
    }
  }

  private async renameDrawing(value: string) {
    if (this.errorDialog || !this.alive() || this.disposed || this.archiving || this.renaming || this.switching) return;
    const view = this.leaf!.view as DrawingView, file = view.file;
    if (!file) return;
    let renamed = false;
    try {
      const target = renamedDrawingPath(file.path, value);
      if (target === file.path) return;
      const existing = this.app.vault.getAbstractFileByPath(target);
      if (existing && existing !== file) throw Error('drawing-name-exists');
      if (!view.forceSave) throw Error(this.t('当前画板暂时无法保存，请稍后重试。', 'The current canvas cannot be saved yet. Try again shortly.'));
      this.renaming = true;
      this.hideGeneration++; this.hiding = false; this.clearBlur();
      this.restoreWindowOpacity(true);
      this.nameButton!.disabled = true;
      await view.forceSave();
      if (this.disposed || !this.alive() || this.leaf!.view !== view) return;
      await this.app.fileManager.renameFile(file, target);
      this.settings.file = file.path;
      await this.saveData(this.settings);
      renamed = true;
    } catch (error) {
      if (error instanceof Error && error.message === 'invalid-drawing-name') this.report(Error(this.t('请输入有效文件名，不要包含路径或特殊字符。', 'Enter a valid file name without a path or special characters.')));
      else if (error instanceof Error && error.message === 'drawing-name-exists') this.report(Error(this.t('已有同名文件或文件夹，请使用其他名称。', 'A file or folder with that name already exists. Choose another name.')));
      else this.report(error, true);
    } finally {
      this.renaming = false;
      if (this.nameButton) this.nameButton.disabled = false;
      this.updateName();
      if (renamed && this.alive() && !this.native!.isFocused()) this.requestHide('blur');
    }
  }

  private togglePin() {
    if (!this.alive()) return;
    this.hideGeneration++; this.hiding = false; this.clearBlur();
    this.restoreWindowOpacity(true);
    this.settings.pinned = !this.settings.pinned;
    this.hideLayerHeld = !this.settings.pinned && this.settings.hideOnBlur && !this.hidden;
    this.native!.setAlwaysOnTop(this.settings.pinned || this.hideLayerHeld);
    this.updatePin();
    void this.saveData(this.settings).catch(error => this.report(error, true));
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

  async setHideOnBlur(value: boolean) {
    this.settings.hideOnBlur = value;
    if (value && this.alive() && !this.hidden && this.native!.isFocused()) this.prepareHideLayer();
    else this.restoreHideLayer();
    await this.saveData(this.settings);
  }

  private prepareHideLayer() {
    if (this.settings.hideOnBlur && !this.hidden && !this.errorDialog) this.holdHideLayer();
    else this.restoreHideLayer();
  }

  private holdHideLayer() {
    if (this.hideLayerHeld || !this.alive() || this.settings.pinned) return;
    this.hideLayerHeld = true;
    this.native!.setAlwaysOnTop(true);
  }

  private restoreHideLayer() {
    if (!this.hideLayerHeld) return;
    this.hideLayerHeld = false;
    if (this.alive()) this.native!.setAlwaysOnTop(this.settings.pinned);
  }

  private restoreWindowOpacity(keepLayer = false) {
    this.windowFade.cancel();
    if (!keepLayer) this.restoreHideLayer();
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
    const errorDialog = this.errorDialog; this.errorDialog = null; errorDialog?.close();
    this.restoreWindowOpacity();
    this.hideGeneration++; this.hiding = false; this.clearBlur();
    if (this.boundsTimer) clearTimeout(this.boundsTimer);
    this.boundsTimer = null;
    this.detach?.(); this.detach = null; this.pinButton = null;
    this.restoreThrottling();
    this.leaf = null; this.popout = null; this.native = null; this.hidden = false;
  }
  private report(error: unknown, closeWindow = false) {
    const code = error instanceof Error ? error.message : String(error);
    const message = code==='invalid-folder' ? this.t('请填写相对于知识库根目录的文件夹路径。','Enter a folder path relative to the vault root.') : code==='folder-is-file' ? this.t('指定路径已存在同名文件，请更换文件夹路径。','A file already exists at the folder path. Choose another folder.') : code;
    console.error('Flash Memo', error);
    if (this.disposed || this.errorClosing) return;
    if (!closeWindow) { new Notice(`Flash Memo: ${message}`); return; }
    if (this.errorDialog) return;
    this.hideGeneration++; this.hiding = false; this.clearBlur();
    for (const cleanup of [() => this.drawingPicker?.hide(), () => this.cancelNameEdit?.(), () => this.archiveDialog?.close()]) {
      try { cleanup(); } catch (cleanupError) { console.error('Flash Memo error cleanup', cleanupError); }
    }
    const dialog = new CanvasError(this.app, (zh,en) => this.t(zh,en), message, this.popout?.doc, confirmed => {
      if (this.errorDialog !== dialog) return;
      this.errorDialog = null;
      if (this.disposed) return;
      if (confirmed) this.closeFailedWindow();
    });
    this.errorDialog = dialog;
    try { if (this.alive()) this.show(); } catch (showError) { console.error('Flash Memo error window', showError); }
    dialog.open();
  }

  private closeFailedWindow() {
    if (this.errorClosing) return;
    this.errorClosing = true;
    const leaf = this.leaf, native = this.native;
    // Recovery must not call hide()/forceSave(): the failing save may be what
    // prevented the normal close button from working in the first place.
    try {
      try { this.reset(); } catch (error) { console.error('Flash Memo cleanup', error); }
      this.leaf = null; this.native = null; this.popout = null;
      this.clearBlur();
      if (this.boundsTimer) clearTimeout(this.boundsTimer);
      this.boundsTimer = null;
      // Let Obsidian and Tray release their popout bookkeeping before falling
      // back to native destruction if normal leaf cleanup cannot close it.
      try { leaf?.detach(); } catch (error) { console.error('Flash Memo leaf cleanup', error); }
      try {
        if (native && !native.isDestroyed()) {
          if (native.destroy) native.destroy(); else native.hide();
        }
      } catch (error) {
        console.error('Flash Memo window close', error);
        try { native?.hide(); } catch { /* Continue releasing the workspace leaf. */ }
      }
      try { this.restoreThrottling(); } catch (error) { console.error('Flash Memo renderer cleanup', error); }
      this.settings.leafId = '';
      try { void this.saveData(this.settings).catch(error => console.error('Flash Memo recovery settings', error)); }
      catch (error) { console.error('Flash Memo recovery settings', error); }
    } finally { this.errorClosing = false; }
  }

  onunload() {
    this.disposed = true;
    this.clearLocalHotkey();
    this.recorder?.close();
    this.archiveDialog?.close();
    this.globalHotkey.dispose();
    // Leave a usable normal Excalidraw window after disabling the controller.
    if (this.alive()) {
      this.restoreWindowOpacity();
      if (!this.quitting) this.native!.show();
      this.native!.setAlwaysOnTop(false);
    }
    this.reset();
  }
}

class MemoSettingTab extends PluginSettingTab {
  private statusEl: HTMLElement | null = null;
  constructor(app: App, private plugin: FlashMemo) { super(app, plugin); }
  hide() { this.plugin.cancelHotkeyRecording(); super.hide(); }
  updateStatus() {
    if (!this.statusEl?.isConnected) return;
    const description = this.plugin.t('显示或隐藏速记画板。开启上方“全局快捷键”后可在任意应用中使用，关闭后仅在 Obsidian 内生效。', 'Show or hide the quick canvas. Enable Global shortcut above to use it from any app; otherwise it works inside Obsidian only.');
    const problem = this.plugin.hotkeyProblem();
    this.statusEl.setText(problem ? `${description} ${problem}` : description);
  }
  display() {
    const {containerEl} = this, p = this.plugin;
    containerEl.empty();
    containerEl.classList.add('flash-memo-settings');
    const section = (name: string) => {
      new Setting(containerEl).setName(name).setHeading();
      return containerEl.createDiv({cls: 'flash-memo-settings-section'});
    };
    const windowSection = section(p.t('窗口行为', 'Window behavior'));
    const trayStatus = p.tray.status();
    const trayDescription = document.createDocumentFragment();
    trayDescription.append(p.t('关闭 Obsidian 主窗口时收起到托盘，让速记快捷键继续可用。由可选插件 Tray 提供，完全退出请使用托盘菜单的 Close Vault。', 'Keep Obsidian in the system tray when closing its main window so the quick canvas shortcut stays available. Requires the optional Tray plugin; use Close Vault in the tray menu to exit.'));
    if (trayStatus === 'missing') {
      trayDescription.append(p.t(' 推荐先安装 ', ' Install the recommended '));
      trayDescription.createEl('a', {text: 'Tray', href: 'obsidian://show-plugin?id=tray'});
      trayDescription.append(p.t(' 插件并启用。', ' plugin and enable it first.'));
    } else if (trayStatus === 'disabled') trayDescription.append(p.t(' Tray 已安装，需先启用。', ' Tray is installed but disabled.'));
    else if (trayStatus === 'unsupported') trayDescription.append(p.t(' 当前 Tray 版本的接口不兼容，请在 Tray 设置中配置。', ' This Tray version has incompatible interfaces; configure it in Tray settings.'));
    const traySetting = new Setting(windowSection)
      .setName(p.t('关闭到托盘', 'Close to system tray'))
      .setDesc(trayDescription)
      .addToggle(toggle => toggle.setValue(p.tray.enabled()).setDisabled(trayStatus !== 'ready').onChange(async value => {
        toggle.setDisabled(true);
        try { await p.tray.setEnabled(value); }
        catch (error) { new Notice(p.t('无法更改关闭到托盘设置，请检查 Tray 是否已启用并可正常使用。', 'Could not update close-to-tray. Check that Tray is enabled and working.')); console.error('Flash Memo Tray', error); }
        finally { if (containerEl.isConnected) this.display(); }
      }));
    if (trayStatus === 'disabled') traySetting.addButton(button => button.setButtonText(p.t('启用 Tray', 'Enable Tray')).onClick(async () => {
      button.setDisabled(true);
      try { await p.tray.enablePlugin(); }
      catch (error) { new Notice(p.t('无法启用 Tray，请在第三方插件设置中检查。', 'Could not enable Tray. Check community plugin settings.')); console.error('Flash Memo Tray', error); }
      finally { if (containerEl.isConnected) this.display(); }
    }));
    new Setting(windowSection)
      .setName(p.t('失焦时自动隐藏', 'Hide on focus loss'))
      .setDesc(p.t('默认开启。未固定时，点击其他窗口会保存并隐藏画板；关闭后画板保持显示。', 'Enabled by default. When unpinned, clicking another window saves and hides the canvas. Turn off to keep it visible.'))
      .addToggle(toggle => toggle.setValue(p.settings.hideOnBlur).onChange(async value => {
        await p.setHideOnBlur(value);
      }));
    const shortcutSection = section(p.t('快捷键', 'Keyboard shortcut'));
    const supported = process.platform === 'win32' && process.arch === 'x64';
    new Setting(shortcutSection)
      .setName(p.t('全局快捷键', 'Global shortcut'))
      .setDesc(p.t('开启后可在 Obsidian 后台或最小化时使用下方快捷键；关闭后仅在 Obsidian 内生效。全局模式仅支持 Windows x64。', 'Use the shortcut below while Obsidian is in the background or minimized. When off, it works inside Obsidian only. Global mode requires Windows x64.'))
      .addToggle(toggle => toggle.setValue(p.settings.globalHotkeyEnabled).setDisabled(!supported).onChange(async value => {
        p.settings.globalHotkeyEnabled = value;
        await p.saveData(p.settings); await p.configureGlobalHotkey();
      }));
    const shortcutSetting = new Setting(shortcutSection)
      .setName(p.t('唤起窗口快捷键', 'Window activation shortcut'))
      .setDesc('');
    shortcutSetting.controlEl.createEl('kbd', {text:p.settings.globalHotkey,cls:'flash-memo-shortcut'});
    shortcutSetting.addButton(button=>button.setButtonText(p.t('修改','Change')).onClick(()=>p.recordGlobalHotkey()));
    this.statusEl = shortcutSetting.descEl;
    this.updateStatus();
    const drawingSection = section(p.t('画板文件', 'Drawing files'));
    new Setting(drawingSection)
      .setName(p.t('画板创建路径', 'Canvas creation folder'))
      .setDesc(p.t('相对于知识库根目录，例如 画板/速记。新画板和归档画板均保存在此路径。', 'Relative to the vault root, for example Drawings/Quick notes. New and archived canvases are saved here.'))
      .addText(text => text.setValue(p.settings.folder).onChange(async value => {
        p.settings.folder = value; await p.saveData(p.settings);
      }));
    new Setting(drawingSection)
      .setName(p.t('当前画板', 'Current canvas'))
      .setDesc(p.settings.file || p.t('首次呼出时自动创建。', 'Created automatically on first use.'));
  }
}
