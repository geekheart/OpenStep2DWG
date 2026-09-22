import init from 'opencascade.js/dist/node.js';
import {readFileSync,writeFileSync} from 'node:fs';
import {convertStep} from '../src/occt-kernel.js';
import {createProject} from '../src/model.js';
import {exportDXF} from '../src/dxf.js';
const oc=await init({module:{wasmBinary:readFileSync(new URL('../node_modules/opencascade.js/dist/opencascade.full.wasm',import.meta.url))}});
const point=(x,y,z)=>new oc.gp_Pnt_3(x,y,z),progress=new oc.Message_ProgressRange_1();
let board=new oc.BRepPrimAPI_MakeBox_2(56,28,1.6).Shape();
for(const y of [2.57,25.43])for(let i=0;i<20;i++) {
 const axis=new oc.gp_Ax2_3(point(3.87+i*2.54,y,-1),new oc.gp_Dir_4(0,0,1));
 const hole=new oc.BRepPrimAPI_MakeCylinder_3(axis,.55,4).Shape();
 const cut=new oc.BRepAlgoAPI_Cut_3(board,hole,progress);board=cut.Shape();
}
const assembly=new oc.TopoDS_Compound(),builder=new oc.BRep_Builder();builder.MakeCompound(assembly);builder.Add(assembly,board);
for(const [x,y,z,w,h,d] of [[15,6,1.6,27,16,3.5],[0,8,1.6,8,12,3],[45,8,1.6,7,12,5],[6,8,1.6,5,5,2],[6,17,1.6,5,5,2]])builder.Add(assembly,new oc.BRepPrimAPI_MakeBox_3(point(x,y,z),w,h,d).Shape());
const writer=new oc.STEPControl_Writer_1();writer.Transfer(assembly,oc.STEPControl_StepModelType.STEPControl_AsIs,true,progress);writer.Write('/demo.step');
const bytes=oc.FS.readFile('/demo.step');writeFileSync(new URL('../assets/demo.step',import.meta.url),new TextDecoder().decode(bytes).replace(/[ \t]+$/gm,'').trimEnd()+'\n');
const geometry=convertStep(oc,bytes,{detail:'full',rotation:0,views:['top','bottom','front'],tolerance:.01},console.log);
const project=createProject(geometry,'DEMO-BOARD');
writeFileSync(new URL('../assets/demo.json',import.meta.url),JSON.stringify(project));
writeFileSync('/private/tmp/openstep-demo.dxf',exportDXF(project));
console.log('Demo ready',bytes.length,geometry.views.map(v=>[v.id,v.entities.length]));
