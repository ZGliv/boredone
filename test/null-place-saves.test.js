// An unresolved save (status "saved", place null) can sit in the same library as
// plans and memories. Every older helper that walks the library must survive it
// and must never count it as a plan or a visit.
import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {makeSave, outingLabel} from '../src/saves.js';
import {journalPlaces, pinStatus, collectionStamps, chooseUnvisited} from '../src/exploration.js';
import {rankPlaces, shortlistPlaces} from '../src/shortlist.js';
import {rankRecommendations} from '../src/recommendations.js';
import {searchOutings, sortPlans, sortMemories} from '../src/app/outings.js';
import {memoryOptions, filterMemories} from '../src/memoryFilters.js';
import {loadModule} from './helpers/jsx.js';

const now = new Date('2026-11-13T23:00:00.000Z');
const stamp = '2026-11-01T00:00:00.000Z';
const place = (id, name, category = 'bar') => ({id, name, category, address: '', source: 'OpenStreetMap', sourceUrl: '', website: '', hours: '', fee: '', access: '', lat: 40.45, lng: -79.98, distanceKm: 1});
const outing = (id, status, p, extra = {}) => ({id, status, place: p, planDate: '', visitDate: status === 'visited' ? '2026-10-01' : '', notes: '', with: '', rating: 0, photos: [], createdAt: stamp, updatedAt: stamp, ...extra});
const linkSave = makeSave({url: 'https://www.instagram.com/reel/ABC123/?igsh=xyz', now});
const noteSave = makeSave({text: 'that ramen place Sam mentioned', now});
const bareSave = {...makeSave({url: 'https://example.com/x', now}), source: {...linkSave.source, url: '', text: ''}};
const library = [
  linkSave, noteSave,
  outing('plan', 'planned', place('p1', 'Planned Bar')),
  outing('visit', 'visited', place('p2', 'Visited Cafe', 'cafe'), {rating: 5}),
];

test('outingLabel falls back from place name to note, link host, then "Saved item"', () => {
  assert.equal(outingLabel(library[2]), 'Planned Bar');
  assert.equal(outingLabel(noteSave), 'that ramen place Sam mentioned');
  assert.equal(outingLabel(linkSave), 'instagram.com');
  assert.equal(outingLabel(bareSave), 'Saved item');
  assert.equal(outingLabel(makeSave({text: 'x'.repeat(300), now})).length, 80);
});

test('exploration helpers skip null-place saves and never count them as plans or visits', () => {
  assert.deepEqual(journalPlaces(library, 'planned').map(p => p.id), ['p1']);
  assert.deepEqual(journalPlaces(library, 'visited').map(p => p.id), ['p2']);
  assert.deepEqual(journalPlaces(library, 'saved'), []);
  assert.equal(pinStatus('p1', library), 'planned');
  assert.equal(pinStatus('p2', library), 'visited');
  assert.equal(pinStatus('nothing', library), 'discovered');
  assert.equal(collectionStamps(library).reduce((sum, s) => sum + s.count, 0), 1);
  assert.equal(chooseUnvisited([place('p2', 'Visited Cafe'), place('p3', 'New')], library, null, () => 0).id, 'p3');
});

test('a save with a place is not a plan or a visit to the old helpers', () => {
  const placed = {...makeSave({text: 'cool bar', place: place('p9', 'Saved Bar'), now})};
  const rows = [...library, placed];
  assert.equal(pinStatus('p9', rows), 'discovered');
  assert.deepEqual(journalPlaces(rows, 'planned').map(p => p.id), ['p1']);
  const ranked = rankPlaces([place('p9', 'Saved Bar')], rows, 'all', 'any');
  assert.match(ranked[0].reason, /Not yet in your memories/);
});

test('shortlist ranking survives a null-place save', () => {
  const ranked = shortlistPlaces([place('p1', 'Planned Bar'), place('p2', 'Visited Cafe', 'cafe'), place('p3', 'New')], library, 'all', 'any');
  assert.deepEqual(ranked.map(r => r.place.id), ['p1', 'p3', 'p2']);
});

