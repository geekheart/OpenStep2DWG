import {readFileSync,writeFileSync} from 'node:fs';
import init,{dxf_to_dwg,dwg_to_dxf} from '../engine/pkg/dwg.js';
await init({module_or_path:readFileSync(new URL('../engine/pkg/dwg_bg.wasm',import.meta.url))});
const bytes=dxf_to_dwg(readFileSync(process.argv[2]));
console.log('DWG',bytes.length,new TextDecoder().decode(bytes.slice(0,6)));
writeFileSync(process.argv[3],bytes);
const dxf=dwg_to_dxf(bytes);writeFileSync(process.argv[3]+'.dxf',dxf);
console.log('Backread DXF',dxf.length);
