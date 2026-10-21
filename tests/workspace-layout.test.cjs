const {test}=require('node:test');
const assert=require('node:assert/strict');
const {buildSync}=require('esbuild');
const Module=require('node:module');
const loaded=new Module('workspace-layout.cjs');
loaded._compile(buildSync({entryPoints:['src/workspace-layout.ts'],bundle:true,platform:'node',format:'cjs',write:false}).outputFiles[0].text,'workspace-layout.cjs');
const {withoutMemoPopout}=loaded.exports;
const leaf=id=>({id,type:'leaf',state:{type:'excalidraw',state:{file:'Same.excalidraw.md'}}});
const popout=(...ids)=>({id:'window-'+ids.join('-'),type:'window',x:42,children:[{type:'tabs',children:ids.map(leaf)}]});

test('only the owned dedicated window is removed without changing the live layout',()=>{
 const layout={main:{children:[leaf('main')]},floating:{id:'float',children:[popout('memo'),popout('other')]},active:'other'},before=JSON.stringify(layout);
 const saved=withoutMemoPopout(layout,'memo');
 assert.deepEqual(saved.floating.children,[layout.floating.children[1]]);assert.equal(saved.active,'other');
 assert.equal(JSON.stringify(layout),before);assert.equal(saved.main,layout.main);
});
test('no floating window container or stale active ID is saved when the memo is the sole popout',()=>{
 const layout={main:{children:[leaf('main')]},floating:{children:[popout('memo')]},active:'memo'};
 const saved=withoutMemoPopout(layout,'memo');assert.equal(saved.floating,undefined);assert.equal(saved.active,'main');
});
test('shared popouts and main-window drawings remain intact even when paths match',()=>{
 const layout={main:{children:[leaf('memo')]},floating:{children:[popout('memo','user-tab'),popout('other')]}};
 assert.equal(withoutMemoPopout(layout,'memo'),layout);
});
test('unknown and missing ownership IDs never filter arbitrary windows',()=>{
 const layout={floating:{children:[popout('other')]}};
 assert.equal(withoutMemoPopout(layout,''),layout);assert.equal(withoutMemoPopout(layout,'missing'),layout);
});
test('layouts with missing or unrecognized floating structures are preserved',()=>{
 for(const layout of [{},{floating:null},{floating:{children:'unknown'}},{floating:{children:[null,{type:'unexpected'}]}}])assert.equal(withoutMemoPopout(layout,'memo'),layout);
});
