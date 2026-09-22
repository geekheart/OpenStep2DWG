import init from 'opencascade.js/dist/node.js';
import { readFileSync } from 'node:fs';
const oc=await init({module:{wasmBinary:readFileSync(new URL('../node_modules/opencascade.js/dist/opencascade.full.wasm',import.meta.url))}});
console.log('OCCT loaded');
const shape=new oc.BRepPrimAPI_MakeBox_2(10,20,3).Shape();
for(const [name,normal,right] of [['top',[0,0,1],[1,0,0]],['bottom',[0,0,-1],[-1,0,0]],['front',[0,-1,0],[1,0,0]]]){
 const algo=new oc.HLRBRep_Algo_1();
 algo.Add_2(shape,0);
 const ax=new oc.gp_Ax2_2(new oc.gp_Pnt_3(0,0,0),new oc.gp_Dir_4(...normal),new oc.gp_Dir_4(...right));
 algo.Projector_1(new oc.HLRAlgo_Projector_2(ax));algo.Update();algo.Hide_1();
 const h=new oc.Handle_HLRBRep_Algo_2(algo), conv=new oc.HLRBRep_HLRToShape(h);
 const projected=conv.VCompound_1();
 const ex=new oc.TopExp_Explorer_2(projected,oc.TopAbs_ShapeEnum.TopAbs_EDGE,oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
 let n=0;
 for(;ex.More();ex.Next()){
  const e=oc.TopoDS.Edge_1(ex.Current()),c=new oc.BRepAdaptor_Curve_2(e),p=c.Value(c.FirstParameter()),q=c.Value(c.LastParameter());
  console.log(name,c.GetType().value,[p.X(),p.Y(),p.Z()],[q.X(),q.Y(),q.Z()]);n++;
 }
 console.log(name,n);
}
