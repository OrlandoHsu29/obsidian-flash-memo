const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {build}=require('esbuild');
const fs=require('node:fs/promises');
const path=require('node:path');
const {spawn,execFile}=require('node:child_process');
const {promisify}=require('node:util');
let GlobalHotkey,parseHotkey,hotkeyFromEvent;
const output=path.resolve('.test-build/global-hotkey.cjs');
const helper=path.resolve('native/build/flash-memo-hotkey.exe');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(predicate){for(let i=0;i<100;i++){if(predicate())return;await wait(20);}assert.fail('Timed out waiting for helper state');}
before(async()=>{await build({entryPoints:['src/global-hotkey.ts'],bundle:true,platform:'node',format:'cjs',outfile:output});({GlobalHotkey,parseHotkey,hotkeyFromEvent}=require(output));});
after(async()=>{await fs.unlink(output);await fs.rmdir(path.dirname(output));});

test('parses combinations, normalizes names, and rejects unsafe/ambiguous input',()=>{
 assert.deepEqual(parseHotkey(' shift + control + f9 '),{label:'Ctrl+Shift+F9',modifiers:6,key:120});
 assert.equal(parseHotkey('Ctrl+Alt+Y').key,89);
 for(const invalid of ['Y','Shift+Y','Ctrl+Ctrl+Y','Ctrl+F12','Ctrl++Y','Ctrl+F25','Ctrl+Control'])assert.throws(()=>parseHotkey(invalid));
});

test('records physical key combinations independently of keyboard language and ignores modifier-only presses',()=>{
 const event={code:'KeyY',key:'任意输入法字符',ctrlKey:true,altKey:true,shiftKey:false,metaKey:false,isComposing:false};
 assert.equal(hotkeyFromEvent(event).label,'Ctrl+Alt+Y');
 assert.equal(hotkeyFromEvent({...event,code:'ShiftLeft',key:'Shift'}),null);
 assert.equal(hotkeyFromEvent({...event,code:'ArrowLeft',key:'ArrowLeft'}).label,'Ctrl+Alt+Left');
 assert.throws(()=>hotkeyFromEvent({...event,isComposing:true}));
 assert.throws(()=>hotkeyFromEvent({...event,code:'F12',key:'F12'}));
});

test('registration conflicts, rebinding, races, and dispose release only owned registrations',async()=>{
 const a=new GlobalHotkey(()=>{},()=>{}),b=new GlobalHotkey(()=>{},()=>{});
 try{
  assert.equal(await a.configure(true,'Ctrl+Alt+Shift+F10',helper,'0'),true);
  assert.equal(await b.configure(true,'Ctrl+Alt+Shift+F10',helper,'0'),false);
  assert.equal(b.status,'conflict');
  assert.equal(await a.configure(false,'Ctrl+Alt+Shift+F10',helper,'0'),true);
  assert.equal(await b.configure(true,'Ctrl+Alt+Shift+F10',helper,'0'),true);
  // Changing one controller must not release another controller's key.
  assert.equal(await a.configure(true,'Ctrl+Alt+Shift+F10',helper,'0'),false);
  assert.equal(b.status,'ready');
  await b.configure(false,'Ctrl+Alt+Shift+F10',helper,'0');
  const enable=a.configure(true,'Ctrl+Alt+Shift+F10',helper,'0');
  const disable=a.configure(false,'Ctrl+Alt+Shift+F10',helper,'0');
  await Promise.all([enable,disable]);assert.equal(a.status,'off');
  assert.equal(await b.configure(true,'Ctrl+Alt+Shift+F10',helper,'0'),true);
  b.dispose();await until(()=>b.child===null);
  // Stop waits for native exit before a new registration can be acquired.
  await b.pendingStop;
  assert.equal(await a.configure(true,'Ctrl+Alt+Shift+F10',helper,'0'),true);
  assert.equal(await a.configure(true,'Ctrl+F12',helper,'0'),false);assert.equal(a.status,'invalid');
 }finally{a.dispose();b.dispose();await Promise.all([a.pendingStop,b.pendingStop]);}
});

test('the listener exits when its parent exits and closes stdin',async()=>{
 const code=`const{spawn}=require('node:child_process');const c=spawn(${JSON.stringify(helper)},['7','121','0'],{windowsHide:true,stdio:'pipe'});c.stdout.once('data',line=>{if(line.toString().trim()!=='READY')process.exit(1);process.stdout.write(String(c.pid));process.exit(0);});`;
 const {stdout}=await promisify(execFile)(process.execPath,['-e',code],{windowsHide:true,timeout:5000});
 const pid=Number(stdout);assert.ok(pid>0);
 await until(()=>{try{process.kill(pid,0);return false;}catch{return true;}});
});
