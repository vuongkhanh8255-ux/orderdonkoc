import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    'https://xkyhvcamkrxdtmwtgphn.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhreWh2Y2Fta3J4ZHRtd3RncGhuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzMzODU5ODEsImV4cCI6MjA0ODk2MTk4MX0.4FVEKSZjWnP_Ze-wUjJWoBUZkJH_f9ibCPwC0KNiRIs'
);

async function checkVideoData() {
    console.log('🔍 Checking video 7590005807048068373...\n');

    // 1. Check in tiktok_performance
    const { data: perf } = await supabase
        .from('tiktok_performance')
        .select('*')
        .eq('video_id', '7590005807048068373');

    if (perf && perf.length > 0) {
        console.log('✅ Found in tiktok_performance:');
        console.log(`   Month/Year: ${perf[0].month}/${perf[0].year}`);
        console.log(`   GMV: ${perf[0].gmv?.toLocaleString()} VND`);
    } else {
        console.log('❌ NOT found in tiktok_performance!');
    }

    // 2. Check in air_links
    const { data: air } = await supabase
        .from('air_links')
        .select('id, id_video, ngay_air, brand_id')
        .eq('id_video', '7590005807048068373');

    if (air && air.length > 0) {
        console.log('\n✅ Found in air_links:');
        console.log(`   Air date: ${air[0].ngay_air}`);
        console.log(`   Brand ID: ${air[0].brand_id}`);
    } else {
        console.log('\n❌ NOT found in air_links!');
    }

    // 3. Check what month/year has data
    console.log('\n📊 Checking all imported data...');
    const { data: allPerf } = await supabase
        .from('tiktok_performance')
        .select('month, year, video_id')
        .limit(10);

    if (allPerf && allPerf.length > 0) {
        const months = {};
        allPerf.forEach(p => {
            const key = `${p.month}/${p.year}`;
            months[key] = (months[key] || 0) + 1;
        });

        console.log('Imported data by month:');
        Object.entries(months).forEach(([key, count]) => {
            console.log(`  ${key}: ${count} videos (sample)`);
        });

        console.log('\nSample video IDs:', allPerf.slice(0, 5).map(p => p.video_id));
    }
}

checkVideoData().catch(console.error);
