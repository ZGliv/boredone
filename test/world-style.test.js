import test from 'node:test';
import assert from 'node:assert/strict';
import {worldStyle, MAP_COLORS} from '../src/worldStyle.js';

const colors = value => typeof value === 'string' ? (value.match(/#[0-9a-f]{6}\b/gi) || []) : Array.isArray(value) ? value.flatMap(colors) : [];
test('night map uses neutral greys, one muted river blue and one muted park green only', () => {
  const style = worldStyle();
  const used = style.layers.flatMap(layer => Object.values(layer.paint || {}).flatMap(colors)).map(hex => hex.toLowerCase());
  assert.ok(used.length > 10);
  const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  const blues = new Set([MAP_COLORS.water, MAP_COLORS.shore, MAP_COLORS.river]);
  for (const hex of used) {
    const [r, g, b] = rgb(hex), spread = Math.max(r, g, b) - Math.min(r, g, b);
    if (blues.has(hex)) {
      // The river family: blue leads, dark enough that saved-blue pins stay brighter.
      assert.ok(b > g && g >= r && b <= 0x96 && spread <= 0x40, `${hex} is not a muted river blue`);
    } else if (hex === MAP_COLORS.park) {
      // Parks: green leads, barely; a tone, never a colour.
      assert.ok(g > r && g > b && spread <= 12 && g <= 0x24, `${hex} is not a muted park tone`);
    } else {
      assert.ok(spread <= 10, `${hex} has a hue`);
    }
  }
  assert.ok(used.includes(MAP_COLORS.park), 'parks are visible');
  assert.equal(style.layers.find(x => x.id === 'water').paint['fill-color'], MAP_COLORS.water);
  assert.equal(style.layers[0].paint['background-color'], '#101010');
});

test('map labels use the two bundled app faces and fetch no fonts', () => {
  const style = worldStyle();
  assert.equal(style.glyphs, undefined);
  const fonts = new Set(style.layers.filter(l => l.layout?.['text-font']).flatMap(l => l.layout['text-font']));
  assert.deepEqual([...fonts].sort(), ['Big Shoulders Display', 'Instrument Sans Variable']);
  const districts = style.layers.find(l => l.id === 'neighborhood-names');
  assert.deepEqual(districts.layout['text-font'], ['Big Shoulders Display']);
  assert.equal(districts.layout['text-transform'], 'uppercase');
});
