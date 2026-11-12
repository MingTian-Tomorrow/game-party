import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {createApp} from '../server/app.js';
import {profile,reviewOpen} from '../server/rules.js';

test('评价窗口与证据不足规则',()=>{const g={ends_at:'2026-01-01T00:00:00Z',cancelled:false};assert.equal(reviewOpen(g,Date.parse('2025-12-31')),false);assert.equal(reviewOpen(g,Date.parse('2026-01-01T00:30:00Z')),true);assert.equal(reviewOpen(g,Date.parse('2026-01-04')),false);const p=profile({id:'u',nickname:'x'},[],[]);assert.equal(p.overall,74);assert.equal(p.reputation,80);assert.equal(p.skill.score,60);assert.equal(p.spirit.score,80);const repeated=profile({id:'u'},[],Array.from({length:10},()=>({author_id:'same',skill:5})));assert.equal(repeated.skill.count,1);});

test('完整 API：账户、候补、权限、到场、评价、申诉、取消',async t=>{
 const pg=new PGlite();await pg.exec(await readFile(new URL('../server/schema.sql',import.meta.url),'utf8'));
 // PGlite executes actual PostgreSQL SQL, but a single connection cannot establish production lock/concurrency guarantees.
 const db={query:(sql,params)=>pg.query(sql,params),connect:async()=>({query:(sql,params)=>pg.query(sql,params),release(){}})};
 const server=createApp(db).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 t.after(async()=>{await new Promise(r=>server.close(r));await pg.close();});
 const base='http://127.0.0.1:'+server.address().port;
 async function call(path,body,token){const r=await fetch(base+'/api'+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,data:await r.json()};}
 const register=async name=>(await call('/auth/register',{username:name,nickname:name,password:'my-test-password'})).data;
 const host=await register('host'),a=await register('alice'),b=await register('bob');
 assert.ok(host.token);assert.equal((await call('/auth/login',{username:'host',password:'incorrect-pass'})).status,401);
 assert.equal((await call('/auth/register',{username:'host',nickname:'h',password:'my-test-password'})).status,409);
 const game=await call('/games',{title:'周末排球',venue:'测试体育馆',starts_at:new Date(Date.now()+86400000),ends_at:new Date(Date.now()+90000000),capacity:2,level:'新手',fee:'免费'},host.token);assert.equal(game.status,201);const id=game.data.id;
 assert.equal((await call('/games/'+id+'/join',{},a.token)).data.status,'joined');assert.equal((await call('/games/'+id+'/join',{},b.token)).data.status,'waiting');
 assert.equal((await call('/games/'+id+'/cancel',{},a.token)).status,403);
 await call('/games/'+id+'/leave',{},a.token);assert.equal((await call('/games/'+id+'/join',{},b.token)).data.status,'joined');
 assert.equal((await call('/games/'+id+'/reviews',{target_id:b.user.id,skill:5},host.token)).status,400);
 await pg.query("UPDATE games SET starts_at=now()-interval '2 hours',ends_at=now()-interval '10 minutes' WHERE id=$1",[id]);
 assert.equal((await call('/games/'+id+'/attendance',{user_id:b.user.id,attendance:'present'},b.token)).status,403);
 for(const user of [host,b])assert.equal((await call('/games/'+id+'/attendance',{user_id:user.user.id,attendance:'present'},host.token)).status,200);
 assert.equal((await call('/games/'+id+'/reviews',{target_id:b.user.id,skill:5,spirit:4},host.token)).status,200);
 await call('/games/'+id+'/reviews',{target_id:b.user.id,skill:4},host.token);
 assert.equal((await pg.query('SELECT * FROM reviews')).rows.length,1);
 assert.equal((await call('/profiles')).data.find(p=>p.id===b.user.id).skill.score,63);
 assert.equal((await call('/games/'+id+'/reviews',{target_id:b.user.id,skill:5},b.token)).status,400);
 assert.equal((await call('/games/'+id+'/reviews',{target_id:b.user.id,skill:5},a.token)).status,400);
 assert.equal((await call('/games/'+id+'/attendance',{user_id:b.user.id,attendance:'absent'},host.token)).status,400);
 await call('/games/'+id+'/attendance',{user_id:b.user.id,attendance:'reported_absent'},host.token);
 assert.equal((await call('/profiles')).data.find(p=>p.id===b.user.id).reputation,80);
 assert.equal((await call('/games/'+id+'/issues',{reason:'我实际到场了'},b.token)).status,200);
 assert.equal((await call('/admin/issues',undefined,b.token)).status,403);
 const adminServer=createApp(db,{adminId:host.user.id}).listen(0,'127.0.0.1');await new Promise(r=>adminServer.once('listening',r));
 const adminBase='http://127.0.0.1:'+adminServer.address().port;
 const adminCall=async(path,body)=>{const r=await fetch(adminBase+'/api'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+host.token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()};};
 try {
  const pending=await adminCall('/admin/issues');assert.equal(pending.data.absent.length,1);assert.equal(pending.data.issues.length,1);
  assert.equal((await adminCall('/games/'+id+'/attendance',{user_id:b.user.id,attendance:'absent',reason:'核实缺勤'})).status,200);
  assert.equal((await call('/profiles')).data.find(p=>p.id===b.user.id).absent,1);
  assert.equal((await call('/games/'+id+'/attendance',{user_id:b.user.id,attendance:'present'},host.token)).status,400);
  await adminCall('/games/'+id+'/attendance',{user_id:b.user.id,attendance:'present',reason:'核实到场'});
  await adminCall('/admin/issues/'+pending.data.issues[0].id,{resolution:'双方核实为实际到场，已更正'});
  assert.equal((await call('/me',undefined,b.token)).data.issues[0].resolved,true);
 } finally {await new Promise(r=>adminServer.close(r));}
 await call('/games/'+id+'/attendance',{user_id:b.user.id,attendance:'present'},host.token);
 await pg.query("UPDATE games SET starts_at=now()-interval '5 days',ends_at=now()-interval '4 days' WHERE id=$1",[id]);
 const p=(await call('/profiles')).data.find(p=>p.id===b.user.id);assert.equal(p.skill.count,1);assert.equal(p.skill.score,63);assert.equal(p.overall,76);
 assert.equal((await call('/games/'+id+'/reviews',{target_id:b.user.id,skill:5},host.token)).status,400);
 const cancelled=await call('/games',{title:'待取消球局',venue:'球馆',starts_at:new Date(Date.now()+86400000),ends_at:new Date(Date.now()+90000000),capacity:2,level:'新手',fee:'免费'},host.token);
 assert.equal((await call('/games/'+cancelled.data.id+'/cancel',{},host.token)).status,200);
 assert.equal((await call('/games/'+cancelled.data.id+'/join',{},b.token)).status,400);
 await call('/logout',{},host.token);assert.equal((await call('/me',undefined,host.token)).status,401);
});
