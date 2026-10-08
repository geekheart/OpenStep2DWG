import {localizedError,setLanguage} from './i18n.js';
import init,{dxf_to_dwg,dwg_to_dxf} from '../engine/pkg/dwg.js';
import {dxfEntityCounts} from './dxf.js';
let ready;
self.onmessage=async({data})=>{
 try{
  setLanguage(data.language);
  ready??=init();await ready;
  const bytes=dxf_to_dwg(new TextEncoder().encode(data.dxf));
  if(new TextDecoder().decode(bytes.slice(0,6))!=='AC1015')throw localizedError('error.dwgFormat');
  const decoded=new TextDecoder().decode(dwg_to_dxf(bytes));
  const before=dxfEntityCounts(data.dxf),after=dxfEntityCounts(decoded);
  for(const key of new Set([...Object.keys(before),...Object.keys(after)]))if((before[key]||0)!==(after[key]||0))throw localizedError('error.dwgRoundtrip',{entity:key});
  self.postMessage({type:'result',bytes,counts:after},[bytes.buffer]);
 }catch(error){self.postMessage({type:'error',messageKey:error?.messageKey,values:error?.values,message:error?.message||String(error)});}
};
