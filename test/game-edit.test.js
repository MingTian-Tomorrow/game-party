import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {createApp} from '../server/app.js';

test('开场前编辑、管理员权限、人数下限与未满员提前开场',async t=>{
 const pg=new PGlite();await pg.exec(await readFile(new URL('../server/schema.sql',import.meta.url),'utf8'));
 const db={query:(s,p)=>pg.query(s,p),connect:async()=>({query:(s,p)=>pg.query(s,p),release(){}})};
 const server=createApp(db).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 let adminServer;
 t.after(async()=>{if(adminServer)await new Promise(r=>adminServer.close(r));await new Promise(r=>server.close(r));await pg.close();});
 async function call(path,body,token,srv=server){const r=await fetch('http://127.0.0.1:'+srv.address().port+'/api'+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,data:await r.json()};}
 const register=async username=>(await call('/auth/register',{username,nickname:username,password:'test-password-123'})).data;
 const h=await register('owner'),a=await register('admin'),b=await register('guest');
 const profiles=(await call('/profiles')).data;assert.equal(profiles.length,3);for(const p of profiles){assert.equal(p.reputation,80);assert.equal(p.skill.score,60);assert.equal(p.spirit.score,80);assert.equal(p.overall,74);}
 adminServer=createApp(db,{adminId:a.user.id}).listen(0,'127.0.0.1');await new Promise(r=>adminServer.once('listening',r));
 const fields={title:'原球局',venue:'34号楼豪华露天室外场',starts_at:new Date(Date.now()+86400000).toISOString(),ends_at:new Date(Date.now()+90000000).toISOString(),capacity:3,level:'新手友好',fee:'免费',notes:'原说明'};
 const id=(await call('/games',fields,h.token)).data.id;
 const change={...fields,title:'修改后的球局',venue:'新场馆',notes:'已更新说明',fee:'AA 20 元'};
 assert.equal((await call('/games/'+id+'/edit',change)).status,401);
 assert.equal((await call('/games/'+id+'/edit',change,b.token)).status,403);
 assert.equal((await call('/games/'+id+'/edit',change,h.token)).status,200);
 assert.equal((await call('/games/'+id)).data.venue,'新场馆');
 assert.equal((await call('/games/'+id+'/edit',{...change,starts_at:'bad'},h.token)).status,400);
 assert.equal((await call('/games/'+id+'/edit',{...change,ends_at:change.starts_at},h.token)).status,400);
 await call('/games/'+id+'/join',{},a.token);await call('/games/'+id+'/join',{},b.token);
 assert.equal((await call('/games/'+id+'/edit',{...change,capacity:2},h.token)).status,400);
 assert.equal((await call('/games/'+id)).data.capacity,3);
 assert.equal((await call('/games/'+id+'/edit',{...change,capacity:12},a.token,adminServer)).status,200);
 assert.equal((await call('/games/'+id)).data.members.length,3);
 assert.equal((await call('/games/'+id+'/start',{},b.token)).status,403);
 assert.equal((await call('/games/'+id+'/start',{},a.token,adminServer)).status,200);
 const started=(await call('/games/'+id)).data;
 assert.ok(new Date(started.starts_at)<=new Date());assert.equal(new Date(started.ends_at).toISOString(),fields.ends_at);assert.equal(started.capacity,12);
 assert.equal((await call('/games/'+id+'/edit',change,h.token)).status,400);
 assert.equal((await call('/games/'+id+'/join',{},b.token)).status,400);
 assert.equal((await call('/games/'+id+'/start',{},h.token)).status,400);
 const cancelled=(await call('/games',fields,h.token)).data.id;await call('/games/'+cancelled+'/cancel',{},h.token);
 assert.equal((await call('/games/'+cancelled+'/edit',change,h.token)).status,400);
 assert.equal((await call('/games/'+cancelled+'/start',{},h.token)).status,400);
 const own=(await call('/games',fields,h.token)).data.id;
 assert.equal((await call('/games/'+own+'/start',{},h.token)).status,200);
 const audit=(await pg.query("SELECT action FROM audit_log WHERE game_id=$1",[id])).rows.map(r=>JSON.parse(r.action));assert.ok(audit.some(r=>r.type==='edit'));assert.ok(audit.some(r=>r.type==='start'));
});
