import test from 'node:test';import assert from 'node:assert/strict';import{sheetDragAction}from'../src/sheetGesture.js';
test('sheet swipes expand, collapse, and dismiss without treating taps or horizontal gestures as dismissal',()=>{
 assert.equal(sheetDragAction({dy:120,elapsed:500}),'dismiss');assert.equal(sheetDragAction({dy:50,elapsed:50}),'dismiss');assert.equal(sheetDragAction({dy:120,elapsed:500,expanded:true}),'collapse');assert.equal(sheetDragAction({dy:-80,elapsed:500}),'expand');assert.equal(sheetDragAction({dy:10,elapsed:50}),'stay');assert.equal(sheetDragAction({dx:150,dy:100,elapsed:500}),'stay');
});
