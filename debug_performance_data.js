import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://xkyhvcamkrxdtmwtgphn.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhreWh2Y2Fta3J4ZHRtd3RncGhuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzMzODU5ODEsImV4cCI6MjA0ODk2MTk4MX0.4FVEKSZjWnP_Ze-wUjJWoBUZkJH_f9ibCPwC0KNiRIs';
const supabase = createClient(supabaseUrl, supabaseKey);

async function debugDataFlow() {
    console.log('🔍 Debugging Data Flow...\n');

    // 1. Check imported data in DB
    const { data: perfData, error: perfError } = await supabase
        .from('tiktok_performance')
        .select('*')
        .eq('month', 12)
        .eq('year', 2025);

    if (perfError) {
        console.error('❌ Failed to load performance data:', perfError);
        return;
    }

    console.log(`📊 Performance Data (T12/2025): ${perfData?.length || 0} rows`);
    if (perfData && perfData.length > 0) {
        const totalGMV = perfData.reduce((sum, d) => sum + (d.gmv || 0), 0);
        console.log(`💰 Total GMV in DB: ${totalGMV.toLocaleString()} VND`);
        console.log('Sample video IDs from DB:', perfData.slice(0, 5).map(d => d.video_id));
    } else {
        console.log('⚠️ No data found in DB for T12/2025!');
        return;
    }

    // 2. Check air_links
    const { data: airLinks, error: airError } = await supabase
        .from('air_links')
        .select('id, id_video, ngay_air, brand_id, nhansu_id')
        .limit(10);

    if (airError) {
        console.error('❌ Failed to load air_links:', airError);
        return;
    }

    console.log(`\n🔗 Air Links: ${airLinks?.length || 0} rows (showing first 10)`);
    console.log('Sample video IDs from air_links:', airLinks.slice(0, 5).map(l => l.id_video));

    // 3. Check for matches
    const perfIDs = new Set(perfData.map(d => String(d.video_id).trim()));
    const airIDs = airLinks.map(l => String(l.id_video).trim());

    const matches = airIDs.filter(id => perfIDs.has(id));

    console.log(`\n🎯 Matching Analysis:`);
    console.log(`  Total in DB: ${perfIDs.size}`);
    console.log(`  Total in air_links (sample): ${airIDs.length}`);
    console.log(`  Matches found: ${matches.length}`);

    if (matches.length === 0) {
        console.log('\n❌ NO MATCHES! Video IDs in DB and air_links are different!');
        console.log('\nComparing first IDs:');
        console.log('  DB ID:', Array.from(perfIDs)[0]);
        console.log('  AirLink ID:', airIDs[0]);
        console.log('  Do they match?', Array.from(perfIDs)[0] === airIDs[0]);
    } else {
        console.log('\n✅ Found matches! Example:', matches[0]);
    }
}

debugDataFlow().catch(console.error);
