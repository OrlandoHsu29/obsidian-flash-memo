const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Module=require('node:module');
const {buildSync}=require('esbuild');

// Expose the internal helper only in this in-memory test bundle.
const contents=fs.readFileSync('src/main.ts','utf8')+'\nexport {plainBounds};\n';
const loaded=new Module('window-bounds-test.cjs');
class Base {}
loaded.require=id=>id==='obsidian'?{Plugin:Base,PluginSettingTab:Base,Modal:Base}:require(id);
loaded._compile(buildSync({stdin:{contents,resolveDir:path.resolve('src'),loader:'ts'},bundle:true,platform:'node',format:'cjs',packages:'external',write:false}).outputFiles[0].text,'window-bounds-test.cjs');
const {plainBounds}=loaded.exports;

test('saved bounds remain serializable after the native window proxy is released',()=>{
 const rectangle={x:24,y:36,width:760,height:600};
 const {proxy,revoke}=Proxy.revocable(rectangle,{});
 const saved=plainBounds(proxy);revoke();
 assert.notEqual(saved,rectangle);assert.equal(Object.getPrototypeOf(saved),Object.prototype);
 assert.deepEqual(JSON.parse(JSON.stringify({bounds:saved})),{bounds:rectangle});
});

test('restoring an already released window proxy falls back safely',()=>{
 const {proxy,revoke}=Proxy.revocable({x:0,y:0,width:760,height:600},{});revoke();
 assert.equal(plainBounds(proxy),null);
});

test('invalid persisted window coordinates cannot reach native setBounds',()=>{
 for(const value of [null,undefined,{}, {x:0,y:0,width:NaN,height:600}, {x:Infinity,y:0,width:760,height:600}, {x:0,y:0,width:'760',height:600}]){
  assert.equal(plainBounds(value),null);
 }
});
