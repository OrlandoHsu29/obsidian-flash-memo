import type { App, TFile } from 'obsidian';

export function drawingFiles(app: App, folder: string): TFile[] {
  const prefix = drawingFolder(folder) + '/';
  return app.vault.getFiles().filter(file => file.path.startsWith(prefix) && /\.excalidraw(?:\.md)?$/i.test(file.path))
    .sort((a, b) => a.path.localeCompare(b.path, undefined, {numeric: true, sensitivity: 'base'}));
}

export function drawingFolder(value: string): string {
  const path=(value.trim() || 'Flash Memo').replace(/\\/g,'/').replace(/\/+$/,'');
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

// FileManager renames preserve Obsidian links to the archived drawing.
// If creating the new drawing fails, put the old drawing back when safe.
export async function archiveDrawing(app:App,current:TFile,folder:string,blank:string,date=new Date(),freshExtension?:'.excalidraw'|'.excalidraw.md'):Promise<{archived:TFile;fresh:TFile}> {
  const target=await ensureDrawingFolder(app,folder);
  const extension=current.path.endsWith('.excalidraw.md')?'.excalidraw.md':'.excalidraw';
  const stamp=[date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-')+' '+[date.getHours(),date.getMinutes(),date.getSeconds()].map(n=>String(n).padStart(2,'0')).join('-');
  const archivePath=availableDrawingPath(app,target,`Sketch ${stamp}`,extension);
  const freshPath=availableDrawingPath(app,target,'Quick sketch',freshExtension??extension,current,true);
  const original=current.path;
  await app.fileManager.renameFile(current,archivePath);
  try {
    const fresh=await app.vault.create(freshPath,blank);
    return {archived:current,fresh};
  } catch(error) {
    if(!app.vault.getAbstractFileByPath(original)){
      try {await app.fileManager.renameFile(current,original);}catch{/* The saved archived file remains intact. */}
    }
    throw error;
  }
}
