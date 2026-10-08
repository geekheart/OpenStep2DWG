import {t,setLanguage,getLanguage,applyLanguage,localize,localizedError,errorText} from './src/i18n.js';
import {createProject,validateProject,layoutProject,drawingSVG,buildDrawing,number} from './src/model.js';
import {exportDXF} from './src/dxf.js';
import {conversionKey,getProjection,putProjection} from './src/conversion-cache.js';
const $=id=>document.getElementById(id),MM=96/25.4;
let project,selected='top',source=null,rotation=0,worker=null,jobTimer=null,jobStarted=0,history=[],future=[],camera={x:0,y:0,scale:1},drag=null,pendingRender=false,exportURL=null,previewURL=null,exportBlob=null,exportWorker=null,exportGeneration=0,toastTimer;
let conversionGeneration=0,workerHash=null,stageStarted=0;
const cache=new Map(),sourceHashes=new WeakMap();
const uiMessages=new Map();
function setText(id,key,values={}){const render=typeof key==='function'?key:()=>t(key,values);uiMessages.set(id,render);$(id).textContent=render();}
function setError(id,error){setText(id,()=>errorText(error));}
function toast(key,values={}){setText('toast',key,values);$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,4000);}
function snapshot(){return JSON.stringify(project);}
function commit(){history.push(snapshot());if(history.length>15)history.shift();future=[];setText('save-state','status.unsaved');updateHistory();}
function updateHistory(){$('undo').disabled=!history.length;$('redo').disabled=!future.length;}
function undo(){if(!history.length)return;future.push(snapshot());project=JSON.parse(history.pop());sync();render();updateHistory();}
function redo(){if(!future.length)return;history.push(snapshot());project=JSON.parse(future.pop());sync();render();updateHistory();}
function setSelected(id){selected=id;$('selection-label').textContent=t('viewSelected',{view:t(`view.${id}`)});document.querySelectorAll('[data-view]').forEach(e=>e.classList.toggle('selected',e.dataset.view===id));document.querySelectorAll('[data-select-view]').forEach(e=>e.classList.toggle('selected',e.dataset.selectView===id));const p=project.positions[id];$('view-x').value=number(p[0]);$('view-y').value=number(p[1]);}
function render(){
 $('paper').innerHTML=drawingSVG(project,{interactive:true});setSelected(selected);
 const s=project.settings.scale;$('scale-label').textContent=s>=1?`${number(s)}:1`:`1:${number(1/s)}`;
 $('entity-total').textContent=t('contours',{count:project.geometry.views.reduce((n,v)=>n+v.entities.length,0).toLocaleString(getLanguage())});
 const groups=buildDrawing(project).groups;$('paper').dataset.overflow=String(groups.some(g=>g.bounds[0]<0||g.bounds[1]<0||g.bounds[2]>297||g.bounds[3]>210));
}
function scheduleRender(){if(!pendingRender){pendingRender=true;requestAnimationFrame(()=>{pendingRender=false;render();});}}
function sync(){
 $('project-name').value=project.name;const s=project.settings;
 for(const [id,key]of [['drawing-scale','scale'],['drawing-number','drawingNumber'],['revision','revision'],['drawing-date','date'],['line-width','lineWidth']])$(id).value=s[key];
 for(const [id,key]of [['auto-scale','autoScale'],['dimensions','dimensions'],['frame','frame']])$(id).checked=s[key];
 $('drawing-scale').disabled=s.autoScale;
 $('view-list').replaceChildren();for(const view of project.geometry.views){const button=document.createElement('button');button.className='view-row';button.dataset.selectView=view.id;const label=document.createElement('span');label.textContent=t(`view.${view.id}`);const meta=document.createElement('small');const b=view.bounds;meta.textContent=`${(b[2]-b[0]).toFixed(2)} × ${(b[3]-b[1]).toFixed(2)}`;button.append(label,meta);button.onclick=()=>setSelected(view.id);$('view-list').append(button);}
 if(!project.positions[selected])selected='top';
 const b=project.geometry.envelope,items=[[t('drawingUnits'),'mm'],[t('approximateCurves'),t('curveCount',{count:project.geometry.approximated||0})],[t('removedLayers'),t('layerCount',{count:project.geometry.removed||0})]];
 if(b)items.unshift([t('modelSize'),b[1].map((v,i)=>(v-b[0][i]).toFixed(2)).join(' × ')]);
 $('model-info').replaceChildren();for(const [name,value]of items){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=name;dd.textContent=value;$('model-info').append(dt,dd);}
 setSelected(selected);updateHistory();
}
function transformCamera(){$('paper').style.transform=`translate(${camera.x}px,${camera.y}px) scale(${camera.scale})`;$('zoom-value').textContent=Math.round(camera.scale*100)+'%';}
function fit(){const r=$('viewport').getBoundingClientRect();camera.scale=Math.min((r.width-72)/(297*MM),(r.height-72)/(210*MM));camera.scale=Math.max(.05,camera.scale);camera.x=(r.width-297*MM*camera.scale)/2;camera.y=(r.height-210*MM*camera.scale)/2;transformCamera();}
function zoom(factor,cx,cy){const r=$('viewport').getBoundingClientRect(),x=cx??r.width/2,y=cy??r.height/2,old=camera.scale,next=Math.max(.05,Math.min(8,old*factor));camera.x=x-(x-camera.x)*next/old;camera.y=y-(y-camera.y)*next/old;camera.scale=next;transformCamera();}
$('viewport').addEventListener('wheel',event=>{event.preventDefault();const r=$('viewport').getBoundingClientRect();zoom(Math.exp(-event.deltaY*.004),event.clientX-r.left,event.clientY-r.top);},{passive:false});
$('viewport').addEventListener('pointerdown',event=>{
 if(!project||![0,1].includes(event.button))return;
 const group=event.target.closest('[data-view]');
 if(group&&event.button===0&&!event.altKey){setSelected(group.dataset.view);commit();drag={kind:'view',start:[event.clientX,event.clientY],position:[...project.positions[selected]]};}
 else drag={kind:'pan',start:[event.clientX,event.clientY],position:[camera.x,camera.y]};
 $('viewport').setPointerCapture(event.pointerId);event.preventDefault();
});
$('viewport').addEventListener('pointermove',event=>{if(!drag)return;const dx=event.clientX-drag.start[0],dy=event.clientY-drag.start[1];if(drag.kind==='pan'){camera.x=drag.position[0]+dx;camera.y=drag.position[1]+dy;transformCamera();}else{const snap=v=>$('snap').checked?Math.round(v):number(v);project.positions[selected]=[snap(drag.position[0]+dx/camera.scale/MM),snap(drag.position[1]-dy/camera.scale/MM)];scheduleRender();}});
for(const type of ['pointerup','pointercancel'])$('viewport').addEventListener(type,()=>{drag=null;});
$('fit').onclick=fit;$('actual').onclick=()=>zoom(1/camera.scale);$('zoom-in').onclick=()=>zoom(1.2);$('zoom-out').onclick=()=>zoom(1/1.2);$('undo').onclick=undo;$('redo').onclick=redo;
new ResizeObserver(()=>{if(project)fit();}).observe($('viewport'));
for(const button of document.querySelectorAll('[data-tab]'))button.onclick=()=>{document.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('active',b===button));document.querySelectorAll('.panel').forEach(p=>p.classList.toggle('active',p.id==='panel-'+button.dataset.tab));};
for(const button of document.querySelectorAll('[data-rotation]'))button.onclick=()=>{rotation=Number(button.dataset.rotation);document.querySelectorAll('[data-rotation]').forEach(b=>b.classList.toggle('selected',b===button));};
function setOptions(options={}){rotation=options.rotation||0;$('view-layout').value=options.views?.includes('left')?'first-angle':'inspection';$('detail').value=options.detail||'full';document.querySelectorAll('[data-rotation]').forEach(b=>b.classList.toggle('selected',Number(b.dataset.rotation)===rotation));}
function updateSetting(id,key,checkbox=false,relayout=false){$(id).onchange=()=>{const val=checkbox?$(id).checked:$(id).type==='number'||id==='line-width'?Number($(id).value):$(id).value;if(typeof val==='number'&&(!Number.isFinite(val)||val<=0||val>1e6)){$(id).value=project.settings[key];return;}commit();project.settings[key]=val;if(relayout)layoutProject(project);sync();render();};}
for(const spec of [['drawing-scale','scale',false,true],['auto-scale','autoScale',true,true],['drawing-number','drawingNumber'],['revision','revision'],['drawing-date','date'],['line-width','lineWidth'],['dimensions','dimensions',true],['frame','frame',true]])updateSetting(...spec);
let projectNameEditing=false;
$('project-name').onfocus=()=>{projectNameEditing=false;};
$('project-name').oninput=$('project-name').onchange=()=>{
 const name=$('project-name').value.trim()||'Untitled';if(name===project.name)return;
 if(!projectNameEditing){commit();projectNameEditing=true;}
 project.name=name;render();
};
$('project-name').onblur=()=>{projectNameEditing=false;};
for(const [id,axis]of [['view-x',0],['view-y',1]])$(id).onchange=()=>{const n=Number($(id).value);if(!Number.isFinite(n)||Math.abs(n)>100000){setSelected(selected);return;}commit();project.positions[selected][axis]=n;render();};
$('reset-layout').onclick=()=>{commit();layoutProject(project);sync();render();};
$('align-views').onclick=()=>{commit();project.positions.front[0]=project.positions.top[0];render();};
function finishConversion(){clearInterval(jobTimer);jobTimer=null;$('progress-card').hidden=true;$('convert').disabled=!source;$('import-step').disabled=false;$('load-demo').disabled=false;}
function cancelConversion(){conversionGeneration++;if(worker){worker.terminate();worker=null;}workerHash=null;finishConversion();}
$('cancel').onclick=()=>{cancelConversion();setText('save-state','status.cancelled');toast('conversionCancelled');};
async function importStep(file){
 if(!file||!(/\.(stp|step)$/i).test(file.name)){toast('chooseStepError');return;}
 if(file.size>150*1024*1024){toast('stepSizeError');return;}
 if(jobTimer)cancelConversion();source=file;$('source-name').textContent=file.name;setText('source-info','localFile',{size:(file.size/1048576).toFixed(2)});$('convert').disabled=false;await convert();
}
$('import-step').onclick=()=>$('step-file').click();$('step-file').onchange=event=>{const f=event.target.files[0];event.target.value='';if(f)importStep(f);};
async function convert(){
 if(!source)return;
 if(jobTimer)cancelConversion();const generation=++conversionGeneration,file=source;$('conversion-error').hidden=true;$('progress-card').hidden=false;setText('progress-label','readLocal');$('progress').value=0;$('convert').disabled=true;$('import-step').disabled=true;$('load-demo').disabled=true;
 setText('save-state','status.computing');jobStarted=stageStarted=Date.now();setText('elapsed','elapsedZero');jobTimer=setInterval(()=>setText('elapsed',()=>t('elapsed',{total:Math.floor((Date.now()-jobStarted)/1000),stage:Math.floor((Date.now()-stageStarted)/1000)})),1000);
 const options={rotation,detail:$('detail').value,tolerance:.01,views:$('view-layout').value==='inspection'?['top','bottom','front']:['top','front','left']};
 try {
  let bytes,hash=sourceHashes.get(file);
  if(!hash){bytes=await file.arrayBuffer();hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');sourceHashes.set(file,hash);}
  const key=conversionKey(hash,options);
  function complete(geometry,cached=false,timings=[]){
   if(generation!==conversionGeneration)return;
   commit();const old=project;project=createProject(geometry,file.name.replace(/\.(step|stp)$/i,''));project.source={name:file.name,size:file.size,sha256:hash};project.settings.revision=old.settings.revision;
   finishConversion();selected='top';sync();render();fit();setText('save-state','status.complete');
   const seconds=(Date.now()-jobStarted)/1000;setText('source-info',()=>t('convertedSource',{size:(file.size/1048576).toFixed(2),method:t(cached?'localCache':'localCompute'),seconds:seconds.toFixed(1)}));
   window.dispatchEvent(new CustomEvent('conversion-complete',{detail:{cached,seconds,timings}}));
   toast(()=>(cached?t('restoredCache'):t('generatedViews',{count:geometry.views.length}))+(geometry.approximated?t('approximationNotice',{count:geometry.approximated}):''));
  }
  if(generation!==conversionGeneration)return;
  setText('progress-label','checkCache');
  let saved=cache.get(key)||await getProjection(key);
  if(generation!==conversionGeneration)return;
  if(saved){
   try{saved=validateProject(createProject(structuredClone(saved),'Cached')).geometry;}
   catch{cache.delete(key);saved=null;}
   if(saved){complete(saved,true);return;}
  }
  if(!worker)worker=new Worker(new URL('./src/step-worker.js',import.meta.url),{type:'module',name:'step-session'});
  worker.onmessage=({data})=>{
   if(data.id!==generation||generation!==conversionGeneration)return;
   if(data.type==='progress'){const stage=JSON.stringify([data.messageKey||data.text,data.values?.viewId]);if($('progress-label').dataset.stage!==stage)stageStarted=Date.now();$('progress-label').dataset.stage=stage;setText('progress-label',()=>data.messageKey?localize(data):data.text);$('progress').value=data.percent;}
   else if(data.type==='error'){if(data.keepsModel){workerHash=hash;finishConversion();}else cancelConversion();setText('save-state','status.failed');$('conversion-error').hidden=false;setError('conversion-error',data);}
   else if(data.type==='result'){workerHash=hash;cache.set(key,structuredClone(data.result));if(cache.size>2)cache.delete(cache.keys().next().value);void putProjection(key,data.result);complete(data.result,false,data.timings);}
  };
  worker.onerror=event=>{if(generation!==conversionGeneration)return;cancelConversion();setText('save-state','status.failed');$('conversion-error').hidden=false;setError('conversion-error',event.message?event:localizedError('kernelRuntimeError'));};
  if(workerHash!==hash)bytes??=await file.arrayBuffer();else bytes=undefined;
  if(generation!==conversionGeneration)return;
  worker.postMessage({id:generation,hash,bytes,options,language:getLanguage()},bytes?[bytes]:[]);
 }catch(error){if(generation!==conversionGeneration)return;cancelConversion();setText('save-state','status.failed');$('conversion-error').hidden=false;setError('conversion-error',error);}
}
$('convert').onclick=convert;
async function loadDemo(initial=false){
 try{const result=await fetch(new URL('./assets/demo.json',import.meta.url));if(!result.ok)throw localizedError('demoLoadError');const data=validateProject(await result.json());if(!initial)commit();project=data;source=new File([await (await fetch('./assets/demo.step')).arrayBuffer()],'DEMO-BOARD.step');selected='top';setOptions(data.geometry.options);$('source-name').textContent='DEMO-BOARD.step';setText('source-info','demoDrawing');$('convert').disabled=false;sync();render();fit();setText('save-state','status.demo');}catch(error){toast(()=>errorText(error));}
}
$('load-demo').onclick=async()=>{cancelConversion();await loadDemo();};
function filename(extension){return (project.name.replace(/[<>:"/\\|?*\x00-\x1F]/g,'_').slice(0,120)||'Untitled')+'.'+extension;}
function download(blob,name){const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=name;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
$('save-project').onclick=()=>{download(new Blob([JSON.stringify(project)],{type:'application/json'}),filename('json'));setText('save-state','status.saved');};
$('open-project').onclick=()=>$('project-file').click();$('project-file').onchange=async event=>{
 const file=event.target.files[0];event.target.value='';if(!file)return;
 try{if(file.size>150*1024*1024)throw localizedError('projectSizeError');const data=validateProject(JSON.parse(await file.text()));cancelConversion();commit();project=data;source=null;selected='top';setOptions(data.geometry.options);$('source-name').textContent=data.source?.name||data.name;setText('source-info','savedProjection');$('convert').disabled=true;sync();render();fit();setText('save-state','status.opened');}catch(error){toast(()=>errorText(error));}
};
let dragDepth=0;
$('viewport').addEventListener('dragenter',e=>{e.preventDefault();dragDepth++;$('viewport').classList.add('dragover');});
$('viewport').addEventListener('dragover',e=>e.preventDefault());$('viewport').addEventListener('dragleave',()=>{if(--dragDepth<=0)$('viewport').classList.remove('dragover');});
$('viewport').addEventListener('drop',event=>{event.preventDefault();dragDepth=0;$('viewport').classList.remove('dragover');importStep(event.dataTransfer.files[0]);});
function stopExport(){exportGeneration++;exportWorker?.terminate();exportWorker=null;exportBlob=null;if(exportURL){URL.revokeObjectURL(exportURL);exportURL=null;}}
async function prepareExport(){
 stopExport();const generation=exportGeneration,format=$('export-format').value;
 $('dpi-row').hidden=format!=='png';$('export-error').hidden=true;setText('export-info',format==='dwg'?'generatingDwg':'preparingFile');$('download-export').disabled=true;$('save-as').disabled=true;$('export-filename').textContent=filename(format);
 try{
  const svg=drawingSVG(project);
  if(previewURL)URL.revokeObjectURL(previewURL);previewURL=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml'}));$('export-preview').src=previewURL;$('export-scale').textContent=$('scale-label').textContent;
  let blob;
  if(format==='dwg'){
   const dxf=exportDXF(project),bytes=await new Promise((resolve,reject)=>{exportWorker=new Worker(new URL('./src/dwg-worker.js',import.meta.url),{type:'module'});exportWorker.onmessage=({data})=>data.type==='result'?resolve(data.bytes):reject(Object.assign(Error(data.message),data));exportWorker.onerror=e=>reject(Error(e.message));exportWorker.postMessage({dxf,language:getLanguage()});});
   if(generation!==exportGeneration)return;blob=new Blob([bytes],{type:'application/acad'});exportWorker?.terminate();exportWorker=null;
  }else if(format==='dxf')blob=new Blob([exportDXF(project)],{type:'application/dxf'});
  else if(format==='svg')blob=new Blob([svg],{type:'image/svg+xml'});
  else{
   const dpi=Number($('export-dpi').value),canvas=document.createElement('canvas');canvas.width=Math.round(297/25.4*dpi);canvas.height=Math.round(210/25.4*dpi);const img=new Image();img.src=previewURL;await img.decode();canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(localizedError('imageError')),'image/png'));
  }
  if(generation!==exportGeneration)return;exportBlob=blob;exportURL=URL.createObjectURL(blob);setText('export-info',()=>t('exportSize',{size:(blob.size/1024).toFixed(1),check:format==='dwg'?t('dwgChecked'):''}));$('download-export').disabled=false;$('save-as').disabled=false;
 }catch(error){if(generation!==exportGeneration)return;setText('export-info',()=> '');$('export-error').hidden=false;setError('export-error',error);}
}
$('export').onclick=()=>{$('export-dialog').showModal();prepareExport();};$('close-export').onclick=()=>$('export-dialog').close();$('export-dialog').addEventListener('close',stopExport);$('export-format').onchange=prepareExport;$('export-dpi').onchange=prepareExport;
$('download-export').onclick=()=>{if(exportBlob){download(exportBlob,filename($('export-format').value));toast('downloadStarted');}};
$('save-as').onclick=async()=>{
 if(!exportBlob)return;const name=filename($('export-format').value);
 try{if(window.showSaveFilePicker){const handle=await window.showSaveFilePicker({suggestedName:name});const writable=await handle.createWritable();await writable.write(exportBlob);await writable.close();toast('fileSaved');}else{download(exportBlob,name);toast('browserDownload');}}catch(error){if(error.name!=='AbortError')toast(()=>errorText(error));}
};
document.addEventListener('keydown',event=>{
 const editable=/INPUT|TEXTAREA|SELECT/.test(event.target.tagName);if(editable)return;
 if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'){event.preventDefault();event.shiftKey?redo():undo();}
 if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='s'){event.preventDefault();$('save-project').click();}
 if(event.key==='Escape'&&jobTimer){cancelConversion();setText('save-state','status.cancelled');toast('conversionCancelled');}
 if(event.target.closest('[data-view]')&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)){event.preventDefault();commit();const d=event.shiftKey?5:1,p=project.positions[selected];if(event.key==='ArrowLeft')p[0]-=d;if(event.key==='ArrowRight')p[0]+=d;if(event.key==='ArrowUp')p[1]+=d;if(event.key==='ArrowDown')p[1]-=d;render();$('paper').querySelector(`[data-view="${selected}"]`).focus();}
});
function changeLanguage(value,{updateURL=true}={}){
 setLanguage(value);$('language-select').value=getLanguage();applyLanguage();
 if(updateURL){const url=new URL(location.href);if(getLanguage()==='en')url.searchParams.set('lang','en');else url.searchParams.delete('lang');window.history.replaceState(null,'',url);}
 for(const [id,renderText]of uiMessages)$(id).textContent=renderText();
 // A locale change only rerenders labels: geometry, history, source, camera and export remain intact.
 if(project){sync();render();}
}
$('language-select').onchange=()=>changeLanguage($('language-select').value);
changeLanguage(new URL(location.href).searchParams.get('lang'),{updateURL:false});
setText('source-name','chooseStep');setText('save-state','status.demo');
await loadDemo(true);
// A source filename is user data and must never be rewritten during language changes.
uiMessages.delete('source-name');
