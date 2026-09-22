import init from 'opencascade.js/dist/node.js';
import {readFileSync,writeFileSync} from 'node:fs';
import {convertStep} from '../src/occt-kernel.js';
const oc=await init({module:{wasmBinary:readFileSync(new URL('../node_modules/opencascade.js/dist/opencascade.full.wasm',import.meta.url))}});
const start=Date.now();
let result;try {result=convertStep(oc,readFileSync(process.argv[2]),{detail:process.env.STEP_DETAIL||'full',views:process.argv[4]?.split(',')||['top','bottom','front']},(text,p)=>console.log(`${((Date.now()-start)/1000).toFixed(1)}s ${p}% ${text}`));
} catch(e) {console.error('PROJECTION ERROR',e?.stack||String(e));process.exit(1);}
writeFileSync(process.argv[3],JSON.stringify(result));
console.log(result.envelope,result.views.map(v=>[v.id,v.entities.length]),'approximated',result.approximated,'removed',result.removed);
