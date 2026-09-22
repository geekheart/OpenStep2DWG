import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createProject,validateProject,buildDrawing,drawingSVG,layoutProject,entityBounds} from '../src/model.js';
import {exportDXF,dxfEntityCounts} from '../src/dxf.js';
import init,{dxf_to_dwg,dwg_to_dxf} from '../engine/pkg/dwg.js';
const fixture=()=>JSON.parse(readFileSync(new URL('../assets/demo.json',import.meta.url)));
test('A4 automatic layout fits the frame and keeps millimetre dimensions',()=>{
 const p=fixture(),d=buildDrawing(p);assert.equal(d.width,297);assert.equal(d.height,210);
 for(const g of d.groups){assert.ok(g.bounds[0]>=25&&g.bounds[1]>=51&&g.bounds[2]<=292&&g.bounds[3]<=205);}
 assert.deepEqual(d.entities.filter(e=>e.type==='dimension').map(e=>Number(e.value.toFixed(2))),[56,28,6.6]);
 p.settings.scale=.7;p.settings.autoScale=false;layoutProject(p);
 assert.deepEqual(buildDrawing(p).entities.filter(e=>e.type==='dimension').map(e=>Number(e.value.toFixed(2))),[56,28,6.6]);
});
test('projects retain positions, rotation and curves; malformed coordinates are rejected',()=>{
 const p=fixture();p.geometry.options.rotation=270;p.positions.top=[50.5,100];assert.deepEqual(validateProject(JSON.parse(JSON.stringify(p))),p);
 const invalid=fixture();invalid.geometry.views[0].entities[0].p=[null,1];assert.throws(()=>validateProject(invalid));
});
test('title input is escaped and excluded from executable SVG content',()=>{
 const p=fixture();p.name='<script>alert(1)</script>';const svg=drawingSVG(p);assert.ok(svg.includes('&lt;script&gt;'));assert.ok(!svg.includes('<script>'));
});
test('DWG binary roundtrip preserves entity types including editable dimensions and native NURBS',async()=>{
 await init({module_or_path:readFileSync(new URL('../engine/pkg/dwg_bg.wasm',import.meta.url))});
 const p=fixture();p.geometry.views[0].entities.push({type:'spline',degree:2,knots:[0,0,0,1,1,1],poles:[[0,0],[5,10],[10,0]],weights:[1,.5,1],points:[[0,0],[5,3.3333],[10,0]]});
 const dxf=exportDXF(p),dwg=dxf_to_dwg(new TextEncoder().encode(dxf));assert.equal(new TextDecoder().decode(dwg.slice(0,6)),'AC1015');
 const decoded=new TextDecoder().decode(dwg_to_dxf(dwg));assert.deepEqual(dxfEntityCounts(decoded),dxfEntityCounts(dxf));assert.equal(dxfEntityCounts(decoded).DIMENSION,3);assert.equal(dxfEntityCounts(decoded).SPLINE,1);
});
test('empty views and invalid projects fail without overwriting a current document',()=>{assert.throws(()=>entityBounds([]));assert.throws(()=>validateProject({}));});
test('dimension labels clear dimension lines and short extension spans',()=>{
 for(const scale of [.02,.3,1,2]){
  const p=fixture();p.settings.scale=scale;p.settings.autoScale=false;layoutProject(p);
  for(const d of buildDrawing(p).entities.filter(e=>e.type==='dimension')){
   const label=d.items.find(e=>e.type==='text');
   if(d.axis==='y')assert.ok(label.p[0]<=d.base[0]-.79,'vertical baseline must be left of the dimension line');
   else assert.ok(label.p[1]>=d.base[1]+.79,'horizontal baseline must be above the dimension line');
   const axis=d.axis==='y'?1:0,half=label.text.length*label.height*.64/2;
   const low=label.p[axis]-half,high=label.p[axis]+half;
   const start=Math.min(d.p[axis],d.q[axis]),end=Math.max(d.p[axis],d.q[axis]);
   assert.ok((low>=start+.79&&high<=end-.79)||low>=end+.79,'text must not cross extension lines');
  }
 }
});
