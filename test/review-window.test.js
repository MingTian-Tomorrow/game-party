import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {createApp} from '../server/app.js';
import {reviewOpen} from '../server/rules.js';

test('评价精确边界：结束即可评，满一小时截止，取消禁评',()=>{
 const ends=Date.parse('2026-11-13T10:00:00Z'),g={ends_at:new Date(ends),cancelled:false};
 assert.equal(reviewOpen(g,ends-1),false);
 assert.equal(reviewOpen(g,ends),true);
 assert.equal(reviewOpen(g,ends+3599999),true);
 assert.equal(reviewOpen(g,ends+3600000),false);
 assert.equal(reviewOpen({...g,cancelled:true},ends+1),false);
});

test('赛中确认到场、即时更新评分、超时拒绝、缺勤审核撤回无效评价',async t=>{
 const pg=new PGlite();await pg.exec(await readFile(new URL('../server/schema.sql',import.meta.url),'utf8'));
 const db={query:(s,p)=>pg.query(s,p),connect:async()=>({query:(s,p)=>pg.query(s,p),release(){}})};
 const server=createApp(db,{adminId:'admin'}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 t.after(async()=>{await new Promise(r=>server.close(r));await pg.close();});
 // Fixed fixture users bypass registration only; requests use real hashed session tokens.
 const {createHash}=await import('node:crypto');
 for(const id of ['host','guest','admin','waiting']){await pg.query('INSERT INTO users(id,username,nickname,password_hash) VALUES($1,$1,$1,$2)',[id,'fixture-only']);await pg.query('INSERT INTO sessions VALUES($1,$2,$3)',[createHash('sha256').update(id).digest('hex'),id,new Date(Date.now()+86400000)]);}
 async function call(path,body,token='host'){const r=await fetch('http://127.0.0.1:'+server.address().port+'/api'+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,data:await r.json()};}
 const id=(await call('/games',{title:'即时评分测试',venue:'球馆',starts_at:new Date(Date.now()+3600000),ends_at:new Date(Date.now()+7200000),capacity:2,level:'休闲',fee:'免费'})).data.id;
 await call('/games/'+id+'/join',{},'guest');await call('/games/'+id+'/join',{},'waiting');
 assert.equal((await call('/games/'+id+'/attendance',{user_id:'host',attendance:'present'})).status,400);
 await pg.query("UPDATE games SET starts_at=now()-interval '1 hour',ends_at=now()+interval '10 minutes' WHERE id=$1",[id]);
 for(const user_id of ['host','guest'])assert.equal((await call('/games/'+id+'/attendance',{user_id,attendance:'present'})).status,200);
 assert.equal((await call('/games/'+id+'/attendance',{user_id:'guest',attendance:'reported_absent'})).status,400);
 assert.equal((await call('/games/'+id+'/reviews',{target_id:'guest',skill:5})).status,400);
 await pg.query("UPDATE games SET ends_at=now()-interval '1 second' WHERE id=$1",[id]);
 assert.equal((await call('/games/'+id)).data.reviewOpen,true);
 assert.equal((await call('/games/'+id+'/reviews',{target_id:'guest',skill:5,spirit:5})).status,200);
 const scores=async()=>(await call('/profiles')).data.find(p=>p.id==='guest');
 assert.equal((await scores()).skill.score,67);assert.equal((await scores()).spirit.score,83);
 assert.equal((await scores()).overall,78);
 assert.equal((await call('/games/'+id+'/reviews',{target_id:'guest',skill:1,spirit:1})).status,200);
 assert.equal((await scores()).skill.score,53);assert.equal((await scores()).spirit.score,70);
 assert.equal((await call('/games/'+id+'/reviews',{target_id:'guest',skill:5},'waiting')).status,400);
 await call('/games/'+id+'/attendance',{user_id:'guest',attendance:'reported_absent'});
 assert.equal((await scores()).skill.score,60);
 assert.equal((await call('/me')).data.canReviewAttendance,true);
 assert.equal((await call('/me')).data.pendingCount,1);
 assert.equal((await call('/admin/issues',undefined,'guest')).status,403);
 assert.equal((await call('/games/'+id+'/attendance',{user_id:'guest',attendance:'absent',reason:'冒充审核'},'waiting')).status,403);
 assert.equal((await call('/games/'+id+'/attendance',{user_id:'guest',attendance:'absent'})).status,400);
 assert.equal((await call('/games/'+id+'/attendance',{user_id:'guest',attendance:'absent',reason:'组织者已核实'})).status,200);
 assert.equal((await scores()).reputation,67);
 assert.equal((await call('/games/'+id+'/attendance',{user_id:'guest',attendance:'present',reason:'组织者更正误报'})).status,200);
 assert.equal((await scores()).reputation,83);
 await call('/games/'+id+'/attendance',{user_id:'guest',attendance:'reported_absent'});
 const other=(await call('/games',{title:'另一人的球局',venue:'球馆',starts_at:new Date(Date.now()+3600000),ends_at:new Date(Date.now()+7200000),capacity:2,level:'休闲',fee:'免费'},'waiting')).data.id;
 assert.equal((await call('/games/'+id+'/attendance',{user_id:'guest',attendance:'absent',reason:'跨球局审核'},'waiting')).status,403);
 assert.equal((await call('/admin/issues',undefined,'waiting')).data.absent.length,0);
 assert.equal((await call('/admin/issues',undefined,'waiting')).data.history.length,0);
 assert.equal((await call('/me/activity',undefined,'guest')).data.profile.present,0);
 const me=(await call('/me',undefined,'admin')).data;assert.equal(me.pendingCount,1);assert.equal(me.adminConfigured,true);
 assert.equal((await call('/admin/issues')).status,200);
 const audit=(await call('/admin/issues',undefined,'admin')).data;assert.equal(audit.absent.length,1);assert.ok(audit.history.length>0);
 await call('/games/'+id+'/attendance',{user_id:'guest',attendance:'absent',reason:'经核实未到场'},'admin');assert.equal((await scores()).reputation,67);
 await call('/games/'+id+'/attendance',{user_id:'guest',attendance:'present',reason:'已核实为误报'},'admin');assert.equal((await scores()).skill.score,53);
 assert.equal((await call('/me',undefined,'admin')).data.pendingCount,0);
 await pg.query("UPDATE games SET starts_at=now()-interval '2 hours',ends_at=now()-interval '61 minutes' WHERE id=$1",[id]);
 assert.equal((await call('/games/'+id)).data.reviewOpen,false);
 assert.equal((await call('/games/'+id+'/reviews',{target_id:'guest',skill:5})).status,400);
 assert.equal((await scores()).skill.score,53);
 const activity=(await call('/me/activity',undefined,'guest')).data;
 assert.equal(activity.profile.skill.score,53);assert.equal(activity.days.length,1);
 assert.equal(activity.timeline.at(-1).skill.score,53);
 assert.equal((await call('/me/activity',undefined,'waiting')).data.days.length,0);
 assert.equal((await call('/me/activity',undefined,'unknown')).status,401);
 assert.equal((await call('/admin/password-reset',{username:'guest'},'host')).status,403);
 const issued=(await call('/admin/password-reset',{username:'guest'},'admin')).data;
 const replacement=(await call('/admin/password-reset',{username:'guest'},'admin')).data;
 assert.equal((await call('/auth/reset-password',{token:issued.token,password:'replacement-password'})).status,400);
 assert.equal((await call('/auth/reset-password',{token:replacement.token,password:'short'})).status,400);
 assert.equal((await call('/auth/reset-password',{token:replacement.token,password:'replacement-password'})).status,200);
 assert.equal((await call('/auth/reset-password',{token:replacement.token,password:'another-password'})).status,400);
 assert.equal((await call('/me',undefined,'guest')).status,401);
 assert.equal((await call('/auth/login',{username:'guest',password:'replacement-password'})).status,200);
 const expired=(await call('/admin/password-reset',{username:'guest'},'admin')).data;
 await pg.query("UPDATE password_resets SET expires_at=now()-interval '1 minute'");
 assert.equal((await call('/auth/reset-password',{token:expired.token,password:'expired-password'})).status,400);

});
