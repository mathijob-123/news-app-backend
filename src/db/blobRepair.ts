import { pool } from '../config/db.js';

export const VERIFIED_SAMPLE_VIDEOS = [
  'https://pub-5051362230a34232ba4afb2cf7ac345c.r2.dev/videos/1790055069322_p0l98f.mp4',
  'https://pub-5051362230a34232ba4afb2cf7ac345c.r2.dev/videos/1789997093458_sk5cm0.mp4',
  'https://pub-5051362230a34232ba4afb2cf7ac345c.r2.dev/videos/1789996953775_f7x7uj.mp4',
  'https://pub-5051362230a34232ba4afb2cf7ac345c.r2.dev/videos/1789995126975_l0csk7.mp4'
];

const DEFAULT_THUMBNAIL = 'https://images.unsplash.com/photo-1585829365295-ab7cd400c167?w=600';

export async function runBlobRepair(): Promise<number> {
  if (!process.env.DATABASE_URL) {
    return 0;
  }

  try {
    const checkRes = await pool.query(
      `SELECT id, headline, media_url, thumbnail_url 
       FROM video_posts 
       WHERE media_url LIKE 'blob:%' 
          OR media_url LIKE '%commondatastorage.googleapis.com%' 
          OR thumbnail_url LIKE 'blob:%'`
    );

    if (checkRes.rows.length === 0) {
      console.log('[Blob Repair] All video_posts media URLs are healthy and CDN-backed.');
      return 0;
    }

    console.log(`[Blob Repair] Found ${checkRes.rows.length} posts with dead blob/forbidden URLs. Repairing now...`);

    let repairedCount = 0;
    for (let i = 0; i < checkRes.rows.length; i++) {
      const row = checkRes.rows[i];
      const needsMediaFix = !row.media_url || row.media_url.startsWith('blob:') || row.media_url.includes('commondatastorage.googleapis.com');
      const newMedia = needsMediaFix
        ? VERIFIED_SAMPLE_VIDEOS[i % VERIFIED_SAMPLE_VIDEOS.length]
        : row.media_url;
      const newThumb = row.thumbnail_url?.startsWith('blob:')
        ? DEFAULT_THUMBNAIL
        : (row.thumbnail_url || newMedia);

      await pool.query(
        'UPDATE video_posts SET media_url = $1, thumbnail_url = $2, updated_at = NOW() WHERE id = $3',
        [newMedia, newThumb, row.id]
      );
      console.log(`[Blob Repair] Repaired post [${row.id}] "${row.headline}" -> ${newMedia}`);
      repairedCount++;
    }

    console.log(`[Blob Repair] Successfully repaired ${repairedCount} posts in database.`);
    return repairedCount;
  } catch (err: any) {
    console.warn('[Blob Repair Warning]:', err.message);
    return 0;
  }
}
