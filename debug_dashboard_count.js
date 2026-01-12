
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://xkyhvcmnkrxdtmwtghln.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhreWh2Y21ua3J4ZHRtd3RnaGxuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NzkwODkxNiwiZXhwIjoyMDczNDg0OTE2fQ.HzOyx0Shk2WIgAiebqz27Vzv1q0poWqD08kEXWVe64Q';
const supabase = createClient(supabaseUrl, supabaseKey);

async function debugCount() {
    console.log("Checking total count of chitiettonguis...");

    // Check count
    const { count, error } = await supabase
        .from('chitiettonguis')
        .select('*', { count: 'exact', head: true });

    if (error) {
        console.error("Query Error:", error);
    } else {
        console.log("Total chitiettonguis count:", count);
        if (count >= 1000) {
            console.log("WARNING: Default Supabase limit is 1000. Data is likely truncated.");
        }
    }
}

debugCount();
