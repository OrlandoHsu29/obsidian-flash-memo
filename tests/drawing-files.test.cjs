const{test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const{build}=require('esbuild');
const fs=require('node:fs/promises');
const path=require('node:path');
let createDrawing,drawingFolder,availableDrawingPath,drawingFiles;
const output=path.resolve('.drawing-test-build/drawing-files.cjs');
before(async()=>{await build({entryPoints:['src/drawing-files.ts'],bundle:true,platform:'node',format:'cjs',outfile:output});({createDrawing,drawingFolder,availableDrawingPath,drawingFiles}=require(output));});
after(async()=>{await fs.unlink(output);await fs.rmdir(path.dirname(output));});
function fixture(filename='Quick sketch 1.excalidraw.md'){
 const current={path:'Inbox/'+filename},files=new Map([[current.path,current]]),data=new Map([[current,'saved original']]);
 files.set('Inbox',{children:[current]});
 const app={vault:{getAbstractFileByPath:p=>files.get(p),createFolder:async p=>{files.set(p,{children:[]});},create:async(p,content)=>{if(files.has(p))throw Error('exists');const file={path:p};files.set(p,file);data.set(file,content);return file;}},fileManager:{renameFile:async()=>assert.fail('Creating a canvas must never rename an existing drawing')}};
 return{app,current,files,data};
}
test('paths are relative to the vault and cannot escape it',()=>{
 assert.equal(drawingFolder('画板\\速记/'),'画板/速记');
 for(const invalid of ['../outside','/absolute','C:\\outside','folder/../../outside'])assert.throws(()=>drawingFolder(invalid));
});
test('new quick sketches start at 1 and skip occupied numbered paths',()=>{
 const f=fixture();
 assert.equal(availableDrawingPath(f.app,'Notes','Quick sketch','.excalidraw.md',undefined,true),'Notes/Quick sketch 1.excalidraw.md');
 f.files.set('Inbox/Quick sketch 2.excalidraw.md',{path:'Inbox/Quick sketch 2.excalidraw.md'});
 assert.equal(availableDrawingPath(f.app,'Inbox','Quick sketch','.excalidraw.md',undefined,true),'Inbox/Quick sketch 3.excalidraw.md');
 assert.equal(availableDrawingPath(f.app,'Inbox','Quick sketch','.excalidraw',undefined,true),'Inbox/Quick sketch 1.excalidraw');
});
test('canvas picker lists only suffixed drawings inside the configured folder, including older archives',()=>{
 const paths=['Flash Memo/Quick sketch 10.excalidraw.md','Flash Memo/Quick sketch 2.excalidraw.md','Flash Memo/Archive/Old.excalidraw','Flash Memo/Note.md','Flash Memos/Other.excalidraw.md','Elsewhere/Other.excalidraw.md'];
 assert.deepEqual(drawingFiles({vault:{getFiles:()=>paths.map(path=>({path}))}},'Flash Memo').map(f=>f.path),[
  'Flash Memo/Archive/Old.excalidraw','Flash Memo/Quick sketch 2.excalidraw.md','Flash Memo/Quick sketch 10.excalidraw.md'
 ]);
});
test('creating a new canvas preserves numbered, custom and previously archived names and contents',async()=>{
 for(const name of ['Quick sketch 1.excalidraw.md','会议记录.excalidraw.md','Sketch 2026-10-18 12-30-05.excalidraw.md']){
  const f=fixture(name),original=f.current.path,fresh=await createDrawing(f.app,'Inbox','blank');
  assert.equal(f.current.path,original);assert.equal(f.files.get(original),f.current);assert.equal(f.data.get(f.current),'saved original');
  assert.equal(fresh.path,name==='Quick sketch 1.excalidraw.md'?'Inbox/Quick sketch 2.excalidraw.md':'Inbox/Quick sketch 1.excalidraw.md');
  assert.equal(f.data.get(fresh),'blank');
 }
});
test('new canvas location does not move or rename the old drawing',async()=>{
 const f=fixture('Project.excalidraw.md'),fresh=await createDrawing(f.app,'Notes/New canvases','blank');
 assert.equal(f.current.path,'Inbox/Project.excalidraw.md');assert.equal(fresh.path,'Notes/New canvases/Quick sketch 1.excalidraw.md');
});
test('creation failure leaves the original drawing untouched without rollback operations',async()=>{
 const f=fixture();f.app.vault.create=async()=>{throw Error('disk-full');};
 await assert.rejects(createDrawing(f.app,'Notes','blank'),/disk-full/);
 assert.equal(f.current.path,'Inbox/Quick sketch 1.excalidraw.md');assert.equal(f.data.get(f.current),'saved original');
});
test('a file blocking the target folder leaves all existing drawings untouched',async()=>{
 const f=fixture();f.files.set('Notes',{path:'Notes'});
 await assert.rejects(createDrawing(f.app,'Notes/New canvases','blank'),/folder-is-file/);
 assert.equal(f.current.path,'Inbox/Quick sketch 1.excalidraw.md');
});
test('new canvases support the selected Excalidraw compatibility format',async()=>{
 const f=fixture(),fresh=await createDrawing(f.app,'Inbox','blank','.excalidraw');
 assert.equal(fresh.path,'Inbox/Quick sketch 1.excalidraw');assert.equal(f.current.path,'Inbox/Quick sketch 1.excalidraw.md');
});
