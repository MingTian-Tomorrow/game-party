import pg from 'pg';
export function database() {
 if (!process.env.DATABASE_URL) throw new Error('请先在 .env 或平台环境变量中配置 DATABASE_URL');
 return new pg.Pool({connectionString:process.env.DATABASE_URL,max:5,connectionTimeoutMillis:15000});
}
