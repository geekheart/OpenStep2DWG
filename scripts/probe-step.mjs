import init from 'opencascade.js/dist/node.js';
import {readFileSync,writeFileSync} from 'node:fs';
import {createStepSession,readBREP,projectView} from '../src/occt-kernel.js';
import {convertWithRecovery} from '../src/projection-recovery.js';
const wasmBinary=readFileSync(new URL('../node_modules/opencascade.js/dist/opencascade.full.wasm',import.meta.url));
const oc=await init({module:{wasmBinary}});
const start=Date.now();
const progress=(text,p)=>console.log(`${((Date.now()-start)/1000).toFixed(1)}s ${p}% ${text}`);
let result,session;try {
 session=createStepSession(oc,readFileSync(process.argv[2]),progress);
 result=await convertWithRecovery(session,{detail:process.env.STEP_DETAIL||'full',rotation:Number(process.env.STEP_ROTATION||0),views:process.argv[4]?.split(',')||['top','bottom','front']},progress,async(bytes,name,options)=>{
  const fresh=await init({module:{wasmBinary}}),shape=readBREP(fresh,bytes);
  try{return projectView(fresh,shape,name,options.rotation,options.tolerance||.01);}finally{shape.delete();}
 });
} catch(e) {console.error('PROJECTION ERROR',e?.stack||String(e));process.exitCode=1;}
finally{session?.dispose();}
if(!result)process.exit(1);
writeFileSync(process.argv[3],JSON.stringify(result));
console.log(result.envelope,result.views.map(v=>[v.id,v.entities.length]),'approximated',result.approximated,'removed',result.removed);
