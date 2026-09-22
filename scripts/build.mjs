import {cp,mkdir,rm,stat} from 'node:fs/promises';
await stat('engine/pkg/dwg_bg.wasm').catch(()=>{throw Error('DWG 内核未编译。请先运行 scripts/build-engine.sh');});
await rm('dist',{recursive:true,force:true});
for(const file of ['index.html','style.css','app.js','src','assets','engine/pkg','THIRD_PARTY_NOTICES.md','LICENSE','docs/licenses'])await cp(file,`dist/${file}`,{recursive:true});
await mkdir('dist/vendor/occt',{recursive:true});
for(const [from,to] of [['opencascade.full.js','occt.js'],['opencascade.full.wasm','occt.wasm']])await cp(`node_modules/opencascade.js/dist/${from}`,`dist/vendor/occt/${to}`);
console.log('Static site built → dist/');
