/*
 * NẠP EXCEL "Video Performance List" 1 GIAN (FULL) → tiktok_shop_videos + tiktok_video_monthly_views.
 * Làm Y CHANG Bodymiss. KHÔNG lọc view>=100 (full). Dedupe theo ID video: view=max(VV), gmv/đơn=sum, post_date từ "Thời gian".
 *
 * Dùng:  node scripts/import-koc-video-full.cjs "<duong-dan.xlsx>" <tiktok_shop_id> [ym=2026-06]
 *   - Ghi 2 nơi (BẮT BUỘC, nếu thiếu (2) thì VIEW per-kỳ = 0):
 *       (1) upsert_shop_videos_max  → đếm video + post_date + view-snapshot (GREATEST + coalesce, không wipe)
 *       (2) upsert_video_month_min  → view-THÁNG (ym) cho card "Tổng view" + cột VIEW per-KOC (GREATEST)
 *   - Cột Excel: ID video=__EMPTY_2, Thời gian=__EMPTY_3, VV=__EMPTY_5, Đơn SKU ghi nhận=__EMPTY_14,
 *                GMV đến từ video=__EMPTY_20, Tên nhà sáng tạo = cột đầu.
 *   - Anon key đọc từ .env (RPC là SECURITY DEFINER nên anon gọi được). KHÔNG in key ra.
 */
const XLSX = require('xlsx'), fs = require('fs'), path = require('path');
const [, , FILE, SHOP, YM = '2026-06'] = process.argv;
if (!FILE || !SHOP) { console.error('Dùng: node scripts/import-koc-video-full.cjs "<xlsx>" <shop_id> [ym]'); process.exit(1); }

const env = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8').split(/\r?\n/).reduce((a, l) => {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) a[m[1]] = m[2].replace(/\\r|\\n/g, '').trim(); return a;
}, {});
const URL = env.VITE_SUPABASE_URL, KEY = env.VITE_SUPABASE_ANON_KEY;
if (!URL || !KEY) { console.error('Thiếu VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY trong .env'); process.exit(1); }

const num = (x) => { const n = Number(String(x).replace(/[^\d.-]/g, '')); return isFinite(n) ? n : 0; };
const wb = XLSX.readFile(FILE);
const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
const C0 = Object.keys(rows[0] || {})[0]; // cột "Tên nhà sáng tạo"

const map = new Map();
for (let i = 1; i < rows.length; i++) { // i=0 là dòng nhãn header, data từ i=1
  const r = rows[i]; const id = String(r['__EMPTY_2'] || '').trim(); if (!id) continue;
  const vv = num(r['__EMPTY_5']), gmv = num(r['__EMPTY_20']), sku = num(r['__EMPTY_14']);
  const t = String(r['__EMPTY_3'] || '').trim().replace(/\//g, '-'); // 2025/11/14 21:42:17 -> 2025-11-14 21:42:17
  const pd = /^\d{4}-\d{2}-\d{2}/.test(t) ? t.slice(0, 10) : null;
  const u = String(r[C0] || '').trim();
  const e = map.get(id) || { id, shop_id: SHOP, username: '', views: 0, gmv: 0, sku_orders: 0, video_post_time: '', post_date: null };
  e.views = Math.max(e.views, vv);           // VV là view-level, các dòng cùng video bằng nhau -> max
  e.gmv += gmv; e.sku_orders += sku;          // 1 video x nhiều SP -> cộng
  if (!e.username && u) e.username = u;
  if (!e.post_date && pd) { e.post_date = pd; e.video_post_time = t; }
  map.set(id, e);
}
const vids = [...map.values()];
const monthRows = vids.map(v => ({ id: v.id, ym: YM, shop_id: SHOP, views: v.views }));
console.log(`File: ${FILE}\nShop: ${SHOP}  ym: ${YM}  → video độc nhất: ${vids.length}`);

async function pushRPC(fn, payload, label) {
  let done = 0;
  for (let i = 0; i < payload.length; i += 500) {
    const batch = payload.slice(i, i + 500);
    const res = await fetch(`${URL}/rest/v1/rpc/${fn}`, {
      method: 'POST', headers: { apikey: KEY, authorization: `Bearer ${KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ p_rows: batch }),
    });
    if (!res.ok) { console.error(`\nLỖI ${label} batch ${i}:`, res.status, (await res.text()).slice(0, 200)); process.exit(1); }
    done += batch.length; process.stdout.write(`\r  ${label}: ${done}/${payload.length}`);
  }
  console.log('');
}

(async () => {
  await pushRPC('upsert_shop_videos_max', vids, '(1) video+post_date');
  await pushRPC('upsert_video_month_min', monthRows, '(2) view-tháng');
  console.log('XONG ✅');
})();
