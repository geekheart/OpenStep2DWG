import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const url='http://127.0.0.1:4178';
test('workbench: canvas zoom, move, undo, project restore and all four real downloads',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(url);
 await expect(page.locator('#entity-total')).toHaveText('124 条轮廓');
 const viewport=await page.locator('#viewport').boundingBox(),initialZoom=await page.locator('#zoom-value').textContent();
 const browserScale=await page.evaluate(()=>window.visualViewport.scale);
 await page.mouse.move(viewport.x+viewport.width/2,viewport.y+viewport.height/2);await page.mouse.wheel(0,-150);
 await expect(page.locator('#zoom-value')).not.toHaveText(initialZoom);expect(await page.evaluate(()=>window.visualViewport.scale)).toBe(browserScale);
 await page.locator('#fit').click();const top=page.locator('[data-view="top"] .view-hit');const rect=await top.boundingBox();
 const originalX=await page.locator('#view-x').inputValue();await page.mouse.move(rect.x+rect.width/2,rect.y+rect.height/2);await page.mouse.down();await page.mouse.move(rect.x+rect.width/2+45,rect.y+rect.height/2+15,{steps:3});await page.mouse.up();
 await expect(page.locator('#view-x')).not.toHaveValue(originalX);await page.locator('#undo').click();await expect(page.locator('#view-x')).toHaveValue(originalX);
 await page.locator('#view-x').fill('65.5');await page.locator('#view-x').press('Tab');
 const saved=page.waitForEvent('download');await page.locator('#save-project').click();const json=await saved;const projectPath=await json.path();const project=JSON.parse(await readFile(projectPath,'utf8'));expect(project.positions.top[0]).toBe(65.5);
 await page.locator('#project-file').setInputFiles(projectPath);await expect(page.locator('#view-x')).toHaveValue('65.5');
 await page.locator('#export').click();await expect(page.locator('#export-info')).toContainText('回读校验通过',{timeout:60000});
 for(const format of ['dwg','dxf','svg','png']){
  await page.locator('#export-format').selectOption(format);await expect(page.locator('#download-export')).toBeEnabled({timeout:60000});
  const pending=page.waitForEvent('download');await page.locator('#download-export').click();const download=await pending;expect(download.suggestedFilename()).toMatch(new RegExp(`\\.${format}$`));
  const bytes=await readFile(await download.path());expect(bytes.length).toBeGreaterThan(1000);
  if(format==='dwg')expect(bytes.subarray(0,6).toString()).toBe('AC1015');
  if(format==='png')expect(bytes.subarray(1,4).toString()).toBe('PNG');
  if(format==='svg')expect(bytes.toString()).not.toContain('view-outline');
 }
 await page.locator('#export-format').selectOption('dwg');await expect(page.locator('#download-export')).toBeEnabled({timeout:60000});await expect(page.locator('#toast')).toBeHidden({timeout:10000});await page.screenshot({path:'docs/export.png'});await page.locator('#close-export').click();await page.locator('#load-demo').click();await page.locator('#fit').click();await page.locator('.sidebar').evaluate(e=>e.scrollTop=0);await page.screenshot({path:'docs/workbench.png'});expect(errors).toEqual([]);
});
test('STEP import runs in a Worker with local requests only, supports cancel and invalid files',async({page})=>{
 const requests=[];let workers=0;page.on('worker',()=>workers++);page.on('request',req=>requests.push([req.url(),req.method()]));
 await page.addInitScript(()=>{window.conversions=[];window.addEventListener('conversion-complete',e=>window.conversions.push(e.detail));});await page.goto(url);
 await page.locator('#step-file').setInputFiles('assets/demo.step');await expect(page.locator('#save-state')).toHaveText('转换完成',{timeout:60000});
 await expect(page.locator('#entity-total')).toHaveText('124 条轮廓');
 await page.getByRole('button',{name:'90°',exact:true}).click();await page.locator('#convert').click();await expect(page.locator('#save-state')).toHaveText('转换完成',{timeout:60000});
 await expect(page.locator('#progress-card')).toBeHidden({timeout:60000});await expect(page.locator('[data-select-view="top"]')).toContainText('28.00 × 56.00');
 expect(workers).toBe(1);expect(requests.filter(([u])=>u.endsWith('.wasm.gz'))).toHaveLength(1);expect(requests.some(([u])=>u.endsWith('/occt.wasm'))).toBe(false);
 expect(await page.evaluate(()=>window.conversions.at(-1).timings[0].stage)).toBe('复用已解析模型');
 await page.locator('#view-layout').selectOption('first-angle');await page.locator('#convert').click();await expect(page.locator('#save-state')).toHaveText('转换完成',{timeout:60000});
 expect(await page.evaluate(()=>window.conversions.at(-1).timings.filter(t=>t.stage.startsWith('计算')).map(t=>t.stage))).toEqual(['计算左侧投影 · 3/3']);
 expect(workers).toBe(1);
 await page.getByRole('button',{name:'180°',exact:true}).click();await page.locator('#convert').click();await page.locator('#cancel').click();await expect(page.locator('#progress-card')).toBeHidden();
 await page.locator('#step-file').setInputFiles({name:'invalid.step',mimeType:'application/step',buffer:Buffer.from('invalid data')});await expect(page.locator('#conversion-error')).toBeVisible({timeout:60000});
 // Persistent cache must restore after a reload even if no CAD kernel can load.
 await page.reload();await page.route('**/vendor/**',route=>route.abort());const before=workers;
 await page.locator('#step-file').setInputFiles('assets/demo.step');await expect(page.locator('#save-state')).toHaveText('转换完成',{timeout:10000});
 await expect(page.locator('#source-info')).toContainText('本地缓存');expect(workers).toBe(before);
 expect(await page.evaluate(()=>window.conversions.at(-1).cached)).toBe(true);
 const hash=createHash('sha256').update(await readFile('assets/demo.step')).digest('hex');
 await page.evaluate(async hash=>{const {putProjection,conversionKey}=await import('./src/conversion-cache.js');await putProjection(conversionKey(hash,{}),{views:[]});},hash);
 await page.unroute('**/vendor/**');await page.reload();await page.locator('#step-file').setInputFiles('assets/demo.step');
 await expect(page.locator('#save-state')).toHaveText('转换完成',{timeout:60000});expect(workers).toBe(before+1);
 expect(await page.evaluate(()=>window.conversions.at(-1).cached)).toBe(false);
 expect(requests.every(([u,m])=>(u.startsWith(url)||u.startsWith('blob:'))&&m==='GET')).toBe(true);
});
test('real STEP regression: browser conversion, DWG export and saved projection',async({page})=>{
 test.skip(!process.env.STEP_TEST_FILE,'Set STEP_TEST_FILE for a local CAD regression');test.setTimeout(900000);
 await page.addInitScript(()=>{window.conversions=[];window.addEventListener('conversion-complete',e=>window.conversions.push(e.detail));});
 await page.goto(url);await page.locator('#step-file').setInputFiles(process.env.STEP_TEST_FILE);
 await expect(page.locator('#save-state')).toHaveText(/转换完成|转换失败/,{timeout:840000});await expect(page.locator('#save-state')).toHaveText('转换完成');
 await expect(page.locator('#conversion-error')).toBeHidden();
 const pending=page.waitForEvent('download');await page.locator('#save-project').click();const json=await pending;await json.saveAs('/private/tmp/openstep-browser-project.json');
 await page.locator('#export').click();await expect(page.locator('#export-info')).toContainText('回读校验通过',{timeout:60000});
 const output=page.waitForEvent('download');await page.locator('#download-export').click();await (await output).saveAs('/private/tmp/openstep-browser.dwg');
 await page.locator('#close-export').click();await page.locator('#fit').click();await expect(page.locator('#toast')).toBeHidden({timeout:10000});await page.screenshot({path:'/private/tmp/openstep-browser.png'});
 console.log('Fresh conversion:',JSON.stringify(await page.evaluate(()=>window.conversions)));
 await page.reload();await page.route('**/vendor/**',route=>route.abort());await page.locator('#step-file').setInputFiles(process.env.STEP_TEST_FILE);
 await expect(page.locator('#save-state')).toHaveText('转换完成',{timeout:15000});await expect(page.locator('#source-info')).toContainText('本地缓存');
 console.log('Persistent cache:',JSON.stringify(await page.evaluate(()=>window.conversions)));
 await page.screenshot({path:'/private/tmp/openstep-cached.png'});
});
test('local drawing visual review: S31, P4 and all export formats',async({page})=>{
 test.skip(!process.env.LOCAL_REVIEW,'Local CAD fixtures are not distributed');
 for(const name of ['WT9932S31-TINY','WT9932P4-TINY']){
  await page.goto(url);await page.locator('#project-file').setInputFiles(`.local-review/${name}.json`);await expect(page.locator('#save-state')).toHaveText('项目已打开');
  await page.locator('#export').click();await expect(page.locator('#export-info')).toContainText('回读校验通过',{timeout:60000});
  for(const format of ['dwg','dxf','png']){
   await page.locator('#export-format').selectOption(format);await expect(page.locator('#download-export')).toBeEnabled({timeout:60000});
   const pending=page.waitForEvent('download');await page.locator('#download-export').click();await (await pending).saveAs(`.local-review/${name}.${format}`);
  }
  await page.locator('#close-export').click();await expect(page.locator('#toast')).toBeHidden({timeout:10000});await page.screenshot({path:`.local-review/${name}-workbench.png`});
 }
});
