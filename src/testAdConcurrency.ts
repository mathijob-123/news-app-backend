import express from 'express';
import { apiRouter } from './routes/api.js';
import { runAuthMigration } from './db/authMigration.js';
import { testDbConnection, pool } from './config/db.js';

async function runAdConcurrencyTest() {
  console.log('===============================================================');
  console.log('--- STARTING AD REACH LIMIT & CONCURRENCY AUTO-STOP TEST ---');
  console.log('===============================================================');

  const dbOk = await testDbConnection();
  if (dbOk) {
    console.log('[DB] Ensuring database columns and running migrations...');
    await runAuthMigration();
    console.log('[DB] Migration verification complete.');
  } else {
    console.log('[Memory] Running against in-memory fallback store.');
  }

  const app = express();
  app.use(express.json());
  app.use('/api', apiRouter);

  const server = app.listen(0);
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 5001;
  const baseUrl = `http://localhost:${port}`;
  console.log(`[Test Server] Listening on ${baseUrl}`);

  try {
    const testAdId = `ad_test_${Date.now()}`;
    const reachCap = 15;

    console.log(`\n[Step 1] Creating test advertisement (ID: ${testAdId}) with Reach Limit = ${reachCap}, Auto-Stop = TRUE...`);
    const createRes = await fetch(`${baseUrl}/api/ads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: testAdId,
        title: 'Super Auto Store - Grand Opening Festival',
        advertiserName: 'Super Auto Ltd',
        adType: 'banner',
        mediaUrl: 'https://example.com/banner.jpg',
        ctaUrl: 'https://example.com',
        ctaText: 'Visit Now',
        targetLocation: { district: 'Chennai' },
        position: 'after_3',
        startDate: '2026-09-20',
        endDate: '2026-10-20',
        status: 'active',
        reachLimit: reachCap,
        autoStop: true
      })
    });

    const createData = (await createRes.json()) as any;
    if (!createData.success) {
      throw new Error(`Failed to create test ad: ${JSON.stringify(createData)}`);
    }
    console.log(`[Success] Ad created: Reach Limit = ${createData.data.reachLimit}, Auto-Stop = ${createData.data.autoStop}, Status = ${createData.data.status}`);

    // Concurrency Stress Test: 40 simultaneous impression requests
    const totalRequests = 40;
    console.log(`\n[Step 2] Firing ${totalRequests} SIMULTANEOUS concurrent requests to /api/ads/${testAdId}/impression...`);

    const startTime = Date.now();
    const concurrentPromises = Array.from({ length: totalRequests }, (_, i) =>
      fetch(`${baseUrl}/api/ads/${testAdId}/impression`, { method: 'POST' }).then((r) => r.json() as Promise<any>)
    );

    const responses = await Promise.all(concurrentPromises);
    const duration = Date.now() - startTime;
    console.log(`[Completed] All ${totalRequests} requests resolved in ${duration}ms.`);

    const successfulImpressions = responses.filter((r: any) => r.success === true);
    const rejectedImpressions = responses.filter((r: any) => r.success === false);

    console.log(`[Results Summary]`);
    console.log(`  -> Successful impressions accepted: ${successfulImpressions.length}`);
    console.log(`  -> Requests rejected due to Auto-Stop: ${rejectedImpressions.length}`);

    // Fetch the final ad state
    const fetchAdsRes = await fetch(`${baseUrl}/api/ads`);
    const allAdsData = (await fetchAdsRes.json()) as any;
    const finalAd = (allAdsData.data || []).find((a: any) => a.id === testAdId);

    console.log(`\n[Step 3] Verifying Final Campaign State:`);
    console.log(`  -> Final Impressions: ${finalAd?.impressions}`);
    console.log(`  -> Final Status: '${finalAd?.status}'`);
    console.log(`  -> Expected Impressions: ${reachCap}`);
    console.log(`  -> Expected Status: 'stopped'`);

    if (finalAd?.impressions !== reachCap) {
      throw new Error(`CONCURRENCY LEAK DETECTED! Expected ${reachCap} impressions, but got ${finalAd?.impressions}`);
    }
    if (finalAd?.status !== 'stopped') {
      throw new Error(`STATUS MISMATCH! Expected 'stopped', but got '${finalAd?.status}'`);
    }
    if (successfulImpressions.length !== reachCap) {
      throw new Error(`RACE CONDITION DETECTED! Expected ${reachCap} successful responses, but got ${successfulImpressions.length}`);
    }

    console.log(`\n[PASSED] Exact Reach Limit boundary enforced! No duplicate or overflow impressions occurred.`);

    // Step 4: Subsequent request after auto-stopped
    console.log(`\n[Step 4] Testing subsequent impression on stopped ad...`);
    const afterStopRes = await fetch(`${baseUrl}/api/ads/${testAdId}/impression`, { method: 'POST' });
    const afterStopData = (await afterStopRes.json()) as any;
    console.log(`  -> Response:`, afterStopData);
    if (afterStopData.success !== false || !afterStopData.message.includes('not active')) {
      throw new Error(`Expected rejection message for stopped ad, but got: ${JSON.stringify(afterStopData)}`);
    }
    console.log(`[PASSED] Blocked subsequent impressions after ad was auto-stopped.`);

    // Step 5: Extend reach limit and reactivate
    console.log(`\n[Step 5] Extending reach limit to 25 and reactivating ad...`);
    const updateRes = await fetch(`${baseUrl}/api/ads/${testAdId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reachLimit: 25,
        status: 'active'
      })
    });
    const updateData = (await updateRes.json()) as any;
    console.log(`  -> Updated Status: ${updateData.data?.status}, New Limit: ${updateData.data?.reachLimit}`);

    // Fire 5 more impressions
    console.log(`  -> Firing 5 more impressions...`);
    const morePromises = Array.from({ length: 5 }, () =>
      fetch(`${baseUrl}/api/ads/${testAdId}/impression`, { method: 'POST' }).then((r) => r.json() as Promise<any>)
    );
    const moreResponses = await Promise.all(morePromises);
    const moreSuccess = moreResponses.filter((r: any) => r.success === true);
    console.log(`  -> 5/5 Successful: ${moreSuccess.length === 5}`);

    // Check final count is 20
    const finalCheckRes = await fetch(`${baseUrl}/api/ads`);
    const finalCheckData = (await finalCheckRes.json()) as any;
    const finalAd2 = (finalCheckData.data || []).find((a: any) => a.id === testAdId);
    console.log(`  -> Impressions after resume: ${finalAd2?.impressions} (Status: ${finalAd2?.status})`);

    if (finalAd2?.impressions !== 20 || finalAd2?.status !== 'active') {
      throw new Error(`Failed to resume ad! Impressions: ${finalAd2?.impressions}, Status: ${finalAd2?.status}`);
    }

    console.log(`[PASSED] Extended reach limit and resumed campaign successfully.`);

    // Step 6: Cleanup
    console.log(`\n[Step 6] Cleaning up test ad...`);
    await fetch(`${baseUrl}/api/ads/${testAdId}`, { method: 'DELETE' });
    console.log(`[Cleaned up] Test ad removed.`);

    console.log('\n===============================================================');
    console.log('ALL AD REACH LIMIT & CONCURRENCY TESTS PASSED SUCCESSFULLY! ✅');
    console.log('===============================================================');
  } finally {
    server.close();
  }
}

runAdConcurrencyTest().catch((err) => {
  console.error('\n❌ Test Failed with Error:', err);
  process.exit(1);
});
