import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    'https://xkyhvcamkrxdtmwtgphn.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhreWh2Y2Fta3J4ZHRtd3RncGhuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzMzODU5ODEsImV4cCI6MjA0ODk2MTk4MX0.4FVEKSZjWnP_Ze-wUjJWoBUZkJH_f9ibCPwC0KNiRIs'
);

async function checkSpecificVideo() {
    const videoID = '7589271972241100050';

    console.log(`🔍 Checking video: ${videoID}\n`);

    // 1. Check in tiktok_performance (imported data)
    const { data: perf, error: perfErr } = await supabase
        .from('tiktok_performance')
        .select('*')
        .eq('video_id', videoID);

    console.log('📊 In tiktok_performance (imported sheet):');
    if (perf && perf.length > 0) {
        console.log(`  ✅ FOUND!`);
        console.log(`  Month/Year: ${perf[0].month}/${perf[0].year}`);
        console.log(`  GMV: ${perf[0].gmv?.toLocaleString()}`);
        console.log(`  Views: ${perf[0].views?.toLocaleString()}`);
    } else {
        console.log(`  ❌ NOT FOUND`);
    }

    // 2. Check in air_links
    const { data: air, error: airErr } = await supabase
        .from('air_links')
        .select('id, id_video, ngay_air, brand_id, nhansu_id')
        .eq('id_video', videoID);

    console.log('\n🔗 In air_links:');
    if (air && air.length > 0) {
        console.log(`  ✅ FOUND!`);
        console.log(`  Air date: ${air[0].ngay_air}`);
        console.log(`  Brand ID: ${air[0].brand_id}`);

        const airDate = new Date(air[0].ngay_air);
        const airMonth = airDate.getMonth() + 1;
        const airYear = airDate.getFullYear();
        console.log(`  Air month: ${airMonth}/${airYear}`);
    } else {
        console.log(`  ❌ NOT FOUND`);
    }

    // 3. Check type mismatch
    if (perf && perf.length > 0 && air && air.length > 0) {
        console.log('\n🎯 MATCH ANALYSIS:');
        console.log(`  Both tables have this video!`);
        console.log(`  video_id type in perf: ${typeof perf[0].video_id}`);
        console.log(`  id_video type in air: ${typeof air[0].id_video}`);
        console.log(`  Are they ===? ${perf[0].video_id === air[0].id_video}`);
        console.log(`  String comparison: "${String(perf[0].video_id)}" === "${String(air[0].id_video)}"? ${String(perf[0].video_id) === String(air[0].id_video)}`);
    }

    // 4. Check if filtering is the issue
    console.log('\n📅 Filter check (T12/2025):');
    const { data: dec2025, error } = await supabase
        .from('air_links')
        .select('id, id_video, ngay_air')
        .gte('ngay_air', '2025-12-01')
        .lt('ngay_air', '2026-01-01')
        .limit(5);

    console.log(`  Videos in T12/2025: ${dec2025?.length || 0}`);
    if (dec2025 && dec2025.length > 0) {
        console.log('  Sample:', dec2025.map(d => d.id_video));
    }
}

checkSpecificVideo().catch(console.error);
