import test from 'node:test';import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {matchCandidates,nameSimilarity,nameKey} from '../src/saveMatch.js';
const places=JSON.parse(readFileSync(new URL('../src/data/pittsburgh.json',import.meta.url))).places;
const downtown={lat:40.4406,lng:-79.9959,city:'Pittsburgh'};
const one=(candidate,near=downtown,pool=places)=>matchCandidates([candidate],pool,near)[0];
const names=r=>r.matches.map(m=>m.place.name);

test('name keys fold "&"/"and", apostrophes, "the", accents and generic suffixes',()=>{
 assert.equal(nameKey('Butcher & the Rye'),nameKey('Butcher and the Rye'));
 assert.equal(nameKey('Pamela’s Diner'),nameKey("Pamelas"));
 assert.equal(nameKey('Mike\'s Beer Bar'),nameKey('Mikes Beer'));
 assert.equal(nameKey('Café Lola'),nameKey('Cafe Lola'));
 assert.equal(nameKey('Primanti Bros.'),nameKey('Primanti Brothers'));
 assert.ok(nameSimilarity('Bar','Restaurant')<.5);
});
test('an exact venue name from the caption matches that single venue',()=>{
 const r=one({name:'The Speckled Egg',kind:'restaurant'});assert.deepEqual(names(r),['The Speckled Egg']);assert.equal(r.ambiguous,false);assert.match(r.matches[0].reason,/same name/);
});
test('"&" vs "and" and a different-but-related kind still match',()=>{
 const r=one({name:'Butcher & the Rye',kind:'pub'});assert.equal(names(r)[0],'Butcher and the Rye');assert.ok(r.matches[0].score>.8);
});
test('misspelt names still find the venue',()=>{
 assert.equal(names(one({name:'Butchr and Rye',kind:'bar'}))[0],'Butcher and the Rye');
 assert.equal(names(one({name:'Sammys Corned Beef',kind:'restaurant'}))[0],"Sammy's Famous Corned Beef");
 assert.equal(names(one({name:'Speckeld Egg',kind:'restaurant'}))[0],'The Speckled Egg');
});
test('apostrophe variants match (straight, curly, missing)',()=>{
 assert.equal(names(one({name:'Mahoneys',kind:'restaurant'}))[0],'Mahoney’s Restaurant');
 assert.equal(names(one({name:"DiBella's",kind:'restaurant'}))[0],"DiBella's");
});
test('chains with several branches return every branch, nearest first, instead of guessing',()=>{
 const r=one({name:'Primanti Bros.',kind:'restaurant'});
 assert.ok(r.matches.length>=4);assert.equal(r.ambiguous,true);assert.ok(r.matches.every(m=>/Primanti/.test(m.place.name)));
 const d=r.matches.map(m=>m.distanceKm);assert.deepEqual(d,[...d].sort((a,b)=>a-b));assert.match(r.matches[0].reason,/locations/);
 const coffee=one({name:'De Fer Coffee & Tea',kind:'cafe'});assert.ok(coffee.matches.length>=8);assert.equal(coffee.ambiguous,true);
});
test('a partial name ("Condado") still finds the chain branches',()=>{
 const r=one({name:'Condado',kind:'restaurant'});assert.equal(r.matches.length,2);assert.ok(names(r).every(n=>n==='Condado Tacos'));
});
test('two venues in one caption are matched independently and in order',()=>{
 const rs=matchCandidates([{name:"Pamela's",kind:'restaurant'},{name:"Mike's Beer Bar",kind:'bar'}],places,downtown);
 assert.equal(rs.length,2);assert.ok(names(rs[0]).every(n=>n==="Pamela's Diner"));assert.deepEqual(names(rs[1]),["Mike's Beer Bar"]);
});
test('below the threshold there is no match rather than a guess',()=>{
 assert.deepEqual(one({name:'Totally Unknown Noodle Bar',kind:'restaurant'}).matches,[]);
 assert.deepEqual(one({name:'Bar',kind:'bar'}).matches,[]);
 assert.deepEqual(one({name:'',kind:'bar'}).matches,[]);
 assert.deepEqual(one({name:'Yard Sale Market',kind:'event'}).matches,[],'one short shared word is not enough');
});
test('a same-named place in a different city is not offered',()=>{
 const chicago={lat:41.8781,lng:-87.6298,city:'Chicago'};
 assert.deepEqual(one({name:'The Speckled Egg',kind:'restaurant'},chicago).matches,[]);
});
test('without a location the name alone decides, and distance is unknown',()=>{
 const r=one({name:'The Speckled Egg',kind:'restaurant'},null);assert.equal(names(r)[0],'The Speckled Egg');assert.equal(r.matches[0].distanceKm,null);
});
test('an event matches its venue, not the event title',()=>{
 const r=one({name:'Jazz Night',venue:"O'Reilly Theater",kind:'event'});assert.deepEqual(names(r),["O'Reilly Theater"]);
});
test('kind agreement breaks a close tie between differently-kinded places',()=>{
 const pool=[{id:'a',name:'Lucky Spot Cafe',lat:40.441,lng:-79.996,category:'cafe'},{id:'b',name:'Lucky Spot Bar',lat:40.441,lng:-79.996,category:'bar'}];
 const r=one({name:'Lucky Spot',kind:'bar'},downtown,pool);assert.equal(r.matches[0].place.id,'b');
});
test('garbage input never throws',()=>{
 assert.deepEqual(matchCandidates(null,null,null),[]);
 assert.deepEqual(matchCandidates([null,{}],[null,{name:5}],{lat:'x'}).map(r=>r.matches),[[],[]]);
});
