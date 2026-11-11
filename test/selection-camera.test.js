import test from 'node:test';
import assert from 'node:assert/strict';
import {selectionPan} from '../src/selectionCamera.js';
const phone={left:0,top:50,width:390,height:794};
const sheet={left:0,right:390,top:304,width:390};
test('phone details reveal the selected pin and label above the sheet without changing zoom',()=>{
 assert.deepEqual(selectionPan({x:200,y:471},phone,sheet),[0,287]);
 assert.deepEqual(selectionPan({x:200,y:150},phone,sheet),[0,0]);
});
test('co-located marker offsets participate in the visible position',()=>{
 assert.deepEqual(selectionPan({x:200,y:170},phone,sheet,[0,38]),[0,24]);
 assert.deepEqual(selectionPan({x:75,y:150},phone,sheet,[-38,0]),[-43,0]);
});
test('a fully expanded sheet does not pan a hidden map',()=>{
 assert.equal(selectionPan({x:200,y:471},phone,{...sheet,top:58}),null);
});
test('desktop cards reserve the occupied side, including nonzero map origin',()=>{
 const bounds={left:20,top:50,width:1280,height:850};
 assert.deepEqual(selectionPan({x:200,y:400},bounds,{left:44,right:484,top:130,width:440}),[-364,0]);
 assert.deepEqual(selectionPan({x:1100,y:400},bounds,{left:850,right:1290,top:130,width:440}),[370,0]);
});
