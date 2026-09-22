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
    report('本地解析 STEP',10);
    if(reader.ReadFile(filename).value!==oc.IFSelect_ReturnStatus.IFSelect_RetDone.value) throw new Error('无法读取 STEP 文件');
    reader.SetSystemLengthUnit(1);
    report('构建实体几何',16);
    if(!reader.TransferRoots(progress)) throw new Error('STEP 中没有可转换的几何体');
    const shape=reader.OneShape();
    if(shape.IsNull()) throw new Error('STEP 模型为空');
    return shape;
  } finally {reader.delete();progress.delete();oc.FS.unlink(filename);}
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
    if(before.flat().some((v,i)=>Math.abs(v-after.flat()[i])>1e-5)) {result.delete();throw new Error('简化改变了模型外形尺寸，请使用完整细节');}
    return {shape:result,removed};
  } finally {builder.delete();}
}
function sample(oc,c,a,b,tolerance) {
  const s=new oc.GCPnts_QuasiUniformDeflection_4(c,tolerance,a,b,oc.GeomAbs_Shape.GeomAbs_C0);
  try {
    if(!s.IsDone() || s.NbPoints()>100000)throw new Error('曲线采样失败');
    return Array.from({length:s.NbPoints()},(_,i)=>xy(s.Value(i+1)));
  } finally {s.delete();}
}
function extract(oc,edge,tolerance) {
  const c=new oc.BRepAdaptor_Curve_2(edge);
  try {
    const a=c.FirstParameter(), b=c.LastParameter(), type=c.GetType().value;
    if(!Number.isFinite(a+b))throw new Error('模型中存在无限曲线');
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
        if(range<=0)throw new Error('无效样条节点');
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
export function projectView(oc,shape,name,rotation=0,tolerance=.01) {
  const theta=-rotation*Math.PI/180;
  const rotate=([x,y,z])=>[x*Math.cos(theta)-y*Math.sin(theta),x*Math.sin(theta)+y*Math.cos(theta),z];
  const [normal,right]=VIEW_AXES[name].map(rotate);
  const algo=new oc.HLRBRep_Algo_1(),point=new oc.gp_Pnt_3(0,0,0),dir=new oc.gp_Dir_4(...normal),xdir=new oc.gp_Dir_4(...right);
  const axes=new oc.gp_Ax2_2(point,dir,xdir),proj=new oc.HLRAlgo_Projector_2(axes);
  algo.Add_2(shape,0);algo.Projector_1(proj);algo.Update();algo.Hide_1();
  const handle=new oc.Handle_HLRBRep_Algo_2(algo),conv=new oc.HLRBRep_HLRToShape(handle);
  const entities=[],seen=new Set();
  try {
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
    if(!entities.length)throw new Error('投影视图没有可见轮廓');
    return {id:name,entities};
  } finally {
    conv.delete();handle.delete();proj.delete();axes.delete();point.delete();dir.delete();xdir.delete();
  }
}
// One parsed model per Worker; changing the view set only computes missing views.
export function createStepSession(oc,bytes,progress=()=>{}) {
  const raw=readStep(oc,bytes,progress);
  let envelope,mechanical=null,disposed=false;
  try {progress('计算精确外形尺寸',22);envelope=bounds(oc,raw);}
  catch(error){raw.delete();throw error;}
  const projections=new Map();
  return {
    convert(options={},report=()=>{}) {
      if(disposed)throw Error('模型已释放，请重新导入');
      let shape=raw,removed=0;
      if(options.detail==='mechanical'){
        if(!mechanical){report('简化表面细节',25);mechanical=mechanicalShape(oc,raw);}
        ({shape,removed}=mechanical);
      }
      const names=options.views||['top','bottom','front'],views=[];
      for(let i=0;i<names.length;i++){
        const name=names[i],key=JSON.stringify([options.detail||'full',name,options.rotation||0,options.tolerance||.01]);
        const cached=projections.get(key),label={top:'正面',bottom:'背面',front:'前侧',left:'左侧'}[name];
        report(`${cached?'复用':'计算'}${label}投影 · ${i+1}/${names.length}`,30+i/names.length*60);
        const view=cached||projectView(oc,shape,name,options.rotation||0,options.tolerance||.01);
        projections.delete(key);projections.set(key,view);
        if(projections.size>12)projections.delete(projections.keys().next().value);
        views.push(view);
      }
      const approximated=views.reduce((n,v)=>n+v.entities.filter(e=>e.approximated).length,0);
      report('排版完成',100);
      return {views,envelope,removed,approximated,unit:'mm',options};
    },
    dispose(){if(disposed)return;disposed=true;projections.clear();if(mechanical&&mechanical.shape!==raw)mechanical.shape.delete();raw.delete();}
  };
}
export function convertStep(oc,bytes,options={},progress=()=>{}) {
  const session=createStepSession(oc,bytes,progress);
  try{return session.convert(options,progress);}finally{session.dispose();}
}
