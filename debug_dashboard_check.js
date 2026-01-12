
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://xkyhvcmnkrxdtmwtghln.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhreWh2Y21ua3J4ZHRtd3RnaGxuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NzkwODkxNiwiZXhwIjoyMDczNDg0OTE2fQ.HzOyx0Shk2WIgAiebqz27Vzv1q0poWqD08kEXWVe64Q';
const supabase = createClient(supabaseUrl, supabaseKey);

async function debugData() {
    console.log("Checking chitiettonguis + donguis (ngay_gui)...");

    // Fetch 5 recent items
    const { data, error } = await supabase
        .from('chitiettonguis')
        .select(`
            id,
            donguis ( id, ngay_gui, koc_ho_ten ),
            sanphams ( ten_sanpham, brand_id )
        `)
        .limit(5);

    if (error) {
        console.error("Query Error:", error);
        return;
    }

    if (data.length === 0) {
        console.log("No data returned from chitiettonguis");
        return;
    }

    console.log("First Item Full Structure:");
    console.log(JSON.stringify(data[0], null, 2));

    const item = data[0];
    const ngayGui = item.donguis?.ngay_gui;

    console.log("\n--- FORMAT CHECK ---");
    console.log("ngay_gui value:", ngayGui, "(Type:", typeof ngayGui, ")");

    // Simulate filter check
    const targetMonth = "2026-01";
    if (ngayGui && typeof ngayGui === 'string') {
        const startsWithCheck = ngayGui.startsWith(targetMonth);
        console.log(`Starts with '${targetMonth}'?`, startsWithCheck);
    } else {
        console.log("Date is not a string or missing.");
    }
}

debugData();
