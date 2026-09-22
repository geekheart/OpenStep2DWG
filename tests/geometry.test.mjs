import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import init from 'opencascade.js/dist/node.js';
import {readStep,projectView,createStepSession,writeBREP,readBREP} from '../src/occt-kernel.js';
import {entityBounds} from '../src/model.js';
import {createHash} from 'node:crypto';
test('STEP exact projection: analytic holes, hidden edges, rotation and three orthogonal views',async()=>{
 const oc=await init({module:{wasmBinary:readFileSync(new URL('../node_modules/opencascade.js/dist/opencascade.full.wasm',import.meta.url))}});
 const shape=readStep(oc,readFileSync(new URL('../assets/demo.step',import.meta.url)));
 const top=projectView(oc,shape,'top'),bottom=projectView(oc,shape,'bottom'),front=projectView(oc,shape,'front'),rotated=projectView(oc,shape,'top',90);
 const size=v=>{const b=entityBounds(v.entities);return [b[2]-b[0],b[3]-b[1]].map(x=>Number(x.toFixed(3)));};
 assert.deepEqual(size(top),[56,28]);assert.deepEqual(size(bottom),[56,28]);assert.deepEqual(size(front),[56,6.6]);assert.deepEqual(size(rotated),[28,56]);
 assert.equal(top.entities.filter(e=>e.type==='circle').length,40);assert.equal(bottom.entities.filter(e=>e.type==='circle').length,40);assert.equal(front.entities.filter(e=>e.type==='circle').length,0);
 assert.ok(top.entities.length>bottom.entities.length);shape.delete();
 assert.throws(()=>readStep(oc,new TextEncoder().encode('not a STEP file')));
 const stages=[],session=createStepSession(oc,readFileSync(new URL('../assets/demo.step',import.meta.url)),s=>stages.push(s));
 const initial=session.convert({views:['top','bottom','front']});
 assert.deepEqual(initial.views[0],top);
 stages.length=0;
 const changed=session.convert({views:['top','front','left']},s=>stages.push(s));
 assert.equal(changed.views[0],initial.views[0]);assert.equal(changed.views[1],initial.views[2]);
 assert.equal(stages.filter(s=>s.startsWith('计算')).length,1);assert.ok(stages.some(s=>s.startsWith('计算左侧')));
 const turned=session.convert({rotation:90});assert.deepEqual(turned.views[0],rotated);
 assert.notEqual(turned.views[0],initial.views[0]);
 const detailed=session.convert({detail:'mechanical'});assert.notEqual(detailed.views[0],initial.views[0]);
 session.dispose();session.dispose();assert.throws(()=>session.convert(),/模型已释放/);
});
test('curved geometry remains unchanged and projection does not depend on earlier view directions',async()=>{
 const oc=await init({module:{wasmBinary:readFileSync(new URL('../node_modules/opencascade.js/dist/opencascade.full.wasm',import.meta.url))}});
 const maker=new oc.BRepPrimAPI_MakeTorus_1(5,1),primitive=maker.Shape(),nurbs=new oc.BRepBuilderAPI_NurbsConvert_2(primitive,true),shape=nurbs.Shape(),progress=new oc.Message_ProgressRange_1();
 const signature=()=>{oc.BRepTools.Write_3(shape,'/unchanged.brep',progress);return createHash('sha256').update(oc.FS.readFile('/unchanged.brep')).digest('hex');};
 try{
  const original=signature(),front=projectView(oc,shape,'front');
  for(const view of ['top','bottom','left'])assert.ok(projectView(oc,shape,view).entities.length>0);
  assert.deepEqual(projectView(oc,shape,'front'),front);
  for(const rotation of [90,180,270])assert.ok(projectView(oc,shape,'front',rotation).entities.length>0);
  assert.equal(signature(),original);
  const restored=readBREP(oc,writeBREP(oc,shape));
  try{
   // Reading BREP resets face status flags; the native curves and surfaces
   // before TShapes must remain identical, including NURBS poles and weights.
   const geometricRecords=model=>{const text=new TextDecoder().decode(writeBREP(oc,model));assert.ok(text.includes('\nTShapes '));return text.split('\nTShapes ')[0];};
   assert.equal(geometricRecords(restored),geometricRecords(shape));
   // Check the known torus silhouette rather than HLR edge splitting: seen
   // from the side it is a capsule with radius 1 and centre span [-5, 5].
   const roundtrip=projectView(oc,restored,'front');
   assert.ok(roundtrip.entities.some(e=>e.type==='spline'));
   const expected=entityBounds(front.entities),actual=entityBounds(roundtrip.entities);
   assert.ok(expected.every((v,i)=>Math.abs(v-actual[i])<1e-7));
   const segments=view=>view.entities.flatMap(e=>e.points.slice(1).map((p,i)=>[e.points[i],p]));
   const distance=(p,[a,b])=>{const dx=b[0]-a[0],dy=b[1]-a[1],length=dx*dx+dy*dy,t=length?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/length)):0;return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);};
   const edges=segments(roundtrip),covered=p=>assert.ok(Math.min(...edges.map(edge=>distance(p,edge)))<=.02,`Missing silhouette near ${p}`);
   for(let i=0;i<=100;i++){
    const t=-Math.PI/2+Math.PI*i/100;
    covered([5+Math.cos(t),Math.sin(t)]);covered([-5-Math.cos(t),Math.sin(t)]);
    covered([-5+i/10,1]);covered([-5+i/10,-1]);
   }
  }finally{restored.delete();}
 }finally{progress.delete();shape.delete();nurbs.delete();primitive.delete();maker.delete();oc.FS.unlink('/unchanged.brep');}
});
