import { spawn, ChildProcessWithoutNullStreams } from 'node:child_process';
import { access } from 'node:fs/promises';
import { setTimeout, clearTimeout } from 'node:timers';

export interface Hotkey {
  label: string;
  modifiers: number;
  key: number;
}
const SPECIAL: Record<string, number> = {SPACE:32,TAB:9,ENTER:13,ESCAPE:27,BACKSPACE:8,DELETE:46,INSERT:45,HOME:36,END:35,PAGEUP:33,PAGEDOWN:34,LEFT:37,UP:38,RIGHT:39,DOWN:40};

export function parseHotkey(value: string): Hotkey {
  const parts = value.trim().split('+').map(part => part.trim().toUpperCase());
  const keyName = parts.pop() ?? '';
  let modifiers = 0;
  for (const part of parts) {
    const flag = ({CTRL:2,CONTROL:2,ALT:1,SHIFT:4,WIN:8,META:8} as Record<string, number>)[part];
    if (!flag || (modifiers & flag)) throw Error('invalid');
    modifiers |= flag;
  }
  let key = SPECIAL[keyName] ?? 0;
  if (/^[A-Z0-9]$/.test(keyName)) key = keyName.charCodeAt(0);
  else if (/^F([1-9]|1[0-9]|2[0-4])$/.test(keyName)) key = 111 + Number(keyName.slice(1));
  // Avoid intercepting ordinary typing, and reject the Windows-reserved F12.
  if (!key || key === 123 || !modifiers || !(modifiers & (1|2|8))) throw Error('invalid');
  const labels = [[2,'Ctrl'],[1,'Alt'],[4,'Shift'],[8,'Win']] as const;
  return { label:[...labels.filter(([flag]) => modifiers & flag).map(([,name]) => name),keyName.length === 1 || /^F\d+$/.test(keyName) ? keyName : keyName[0]+keyName.slice(1).toLowerCase()].join('+'), modifiers, key };
}

export function hotkeyFromEvent(event: Pick<KeyboardEvent, 'code'|'key'|'ctrlKey'|'altKey'|'shiftKey'|'metaKey'|'isComposing'>): Hotkey | null {
  if (/^(Control|Alt|Shift|Meta)(Left|Right)$/.test(event.code) || ['Control','Alt','Shift','Meta'].includes(event.key)) return null;
  if (event.isComposing) throw Error('invalid');
  const names: Record<string,string> = {ArrowLeft:'Left',ArrowRight:'Right',ArrowUp:'Up',ArrowDown:'Down',Space:'Space'};
  const key = /^(Key[A-Z]|Digit[0-9])$/.test(event.code) ? event.code.replace(/^(Key|Digit)/,'') : names[event.code] ?? event.code;
  return parseHotkey([...event.ctrlKey?['Ctrl']:[],...event.altKey?['Alt']:[],...event.shiftKey?['Shift']:[],...event.metaKey?['Win']:[],key].join('+'));
}

export function localHotkey(value: string): import('obsidian').Hotkey {
  const parsed = parseHotkey(value);
  const modifiers: import('obsidian').Modifier[] = [];
  for (const [flag, name] of [[2,'Ctrl'],[1,'Alt'],[4,'Shift'],[8,'Meta']] as const) {
    if (parsed.modifiers & flag) modifiers.push(name);
  }
  const names: Record<number, string> = {32:' ',33:'PageUp',34:'PageDown',35:'End',36:'Home',37:'ArrowLeft',38:'ArrowUp',39:'ArrowRight',40:'ArrowDown',9:'Tab',13:'Enter',27:'Escape',8:'Backspace',46:'Delete',45:'Insert'};
  const key = names[parsed.key] ?? (parsed.key >= 112 && parsed.key <= 135 ? `F${parsed.key - 111}` : String.fromCharCode(parsed.key));
  return {modifiers, key};
}

export type HotkeyStatus = 'off' | 'starting' | 'ready' | 'conflict' | 'invalid' | 'missing' | 'failed' | 'unsupported';

export class GlobalHotkey {
  status: HotkeyStatus = 'off';
  private child: ChildProcessWithoutNullStreams | null = null;
  private generation = 0;
  private disposed = false;
  private pendingStop: Promise<void> = Promise.resolve();

  constructor(private trigger: () => void, private changed: () => void) {}

  private update(status: HotkeyStatus) { this.status = status; this.changed(); }

  async configure(enabled: boolean, value: string, executable: string, owner: string): Promise<boolean> {
    const generation = ++this.generation;
    await this.stop();
    if (generation !== this.generation || this.disposed) return false;
    if (!enabled) { this.update('off'); return true; }
    if (process.platform !== 'win32' || process.arch !== 'x64') { this.update('unsupported'); return false; }
    let hotkey: Hotkey;
    try { hotkey = parseHotkey(value); } catch { this.update('invalid'); return false; }
    try { await access(executable); } catch { this.update('missing'); return false; }
    if (generation !== this.generation || this.disposed) return false;
    this.update('starting');
    const child = spawn(executable, [String(hotkey.modifiers),String(hotkey.key),owner], {windowsHide:true,stdio:'pipe'});
    this.child = child;
    // Nothing is sent to stdin; EOF is the native helper's graceful stop signal.
    child.stdin.on('error', () => {});
    child.stderr.resume();
    return new Promise(resolve => {
      let complete = false, ready = false, buffer = '';
      const settle = (success: boolean) => {
        if (complete) return;
        complete = true; clearTimeout(timeout); resolve(success);
      };
      const current = () => generation === this.generation && !this.disposed && this.child === child;
      const timeout = setTimeout(() => {
        if (current()) { this.update('failed'); void this.stop(); }
        settle(false);
      }, 4000);
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (chunk: string) => {
        buffer += chunk;
        if (buffer.length > 1024) { if (current()) { this.update('failed'); void this.stop(); } settle(false); return; }
        let newline: number;
        while ((newline = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0,newline).trim(); buffer = buffer.slice(newline+1);
          if (!current()) continue;
          if (line === 'READY') { ready = true; this.update('ready'); settle(true); }
          else if (line === 'HOTKEY' && ready) this.trigger();
          else if (line.startsWith('ERROR ')) {
            this.update(line === 'ERROR 1409' ? 'conflict' : 'failed'); settle(false);
          }
        }
      });
      child.once('error', () => {
        if (current()) this.update('failed'); settle(false);
      });
      child.once('close', () => {
        if (current()) { this.child = null; if (this.status === 'ready' || this.status === 'starting') this.update('failed'); }
        settle(false);
      });
    });
  }

  private stop(): Promise<void> {
    const child = this.child;
    this.child = null;
    if (!child) return this.pendingStop;
    this.pendingStop = new Promise(resolve => {
      if (child.exitCode !== null || child.signalCode !== null) { resolve(); return; }
      const timer = setTimeout(() => { child.kill(); }, 1000);
      child.once('close', () => { clearTimeout(timer); resolve(); });
      child.stdin.end();
    });
    return this.pendingStop;
  }

  dispose() {
    this.disposed = true; ++this.generation;
    void this.stop(); this.update('off');
  }
}
