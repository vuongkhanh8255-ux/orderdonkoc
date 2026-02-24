require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    const { data: importedData } = await supabase
        .from('tiktok_performance')
        .select('*')
        .eq('month', 1)
        .eq('year', 2026);

    let dbGmv = 0;
    importedData.forEach(d => dbGmv += d.gmv);

    console.log(`Total records in tiktok_performance for 1/2026: ${importedData.length}`);
    console.log(`Sum of GMV in tiktok_performance for 1/2026: ${dbGmv.toLocaleString('vi-VN')}`);

    const { data: airLinks } = await supabase
        .from('air_links')
        .select(`id_video, cast, brands(ten_brand), nhansu(ten_nhansu), ngay_air`)
        .not('id_video', 'is', null);

    console.log(`Total airLinks with id_video: ${airLinks.length}`);

    let matchedGmv = 0;
    let matchedCount = 0;

    const perfMap = new Map();
    importedData.forEach(item => perfMap.set(item.video_id, item));

    const staffGmv = {};
    const processedVideoIds = new Set();

    airLinks.forEach(link => {
        if (!link.id_video || processedVideoIds.has(link.id_video)) return;
        processedVideoIds.add(link.id_video);

        const vid = String(link.id_video).trim();
        const metrics = perfMap.get(vid);

        if (metrics && metrics.gmv > 0) {
            matchedCount++;
            matchedGmv += metrics.gmv;

            const staffName = link.nhansu ? link.nhansu.ten_nhansu : 'Unknown';
            if (!staffGmv[staffName]) staffGmv[staffName] = 0;
            staffGmv[staffName] += metrics.gmv;
        }
    });

    console.log(`Matches found: ${matchedCount}`);
    console.log(`Sum of Matched GMV: ${matchedGmv.toLocaleString('vi-VN')}`);
    console.log('--- GMV by Staff ---');
    console.log(staffGmv);

    // Print some unmatched perf records
    console.log('--- Sample unmatched perf records ---');
    let unmatchedPerfCount = 0;
    for (let item of importedData) {
        if (!processedVideoIds.has(item.video_id)) {
            if (unmatchedPerfCount < 5) {
                console.log(`Perf Video ID: ${item.video_id} - GMV: ${item.gmv}`);
            }
            unmatchedPerfCount++;
        }
    }
    console.log(`Total unmatched perf records: ${unmatchedPerfCount}`);
}

run().catch(console.error);
