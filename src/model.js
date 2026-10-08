import {localizedError,t} from './i18n.js';
export const APP_VERSION='1.0.1';
const TAU=Math.PI*2;
export const number=v=>Number(v.toFixed(7));
export const escapeXML=s=>String(s).replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]));
export function entityPoints(e) {
 if(e.type==='line')return[e.p,e.q];
 if(['spline','polyline'].includes(e.type))return e.points;
 if(e.type==='circle')return[[e.c[0]-e.r,e.c[1]-e.r],[e.c[0]+e.r,e.c[1]+e.r]];
 if(e.type==='arc'){
  const sweep=(e.end-e.start+TAU)%TAU,angles=[e.start,e.end];
  for(let a=0;a<TAU;a+=Math.PI/2)if((a-e.start+TAU)%TAU<=sweep)angles.push(a);
  return angles.map(a=>[e.c[0]+Math.cos(a)*e.r,e.c[1]+Math.sin(a)*e.r]);
 }
 return [];
}
export function entityBounds(entities) {
 const b=[Infinity,Infinity,-Infinity,-Infinity];
 for(const e of entities)for(const p of entityPoints(e)){b[0]=Math.min(b[0],p[0]);b[1]=Math.min(b[1],p[1]);b[2]=Math.max(b[2],p[0]);b[3]=Math.max(b[3],p[1]);}
 if(!b.every(Number.isFinite))throw localizedError('error.emptyGeometry');
 return b;
}
export function transformEntity(e,scale,dx,dy) {
 const p=([x,y])=>[x*scale+dx,y*scale+dy];
 const r={...e};
 for(const key of ['p','q','c'])if(e[key])r[key]=p(e[key]);
 for(const key of ['points','poles'])if(e[key])r[key]=e[key].map(p);
 if(e.r)r.r=e.r*scale;
 return r;
}
export function preferredScale(maximum) {
 const values=[];for(let e=-8;e<=8;e++)for(const v of [1,1.5,2,2.5,5])values.push(v*10**e);
 return values.filter(v=>v<=maximum+1e-10).at(-1)||maximum;
}
export function layoutProject(project) {
 const views=project.geometry.views;
 for(const v of views)v.bounds=entityBounds(v.entities);
 const top=views.find(v=>v.id==='top'),side=views.find(v=>v.id==='front'),second=views.find(v=>v.id==='bottom')||views.find(v=>v.id==='left');
 const width=v=>v.bounds[2]-v.bounds[0],height=v=>v.bounds[3]-v.bounds[1];
 const gap=26,rawW=width(top)+width(second),rawH=height(top)+height(side);
 const limit=Math.min((245-gap)/rawW,(126-gap)/rawH);
 if(project.settings.autoScale)project.settings.scale=preferredScale(limit);
 const s=project.settings.scale,ox=33+(245-rawW*s-gap)/2,oy=61+(126-rawH*s-gap)/2;
 const inspection=!!views.find(v=>v.id==='bottom');
 project.positions={
  top:[ox,inspection?oy+height(side)*s+gap:oy],
  front:[ox,inspection?oy:oy+height(top)*s+gap],
  [second.id]:[ox+width(top)*s+gap,inspection?oy+height(side)*s+gap:oy+height(top)*s+gap]
 };
 return project;
}
export function createProject(geometry,name='Untitled') {
 return layoutProject({format:'OpenStep2DWG',version:1,name,geometry,settings:{scale:1,autoScale:true,dimensions:true,frame:true,revision:'A',drawingNumber:name,date:new Date().toISOString().slice(0,10),lineWidth:.18},positions:{}});
}
export function validateProject(data) {
 if(data?.format!=='OpenStep2DWG'||data.version!==1)throw localizedError('error.projectFormat');
 if(typeof data.name!=='string'||data.name.length>200)throw localizedError('error.projectName');
 const views=data.geometry?.views;
 if(!Array.isArray(views)||views.length!==3||new Set(views.map(v=>v.id)).size!==3||!views.some(v=>v.id==='top')||!views.some(v=>v.id==='front')||!views.some(v=>['bottom','left'].includes(v.id)))throw localizedError('error.projectViews');
 let count=0;
 const point=p=>Array.isArray(p)&&p.length===2&&p.every(v=>Number.isFinite(v)&&Math.abs(v)<1e8);
 for(const v of views){
  if(!Array.isArray(v.entities)||(count+=v.entities.length)>300000)throw localizedError('error.tooManyEntities');
  for(const e of v.entities){
   if(!['line','circle','arc','spline','polyline'].includes(e.type))throw localizedError('error.curveType');
   if(e.type==='line'&&(!point(e.p)||!point(e.q)))throw localizedError('error.line');
   if(['circle','arc'].includes(e.type)&&(!point(e.c)||!Number.isFinite(e.r)||e.r<=0||e.r>1e8))throw localizedError('error.arc');
   if(e.type==='arc'&&![e.start,e.end].every(Number.isFinite))throw localizedError('error.arcAngles');
   if(['spline','polyline'].includes(e.type)&&(!Array.isArray(e.points)||e.points.length<2||e.points.length>100000||!e.points.every(point)))throw localizedError('error.curveCoordinates');
   if(e.type==='spline'&&(!Number.isInteger(e.degree)||e.degree<1||e.degree>25||!Array.isArray(e.poles)||!e.poles.every(point)||!Array.isArray(e.knots)||e.knots.length!==e.poles.length+e.degree+1||!e.knots.every((n,i)=>Number.isFinite(n)&&(!i||n>=e.knots[i-1]))||!Array.isArray(e.weights)||e.weights.length!==e.poles.length||!e.weights.every(w=>Number.isFinite(w)&&w>0)))throw localizedError('error.spline');
  }
  v.bounds=entityBounds(v.entities);
  if(!point(data.positions?.[v.id]))throw localizedError('error.position');
 }
 if(!Number.isFinite(data.settings?.scale)||data.settings.scale<=0||data.settings.scale>1e6)throw localizedError('error.scale');
 if(!Number.isFinite(data.settings.lineWidth)||data.settings.lineWidth<.05||data.settings.lineWidth>1)throw localizedError('error.lineWidth');
 for(const k of ['revision','drawingNumber','date'])if(typeof data.settings[k]!=='string'||data.settings[k].length>200)throw localizedError('error.titleBlock');
 return data;
}
const line=(p,q,layer='FRAME')=>({type:'line',p,q,layer});
const text=(value,p,height=2.3,width=100)=>({type:'text',text:String(value),p,height,width,layer:'TITLE'});
export function dimension(p,q,offset,axis,scale) {
 const vertical=axis==='y',a=vertical?[offset,p[1]]:[p[0],offset],b=vertical?[offset,q[1]]:[q[0],offset];
 const value=Math.abs(q[vertical?1:0]-p[vertical?1:0])/scale;
 const fontSize=2.2,gap=.8,arrowSize=1.6,labelText=value.toFixed(2),labelLength=labelText.length*fontSize*.64;
 const length=Math.hypot(b[0]-a[0],b[1]-a[1]);
 const sign=offset>p[vertical?0:1]?1:-1,ext=v=>vertical?[offset+sign*1.5,v[1]]:[v[0],offset+sign*1.5];
 const extStart=v=>vertical?[v[0]+sign*.8,v[1]]:[v[0],v[1]+sign*.8];
 const [dx,dy]=vertical?[0,1]:[1,0],outsideArrows=length<arrowSize*2+gap;
 const items=[line(extStart(p),ext(p),'DIMENSIONS'),line(extStart(q),ext(q),'DIMENSIONS')];
 items.push(line(outsideArrows?[a[0]-dx*2.5,a[1]-dy*2.5]:a,outsideArrows?[b[0]+dx*2.5,b[1]+dy*2.5]:b,'DIMENSIONS'));
 for(const [tip,direction] of [[a,1],[b,-1]]){const dir=outsideArrows?-direction:direction;for(const n of [-1,1])items.push(line(tip,[tip[0]+dir*dx*arrowSize+n*dy*.45,tip[1]+dir*dy*arrowSize+n*dx*.45],'DIMENSIONS'));}
 const middle=vertical?(a[1]+b[1])/2:(a[0]+b[0])/2;
 const labelPosition=length<labelLength+gap*2?(vertical?Math.max(a[1],b[1]):Math.max(a[0],b[0]))+gap+labelLength/2:middle;
 // A vertical label's glyphs extend to the LEFT of its baseline after rotation.
 // Put the baseline on that side as well, with a real paper-space gap.
 const label=text(labelText,vertical?[offset-gap,labelPosition]:[labelPosition,offset+gap],fontSize,30);
 label.align='center';label.rotation=vertical?90:0;label.layer='DIMENSIONS';items.push(label);
 return {type:'dimension',p,q,base:a,axis,scale,value,items,layer:'DIMENSIONS'};
}
export function buildDrawing(project) {
 const entities=[],groups=[],s=project.settings.scale,add=e=>entities.push(e);
 const rectangle=(x,y,w,h)=>{[[[x,y],[x+w,y]],[[x+w,y],[x+w,y+h]],[[x+w,y+h],[x,y+h]],[[x,y+h],[x,y]]].forEach(([a,b])=>add(line(a,b)));};
 if(project.settings.frame){
  rectangle(25,5,267,200);rectangle(172,5,120,46);
  for(const y of [16,27,38])add(line([172,y],[292,y]));
  for(const x of [220,256])add(line([x,5],[x,27]));
  add(text(project.name,[175,42],3.2,114));add(text(project.settings.drawingNumber,[175,31],2.5,114));
  for(const [x,label,value,width] of [[175,'SCALE',s>=1?`${s}:1`:`1:${number(1/s)}`,41],[223,'UNIT','mm',29],[259,'REV',project.settings.revision,30]]){add(text(label,[x,23],1.7,width));add(text(value,[x,18.4],2.3,width));}
  for(const [x,label,value,width] of [[175,'DATE',project.settings.date,41],[223,'FORMAT','A4 / 1 OF 1',29],[259,'SOURCE','STEP',30]]){add(text(label,[x,12.2],1.7,width));add(text(value,[x,7.3],2.3,width));}
  add(text('DIMENSIONS IN mm',[33,14],2));add(text(project.geometry.views.some(v=>v.id==='bottom')?'TOP / BOTTOM / FRONT':'FIRST ANGLE PROJECTION',[33,9],2));
 }
 for(const view of project.geometry.views){
  const [x,y]=project.positions[view.id],b=view.bounds||entityBounds(view.entities),w=(b[2]-b[0])*s,h=(b[3]-b[1])*s;
  const items=view.entities.map(e=>({...transformEntity(e,s,x-b[0]*s,y-b[1]*s),layer:view.id.toUpperCase()}));
  groups.push({id:view.id,bounds:[x,y,x+w,y+h],entities:items});
  for(const item of items)entities.push(item);add(text(view.id.toUpperCase(),[x,y+h+4],2.2));
  if(project.settings.dimensions){
   if(view.id===(project.geometry.views.some(v=>v.id==='bottom')?'bottom':'top')){
    add(dimension([x,y],[x+w,y],y-9,'x',s));add(dimension([x+w,y],[x+w,y+h],x+w+8,'y',s));
   }
   if(view.id==='front')add(dimension([x+w,y],[x+w,y+h],x+w+8,'y',s));
  }
 }
 return {entities,groups,width:297,height:210};
}
export function entitySVG(e) {
 const n=number,p=xy=>xy.map(n).join(' ');
 if(e.type==='line')return `<path d="M${p(e.p)}L${p(e.q)}"/>`;
 if(e.type==='circle')return `<circle cx="${n(e.c[0])}" cy="${n(e.c[1])}" r="${n(e.r)}"/>`;
 if(e.type==='arc'){
  const at=a=>[e.c[0]+Math.cos(a)*e.r,e.c[1]+Math.sin(a)*e.r];
  return `<path d="M${p(at(e.start))}A${n(e.r)} ${n(e.r)} 0 ${(e.end-e.start+TAU)%TAU>Math.PI?1:0} 1 ${p(at(e.end))}"/>`;
 }
 if(['spline','polyline'].includes(e.type))return `<path d="M${e.points.map(p).join('L')}"/>`;
 if(e.type==='text'){
  const width=Math.min(e.width||100,e.text.length*e.height*.64);
  return `<text transform="translate(${p(e.p)}) rotate(${e.rotation||0}) scale(1 -1)" font-size="${e.height}" text-anchor="${e.align==='center'?'middle':'start'}" ${width < e.text.length*e.height*.54 ? `textLength="${n(width)}" lengthAdjust="spacingAndGlyphs"` : ''}>${escapeXML(e.text)}</text>`;
 }
 if(e.type==='dimension')return e.items.map(entitySVG).join('');
 return '';
}
export function drawingSVG(project,{interactive=false}={}) {
 const drawing=buildDrawing(project),outline=project.settings.lineWidth;
 const style=`path,circle{fill:none;stroke:#17202a;stroke-width:${outline};stroke-linecap:round;stroke-linejoin:round}text{fill:#17202a;stroke:none;font-family:Arial,Helvetica,sans-serif}`;
 const geometryLayers=new Set(project.geometry.views.map(v=>v.id.toUpperCase()));
 const other=drawing.entities.filter(e=>!geometryLayers.has(e.layer));
 let body=other.map(entitySVG).join('');
 for(const group of drawing.groups){
  const [x,y,x1,y1]=group.bounds;
  body+=`<g ${interactive?`data-view="${group.id}" tabindex="0" role="button" aria-label="${t('viewSelected',{view:t(`view.${group.id}`)})}"`:''}>${group.entities.map(entitySVG).join('')}${interactive?`<rect class="view-hit" x="${x-1}" y="${y-1}" width="${x1-x+2}" height="${y1-y+2}" fill="transparent" stroke="none"/><rect class="view-outline" x="${x-1}" y="${y-1}" width="${x1-x+2}" height="${y1-y+2}" fill="none" stroke="#147d71" stroke-width=".3" stroke-dasharray="2 1"/>`:''}</g>`;
 }
 return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 297 210" width="297mm" height="210mm" aria-label="${t('a4Drawing')}"><style>${style}</style><rect width="297" height="210" fill="white"/><g transform="translate(0 210) scale(1 -1)">${body}</g></svg>`;
}
