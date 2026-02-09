
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://xkyhvcmnkrxdtmwtghln.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhreWh2Y21ua3J4ZHRtd3RnaGxuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NzkwODkxNiwiZXhwIjoyMDczNDg0OTE2fQ.HzOyx0Shk2WIgAiebqz27Vzv1q0poWqD08kEXWVe64Q';
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkStaff() {
    console.log("--- 1. FETCHING NHANSU TABLE ---");
    const { data: nhansuList, error: nsError } = await supabase.from('nhansu').select('id, ten_nhansu');
    if (nsError) { console.error(nsError); return; }

    console.log(`Found ${nhansuList.length} staff.`);
    const minhThao = nhansuList.filter(n => n.ten_nhansu.toLowerCase().includes('thảo'));
    console.log("Staff matching 'Thảo':", minhThao);

    console.log("\n--- 2. CHECKING AIR LINKS (Dec 2025) ---");
    const { data: links, error: lError } = await supabase
        .from('air_links')
        .select(`id, id_video, nhansu_id, nhansu(ten_nhansu)`)
        .gte('ngay_air', '2025-12-01')
        .lte('ngay_air', '2025-12-31');

    if (lError) { console.error(lError); return; }
    console.log(`Found ${links.length} links in Dec 2025.`);

    // Group by Staff
    const counts = {};
    const idCounts = {};

    links.forEach(l => {
        const name = l.nhansu?.ten_nhansu || 'NULL';
        const uid = l.nhansu_id || 'NULL';
        counts[name] = (counts[name] || 0) + 1;
        idCounts[uid] = (idCounts[uid] || 0) + 1;
    });

    console.log("Link Counts by Name:", counts);
    console.log("Link Counts by ID:", idCounts);

    // Check specific ID mismatch for Minh Thảo
    const mt = minhThao.find(n => n.ten_nhansu === 'Minh Thảo');
    if (mt) {
        console.log(`\nMinh Thảo ID in Dropdown (Table): ${mt.id}`);
        console.log(`Links with this ID: ${idCounts[mt.id] || 0}`);
    } else {
        console.log("Minh Thảo not found in nhansu table?");
    }
}

checkStaff();
