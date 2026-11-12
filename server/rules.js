export function fail(message,status=400){throw Object.assign(new Error(message),{status});}
export function text(value,name,max=200){if(typeof value!=='string'||!value.trim()||value.trim().length>max)fail(`${name}不能为空，且最多 ${max} 字`);return value.trim();}
export function score(v){if(v===null||v===undefined||v==='')return null;const n=Number(v);if(!Number.isInteger(n)||n<1||n>5)fail('评分须为 1～5');return n;}
export function reviewOpen(game,now=Date.now()){return !game.cancelled && now>=new Date(game.ends_at).getTime() && now<new Date(game.ends_at).getTime()+72*3600000;}
export function gameFields(b){
 const start=new Date(b.starts_at),end=new Date(b.ends_at),capacity=Number(b.capacity);
 if(!Number.isFinite(+start)||!Number.isFinite(+end)||start<=new Date()||end<=start||end-start>86400000)fail('请选择未来的开场时间，时长须在 24 小时内');
 if(!Number.isInteger(capacity)||capacity<2||capacity>48)fail('人数须为 2～48');
 return {title:text(b.title,'标题',60),venue:text(b.venue,'场地',160),starts_at:start,ends_at:end,capacity,level:text(b.level,'水平',30),fee:text(b.fee,'费用说明',80),notes:String(b.notes||'').slice(0,1000)};
}
export function profile(user,registrations,reviews){
 const present=registrations.filter(r=>r.attendance==='present').length;
 const absent=registrations.filter(r=>r.attendance==='absent').length;
 const aggregate=key=>{
  const authors=new Map();for(const r of reviews){if(r[key]!=null){const a=authors.get(r.author_id)||[];a.push(Number(r[key]));authors.set(r.author_id,a);}}
  const values=[...authors.values()].map(a=>a.reduce((s,x)=>s+x,0)/a.length);
  const base=key==='skill'?3:4;
  return {score:Math.round((5*base+values.reduce((s,x)=>s+x,0))/(5+values.length)*20),count:values.length};
 };
 const skill=aggregate('skill'),spirit=aggregate('spirit');
 const reputation=Math.round((400+100*present)/(5+present+absent));
 const eligible=true;
 const overall=Math.round(reputation*.4+skill.score*.3+spirit.score*.3);
 return {id:user.id,nickname:user.nickname,present,absent,reputation,skill,spirit,overall,eligible};
}
