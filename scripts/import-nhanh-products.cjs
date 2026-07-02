/*
 * NẠP FILE EXPORT SẢN PHẨM TỪ NHANH.VN (.xlsx) vào bảng nhanh_products.
 * Dùng:  node scripts/import-nhanh-products.cjs "<duong-dan.xlsx>"
 *
 * Logic parse GIỐNG HỆT NhanhProductsTab.jsx (nút "UPLOAD FILE NHANH" trên web) — script này chỉ
 * làm thay việc bấm nút đó từ terminal khi cần nạp nhanh/theo lô lớn. Ưu tiên cột "Mã vạch" (barcode
 * thật, khớp sanphams.barcode), fallback "Mã sản phẩm". Upsert theo ma_san_pham (onConflict).
 */
const XLSX = require('xlsx'), fs = require('fs'), path = require('path');
const { createClient } = require('@supabase/supabase-js');

const FILE = process.argv[2];
if (!FILE) { console.error('Dùng: node scripts/import-nhanh-products.cjs "<xlsx>"'); process.exit(1); }
const env = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8').split(/\r?\n/).reduce((a, l) => {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) a[m[1]] = m[2].replace(/\\r|\\n/g, '').trim(); return a; }, {});
const URL = env.VITE_SUPABASE_URL, KEY = env.VITE_SUPABASE_ANON_KEY;
if (!URL || !KEY) { console.error('Thiếu .env'); process.exit(1); }
const supabase = createClient(URL, KEY);

const parsePrice = (v) => {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return Math.round(v);
  let s = String(v).trim().replace(/[^\d.,-]/g, '');
  if (!s) return 0;
  if (s.includes('.') && s.includes(',')) {
    if (s.lastIndexOf('.') > s.lastIndexOf(',')) s = s.replace(/,/g, '');
    else { s = s.replace(/\./g, ''); s = s.replace(',', '.'); }
  } else if (s.includes(',')) {
    s = /,\d{1,2}$/.test(s) ? s.replace(',', '.') : s.replace(/,/g, '');
  } else if ((s.match(/\./g) || []).length > 1) {
    s = s.replace(/\./g, '');
  }
  const n = parseFloat(s);
  return Number.isFinite(n) ? Math.round(n) : 0;
};

(async () => {
  const wb = XLSX.readFile(FILE);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const gF = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false });
  const gR = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true });
  if (!gF.length) { console.error('File rỗng'); process.exit(1); }

  const H = (gF[0] || []).map(h => String(h).trim().toLowerCase());
  const find = (...preds) => { for (const p of preds) { const i = H.findIndex(p); if (i !== -1) return i; } return -1; };
  let iMa  = find(h => h === 'mã vạch', h => h.includes('mã vạch'), h => h === 'mã sản phẩm', h => h.includes('mã sản phẩm')); if (iMa < 0) iMa = 0;
  let iTen = find(h => h === 'tên sản phẩm', h => h.includes('tên sản phẩm')); if (iTen < 0) iTen = 1;
  let iGia = find(h => h.includes('giá bán') && h.includes('vat'), h => h.includes('giá bán')); if (iGia < 0) iGia = 2;
  console.log(`Cột dùng: Mã=${iMa} Tên=${iTen} Giá=${iGia}`);

  const map = new Map();
  for (let i = 1; i < gF.length; i++) {
    const rf = gF[i], rr = gR[i] || [];
    if (!rf) continue;
    const ma = String(rf[iMa] ?? '').replace(/^'+/, '').trim();
    if (!ma) continue;
    map.set(ma, {
      ma_san_pham: ma,
      ten_san_pham: String(rf[iTen] ?? '').trim(),
      gia_ban_vat: parsePrice(rr[iGia]),
      updated_at: new Date().toISOString(),
    });
  }
  const list = [...map.values()];
  console.log(`Tổng ${list.length} sản phẩm (đã lọc trùng mã).`);
  if (!list.length) { console.error('Không thấy dòng sản phẩm nào.'); process.exit(1); }

  const BATCH = 1000;
  for (let i = 0; i < list.length; i += BATCH) {
    const chunk = list.slice(i, i + BATCH);
    const { error } = await supabase.from('nhanh_products').upsert(chunk, { onConflict: 'ma_san_pham' });
    if (error) { console.error(`Lỗi batch ${i}:`, error.message); process.exit(1); }
    console.log(`  ✓ đã lưu ${Math.min(i + BATCH, list.length)}/${list.length}`);
  }
  console.log('✅ XONG.');
})();
