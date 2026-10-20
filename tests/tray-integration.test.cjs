const {test}=require('node:test');
const assert=require('node:assert/strict');
const {buildSync}=require('esbuild');
const Module=require('node:module');
const loaded=new Module('tray-integration.cjs');
loaded._compile(buildSync({entryPoints:['src/tray-integration.ts'],bundle:true,platform:'node',format:'cjs',write:false}).outputFiles[0].text,'tray-integration.cjs');
const {TrayIntegration}=loaded.exports;
function fixture(){
 const calls=[],initial={runInBackground:false,createTrayIcon:false,launchOnStartup:false,quickNoteHotkey:'Ctrl+Q',other:'keep'};
 let stored={...initial};
 const make=()=>({settings:{...stored},saveSettings:async function(){calls.push('save');stored={...this.settings};},showWindows(){calls.push('show');},hideWindows(){},getWindows(){return[];}});
 const manager={manifests:{tray:{}},plugins:{tray:make()},async disablePlugin(id){assert.equal(id,'tray');calls.push('disable');delete this.plugins.tray;},async enablePlugin(id){assert.equal(id,'tray');calls.push('enable');this.plugins.tray=make();},async enablePluginAndSave(id){assert.equal(id,'tray');calls.push('enable-persist');this.plugins.tray=make();}};
 return{integration:new TrayIntegration(()=>manager),manager,calls,initial,getStored:()=>stored};
}
test('tray integration distinguishes missing, disabled and incompatible installations',()=>{
 const f=fixture();assert.equal(f.integration.status(),'ready');
 delete f.manager.plugins.tray;assert.equal(f.integration.status(),'disabled');
 f.manager.plugins.tray={settings:{}};assert.equal(f.integration.status(),'unsupported');
 delete f.manager.manifests.tray;assert.equal(f.integration.status(),'missing');
});
test('enabling close-to-tray persists background mode and a recovery icon without changing other preferences',async()=>{
 const f=fixture();await f.integration.setEnabled(true);
 assert.deepEqual(f.calls,['save','disable','enable']);assert.equal(f.integration.enabled(),true);
 assert.deepEqual(f.getStored(),{...f.initial,runInBackground:true,createTrayIcon:true});
});
test('disabling close-to-tray restores access to the application and preserves other tray settings',async()=>{
 const f=fixture();await f.integration.setEnabled(true);f.calls.length=0;
 await f.integration.setEnabled(false);
 assert.deepEqual(f.calls,['save','show','disable','enable']);assert.equal(f.integration.enabled(),false);
 assert.equal(f.getStored().createTrayIcon,true);assert.equal(f.getStored().quickNoteHotkey,'Ctrl+Q');
});
test('rapid setting changes reload Tray serially',async()=>{
 const f=fixture();await Promise.all([f.integration.setEnabled(true),f.integration.setEnabled(false),f.integration.setEnabled(true)]);
 assert.equal(f.integration.enabled(),true);
 assert.deepEqual(f.calls,['save','disable','enable','save','show','disable','enable','save','disable','enable']);
});
test('failed plugin reload restores the previous Tray preferences',async()=>{
 const f=fixture();const enable=f.manager.enablePlugin.bind(f.manager);let failures=1;
 f.manager.enablePlugin=async id=>{if(failures-- >0)throw Error('load failed');return enable(id);};
 await assert.rejects(f.integration.setEnabled(true),/load failed/);
 assert.deepEqual(f.getStored(),f.initial);assert.equal(f.integration.enabled(),false);
});
test('failed settings save rolls back the in-memory preference',async()=>{
 const f=fixture(),plugin=f.manager.plugins.tray,save=plugin.saveSettings;let failures=1;
 plugin.saveSettings=async function(){if(failures-- >0)throw Error('write failed');return save.call(this);};
 await assert.rejects(f.integration.setEnabled(true),/write failed/);
 assert.deepEqual(f.getStored(),f.initial);assert.equal(f.integration.enabled(),false);
});
test('disabled Tray can be enabled explicitly without changing its preferences',async()=>{
 const f=fixture();delete f.manager.plugins.tray;
 await f.integration.enablePlugin();assert.equal(f.integration.status(),'ready');assert.equal(f.integration.enabled(),false);
 assert.deepEqual(f.calls,['enable-persist']);
});
test('released Tray versions without exported window helpers are supported',async()=>{
 const f=fixture();delete f.manager.plugins.tray.showWindows;let restores=0;
 const integration=new TrayIntegration(()=>f.manager,()=>{restores++;});
 f.manager.plugins.tray.settings.runInBackground=true;
 await integration.setEnabled(false);assert.equal(restores,1);assert.equal(integration.enabled(),false);
});
