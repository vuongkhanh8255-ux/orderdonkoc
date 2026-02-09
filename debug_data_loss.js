
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://xkyhvcmnkrxdtmwtghln.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhreWh2Y21ua3J4ZHRtd3RnaGxuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NzkwODkxNiwiZXhwIjoyMDczNDg0OTE2fQ.HzOyx0Shk2WIgAiebqz27Vzv1q0poWqD08kEXWVe64Q';
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkDataLoss() {
    console.log("Checking Data for Dec 2025...");

    // 1. Get Brands
    const { data: brands } = await supabase.from('brands').select('id, ten_brand');
    const bodymiss = brands.find(b => b.ten_brand.toLowerCase().includes('bodymiss'));
    const mila = brands.find(b => b.ten_brand.toLowerCase().includes('mila'));

    console.log("Brand IDs:", { bodymiss: bodymiss?.id, mila: mila?.id });

    // 2. Count Analytics for Bodymiss
    if (bodymiss) {
        const { count: countB, error: errB } = await supabase
            .from('video_analytics')
            .select('*', { count: 'exact', head: true })
            .eq('report_month', 12)
            .eq('report_year', 2025)
            .eq('brand_id', bodymiss.id);
        console.log(`Bodymiss Records: ${countB} (Error: ${errB?.message})`);

        // Sum GMV
        const { data: dataB } = await supabase
            .from('video_analytics')
            .select('gmv')
            .eq('report_month', 12)
            .eq('report_year', 2025)
            .eq('brand_id', bodymiss.id);
        const totalGMV = dataB?.reduce((sum, item) => sum + (item.gmv || 0), 0) || 0;
        console.log(`Bodymiss Total GMV: ${totalGMV.toLocaleString()} VND`);
    }

    // 3. Count Analytics for Mila
    if (mila) {
        const { count: countM, error: errM } = await supabase
            .from('video_analytics')
            .select('*', { count: 'exact', head: true })
            .eq('report_month', 12)
            .eq('report_year', 2025)
            .eq('brand_id', mila.id);
        console.log(`Mila Records: ${countM} (Error: ${errM?.message})`);

        // Sum GMV
        const { data: dataM } = await supabase
            .from('video_analytics')
            .select('gmv')
            .eq('report_month', 12)
            .eq('report_year', 2025)
            .eq('brand_id', mila.id);
        const totalGMV = dataM?.reduce((sum, item) => sum + (item.gmv || 0), 0) || 0;
        console.log(`Mila Total GMV: ${totalGMV.toLocaleString()} VND`);
    }
}

checkDataLoss();
