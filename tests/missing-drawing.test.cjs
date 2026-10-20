const {test}=require('node:test');
const assert=require('node:assert/strict');
const {buildSync}=require('esbuild');
const Module=require('node:module');
class Base {}
const loaded=new Module('flash-memo-test.cjs');
loaded.require=id=>id==='obsidian'?{Plugin:Base,PluginSettingTab:Base,Modal:Base}:require(id);
loaded._compile(buildSync({entryPoints:['src/main.ts'],bundle:true,platform:'node',format:'cjs',packages:'external',write:false}).outputFiles[0].text,'flash-memo-test.cjs');
const FlashMemo=loaded.exports.default;

function fixture(){
 const p=new FlashMemo(),old={path:'Flash Memo/Original.excalidraw.md'},files=new Map([[old.path,old],['Flash Memo',{children:[]}]]);
 const disk=new Set([old.path]);let creates=0,shows=0,hides=0,opens=0;
 const native={isDestroyed:()=>false,isFocused:()=>false,hide(){hides++;}};
 const leaf={id:'test-leaf',view:{file:old},async setViewState(state){this.view={file:files.get(state.state.file)};},detach(){}};
 p.app={vault:{adapter:{exists:async path=>disk.has(path)},getFileByPath:path=>files.get(path),getAbstractFileByPath:path=>files.get(path),async create(path){creates++;const file={path};files.set(path,file);disk.add(path);return file;}},workspace:{getLeaf(){opens++;return leaf;}}};
 p.settings.file=old.path;p.leaf=leaf;p.native=native;p.hidden=true;
 p.drawingPlugin=()=>({getBlankDrawing:async()=> 'blank'});
 p.saveData=async()=>{};p.keepRendererAwake=()=>{};p.restoreThrottling=()=>{};p.updateName=()=>{};
 p.show=()=>{shows++;p.hidden=false;};p.hide=async()=>{hides++;p.hidden=true;};
 p.attach=async value=>{p.leaf=value;p.native=native;};
 return {p,old,files,disk,leaf,counts:()=>({creates,shows,hides,opens})};
}

test('deleted drawing is recreated and replaces the empty view in the surviving popout',async()=>{
 const f=fixture();f.disk.delete(f.old.path);f.files.delete(f.old.path);f.leaf.view={};
 await f.p.toggle();
 assert.equal(f.p.settings.file,'Flash Memo/Quick sketch 1.excalidraw.md');
 assert.equal(f.leaf.view.file.path,f.p.settings.file);
 assert.deepEqual(f.counts(),{creates:1,shows:1,hides:0,opens:0});
});
test('physical deletion is detected even before the vault file cache catches up',async()=>{
 const f=fixture();f.disk.delete(f.old.path);
 await f.p.toggle();
 assert.notEqual(f.leaf.view.file,f.old);assert.equal(f.counts().creates,1);
});
test('missing file also recovers when the old popout was closed',async()=>{
 const f=fixture();f.disk.delete(f.old.path);f.files.delete(f.old.path);f.p.leaf=null;f.p.native=null;
 await f.p.toggle();
 assert.equal(f.p.settings.file,'Flash Memo/Quick sketch 1.excalidraw.md');
 assert.equal(f.counts().opens,1);assert.equal(f.p.opening,false);
});
test('existing drawings retain their path and normal show/hide toggle behavior',async()=>{
 const f=fixture();await f.p.toggle();await f.p.toggle();
 assert.equal(f.p.settings.file,f.old.path);assert.deepEqual(f.counts(),{creates:0,shows:1,hides:1,opens:0});
});
test('concurrent toggles create only one replacement drawing',async()=>{
 const f=fixture();f.disk.delete(f.old.path);let release;
 f.p.drawingPlugin=()=>({getBlankDrawing:()=>new Promise(resolve=>{release=resolve;})});
 const opening=f.p.toggle();while(!release)await Promise.resolve();
 await f.p.toggle();release('blank');await opening;
 assert.equal(f.counts().creates,1);assert.equal(f.p.opening,false);
});
test('storage errors preserve the original window and file setting',async()=>{
 const f=fixture();f.p.app.vault.adapter.exists=async()=>{throw Error('permission denied');};
 await assert.rejects(f.p.toggle(),/permission denied/);
 assert.equal(f.p.settings.file,f.old.path);assert.equal(f.p.leaf,f.leaf);
 assert.equal(f.counts().creates,0);assert.equal(f.p.opening,false);
});
test('deleting the displayed drawing hides immediately even when pinned and blur hiding is off',()=>{
 const f=fixture();f.p.hidden=false;f.p.settings.pinned=true;f.p.settings.hideOnBlur=false;
 f.files.delete(f.old.path);f.disk.delete(f.old.path);
 f.leaf.view.forceSave=()=>{throw Error('Must not save a deleted file');};
 f.p.onDrawingDeleted(f.old.path);
 assert.equal(f.p.hidden,true);assert.equal(f.counts().hides,1);assert.equal(f.p.settings.file,f.old.path);
});
test('delete events for unrelated files or an already replaced file do not hide the canvas',()=>{
 const f=fixture();f.p.hidden=false;
 f.p.onDrawingDeleted('Other.excalidraw.md');f.p.onDrawingDeleted(f.old.path);
 assert.equal(f.p.hidden,false);assert.equal(f.counts().hides,0);
});
test('hiding after physical deletion skips saving before the delete event arrives',async()=>{
 const f=fixture();f.p.hidden=false;f.disk.delete(f.old.path);
 f.leaf.view.forceSave=()=>{throw Error('Must not save a deleted file');};
 await FlashMemo.prototype.hide.call(f.p,'close');
 assert.equal(f.p.hidden,true);assert.equal(f.counts().hides,1);
});
test('deletion during a pending save cancels the stale error and closes the canvas',async()=>{
 const f=fixture();f.p.hidden=false;let rejectSave,reports=0;f.p.report=()=>{reports++;};
 f.leaf.view.forceSave=()=>new Promise((_,reject)=>{rejectSave=reject;});
 const hiding=FlashMemo.prototype.hide.call(f.p,'close');
 while(!rejectSave)await Promise.resolve();
 f.files.delete(f.old.path);f.disk.delete(f.old.path);f.p.onDrawingDeleted(f.old.path);
 rejectSave(Error('ENOENT'));await hiding;
 assert.equal(f.p.hidden,true);assert.equal(f.p.hiding,false);assert.equal(reports,0);
});
test('save errors for an existing drawing still keep the window available',async()=>{
 const f=fixture();f.p.hidden=false;let reports=0;f.p.report=()=>{reports++;};
 f.leaf.view.forceSave=async()=>{throw Error('Disk full');};
 await FlashMemo.prototype.hide.call(f.p,'close');
 assert.equal(f.p.hidden,false);assert.equal(f.counts().hides,0);assert.equal(reports,1);
});
