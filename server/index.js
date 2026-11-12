import {database} from './db.js';
import {createApp} from './app.js';
const db=database();const server=createApp(db).listen(Number(process.env.PORT)||3000,'0.0.0.0',()=>console.log(`本地地址：http://localhost:${process.env.PORT||3000}`));
process.on('SIGTERM',()=>server.close(()=>db.end()));
