import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const supabaseUrl = 'https://xkyhvcamkrxdtmwtgphn.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhreWh2Y2Fta3J4ZHRtd3RncGhuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzMzODU5ODEsImV4cCI6MjA0ODk2MTk4MX0.4FVEKSZjWnP_Ze-wUjJWoBUZkJH_f9ibCPwC0KNiRIs';
const supabase = createClient(supabaseUrl, supabaseKey);

async function runMigration() {
    console.log('🔄 Running database migration...\n');

    const sql = fs.readFileSync('./migrations/create_tiktok_performance.sql', 'utf8');

    // Split by semicolons to run each statement separately
    const statements = sql
        .split(';')
        .map(s => s.trim())
        .filter(s => s && !s.startsWith('--'));

    for (const statement of statements) {
        console.log(`Executing: ${statement.substring(0, 50)}...`);

        const { data, error } = await supabase.rpc('exec_sql', { sql_query: statement });

        if (error) {
            console.error(`❌ Error:`, error.message);
            // Try alternative method
            console.log('⚠️ RPC failed, trying direct query...');
            const { error: error2 } = await supabase.from('_migrations').insert({ statement });
            if (error2) console.error('Still failed:', error2.message);
        } else {
            console.log('✅ Success\n');
        }
    }

    console.log('\n🎉 Migration complete! Verifying table...');

    // Verify table exists
    const { data, error } = await supabase
        .from('tiktok_performance')
        .select('count')
        .limit(1);

    if (error) {
        console.error('❌ Table verification failed:', error.message);
        console.log('\n📝 Please run the SQL manually in Supabase Dashboard:');
        console.log('   1. Go to https://supabase.com/dashboard');
        console.log('   2. Select your project → SQL Editor');
        console.log('   3. Paste contents of migrations/create_tiktok_performance.sql');
        console.log('   4. Click "Run"');
    } else {
        console.log('✅ Table verified! Ready to import data.');
    }
}

runMigration().catch(console.error);