test('recommendations ranking survives a null-place save', () => {
  const items = [{place: place('p1', 'Planned Bar')}, {place: place('p3', 'New')}];
  const ranked = rankRecommendations(items, library, now.getTime());
  assert.equal(ranked.length, 2);
  assert.ok(ranked.find(r => r.place.id === 'p1').why.includes('Already in your plans'));
});

test('journal page helpers search saves by their label and keep them out of plans and memories', () => {
  assert.deepEqual(sortPlans(library).map(o => o.id), ['plan']);
  assert.deepEqual(sortMemories(library).map(o => o.id), ['visit']);
  assert.deepEqual(searchOutings(library, 'ramen').map(o => o.id), [noteSave.id]);
  assert.deepEqual(searchOutings(library, 'instagram').map(o => o.id), [linkSave.id]);
  assert.deepEqual(memoryOptions(library).places.map(p => p.id).sort(), ['p1', 'p2']);
  assert.deepEqual(filterMemories(library, {query: 'ramen'}), []);
});

test('outing actions handle a null-place save in the library and in the delete prompt', async () => {
  const {default: useOutingActions} = await loadModule('src/app/useOutingActions.js');
  let committed = null, editor = 'unset', prompt = '';
  const ref = {current: {outings: library}};
  const journal = {library: {outings: library}, libraryRef: ref, commit: async rows => { committed = rows; }, demoMode: false, setStorageError: e => { throw Error(e); }};
  const confirm = async message => { prompt = message; return true; };
  const actions = useOutingActions({journal, account: null, navigate() {}, setEditor: v => { editor = v; }, toast() {}, confirm});
  actions.addPlan(place('p1', 'Planned Bar'));
  assert.equal(editor.outing.id, 'plan');
  actions.addPlan(place('p5', 'Fresh'));
  assert.equal(editor.isNew, true);
  await actions.remove(noteSave);
  assert.match(prompt, /^Delete that ramen place Sam mentioned\?$/);
  assert.deepEqual(committed.map(o => o.id), library.filter(o => o.id !== noteSave.id).map(o => o.id));
  await assert.rejects(actions.saveOuting(outing('new-plan', 'planned', place('p1', 'Planned Bar')), stamp, true), /Already planned/);
});

test('draft recovery labels an unresolved save draft without crashing', async () => {
  const {default: DraftRecovery} = await loadModule('src/app/DraftRecovery.jsx');
  const drafts = [{id: 'd1', outing: noteSave, isNew: false, savedAt: stamp}, {id: 'd2', outing: library[2], isNew: false, savedAt: stamp}];
  const html = renderToStaticMarkup(React.createElement(DraftRecovery, {store: {}, drafts, draftError: '', setDraftError() {}, refreshDrafts() {}, canEdit: true, setEditor() {}}));
  assert.match(html, /that ramen place Sam mentioned/);
  assert.match(html, /Planned Bar/);
});

test('the editor refuses a save with no place instead of crashing, and still opens a plan', async () => {
  const {default: Editor, canEdit} = await loadModule('src/Editor.jsx');
  assert.equal(canEdit({outing: noteSave}), false);
  assert.equal(canEdit({outing: library[2]}), true);
  assert.equal(canEdit({outing: library[2], recovery: {outing: noteSave}}), false);
  assert.equal(renderToStaticMarkup(React.createElement(Editor, {outing: noteSave, onClose() {}, onSave() {}})), '');
});

test('account conflict review names an unresolved save by its label', () => {
  // AccountPanel renders outingLabel(item.local) / outingLabel(item.cloud).
  assert.equal(outingLabel(linkSave), 'instagram.com');
  assert.equal(outingLabel({...noteSave, photos: []}), 'that ramen place Sam mentioned');
});
