import {test} from 'node:test';
import assert from 'node:assert/strict';
import {activity,beijingDay} from '../server/activity.js';

test('个人看板：北京时间归日、同日多场、排除候补和取消、累计评分及更正',()=>{
 const user={id:'u',nickname:'球友',created_at:'2026-01-01T00:00:00Z'},now=Date.parse('2026-01-04T04:00:00Z');
 const record=(game_id,day,extra={})=>({game_id,user_id:'u',title:game_id,status:'joined',attendance:'present',starts_at:`2026-01-0${day}T16:30:00Z`,ends_at:`2026-01-0${day}T18:30:00Z`,cancelled:false,...extra});
 const records=[record('a',1),record('b',1),record('c',2),record('d',2,{attendance:'absent'}),record('e',2,{status:'waiting'}),record('f',2,{cancelled:true}),record('g',2,{attendance:'reported_absent'}),record('future',5)];
 const reviews=[{game_id:'a',author_id:'friend',target_id:'u',skill:5,spirit:5},{game_id:'c',author_id:'friend',target_id:'u',skill:3,spirit:3}];
 const d=activity(user,records,reviews,now);
 assert.equal(beijingDay('2026-01-01T16:00:00Z'),'2026-01-02');
 assert.equal(d.days.length,2);assert.equal(d.days[0].count,2);assert.equal(d.daysSince,1);assert.equal(d.recentDays,2);
 assert.equal(d.profile.present,3);assert.equal(d.profile.absent,1);
 assert.equal(d.timeline.length,5);assert.equal(d.timeline[1].skill.score,67);assert.equal(d.timeline.at(-1).skill.score,63);
 assert.deepEqual(d.timeline.at(-1).skill,d.profile.skill);
 const empty=activity(user,[],[],now);assert.equal(empty.daysSince,null);assert.equal(empty.timeline.length,1);assert.equal(empty.profile.overall,74);
});
