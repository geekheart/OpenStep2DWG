import init,{dxf_to_dwg,dwg_to_dxf} from '../engine/pkg/dwg.js';
import {dxfEntityCounts} from './dxf.js';
let ready;
self.onmessage=async({data})=>{
 try{
  ready??=init();await ready;
  const bytes=dxf_to_dwg(new TextEncoder().encode(data.dxf));
  if(new TextDecoder().decode(bytes.slice(0,6))!=='AC1015')throw Error('DWG 格式验证失败');
  const decoded=new TextDecoder().decode(dwg_to_dxf(bytes));
  const before=dxfEntityCounts(data.dxf),after=dxfEntityCounts(decoded);
  for(const key of new Set([...Object.keys(before),...Object.keys(after)]))if((before[key]||0)!==(after[key]||0))throw Error(`DWG 回读实体数量不一致：${key}`);
  self.postMessage({type:'result',bytes,counts:after},[bytes.buffer]);
 }catch(error){self.postMessage({type:'error',message:error?.message||String(error)});}
};
