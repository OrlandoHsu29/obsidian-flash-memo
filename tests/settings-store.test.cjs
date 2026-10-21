const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {buildSync}=require('esbuild');
const Module=require('node:module');
const {spawnSync}=require('node:child_process');
const loaded=new Module('settings-store.cjs');
const compiled=buildSync({entryPoints:['src/settings-store.ts'],bundle:true,platform:'node',format:'cjs',write:false}).outputFiles[0].text;
loaded._compile(compiled,'settings-store.cjs');
const {SettingsStore}=loaded.exports;
async function fixture(t){
 const dir=await fs.mkdtemp(path.join(process.cwd(),'.settings-store-test-'));
 t.after(async()=>{
  assert.equal(path.dirname(path.resolve(dir)),process.cwd());assert.ok(path.basename(dir).startsWith('.settings-store-test-'));
  await fs.rm(dir,{recursive:true,force:true});
 });
 const file=path.join(dir,'data.json');return {dir,file,store:new SettingsStore(file)};
}

test('settings writes are serialized snapshots with a valid previous backup',async t=>{
 const {file,store}=await fixture(t),first={file:'A.excalidraw.md',hotkey:'Ctrl+Shift+Y'};
 const a=store.save(first);first.file='Mutated.excalidraw.md';const b=store.save({file:'B.excalidraw.md'});
 await Promise.all([a,b]);
 assert.equal(JSON.parse(await fs.readFile(file,'utf8')).file,'B.excalidraw.md');
 assert.deepEqual(JSON.parse(await fs.readFile(file+'.bak','utf8')),{file:'A.excalidraw.md',hotkey:'Ctrl+Shift+Y'});
 await assert.rejects(fs.stat(file+'.tmp'),{code:'ENOENT'});
});

test('failure before replacement preserves existing settings and later saves still work',async t=>{
 const {file,store}=await fixture(t);await store.save({file:'Original.excalidraw.md'});
 await fs.mkdir(file+'.bak');
 await assert.rejects(store.save({file:'New.excalidraw.md'}));
 assert.equal(JSON.parse(await fs.readFile(file,'utf8')).file,'Original.excalidraw.md');
 await fs.rmdir(file+'.bak');await store.save({file:'Retry.excalidraw.md'});
 assert.equal(JSON.parse(await fs.readFile(file,'utf8')).file,'Retry.excalidraw.md');
});

test('an empty primary settings file recovers the last valid backup and repairs the primary',async t=>{
 const {file,store}=await fixture(t),saved={file:'Kept.excalidraw.md',globalHotkey:'Ctrl+Shift+Y'};
 await fs.writeFile(file,'');await fs.writeFile(file+'.bak',JSON.stringify(saved));
 assert.deepEqual(await store.load(),{data:saved,recovered:true});
 assert.deepEqual(JSON.parse(await fs.readFile(file,'utf8')),saved);
 assert.deepEqual(JSON.parse(await fs.readFile(file+'.bak','utf8')),saved);
});

test('an interrupted temporary write cannot replace healthy settings',async t=>{
 const {file,store}=await fixture(t);await store.save({file:'Safe.excalidraw.md'});
 await fs.writeFile(file+'.tmp','{"file":');
 assert.deepEqual(await store.load(),{data:{file:'Safe.excalidraw.md'},recovered:false});
});

test('a complete interrupted temporary file can recover missing settings',async t=>{
 const {file,store}=await fixture(t),saved={file:'Recovered.excalidraw.md'};
 await fs.writeFile(file+'.tmp',JSON.stringify(saved));
 assert.deepEqual(await store.load(),{data:saved,recovered:true});
 assert.deepEqual(JSON.parse(await fs.readFile(file,'utf8')),saved);
});

test('corrupt settings without a valid recovery file are reported instead of silently reset',async t=>{
 const {file,store}=await fixture(t);await fs.writeFile(file,'');await fs.writeFile(file+'.bak','not-json');
 await assert.rejects(store.load(),/no valid backup/);assert.equal(await fs.readFile(file,'utf8'),'');
});

test('first installation without settings returns an empty initial state',async t=>{
 const {store}=await fixture(t);assert.deepEqual(await store.load(),{data:null,recovered:false});
});

test('exiting a process during an asynchronous settings save never leaves an empty primary file',async t=>{
 const {dir,file,store}=await fixture(t),modulePath=path.join(dir,'settings-store.cjs');
 await fs.writeFile(modulePath,compiled);await store.save({file:'Original.excalidraw.md'});
 for(let attempt=0;attempt<3;attempt++){
  const child=spawnSync(process.execPath,['-e',"const {SettingsStore}=require(process.argv[1]);new SettingsStore(process.argv[2]).save({file:'New.excalidraw.md',payload:'x'.repeat(4*1024*1024)});setTimeout(()=>process.exit(0),1);",modulePath,file],{windowsHide:true,timeout:10000,encoding:'utf8'});
  assert.equal(child.status,0,child.stderr||child.error?.message);
  const saved=JSON.parse(await fs.readFile(file,'utf8'));
  assert.ok(['Original.excalidraw.md','New.excalidraw.md'].includes(saved.file));
 }
});
