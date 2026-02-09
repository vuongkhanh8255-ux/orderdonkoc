
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://xkyhvcmnkrxdtmwtghln.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhreWh2Y21ua3J4ZHRtd3RnaGxuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NzkwODkxNiwiZXhwIjoyMDczNDg0OTE2fQ.HzOyx0Shk2WIgAiebqz27Vzv1q0poWqD08kEXWVe64Q';
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkStaffDistribution() {
    console.log("Checking duplicates/distribution for Dec 2025...");

    const { data: links, error } = await supabase
        .from('air_links')
        .select(`
            id, 
            id_video,
            ngay_air,
            nhansu_id,
            nhansu ( ten_nhansu )
        `)
        .gte('ngay_air', '2025-12-01')
        .lte('ngay_air', '2025-12-31');

    if (error) {
        console.error("Error:", error);
        return;
    }

    console.log(`Total links in Dec 2025: ${links.length}`);
    if (links.length === 0) return;

    const staffCounts = {};
    let nullStaff = 0;
    const uniqueVideos = new Set();
    const uniqueVideosWithNullStaff = new Set();

    links.forEach(l => {
        uniqueVideos.add(l.id_video);
        const name = l.nhansu?.ten_nhansu || 'NULL/Unknown';
        if (!l.nhansu) {
            nullStaff++;
            uniqueVideosWithNullStaff.add(l.id_video);
        }

        staffCounts[name] = (staffCounts[name] || 0) + 1;
    });

    console.log("Unique Videos:", uniqueVideos.size);
    console.log("Distribution by Staff:", staffCounts);
    console.log("Entries with NO Staff/Unknown:", nullStaff);
}

checkStaffDistribution();
