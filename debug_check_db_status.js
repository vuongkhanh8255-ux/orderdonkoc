
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://xkyhvcmnkrxdtmwtghln.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhreWh2Y21ua3J4ZHRtd3RnaGxuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NzkwODkxNiwiZXhwIjoyMDczNDg0OTE2fQ.HzOyx0Shk2WIgAiebqz27Vzv1q0poWqD08kEXWVe64Q';
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkStatus() {
    const videoId = '7587802516138528007'; // From User Screenshot
    const month = 12;
    const year = 2025;

    console.log(`Checking Video ID: ${videoId}`);

    // 1. Check Air Links (Must have ngay_air)
    const { data: airLink, error: airError } = await supabase
        .from('air_links')
        .select('*')
        .eq('id_video', videoId);

    if (airError) console.error("AirLink Error:", airError);
    else {
        console.log("AirLink Found:", airLink.length);
        if (airLink.length > 0) {
            console.log("AirLink Data:", JSON.stringify(airLink[0], null, 2));
            if (!airLink[0].ngay_air) {
                console.error("❌ CRTICAL: ngay_air is NULL. Mapping failed.");
            } else {
                console.log("✅ ngay_air is present:", airLink[0].ngay_air);
            }
        } else {
            console.error("❌ Video ID not found in air_links table!");
        }
    }

    // 2. Check Video Analytics
    const { data: analytics, error: anaError } = await supabase
        .from('video_analytics')
        .select('*')
        .eq('video_id', videoId);

    if (anaError) console.error("Analytics Error:", anaError);
    else {
        console.log("Analytics Found:", analytics.length);
        if (analytics.length > 0) {
            console.log("Analytics Data:", JSON.stringify(analytics[0], null, 2));
        } else {
            console.error("❌ Video ID not found in video_analytics table! (Upload failed or filtered)");
        }
    }

    // 3. Count Total Analytics for Dec 2025
    const { count: countAna } = await supabase
        .from('video_analytics')
        .select('*', { count: 'exact', head: true })
        .eq('report_month', month)
        .eq('report_year', year);

    console.log(`Total Analytics Rows for ${month}/${year}: ${countAna}`);
}

checkStatus();
