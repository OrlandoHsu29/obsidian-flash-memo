import type { TFile } from 'obsidian';
import { setIcon } from 'obsidian';
import { drawingName } from './drawing-name';
import { memoType } from './memo-file';

export class DrawingPicker {
  private list: HTMLDivElement | null = null;
  private doc: Document;
  private outside = (event: PointerEvent) => {
    const target = event.target as Node | null;
    if (target && !this.anchor.contains(target) && !this.list?.contains(target)) this.hide();
  };
  private resize = () => this.hide();

  constructor(private anchor: HTMLButtonElement, private files: () => TFile[],
    private current: () => string, private select: (file: TFile) => void,
    private t: (zh: string, en: string) => string) {
    this.doc = anchor.ownerDocument;
    anchor.setAttribute('aria-haspopup', 'listbox');
    anchor.setAttribute('aria-expanded', 'false');
  }

  toggle() { if (this.list) this.hide(); else this.show(); }

  show() {
    if (this.list) return;
    const list = this.doc.createElement('div');
    list.className = 'suggestion-container flash-memo-picker';
    list.id = 'flash-memo-drawing-picker';
    list.setAttribute('role', 'listbox');
    list.setAttribute('aria-label', this.t('选择速记', 'Choose memo'));
    const files = this.files();
    for (const file of files) {
      const item = list.createEl('button', {cls: 'suggestion-item flash-memo-picker-item'});
      const type = memoType(file.path);
      item.classList.add(`flash-memo-picker-${type}`);
      item.setAttribute('aria-label', `${this.t(type === 'sketch' ? '画板' : '笔记', type === 'sketch' ? 'Canvas' : 'Note')}: ${drawingName(file.path).name}`);
      item.type = 'button'; item.setAttribute('role', 'option');
      const selected = file.path === this.current();
      item.setAttribute('aria-selected', String(selected));
      const icon = item.createSpan({cls: 'flash-memo-picker-icon'});
      setIcon(icon, type === 'sketch' ? 'pencil-ruler' : 'file-pen-line');
      icon.setAttribute('aria-hidden', 'true');
      const label = item.createSpan({cls: 'flash-memo-picker-label'});
      label.createSpan({text: drawingName(file.path).name, cls: 'flash-memo-picker-name'});
      if (selected) label.createSpan({text: '✓', cls: 'flash-memo-picker-check'}).setAttribute('aria-hidden', 'true');
      item.setAttribute('data-tooltip-position', 'top');
      item.setAttribute('aria-description', file.path);
      const modified = new Date(file.stat.mtime), pad = (value: number) => String(value).padStart(2, '0');
      const timestamp = Number.isFinite(modified.getTime())
        ? `${modified.getFullYear()}-${pad(modified.getMonth() + 1)}-${pad(modified.getDate())} ${pad(modified.getHours())}:${pad(modified.getMinutes())}` : '—';
      const time = item.createEl('time', {text: timestamp, cls: 'flash-memo-picker-modified'});
      if (Number.isFinite(modified.getTime())) time.dateTime = modified.toISOString();
      time.setAttribute('aria-label', this.t(`最后修改：${timestamp}`, `Last modified: ${timestamp}`));
      item.addEventListener('click', () => { this.hide(); this.select(file); });
    }
    if (!files.length) list.createDiv({cls: 'suggestion-empty', text: this.t('此目录暂无速记', 'No memos in this folder')});
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
    this.doc.removeEventListener('pointerdown', this.outside, true);
    this.doc.defaultView?.removeEventListener('resize', this.resize);
    this.list?.remove(); this.list = null;
    this.anchor.setAttribute('aria-expanded', 'false');
    this.anchor.removeAttribute('aria-controls');
  }
}
