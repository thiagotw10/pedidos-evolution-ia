import {test} from 'node:test';
import assert from 'node:assert/strict';
import {projectChannel,channelLeadCount} from '../src/utils/projectChannel';
test('Instagram identity wins over historic WhatsApp and paid attribution',()=>{assert.equal(projectChannel({phone:'ig_123',source:'whatsapp_ai',whatsappConnected:true}),'INSTAGRAM');assert.equal(projectChannel({phone:'instagram_123',source:'paid_traffic'}),'INSTAGRAM');assert.equal(projectChannel({source:'public_site'}),'SITE');assert.equal(projectChannel({source:'whatsapp_ai'}),'WHATSAPP');});
test('channel counters deduplicate contacts without mixing channels',()=>{const rows=[{id:'a',phone:'ig_123',source:'instagram_ai'},{id:'b',phone:'instagram_123',source:'whatsapp_ai'},{id:'c',phone:'558199',source:'whatsapp_ai'}];assert.equal(channelLeadCount(rows,'INSTAGRAM'),1);assert.equal(channelLeadCount(rows,'WHATSAPP'),1);});
