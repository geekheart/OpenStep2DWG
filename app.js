import {createProject,validateProject,layoutProject,drawingSVG,buildDrawing,VIEW_LABELS,number} from './src/model.js';
import {exportDXF} from './src/dxf.js';
const $=id=>document.getElementById(id),MM=96/25.4;
let project,selected='top',source=null,rotation=0,worker=null,jobTimer=null,jobStarted=0,history=[],future=[],camera={x:0,y:0,scale:1},drag=null,pendingRender=false,exportURL=null,previewURL=null,exportBlob=null,exportWorker=null,exportGeneration=0,toastTimer;
let conversionGeneration=0;
const cache=new Map();
function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,4000);}
function snapshot(){return JSON.stringify(project);}
function commit(){history.push(snapshot());if(history.length>15)history.shift();future=[];$('save-state').textContent='未保存';updateHistory();}
function updateHistory(){$('undo').disabled=!history.length;$('redo').disabled=!future.length;}
function undo(){if(!history.length)return;future.push(snapshot());project=JSON.parse(history.pop());sync();render();updateHistory();}
function redo(){if(!future.length)return;history.push(snapshot());project=JSON.parse(future.pop());sync();render();updateHistory();}
function setSelected(id){selected=id;$('selection-label').textContent=VIEW_LABELS[id]+'视图';document.querySelectorAll('[data-view]').forEach(e=>e.classList.toggle('selected',e.dataset.view===id));document.querySelectorAll('[data-select-view]').forEach(e=>e.classList.toggle('selected',e.dataset.selectView===id));const p=project.positions[id];$('view-x').value=number(p[0]);$('view-y').value=number(p[1]);}
function render(){
 $('paper').innerHTML=drawingSVG(project,{interactive:true});setSelected(selected);
 const s=project.settings.scale;$('scale-label').textContent=s>=1?`${number(s)}:1`:`1:${number(1/s)}`;
 $('entity-total').textContent=project.geometry.views.reduce((n,v)=>n+v.entities.length,0).toLocaleString()+' 条轮廓';
 const groups=buildDrawing(project).groups;$('paper').dataset.overflow=String(groups.some(g=>g.bounds[0]<0||g.bounds[1]<0||g.bounds[2]>297||g.bounds[3]>210));
}
function scheduleRender(){if(!pendingRender){pendingRender=true;requestAnimationFrame(()=>{pendingRender=false;render();});}}
function sync(){
 $('project-name').value=project.name;const s=project.settings;
 for(const [id,key]of [['drawing-scale','scale'],['drawing-number','drawingNumber'],['revision','revision'],['drawing-date','date'],['line-width','lineWidth']])$(id).value=s[key];
 for(const [id,key]of [['auto-scale','autoScale'],['dimensions','dimensions'],['frame','frame']])$(id).checked=s[key];
 $('drawing-scale').disabled=s.autoScale;
 $('view-list').replaceChildren();for(const view of project.geometry.views){const button=document.createElement('button');button.className='view-row';button.dataset.selectView=view.id;const label=document.createElement('span');label.textContent=VIEW_LABELS[view.id];const meta=document.createElement('small');const b=view.bounds;meta.textContent=`${(b[2]-b[0]).toFixed(2)} × ${(b[3]-b[1]).toFixed(2)}`;button.append(label,meta);button.onclick=()=>setSelected(view.id);$('view-list').append(button);}
 if(!project.positions[selected])selected='top';
 const b=project.geometry.envelope,items=[['图纸单位','mm'],['轮廓近似',`${project.geometry.approximated||0} 条`],['薄层简化',`${project.geometry.removed||0} 个`]];
 if(b)items.unshift(['模型尺寸',b[1].map((v,i)=>(v-b[0][i]).toFixed(2)).join(' × ')]);
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
$('project-name').onchange=()=>{commit();project.name=$('project-name').value.trim()||'Untitled';render();};
for(const [id,axis]of [['view-x',0],['view-y',1]])$(id).onchange=()=>{const n=Number($(id).value);if(!Number.isFinite(n)||Math.abs(n)>100000){setSelected(selected);return;}commit();project.positions[selected][axis]=n;render();};
$('reset-layout').onclick=()=>{commit();layoutProject(project);sync();render();};
$('align-views').onclick=()=>{commit();project.positions.front[0]=project.positions.top[0];render();};
function cancelConversion(){conversionGeneration++;if(worker){worker.terminate();worker=null;}clearInterval(jobTimer);$('progress-card').hidden=true;$('convert').disabled=!source;$('import-step').disabled=false;$('load-demo').disabled=false;}
$('cancel').onclick=()=>{cancelConversion();toast('转换已取消');};
async function importStep(file){
 if(!file||!(/\.(stp|step)$/i).test(file.name)){toast('请选择 .step 或 .stp 文件');return;}
 if(file.size>150*1024*1024){toast('当前支持 150 MB 以内的 STEP 文件');return;}
 cancelConversion();source=file;$('source-name').textContent=file.name;$('source-info').textContent=(file.size/1024/1024).toFixed(2)+' MB · STEP';$('convert').disabled=false;await convert();
}
$('import-step').onclick=()=>$('step-file').click();$('step-file').onchange=event=>{const f=event.target.files[0];event.target.value='';if(f)importStep(f);};
async function convert(){
 if(!source)return;
 cancelConversion();const generation=conversionGeneration;$('conversion-error').hidden=true;$('progress-card').hidden=false;$('progress-label').textContent='准备转换';$('progress').value=0;$('convert').disabled=true;$('import-step').disabled=true;$('load-demo').disabled=true;
 $('save-state').textContent='正在转换';jobStarted=Date.now();jobTimer=setInterval(()=>$('elapsed').textContent=`已用时 ${Math.floor((Date.now()-jobStarted)/1000)} 秒`,1000);
 const options={rotation,detail:$('detail').value,tolerance:.01,views:$('view-layout').value==='inspection'?['top','bottom','front']:['top','front','left']};
 try {
  const bytes=await source.arrayBuffer(),hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join(''),key=hash+JSON.stringify(options);
  function complete(geometry){if(generation!==conversionGeneration)return;commit();const old=project;project=createProject(geometry,source.name.replace(/\.(step|stp)$/i,''));project.source={name:source.name,size:source.size,sha256:hash};project.settings.revision=old.settings.revision;cancelConversion();selected='top';sync();render();fit();$('save-state').textContent='转换完成';toast(`已生成 ${geometry.views.length} 个视图${geometry.approximated?`，${geometry.approximated} 条曲线以 0.01 mm 公差近似`:''}`);}
  if(generation!==conversionGeneration)return;
  if(cache.has(key)){complete(structuredClone(cache.get(key)));return;}
  worker=new Worker(new URL('./src/step-worker.js',import.meta.url),{type:'module'});
  worker.onmessage=({data})=>{if(data.type==='progress'){$('progress-label').textContent=data.text;$('progress').value=data.percent;}else if(data.type==='error'){cancelConversion();$('conversion-error').hidden=false;$('conversion-error').textContent=data.message;}else{cache.set(key,structuredClone(data.result));if(cache.size>2)cache.delete(cache.keys().next().value);complete(data.result);}};
  worker.onerror=event=>{cancelConversion();$('conversion-error').hidden=false;$('conversion-error').textContent=event.message||'内核运行失败，模型可能超出浏览器可用内存';};
  worker.postMessage({bytes,options},[bytes]);
 }catch(error){cancelConversion();$('conversion-error').hidden=false;$('conversion-error').textContent=error.message;}
}
$('convert').onclick=convert;
async function loadDemo(initial=false){
 try{const result=await fetch(new URL('./assets/demo.json',import.meta.url));if(!result.ok)throw Error('无法载入示例');const data=validateProject(await result.json());if(!initial)commit();project=data;source=new File([await (await fetch('./assets/demo.step')).arrayBuffer()],'DEMO-BOARD.step');selected='top';setOptions(data.geometry.options);$('source-name').textContent='DEMO-BOARD.step';$('source-info').textContent='示例工程图';$('convert').disabled=false;sync();render();fit();$('save-state').textContent='示例已载入';}catch(error){toast(error.message);}
}
$('load-demo').onclick=async()=>{cancelConversion();await loadDemo();};
function filename(extension){return (project.name.replace(/[<>:"/\\|?*\x00-\x1F]/g,'_').slice(0,120)||'Untitled')+'.'+extension;}
function download(blob,name){const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=name;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
$('save-project').onclick=()=>{download(new Blob([JSON.stringify(project)],{type:'application/json'}),filename('json'));$('save-state').textContent='项目已保存';};
$('open-project').onclick=()=>$('project-file').click();$('project-file').onchange=async event=>{
 const file=event.target.files[0];event.target.value='';if(!file)return;
 try{if(file.size>150*1024*1024)throw Error('项目文件超过 150 MB');const data=validateProject(JSON.parse(await file.text()));cancelConversion();commit();project=data;source=null;selected='top';setOptions(data.geometry.options);$('source-name').textContent=data.source?.name||data.name;$('source-info').textContent='已保存的投影';$('convert').disabled=true;sync();render();fit();$('save-state').textContent='项目已打开';}catch(error){toast(error.message);}
};
let dragDepth=0;
$('viewport').addEventListener('dragenter',e=>{e.preventDefault();dragDepth++;$('viewport').classList.add('dragover');});
$('viewport').addEventListener('dragover',e=>e.preventDefault());$('viewport').addEventListener('dragleave',()=>{if(--dragDepth<=0)$('viewport').classList.remove('dragover');});
$('viewport').addEventListener('drop',event=>{event.preventDefault();dragDepth=0;$('viewport').classList.remove('dragover');importStep(event.dataTransfer.files[0]);});
function stopExport(){exportGeneration++;exportWorker?.terminate();exportWorker=null;exportBlob=null;if(exportURL){URL.revokeObjectURL(exportURL);exportURL=null;}}
async function prepareExport(){
 stopExport();const generation=exportGeneration,format=$('export-format').value;
 $('dpi-row').hidden=format!=='png';$('export-error').hidden=true;$('export-info').textContent=format==='dwg'?'生成 DWG 并回读校验…':'准备文件…';$('download-export').disabled=true;$('save-as').disabled=true;$('export-filename').textContent=filename(format);
 try{
  const svg=drawingSVG(project);
  if(previewURL)URL.revokeObjectURL(previewURL);previewURL=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml'}));$('export-preview').src=previewURL;$('export-scale').textContent=$('scale-label').textContent;
  let blob;
  if(format==='dwg'){
   const dxf=exportDXF(project),bytes=await new Promise((resolve,reject)=>{exportWorker=new Worker(new URL('./src/dwg-worker.js',import.meta.url),{type:'module'});exportWorker.onmessage=({data})=>data.type==='result'?resolve(data.bytes):reject(Error(data.message));exportWorker.onerror=e=>reject(Error(e.message));exportWorker.postMessage({dxf});});
   if(generation!==exportGeneration)return;blob=new Blob([bytes],{type:'application/acad'});exportWorker?.terminate();exportWorker=null;
  }else if(format==='dxf')blob=new Blob([exportDXF(project)],{type:'application/dxf'});
  else if(format==='svg')blob=new Blob([svg],{type:'image/svg+xml'});
  else{
   const dpi=Number($('export-dpi').value),canvas=document.createElement('canvas');canvas.width=Math.round(297/25.4*dpi);canvas.height=Math.round(210/25.4*dpi);const img=new Image();img.src=previewURL;await img.decode();canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('图片生成失败')),'image/png'));
  }
  if(generation!==exportGeneration)return;exportBlob=blob;exportURL=URL.createObjectURL(blob);$('export-info').textContent=`${(blob.size/1024).toFixed(1)} KB${format==='dwg'?' · DWG 回读校验通过':''}`;$('download-export').disabled=false;$('save-as').disabled=false;
 }catch(error){if(generation!==exportGeneration)return;$('export-info').textContent='';$('export-error').hidden=false;$('export-error').textContent=error.message;}
}
$('export').onclick=()=>{$('export-dialog').showModal();prepareExport();};$('close-export').onclick=()=>$('export-dialog').close();$('export-dialog').addEventListener('close',stopExport);$('export-format').onchange=prepareExport;$('export-dpi').onchange=prepareExport;
$('download-export').onclick=()=>{if(exportBlob){download(exportBlob,filename($('export-format').value));toast('已开始下载');}};
$('save-as').onclick=async()=>{
 if(!exportBlob)return;const name=filename($('export-format').value);
 try{if(window.showSaveFilePicker){const handle=await window.showSaveFilePicker({suggestedName:name});const writable=await handle.createWritable();await writable.write(exportBlob);await writable.close();toast('文件已保存');}else{download(exportBlob,name);toast('浏览器已开始下载');}}catch(error){if(error.name!=='AbortError')toast(error.message);}
};
document.addEventListener('keydown',event=>{
 const editable=/INPUT|TEXTAREA|SELECT/.test(event.target.tagName);if(editable)return;
 if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'){event.preventDefault();event.shiftKey?redo():undo();}
 if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='s'){event.preventDefault();$('save-project').click();}
 if(event.key==='Escape'&&worker){cancelConversion();toast('转换已取消');}
 if(event.target.closest('[data-view]')&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)){event.preventDefault();commit();const d=event.shiftKey?5:1,p=project.positions[selected];if(event.key==='ArrowLeft')p[0]-=d;if(event.key==='ArrowRight')p[0]+=d;if(event.key==='ArrowUp')p[1]+=d;if(event.key==='ArrowDown')p[1]-=d;render();$('paper').querySelector(`[data-view="${selected}"]`).focus();}
});
await loadDemo(true);
