const test=require('node:test');
const assert=require('node:assert/strict');
const {platformAccess}=require('../lib/platformAccess');
test('platform access allows every request without credits, trial or a debit',()=>{
 for(let i=0;i<3;i++)assert.deepEqual(platformAccess(),{allowed:true,trial:false,cost:0,billingEnabled:false});
});
