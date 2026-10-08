import {localizedError,reportMessage} from './i18n.js';
// OpenCascade adapters. This module also runs under Node for reproducible geometry tests.
const TAU = Math.PI * 2;
const xy = p => { const r=[p.X(),p.Y()];p.delete();return r; };
const xyz = p => {const r=[p.X(),p.Y(),p.Z()];p.delete();return r;};
export function bounds(oc, shape) {
  const b=new oc.Bnd_Box_1();
  try {oc.BRepBndLib.AddOptimal(shape,b,false,false);return [xyz(b.CornerMin()),xyz(b.CornerMax())];}
  finally {b.delete();}
}
export function readStep(oc, bytes, report=()=>{}) {
  const filename='/source.step', reader=new oc.STEPControl_Reader_1(),progress=new oc.Message_ProgressRange_1();
  oc.FS.writeFile(filename,bytes);
  try {
    reportMessage(report,'progress.parse',10);
    if(reader.ReadFile(filename).value!==oc.IFSelect_ReturnStatus.IFSelect_RetDone.value) throw localizedError('error.readStep');
    reader.SetSystemLengthUnit(1);
    reportMessage(report,'progress.solids',16);
    if(!reader.TransferRoots(progress)) throw localizedError('error.noGeometry');
    const shape=reader.OneShape();
    if(shape.IsNull()) throw localizedError('error.emptyModel');
    return shape;
  } finally {reader.delete();progress.delete();oc.FS.unlink(filename);}
}
export function writeBREP(oc,shape){
  const path='/projection.brep',progress=new oc.Message_ProgressRange_1();
  try{if(!oc.BRepTools.Write_3(shape,path,progress))throw localizedError('error.writeSnapshot');return oc.FS.readFile(path);}
  finally{progress.delete();if(oc.FS.analyzePath(path).exists)oc.FS.unlink(path);}
}
export function readBREP(oc,bytes){
  const path='/projection.brep',shape=new oc.TopoDS_Shape(),builder=new oc.BRep_Builder(),progress=new oc.Message_ProgressRange_1();
  try{oc.FS.writeFile(path,bytes);if(!oc.BRepTools.Read_2(shape,path,builder,progress)||shape.IsNull())throw localizedError('error.readSnapshot');return shape;}
  catch(error){shape.delete();throw error;}
  finally{builder.delete();progress.delete();if(oc.FS.analyzePath(path).exists)oc.FS.unlink(path);}
}
// Only discard thin artwork lying on a dominant planar body's faces, preserving the envelope.
export function mechanicalShape(oc,shape,tolerance=.08) {
  let board=null,area=0,removed=0;
  const ex=new oc.TopExp_Explorer_2(shape,oc.TopAbs_ShapeEnum.TopAbs_SOLID,oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
  for(;ex.More();ex.Next()) {
    const s=ex.Current(), b=bounds(oc,s);s.delete();
    const [x,y,z]=b[1].map((v,i)=>v-b[0][i]);
    if(z>0 && z<Math.min(x,y)*.15 && x*y>area) {area=x*y;board=b;}
  }
  ex.delete();
  if(!board)return {shape,removed};
  const builder=new oc.BRep_Builder();
  function visit(s) {
    const type=s.ShapeType().value;
    if(type===oc.TopAbs_ShapeEnum.TopAbs_COMPOUND.value || type===oc.TopAbs_ShapeEnum.TopAbs_COMPSOLID.value) {
      const result=new oc.TopoDS_Compound();builder.MakeCompound(result);
      const iter=new oc.TopoDS_Iterator_2(s,true,true);
      for(;iter.More();iter.Next()) {
        const child=iter.Value(), kept=visit(child);
        if(kept) builder.Add(result,kept);
        if(kept && kept!==child)kept.delete();
        child.delete();
      }
      iter.delete();return result;
    }
    const b=bounds(oc,s);
    const near=Math.min(...[b[0][2],b[1][2]].flatMap(z=>[Math.abs(z-board[0][2]),Math.abs(z-board[1][2])]))<=tolerance;
    const inside=[0,1].every(i=>b[0][i]>=board[0][i]-tolerance && b[1][i]<=board[1][i]+tolerance);
    if(b[1][2]-b[0][2]<=tolerance && near && inside){removed++;return null;}
    return s;
  }
  try {
    const result=visit(shape),before=bounds(oc,shape),after=bounds(oc,result);
    if(before.flat().some((v,i)=>Math.abs(v-after.flat()[i])>1e-5)) {result.delete();throw localizedError('error.simplifyBounds');}
    return {shape:result,removed};
  } finally {builder.delete();}
}
function sample(oc,c,a,b,tolerance) {
  const s=new oc.GCPnts_QuasiUniformDeflection_4(c,tolerance,a,b,oc.GeomAbs_Shape.GeomAbs_C0);
  try {
    if(!s.IsDone() || s.NbPoints()>100000)throw localizedError('error.sampleCurve');
    return Array.from({length:s.NbPoints()},(_,i)=>xy(s.Value(i+1)));
  } finally {s.delete();}
}
function extract(oc,edge,tolerance) {
  const c=new oc.BRepAdaptor_Curve_2(edge);
  try {
    const a=c.FirstParameter(), b=c.LastParameter(), type=c.GetType().value;
    if(!Number.isFinite(a+b))throw localizedError('error.infiniteCurve');
    const p=xy(c.Value(a)),q=xy(c.Value(b));
    if(type===oc.GeomAbs_CurveType.GeomAbs_Line.value) {
      if(Math.hypot(q[0]-p[0],q[1]-p[1])<1e-8)return null;
      return {type:'line',p,q};
    }
    if(type===oc.GeomAbs_CurveType.GeomAbs_Circle.value) {
      const circle=c.Circle(),center=xy(circle.Location()),r=circle.Radius();circle.delete();
      if(Math.abs(b-a-TAU)<1e-7 || c.IsClosed())return {type:'circle',c:center,r};
      const m=xy(c.Value((a+b)/2)),angle=v=>(Math.atan2(v[1]-center[1],v[0]-center[0])+TAU)%TAU;
      let start=angle(p),end=angle(q);
      if((angle(m)-start+TAU)%TAU>(end-start+TAU)%TAU)[start,end]=[end,start];
      return {type:'arc',c:center,r,start,end};
    }
    const points=sample(oc,c,a,b,tolerance);
    let handle=null;
    const isSpline=type===oc.GeomAbs_CurveType.GeomAbs_BSplineCurve.value;
    if(isSpline)handle=c.BSpline();
    else if(c.Is3DCurve()) {
      const adaptor=c.Curve(),original=adaptor.Curve();
      const trimmed=new oc.Geom_TrimmedCurve(original,a,b,true,true),trsf=c.Trsf();
      trimmed.Transform(trsf);
      const trimmedHandle=new oc.Handle_Geom_Curve_2(trimmed);
      try {handle=oc.GeomConvert.CurveToBSplineCurve(trimmedHandle,oc.Convert_ParameterisationType.Convert_TgtThetaOver2);}
      catch { /* Unsupported analytic curve: explicit tolerance-controlled fallback below. */ }
      finally {trimmedHandle.delete();trsf.delete();original.delete();adaptor.delete();}
    }
    if(handle && !handle.IsNull()) {
      const bs=handle.get();
      try {
        if(isSpline)bs.Segment(a,b,1e-10);if(bs.IsPeriodic())bs.SetNotPeriodic();
        const knots=[],poles=[],weights=[];
        const first=bs.Knot(1),range=bs.Knot(bs.NbKnots())-first;
        if(range<=0)throw localizedError('error.splineKnots');
        for(let i=1;i<=bs.NbKnots();i++)for(let j=0;j<bs.Multiplicity(i);j++)knots.push((bs.Knot(i)-first)/range);
        for(let i=1;i<=bs.NbPoles();i++){poles.push(xy(bs.Pole(i)));weights.push(bs.Weight(i));}
        return {type:'spline',degree:bs.Degree(),knots,poles,weights,points};
      } finally {handle.delete();}
    }
    handle?.delete();
    // Unsupported curves are explicitly reported as approximated.
    return {type:'polyline',points,approximated:true};
  } finally {c.delete();}
}
export const VIEW_AXES={top:[[0,0,1],[1,0,0]],bottom:[[0,0,-1],[-1,0,0]],front:[[0,-1,0],[1,0,0]],left:[[-1,0,0],[0,-1,0]]};
export class EmptyProjectionError extends Error {
  constructor(view,rotation){
    const translated=localizedError('error.emptyProjection',{viewId:view,rotation});
    super(translated.message);Object.assign(this,{messageKey:translated.messageKey,values:translated.values});
    this.code='EMPTY_PROJECTION';this.view=view;
  }
}
export function projectView(oc,shape,name,rotation=0,tolerance=.01) {
  const theta=-rotation*Math.PI/180;
  const rotate=([x,y,z])=>[x*Math.cos(theta)-y*Math.sin(theta),x*Math.sin(theta)+y*Math.cos(theta),z];
  const [normal,right]=VIEW_AXES[name].map(rotate);
  const algo=new oc.HLRBRep_Algo_1(),point=new oc.gp_Pnt_3(0,0,0),dir=new oc.gp_Dir_4(...normal),xdir=new oc.gp_Dir_4(...right);
  const axes=new oc.gp_Ax2_2(point,dir,xdir),proj=new oc.HLRAlgo_Projector_2(axes);
  const handle=new oc.Handle_HLRBRep_Algo_2(algo);let conv=null;
  const entities=[],seen=new Set();
  try {
    algo.Add_2(shape,0);algo.Projector_1(proj);algo.Update();algo.Hide_1();
    conv=new oc.HLRBRep_HLRToShape(handle);
    for(const method of ['VCompound_1','Rg1LineVCompound_1','RgNLineVCompound_1','OutLineVCompound_1','IsoLineVCompound_1']) {
      const projected=conv[method]();
      if(projected.IsNull()){projected.delete();continue;}
      const ex=new oc.TopExp_Explorer_2(projected,oc.TopAbs_ShapeEnum.TopAbs_EDGE,oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
      try {for(;ex.More();ex.Next()) {
        const raw=ex.Current(),edge=oc.TopoDS.Edge_1(raw);
        try {const e=extract(oc,edge,tolerance);if(e){const key=JSON.stringify(e);if(!seen.has(key)){seen.add(key);entities.push(e);}}}
        finally{edge.delete();raw.delete();}
      }} finally {ex.delete();projected.delete();}
    }
    if(!entities.length)throw new EmptyProjectionError(name,rotation);
    return {id:name,entities};
  } finally {
    conv?.delete();handle.delete();proj.delete();axes.delete();point.delete();dir.delete();xdir.delete();
  }
}
// One parsed model per Worker; changing the view set only computes missing views.
export function createStepSession(oc,bytes,progress=()=>{}) {
  const raw=readStep(oc,bytes,progress);
  let envelope,mechanical=null,disposed=false;
  try {reportMessage(progress,'progress.bounds',22);envelope=bounds(oc,raw);}
  catch(error){raw.delete();throw error;}
  const projections=new Map();
  const projectionKey=(options,name)=>JSON.stringify([options.detail||'full',name,options.rotation||0,options.tolerance||.01]);
  function selectShape(options,report=()=>{}){
    if(disposed)throw localizedError('error.disposed');
    if(options.detail==='mechanical'){
      if(!mechanical){reportMessage(report,'progress.simplify',25);mechanical=mechanicalShape(oc,raw);}
      return mechanical;
    }
    return {shape:raw,removed:0};
  }
  return {
    snapshot(options={}){return writeBREP(oc,selectShape(options).shape);},
    remember(options,view){
      if(disposed)throw localizedError('error.disposed');
      if(!VIEW_AXES[view?.id]||!view.entities?.length)throw localizedError('error.restoredProjection');
      projections.set(projectionKey(options,view.id),{...view,isolated:true});
    },
    convert(options={},report=()=>{}) {
      const {shape,removed}=selectShape(options,report);
      const names=options.views||['top','bottom','front'],views=[];
      for(let i=0;i<names.length;i++){
        const name=names[i],key=projectionKey(options,name);
        const cached=projections.get(key);
        reportMessage(report,cached?'progress.reuseView':'progress.project',30+i/names.length*60,{viewId:name,index:i+1,total:names.length});
        const view=cached||projectView(oc,shape,name,options.rotation||0,options.tolerance||.01);
        projections.delete(key);projections.set(key,view);
        if(projections.size>12)projections.delete(projections.keys().next().value);
        views.push(view);
      }
      const approximated=views.reduce((n,v)=>n+v.entities.filter(e=>e.approximated).length,0);
      reportMessage(report,'progress.layout',100);
      return {views,envelope,removed,approximated,unit:'mm',options};
    },
    dispose(){if(disposed)return;disposed=true;projections.clear();if(mechanical&&mechanical.shape!==raw)mechanical.shape.delete();raw.delete();}
  };
}
export function convertStep(oc,bytes,options={},progress=()=>{}) {
  const session=createStepSession(oc,bytes,progress);
  try{return session.convert(options,progress);}finally{session.dispose();}
}
