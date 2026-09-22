import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const files=['engine/src/lib.rs','engine/Cargo.toml','engine/Cargo.lock','engine/pkg/dwg.js','engine/pkg/dwg_bg.wasm'];
const sha256=path=>createHash('sha256').update(readFileSync(path)).digest('hex');
const report={format:1,crate:'acadrust 0.5.5',bindings:'wasm-bindgen 0.2.128',target:'wasm32-unknown-unknown',files:Object.fromEntries(files.map(path=>[path,sha256(path)]))};
if(process.argv.includes('--check')){
 const expected=JSON.parse(readFileSync('engine/pkg/provenance.json'));
 for(const file of files)if(report.files[file]!==expected.files[file])throw Error(`DWG engine changed: ${file}. Rebuild with scripts/build-engine.sh.`);
 console.log('DWG engine provenance verified');
}else writeFileSync('engine/pkg/provenance.json',JSON.stringify(report,null,2)+'\n');
