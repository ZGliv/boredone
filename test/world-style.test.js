import test from 'node:test';
import assert from 'node:assert/strict';
import {worldStyle} from '../src/worldStyle.js';
test('night map changes paint without changing source data or layer geometry',()=>{
 const day=worldStyle('light'),night=worldStyle('dark');
 assert.deepEqual(day.sources,night.sources);
 assert.deepEqual(day.layers.map(({paint,...layer})=>layer),night.layers.map(({paint,...layer})=>layer));
 assert.notEqual(day.layers[0].paint['background-color'],night.layers[0].paint['background-color']);
 assert.notEqual(day.layers.find(x=>x.id==='water').paint['fill-color'],night.layers.find(x=>x.id==='water').paint['fill-color']);
});
