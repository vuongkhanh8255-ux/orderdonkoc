
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://xkyhvcmnkrxdtmwtghln.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhreWh2Y21ua3J4ZHRtd3RnaGxuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NzkwODkxNiwiZXhwIjoyMDczNDg0OTE2fQ.HzOyx0Shk2WIgAiebqz27Vzv1q0poWqD08kEXWVe64Q';
const supabase = createClient(supabaseUrl, supabaseKey);

async function clearAnalytics() {
    console.log("⚠️ Cleansing Dashboard Stats (video_analytics)...");

    // Delete all stats records to reset dashboard to 0
    const { error } = await supabase
        .from('video_analytics')
        .delete()
        .not('id', 'is', null);

    if (error) {
        console.error("❌ Error clearing stats:", error);
    } else {
        console.log("✅ Dashboard Stats Cleared! 'Video Air' should now be 0.");
    }
}

clearAnalytics();
