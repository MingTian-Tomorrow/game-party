// Synthetic data for local, disposable previews only. Never imports production credentials.
import {scryptSync} from 'node:crypto';
export async function seedPreview(pg){
 const password='preview-only-123',salt='local-preview';
 for(const [id,nickname] of [['host','明天'],['guest','小林'],['admin','网站管理员'],['new','新球友']])await pg.query('INSERT INTO users VALUES($1,$2,$3,$4,$5)',['demo-'+id,'demo_'+id,nickname,salt+':'+scryptSync(password,salt,64).toString('hex'),new Date(Date.now()-300*86400000)]);
 const offsets=[280,260,245,220,210,180,177,171,165,160,145,130,126,100,80,75,60,55,40,30,25,20,12,8,6,4,2,0];
 for(let i=0;i<offsets.length;i++){
  const end=new Date(Date.now()-offsets[i]*86400000-600000),start=new Date(+end-7200000),id='demo-game-'+i;
  await pg.query('INSERT INTO games(id,host_id,title,venue,starts_at,ends_at,capacity,level,fee) VALUES($1,$2,$3,$4,$5,$6,12,$7,$8)',[id,'demo-host',offsets[i]===0?'今天的轻松混排':'五山周末排球 · '+(i+1),'34号楼豪华露天室外场',start,end,'休闲混排','免费']);
  for(const u of ['demo-host','demo-guest'])await pg.query("INSERT INTO registrations(game_id,user_id,status,attendance) VALUES($1,$2,'joined','present')",[id,u]);
  await pg.query('INSERT INTO reviews(game_id,author_id,target_id,skill,spirit) VALUES($1,$2,$3,$4,$5)',[id,'demo-guest','demo-host',Math.min(5,2+Math.floor(i/7)),i<10?3:5]);
 }
 await pg.query("UPDATE registrations SET attendance='reported_absent' WHERE game_id='demo-game-27' AND user_id='demo-guest'");
 console.log('演示账户：demo_host / demo_new / demo_admin；密码均为 preview-only-123（仅临时预览）');
}
