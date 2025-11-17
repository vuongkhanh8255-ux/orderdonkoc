// src/supabaseClient.js

import { createClient } from '@supabase/supabase-js'

// Dùng 'import.meta.env' để đọc file .env trong VITE
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Kiểm tra xem nó đọc được chưa
if (!supabaseUrl || !supabaseAnonKey) {
  alert("LỖI CẤU HÌNH: Không tìm thấy VITE_SUPABASE_URL hoặc VITE_SUPABASE_ANON_KEY trong file .env. Hãy kiểm tra lại!");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)