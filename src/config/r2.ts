import { S3Client } from '@aws-sdk/client-s3';
import dotenv from 'dotenv';

dotenv.config();

const accountId = process.env.R2_ACCOUNT_ID || '2c19cbcff135db269d4e0579ff1a4690';
const accessKeyId = process.env.R2_ACCESS_KEY_ID || '';
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY || '';

export const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || 'spotlight-media';
export const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL || '';

export const isR2Configured = Boolean(accountId && accessKeyId && secretAccessKey);

export const r2Client = new S3Client({
  region: 'auto',
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId,
    secretAccessKey,
  },
});
