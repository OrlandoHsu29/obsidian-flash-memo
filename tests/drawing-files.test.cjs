const{test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const{build}=require('esbuild');
const fs=require('node:fs/promises');
const path=require('node:path');
let archiveDrawing,drawingFolder,availableDrawingPath;
const output=path.resolve('.archive-test-build/drawing-files.cjs');
before(async()=>{await build({entryPoints:['src/drawing-files.ts'],bundle:true,platform:'node',format:'cjs',outfile:output});({archiveDrawing,drawingFolder,availableDrawingPath}=require(output));});
after(async()=>{await fs.unlink(output);await fs.rmdir(path.dirname(output));});
function fixture(){
 const current={path:'Inbox/Quick sketch.excalidraw.md'},files=new Map([[current.path,current]]),data=new Map([[current,'saved original']]);
 files.set('Inbox',{children:[current]});
 const app={vault:{getAbstractFileByPath:p=>files.get(p),createFolder:async p=>{files.set(p,{children:[]});},create:async(p,content)=>{if(files.has(p))throw Error('exists');const file={path:p};files.set(p,file);data.set(file,content);return file;}},fileManager:{renameFile:async(file,p)=>{assert.ok(!files.has(p));files.delete(file.path);file.path=p;files.set(p,file);}}};
 return{app,current,files,data};
}
test('paths are relative to the vault and cannot escape it',()=>{
 assert.equal(drawingFolder('画板\\速记/'),'画板/速记');
 for(const invalid of ['../outside','/absolute','C:\\outside','folder/../../outside'])assert.throws(()=>drawingFolder(invalid));
});
test('new quick sketches start at 1 and skip occupied numbered paths',()=>{
 const f=fixture();
 assert.equal(availableDrawingPath(f.app,'Inbox','Quick sketch','.excalidraw.md',undefined,true),'Inbox/Quick sketch 1.excalidraw.md');
 for(const n of [1,2])f.files.set(`Inbox/Quick sketch ${n}.excalidraw.md`,{path:`Inbox/Quick sketch ${n}.excalidraw.md`});
 assert.equal(availableDrawingPath(f.app,'Inbox','Quick sketch','.excalidraw.md',undefined,true),'Inbox/Quick sketch 3.excalidraw.md');
 assert.equal(availableDrawingPath(f.app,'Inbox','Quick sketch','.excalidraw',undefined,true),'Inbox/Quick sketch 1.excalidraw');
});
test('archives the saved original and creates a blank drawing without overwriting colliding names',async()=>{
 const f=fixture(),date=new Date(2026,9,18,12,30,5);
 const collision={path:'Notes/Sketch 2026-10-18 12-30-05.excalidraw.md'};f.files.set(collision.path,collision);
 const result=await archiveDrawing(f.app,f.current,'Notes','blank',date);
 assert.equal(result.archived,f.current);assert.equal(result.archived.path,'Notes/Sketch 2026-10-18 12-30-05 2.excalidraw.md');
 assert.equal(result.fresh.path,'Notes/Quick sketch 1.excalidraw.md');assert.equal(f.data.get(result.archived),'saved original');assert.equal(f.data.get(result.fresh),'blank');assert.equal(f.files.get(collision.path),collision);
});
test('creation failure restores the original name and retains its contents',async()=>{
 const f=fixture();f.app.vault.create=async()=>{throw Error('disk-full');};
 await assert.rejects(archiveDrawing(f.app,f.current,'Archive','blank'),/disk-full/);
 assert.equal(f.current.path,'Inbox/Quick sketch.excalidraw.md');assert.equal(f.data.get(f.current),'saved original');
});
test('a file blocking the target folder causes no move or creation',async()=>{
 const f=fixture();f.files.set('Archive',{path:'Archive'});
 await assert.rejects(archiveDrawing(f.app,f.current,'Archive/Sketches','blank'),/folder-is-file/);
 assert.equal(f.current.path,'Inbox/Quick sketch.excalidraw.md');
});
