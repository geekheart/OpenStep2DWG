import {buildDrawing,number} from './model.js';
const encodeText=s=>String(s).replace(/[\r\n\t]/g,' ').replace(/[^\x20-\x7e]/g,c=>`\\U+${c.charCodeAt(0).toString(16).padStart(4,'0').toUpperCase()}`);
export function exportDXF(project) {
 const drawing=buildDrawing(project),output=[],blocks=[],dimensions=drawing.entities.filter(e=>e.type==='dimension');
 let target=output,handle=256;
 const emit=(...pairs)=>{for(let i=0;i<pairs.length;i+=2)target.push(String(pairs[i]),typeof pairs[i+1]==='number'?String(number(pairs[i+1])):String(pairs[i+1]));};
 const point=(code,p)=>emit(code,p[0],code+10,p[1],code+20,0);
 const base=(type,e,subclass)=>emit(0,type,5,(handle++).toString(16),100,'AcDbEntity',8,e.layer||'0',100,subclass);
 const write=e=>{
  if(e.type==='line'){base('LINE',e,'AcDbLine');point(10,e.p);point(11,e.q);}
  else if(e.type==='circle'||e.type==='arc'){
   base(e.type.toUpperCase(),e,'AcDbCircle');point(10,e.c);emit(40,e.r);
   if(e.type==='arc')emit(100,'AcDbArc',50,e.start*180/Math.PI,51,e.end*180/Math.PI);
  }else if(e.type==='spline'){
   base('SPLINE',e,'AcDbSpline');emit(70,e.weights.some(w=>Math.abs(w-1)>1e-10)?12:8,71,e.degree,72,e.knots.length,73,e.poles.length,74,0,42,1e-10,43,1e-10,44,1e-10);
   for(const k of e.knots)emit(40,k);if(e.weights.some(w=>Math.abs(w-1)>1e-10))for(const w of e.weights)emit(41,w);for(const p of e.poles)point(10,p);
  }else if(e.type==='polyline'){
   base('LWPOLYLINE',e,'AcDbPolyline');emit(90,e.points.length,70,0);for(const p of e.points)emit(10,p[0],20,p[1]);
  }else if(e.type==='text'){
   base('TEXT',e,'AcDbText');point(10,e.p);emit(40,e.height,1,encodeText(e.text),41,Math.min(1,(e.width||100)/(Math.max(1,e.text.length)*e.height*.64)),50,e.rotation||0,7,'STANDARD',72,e.align==='center'?1:0);point(11,e.p);emit(100,'AcDbText',73,0);
  }else if(e.type==='dimension'){
   const index=dimensions.indexOf(e);
   base('DIMENSION',e,'AcDbDimension');emit(2,`*D${index+1}`);point(10,e.base);
   const label=e.items.find(i=>i.type==='text');point(11,label.p);
   emit(70,32,1,e.value.toFixed(2),3,`SCALE_${index+1}`,100,'AcDbAlignedDimension');point(13,e.p);point(14,e.q);emit(50,e.axis==='y'?90:0,100,'AcDbRotatedDimension');
  }
 };
 emit(0,'SECTION',2,'HEADER',9,'$ACADVER',1,'AC1015',9,'$DWGCODEPAGE',3,'ANSI_1252',9,'$INSUNITS',70,4,9,'$MEASUREMENT',70,1,9,'$LUNITS',70,2,9,'$LUPREC',70,2,9,'$EXTMIN',10,0,20,0,30,0,9,'$EXTMAX',10,297,20,210,30,0,0,'ENDSEC');
 emit(0,'SECTION',2,'TABLES');
 emit(0,'TABLE',2,'LTYPE',70,1,0,'LTYPE',2,'CONTINUOUS',70,0,3,'Solid line',72,65,73,0,40,0,0,'ENDTAB');
 const layers=['0','FRAME','TITLE','DIMENSIONS',...project.geometry.views.map(v=>v.id.toUpperCase())];
 emit(0,'TABLE',2,'LAYER',70,layers.length);
 for(const layer of layers)emit(0,'LAYER',2,layer,70,0,62,7,6,'CONTINUOUS',370,layer==='FRAME'?35:Math.round(project.settings.lineWidth*100));
 emit(0,'ENDTAB',0,'TABLE',2,'STYLE',70,1,0,'STYLE',2,'STANDARD',70,0,40,0,41,1,50,0,71,0,42,2.5,3,'Arial.ttf',4,'',0,'ENDTAB');
 emit(0,'TABLE',2,'DIMSTYLE',70,dimensions.length+1);
 for(let i=0;i<=dimensions.length;i++)emit(0,'DIMSTYLE',2,i?`SCALE_${i}`:'STANDARD',70,0,40,1,41,1.6,42,.8,44,1.5,140,2.2,144,1/project.settings.scale,147,.8,77,1,271,2,278,46);
 emit(0,'ENDTAB',0,'TABLE',2,'VPORT',70,1,0,'VPORT',2,'*ACTIVE',70,0,10,0,20,0,11,1,21,1,12,148.5,22,105,40,220,41,297/210,0,'ENDTAB',0,'ENDSEC');
 emit(0,'SECTION',2,'BLOCKS');
 target=blocks;
 dimensions.forEach((d,i)=>{
  emit(0,'BLOCK',5,(handle++).toString(16),100,'AcDbEntity',8,'DIMENSIONS',100,'AcDbBlockBegin',2,`*D${i+1}`,70,1,10,0,20,0,30,0,3,`*D${i+1}`,1,'');
  d.items.forEach(write);emit(0,'ENDBLK',5,(handle++).toString(16),100,'AcDbEntity',8,'DIMENSIONS',100,'AcDbBlockEnd');
 });
 target=output;output.push(...blocks);emit(0,'ENDSEC',0,'SECTION',2,'ENTITIES');drawing.entities.forEach(write);emit(0,'ENDSEC',0,'EOF');
 return output.join('\n')+'\n';
}
// Counts model-space entities only. Used to guard against lossy DWG roundtrips.
export function dxfEntityCounts(text) {
 const rows=text.split(/\r?\n/),result={};let section='',inEntities=false;
 for(let i=0;i+1<rows.length;i+=2){
  const code=Number(rows[i]),value=rows[i+1].trim();
  if(code===0&&value==='SECTION'){section='pending';continue;}
  if(section==='pending'&&code===2){section=value;inEntities=value==='ENTITIES';continue;}
  if(code===0&&value==='ENDSEC'){inEntities=false;section='';}
  else if(inEntities&&code===0)result[value]=(result[value]||0)+1;
 }
 return result;
}
