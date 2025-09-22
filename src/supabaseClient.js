import { createClient } from '@supabase/supabase-js'

// Mấy thông tin này ông lấy từ các bước đầu tiên nhé
// Vào Project Settings > API trong Supabase
const supabaseUrl = 'https://xkyhvcmnkrxdtmwtghln.supabase.co'; 
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhreWh2Y21ua3J4ZHRtd3RnaGxuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc5MDg5MTYsImV4cCI6MjA3MzQ4NDkxNn0.WPQAAZ8NnwXKvf7dqzsimGl_jfSDClfwZgDYvfjVDQs'; 

export const supabase = createClient(supabaseUrl, supabaseKey);
