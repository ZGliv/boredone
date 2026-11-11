import {test} from 'node:test';
import assert from 'node:assert/strict';
import {markerOffsets} from '../src/markerOffsets.js';

test('near-identical coordinates remain selectable with stable offsets', () => {
  const a={id:'a',lat:40.2750604,lng:-80.167191}, b={id:'b',lat:40.27506,lng:-80.16719};
  const first=markerOffsets([a,b]);
  assert.deepEqual(first.get('a'),[38,0]);
  assert.deepEqual(first.get('b'),[-38,0]);
  assert.deepEqual(markerOffsets([b,a]).get('a'),first.get('a'));
  assert.deepEqual(markerOffsets([a]).get('a'),[0,0]);
  assert.equal(a.lat,40.2750604);
});
