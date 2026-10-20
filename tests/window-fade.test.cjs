const {test}=require('node:test');
const assert=require('node:assert/strict');
const {buildSync}=require('esbuild');
const Module=require('node:module');
const loaded=new Module('window-fade.cjs');
loaded._compile(buildSync({entryPoints:['src/window-fade.ts'],bundle:true,platform:'node',format:'cjs',write:false}).outputFiles[0].text,'window-fade.cjs');
const {WindowFade}=loaded.exports;
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function fixture(opacity=1){
 const writes=[];let destroyed=false;
 return {writes,window:{isDestroyed:()=>destroyed,getOpacity:()=>opacity,setOpacity(value){opacity=value;writes.push(value);}},destroy(){destroyed=true;}};
}

test('fade uses intermediate opacity values and restores original opacity on reopen',async t=>{
 const fade=new WindowFade(),f=fixture(0.8);t.after(()=>fade.cancel());
 assert.equal(await fade.fadeOut(f.window),true);
 assert.ok(f.writes.some(value=>value>0&&value<0.8));assert.equal(f.window.getOpacity(),0);
 for(let n=1;n<f.writes.length;n++)assert.ok(f.writes[n]<=f.writes[n-1]);
 fade.cancel();assert.equal(f.window.getOpacity(),0.8);
});
test('cancel restores visibility, settles the pending hide and clears its timer',async()=>{
 const fade=new WindowFade(),f=fixture();const pending=fade.fadeOut(f.window);await wait(25);fade.cancel();
 assert.equal(await pending,false);assert.equal(f.window.getOpacity(),1);
 const count=f.writes.length;await wait(50);assert.equal(f.writes.length,count);
});
test('a new fade cancels the old one without losing original opacity',async t=>{
 const fade=new WindowFade(),f=fixture(0.75);t.after(()=>fade.cancel());
 const first=fade.fadeOut(f.window);await wait(25);const second=fade.fadeOut(f.window);
 assert.equal(await first,false);assert.equal(await second,true);fade.cancel();assert.equal(f.window.getOpacity(),0.75);
});
test('destroyed windows cancel further opacity writes',async()=>{
 const fade=new WindowFade(),f=fixture(),pending=fade.fadeOut(f.window);f.destroy();assert.equal(await pending,false);
 const count=f.writes.length;fade.cancel();assert.equal(f.writes.length,count);
});
test('opacity errors reject the hide and restore a usable window',async()=>{
 const fade=new WindowFade(),f=fixture(),set=f.window.setOpacity;let fail=true;
 f.window.setOpacity=value=>{if(fail){fail=false;throw Error('opacity failed');}set(value);};
 await assert.rejects(fade.fadeOut(f.window),/opacity failed/);assert.equal(f.window.getOpacity(),1);fade.cancel();
});
test('windows without opacity support can still hide',async()=>{
 const fade=new WindowFade();assert.equal(await fade.fadeOut({isDestroyed:()=>false}),true);fade.cancel();
});
test('canceling inside an opacity update does not schedule another frame',async()=>{
 const fade=new WindowFade(),f=fixture(),set=f.window.setOpacity;
 f.window.setOpacity=value=>{set(value);if(value<1)fade.cancel();};
 assert.equal(await fade.fadeOut(f.window),false);assert.equal(f.window.getOpacity(),1);
 const count=f.writes.length;await wait(30);assert.equal(f.writes.length,count);
});
