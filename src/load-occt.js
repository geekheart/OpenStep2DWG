import initOCCT from '../vendor/occt/occt.js';
export async function loadKernel(progress){
 const compressed=typeof DecompressionStream==='function';
 const url=new URL(`../vendor/occt/occt.wasm${compressed?'.gz':''}`,import.meta.url);
 progress('下载计算内核',1);
 const response=await fetch(url);if(!response.ok)throw Error('计算内核下载失败，请检查网络后重试');
 const size=Number(response.headers.get('content-length'));let loaded=0,last=0;
 const stream=response.body.pipeThrough(new TransformStream({transform(chunk,controller){
  loaded+=chunk.byteLength;
  if(performance.now()-last>100){last=performance.now();progress(`下载计算内核 · ${(loaded/1048576).toFixed(1)} MB`,size?1+Math.min(1,loaded/size)*6:3);}
  controller.enqueue(chunk);
 }}));
 const binary=await new Response(compressed?stream.pipeThrough(new DecompressionStream('gzip')):stream).arrayBuffer();
 progress('初始化计算内核',8);
 return initOCCT({wasmBinary:binary,print:()=>{},printErr:()=>{}});
}
