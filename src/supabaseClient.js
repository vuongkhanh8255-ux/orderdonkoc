// src/supabaseClient.js

import { createClient } from '@supabase/supabase-js'

// Dùng 'import.meta.env' để đọc file .env trong VITE
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Kiểm tra xem nó đọc được chưa
if (!supabaseUrl || !supabaseAnonKey) {
  alert("LỖI CẤU HÌNH: Không tìm thấy VITE_SUPABASE_URL hoặc VITE_SUPABASE_ANON_KEY trong file .env. Hãy kiểm tra lại!");
}

const _client = createClient(supabaseUrl, supabaseAnonKey)

// ══════════════ GUARD TÀI KHOẢN TRIAL (chỉ xem, KHÔNG sửa) ══════════════
// role='trial' → chặn mọi ghi ở tầng gốc: insert/update/delete/upsert bảng + RPC ghi + upload storage.
// Xem full data bình thường (mọi query đọc + RPC báo cáo vẫn chạy).
const SESSION_KEY = 'sk_session';
const isTrial = () => {
  try {
    const s = JSON.parse(localStorage.getItem(SESSION_KEY) || sessionStorage.getItem(SESSION_KEY) || 'null');
    return !!s && s.role === 'trial';
  } catch { return false; }
};
// RPC có GHI dữ liệu (mọi RPC khác là đọc/báo cáo → cho chạy). No-op êm để trang tự-chạy không lỗi.
const WRITE_RPCS = new Set(['sync_order_tags', 'koc_remove_assignment', 'koc_purge_blacklist_assignments']);
let _warned = 0;
const warnTrial = () => { const t = Date.now(); if (t - _warned > 1500) { _warned = t; try { alert('🔒 Tài khoản TRIAL — chỉ được XEM, không chỉnh sửa/tạo/xóa dữ liệu.'); } catch {} } };

// Thenable-proxy: mọi .select().eq().single()... đều trả về chính nó, await ra {data:null,error:null}.
const blockedBuilder = () => {
  const p = Promise.resolve({ data: null, error: null, count: 0 });
  const proxy = new Proxy(function () {}, {
    get(_t, prop) {
      if (prop === 'then') return p.then.bind(p);
      if (prop === 'catch') return p.catch.bind(p);
      if (prop === 'finally') return p.finally.bind(p);
      return () => proxy;
    },
    apply() { return proxy; },
  });
  return proxy;
};

const WRITE_METHODS = new Set(['insert', 'update', 'delete', 'upsert']);
const guardQuery = (qb) => new Proxy(qb, {
  get(t, prop) {
    if (WRITE_METHODS.has(prop)) return (...args) => { warnTrial(); return blockedBuilder(); };
    const v = t[prop];
    return typeof v === 'function' ? v.bind(t) : v;
  }
});

// Guard cho storage bucket (upload/remove/move/copy = ghi).
const STORAGE_WRITE = new Set(['upload', 'remove', 'move', 'copy', 'createSignedUploadUrl', 'update']);
const guardBucket = (bk) => new Proxy(bk, {
  get(t, prop) {
    if (STORAGE_WRITE.has(prop)) return (...args) => { warnTrial(); return Promise.resolve({ data: null, error: { message: 'TRIAL_READONLY' } }); };
    const v = t[prop];
    return typeof v === 'function' ? v.bind(t) : v;
  }
});

export const supabase = new Proxy(_client, {
  get(target, prop) {
    if (!isTrial()) {
      const v = target[prop];
      return typeof v === 'function' ? v.bind(target) : v;
    }
    if (prop === 'from') return (table) => guardQuery(target.from(table));
    if (prop === 'rpc') return (name, args, opts) => {
      if (WRITE_RPCS.has(name)) return blockedBuilder();   // no-op êm (nhiều RPC tự chạy khi tải trang)
      return target.rpc(name, args, opts);
    };
    if (prop === 'storage') {
      const st = target.storage;
      return new Proxy(st, { get(t2, p2) {
        if (p2 === 'from') return (b) => guardBucket(t2.from(b));
        const v = t2[p2]; return typeof v === 'function' ? v.bind(t2) : v;
      }});
    }
    const v = target[prop];
    return typeof v === 'function' ? v.bind(target) : v;
  }
});
