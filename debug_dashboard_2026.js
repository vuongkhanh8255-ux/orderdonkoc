
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://xkyhvcmnkrxdtmwtghln.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhreWh2Y21ua3J4ZHRtd3RnaGxuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NzkwODkxNiwiZXhwIjoyMDczNDg0OTE2fQ.HzOyx0Shk2WIgAiebqz27Vzv1q0poWqD08kEXWVe64Q';
const supabase = createClient(supabaseUrl, supabaseKey);

async function debugData() {
    console.log("Fetching chitiettonguis for Jan 2026...");

    // We want to find ITEMS that should match the filter
    // Filter expects: 2026-01
    // Let's optimize by joining donguis and filtering on ngay_gui
    // However, inner join filter syntax in supbase-js:
    // .eq('donguis.ngay_gui', ...) might not work easily for ranges or startsWith without specific syntax.
    // I'll fetch a batch and filter in JS to see what we get.

    const { data: detailData, error } = await supabase
        .from('chitiettonguis')
        .select(`
                    id,
                    donguis!inner ( ngay_gui, koc_ho_ten, nhansu_id ),
                    sanphams ( ten_sanpham, brand_id )
                `)
        // Try to filter for 2026 to reduce noise
        .gte('donguis.ngay_gui', '2026-01-01T00:00:00.000Z')
        .lte('donguis.ngay_gui', '2026-01-31T23:59:59.999Z')
        .limit(20);

    if (error) {
        console.error("Query Error:", error);
        return;
    }

    console.log(`Found ${detailData.length} items for Jan 2026.`);

    if (detailData.length > 0) {
        console.log("Sample Item:");
        // Map it like the app does
        const item = detailData[0];
        const mapped = {
            id: item.id,
            ngay_gui_don: item.donguis?.ngay_gui,
            brand_id: item.sanphams?.brand_id,
            san_pham: item.sanphams?.ten_sanpham
        };
        console.log(JSON.stringify(mapped, null, 2));

        // Check if values resemble "BODYMISS" or "Shimmer..."
        // I don't know the ID for BODYMISS, but I can check the strings.
        console.log("Product Name:", mapped.san_pham);
        console.log("Brand ID:", mapped.brand_id);
    } else {
        console.log("No data found for this date range. This is suspicious if the user sees data in Order Tab.");
    }
}

debugData();
