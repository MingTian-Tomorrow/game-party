import {readFile} from 'node:fs/promises';
import {database} from './db.js';
const db=database();
try {await db.query(await readFile(new URL('./schema.sql',import.meta.url),'utf8')); console.log('数据库结构初始化完成');} finally {await db.end();}
