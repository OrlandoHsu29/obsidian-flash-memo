import type { TFile } from 'obsidian';
import { setIcon } from 'obsidian';
import { drawingName } from './drawing-name';
import { memoType } from './memo-file';

export class DrawingPicker {
  private list: HTMLDivElement | null = null;
  private tooltip: HTMLDivElement | null = null;
  private tooltipTimer: number | null = null;
  private doc: Document;
  private outside = (event: PointerEvent) => {
    const target = event.target as Node | null;
    if (target && !this.anchor.contains(target) && !this.list?.contains(target)) this.hide();
  };
  private resize = () => this.hide();

  constructor(private anchor: HTMLButtonElement, private files: () => TFile[],
    private current: () => string, private select: (file: TFile) => void,
    private absolutePath: (file: TFile) => string,
    private t: (zh: string, en: string) => string) {
    this.doc = anchor.ownerDocument;
    anchor.id = 'glimmer-memo-drawing-picker-anchor';
    anchor.setAttribute('aria-haspopup', 'listbox');
    anchor.setAttribute('aria-expanded', 'false');
  }

  toggle() { if (this.list) this.hide(); else this.show(); }

  show() {
    if (this.list) return;
    const list = this.doc.createElement('div');
    list.className = 'suggestion-container glimmer-memo-picker';
    list.id = 'glimmer-memo-drawing-picker';
    list.setAttribute('role', 'listbox');
    list.setAttribute('aria-labelledby', this.anchor.id);
    const files = this.files();
    for (const file of files) {
      const item = list.createEl('button', {cls: 'suggestion-item glimmer-memo-picker-item'});
      const type = memoType(file.path);
      item.classList.add(`glimmer-memo-picker-${type}`);
      item.type = 'button'; item.setAttribute('role', 'option');
      const selected = file.path === this.current();
      item.setAttribute('aria-selected', String(selected));
      const icon = item.createSpan({cls: 'glimmer-memo-picker-icon'});
      setIcon(icon, type === 'sketch' ? 'pencil-ruler' : 'file-pen-line');
      icon.setAttribute('aria-hidden', 'true');
      const label = item.createSpan({cls: 'glimmer-memo-picker-label'});
      label.createSpan({text: drawingName(file.path).name, cls: 'glimmer-memo-picker-name'});
      if (selected) label.createSpan({text: '✓', cls: 'glimmer-memo-picker-check'}).setAttribute('aria-hidden', 'true');
      const movePath = (x: number, y: number) => {
        if (!this.tooltip) return;
        const size = this.tooltip.getBoundingClientRect();
        const width = this.doc.documentElement.clientWidth, height = this.doc.documentElement.clientHeight;
        this.tooltip.style.left = `${Math.max(8, Math.min(x + 12, width - size.width - 8))}px`;
        this.tooltip.style.top = `${y + 18 + size.height <= height - 8 ? y + 18 : Math.max(8, y - size.height - 12)}px`;
      };
      let pointerX = 0, pointerY = 0;
      const trackPath = (event: PointerEvent) => {
        pointerX = event.clientX; pointerY = event.clientY;
        movePath(pointerX, pointerY);
      };
      const showPath = (event: PointerEvent) => {
        this.hideTooltip();
        pointerX = event.clientX; pointerY = event.clientY;
        this.tooltipTimer = this.doc.defaultView!.setTimeout(() => {
          this.tooltipTimer = null;
          const tooltip = this.doc.createElement('div');
          tooltip.className = 'glimmer-memo-path-tooltip';
          tooltip.setAttribute('role', 'tooltip');
          tooltip.textContent = this.absolutePath(file);
          this.doc.body.append(tooltip);
          this.tooltip = tooltip;
          movePath(pointerX, pointerY);
        }, 600);
      };
      item.addEventListener('pointerenter', showPath);
      item.addEventListener('pointermove', trackPath);
      item.addEventListener('pointerleave', () => this.hideTooltip());
      const modified = new Date(file.stat.mtime), pad = (value: number) => String(value).padStart(2, '0');
      const timestamp = Number.isFinite(modified.getTime())
        ? `${modified.getFullYear()}-${pad(modified.getMonth() + 1)}-${pad(modified.getDate())} ${pad(modified.getHours())}:${pad(modified.getMinutes())}` : '—';
      const time = item.createEl('time', {text: timestamp, cls: 'glimmer-memo-picker-modified'});
      if (Number.isFinite(modified.getTime())) time.dateTime = modified.toISOString();
      item.addEventListener('click', () => { this.hide(); this.select(file); });
    }
    if (!files.length) list.createDiv({cls: 'suggestion-empty', text: this.t('暂无历史记录', 'No history yet')});
    const bounds = this.anchor.getBoundingClientRect();
    const width = Math.max(0, Math.min(340, this.doc.documentElement.clientWidth - 16));
    list.style.width = `${width}px`;
    list.style.left = `${Math.max(8, Math.min(bounds.left + (bounds.width - width) / 2, this.doc.documentElement.clientWidth - width - 8))}px`;
    list.style.top = `${bounds.bottom + 4}px`;
    list.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); this.hide(); this.anchor.focus(); return; }
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault(); event.stopPropagation();
      const items = Array.from(list.querySelectorAll('button'));
      const index = items.indexOf(this.doc.activeElement as HTMLButtonElement);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1
        : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      items[next]?.focus();
    });
    list.addEventListener('scroll', () => this.hideTooltip());
    this.list = list; this.doc.body.append(list);
    this.anchor.setAttribute('aria-expanded', 'true');
    this.anchor.setAttribute('aria-controls', list.id);
    this.doc.addEventListener('pointerdown', this.outside, true);
    this.doc.defaultView?.addEventListener('resize', this.resize);
  }

  focus() {
    this.show();
    const item = this.list?.querySelector<HTMLButtonElement>('[aria-selected="true"]') ?? this.list?.querySelector<HTMLButtonElement>('button');
    item?.focus();
  }

  hide() {
    this.hideTooltip();
    this.doc.removeEventListener('pointerdown', this.outside, true);
    this.doc.defaultView?.removeEventListener('resize', this.resize);
    this.list?.remove(); this.list = null;
    this.anchor.setAttribute('aria-expanded', 'false');
    this.anchor.removeAttribute('aria-controls');
  }

  private hideTooltip() {
    if (this.tooltipTimer !== null) this.doc.defaultView?.clearTimeout(this.tooltipTimer);
    this.tooltipTimer = null;
    this.tooltip?.remove(); this.tooltip = null;
  }
}
