import {loadKernel} from './load-occt.js';
import {convertWithRecovery} from './projection-recovery.js';
import {createStepSession} from './occt-kernel.js';
let kernel=null,session=null,modelHash=null;

self.onmessage=async({data})=>{
 const {id,hash,bytes,options}=data,start=performance.now(),timings=[];
 const progress=(text,percent)=>{timings.push({stage:text,seconds:Math.round((performance.now()-start)/10)/100});self.postMessage({id,type:'progress',text,percent});};
 try{
  kernel??=loadKernel(progress);const oc=await kernel;
  if(!session||modelHash!==hash){
   session?.dispose();session=null;modelHash=null;
   if(!bytes)throw Error('请重新选择本地 STEP 文件');
   session=createStepSession(oc,new Uint8Array(bytes),progress);modelHash=hash;
  }else progress('复用已解析模型',22);
  const result=await convertWithRecovery(session,options,progress,isolatedProjection);
  self.postMessage({id,type:'result',result,timings});
 }catch(error){self.postMessage({id,type:'error',message:error?.message||`几何转换失败 (${String(error)})`,code:error?.code,view:error?.view,keepsModel:!!session&&error?.code==='EMPTY_PROJECTION',timings});}
};

function isolatedProjection(bytes,view,options){
 return new Promise((resolve,reject)=>{
  const isolated=new Worker(new URL('./projection-worker.js',import.meta.url),{type:'module',name:'step-projection'});
  isolated.onmessage=({data})=>{isolated.terminate();if(data.type==='result')resolve(data.view);else reject(Object.assign(new Error(data.message),{code:data.code,view}));};
  isolated.onerror=event=>{isolated.terminate();reject(Error(event.message||'独立投影计算失败'));};
  isolated.postMessage({bytes,view,options},[bytes.buffer]);
 });
}
