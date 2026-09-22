import {loadKernel} from './load-occt.js';
import {readBREP,projectView} from './occt-kernel.js';
self.onmessage=async({data})=>{
 let shape;
 try{
  const oc=await loadKernel(()=>{});
  shape=readBREP(oc,data.bytes);
  const view=projectView(oc,shape,data.view,data.options.rotation||0,data.options.tolerance||.01);
  self.postMessage({type:'result',view});
 }catch(error){self.postMessage({type:'error',code:error?.code,message:error?.message||String(error)});}
 finally{shape?.delete();self.close();}
};
