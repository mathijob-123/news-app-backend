import { pool, testDbConnection } from './dist/config/db.js';
import { r2Client, R2_BUCKET_NAME, isR2Configured } from './dist/config/r2.js';
import { HeadBucketCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';

async function test() {
  console.log('--- Testing Connections ---');
  console.log('R2 Configured:', isR2Configured);
  console.log('R2 Bucket:', R2_BUCKET_NAME);
  
  try {
    const r2Res = await r2Client.send(new ListObjectsV2Command({ Bucket: R2_BUCKET_NAME, MaxKeys: 5 }));
    console.log('R2 Connection SUCCESS! KeyCount:', r2Res.KeyCount);
  } catch (err) {
    console.error('R2 Connection Error:', err.message);
  }

  const dbOk = await testDbConnection();
  console.log('Supabase DB Connected:', dbOk);
  if (dbOk) {
    const res = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'");
    console.log('Existing DB tables:', res.rows.map(r => r.table_name));
  }
  await pool.end();
  process.exit(0);
}

test();
