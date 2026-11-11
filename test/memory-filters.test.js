import test from 'node:test';
import assert from 'node:assert/strict';
import {filterMemories, groupMemories, memoryOptions} from '../src/memoryFilters.js';
const visit=(id,date,withWho,place='cafe')=>({id,visitDate:date,with:withWho,place:{id:place,name:place},updatedAt:date,notes:''});
const visits=[visit('a','2026-10-01','Alex, Sam'),visit('b','2026-11-02','alex'),visit('c','2026-11-01','Sam','park')];
test('person, venue and month filters combine without losing repeat visits or mutating records',()=>{
 const before=JSON.stringify(visits);
 assert.deepEqual(filterMemories(visits,{person:'Alex'}).map(x=>x.id),['b','a']);
 assert.deepEqual(filterMemories(visits,{person:'Sam',place:'cafe',month:'2026-11'}),[]);
 assert.deepEqual(filterMemories(visits,{person:'Sam',month:'2026-11'}).map(x=>x.id),['c']);
 assert.equal(JSON.stringify(visits),before);
});
test('timeline groups sorted visits and deduplicates companion names without rewriting legacy text',()=>{
 assert.deepEqual(groupMemories(filterMemories(visits)).map(x=>[x.month,x.outings.length]),[['2026-11',2],['2026-10',1]]);
 assert.deepEqual(memoryOptions(visits).people,['Alex','Sam']);
 assert.equal(memoryOptions(visits).places.length,2);
 assert.equal(filterMemories([visit('d','2026-11-03','Zoë')],{query:'zoe'}).length,1);
});
