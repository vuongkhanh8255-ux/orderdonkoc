
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://xkyhvcmnkrxdtmwtghln.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhreWh2Y21ua3J4ZHRtd3RnaGxuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NzkwODkxNiwiZXhwIjoyMDczNDg0OTE2fQ.HzOyx0Shk2WIgAiebqz27Vzv1q0poWqD08kEXWVe64Q';
const supabase = createClient(supabaseUrl, supabaseKey);

async function clearAirDates() {
    console.log("⚠️ Starting Bulk Clear of 'ngay_air' column...");

    // Update all rows where ngay_air is NOT null
    const { data, error, count } = await supabase
        .from('air_links')
        .update({ ngay_air: null })
        .not('ngay_air', 'is', null);

    if (error) {
        console.error("❌ Error clearing dates:", error);
    } else {
        console.log(`✅ Cleared dates successfully. Rows affected: (check Supabase logs if count missing)`);
        // Note: count is only returned if count option is set, but update returns null data by default
        // We assume success if no error.
    }
}

clearAirDates();
