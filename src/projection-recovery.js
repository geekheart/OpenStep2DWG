// A valid model can yield an empty view after earlier HLR operations in one
// WASM instance. Retry only that view in a fresh instance, without simplifying
// geometry or re-reading STEP. BREP preserves analytic surfaces and curves.
export async function convertWithRecovery(session,options,progress,isolatedProjection){
 const attempted=new Set();
 for(;;){
  try{return session.convert(options,(text,percent)=>{if(!attempted.size||!text.startsWith('复用'))progress(text,percent);});}
  catch(error){
   if(error?.code!=='EMPTY_PROJECTION'||!error.view||attempted.has(error.view))throw error;
   attempted.add(error.view);
   const label={top:'正面',bottom:'背面',front:'前侧',left:'左侧'}[error.view];
   progress(`重新计算${label}投影`,85);
   const view=await isolatedProjection(session.snapshot(options),error.view,options);
   if(view.id!==error.view)throw Error('恢复的投影方向不匹配');
   session.remember(options,view);
  }
 }
}
