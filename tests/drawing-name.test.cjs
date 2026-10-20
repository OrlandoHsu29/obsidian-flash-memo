const {test}=require('node:test');
const assert=require('node:assert/strict');
const {buildSync}=require('esbuild');
const Module=require('node:module');
const output=buildSync({entryPoints:['src/drawing-name.ts'],bundle:true,platform:'node',format:'cjs',write:false});
const loaded=new Module('drawing-name.cjs');
loaded._compile(output.outputFiles[0].text,'drawing-name.cjs');
const {drawingName,renamedDrawingPath}=loaded.exports;

test('canvas names hide the full drawing suffix and preserve it on rename',()=>{
  for(const extension of ['.excalidraw.md','.excalidraw','.md','.EXCALIDRAW.MD']){
    assert.deepEqual(drawingName('Drawings/速记'+extension),{name:'速记',extension});
    assert.equal(renamedDrawingPath('Drawings/速记'+extension,' 新画板 '),'Drawings/新画板'+extension);
  }
  assert.equal(renamedDrawingPath('Quick.excalidraw.md','Meeting.v2'),'Meeting.v2.excalidraw.md');
});

test('rename rejects paths, empty names, and unsafe Windows filenames',()=>{
  for(const value of ['', '  ', '.', '..', '../outside', 'sub/name', 'sub\\name', 'A:B', 'A?B', 'A*B', 'A"B', 'A<B', 'A>B', 'A|B', 'A\nB', 'name.', 'CON', 'nul.txt', 'COM1', 'LPT9']){
    assert.throws(()=>renamedDrawingPath('Drawings/Quick.excalidraw.md',value),/invalid-drawing-name/);
  }
});
