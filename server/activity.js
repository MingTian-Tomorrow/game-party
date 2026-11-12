import {profile} from './rules.js';

export const beijingDay=value=>new Date(new Date(value).getTime()+8*3600000).toISOString().slice(0,10);

// Reconstruct cumulative scores using today's valid records, not invented historic snapshots.
export function activity(user,registrations,reviews,now=Date.now()){
 const records=registrations.filter(r=>r.status==='joined'&&!r.cancelled&&new Date(r.ends_at).getTime()<=now).sort((a,b)=>new Date(a.ends_at)-new Date(b.ends_at)||a.game_id.localeCompare(b.game_id));
 const ids=new Set(records.map(r=>r.game_id));
 const valid=reviews.filter(r=>ids.has(r.game_id));
 const timeline=[{at:user.created_at,title:'注册起点',...profile(user,[],[])}],seen=new Set(),days=new Map();
 for(const r of records){
  seen.add(r.game_id);
  if(r.attendance==='present'){
   const date=beijingDay(r.starts_at),d=days.get(date)||{date,count:0,games:[]};
   d.count++;d.games.push({id:r.game_id,title:r.title});days.set(date,d);
  }
  if(['present','absent'].includes(r.attendance))timeline.push({at:r.ends_at,gameId:r.game_id,title:r.title,...profile(user,records.filter(x=>seen.has(x.game_id)),valid.filter(x=>seen.has(x.game_id)))});
 }
 const today=beijingDay(now),activeDays=[...days.values()].sort((a,b)=>a.date.localeCompare(b.date));
 const last=activeDays.at(-1)?.date||null;
 const daysSince=last===null?null:Math.round((Date.parse(today)-Date.parse(last))/86400000);
 const recentDays=activeDays.filter(d=>Date.parse(today)-Date.parse(d.date)<7*86400000).length;
 return {today,days:activeDays,daysSince,recentDays,profile:profile(user,records,valid),timeline};
}
