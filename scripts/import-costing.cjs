/*
 * NẠP FILE COSTING (bảng giá AMIS V2) vào costing_data key='latest'.
 * Dùng:  node scripts/import-costing.cjs "<duong-dan.xlsx>"
 *
 * KHÁC nút Import của app: app ưu tiên sheet theo TÊN (COSTING SKU STELLA trước) → dễ chọn nhầm sheet
 * cũ/ít dòng (vd file "NEW COSTING 2026 (7)": COSTING SKU STELLA chỉ 217 dòng/T12.2025). Script này
 * tự chọn sheet có **cột "COSTING T..AMIS V2" MỚI NHẤT** (tie-break: nhiều dòng hơn) = sheet đúng.
 * Logic parse y hệt parseWorkbook trong CostingTab.jsx. Tự backup key cũ trước khi ghi đè.
 */
const XLSX = require('xlsx'), fs = require('fs'), path = require('path');
const FILE = process.argv[2];
if (!FILE) { console.error('Dùng: node scripts/import-costing.cjs "<xlsx>"'); process.exit(1); }
const env = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8').split(/\r?\n/).reduce((a, l) => {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) a[m[1]] = m[2].replace(/\\r|\\n/g, '').trim(); return a; }, {});
const URL = env.VITE_SUPABASE_URL, KEY = env.VITE_SUPABASE_ANON_KEY;
if (!URL || !KEY) { console.error('Thiếu .env'); process.exit(1); }

const wb = XLSX.read(fs.readFileSync(FILE), { type: 'buffer' });
function findHeaderRowIdx(rows) {
  for (let i = 0; i < Math.min(rows.length, 6); i++) {
    const v = (rows[i] || []).map(x => String(x ?? '').trim().toLowerCase());
    if (v.includes('stt') && v.some(x => x === 'mã' || x === 'mã hàng' || x === 'ma')) return i;
  } return 0;
}
const latestRank = (headers) => {
  let best = null;
  for (const h of headers) { const m = /COSTING T(\d+)\.(\d+) AMIS V2/.exec(h);
    if (m) { const r = +m[2] * 100 + +m[1]; if (!best || r > best.r) best = { r, col: h }; } }
  return best;
};
// chọn sheet: có Brand+Mã+Tên, rồi sheet nào cột AMIS mới nhất (tie-break nhiều dòng)
let pick = null;
for (const sn of wb.SheetNames) {
  const raw = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: '' });
  const hi = findHeaderRowIdx(raw);
  const headers = (raw[hi] || []).map(v => String(v ?? '').trim());
  const hasBrand = headers.some(h => /brand|nhóm/i.test(h)), hasMa = headers.some(h => /^mã/i.test(h)), hasTen = headers.some(h => /^tên/i.test(h));
  const lr = latestRank(headers);
  if (!(hasBrand && hasMa && hasTen) || !lr) continue;
  const nRows = raw.length - hi - 2;
  if (!pick || lr.r > pick.lr || (lr.r === pick.lr && nRows > pick.nRows)) pick = { sn, raw, hi, headers, lr: lr.r, col: lr.col, nRows };
}
if (!pick) { console.error('Không tìm thấy sheet costing hợp lệ (cần Brand+Mã+Tên + cột AMIS V2)'); process.exit(1); }

const rows = [];
for (let i = pick.hi + 2; i < pick.raw.length; i++) {
  const row = pick.raw[i] || []; const stt = String(row[0] ?? '').trim();
  if (!stt || isNaN(parseFloat(stt))) continue;
  const o = {}; pick.headers.forEach((h, ci) => { o[h] = row[ci] ?? ''; }); rows.push(o);
}
console.log(`Sheet chọn: "${pick.sn}" | cột mới nhất: ${pick.col} | headers: ${pick.headers.length} | rows: ${rows.length}`);

(async () => {
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  // backup key hiện tại trước khi ghi đè
  const cur = await fetch(`${URL}/rest/v1/costing_data?key=eq.latest&select=sheet_name,headers,rows,imported_at`, { headers: { apikey: KEY, authorization: `Bearer ${KEY}` } });
  if (cur.ok) { const [old] = await cur.json();
    if (old) await fetch(`${URL}/rest/v1/costing_data?on_conflict=key`, { method: 'POST',
      headers: { apikey: KEY, authorization: `Bearer ${KEY}`, 'content-type': 'application/json', prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify({ key: `backup_${stamp}`, ...old }) }).then(r => console.log('Backup ->', r.ok ? `backup_${stamp}` : 'FAIL'));
  }
  const body = { key: 'latest', sheet_name: pick.sn, headers: pick.headers, rows, imported_at: new Date().toISOString() };
  const res = await fetch(`${URL}/rest/v1/costing_data?on_conflict=key`, { method: 'POST',
    headers: { apikey: KEY, authorization: `Bearer ${KEY}`, 'content-type': 'application/json', prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify(body) });
  if (!res.ok) { console.error('LỖI upsert', res.status, (await res.text()).slice(0, 300)); process.exit(1); }
  console.log('UPSERT OK ✅  (nhớ xóa koc_orders_cache để app tính lại chi phí mẫu)');
})();
