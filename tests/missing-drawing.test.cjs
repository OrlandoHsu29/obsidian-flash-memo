const {test}=require('node:test');
const assert=require('node:assert/strict');
const {buildSync}=require('esbuild');
const Module=require('node:module');
class Base {}
class FakeModal {
 constructor(){this.scope={register(){}};this.contentEl={empty(){}};this.opens=0;}
 open(){this.opens++;}
 close(){this.onClose?.();}
}
const loaded=new Module('flash-memo-test.cjs');
loaded.require=id=>id==='obsidian'?{Plugin:Base,PluginSettingTab:Base,Modal:FakeModal}:require(id);
loaded._compile(buildSync({entryPoints:['src/main.ts'],bundle:true,platform:'node',format:'cjs',packages:'external',write:false}).outputFiles[0].text,'flash-memo-test.cjs');
const FlashMemo=loaded.exports.default;

function fixture(){
 const p=new FlashMemo(),old={path:'Flash Memo/Original.excalidraw.md'},files=new Map([[old.path,old],['Flash Memo',{children:[]}]]);
 const disk=new Set([old.path]);let creates=0,shows=0,hides=0,opens=0;
 const native={isDestroyed:()=>false,isFocused:()=>false,setAlwaysOnTop(){},hide(){hides++;}};
 const leaf={id:'test-leaf',view:{file:old},async setViewState(state){this.view={file:files.get(state.state.file)};},detach(){}};
 p.app={vault:{adapter:{exists:async path=>disk.has(path)},getFileByPath:path=>files.get(path),getAbstractFileByPath:path=>files.get(path),async create(path){creates++;const file={path};files.set(path,file);disk.add(path);return file;}},workspace:{getLeaf(){opens++;return leaf;}}};
 p.settings.file=old.path;p.leaf=leaf;p.native=native;p.hidden=true;
 p.t=(_zh,en)=>en;
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
test('canvas switching saves the source before opening and persisting the target',async()=>{
 const f=fixture();f.p.hidden=false;const target={path:'Flash Memo/Other.excalidraw.md'};
 f.files.set(target.path,target);f.disk.add(target.path);const order=[];
 f.leaf.view.forceSave=async()=>{order.push('save');};
 const setViewState=f.leaf.setViewState.bind(f.leaf);
 f.leaf.setViewState=async state=>{order.push('switch');await setViewState(state);};
 f.p.saveData=async settings=>{order.push('persist');assert.equal(settings.file,target.path);};
 await f.p.switchDrawing(target);
 assert.deepEqual(order,['save','switch','persist']);assert.equal(f.p.settings.file,target.path);
 assert.equal(f.leaf.view.file,target);assert.equal(f.p.switching,false);
});
test('failed source save aborts switching and preserves the source drawing',async()=>{
 const f=fixture();f.p.hidden=false;const target={path:'Flash Memo/Other.excalidraw.md'};
 f.files.set(target.path,target);f.disk.add(target.path);let reports=0;
 f.p.report=()=>{reports++;};f.leaf.view.forceSave=async()=>{throw Error('Disk full');};
 await f.p.switchDrawing(target);
 assert.equal(f.p.settings.file,f.old.path);assert.equal(f.leaf.view.file,f.old);
 assert.equal(reports,1);assert.equal(f.p.switching,false);
});
test('target deleted during source save cannot be opened',async()=>{
 const f=fixture();f.p.hidden=false;const target={path:'Flash Memo/Other.excalidraw.md'};
 f.files.set(target.path,target);f.disk.add(target.path);let reports=0;
 f.p.report=()=>{reports++;};f.leaf.view.forceSave=async()=>{f.files.delete(target.path);f.disk.delete(target.path);};
 await f.p.switchDrawing(target);
 assert.equal(f.p.settings.file,f.old.path);assert.equal(f.leaf.view.file,f.old);assert.equal(reports,1);
});
test('failed target view restores the source and keeps its persisted path',async()=>{
 const f=fixture();f.p.hidden=false;const target={path:'Flash Memo/Other.excalidraw.md'};
 f.files.set(target.path,target);f.disk.add(target.path);f.p.report=()=>{};
 f.leaf.view.forceSave=async()=>{};
 const setViewState=f.leaf.setViewState.bind(f.leaf);
 f.leaf.setViewState=async state=>{if(state.state.file===target.path)throw Error('View failed');await setViewState(state);};
 await f.p.switchDrawing(target);
 assert.equal(f.p.settings.file,f.old.path);assert.equal(f.leaf.view.file,f.old);assert.equal(f.p.switching,false);
});
test('deleting source during a switch keeps the window hidden without reporting a stale save error',async()=>{
 const f=fixture();f.p.hidden=false;const target={path:'Flash Memo/Other.excalidraw.md'};
 f.files.set(target.path,target);f.disk.add(target.path);let reports=0;
 f.p.report=()=>{reports++;};f.leaf.view.forceSave=async()=>{
  f.files.delete(f.old.path);f.disk.delete(f.old.path);f.p.onDrawingDeleted(f.old.path);throw Error('ENOENT');
 };
 await f.p.switchDrawing(target);
 assert.equal(f.p.hidden,true);assert.equal(reports,0);assert.equal(f.p.switching,false);assert.equal(f.p.settings.file,f.old.path);
});
test('canvas errors open one confirmation dialog and keep the window until confirmed',t=>{
 t.mock.method(console,'error',()=>{});
 const f=fixture();f.p.report(Error('Save failed'),true);const dialog=f.p.errorDialog;
 assert.ok(dialog);assert.equal(dialog.opens,1);assert.equal(f.p.leaf,f.leaf);
 f.p.report(Error('Second failure'),true);assert.equal(f.p.errorDialog,dialog);assert.equal(dialog.opens,1);
});
test('confirming a canvas error closes without saving and keeps the drawing file',t=>{
 t.mock.method(console,'error',()=>{});
 const f=fixture();let saves=0,destroys=0,detaches=0;
 f.leaf.view.forceSave=async()=>{saves++;throw Error('Save remains broken');};
 f.p.native.destroy=()=>{destroys++;};f.leaf.detach=()=>{detaches++;};
 f.p.report(Error('Save failed'),true);f.p.errorDialog.finished(true);
 assert.equal(saves,0);assert.equal(destroys,1);assert.equal(detaches,1);
 assert.equal(f.p.leaf,null);assert.equal(f.p.native,null);assert.equal(f.p.settings.leafId,'');
 assert.equal(f.p.settings.file,f.old.path);assert.equal(f.files.get(f.old.path),f.old);
});
test('dismissing an error dialog leaves the drawing available and allows another prompt',t=>{
 t.mock.method(console,'error',()=>{});
 const f=fixture();f.p.report(Error('Save failed'),true);const dialog=f.p.errorDialog;
 dialog.close();assert.equal(f.p.errorDialog,null);assert.equal(f.p.leaf,f.leaf);
 f.p.report(Error('Retry failed'),true);assert.notEqual(f.p.errorDialog,dialog);
});
test('an open recovery dialog blocks further hide/save attempts',async t=>{
 t.mock.method(console,'error',()=>{});
 const f=fixture();let saves=0;f.leaf.view.forceSave=async()=>{saves++;};
 f.p.report(Error('Save failed'),true);
 await FlashMemo.prototype.hide.call(f.p,'close');
 assert.equal(saves,0);assert.equal(f.p.hidden,false);assert.ok(f.p.errorDialog);
});
test('recovery releases plugin state even if window and leaf cleanup throw',t=>{
 t.mock.method(console,'error',()=>{});
 const f=fixture();f.p.native.destroy=()=>{throw Error('Destroy failed');};
 f.leaf.detach=()=>{throw Error('Detach failed');};
 f.p.closeFailedWindow();
 assert.equal(f.p.leaf,null);assert.equal(f.p.native,null);assert.equal(f.p.errorClosing,false);assert.equal(f.p.settings.file,f.old.path);
});
test('reset removes the error dialog without confirming or destroying a window',t=>{
 t.mock.method(console,'error',()=>{});
 const f=fixture();let destroys=0;f.p.native.destroy=()=>{destroys++;};
 f.p.report(Error('Save failed'),true);f.p.reset();
 assert.equal(f.p.errorDialog,null);assert.equal(destroys,0);
});
test('window action boundary catches synchronous and asynchronous UI failures',async t=>{
 t.mock.method(console,'error',()=>{});
 const f=fixture();f.p.runWindowAction(()=>{throw Error('Synchronous UI failure');});
 assert.ok(f.p.errorDialog);f.p.errorDialog.close();
 f.p.runWindowAction(async()=>{throw Error('Asynchronous UI failure');});
 await new Promise(resolve=>setImmediate(resolve));assert.ok(f.p.errorDialog);
});
test('recovery releases the workspace leaf before native destruction for tray bookkeeping',()=>{
 const f=fixture(),order=[];f.leaf.detach=()=>{order.push('leaf');};f.p.native.destroy=()=>{order.push('native');};
 f.p.closeFailedWindow();assert.deepEqual(order,['leaf','native']);
});
test('duplicate hide requests share the pending save',async()=>{
 const f=fixture();f.p.hidden=false;let finish,saves=0;
 f.leaf.view.forceSave=()=>{saves++;return new Promise(resolve=>{finish=resolve;});};
 const first=FlashMemo.prototype.hide.call(f.p,'close');while(!finish)await Promise.resolve();
 await FlashMemo.prototype.hide.call(f.p,'close');assert.equal(saves,1);finish();await first;assert.equal(f.p.hidden,true);
});
test('global-off mode registers one local shortcut and cleans it up for recording or global mode',()=>{
 const f=fixture(),active=new Set();let triggers=0;
 f.p.app.scope={register(modifiers,key,func){const handler={modifiers,key,func};active.add(handler);return handler;},unregister(handler){active.delete(handler);}};
 f.p.triggerToggle=()=>{triggers++;};f.p.settings.globalHotkeyEnabled=false;f.p.settings.globalHotkey='Ctrl+Shift+Y';
 f.p.configureLocalHotkey();assert.equal(active.size,1);
 const handler=[...active][0];assert.equal(handler.key,'Y');handler.func({repeat:false});handler.func({repeat:true});assert.equal(triggers,1);
 f.p.configureLocalHotkey();assert.equal(active.size,1);
 f.p.recording=true;f.p.configureLocalHotkey();assert.equal(active.size,0);
 f.p.recording=false;f.p.configureLocalHotkey();assert.equal(active.size,1);
 f.p.settings.globalHotkeyEnabled=true;f.p.configureLocalHotkey();assert.equal(active.size,0);
 f.p.settings.globalHotkeyEnabled=false;f.p.disposed=true;f.p.configureLocalHotkey();assert.equal(active.size,0);
});

test('exit stays above the activated app through saving and fade, then releases topmost after hiding',async()=>{
 const f=fixture(),order=[];f.p.hidden=false;
 f.p.native.setAlwaysOnTop=value=>order.push(value?'topmost':'normal');
 f.p.native.focus=()=>assert.fail('Hiding must not steal focus');
 f.leaf.view.forceSave=async()=>{assert.equal(f.p.hideLayerHeld,true);order.push('save');};
 f.p.windowFade.fadeOut=async()=>{assert.equal(f.p.hideLayerHeld,true);order.push('fade');return true;};
 f.p.native.hide=()=>order.push('hide');
 await FlashMemo.prototype.hide.call(f.p,'blur');
 assert.deepEqual(order,['topmost','save','fade','hide','normal']);
 assert.equal(f.p.settings.pinned,false);assert.equal(f.p.hideLayerHeld,false);
});

test('save failure releases temporary topmost and keeps the drawing available',async()=>{
 const f=fixture(),layers=[];f.p.hidden=false;f.p.report=()=>{};
 f.p.native.setAlwaysOnTop=value=>layers.push(value);
 f.leaf.view.forceSave=async()=>{throw Error('Disk full');};
 await FlashMemo.prototype.hide.call(f.p,'blur');
 assert.deepEqual(layers,[true,false]);assert.equal(f.p.hidden,false);assert.equal(f.p.hideLayerHeld,false);
});

test('reopening during save cancels hiding without dropping the layer needed for the next blur',async()=>{
 const f=fixture(),layers=[];f.p.hidden=false;let finish;
 f.p.native.setAlwaysOnTop=value=>layers.push(value);f.p.native.show=()=>{};f.p.native.focus=()=>{};
 f.leaf.view.forceSave=()=>new Promise(resolve=>{finish=resolve;});
 const hiding=FlashMemo.prototype.hide.call(f.p,'blur');while(!finish)await Promise.resolve();
 FlashMemo.prototype.show.call(f.p);finish();await hiding;
 assert.deepEqual(layers,[true]);assert.equal(f.p.hidden,false);assert.equal(f.counts().hides,0);assert.equal(f.p.settings.pinned,false);
});

test('hiding a pinned drawing preserves the permanent pin setting and native layer',async()=>{
 const f=fixture();f.p.hidden=false;f.p.settings.pinned=true;
 f.p.native.setAlwaysOnTop=()=>assert.fail('Permanent pin must not be changed');
 f.leaf.view.forceSave=async()=>{};f.p.windowFade.fadeOut=async()=>true;
 await FlashMemo.prototype.hide.call(f.p,'close');
 assert.equal(f.p.hidden,true);assert.equal(f.p.settings.pinned,true);
});

test('auto-hide is prepared before showing and does not raise the window again during exit',async()=>{
 const f=fixture(),order=[];
 f.p.native.setAlwaysOnTop=value=>order.push(value?'topmost':'normal');
 f.p.native.show=()=>order.push('show');f.p.native.focus=()=>order.push('focus');
 FlashMemo.prototype.show.call(f.p);
 f.leaf.view.forceSave=async()=>order.push('save');
 f.p.windowFade.fadeOut=async()=>{order.push('fade');return true;};
 f.p.native.hide=()=>order.push('hide');
 await FlashMemo.prototype.hide.call(f.p,'blur');
 assert.deepEqual(order,['topmost','show','focus','save','fade','hide','normal']);
 assert.equal(f.p.settings.pinned,false);
});

test('disabling auto-hide releases the prepared layer and enabling it prepares a focused window',async()=>{
 const f=fixture(),layers=[];f.p.hidden=false;
 f.p.native.setAlwaysOnTop=value=>layers.push(value);f.p.native.isFocused=()=>true;
 f.p.prepareHideLayer();await f.p.setHideOnBlur(false);
 assert.deepEqual(layers,[true,false]);assert.equal(f.p.hideLayerHeld,false);
 await f.p.setHideOnBlur(true);assert.deepEqual(layers,[true,false,true]);assert.equal(f.p.settings.pinned,false);
 f.p.reset();assert.deepEqual(layers,[true,false,true,false]);
});

test('showing with auto-hide disabled does not prepare a temporary topmost layer',()=>{
 const f=fixture();f.p.settings.hideOnBlur=false;
 f.p.native.setAlwaysOnTop=()=>assert.fail('Auto-hide is disabled');f.p.native.show=()=>{};f.p.native.focus=()=>{};
 FlashMemo.prototype.show.call(f.p);assert.equal(f.p.hideLayerHeld,false);
});
