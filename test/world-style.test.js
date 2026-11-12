import test from 'node:test';
import assert from 'node:assert/strict';
import {worldStyle, MAP_COLORS} from '../src/worldStyle.js';

const colors = value => typeof value === 'string' ? (value.match(/#[0-9a-f]{6}\b/gi) || []) : Array.isArray(value) ? value.flatMap(colors) : [];
test('night map uses neutral greys and one water blue only', () => {
  const style = worldStyle();
  const used = style.layers.flatMap(layer => Object.values(layer.paint || {}).flatMap(colors));
  assert.ok(used.length > 10);
  for (const hex of used) {
    if (hex.toLowerCase() === MAP_COLORS.water) continue;
    const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
    assert.ok(Math.max(r, g, b) - Math.min(r, g, b) <= 10, `${hex} has a hue`);
  }
  assert.equal(style.layers.find(x => x.id === 'water').paint['fill-color'], '#1c2730');
  assert.equal(style.layers[0].paint['background-color'], '#101010');
});

test('map labels use the bundled text face and fetch no fonts', () => {
  const style = worldStyle();
  assert.equal(style.glyphs, undefined);
  const fonts = new Set(style.layers.filter(l => l.layout?.['text-font']).flatMap(l => l.layout['text-font']));
  assert.deepEqual([...fonts], ['Instrument Sans Variable']);
});
