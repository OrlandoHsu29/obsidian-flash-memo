// Optional adapter for dragonwocky/obsidian-tray. No tray implementation or
// Electron remote API is bundled here. These plugin interfaces are internal.
export interface TrayPlugin {
  settings: Record<string, unknown> & { runInBackground?: boolean; createTrayIcon?: boolean };
  saveSettings(): Promise<void>;
  showWindows?(): void;
}

export interface TrayPluginManager {
  plugins: Record<string, unknown>;
  manifests: Record<string, unknown>;
  disablePlugin(id: string): Promise<void>;
  enablePlugin(id: string): Promise<unknown>;
  enablePluginAndSave(id: string): Promise<unknown>;
}

export type TrayStatus = 'missing' | 'disabled' | 'unsupported' | 'ready';
export class TrayIntegration {
  private pending: Promise<void> = Promise.resolve();
  constructor(private manager: () => TrayPluginManager, private restoreMain: () => void = () => {}) {}

  plugin(): TrayPlugin | null {
    const plugin = this.manager().plugins.tray as TrayPlugin | undefined;
    if (!plugin?.settings || typeof plugin.saveSettings !== 'function') return null;
    return plugin;
  }
  status(): TrayStatus {
    const manager = this.manager();
    if (!manager.manifests.tray) return 'missing';
    if (!manager.plugins.tray) return 'disabled';
    return this.plugin() ? 'ready' : 'unsupported';
  }
  enabled(): boolean { return this.plugin()?.settings.runInBackground === true; }

  setEnabled(value: boolean): Promise<void> {
    const operation = this.pending.then(() => this.apply(value));
    this.pending = operation.catch(() => {});
    return operation;
  }
  private async apply(value: boolean) {
    const manager = this.manager(), plugin = this.plugin();
    if (!plugin) throw Error('tray-unavailable');
    const previous = {...plugin.settings};
    if (previous.runInBackground === value && (!value || previous.createTrayIcon === true)) return;
    // Tray's saveSettings only persists data. Reload via Obsidian's plugin
    // manager so its own close hooks and tray icon apply the new settings.
    plugin.settings.runInBackground = value;
    if (value) plugin.settings.createTrayIcon = true;
    try {
      await plugin.saveSettings();
      if (!value) {
        if (plugin.showWindows) plugin.showWindows(); else this.restoreMain();
      }
      await manager.disablePlugin('tray');
      await manager.enablePlugin('tray');
      if (!this.plugin() || this.enabled() !== value) throw Error('tray-reload-failed');
    } catch (error) {
      plugin.settings = previous;
      try {
        await plugin.saveSettings();
        if (manager.plugins.tray) await manager.disablePlugin('tray');
        await manager.enablePlugin('tray');
      } catch { /* Report the original failure; do not change other plugins. */ }
      throw error;
    }
  }
  async enablePlugin(): Promise<void> {
    await this.manager().enablePluginAndSave('tray');
    if (!this.plugin()) throw Error('tray-unavailable');
  }
}
