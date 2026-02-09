import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    'https://xkyhvcamkrxdtmwtgphn.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhreWh2Y2Fta3J4ZHRtd3RncGhuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzMzODU5ODEsImV4cCI6MjA0ODk2MTk4MX0.4FVEKSZjWnP_Ze-wUjJWoBUZkJH_f9ibCPwC0KNiRIs'
);

async function debugMatching() {
    console.log('🔍 Debugging Video ID Matching...\n');

    // 1. Get sample from tiktok_performance (T12/2025)
    const { data: perf } = await supabase
        .from('tiktok_performance')
        .select('video_id, gmv, month, year')
        .eq('month', 12)
        .eq('year', 2025)
        .limit(10);

    console.log(`📊 tiktok_performance (T12/2025): ${perf?.length || 0} samples`);
    if (perf && perf.length > 0) {
        console.log('Sample IDs (type, value):');
        perf.slice(0, 3).forEach((p, i) => {
            console.log(`  [${i}] ${typeof p.video_id} "${p.video_id}" (GMV: ${p.gmv})`);
        });
    }

    // 2. Get sample from air_links (T12/2025)
    const { data: air } = await supabase
        .from('air_links')
        .select('id_video, ngay_air')
        .gte('ngay_air', '2025-12-01')
        .lt('ngay_air', '2026-01-01')
        .limit(10);

    console.log(`\n🔗 air_links (T12/2025): ${air?.length || 0} samples`);
    if (air && air.length > 0) {
        console.log('Sample IDs (type, value):');
        air.slice(0, 3).forEach((a, i) => {
            console.log(`  [${i}] ${typeof a.id_video} "${a.id_video}"`);
        });
    }

    // 3. Check for matches
    if (perf && air && perf.length > 0 && air.length > 0) {
        const perfIDs = new Set(perf.map(p => String(p.video_id).trim()));
        const airIDs = air.map(a => String(a.id_video).trim());

        const matches = airIDs.filter(id => perfIDs.has(id));

        console.log(`\n🎯 MATCH TEST:`);
        console.log(`  perfMap IDs: ${perfIDs.size}`);
        console.log(`  airLink IDs: ${airIDs.length}`);
        console.log(`  Matches: ${matches.length}`);

        if (matches.length > 0) {
            console.log(`  ✅ FOUND MATCHES! Example: ${matches[0]}`);
        } else {
            console.log(`  ❌ NO MATCHES!`);
            console.log(`\nComparing first IDs:`);
            console.log(`  Perf: "${Array.from(perfIDs)[0]}"`);
            console.log(`  Air:  "${airIDs[0]}"`);
            console.log(`  Match? ${Array.from(perfIDs)[0] === airIDs[0]}`);
        }
    }

    // 4. Specific video check
    const testID = '7589271972241100050';
    console.log(`\n🔎 Testing specific ID: ${testID}`);

    const { data: p } = await supabase.from('tiktok_performance').select('*').eq('video_id', testID).limit(1);
    const { data: a } = await supabase.from('air_links').select('*').eq('id_video', testID).limit(1);

    console.log(`  In tiktok_performance? ${p && p.length > 0 ? '✅ YES' : '❌ NO'}`);
    console.log(`  In air_links? ${a && a.length > 0 ? '✅ YES' : '❌ NO'}`);
}

debugMatching().catch(console.error);
