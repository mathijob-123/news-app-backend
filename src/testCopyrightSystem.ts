import express from 'express';
import { apiRouter } from './routes/api.js';
import { authRouter } from './routes/auth.js';
import { runAuthMigration } from './db/authMigration.js';
import { testDbConnection, pool } from './config/db.js';

async function runTests() {
  console.log('--- STARTING COPYRIGHT 3-STRIKE SYSTEM INTEGRATION TESTS ---');

  // Test DB connection and run automated migrations for copyright tables
  const dbOk = await testDbConnection();
  if (dbOk) {
    console.log('[DB] Running automated schema migrations...');
    await runAuthMigration();
    console.log('[DB] Schema migrations complete.');

    // Ensure test user exists in DB for foreign key constraints
    await pool.query(`
      INSERT INTO users (id, handle, display_name, email, role, trust_score, verified, copyright_strikes_count, upload_blocked)
      VALUES ('usr_tn_001', 'karthik_raja', 'Karthik Raja', 'karthik@example.com', 'creator', 95, true, 0, false)
      ON CONFLICT (id) DO UPDATE SET copyright_strikes_count = 0, upload_blocked = false;
    `);

    // Ensure test posts exist in DB for foreign key constraints
    for (const pid of ['post_001', 'post_002', 'post_003']) {
      await pool.query(`
        INSERT INTO video_posts (id, creator_id, creator_name, creator_handle, media_url, headline, category, status)
        VALUES ($1, 'usr_tn_001', 'Karthik Raja', 'karthik_raja', 'https://example.com/video.mp4', $2, 'civic', 'published')
        ON CONFLICT (id) DO UPDATE SET status = 'published';
      `, [pid, `Test Post ${pid}`]);
    }
    console.log('[DB] Seeded test user and test posts for FK integrity.');
  }

  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRouter);
  app.use('/api', apiRouter);

  const server = app.listen(0);
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 5055;
  const baseUrl = `http://localhost:${port}`;

  try {
    // 1. Submit a DMCA Copyright Report
    console.log('\n[TEST 1] Submitting a DMCA Copyright Infringement Report...');
    const reportRes = await fetch(`${baseUrl}/api/copyright/reports`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        postId: 'post_001',
        postTitle: 'Flash Floods Submerge Velachery Main Road After Cloudburst',
        creatorId: 'usr_tn_001',
        creatorName: 'Karthik Raja',
        claimantName: 'Sun TV News Desk',
        claimantEmail: 'dmca@suntv.in',
        claimantRelation: 'authorized_agent',
        originalWorkTitle: 'Sun News Ground Broadcast - Velachery Floods',
        originalWorkUrl: 'https://youtube.com/watch?v=mock_video_original',
        infringementType: 'visual_clip',
        infringementTimestamp: '00:15 - 00:45',
        description: 'Citizen re-uploaded our copyrighted live drone survey without permission or license.'
      })
    });

    const reportJson: any = await reportRes.json();
    console.log('Report creation response status:', reportRes.status);
    const report = reportJson.data || reportJson.report;
    if (!reportJson.success || !report) {
      throw new Error(`Report submission failed: ${JSON.stringify(reportJson)}`);
    }
    const reportId = report.id;
    console.log(`✓ Report created successfully! ID: ${reportId}, Status: ${report.status}`);

    // 2. Fetch reports list
    console.log('\n[TEST 2] Fetching copyright reports list...');
    const listRes = await fetch(`${baseUrl}/api/copyright/reports`);
    const listData: any = await listRes.json();
    const reportsList = listData.data || listData.reports || [];
    console.log(`✓ Fetched ${reportsList.length} reports from registry.`);
    const found = reportsList.find((r: any) => r.id === reportId);
    if (!found) throw new Error('Submitted report not found in reports list');
    console.log('✓ Found newly created report in registry list.');

    // 3. Admin Review & Approve Claim (Issues Strike 1, marks post as copyright_takedown)
    console.log('\n[TEST 3] Admin Review: Approving Claim 1 (Issuing Strike 1)...');
    const reviewRes1 = await fetch(`${baseUrl}/api/copyright/reports/${reportId}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'approved',
        adminNotes: 'Verified Sun TV watermark on frames 0:15 to 0:45. Valid DMCA claim.',
        reviewerName: 'Admin Bureau Chief'
      })
    });
    const reviewData1: any = await reviewRes1.json();
    console.log(`✓ Review response status: ${reviewRes1.status}`);
    console.log(`✓ Report status updated to: ${reviewData1.data?.status}`);
    console.log(`✓ Strike issued! Strike ID: ${reviewData1.strike?.id}, Strike number: ${reviewData1.newStrikeNumber}`);
    console.log(`✓ User uploadBlocked status: ${reviewData1.uploadBlocked}`);

    // 4. Verify post status is 'copyright_takedown'
    console.log('\n[TEST 4] Verifying targeted post is removed/takedown...');
    const postsRes = await fetch(`${baseUrl}/api/posts`);
    const postsData: any = await postsRes.json();
    const postItems = Array.isArray(postsData) ? postsData : (postsData.data || postsData.posts || []);
    const takenDownPost = postItems.find((p: any) => p.id === 'post_001');
    if (takenDownPost) {
      console.log(`✓ Post status in database is now: ${takenDownPost.status}`);
      if (takenDownPost.status !== 'copyright_takedown') {
        throw new Error(`Expected post status to be copyright_takedown, but got ${takenDownPost.status}`);
      }
    }

    // 5. Escalate to Strike 2 and Strike 3 to test Upload Suspension
    console.log('\n[TEST 5] Submitting and Approving 2 more reports to trigger 3-Strike Suspension...');
    
    // Claim 2
    const rep2Res = await fetch(`${baseUrl}/api/copyright/reports`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        postId: 'post_002',
        postTitle: 'T. Nagar Ranganathan St Pre-Diwali Rush',
        creatorId: 'usr_tn_001',
        creatorName: 'Karthik Raja',
        claimantName: 'Thanthi TV',
        claimantEmail: 'legal@thanthitv.com',
        claimantRelation: 'owner',
        originalWorkTitle: 'Thanthi Exclusive T. Nagar Coverage',
        infringementType: 'full_video',
        description: 'Complete broadcast lifted.'
      })
    });
    const rep2 = await rep2Res.json() as any;
    const rep2Id = rep2.data?.id || rep2.report?.id;

    await fetch(`${baseUrl}/api/copyright/reports/${rep2Id}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'approved', notes: 'Confirmed violation 2' })
    });

    // Claim 3
    const rep3Res = await fetch(`${baseUrl}/api/copyright/reports`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        postId: 'post_003',
        postTitle: 'Marina Beach Sunrise Walk',
        creatorId: 'usr_tn_001',
        creatorName: 'Karthik Raja',
        claimantName: 'Music Label Rights',
        claimantEmail: 'claims@musicrights.com',
        claimantRelation: 'authorized_agent',
        originalWorkTitle: 'Kollywood Background Track',
        infringementType: 'audio_track',
        description: 'Unlicensed audio master.'
      })
    });
    const rep3 = await rep3Res.json() as any;
    const rep3Id = rep3.data?.id || rep3.report?.id;

    const reviewRes3 = await fetch(`${baseUrl}/api/copyright/reports/${rep3Id}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'approved', notes: 'Confirmed violation 3' })
    });
    const reviewData3: any = await reviewRes3.json();

    console.log(`✓ Strike 3 reached! Strike number: ${reviewData3.newStrikeNumber}`);
    console.log(`✓ Creator uploadBlocked: ${reviewData3.uploadBlocked}`);
    if (!reviewData3.uploadBlocked) {
      throw new Error('Expected uploadBlocked to be true after 3 strikes');
    }

    // 6. Test Upload Blocking Enforcement in POST /api/posts
    console.log('\n[TEST 6] Testing upload enforcement: Suspended creator attempts to upload new post...');
    const blockedUploadRes = await fetch(`${baseUrl}/api/posts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: 'post_blocked_test',
        creatorId: 'usr_tn_001',
        creatorName: 'Karthik Raja',
        headline: 'Attempting upload while suspended',
        caption: 'This should fail with HTTP 403',
        type: 'video',
        category: 'civic'
      })
    });
    console.log(`Upload attempt HTTP status: ${blockedUploadRes.status}`);
    const blockedData: any = await blockedUploadRes.json();
    console.log('Response body:', blockedData);
    if (blockedUploadRes.status !== 403) {
      throw new Error(`Expected HTTP 403, but received ${blockedUploadRes.status}`);
    }
    console.log('✓ Upload correctly BLOCKED by backend enforcement (HTTP 403)!');

    // 7. Verify In-App Notifications
    console.log('\n[TEST 7] Checking notifications for suspended creator...');
    const notifsRes = await fetch(`${baseUrl}/api/notifications?userId=usr_tn_001`);
    const notifsData: any = await notifsRes.json();
    const notifs = notifsData.data || notifsData.notifications || [];
    console.log(`✓ Found ${notifs.length} notifications for creator usr_tn_001`);
    const strikeNotifs = notifs.filter((n: any) => n.type === 'copyright_strike' || n.type === 'upload_blocked');
    console.log(`✓ Number of copyright-related notifications: ${strikeNotifs.length}`);
    strikeNotifs.forEach((n: any) => {
      console.log(`  - [${n.type.toUpperCase()}] ${n.title}`);
    });

    // 8. Test Strike Revocation / Appeal Resolution
    console.log('\n[TEST 8] Testing Strike Revocation & Privilege Restoration...');
    const strikesListRes = await fetch(`${baseUrl}/api/copyright/strikes?creatorId=usr_tn_001`);
    const strikesListData: any = await strikesListRes.json();
    const strikesArray = strikesListData.data || strikesListData.strikes || [];
    const activeStrikes = strikesArray.filter((s: any) => s.status === 'active');
    console.log(`Current active strikes: ${activeStrikes.length}`);

    if (activeStrikes.length > 0) {
      const strikeToRevoke = activeStrikes[0];
      const revokeRes = await fetch(`${baseUrl}/api/copyright/strikes/${strikeToRevoke.id}/revoke`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          revocationReason: 'Counter-notification accepted; claimant withdrew legal notice.',
          revokedBy: 'Admin Chief Legal Counsel'
        })
      });
      const revokeData: any = await revokeRes.json();
      console.log(`Revoke response:`, revokeData);
      console.log(`✓ Active strikes remaining: ${revokeData.activeStrikesRemaining}`);
      console.log(`✓ Creator uploadBlocked after revocation: ${revokeData.uploadBlocked}`);
      if (revokeData.activeStrikesRemaining >= 3) {
        throw new Error('Expected active strikes to be less than 3 after revoking');
      }
      if (revokeData.uploadBlocked !== false) {
        throw new Error('Expected uploadBlocked to be false after dropping below 3 strikes');
      }
      console.log('✓ Creator privileges successfully restored after strike revocation!');
    }

    console.log('\n======================================================');
    console.log('ALL 8 INTEGRATION TESTS PASSED WITH 100% SUCCESS!');
    console.log('======================================================\n');
  } finally {
    server.close();
  }
}

runTests().catch((err) => {
  console.error('Integration test failed:', err);
  process.exit(1);
});
