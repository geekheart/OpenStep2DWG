import {localizedError,reportMessage} from './i18n.js';
import initOCCT from '../vendor/occt/occt.js';
export async function loadKernel(progress){
 const compressed=typeof DecompressionStream==='function';
 const url=new URL(`../vendor/occt/occt.wasm${compressed?'.gz':''}`,import.meta.url);
 reportMessage(progress,'progress.downloadKernel',1);
 const response=await fetch(url);if(!response.ok)throw localizedError('error.downloadKernel');
 const size=Number(response.headers.get('content-length'));let loaded=0,last=0;
 const stream=response.body.pipeThrough(new TransformStream({transform(chunk,controller){
  loaded+=chunk.byteLength;
  if(performance.now()-last>100){last=performance.now();reportMessage(progress,'progress.downloadSize',size?1+Math.min(1,loaded/size)*6:3,{size:(loaded/1048576).toFixed(1)});}
  controller.enqueue(chunk);
 }}));
 const binary=await new Response(compressed?stream.pipeThrough(new DecompressionStream('gzip')):stream).arrayBuffer();
 reportMessage(progress,'progress.initialize',8);
 return initOCCT({wasmBinary:binary,print:()=>{},printErr:()=>{}});
}
