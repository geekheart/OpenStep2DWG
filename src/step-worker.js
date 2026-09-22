import initOCCT from '../vendor/occt/occt.js';
import {convertStep} from './occt-kernel.js';
self.onmessage=async({data})=>{
 const progress=(text,percent)=>self.postMessage({type:'progress',text,percent});
 try{
  progress('加载几何内核',1);
  const url=new URL('../vendor/occt/occt.wasm',import.meta.url);
  const response=await fetch(url);if(!response.ok)throw Error('几何内核加载失败，请检查网络后重试');
  const reader=response.body.getReader(),size=Number(response.headers.get('content-length'))||50305130,chunks=[];let loaded=0;
  for(;;){const {done,value}=await reader.read();if(done)break;chunks.push(value);loaded+=value.length;progress(`加载几何内核 · ${Math.min(100,Math.round(loaded/size*100))}%`,1+loaded/size*7);}
  const binary=new Uint8Array(loaded);let offset=0;for(const chunk of chunks){binary.set(chunk,offset);offset+=chunk.length;}
  const oc=await initOCCT({wasmBinary:binary,print:()=>{},printErr:()=>{}});
  const result=convertStep(oc,new Uint8Array(data.bytes),data.options,progress);
  self.postMessage({type:'result',result});
 }catch(error){self.postMessage({type:'error',message:error?.message||`几何转换失败 (${String(error)})`});}
};
