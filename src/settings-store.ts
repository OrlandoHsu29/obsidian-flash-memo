import { readFile, writeFile, rename, unlink } from 'node:fs/promises';

function decode(text: string): Record<string, unknown> {
  const data: unknown = JSON.parse(text);
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new SyntaxError('Invalid plugin settings');
  return data as Record<string, unknown>;
}

export class SettingsStore {
  private pending: Promise<void> = Promise.resolve();

  constructor(private filename: string) {}

  async load(): Promise<{ data: Record<string, unknown> | null; recovered: boolean }> {
    await this.pending;
    let corrupt = false;
    for (const suffix of ['', '.bak', '.tmp']) {
      try {
        const data = decode(await readFile(this.filename + suffix, 'utf8'));
        if (suffix) await this.save(data);
        return { data, recovered: !!suffix };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
        if (error instanceof SyntaxError) { corrupt = true; continue; }
        throw error;
      }
    }
    if (corrupt) throw Error('Flash Memo settings are damaged and no valid backup is available.');
    return { data: null, recovered: false };
  }

  async save(data: unknown): Promise<void> {
    // Snapshot before queuing: later edits must not change an earlier save.
    const contents = JSON.stringify(data, null, 2);
    if (contents === undefined) throw Error('Invalid plugin settings');
    decode(contents);
    const task = this.pending.then(async () => {
      const temporary = this.filename + '.tmp';
      const backupTemporary = this.filename + '.bak.tmp';
      try {
        await writeFile(temporary, contents, { encoding: 'utf8', flush: true });
        let previous: string | undefined;
        try { previous = await readFile(this.filename, 'utf8'); decode(previous); }
        catch (error) {
          if (!(error instanceof SyntaxError) && (error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
          previous = undefined;
        }
        if (previous !== undefined) {
          await writeFile(backupTemporary, previous, { encoding: 'utf8', flush: true });
          await rename(backupTemporary, this.filename + '.bak');
        }
        // An interrupted temporary write never truncates the existing data.json.
        await rename(temporary, this.filename);
      } finally {
        await Promise.allSettled([unlink(temporary), unlink(backupTemporary)]);
      }
    });
    this.pending = task.catch(() => {});
    return task;
  }
}
