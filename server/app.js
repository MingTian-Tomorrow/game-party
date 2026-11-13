import express from 'express';
import {avatarBytes} from './avatar.js';
import {activity} from './activity.js';
import helmet from 'helmet';
import {rateLimit} from 'express-rate-limit';
import {randomUUID,randomBytes,createHash,scrypt as rawScrypt,timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {fail,text,score,reviewOpen,profile,gameFields} from './rules.js';
const scrypt=promisify(rawScrypt), hash=t=>createHash('sha256').update(t).digest('hex');
export function createApp(db,{adminId=process.env.ADMIN_USER_ID,origin=process.env.FRONTEND_ORIGIN}={}){
 const app=express();app.set('trust proxy',1);app.use(helmet());app.use('/api/me/avatar',express.json({limit:'160kb'}));app.use(express.json({limit:'16kb'}));
 app.use((req,res,next)=>{if(origin&&req.headers.origin===origin){res.set('Access-Control-Allow-Origin',origin);res.set('Vary','Origin');res.set('Access-Control-Allow-Headers','Authorization, Content-Type');res.set('Access-Control-Allow-Methods','GET,POST,OPTIONS');}if(req.method==='OPTIONS')return res.sendStatus(204);next();});
 app.get('/health',(_req,res)=>res.json({ok:true}));
 app.use('/api',rateLimit({windowMs:60000,limit:150,standardHeaders:'draft-8',legacyHeaders:false,message:{error:'操作太频繁，请稍后再试'}}));
 app.use('/api/auth',rateLimit({windowMs:15*60000,limit:40,standardHeaders:'draft-8',legacyHeaders:false,message:{error:'登录尝试过多，请稍后重试'}}));
 app.use('/api',async(req,res,next)=>{res.set('Cache-Control','no-store');const token=req.headers.authorization?.replace(/^Bearer /,'');if(token){const q=await db.query('SELECT u.id,u.username,u.nickname,a.version AS avatar_version FROM sessions s JOIN users u ON u.id=s.user_id LEFT JOIN user_avatars a ON a.user_id=u.id WHERE s.token_hash=$1 AND s.expires_at>now()',[hash(token)]);req.user=q.rows[0];req.token=token;}next();});
 const auth=(req,_res,next)=>{if(!req.user)fail('请先登录',401);next();};
 const admin=(req,_res,next)=>{if(!req.user||req.user.id!==adminId)fail('需要管理员权限',403);next();};
 async function transaction(fn){const c=await db.connect();try{await c.query('BEGIN');const result=await fn(c);await c.query('COMMIT');return result;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
 async function game(c,id,lock=false){const r=await c.query('SELECT * FROM games WHERE id=$1'+(lock?' FOR UPDATE':''),[id]);if(!r.rows[0])fail('球局不存在',404);return r.rows[0];}
 async function log(c,actor,g,target,action){await c.query('INSERT INTO audit_log(id,actor_id,game_id,target_id,action) VALUES($1,$2,$3,$4,$5)',[randomUUID(),actor,g,target,action]);}
 async function session(user,res){const token=randomBytes(32).toString('hex');await db.query("INSERT INTO sessions VALUES($1,$2,$3)",[hash(token),user.id,new Date(Date.now()+7*86400000)]);res.json({token,user:{id:user.id,username:user.username,nickname:user.nickname,isAdmin:user.id===adminId}});}
 app.post('/api/auth/register',async(req,res)=>{const username=text(req.body.username,'账户名',24).toLowerCase(),nickname=text(req.body.nickname,'昵称',20),password=text(req.body.password,'密码',128);if(!/^[a-z0-9_]{3,24}$/.test(username))fail('账户名须为 3～24 位小写字母、数字或下划线');if(password.length<10)fail('密码至少 10 位');const salt=randomBytes(16).toString('hex'),derived=await scrypt(password,salt,64);const user={id:randomUUID(),username,nickname};await db.query('INSERT INTO users VALUES($1,$2,$3,$4,now())',[user.id,username,nickname,`${salt}:${derived.toString('hex')}`]);await session(user,res);});
 app.post('/api/auth/login',async(req,res)=>{const username=text(req.body.username,'账户名',24).toLowerCase(),password=text(req.body.password,'密码',128);const {rows}=await db.query('SELECT * FROM users WHERE username=$1',[username]);const user=rows[0];const [salt,saved]=(user?.password_hash||'dummy:00').split(':');const derived=await scrypt(password,salt,64);if(!user||saved.length!==128||!timingSafeEqual(Buffer.from(saved,'hex'),derived))fail('账户名或密码不正确',401);await session(user,res);});
 app.post('/api/admin/password-reset',admin,async(req,res)=>{
  const username=text(req.body.username,'账户名',24).toLowerCase();
  const token=randomBytes(32).toString('hex'),expires=new Date(Date.now()+30*60000);
  const user=await transaction(async c=>{
   const u=(await c.query('SELECT id,username,nickname FROM users WHERE username=$1 FOR UPDATE',[username])).rows[0];
   if(!u)fail('账户不存在',404);
   await c.query('INSERT INTO password_resets(user_id,token_hash,expires_at) VALUES($1,$2,$3) ON CONFLICT(user_id) DO UPDATE SET token_hash=$2,expires_at=$3',[u.id,hash(token),expires]);
   await log(c,req.user.id,null,u.id,'password_reset_issued');return u;
  });res.json({token,expires_at:expires,user});
 });
 app.post('/api/auth/reset-password',async(req,res)=>{
  const token=text(req.body.token,'重置凭证',64),password=text(req.body.password,'新密码',128);
  if(!/^[a-f0-9]{64}$/.test(token))fail('链接无效或已过期');
  if(password.length<10)fail('密码至少 10 位');
  const salt=randomBytes(16).toString('hex'),derived=await scrypt(password,salt,64);
  await transaction(async c=>{
   const r=(await c.query('DELETE FROM password_resets WHERE token_hash=$1 AND expires_at>now() RETURNING user_id',[hash(token)])).rows[0];
   if(!r)fail('链接无效、已使用或已过期，请联系管理员重新生成');
   await c.query('UPDATE users SET password_hash=$2 WHERE id=$1',[r.user_id,salt+':'+derived.toString('hex')]);
   await c.query('DELETE FROM sessions WHERE user_id=$1',[r.user_id]);
   await log(c,r.user_id,null,r.user_id,'password_reset_completed');
   await c.query('INSERT INTO notifications(id,user_id,message) VALUES($1,$2,$3)',[randomUUID(),r.user_id,'密码已重置，所有旧登录会话已退出。']);
  });res.json({ok:true});
 });
 app.post('/api/logout',auth,async(req,res)=>{await db.query('DELETE FROM sessions WHERE token_hash=$1',[hash(req.token)]);res.json({ok:true});});
 app.use('/api/games/:id',async(req,res,next)=>{
  if(req.method!=='POST'||!['/attendance','/reviews'].includes(req.path))return next();
  const gameId=req.params.id,kind=req.path,before=await profiles(),send=res.json.bind(res);
  res.json=body=>{if(res.statusCode>=400)return send(body);(async()=>{
   for(const p of await profiles()){
    const old=before.find(x=>x.id===p.id);if(!old)continue;
    const changes=[['信誉',old.reputation,p.reputation],['技术',old.skill.score,p.skill.score],['球品',old.spirit.score,p.spirit.score],['综合',old.overall,p.overall]].filter(x=>x[1]!==x[2]);
    if(changes.length)await db.query('INSERT INTO notifications(id,user_id,message,game_id) VALUES($1,$2,$3,$4)',[randomUUID(),p.id,'评分更新：'+changes.map(x=>x[0]+' '+x[1]+' → '+x[2]).join('；'),gameId]);
   }
   if(kind==='/attendance'){
    const labels={reported_absent:'缺勤已被报告，等待核实',absent:'缺勤已核实',present:'已确认到场',unknown:'出勤待核实'};
    await db.query('INSERT INTO notifications(id,user_id,message,game_id) VALUES($1,$2,$3,$4)',[randomUUID(),req.body.user_id,labels[req.body.attendance]+(req.body.reason?'：'+String(req.body.reason):''),gameId]);
   }send(body);
  })().catch(next);return res;};next();
 });
 app.get('/api/me/notifications',auth,async(req,res)=>res.json((await db.query('SELECT * FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100',[req.user.id])).rows));
 app.post('/api/me/notifications/read',auth,async(req,res)=>{await db.query('UPDATE notifications SET read_at=now() WHERE user_id=$1 AND read_at IS NULL',[req.user.id]);res.json({ok:true});});
 app.post('/api/me/avatar',auth,async(req,res)=>{
  if(req.body.image===null){await db.query('DELETE FROM user_avatars WHERE user_id=$1',[req.user.id]);return res.json({ok:true});}
  const image=avatarBytes(req.body.image),version=randomUUID();
  await db.query('INSERT INTO user_avatars(user_id,image,version) VALUES($1,$2,$3) ON CONFLICT(user_id) DO UPDATE SET image=$2,version=$3',[req.user.id,image,version]);
  res.json({ok:true,avatar_version:version});
 });
 app.get('/api/avatars/:id',async(req,res)=>{
  const r=await db.query('SELECT image,version FROM user_avatars WHERE user_id=$1',[req.params.id]);
  if(!r.rows.length)return res.sendStatus(404);
  if(req.query.v===r.rows[0].version)res.set('Cache-Control','public, max-age=86400, immutable');res.type('png').send(Buffer.from(r.rows[0].image));
 });
 app.get('/api/me',auth,async(req,res)=>{
  const issues=await db.query('SELECT * FROM issues WHERE user_id=$1 ORDER BY created_at DESC',[req.user.id]);
  const isAdmin=req.user.id===adminId;
  const hosted=await db.query('SELECT 1 FROM games WHERE host_id=$1 LIMIT 1',[req.user.id]);
  const a=await db.query("SELECT count(*)::int AS n FROM registrations r JOIN games g ON g.id=r.game_id WHERE r.attendance='reported_absent' AND NOT g.cancelled AND ($1::boolean OR g.host_id=$2)",[isAdmin,req.user.id]);
  const i=isAdmin?await db.query('SELECT count(*)::int AS n FROM issues WHERE resolved=false'):{rows:[{n:0}]};
  res.json({...req.user,isAdmin,canReviewAttendance:isAdmin||hosted.rows.length>0,adminConfigured:Boolean(adminId),pendingCount:a.rows[0].n+i.rows[0].n,issues:issues.rows});
 });
 app.get('/api/me/activity',auth,async(req,res)=>{
  const u=(await db.query('SELECT id,nickname,created_at FROM users WHERE id=$1',[req.user.id])).rows[0];
  const r=await db.query("SELECT r.*,g.title,g.starts_at,g.ends_at,g.cancelled FROM registrations r JOIN games g ON g.id=r.game_id WHERE r.user_id=$1 AND r.status='joined' AND NOT g.cancelled AND g.ends_at<=now()",[req.user.id]);
  const v=await db.query("SELECT v.* FROM reviews v JOIN games g ON g.id=v.game_id JOIN registrations a ON a.game_id=v.game_id AND a.user_id=v.author_id JOIN registrations t ON t.game_id=v.game_id AND t.user_id=v.target_id WHERE v.target_id=$1 AND NOT g.cancelled AND g.ends_at<=now() AND a.attendance='present' AND t.attendance='present' AND a.status='joined' AND t.status='joined'",[req.user.id]);
  res.json(activity(u,r.rows,v.rows));
 });
 app.get('/api/games',async(_req,res)=>{const {rows}=await db.query("SELECT g.*,u.nickname AS host_name,(SELECT count(*)::int FROM registrations r WHERE r.game_id=g.id AND r.status='joined') AS joined FROM games g JOIN users u ON u.id=g.host_id ORDER BY g.starts_at DESC LIMIT 100");res.json(rows);});
 app.post('/api/games',auth,async(req,res)=>{const b=gameFields(req.body),id=randomUUID();await transaction(async c=>{await c.query('INSERT INTO games(id,host_id,title,venue,starts_at,ends_at,capacity,level,fee,notes) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[id,req.user.id,b.title,b.venue,b.starts_at,b.ends_at,b.capacity,b.level,b.fee,b.notes]);await c.query("INSERT INTO registrations(game_id,user_id,status) VALUES($1,$2,'joined')",[id,req.user.id]);});res.status(201).json({id});});
 app.post('/api/games/:id/edit',auth,async(req,res)=>{await transaction(async c=>{
  const g=await game(c,req.params.id,true);
  if(g.host_id!==req.user.id&&req.user.id!==adminId)fail('只有组织者或管理员可修改球局',403);
  if(g.cancelled||new Date(g.starts_at)<=new Date())fail('球局已开始或已取消，不能修改');
  const b=gameFields(req.body);
  const count=(await c.query("SELECT count(*)::int AS n FROM registrations WHERE game_id=$1 AND status='joined'",[g.id])).rows[0].n;
  if(b.capacity<count)fail('人数上限不能少于已报名人数（'+count+' 人）');
  await c.query('UPDATE games SET title=$2,venue=$3,starts_at=$4,ends_at=$5,capacity=$6,level=$7,fee=$8,notes=$9 WHERE id=$1',[g.id,b.title,b.venue,b.starts_at,b.ends_at,b.capacity,b.level,b.fee,b.notes]);
  await log(c,req.user.id,g.id,null,JSON.stringify({type:'edit',before:g,after:b}));
 });res.json({ok:true});});
 app.post('/api/games/:id/start',auth,async(req,res)=>{await transaction(async c=>{
  const g=await game(c,req.params.id,true);
  if(g.host_id!==req.user.id&&req.user.id!==adminId)fail('只有组织者或管理员可提前开场',403);
  const now=new Date();
  if(g.cancelled||new Date(g.starts_at)<=now)fail('球局已开始或已取消');
  await c.query('UPDATE games SET starts_at=$2 WHERE id=$1',[g.id,now]);
  await log(c,req.user.id,g.id,null,JSON.stringify({type:'start',scheduled_start:g.starts_at,actual_start:now}));
 });res.json({ok:true});});
 app.get('/api/games/:id',async(req,res)=>{const g=await game(db,req.params.id);const members=await db.query("SELECT r.*,u.nickname,a.version AS avatar_version FROM registrations r JOIN users u ON u.id=r.user_id LEFT JOIN user_avatars a ON a.user_id=u.id WHERE game_id=$1 AND status<>'left' ORDER BY joined_at,user_id",[g.id]);const myReviews=req.user?(await db.query('SELECT target_id,skill,spirit FROM reviews WHERE game_id=$1 AND author_id=$2',[g.id,req.user.id])).rows:[];res.json({...g,members:members.rows,myReviews,reviewOpen:reviewOpen(g),serverNow:new Date().toISOString(),reviewDeadline:new Date(new Date(g.ends_at).getTime()+3600000).toISOString()});});
 app.post('/api/games/:id/join',auth,async(req,res)=>{const result=await transaction(async c=>{const g=await game(c,req.params.id,true);if(g.cancelled||new Date(g.starts_at)<=new Date())fail('球局已取消或开始');const own=await c.query('SELECT * FROM registrations WHERE game_id=$1 AND user_id=$2',[g.id,req.user.id]);if(own.rows[0]?.status==='joined')return {status:'joined'};const count=await c.query("SELECT count(*)::int AS n FROM registrations WHERE game_id=$1 AND status='joined'",[g.id]);const waiters=await c.query("SELECT user_id FROM registrations WHERE game_id=$1 AND status='waiting' ORDER BY joined_at,user_id",[g.id]);const first=waiters.rows[0]?.user_id;const status=count.rows[0].n<g.capacity&&(!first||first===req.user.id)?'joined':'waiting';await c.query("INSERT INTO registrations(game_id,user_id,status) VALUES($1,$2,$3) ON CONFLICT(game_id,user_id) DO UPDATE SET status=$3,joined_at=CASE WHEN registrations.status='left' THEN now() ELSE registrations.joined_at END",[g.id,req.user.id,status]);return {status};});res.json(result);});
 app.post('/api/games/:id/leave',auth,async(req,res)=>{await transaction(async c=>{const g=await game(c,req.params.id,true);if(new Date(g.starts_at)<=new Date())fail('球局开始后不能退出，请联系组织者');if(g.host_id===req.user.id)fail('组织者请使用取消球局');await c.query("UPDATE registrations SET status='left' WHERE game_id=$1 AND user_id=$2",[g.id,req.user.id]);});res.json({ok:true});});
 app.post('/api/games/:id/cancel',auth,async(req,res)=>{await transaction(async c=>{const g=await game(c,req.params.id,true);if(g.host_id!==req.user.id)fail('只有组织者可取消',403);if(new Date(g.starts_at)<=new Date())fail('球局已开始，请通过申诉处理异常');await c.query('UPDATE games SET cancelled=true WHERE id=$1',[g.id]);await log(c,req.user.id,g.id,null,'cancel');});res.json({ok:true});});
 app.post('/api/games/:id/attendance',auth,async(req,res)=>{await transaction(async c=>{const g=await game(c,req.params.id,true);if(g.host_id!==req.user.id&&req.user.id!==adminId)fail('只有组织者或管理员可记录出勤',403);if(g.cancelled||new Date(g.starts_at)>new Date())fail('球局开场后才能确认到场');const state=req.body.attendance,allowed=['present','reported_absent','absent','unknown'];if(!allowed.includes(state))fail('出勤状态无效');if(state!=='present'&&new Date(g.ends_at)>new Date())fail('球局结束后才能报告或核实缺席');const member=(await c.query("SELECT * FROM registrations WHERE game_id=$1 AND user_id=$2 AND status='joined'",[g.id,req.body.user_id])).rows[0];if(!member)fail('该用户不是正式参与者');if(state==='absent'&&member.attendance!=='reported_absent')fail('请先报告缺席，再核实处理');if(state==='absent'||member.attendance==='reported_absent'||member.attendance==='absent')text(req.body.reason,'核实说明',1000);await c.query('UPDATE registrations SET attendance=$3 WHERE game_id=$1 AND user_id=$2',[g.id,req.body.user_id,state]);await log(c,req.user.id,g.id,req.body.user_id,JSON.stringify({type:'attendance',before:member.attendance,after:state,reason:String(req.body.reason||'').slice(0,1000)}));});res.json({ok:true});});
 app.post('/api/games/:id/reviews',auth,async(req,res)=>{await transaction(async c=>{const g=await game(c,req.params.id,true);if(!reviewOpen(g))fail('评价仅在球局结束后的 1 小时内开放');const target=text(req.body.target_id,'球友 ID',50);if(target===req.user.id)fail('不能评价自己');const members=await c.query("SELECT user_id FROM registrations WHERE game_id=$1 AND status='joined' AND attendance='present' AND user_id IN ($2,$3)",[g.id,req.user.id,target]);if(members.rows.length!==2)fail('双方均须已确认到场');const skill=score(req.body.skill),spirit=score(req.body.spirit);if(skill===null&&spirit===null)fail('至少选择一个评价维度');await c.query('INSERT INTO reviews(game_id,author_id,target_id,skill,spirit) VALUES($1,$2,$3,$4,$5) ON CONFLICT(game_id,author_id,target_id) DO UPDATE SET skill=$4,spirit=$5',[g.id,req.user.id,target,skill,spirit]);});res.json({ok:true});});
 async function profiles(){const [u,r,v]=await Promise.all([db.query('SELECT u.id,u.nickname,a.version AS avatar_version FROM users u LEFT JOIN user_avatars a ON a.user_id=u.id'),db.query("SELECT r.* FROM registrations r JOIN games g ON g.id=r.game_id WHERE g.cancelled=false AND r.status='joined' AND g.ends_at<=now()"),db.query("SELECT v.* FROM reviews v JOIN games g ON g.id=v.game_id JOIN registrations a ON a.game_id=v.game_id AND a.user_id=v.author_id JOIN registrations t ON t.game_id=v.game_id AND t.user_id=v.target_id WHERE g.cancelled=false AND g.ends_at<=now() AND a.attendance='present' AND t.attendance='present' AND a.status='joined' AND t.status='joined'")]);return u.rows.map(x=>profile(x,r.rows.filter(y=>y.user_id===x.id),v.rows.filter(y=>y.target_id===x.id)));}
 app.get('/api/profiles',async(_req,res)=>res.json(await profiles()));
 app.post('/api/games/:id/issues',auth,async(req,res)=>{const g=await game(db,req.params.id);const member=await db.query('SELECT 1 FROM registrations WHERE game_id=$1 AND user_id=$2',[g.id,req.user.id]);if(!member.rows.length)fail('仅本场报名者可申诉');await db.query('INSERT INTO issues(id,game_id,user_id,reason) VALUES($1,$2,$3,$4)',[randomUUID(),g.id,req.user.id,text(req.body.reason,'申诉说明',1000)]);res.json({ok:true});});
 app.get('/api/admin/issues',auth,async(req,res)=>{
  const all=req.user.id===adminId;
  if(!all&&!(await db.query('SELECT 1 FROM games WHERE host_id=$1 LIMIT 1',[req.user.id])).rows.length)fail('仅组织者或管理员可查看审核中心',403);
  const issues=all?await db.query('SELECT i.*,u.nickname,g.title FROM issues i JOIN users u ON u.id=i.user_id JOIN games g ON g.id=i.game_id ORDER BY resolved,created_at DESC LIMIT 100'):{rows:[]};
  const absent=await db.query("SELECT r.*,u.nickname,g.title FROM registrations r JOIN users u ON u.id=r.user_id JOIN games g ON g.id=r.game_id WHERE r.attendance='reported_absent' AND NOT g.cancelled AND ($1::boolean OR g.host_id=$2)",[all,req.user.id]);
  const history=await db.query("SELECT l.id,l.action,l.created_at,u.nickname AS actor_name,t.nickname AS target_name,g.title FROM audit_log l JOIN users u ON u.id=l.actor_id LEFT JOIN users t ON t.id=l.target_id JOIN games g ON g.id=l.game_id WHERE l.action LIKE '%attendance%' AND ($1::boolean OR g.host_id=$2) ORDER BY l.created_at DESC LIMIT 30",[all,req.user.id]);
  res.json({issues:issues.rows,absent:absent.rows,history:history.rows});
 });
 app.post('/api/admin/issues/:id',admin,async(req,res)=>{await transaction(async c=>{const item=(await c.query('SELECT * FROM issues WHERE id=$1 FOR UPDATE',[req.params.id])).rows[0];if(!item)fail('申诉不存在',404);const resolution=text(req.body.resolution,'处理结果',1000);await c.query('UPDATE issues SET resolved=true,resolution=$2 WHERE id=$1',[item.id,resolution]);await log(c,req.user.id,item.game_id,item.user_id,`issue:${item.id}:${resolution}`);});res.json({ok:true});});
 app.use('/api',(_req,res)=>res.status(404).json({error:'接口不存在'}));
 app.use(express.static(fileURLToPath(new URL('../public',import.meta.url))));
 app.use((err,_req,res,_next)=>{const status=err.code==='23505'?409:err.status||500;if(status>=500)console.error('Request failed:',err.code||err.name);res.status(status).json({error:err.code==='23505'?'该账户名已被注册':status>=500?'服务暂时不可用，请稍后重试':err.message});});
 return app;
}
