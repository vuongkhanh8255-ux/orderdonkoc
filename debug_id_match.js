import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://xkyhvcamkrxdtmwtgphn.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhreWh2Y2Fta3J4ZHRtd3RncGhuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzMzODU5ODEsImV4cCI6MjA0ODk2MTk4MX0.4FVEKSZjWnP_Ze-wUjJWoBUZkJH_f9ibCPwC0KNiRIs';
const supabase = createClient(supabaseUrl, supabaseKey);

async function debugIDMatching() {
    console.log('🔍 Debugging ID Matching...\n');

    // 1. Fetch sheet data
    const sheetId = '11yicmEef0XG1dHbVXHL0BgT1oS9Wx_Hq';
    const gid = '626517460';
    const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&gid=${gid}`;

    console.log('📥 Fetching CSV from Google Sheet...');
    const res = await fetch(url);
    const csvText = await res.text();

    const rows = csvText.split('\n').map(row => {
        const matches = row.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || [];
        return matches.map(m => m.replace(/^"|"$/g, '').trim());
    });

    // Find header
    let headerIdx = -1;
    for (let i = 0; i < Math.min(20, rows.length); i++) {
        const rowStr = rows[i].join(' ').toLowerCase();
        if (rowStr.includes('id video')) {
            headerIdx = i;
            break;
        }
    }

    const headers = rows[headerIdx];
    const iID = headers.findIndex(h => String(h).toLowerCase().includes('id video'));

    // Get first 5 video IDs from sheet
    const sheetIDs = [];
    for (let i = headerIdx + 1; i < Math.min(headerIdx + 6, rows.length); i++) {
        if (rows[i] && rows[i][iID]) {
            const normalized = String(rows[i][iID] || '').replace(/'/g, '').replace(/"/g, '').trim();
            sheetIDs.push(normalized);
        }
    }

    console.log('\n📊 Sheet IDs (first 5):');
    sheetIDs.forEach((id, idx) => {
        console.log(`  [${idx}] type: ${typeof id}, value: "${id}", length: ${id.length}`);
    });

    // 2. Fetch air_links from database
    console.log('\n📥 Fetching air_links from database...');
    const { data: airLinks, error } = await supabase
        .from('air_links')
        .select('id, id_video')
        .limit(5);

    if (error) throw error;

    console.log('\n🗄️ Database IDs (first 5):');
    airLinks.forEach((link, idx) => {
        const normalized = String(link.id_video || '').trim();
        console.log(`  [${idx}] type: ${typeof link.id_video}, value: "${link.id_video}", normalized: "${normalized}", length: ${normalized.length}`);
    });

    // 3. Test matching
    console.log('\n🔗 Testing ID Matching:');
    const sheetSet = new Set(sheetIDs);

    airLinks.forEach(link => {
        const normalized = String(link.id_video || '').trim();
        const exists = sheetSet.has(normalized);
        console.log(`  DB ID "${normalized}" exists in sheet? ${exists}`);
    });

    // 4. Check if ANY match exists
    console.log('\n✅ Summary:');
    const matches = airLinks.filter(link => {
        const normalized = String(link.id_video || '').trim();
        return sheetSet.has(normalized);
    });
    console.log(`  Matched: ${matches.length} / ${airLinks.length}`);

    if (matches.length === 0) {
        console.log('\n⚠️ NO MATCHES! Possible reasons:');
        console.log('  1. Video IDs in sheet are different from database');
        console.log('  2. Format mismatch (quotes, spaces, etc.)');
        console.log('  3. Need to check exact character codes');

        if (sheetIDs.length > 0 && airLinks.length > 0) {
            console.log('\n🔬 Character code analysis:');
            console.log('  Sheet ID[0]:', sheetIDs[0].split('').map(c => c.charCodeAt(0)));
            console.log('  DB ID[0]:', String(airLinks[0].id_video).split('').map(c => c.charCodeAt(0)));
        }
    }
}

debugIDMatching().catch(console.error);
