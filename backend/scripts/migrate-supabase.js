import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';

const poolerUrl = 'postgresql://postgres.totyacemykfhulicuqvi:%5E0MaiKgvT%24rFj%21F16MvQ@aws-1-sa-east-1.pooler.supabase.com:5432/postgres';

async function main() {
  const client = new pg.Client({ connectionString: poolerUrl });
  await client.connect();
  console.log('Connected to Supabase PostgreSQL!');

  const tablesRes = await client.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public'
  `);
  console.log('Current public tables in Supabase:', tablesRes.rows.map(r => r.table_name));

  const rootDir = path.resolve('..');
  const schemaSql = fs.readFileSync(path.join(rootDir, 'db', 'schema.sql'), 'utf8');
  console.log('Executing db/schema.sql...');
  await client.query(schemaSql);
  console.log('Schema executed successfully!');

  const seedSql = fs.readFileSync(path.join(rootDir, 'db', 'seeds', '01_difficulty_profiles.sql'), 'utf8');
  console.log('Executing db/seeds/01_difficulty_profiles.sql...');
  await client.query(seedSql);
  console.log('Seed executed successfully!');

  const profilesRes = await client.query('SELECT * FROM difficulty_profiles');
  console.log('Difficulty profiles:', profilesRes.rows);

  await client.end();
}

main().catch(err => {
  console.error('Migration error:', err);
  process.exit(1);
});
