import test from 'node:test';
import assert from 'node:assert/strict';
import {convertWithRecovery} from '../src/projection-recovery.js';
import {EmptyProjectionError} from '../src/occt-kernel.js';
test('empty-view recovery preserves completed views and only retries the failed direction',async()=>{
 const original={id:'top',entities:[{type:'line',p:[0,0],q:[1,1]}]},restored={id:'front',entities:[{type:'line',p:[0,0],q:[1,0]}]},options={rotation:90};
 let cached=null,calls=0;const progress=[],bytes=new Uint8Array([1,2]);
 const session={convert(){calls++;if(!cached)throw new EmptyProjectionError('front',90);return {views:[original,cached]};},snapshot(o){assert.equal(o,options);return bytes;},remember(o,v){assert.equal(o,options);cached=v;}};
 let attempts=0;
 const result=await convertWithRecovery(session,options,(s)=>progress.push(s),async(b,v,o)=>{attempts++;assert.equal(b,bytes);assert.equal(v,'front');assert.equal(o,options);return restored;});
 assert.equal(attempts,1);assert.equal(calls,2);assert.equal(result.views[0],original);assert.equal(result.views[1],restored);assert.deepEqual(progress,['重新计算前侧投影']);
});
test('recovery is bounded and does not turn invalid files or repeated failures into successful drawings',async()=>{
 let attempts=0;const failure=new EmptyProjectionError('front',0),session={convert(){throw failure;},snapshot(){return new Uint8Array();},remember(){}};
 await assert.rejects(convertWithRecovery(session,{},()=>{},async()=>{attempts++;return {id:'front',entities:[{}]};}),e=>e===failure);assert.equal(attempts,1);
 const bad={convert(){throw Error('无法读取 STEP 文件');}};
 await assert.rejects(convertWithRecovery(bad,{},()=>{},()=>{throw Error('must not retry');}),/无法读取 STEP 文件/);
 await assert.rejects(convertWithRecovery(session,{},()=>{},async()=>({id:'top',entities:[{}]})),/方向不匹配/);
});
