import type { App, TFile } from 'obsidian';

export function drawingFiles(app: App, folder: string): TFile[] {
  const prefix = drawingFolder(folder) + '/';
  return app.vault.getFiles().filter(file => file.path.startsWith(prefix) && /\.(?:md|excalidraw)$/i.test(file.path))
    .sort((a, b) => a.path.localeCompare(b.path, undefined, {numeric: true, sensitivity: 'base'}));
}

export async function createNote(app: App, folder: string): Promise<TFile> {
  const target = await ensureDrawingFolder(app, folder);
  return app.vault.create(availableDrawingPath(app, target, 'Quick note', '.md', undefined, true), '');
}

export function drawingFolder(value: string): string {
  const path=(value.trim() || 'Glimmer Memo').replace(/\\/g,'/').replace(/\/+$/,'');
  if (!path || path.startsWith('/') || path.split('/').some(part=>part==='..'||part.includes(':'))) throw Error('invalid-folder');
  return path.split('/').filter(part=>part&&part!=='.').join('/');
}

export async function ensureDrawingFolder(app: App, value: string): Promise<string> {
  const folder=drawingFolder(value), parts=folder.split('/');
  if(!folder)throw Error('invalid-folder');
  for(let i=1;i<=parts.length;i++){
    const path=parts.slice(0,i).join('/'), existing=app.vault.getAbstractFileByPath(path);
    if(existing && !('children' in existing))throw Error('folder-is-file');
    if(!existing)await app.vault.createFolder(path);
  }
  return folder;
}

export function availableDrawingPath(app:App,folder:string,stem:string,extension:string,ignore?:TFile,numbered=false):string {
  for(let n=1;;n++){
    const path=`${folder}/${stem}${n===1&&!numbered?'':` ${n}`}${extension}`;
    const existing=app.vault.getAbstractFileByPath(path);
    if(!existing||existing===ignore)return path;
  }
}

export async function createDrawing(app:App,folder:string,blank:string,extension:'.excalidraw'|'.excalidraw.md'='.excalidraw.md'):Promise<TFile> {
  const target=await ensureDrawingFolder(app,folder);
  const path=availableDrawingPath(app,target,'Quick sketch',extension,undefined,true);
  return app.vault.create(path,blank);
}
