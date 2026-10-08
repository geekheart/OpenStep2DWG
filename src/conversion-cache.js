import {localizedError} from './i18n.js';
// Increment when projection semantics or the pinned geometry engine changes.
export const CACHE_VERSION='occt-b5ff984-projection-2';
export function conversionKey(hash,options){
 return JSON.stringify([CACHE_VERSION,hash,options.detail||'full',options.rotation||0,options.tolerance||.01,options.views||['top','bottom','front']]);
}
const LIMIT=64*1024*1024,ENTRIES=4;
let database;
function open(){
 return database??=new Promise((resolve,reject)=>{
  const request=indexedDB.open('OpenStep2DWG',1);
  request.onupgradeneeded=()=>request.result.createObjectStore('projections',{keyPath:'key'});
  request.onsuccess=()=>{const db=request.result;db.onversionchange=()=>{db.close();database=null;};resolve(db);};
  request.onerror=()=>reject(request.error);
  request.onblocked=()=>reject(localizedError('error.cache'));
 });
}
function done(transaction){return new Promise((resolve,reject)=>{transaction.oncomplete=resolve;transaction.onerror=()=>reject(transaction.error);transaction.onabort=()=>reject(transaction.error);});}
// Storage disabled, full or evicted? Conversion must still work normally.
export async function getProjection(key){
 try{
  const db=await open(),tx=db.transaction('projections','readwrite'),finished=done(tx),store=tx.objectStore('projections');
  let entry;
  const request=store.get(key);request.onsuccess=()=>{entry=request.result;if(entry){entry.used=Date.now();store.put(entry);}};
  await finished;return entry?.geometry||null;
 }catch{return null;}
}
export async function putProjection(key,geometry){
 try{
  const size=new Blob([JSON.stringify(geometry)]).size;if(size>LIMIT)return;
  const db=await open(),tx=db.transaction('projections','readwrite'),finished=done(tx),store=tx.objectStore('projections');
  const request=store.getAll();request.onsuccess=()=>{
   const entries=request.result.filter(e=>e.key!==key).sort((a,b)=>a.used-b.used);
   let total=entries.reduce((n,e)=>n+e.size,0)+size;
   while(entries.length>=ENTRIES||total>LIMIT){const entry=entries.shift();total-=entry.size;store.delete(entry.key);}
   store.put({key,geometry,size,used:Date.now()});
  };
  await finished;
 }catch{ /* Browser cache is optional, never a prerequisite for conversion. */ }
}
