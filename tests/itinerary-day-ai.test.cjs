const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const context = vm.createContext({ URL, Set, Map, console });
vm.runInContext(fs.readFileSync('js/life-projects-day-ai.js', 'utf8'), context);
vm.runInContext(`
let nextId = 0;
function _lpItemId() { return 'generated' + (++nextId); }
function _lpParseTimeStr(text) { if (!text) return null; const [h,m] = text.split(':').map(Number); return h*60+m; }
function _lpParseDurationStr(text) { return text ? parseInt(text) : null; }
const _lpCurrentProject = {title: 'Trip'};
`, context);
function validate(raw, state, previous = {items: [], locations: []}, searched = true) {
    return context._lpDayAiValidate(raw, state, previous, searched);
}
const state = { locations: [{key:'park', name:'Park'}, {key:'cafe', name:'Cafe'}], day: {items: []}, instructions: [] };
assert.equal(context._lpDayAiFingerprint([{id:'a',title:'Test'}]),context._lpDayAiFingerprint([{title:'Test',id:'a'}]));
const old = {id:'a', title:'Park', type:'activity', locationId:'park', bookingRef:'booking1', links:[{url:'https://example.com'}], itemDownloaded:true, cost:15, notes:'Keep notes'};
let result = validate({items:[{id:'a', title:'Updated park'}, {id:'b',title:'Lunch',type:'activity',locationId:'cafe'}],locations:[],warnings:[]},state,{items:[old],locations:[]});
assert.equal(result.items[0].bookingRef,'booking1');
assert.equal(result.items[0].itemDownloaded,true);
assert.equal(result.items[0].links[0].url,'https://example.com');
assert.equal(result.items[0].cost,15);
assert.equal(result.items[1].type,'travel');
assert.equal(result.items[1].locationId,'park');
assert.equal(result.items[1].toLocationId,'cafe');
assert.equal(result.items[1].duration,'');
assert.equal(result.items[2].sortOrder,2);
const explicit = {id:'travel',title:'Walk',type:'travel',locationId:'park',toLocationId:'cafe'};
result = validate({items:[old,explicit,{id:'b',title:'Lunch',locationId:'cafe'}],locations:[],warnings:[]},state);
assert.equal(result.items.length,3, 'No duplicate travel');
assert.throws(()=>validate({items:[{id:'x',title:'Broken',locationId:'missing'}],locations:[],warnings:[]},state),/unknown location/);
assert.throws(()=>validate({items:[{id:'x',title:'One'},{id:'x',title:'Two'}],locations:[],warnings:[]},state),/duplicate/);
assert.throws(()=>validate({items:[{id:"x');bad()",title:'Unsafe'}],locations:[],warnings:[]},state),/invalid item/);
assert.throws(()=>validate({items:[],locations:[null],warnings:[]},state),/location/);
const loc = {key:'new:hotel',name:'Hilton',lat:95,lng:10,website:'javascript:alert(1)',uncertain:false,sources:[]};
result = validate({items:[{id:'hotel',title:'Hotel',locationId:loc.key}],locations:[loc],warnings:[]},state,undefined,false);
assert.equal(result.locations[0].lat,null);
assert.equal(result.locations[0].website,'');
assert.equal(result.locations[0].uncertain,true);
result = validate({items:[{id:'a',title:'Visit',time:'16:00',duration:'120 min'},{id:'b',title:'Dinner',time:'17:00'}],locations:[],warnings:[]},state);
assert.ok(result.warnings.some(w=>w.includes('overlaps')));
const changing = context._lpDayAiPrompt({...state,day:{items:[old]},original:'Go to park'},'Dinner at 5',false);
assert.ok(changing.includes('MODE: CHANGE'));
assert.ok(changing.includes('Go to park'));
assert.ok(changing.includes('booking1'));
const clearing = context._lpDayAiPrompt({...state,day:{items:[old]}},'Start fresh',true);
assert.ok(clearing.includes('MODE: CREATE'));
assert.ok(!clearing.includes('booking1'));
console.log('Day AI validation/prompt tests passed.');
