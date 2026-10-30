import test from 'node:test';
import assert from 'node:assert/strict';
import '../core.js';
const {emptyState,transition,eligible}=globalThis.GiveawayCore;
const ready=()=>transition(emptyState(),{action:'save',names:Array.from({length:150},(_,i)=>'Demo '+i),remove:true,configRevision:0},100);
test('saves during a draw affect the next pool and preserve the locked 150-person snapshot',()=>{
 const first=transition(ready(),{action:'draw',requestId:'round-one-unique'},1000);
 const winner=first.rounds[0].winner;
 const next=transition(first,{action:'save',names:['New participant',winner],remove:true,configRevision:1},1500);
 assert.equal(next.rounds[0].names.length,150);assert.equal(next.rounds[0].winner,winner);assert.deepEqual(eligible(next),['New participant']);
 const second=transition(next,{action:'draw',requestId:'round-two-unique'},8000);
 assert.deepEqual(second.rounds[1].names,['New participant']);assert.equal(second.rounds[1].winner,'New participant');
});
test('a concurrent second draw is rejected and duplicate retries are idempotent',()=>{
 const first=transition(ready(),{action:'draw',requestId:'round-one-unique'},1000);
 assert.throws(()=>transition(first,{action:'draw',requestId:'round-two-unique'},1001),e=>e.status===409);
 assert.equal(transition(first,{action:'draw',requestId:'round-one-unique'},1002),first);
 assert.throws(()=>transition(first,{action:'reset',configRevision:1,lastRoundId:first.rounds.at(-1).id},1002),e=>e.status===409);
});
test('stale manager saves are rejected; repeated names are deduplicated',()=>{
 const s=transition(emptyState(),{action:'save',names:[' A ','A','B'],remove:false,configRevision:0},1000);
 assert.deepEqual(s.names,['A','B']);assert.throws(()=>transition(s,{action:'save',names:['C'],remove:true,configRevision:0},1001),e=>e.status===409);
 const round=transition(s,{action:'draw',requestId:'round-one-unique'},1002);assert.equal(eligible(round).length,2);
 const reset=transition(round,{action:'reset',configRevision:1,lastRoundId:round.rounds.at(-1).id},8000);assert.equal(reset.rounds.length,0);assert.deepEqual(reset.names,['A','B']);
});
test('accepts 2,000 names, keeps locked snapshots, and compacts historical snapshots',()=>{
 const names=Array.from({length:2000},(_,i)=>'Participant '+i);
 let s=transition(emptyState(),{action:'save',names,remove:true,configRevision:0},100);
 s=transition(s,{action:'draw',requestId:'large-round-one'},1000);
 const winner=s.rounds[0].winner;assert.equal(s.rounds[0].names.length,2000);
 s=transition(s,{action:'save',names:[...names.slice(1),'Late arrival'],remove:true,configRevision:1},1500);
 assert.equal(s.rounds[0].names.length,2000);assert.equal(s.rounds[0].winner,winner);
 s=transition(s,{action:'draw',requestId:'large-round-two'},8000);
 assert.equal(s.rounds[0].participantCount,2000);assert.deepEqual(s.rounds[0].names,[]);assert.equal(s.rounds[0].winner,winner);assert.ok(s.rounds[1].names.length>=1999);
 assert.throws(()=>transition(emptyState(),{action:'save',names:[...names,'One too many'],remove:true,configRevision:0},100),e=>e.status===400);
});

test('rejects malformed bodies and stale resets',()=>{
 for(const input of [null,[],42,'draw'])assert.throws(()=>transition(emptyState(),input),e=>e.status===400);
 const first=transition(ready(),{action:'draw',requestId:'reset-round-one'},1000);
 const second=transition(first,{action:'draw',requestId:'reset-round-two'},8000);
 assert.throws(()=>transition(second,{action:'reset',configRevision:1,lastRoundId:first.rounds[0].id},15000),e=>e.status===409);
});
