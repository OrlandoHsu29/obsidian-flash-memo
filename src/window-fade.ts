import { setTimeout, clearTimeout } from 'node:timers';

interface FadeWindow {
  isDestroyed(): boolean;
  getOpacity?(): number;
  setOpacity?(opacity: number): void;
}

interface FadeState {
  window: FadeWindow;
  opacity: number;
  timer?: ReturnType<typeof setTimeout>;
  finish: (completed: boolean) => void;
}

export class WindowFade {
  private state: FadeState | null = null;

  async fadeOut(window: FadeWindow): Promise<boolean> {
    this.cancel();
    if (!window.setOpacity) return true;
    if (window.isDestroyed()) return false;
    const opacity = window.getOpacity?.() ?? 1;
    return new Promise<boolean>((resolve, reject) => {
      const state: FadeState = { window, opacity, finish: resolve };
      this.state = state;
      const started = performance.now();
      const tick = () => {
        state.timer = undefined;
        if (this.state !== state) return;
        try {
          if (window.isDestroyed()) { this.state = null; resolve(false); return; }
          const progress = Math.min(1, (performance.now() - started) / 140);
          window.setOpacity!(opacity * (1 - progress));
          if (this.state !== state) return;
          if (progress === 1) { resolve(true); return; }
          state.timer = setTimeout(tick, 16);
        } catch (error) {
          this.state = null;
          try { if (!window.isDestroyed()) window.setOpacity!(opacity); } catch { /* Preserve the original error. */ }
          reject(error);
        }
      };
      tick();
    });
  }

  cancel() {
    const state = this.state;
    this.state = null;
    if (!state) return;
    if (state.timer) clearTimeout(state.timer);
    try {
      if (!state.window.isDestroyed()) state.window.setOpacity?.(state.opacity);
    } finally { state.finish(false); }
  }
}
