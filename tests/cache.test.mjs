import test from 'node:test';
import assert from 'node:assert/strict';
import {conversionKey,getProjection,putProjection} from '../src/conversion-cache.js';
test('projection cache keys cover file content, geometry settings and view order; unavailable storage is optional',async()=>{
 const key=conversionKey('content-a',{});
 assert.equal(key,conversionKey('content-a',{views:['top','bottom','front'],rotation:0,tolerance:.01,detail:'full'}));
 for(const [hash,options] of [['content-b',{}],['content-a',{rotation:90}],['content-a',{detail:'mechanical'}],['content-a',{tolerance:.02}],['content-a',{views:['top','front','left']}]])assert.notEqual(key,conversionKey(hash,options));
 assert.equal(await getProjection(key),null);await putProjection(key,{views:[]});
});
