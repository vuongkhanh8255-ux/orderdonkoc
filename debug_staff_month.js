
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://xkyhvcmnkrxdtmwtghln.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhreWh2Y21ua3J4ZHRtd3RnaGxuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NzkwODkxNiwiZXhwIjoyMDczNDg0OTE2fQ.HzOyx0Shk2WIgAiebqz27Vzv1q0poWqD08kEXWVe64Q';
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkStaffMonthDistribution() {
    console.log("Checking duplicates/distribution for ALL TIME...");

    const { data: links, error } = await supabase
        .from('air_links')
        .select(`
            id, 
            ngay_air,
            nhansu ( ten_nhansu )
        `);

    if (error) {
        console.error("Error:", error);
        return;
    }

    console.log(`Total links found in DB: ${links.length}`);
    const stats = {};

    links.forEach(l => {
        const name = l.nhansu?.ten_nhansu || 'Unknown';
        if (!stats[name]) stats[name] = {};

        let key = 'No Date';
        if (l.ngay_air) {
            const d = new Date(l.ngay_air);
            if (!isNaN(d.getTime())) {
                key = `${d.getMonth() + 1}/${d.getFullYear()}`;
            }
        }

        stats[name][key] = (stats[name][key] || 0) + 1;
    });

    console.table(stats);
}

checkStaffMonthDistribution();
