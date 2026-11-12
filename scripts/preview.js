// 本地 UI 验证专用：真实 PostgreSQL 引擎（WASM）内存数据库，退出即丢弃，禁止部署。
import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import {createApp} from '../server/app.js';
if(process.env.NODE_ENV==='production')throw new Error('预览脚本不能用于生产');
const pg=new PGlite();await pg.exec(await readFile(new URL('../server/schema.sql',import.meta.url),'utf8'));
const db={query:(s,p)=>pg.query(s,p),connect:async()=>({query:(s,p)=>pg.query(s,p),release(){}})};
createApp(db).listen(3000,'127.0.0.1',()=>console.log('仅本机预览：http://localhost:3000（临时数据，退出丢弃）'));
