import {localizedError,reportMessage} from './i18n.js';
// A valid model can yield an empty view after earlier HLR operations in one
// WASM instance. Retry only that view in a fresh instance, without simplifying
// geometry or re-reading STEP. BREP preserves analytic surfaces and curves.
export async function convertWithRecovery(session,options,progress,isolatedProjection){
 const attempted=new Set();
 for(;;){
  try{return session.convert(options,(text,percent,message)=>{if(!attempted.size||message?.messageKey!=='progress.reuseView')progress(text,percent,message);});}
  catch(error){
   if(error?.code!=='EMPTY_PROJECTION'||!error.view||attempted.has(error.view))throw error;
   attempted.add(error.view);
   reportMessage(progress,'progress.recover',85,{viewId:error.view});
   const view=await isolatedProjection(session.snapshot(options),error.view,options);
   if(view.id!==error.view)throw localizedError('error.recoveryDirection');
   session.remember(options,view);
  }
 }
}
