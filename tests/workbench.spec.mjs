import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
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
 const requests=[];page.on('request',req=>requests.push([req.url(),req.method()]));await page.goto(url);
 await page.locator('#step-file').setInputFiles('assets/demo.step');await expect(page.locator('#save-state')).toHaveText('转换完成',{timeout:60000});
 await expect(page.locator('#entity-total')).toHaveText('124 条轮廓');
 await page.getByRole('button',{name:'90°',exact:true}).click();await page.locator('#convert').click();await expect(page.locator('#save-state')).toHaveText('转换完成',{timeout:60000});
 await expect(page.locator('#progress-card')).toBeHidden({timeout:60000});await expect(page.locator('[data-select-view="top"]')).toContainText('28.00 × 56.00');
 await page.getByRole('button',{name:'180°',exact:true}).click();await page.locator('#convert').click();await page.locator('#cancel').click();await expect(page.locator('#progress-card')).toBeHidden();
 await page.locator('#step-file').setInputFiles({name:'invalid.step',mimeType:'application/step',buffer:Buffer.from('invalid data')});await expect(page.locator('#conversion-error')).toBeVisible({timeout:60000});
 expect(requests.every(([u,m])=>(u.startsWith(url)||u.startsWith('blob:'))&&m==='GET')).toBe(true);
});
test('real STEP regression: browser conversion, DWG export and saved projection',async({page})=>{
 test.skip(!process.env.STEP_TEST_FILE,'Set STEP_TEST_FILE for a local CAD regression');test.setTimeout(900000);
 await page.goto(url);await page.locator('#step-file').setInputFiles(process.env.STEP_TEST_FILE);
 await expect(page.locator('#save-state')).toHaveText('转换完成',{timeout:840000});
 await expect(page.locator('#conversion-error')).toBeHidden();
 const pending=page.waitForEvent('download');await page.locator('#save-project').click();const json=await pending;await json.saveAs('/private/tmp/openstep-browser-project.json');
 await page.locator('#export').click();await expect(page.locator('#export-info')).toContainText('回读校验通过',{timeout:60000});
 const output=page.waitForEvent('download');await page.locator('#download-export').click();await (await output).saveAs('/private/tmp/openstep-browser.dwg');
 await page.locator('#close-export').click();await page.locator('#fit').click();await expect(page.locator('#toast')).toBeHidden({timeout:10000});await page.screenshot({path:'/private/tmp/openstep-browser.png'});
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
