import fetch from 'node-fetch';

const baseUrl = 'http://localhost:5000';

async function runAdminTests() {
  console.log('====================================================');
  console.log('       SPOTLIGHT360 ADMIN PANEL TEST SUITE          ');
  console.log('====================================================\n');

  let passedCount = 0;
  let failedCount = 0;

  async function test(name: string, fn: () => Promise<void>) {
    process.stdout.write(`TEST: ${name} ... `);
    try {
      await fn();
      console.log('PASSED \u2705');
      passedCount++;
    } catch (err: any) {
      console.log(`FAILED \u274C (${err.message})`);
      failedCount++;
    }
  }

  // 1. Health & Server check
  await test('Server Health Check (GET /)', async () => {
    const res = await fetch(`${baseUrl}/`);
    if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as any;
    if (!data.version) throw new Error('Missing version in root response');
  });

  // 2. Admin Dashboard Stats
  await test('Admin Dashboard Statistics (GET /api/admin/stats)', async () => {
    const res = await fetch(`${baseUrl}/api/admin/stats`);
    if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as any;
    if (!data.success) throw new Error('data.success is false');
    if (data.data.totalVideosSubmitted === undefined) throw new Error('Missing totalVideosSubmitted stat');
  });

  // 3. Citizen News Review Queue
  let testPostId = '';
  await test('Citizen News Posts Listing (GET /api/posts)', async () => {
    const res = await fetch(`${baseUrl}/api/posts`);
    if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as any;
    if (!data.success || !Array.isArray(data.data)) throw new Error('Invalid posts array');
    if (data.data.length > 0) {
      testPostId = data.data[0].id;
    }
  });

  // 4. Update Citizen Post Review Status
  if (testPostId) {
    await test(`Review Post Status (PATCH /api/posts/${testPostId})`, async () => {
      const res = await fetch(`${baseUrl}/api/posts/${testPostId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminReviewStatus: 'verified_approved',
          adminPayoutAmount: 150,
          adminReviewerDesk: 'Test Editorial Desk'
        })
      });
      if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as any;
      if (!data.success) throw new Error('Update failed');
    });
  }

  // 5. Advertisement Management - List Ads
  await test('Advertisements Listing (GET /api/ads)', async () => {
    const res = await fetch(`${baseUrl}/api/ads`);
    if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as any;
    if (!data.success || !Array.isArray(data.data)) throw new Error('Invalid ads array');
  });

  // 6. Advertisement Creation with Reach Limit & Auto-Stop
  const testAdId = `ad_test_${Date.now()}`;
  await test('Create Ad with Reach Limit & Auto-Stop (POST /api/ads)', async () => {
    const res = await fetch(`${baseUrl}/api/ads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: testAdId,
        title: 'Ponneri Organic Vegetables Special Promo',
        advertiserName: 'Ponneri Farmers Collective',
        adType: 'banner',
        mediaUrl: 'https://images.unsplash.com/photo-1540420773420-3366772f4999?w=600',
        targetUrl: 'https://ponnerifarmers.org',
        callToAction: 'Shop Local',
        startDate: '2026-09-20',
        endDate: '2026-10-20',
        targetLocation: { district: 'Tiruvallur', taluk: 'Ponneri' },
        position: 'feed',
        status: 'active',
        reachLimit: 3,
        autoStop: true
      })
    });
    if (res.status !== 200 && res.status !== 201) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as any;
    if (!data.success) throw new Error('Ad creation failed');
  });

  // 7. Atomic Impression Tracking & Auto-Stop Verification
  await test('Ad Impression Tracking & Auto-Stop Threshold (POST /api/ads/:id/impression)', async () => {
    // 3 impressions to reach the reachLimit of 3
    for (let i = 1; i <= 3; i++) {
      const impRes = await fetch(`${baseUrl}/api/ads/${testAdId}/impression`, { method: 'POST' });
      const impData = (await impRes.json()) as any;
      if (!impData.success) throw new Error(`Impression ${i} failed`);
      if (i === 3) {
        if (impData.data?.status !== 'stopped' && !impData.data?.autoStopped) {
          throw new Error(`Expected ad to be stopped on impression 3, got: ${JSON.stringify(impData)}`);
        }
      }
    }

    // 4th impression must be rejected because ad is already stopped
    const rejectedRes = await fetch(`${baseUrl}/api/ads/${testAdId}/impression`, { method: 'POST' });
    const rejectedData = (await rejectedRes.json()) as any;
    if (rejectedData.success !== false) {
      throw new Error(`Expected 4th impression to be rejected, but it succeeded!`);
    }
  });

  // 8. Social Media Staged Imports Listing
  await test('Social Media Imports Listing (GET /api/social/imports)', async () => {
    const res = await fetch(`${baseUrl}/api/social/imports`);
    if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as any;
    if (!data.success || !Array.isArray(data.data)) throw new Error('Invalid imports array');
  });

  // 9. Fetch Official Social Media Content Dispatches
  let stagedItemId = '';
  await test('Fetch Official Dispatches (POST /api/social/fetch)', async () => {
    const res = await fetch(`${baseUrl}/api/social/fetch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        platform: 'all',
        category: 'all',
        limit: 2
      })
    });
    if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as any;
    if (!data.success || !data.data?.newlyFetched?.length) {
      throw new Error('No items fetched in dispatch');
    }
    stagedItemId = data.data.newlyFetched[0].id;
  });

  // 10. AI Editorial Cleansing on Staged Item
  if (stagedItemId) {
    await test('AI Editorial Enhancement (POST /api/social/ai-enhance)', async () => {
      const res = await fetch(`${baseUrl}/api/social/ai-enhance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: stagedItemId })
      });
      if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as any;
      if (!data.success || !data.data?.aiProcessed) {
        throw new Error('AI processing flag not set');
      }
    });

    // 11. Approve Staged Item to Public Live Feed
    await test('Approve Staged Item to Live Feed (POST /api/social/approve)', async () => {
      const res = await fetch(`${baseUrl}/api/social/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: stagedItemId,
          headline: 'உள்ளூர் செய்தி சோதனை - அங்கீகரிக்கப்பட்டது',
          caption: 'செய்தி ஆசிரியர் குழுவால் சரிபார்க்கப்பட்டு வெளியிடப்பட்டது.',
          category: 'civic',
          priceAward: 100,
          rpmRate: 350
        })
      });
      if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as any;
      if (!data.success || !data.data?.publishedPost) {
        throw new Error('Failed to publish approved dispatch');
      }
    });
  }

  // 12. App Settings Retrieval
  await test('Global App Settings (GET /api/settings)', async () => {
    const res = await fetch(`${baseUrl}/api/settings`);
    if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as any;
    if (!data.success) throw new Error('Failed to fetch settings');
  });

  // 13. Copyright Reports Listing
  await test('Copyright Reports Queue (GET /api/copyright/reports)', async () => {
    const res = await fetch(`${baseUrl}/api/copyright/reports`);
    if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as any;
    if (!data.success || !Array.isArray(data.data)) throw new Error('Invalid copyright reports array');
  });

  console.log('\n====================================================');
  console.log(`TEST SUMMARY: ${passedCount} PASSED, ${failedCount} FAILED`);
  console.log('====================================================\n');

  if (failedCount > 0) {
    process.exit(1);
  }
}

runAdminTests().catch((e) => {
  console.error('Fatal error running admin tests:', e);
  process.exit(1);
});
