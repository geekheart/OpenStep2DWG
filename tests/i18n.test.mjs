import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {messages,setLanguage,getLanguage,t,localize,localizedError,reportMessage,normalizeLanguage} from '../src/i18n.js';
import {validateProject,buildDrawing,drawingSVG} from '../src/model.js';
import {exportDXF} from '../src/dxf.js';
import {convertWithRecovery} from '../src/projection-recovery.js';
import {EmptyProjectionError} from '../src/occt-kernel.js';

test('both locales cover every message and preserve the same interpolation parameters',()=>{
 assert.deepEqual(Object.keys(messages.en).sort(),Object.keys(messages['zh-CN']).sort());
 for(const key of Object.keys(messages.en)){
  const parameters=value=>[...value.matchAll(/\{(\w+)\}/g)].map(m=>m[1]).sort();
  assert.deepEqual(parameters(messages.en[key]),parameters(messages['zh-CN'][key]),key);
  assert.ok(messages.en[key].trim(),key);assert.doesNotMatch(messages.en[key],/\p{Script=Han}/u,key);
 }
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 for(const [,key]of html.matchAll(/data-i18n(?:-aria-label|-title|-alt)?="([^"]+)"/g))assert.ok(key in messages.en,key);
 assert.equal(normalizeLanguage(null),'zh-CN');assert.equal(normalizeLanguage('invalid'),'zh-CN');assert.equal(normalizeLanguage('en'),'en');
});

test('Worker message descriptors translate using the current UI language after serialization',()=>{
 let packet;reportMessage((text,percent,descriptor)=>{packet=JSON.parse(JSON.stringify({text,percent,...descriptor}));},'progress.project',30,{viewId:'front',index:1,total:3});
 assert.equal(packet.text,'计算前侧投影 · 1/3');
 setLanguage('en');assert.equal(localize(packet),'Computing Front projection · 1/3');
 const error=new EmptyProjectionError('front',90);
 assert.match(error.message,/Front projection failed/);assert.equal(error.code,'EMPTY_PROJECTION');assert.equal(error.view,'front');
 const transmitted=JSON.parse(JSON.stringify({message:error.message,messageKey:error.messageKey,values:error.values}));
 setLanguage('zh-CN');assert.match(localize(transmitted),/前侧投影失败（90°）/);
});

test('locale changes preserve project JSON and exact drawing / DXF entities',()=>{
 const project=JSON.parse(readFileSync(new URL('../assets/demo.json',import.meta.url),'utf8'));
 project.name='用户图纸 Δ / User drawing';project.settings.drawingNumber='图号-42';
 const before=JSON.stringify(project),drawing=buildDrawing(project),dxf=exportDXF(project);
 setLanguage('en');
 assert.equal(getLanguage(),'en');assert.deepEqual(buildDrawing(project),drawing);assert.equal(exportDXF(project),dxf);
 const preview=drawingSVG(project,{interactive:true});assert.match(preview,/aria-label="Top view"/);assert.match(preview,/用户图纸/);
 assert.equal(JSON.stringify(project),before);
 assert.throws(()=>validateProject({}),error=>error.messageKey==='error.projectFormat'&&error.message==='Unsupported OpenStep2DWG project');
 setLanguage('zh-CN');assert.equal(exportDXF(project),dxf);assert.equal(t('status.demo'),'示例已载入');
});

test('recovery control flow uses message keys regardless of translated progress text',async()=>{
 setLanguage('en');let recovered=false;const events=[];
 const session={
  convert(options,report){
   if(!recovered)throw new EmptyProjectionError('front',0);
   reportMessage(report,'progress.reuseView',30,{viewId:'top',index:1,total:3});
   reportMessage(report,'progress.project',60,{viewId:'left',index:3,total:3});
   return {views:[]};
  },snapshot(){return new Uint8Array();},remember(){recovered=true;}
 };
 await convertWithRecovery(session,{},(text,percent,descriptor)=>events.push(descriptor.messageKey),async()=>({id:'front'}));
 assert.deepEqual(events,['progress.recover','progress.project']);
 setLanguage('zh-CN');assert.equal(localizedError('error.line').message,'直线坐标无效');
});
