require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function run() {
    let airLinks = [];
    let from = 0;
    const size = 1000;
    let more = true;
    while (more) {
        const { data, error } = await supabase
            .from('air_links')
            .select('id, id_video, nhansu_id, nhansu(ten_nhansu)')
            .range(from, from + size - 1);
        if (error) throw error;
        if (data && data.length > 0) {
            airLinks = airLinks.concat(data);
            from += size;
        } else {
            more = false;
        }
    }

    // 2. Fetch all tiktok_performance for Jan 2026
    let perfs = [];
    from = 0;
    more = true;
    while (more) {
        const { data, error } = await supabase
            .from('tiktok_performance')
            .select('video_id, gmv, views')
            .gte('air_date', '2026-01-01')
            .lte('air_date', '2026-01-31')
            .range(from, from + size - 1);
        if (error) throw error;
        if (data && data.length > 0) {
            perfs = perfs.concat(data);
            from += size;
        } else {
            more = false;
        }
    }

    console.log(`Loaded ${airLinks.length} air_links`);
    console.log(`Loaded ${perfs.length} performance records for Jan 2026`);

    // Clean and store airlink video IDs
    const airMap = new Map();
    airLinks.forEach(l => {
        if (l.id_video) {
            airMap.set(String(l.id_video).trim(), l.nhansu?.ten_nhansu || 'Unknown');
        }
    });

    console.log(`Air_links with non-empty id_video: ${airMap.size}`);

    let matchCount = 0;
    let matchedGMV = 0;
    let totalGMV = 0;

    let sampleMismatches = [];

    perfs.forEach(p => {
        const pId = String(p.video_id).trim();
        totalGMV += Number(p.gmv) || 0;
        if (airMap.has(pId)) {
            matchCount++;
            matchedGMV += Number(p.gmv) || 0;
        } else {
            if (sampleMismatches.length < 5 && Number(p.gmv) > 0) {
                sampleMismatches.push(pId);
            }
        }
    });

    console.log(`\n--- RESULTS ---`);
    console.log(`Matched records: ${matchCount} / ${perfs.length}`);
    console.log(`Matched GMV: ${matchedGMV.toLocaleString()} / ${totalGMV.toLocaleString()} (${((matchedGMV / totalGMV) * 100).toFixed(2)}%)`);

    console.log(`\nSample Video IDs in tiktok_performance that DO NOT match any air_link:`);
    console.log(sampleMismatches);

    console.log(`\nSample Video IDs in air_links:`);
    console.log(Array.from(airMap.keys()).slice(0, 5));
}

run().catch(console.error);
