import {test} from 'node:test';
import assert from 'node:assert/strict';
import {profile} from '../server/rules.js';
test('信誉可为负数且更正可恢复；近期活跃按天去重',()=>{
 const now=Date.parse('2026-11-13T10:00:00Z');
 const absent=Array.from({length:6},()=>({attendance:'absent',ends_at:'2026-11-12T10:00:00Z'}));
 assert.equal(profile({id:'u'},absent,[],now).reputation,-40);
 const present={attendance:'present',starts_at:'2026-11-12T08:00:00Z',ends_at:'2026-11-12T10:00:00Z'};
 const p=profile({id:'u'},[...absent.slice(1),present,present,{attendance:'absent',ends_at:'2026-01-01T10:00:00Z'}],[],now);
 assert.equal(p.recentAbsent,5);assert.equal(p.absent,6);assert.equal(p.activity.days,1);assert.equal(p.activity.games,2);
 assert.equal(profile({id:'u'},Array(100).fill(present),[],now).reputation,100);
 assert.equal(profile({id:'u'},[{attendance:'reported_absent'}],[],now).reputation,80);
});
