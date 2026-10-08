import {localizedError,reportMessage,setLanguage,getLanguage} from './i18n.js';
import {loadKernel} from './load-occt.js';
import {convertWithRecovery} from './projection-recovery.js';
import {createStepSession} from './occt-kernel.js';
let kernel=null,session=null,modelHash=null;

self.onmessage=async({data})=>{
 setLanguage(data.language);
 const {id,hash,bytes,options}=data,start=performance.now(),timings=[];
 const progress=(text,percent,message={})=>{timings.push({stage:text,seconds:Math.round((performance.now()-start)/10)/100});self.postMessage({id,type:'progress',text,percent,...message});};
 try{
  kernel??=loadKernel(progress);const oc=await kernel;
  if(!session||modelHash!==hash){
   session?.dispose();session=null;modelHash=null;
   if(!bytes)throw localizedError('error.reselectStep');
   session=createStepSession(oc,new Uint8Array(bytes),progress);modelHash=hash;
  }else reportMessage(progress,'progress.reuseModel',22);
  const result=await convertWithRecovery(session,options,progress,isolatedProjection);
  self.postMessage({id,type:'result',result,timings});
 }catch(error){self.postMessage({id,type:'error',message:error?.message||String(error),messageKey:error?.messageKey,values:error?.values,code:error?.code,view:error?.view,keepsModel:!!session&&error?.code==='EMPTY_PROJECTION',timings});}
};

function isolatedProjection(bytes,view,options){
 return new Promise((resolve,reject)=>{
  const isolated=new Worker(new URL('./projection-worker.js',import.meta.url),{type:'module',name:'step-projection'});
  isolated.onmessage=({data})=>{isolated.terminate();if(data.type==='result')resolve(data.view);else reject(Object.assign(new Error(data.message),{code:data.code,view,messageKey:data.messageKey,values:data.values}));};
  isolated.onerror=event=>{isolated.terminate();reject(event.message?Error(event.message):localizedError('error.isolated'));};
  isolated.postMessage({bytes,view,options,language:getLanguage()},[bytes.buffer]);
 });
}
