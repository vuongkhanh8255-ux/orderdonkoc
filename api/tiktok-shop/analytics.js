/**
 * api/tiktok-shop/analytics.js
 *
 * Vercel serverless — GET /api/tiktok-shop/analytics
 *
 * Proxy to TikTok Shop Analytics API:
 *   GET /analytics/{version}/shop/performance
 *
 * Query params:
 *   start_date  — YYYY-MM-DD (required)
 *   end_date    — YYYY-MM-DD (required)
 *   granularity — ALL | 1D  (default: 1D)
 *   shop_id     — filter specific shop (optional)
 */

import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
// Module 5 "Xưởng Clip" — tự động OpenAI (ảnh) + HeyGen (video). Ở lib/ ngoài api/ để không tính vào trần 12 function.
import { handleLiveGenImage, handleLiveMakeVideo, handleLiveCheckVideo, handleLiveVoices, handleLiveSuggest } from '../../lib/liveai.js';

const TIKTOK_BASE = 'https://open-api.tiktokglobalshop.com';
const API_VERSION = '202509';

// ── TikTok Sign (same algorithm as sync-orders; body appended for POST) ──────
const buildSign = (appSecret, path, urlParams, body = '') => {
  const keys = Object.keys(urlParams)
    .filter(k => k !== 'sign' && k !== 'access_token')
    .sort();
  const paramStr = keys.map(k => `${k}${urlParams[k]}`).join('');
  const base = `${appSecret}${path}${paramStr}${body}${appSecret}`;
  return crypto.createHmac('sha256', appSecret).update(base).digest('hex');
};

// ── Call TikTok Analytics endpoint ───────────────────────────────────────────
const fetchShopPerformance = async ({ appKey, appSecret, accessToken, shopCipher, startDate, endDate, granularity }) => {
  const path = `/analytics/${API_VERSION}/shop/performance`;
  const ts   = String(Math.floor(Date.now() / 1000));

  const urlParams = {
    app_key:      appKey,
    timestamp:    ts,
    start_date_ge: startDate,
    end_date_lt:   endDate,
    granularity:   granularity || '1D',
    currency:      'LOCAL',
  };
  if (shopCipher) urlParams.shop_cipher = shopCipher;

  urlParams.sign = buildSign(appSecret, path, urlParams);

  const qs  = new URLSearchParams(urlParams);
  const url = `${TIKTOK_BASE}${path}?${qs.toString()}`;

  const ctrl = new AbortController();
  const tid  = setTimeout(() => ctrl.abort(), 15_000);
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'x-tts-access-token': accessToken,
        'content-type': 'application/json',
      },
      signal: ctrl.signal,
    });
    clearTimeout(tid);
    const text = await res.text();
    try { return JSON.parse(text); }
    catch { return { code: -1, message: `Parse error: ${text.slice(0, 200)}` }; }
  } catch (e) {
    clearTimeout(tid);
    return { code: -1, message: `Fetch error: ${e.message}` };
  }
};

// ════════════════════════════════════════════════════════════════════════════
// Product-level analytics (action=shops / action=products)
// Merged into this function to respect the Vercel Hobby 12-serverless-function cap.
//   GET  /analytics/202405/shop_products/performance   (gmv, units_sold, orders, ctr)
//   POST /product/202309/products/search               (title, status, skus → stock)
// ════════════════════════════════════════════════════════════════════════════
const TIKTOK_AUTH_BASE = 'https://auth.tiktok-shops.com';
const PERF_VERSION  = '202405'; // confirmed valid for shop_products/performance
const PRODUCTS_PATH = '/product/202309/products/search';
const VALID_SORT    = new Set(['gmv', 'orders', 'units_sold', 'click_through_rate']);

const toIso = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? new Date(n * 1000).toISOString() : null; };
const numAmt = (v) => { if (v && typeof v === 'object') return Number(v.amount ?? v.value ?? 0) || 0; return Number(v) || 0; };
const addDays = (ymd, n) => { const d = new Date(`${ymd}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`; };

const ttText = async (url, opts = {}, ms = 12000) => {
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), ms);
  try { const r = await fetch(url, { ...opts, signal: ctrl.signal }); clearTimeout(tid); return await r.text(); }
  catch (e) { clearTimeout(tid); return JSON.stringify({ code: -1, message: `Fetch error: ${e.message}` }); }
};

const refreshAnalyticsToken = async ({ appKey, appSecret, conn, supabase, table }) => {
  if (!conn.refresh_token) return false;
  const u = new URL(`${TIKTOK_AUTH_BASE}/api/v2/token/refresh`);
  u.searchParams.set('app_key', appKey); u.searchParams.set('app_secret', appSecret);
  u.searchParams.set('refresh_token', conn.refresh_token); u.searchParams.set('grant_type', 'refresh_token');
  let payload; try { payload = JSON.parse(await ttText(u.toString(), {}, 8000)); } catch { return false; }
  const d = payload?.data; if (payload?.code !== 0 || !d?.access_token) return false;
  conn.access_token = d.access_token; if (d.refresh_token) conn.refresh_token = d.refresh_token;
  try { await supabase.from(table).update({ access_token: d.access_token, refresh_token: d.refresh_token || conn.refresh_token, access_token_expires_at: toIso(d.access_token_expire_in) }).eq('shop_id', conn.shop_id); } catch { /* best-effort */ }
  return true;
};

const fetchProductPerformance = async (ctx) => {
  const { appKey, appSecret, conn, supabase, table, startDate, endDateLt, sortField, sortOrder, pageSize, pageToken } = ctx;
  const path = `/analytics/${PERF_VERSION}/shop_products/performance`;
  const doCall = () => {
    const urlParams = { app_key: appKey, timestamp: String(Math.floor(Date.now() / 1000)), start_date_ge: startDate, end_date_lt: endDateLt, sort_field: sortField, sort_order: sortOrder, page_size: String(pageSize), currency: 'LOCAL' };
    if (conn.shop_cipher) urlParams.shop_cipher = conn.shop_cipher;
    if (pageToken) urlParams.page_token = pageToken;
    urlParams.sign = buildSign(appSecret, path, urlParams);
    return ttText(`${TIKTOK_BASE}${path}?${new URLSearchParams(urlParams)}`, { method: 'GET', headers: { 'x-tts-access-token': conn.access_token, 'content-type': 'application/json' } });
  };
  let raw = await doCall();
  let json; try { json = JSON.parse(raw); } catch { json = { code: -1 }; }
  if (json?.code === 105002 && await refreshAnalyticsToken({ appKey, appSecret, conn, supabase, table })) {
    raw = await doCall(); try { json = JSON.parse(raw); } catch { json = { code: -1 }; }
  }
  // Product ids are 64-bit — stringify before JSON.parse loses precision
  let safe; try { safe = JSON.parse(raw.replace(/"id"\s*:\s*(\d{16,})/g, '"id":"$1"')); } catch { safe = json; }
  return { json: safe, code: json?.code, message: json?.message };
};

// Product detail gives title + main image + status + stock in one call. We fetch it
// only for the products we actually show (the perf page) — scales with page size,
// not catalog size, and is the only source that returns product images.
const fetchProductDetail = async ({ appKey, appSecret, conn, id }) => {
  const path = `/product/202309/products/${id}`;
  const urlParams = { app_key: appKey, timestamp: String(Math.floor(Date.now() / 1000)) };
  if (conn.shop_cipher) urlParams.shop_cipher = conn.shop_cipher;
  urlParams.sign = buildSign(appSecret, path, urlParams);
  let json;
  try { json = JSON.parse(await ttText(`${TIKTOK_BASE}${path}?${new URLSearchParams(urlParams)}`, { method: 'GET', headers: { 'x-tts-access-token': conn.access_token, 'content-type': 'application/json' }, body: undefined }, 8000)); }
  catch { return null; }
  if (json?.code !== 0 || !json.data) return null;
  const d = json.data;
  const img = (d.main_images || [])[0] || {};
  const image = (img.thumb_urls || [])[0] || (img.urls || [])[0] || '';
  const stock = (d.skus || []).reduce((s, sku) => s + (sku.inventory || []).reduce((a, inv) => a + (Number(inv.quantity) || 0), 0), 0);
  return { name: d.title || '', image, status: d.status || d.product_status || '', stock };
};

const fetchProductDetails = async ({ appKey, appSecret, conn, ids }) => {
  const map = {};
  const results = await Promise.all(ids.map(id =>
    fetchProductDetail({ appKey, appSecret, conn, id }).then(r => [id, r]).catch(() => [id, null])
  ));
  for (const [id, r] of results) if (r) map[id] = r;
  return map;
};

// Lấy {name,image} cho product_id: ưu tiên CACHE local + tên đã sync; chỉ gọi TikTok cho cái CHƯA có ảnh,
// rồi upsert vào cache → lần sau 0 lần gọi TikTok (giảm chậm + hết rủi ro rate-limit 36009002).
async function resolveProductMeta({ supabase, appKey, appSecret, conn, shopId, ids }) {
  const out = {};
  const uniq = [...new Set((ids || []).map(String).filter(Boolean))];
  if (!uniq.length) return out;
  try {
    // 1) Cache (name + image)
    const { data: cached } = await supabase.from('tiktok_product_cache').select('product_id, name, image').in('product_id', uniq);
    for (const c of (cached || [])) out[String(c.product_id)] = { name: c.name || '', image: c.image || '' };
    // 2) Tên từ video đã sync (fallback cho tên)
    const needName = uniq.filter(id => !out[id]?.name);
    if (needName.length) {
      const { data: vids } = await supabase.from('tiktok_shop_videos').select('product_id, product_name').in('product_id', needName).not('product_name', 'is', null);
      for (const v of (vids || [])) { const id = String(v.product_id); if (v.product_name && !out[id]?.name) out[id] = { name: v.product_name, image: out[id]?.image || '' }; }
    }
  } catch { /* lỗi đọc cache → để bước fetch lo */ }
  // 3) Chỉ gọi TikTok cho cái CHƯA có ảnh, rồi cache lại
  const missing = uniq.filter(id => !out[id] || !out[id].image);
  if (missing.length && conn) {
    try {
      const meta = await fetchProductDetails({ appKey, appSecret, conn, ids: missing });
      const upserts = [];
      for (const id of missing) {
        const m = meta[id];
        if (m && (m.name || m.image)) {
          out[id] = { name: m.name || out[id]?.name || '', image: m.image || out[id]?.image || '' };
          upserts.push({ product_id: id, shop_id: shopId, name: out[id].name, image: out[id].image, updated_at: new Date().toISOString() });
        }
      }
      if (upserts.length) { try { await supabase.from('tiktok_product_cache').upsert(upserts, { onConflict: 'product_id' }); } catch { /* ghi cache lỗi không chặn */ } }
    } catch { /* tên/ảnh optional */ }
  }
  return out;
}

const loadProductConnections = async (supabase) => {
  const a = await supabase.from('tiktok_analytics_connections').select('access_token, refresh_token, shop_cipher, shop_id, seller_name').not('access_token', 'is', null);
  if (a.data?.length) return { rows: a.data, table: 'tiktok_analytics_connections' };
  const o = await supabase.from('tiktok_shop_connections').select('access_token, refresh_token, shop_cipher, shop_id, seller_name').not('access_token', 'is', null).not('shop_cipher', 'is', null);
  return { rows: o.data || [], table: 'tiktok_shop_connections' };
};

async function handleProductAnalytics({ action, params, appKey, appSecret, supabase, res }) {
  const { rows: conns, table } = await loadProductConnections(supabase);

  if (action === 'shops') {
    const seen = new Set(); const shops = [];
    for (const c of conns) { const id = String(c.shop_id); if (seen.has(id)) continue; seen.add(id); shops.push({ shop_id: id, seller_name: c.seller_name || `Shop ${id}` }); }
    return res.status(200).json({ ok: true, data: shops });
  }

  // action === 'products'
  const shopId    = params.shop_id ? String(params.shop_id) : '';
  const startDate = params.start_date;
  const endDate   = params.end_date;
  let sortField   = String(params.sort_field || 'gmv');
  const sortOrder = String(params.sort_order || 'DESC').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
  const pageSize  = Math.min(Math.max(Number(params.page_size) || 20, 1), 100);
  const pageToken = params.page_token || '';
  if (!VALID_SORT.has(sortField)) sortField = 'gmv';
  if (!startDate || !endDate) return res.status(200).json({ ok: false, error: 'Missing start_date / end_date (YYYY-MM-DD)' });
  if (!conns.length) return res.status(200).json({ ok: false, error: 'No TikTok shops connected with the Analytics app' });

  const conn = shopId ? conns.find(c => String(c.shop_id) === shopId) : conns[0];
  if (!conn) return res.status(200).json({ ok: false, error: `No connection for shop ${shopId}` });

  const perf = await fetchProductPerformance({ appKey, appSecret, conn, supabase, table, startDate, endDateLt: addDays(endDate, 1), sortField, sortOrder, pageSize, pageToken });
  if (perf.code !== 0) return res.status(200).json({ ok: false, error: perf.message || `TikTok code ${perf.code}`, code: perf.code });

  const data = perf.json?.data || {};
  const rawList = Array.isArray(data.products) ? data.products : [];
  const ids = rawList.map(p => String(p.id ?? '')).filter(Boolean);
  let meta = {}; try { meta = await fetchProductDetails({ appKey, appSecret, conn, ids }); } catch { /* names/images optional */ }

  const products = rawList.map(p => {
    const id = String(p.id ?? ''); const m = meta[id] || {};
    return {
      product_id: id,
      product_name: m.name || `SP ${id}`,
      image: m.image || '',
      status: m.status || '',
      stock: m.stock ?? null,
      gmv: numAmt(p.gmv),
      currency: (p.gmv && typeof p.gmv === 'object' && p.gmv.currency) || 'VND',
      units_sold: numAmt(p.units_sold),
      orders: numAmt(p.orders),
      click_through_rate: numAmt(p.click_through_rate),
    };
  });

  return res.status(200).json({
    ok: true, shop_id: String(conn.shop_id), seller_name: conn.seller_name,
    sort_field: sortField, sort_order: sortOrder, count: products.length,
    total: data.total_count ?? null, next_page_token: data.next_page_token || null,
    latest_available_date: data.latest_available_date || null, products,
  });
}

// ════════════════════════════════════════════════════════════════════════════
// KOC / Creator performance (action=koc_creators)
//   POST /affiliate_seller/202508/marketplace_creators/search
//   → TikTok Creator Marketplace: creators + their overall TikTok-Shop performance
//     (followers, GMV tier, live/video GMV, avg live UV, demographics, categories).
//   Uses the CREATOR-app token. That app can't list its own shop_cipher, so we
//   borrow the shop_cipher of the same shop from the orders/analytics apps.
// ════════════════════════════════════════════════════════════════════════════
const AFFILIATE_VERSION = '202508';

const refreshCreatorToken = async ({ ck, cs, conn, supabase }) => {
  if (!conn.refresh_token) return false;
  const u = new URL(`${TIKTOK_AUTH_BASE}/api/v2/token/refresh`);
  u.searchParams.set('app_key', ck); u.searchParams.set('app_secret', cs);
  u.searchParams.set('refresh_token', conn.refresh_token); u.searchParams.set('grant_type', 'refresh_token');
  let payload; try { payload = JSON.parse(await ttText(u.toString(), {}, 8000)); } catch { return false; }
  const d = payload?.data; if (payload?.code !== 0 || !d?.access_token) return false;
  conn.access_token = d.access_token; if (d.refresh_token) conn.refresh_token = d.refresh_token;
  try {
    await supabase.from('tiktok_creator_connections').update({
      access_token: d.access_token,
      refresh_token: d.refresh_token || conn.refresh_token,
      access_token_expires_at: toIso(d.access_token_expire_in),
    }).eq('open_id', conn.open_id);
  } catch { /* best-effort */ }
  return true;
};

// Borrow a shop_cipher for `conn`'s shop from the orders/analytics apps.
const resolveShopCipher = async ({ conn, want, supabase }) => {
  if (conn.shop_cipher) return conn.shop_cipher;
  for (const tbl of ['tiktok_analytics_connections', 'tiktok_shop_connections']) {
    try {
      const { data } = await supabase.from(tbl).select('shop_cipher, shop_id, seller_name').not('shop_cipher', 'is', null);
      const hit = (data || []).find(r => want && (r.seller_name || '').toLowerCase().includes(want))
               || (data || []).find(r => conn.shop_id && String(r.shop_id) === String(conn.shop_id));
      if (hit?.shop_cipher) return hit.shop_cipher;
    } catch { /* ignore */ }
  }
  return null;
};

const mapCreator = (c) => ({
  open_id: c.creator_open_id || '',
  nickname: c.nickname || c.username || '',
  username: c.username || '',
  avatar: c.avatar?.url || '',
  followers: Number(c.follower_count) || 0,
  avg_live_uv: Number(c.avg_ec_live_uv) || 0,
  avg_video_views: Number(c.avg_ec_video_view_count) || 0,
  gmv_tier: c.gmv_range?.formatted_range || '',
  gmv: Number(c.gmv?.amount) || 0,
  gmv_currency: c.gmv?.currency || 'USD',
  live_gmv: Number(c.live_gmv?.amount) || 0,
  video_gmv: Number(c.video_gmv?.amount) || 0,
  region: c.selection_region || '',
  categories: Array.isArray(c.category_ids) ? c.category_ids : [],
  gender: c.top_follower_demographics?.major_gender?.gender || '',
  gender_pct: (Number(c.top_follower_demographics?.major_gender?.percentage) || 0) / 100,
  age_ranges: c.top_follower_demographics?.age_ranges || [],
});

async function handleKocCreators({ params, supabase, res }) {
  const ck = process.env.TIKTOK_CREATOR_APP_KEY?.trim();
  const cs = process.env.TIKTOK_CREATOR_APP_SECRET?.trim();
  if (!ck || !cs) return res.status(200).json({ ok: false, error: 'Chưa cấu hình app TikTok Creator (TIKTOK_CREATOR_APP_KEY/SECRET).' });

  const { data: conns } = await supabase
    .from('tiktok_creator_connections')
    .select('open_id, shop_id, shop_cipher, seller_name, access_token, refresh_token')
    .not('access_token', 'is', null);
  if (!conns?.length) return res.status(200).json({ ok: false, error: 'Chưa có shop nào kết nối app Creator.' });

  const shopList = conns.map(c => ({ seller_name: c.seller_name || `Shop ${c.shop_id || ''}`, shop_id: c.shop_id, open_id: c.open_id }));
  if (params.list === '1') return res.status(200).json({ ok: true, shops: shopList });

  const want = String(params.seller || 'body').toLowerCase();
  const conn = conns.find(c => (c.seller_name || '').toLowerCase().includes(want)) || conns[0];

  const cipher = await resolveShopCipher({ conn, want, supabase });
  if (!cipher) return res.status(200).json({ ok: false, error: `Không tìm được shop_cipher cho "${conn.seller_name}". Hãy kết nối shop này ở app Orders/Analytics trước.` });

  const pageSize = String(params.page_size) === '12' ? '12' : '20';
  const pageToken = params.page_token || '';
  const path = `/affiliate_seller/${AFFILIATE_VERSION}/marketplace_creators/search`;
  const bodyStr = '{}';

  const doCall = () => {
    const urlParams = { app_key: ck, timestamp: String(Math.floor(Date.now() / 1000)), page_size: pageSize, shop_cipher: cipher };
    if (pageToken) urlParams.page_token = pageToken;
    urlParams.sign = buildSign(cs, path, urlParams, bodyStr);
    return ttText(`${TIKTOK_BASE}${path}?${new URLSearchParams(urlParams)}`, {
      method: 'POST',
      headers: { 'x-tts-access-token': conn.access_token, 'content-type': 'application/json' },
      body: bodyStr,
    }, 12000);
  };

  let raw = await doCall();
  let j; try { j = JSON.parse(raw); } catch { j = { code: -1, message: 'Parse error' }; }
  if (j?.code === 105002 && await refreshCreatorToken({ ck, cs, conn, supabase })) {
    raw = await doCall(); try { j = JSON.parse(raw); } catch { j = { code: -1 }; }
  }
  if (j?.code !== 0) {
    const rateLimited = j?.code === 36009002;
    return res.status(200).json({ ok: false, code: j?.code, error: rateLimited ? 'TikTok đang giới hạn tần suất — có thể phải chờ vài phút, đôi lúc lâu hơn (endpoint này TikTok bóp rất chặt). Thử lại sau ít phút nữa.' : (j?.message || `TikTok code ${j?.code}`) });
  }

  const d = j.data || {};
  const creators = (d.creators || []).map(mapCreator);
  return res.status(200).json({
    ok: true, shop: conn.seller_name, shop_id: conn.shop_id,
    count: creators.length, creators, shops: shopList,
    next_page_token: d.next_page_token || null, search_key: d.search_key || null,
  });
}

// Tìm KOC theo @kênh (action=koc_search_creator) — dùng cho Hiệu suất KOC: gắn tag TRƯỚC khi KOC
// lên clip (KOC chưa từng làm brand này thì koc_find/koc_orders không tra ra vì chưa có đơn/video).
// Dùng TIKWM (free, KHÔNG bị bóp tần suất như endpoint marketplace_creators/search của TikTok) —
// giống cách trang Order cào kênh. Tra CHÍNH XÁC @kênh (unique_id) → xác nhận tồn tại + lấy
// avatar/nickname/follower để gắn tag chắc chắn (koc_id = username, cần đúng handle).
const normHandle = (raw) => {
  const s = String(raw || '').trim();
  const m = s.match(/tiktok\.com\/@?([\w.\-]+)/i);
  return (m ? m[1] : s).toLowerCase().replace(/^@/, '').replace(/[/?#].*$/, '').trim();
};
async function handleKocSearchCreator({ params, res }) {
  const q = normHandle(params.q || '');
  if (q.length < 2) return res.status(200).json({ ok: true, creators: [], note: 'Gõ ít nhất 2 ký tự' });

  // 1) Tra info kênh (nickname/follower). 2) Nếu không có info thì thử user/posts (lấy author) để vẫn xác nhận.
  const raw = await ttText(`https://www.tikwm.com/api/user/info?unique_id=${encodeURIComponent(q)}`,
    { headers: { 'User-Agent': 'Mozilla/5.0' } }, 12000);
  let j; try { j = JSON.parse(raw); } catch { j = { code: -1 }; }
  const u = j?.data?.user, st = j?.data?.stats;
  if (j?.code === 0 && u?.uniqueId) {
    return res.status(200).json({ ok: true, search: q, creators: [{
      username: (u.uniqueId || q).toLowerCase(),
      nickname: u.nickname || u.uniqueId || q,
      avatar: u.avatarThumb || u.avatarMedium || '',
      followers: Number(st?.followerCount) || 0,
      videos_total: Number(st?.videoCount) || 0,
    }] });
  }
  // tikwm chặn tạm / kênh không tồn tại
  const rateLimited = /rate|limit|frequen|too many/i.test(String(j?.msg || ''));
  return res.status(200).json({ ok: true, search: q, creators: [],
    note: rateLimited ? 'tikwm bận, thử lại sau vài giây' : 'Không tìm thấy kênh @' + q + ' (kiểm tra lại @kênh cho đúng, hoặc kênh riêng tư).' });
}

// ── MỜI KOC (chỉ khanhpro8255, khoá k=kp8255) ────────────────────────────────
// Helper: chọn connection app Creator theo seller + ký + gọi 1 endpoint affiliate_seller.
const affilCall = async ({ supabase, seller, method, path, bodyObj, extraQuery }) => {
  const ck = process.env.TIKTOK_CREATOR_APP_KEY?.trim();
  const cs = process.env.TIKTOK_CREATOR_APP_SECRET?.trim();
  if (!ck || !cs) return { code: -1, message: 'no creator app config' };
  const { data: conns } = await supabase.from('tiktok_creator_connections')
    .select('open_id, shop_id, shop_cipher, seller_name, access_token, refresh_token').not('access_token', 'is', null);
  if (!conns?.length) return { code: -1, message: 'no conn' };
  const want = String(seller || 'body').toLowerCase();
  const conn = conns.find(c => (c.seller_name || '').toLowerCase().includes(want)) || conns[0];
  const cipher = await resolveShopCipher({ conn, want, supabase });
  const bodyStr = method === 'POST' ? JSON.stringify(bodyObj || {}) : '';
  const doCall = () => {
    const urlParams = { app_key: ck, timestamp: String(Math.floor(Date.now() / 1000)), ...(extraQuery || {}) };
    if (cipher) urlParams.shop_cipher = cipher;
    urlParams.sign = buildSign(cs, path, urlParams, bodyStr);
    return ttText(`${TIKTOK_BASE}${path}?${new URLSearchParams(urlParams)}`, {
      method,
      headers: { 'x-tts-access-token': conn.access_token, 'content-type': 'application/json' },
      ...(method === 'POST' ? { body: bodyStr } : {}),
    }, 15000);
  };
  let j; try { j = JSON.parse(await doCall()); } catch { j = { code: -1, message: 'fetch/parse error' }; }
  if (j?.code === 105002 && await refreshCreatorToken({ ck, cs, conn, supabase })) {
    try { j = JSON.parse(await doCall()); } catch { j = { code: -1, message: 'fetch/parse error' }; }
  }
  return { ...j, _seller: conn.seller_name };
};

// ID SỐ TikTok của KOC — API mời (conversations/target_collaborations) chỉ nhận ID SỐ,
// KHÔNG nhận creator_open_id 54 ký tự của marketplace (đã test: open_id bị chê "Invalid CreatorId",
// id số từ tikwm user/info → code 0). Cache vào pool.tiktok_uid cho lần sau.
const resolveTikTokUid = async (supabase, username) => {
  const u = String(username || '').toLowerCase().replace(/^@/, '').trim();
  if (!u) return null;
  try {
    const { data: row } = await supabase.from('koc_marketplace_pool').select('tiktok_uid').eq('username', u).maybeSingle();
    if (row?.tiktok_uid) return row.tiktok_uid;
  } catch { /* pool optional */ }
  let uid = null;
  try {
    const raw = await ttText(`https://www.tikwm.com/api/user/info?unique_id=${encodeURIComponent(u)}`,
      { headers: { 'User-Agent': 'Mozilla/5.0' } }, 12000);
    const j = JSON.parse(raw);
    if (j?.code === 0 && j?.data?.user?.id) uid = String(j.data.user.id);
  } catch { /* tikwm bận */ }
  if (uid) { try { await supabase.from('koc_marketplace_pool').update({ tiktok_uid: uid }).eq('username', u); } catch { /* best-effort */ } }
  return uid;
};

// Kiểu 1 — NHẮN TIN 1 KOC: username → ID số (tikwm, cache pool) → tạo hội thoại → gửi tin.
// POST {k, username, message, seller}. Thành công → ghi moi_im_at vào pool.
async function handleKocInviteIm({ params, supabase, res }) {
  if (params.k !== 'kp8255') return res.status(200).json({ ok: false, error: 'thiếu khoá' });
  const username = String(params.username || '').trim();
  const message = String(params.message || '').trim();
  if (!username || !message) return res.status(200).json({ ok: false, error: 'thiếu username/message' });

  const uid = await resolveTikTokUid(supabase, username);
  if (!uid) return res.status(200).json({ ok: false, step: 'uid', error: `Không lấy được ID số của @${username} (kênh riêng tư/không tồn tại, hoặc tikwm bận — thử lại)` });

  // 1) tạo (hoặc lấy lại) hội thoại với KOC
  const conv = await affilCall({ supabase, seller: params.seller, method: 'POST',
    path: '/affiliate_seller/202412/conversations', bodyObj: { creator_id: uid } });
  const convId = conv?.data?.id || conv?.data?.conversation_id || '';
  if (conv?.code !== 0 || !convId) {
    return res.status(200).json({ ok: false, step: 'conversation', code: conv?.code, error: conv?.message || 'không tạo được hội thoại', raw: conv?.data || null });
  }
  // 2) gửi tin nhắn text
  const msg = await affilCall({ supabase, seller: params.seller, method: 'POST',
    path: `/affiliate_seller/202412/conversations/${convId}/messages`, bodyObj: { msg_type: 'TEXT', content: message } });
  if (msg?.code !== 0) {
    return res.status(200).json({ ok: false, step: 'message', code: msg?.code, error: msg?.message || 'gửi tin thất bại', conversation_id: convId });
  }
  // 3) ghi dấu đã nhắn vào pool
  if (params.username) {
    try { await supabase.from('koc_marketplace_pool').update({ moi_im_at: new Date().toISOString() }).eq('username', String(params.username).toLowerCase()); } catch { /* best-effort */ }
  }
  return res.status(200).json({ ok: true, conversation_id: convId, shop: conv._seller });
}

// Kiểu 2 — TẠO CHIẾN DỊCH MỜI ĐÍCH DANH (target collaboration) cho tối đa 50 KOC/lần.
// POST {k, seller, name, message, end_time(unix s), commission_pct(1-80), product_ids[], creators:[{open_id,username}], email}
async function handleKocInviteCollab({ params, supabase, res }) {
  if (params.k !== 'kp8255') return res.status(200).json({ ok: false, error: 'thiếu khoá' });
  const name = String(params.name || '').trim();
  const endTime = String(params.end_time || '').trim();
  const pct = Number(params.commission_pct);
  const productIds = Array.isArray(params.product_ids) ? params.product_ids.map(String).filter(Boolean) : [];
  const creators = Array.isArray(params.creators) ? params.creators.filter(c => c && c.open_id) : [];
  if (!name || !endTime || !Number.isFinite(pct) || pct < 1 || pct > 80 || !productIds.length || !creators.length) {
    return res.status(200).json({ ok: false, error: 'thiếu/sai: name, end_time, commission_pct(1-80), product_ids, creators' });
  }
  if (creators.length > 50) return res.status(200).json({ ok: false, error: 'tối đa 50 KOC/lần (chia bớt)' });

  // Đổi username → ID SỐ (tikwm + cache pool) — API chỉ nhận ID số, không nhận open_id marketplace
  const uids = []; const failed = [];
  for (const c of creators) {
    const uid = await resolveTikTokUid(supabase, c.username);
    if (uid) { uids.push(uid); c._uid = uid; } else failed.push(c.username);
    await new Promise(r => setTimeout(r, 250)); // giãn nhịp tikwm
  }
  if (!uids.length) return res.status(200).json({ ok: false, error: 'Không lấy được ID số của KOC nào (tikwm bận — thử lại)', failed });

  const body = {
    name,
    ...(params.message ? { message: String(params.message) } : {}),
    end_time: endTime,
    products: productIds.map(id => ({ id, target_commission_rate: Math.round(pct * 100) })), // 10% → 1000
    creator_user_ids: uids,
    seller_contact_info: { email: String(params.email || 'khanh.vuong@stellakinetics.com') },
    free_sample_rule: { has_free_sample: false, is_sample_approval_exempt: false },
  };
  const r = await affilCall({ supabase, seller: params.seller, method: 'POST',
    path: '/affiliate_seller/202405/target_collaborations', bodyObj: body });
  if (r?.code !== 0) return res.status(200).json({ ok: false, code: r?.code, error: r?.message || 'TikTok từ chối', raw: r?.data || null });

  // ghi dấu đã mời collab vào pool (chỉ KOC thật sự vào lời mời — có _uid)
  const now = new Date().toISOString();
  for (const c of creators) {
    if (!c.username || !c._uid) continue;
    try { await supabase.from('koc_marketplace_pool').update({ moi_collab_at: now }).eq('username', String(c.username).toLowerCase()); } catch { /* best-effort */ }
  }
  return res.status(200).json({ ok: true, shop: r._seller, data: r.data || null, invited: uids.length, failed_uid: failed });
}

// DÒ QUYỀN API AFFILIATE (action=affil_probe) — gọi thử các endpoint affiliate_seller xem app
// Creator hiện tại được phép dùng cái nào (mời target collab / open collab / IM nhắn KOC...).
// POST probe gửi body rỗng → không tạo gì thật (thiếu param thì TikTok trả lỗi param = endpoint
// SỐNG + CÓ QUYỀN; 'api not found' = sai path; 'no permission' = thiếu scope phải xin thêm).
async function handleAffilProbe({ params, supabase, res }) {
  const ck = process.env.TIKTOK_CREATOR_APP_KEY?.trim();
  const cs = process.env.TIKTOK_CREATOR_APP_SECRET?.trim();
  if (!ck || !cs) return res.status(200).json({ ok: false, error: 'no creator app config' });
  const { data: conns } = await supabase.from('tiktok_creator_connections')
    .select('open_id, shop_id, shop_cipher, seller_name, access_token, refresh_token').not('access_token', 'is', null);
  if (!conns?.length) return res.status(200).json({ ok: false, error: 'no conn' });
  const want = String(params.seller || 'body').toLowerCase();
  const conn = conns.find(c => (c.seller_name || '').toLowerCase().includes(want)) || conns[0];
  const cipher = await resolveShopCipher({ conn, want, supabase });

  // CHẾ ĐỘ TUỲ CHỈNH (dò schema từng field): ?path=...&method=POST&body={...}&k=kp8255
  // Chỉ nhận path /affiliate_seller/* + phải có khoá k → không ai mượn server gọi lung tung.
  if (params.path) {
    if (params.k !== 'kp8255') return res.status(200).json({ ok: false, error: 'thiếu khoá' });
    const p = String(params.path);
    if (!p.startsWith('/affiliate_seller/')) return res.status(200).json({ ok: false, error: 'chỉ cho affiliate_seller' });
    const m = (params.method || 'GET').toUpperCase();
    const bodyStr = m === 'POST' ? String(params.body || '{}') : '';
    const urlParams = { app_key: ck, timestamp: String(Math.floor(Date.now() / 1000)) };
    if (cipher) urlParams.shop_cipher = cipher;
    for (const [qk, qv] of Object.entries(params)) {
      if (['action', 'path', 'method', 'body', 'k', 'seller'].includes(qk)) continue;
      urlParams[qk] = qv; // query phụ (page_size…) cũng phải vào sign
    }
    urlParams.sign = buildSign(cs, p, urlParams, bodyStr);
    let j;
    try {
      j = JSON.parse(await ttText(`${TIKTOK_BASE}${p}?${new URLSearchParams(urlParams)}`, {
        method: m,
        headers: { 'x-tts-access-token': conn.access_token, 'content-type': 'application/json' },
        ...(m === 'POST' ? { body: bodyStr } : {}),
      }, 12000));
    } catch (e) { j = { code: -1, message: `fetch: ${e.message}` }; }
    return res.status(200).json({ ok: true, shop: conn.seller_name, probe: `${m} ${p}`, result: j });
  }

  const PROBES = [
    { m: 'POST', p: '/affiliate_seller/202405/target_collaborations' },
    { m: 'POST', p: '/affiliate_seller/202406/target_collaborations' },
    { m: 'GET',  p: '/affiliate_seller/202405/target_collaborations' },
    { m: 'POST', p: '/affiliate_seller/202405/open_collaborations' },
    { m: 'GET',  p: '/affiliate_seller/202405/open_collaborations' },
    { m: 'GET',  p: '/affiliate_seller/202412/conversations' },
    { m: 'POST', p: '/affiliate_seller/202412/conversations' },
    { m: 'GET',  p: '/affiliate_seller/202405/conversations' },
  ];
  const out = [];
  for (const pr of PROBES) {
    const bodyStr = pr.m === 'POST' ? '{}' : '';
    const urlParams = { app_key: ck, timestamp: String(Math.floor(Date.now() / 1000)) };
    if (cipher) urlParams.shop_cipher = cipher;
    urlParams.sign = buildSign(cs, pr.p, urlParams, bodyStr);
    let j;
    try {
      j = JSON.parse(await ttText(`${TIKTOK_BASE}${pr.p}?${new URLSearchParams(urlParams)}`, {
        method: pr.m,
        headers: { 'x-tts-access-token': conn.access_token, 'content-type': 'application/json' },
        ...(pr.m === 'POST' ? { body: bodyStr } : {}),
      }, 10000));
    } catch { j = { code: -1, message: 'fetch/parse error' }; }
    out.push({ probe: `${pr.m} ${pr.p}`, code: j?.code, message: String(j?.message || '').slice(0, 140) });
    await new Promise(r => setTimeout(r, 400));
  }
  return res.status(200).json({ ok: true, shop: conn.seller_name, probes: out });
}

// Module 8 — SĂN KOC: cào marketplace_creators/search → lưu dồn vào koc_marketplace_pool.
// Cron ping ?action=koc_hunt mỗi ngày. Cào 1 GIAN/lượt (xoay vòng theo last_run_at) cho hợp
// timeout Vercel ~10s. Ưu tiên gian làm đẹp/mỹ phẩm. Tiếp trang qua koc_hunt_state.page_token.
async function handleKocHunt({ params, supabase, res }) {
  const ck = process.env.TIKTOK_CREATOR_APP_KEY?.trim();
  const cs = process.env.TIKTOK_CREATOR_APP_SECRET?.trim();
  if (!ck || !cs) return res.status(200).json({ ok: false, error: 'Chưa cấu hình app Creator' });

  const { data: conns } = await supabase.from('tiktok_creator_connections')
    .select('open_id, shop_id, shop_cipher, seller_name, access_token, refresh_token')
    .not('access_token', 'is', null);
  if (!conns?.length) return res.status(200).json({ ok: false, error: 'Chưa có shop nối app Creator' });

  const BEAUTY = ['body', 'milaganic', 'eherb', 'healm']; // gian làm đẹp/mỹ phẩm → marketplace gợi ý KOC hợp ngành
  const { data: states } = await supabase.from('koc_hunt_state').select('seller_name, last_run_at, total_seen');
  const stMap = {}; (states || []).forEach(s => { stMap[s.seller_name] = s; });

  // COOLDOWN toàn cục 2h: dù cron-job.org ping dồn dập (mỗi giờ), server tự chặn nếu lần cào GẦN
  // NHẤT (bất kỳ gian nào) chưa đủ 2 tiếng → nhường quota marketplace_creators/search cho tính năng
  // tìm-gắn-KOC-mới ở Hiệu suất KOC (Khánh chốt 2/7: KOC nhận mẫu cần tìm ngay, không chờ được).
  // force=1 (nút "⛏️ Cào thêm" admin bấm tay) → bỏ qua cooldown.
  if (params.force !== '1') {
    const lastRun = Object.values(stMap).reduce((max, s) => {
      const t = s.last_run_at ? new Date(s.last_run_at).getTime() : 0;
      return t > max ? t : max;
    }, 0);
    const COOLDOWN_MS = 2 * 3600 * 1000;
    if (lastRun && Date.now() - lastRun < COOLDOWN_MS) {
      return res.status(200).json({ ok: true, skipped: 'cooldown', minutes_left: Math.ceil((COOLDOWN_MS - (Date.now() - lastRun)) / 60000) });
    }
  }

  // chọn gian để cào: theo param seller, hoặc gian làm đẹp lâu chưa cào nhất (chưa cào bao giờ ưu tiên trước)
  let pool = params.seller
    ? conns.filter(c => (c.seller_name || '').toLowerCase().includes(String(params.seller).toLowerCase()))
    : conns.filter(c => BEAUTY.some(b => (c.seller_name || '').toLowerCase().includes(b)));
  if (!pool.length) pool = conns;
  pool.sort((a, b) => {
    const ta = stMap[a.seller_name]?.last_run_at ? new Date(stMap[a.seller_name].last_run_at).getTime() : 0;
    const tb = stMap[b.seller_name]?.last_run_at ? new Date(stMap[b.seller_name].last_run_at).getTime() : 0;
    return ta - tb; // lâu chưa cào nhất lên đầu
  });
  const conn = pool[0];

  const want = (conn.seller_name || '').toLowerCase();
  const cipher = await resolveShopCipher({ conn, want, supabase });
  if (!cipher) return res.status(200).json({ ok: false, error: `Không có shop_cipher cho "${conn.seller_name}"` });

  const path = `/affiliate_seller/${AFFILIATE_VERSION}/marketplace_creators/search`;
  const bodyStr = '{}';
  const normU = (u) => String(u || '').toLowerCase().replace(/^@/, '').trim();
  const maxPages = Math.min(Number(params.max_pages) || 2, 4);

  const st = stMap[conn.seller_name];
  let nextToken = st?.page_token_carry || '';
  // đọc token trang kế từ DB (cột page_token)
  const { data: stRow } = await supabase.from('koc_hunt_state').select('page_token, total_seen').eq('seller_name', conn.seller_name).maybeSingle();
  nextToken = stRow?.page_token || '';
  let seen = stRow?.total_seen || 0;
  let saved = 0, pages = 0;

  for (let p = 0; p < maxPages; p++) {
    const urlParams = { app_key: ck, timestamp: String(Math.floor(Date.now() / 1000)), page_size: '20', shop_cipher: cipher };
    if (nextToken) urlParams.page_token = nextToken;
    urlParams.sign = buildSign(cs, path, urlParams, bodyStr);
    const raw = await ttText(`${TIKTOK_BASE}${path}?${new URLSearchParams(urlParams)}`, {
      method: 'POST', headers: { 'x-tts-access-token': conn.access_token, 'content-type': 'application/json' }, body: bodyStr,
    }, 12000);
    let j; try { j = JSON.parse(raw); } catch { j = { code: -1 }; }
    if (j?.code === 105002 && await refreshCreatorToken({ ck, cs, conn, supabase })) { p--; continue; }
    if (j?.code !== 0) { // bị bóp/ lỗi → dừng lượt này, giữ token để lần sau chạy tiếp
      await supabase.from('koc_hunt_state').upsert({ seller_name: conn.seller_name, page_token: nextToken || null, total_seen: seen, last_run_at: new Date().toISOString() }, { onConflict: 'seller_name' });
      return res.status(200).json({ ok: true, shop: conn.seller_name, pages, saved, stop_code: j?.code, msg: j?.message || 'stopped' });
    }
    const d = j.data || {};
    const rows = (d.creators || []).map(mapCreator).map(c => ({
      username: normU(c.username), open_id: c.open_id || null, nickname: c.nickname || null, avatar: c.avatar || null,
      followers: c.followers || 0, avg_views: c.avg_video_views || 0, gmv_tier: c.gmv_tier || null,
      gmv: c.gmv || 0, video_gmv: c.video_gmv || 0, live_gmv: c.live_gmv || 0, region: c.region || null,
      categories: c.categories || [], gender: c.gender || null, age_ranges: c.age_ranges || [], updated_at: new Date().toISOString(),
    })).filter(r => r.username);
    if (rows.length) {
      // upsert: KHÔNG đụng cột da_lien_he/ghi_chu/first_seen (đội booking tự cập nhật)
      await supabase.from('koc_marketplace_pool').upsert(rows, { onConflict: 'username' });
      saved += rows.length; seen += rows.length;
    }
    pages++;
    nextToken = d.next_page_token || '';
    if (!nextToken) break; // hết vòng → lần sau quét lại từ đầu (bắt KOC mới xuất hiện)
    await new Promise(r => setTimeout(r, 1200)); // delay chống rate-limit
  }

  await supabase.from('koc_hunt_state').upsert({ seller_name: conn.seller_name, page_token: nextToken || null, total_seen: seen, last_run_at: new Date().toISOString() }, { onConflict: 'seller_name' });
  const { count } = await supabase.from('koc_marketplace_pool').select('*', { count: 'exact', head: true });
  return res.status(200).json({ ok: true, shop: conn.seller_name, pages, saved, pool_total: count, next: nextToken ? 'tiep' : 'het-vong' });
}

// ════════════════════════════════════════════════════════════════════════════
// KOC affiliate ORDERS — real per-creator sales for the shop
//   POST /affiliate_seller/202410/orders/search  (creator_username + price + commission)
// Synced into Supabase by a cron (action=sync_aff_orders), read+aggregated by
// action=koc_orders. Only data from AFF_SYNC_FLOOR_DATE onward is kept (lighter).
// ════════════════════════════════════════════════════════════════════════════
const AFF_ORDERS_VERSION = '202410';
const AFF_SYNC_FLOOR_DATE = '2026-01-01';
const AFF_SYNC_FLOOR_TS   = Math.floor(new Date('2026-01-01T00:00:00+07:00').getTime() / 1000);
const AFF_PAGE_SIZE = '100';
const AFF_FWD_PAGES  = 6;   // pages from top each run (refresh recent + settlement status)
const AFF_BACK_PAGES = 12;  // số trang re-quét cửa sổ mỗi run — nhỏ để 1 run (6+12 trang) ~25-30s, an toàn cron-job.org 30s + Vercel 90s
const AFF_WINDOW_DAYS = 7;  // RE-QUÉT lại N ngày gần nhất (dùng filter create_time → API chỉ trả đơn trong cửa sổ, cursor quét gọn, gối qua nhiều run hứng đơn VỀ TRỄ)

const vnDate = (ct) => { const n = Number(ct) || 0; return n ? new Date((n + 7 * 3600) * 1000).toISOString().slice(0, 10) : null; };

const affRowsFromOrder = (order, shop_id) => (order.skus || []).map(s => ({
  shop_id,
  order_id: String(order.id || ''),
  sku_id: String(s.sku_id || ''),
  product_id: String(s.product_id || ''),
  creator_username: s.creator_username || '',
  content_id: String(s.content_id || ''),
  content_type: s.content_type || '',
  commission_model: s.commission_model || '',
  price_amount: numAmt(s.price),
  currency: (s.price && typeof s.price === 'object' && s.price.currency) || 'VND',
  quantity: Number(s.quantity) || 0,
  est_commission_base: numAmt(s.estimated_commission_base),
  est_commission: numAmt(s.estimated_paid_commission),
  actual_commission: numAmt(s.actual_paid_commission),
  settlement_status: s.settlement_status || '',
  fully_return: s.fully_return || '',
  create_time: Number(order.create_time) || 0,
  order_date: vnDate(order.create_time),
  campaign_id: s.campaign_id || '',
  target_collaboration_id: String(s.target_collaboration_id || ''),
  open_collaboration_id: String(s.open_collaboration_id || ''),
})).filter(r => r.order_id && r.sku_id);

// Resolve { cipher, shop_id, seller_name } for a creator connection (borrow cipher
// + real shop_id from the orders/analytics apps when the creator app lacks them).
const resolveShopContext = async ({ conn, supabase }) => {
  const norm = (s) => (s || '').toLowerCase().trim();
  if (conn.shop_cipher && conn.shop_id) return { cipher: conn.shop_cipher, shop_id: String(conn.shop_id), seller_name: conn.seller_name };
  for (const tbl of ['tiktok_analytics_connections', 'tiktok_shop_connections']) {
    try {
      const { data } = await supabase.from(tbl).select('shop_cipher, shop_id, seller_name').not('shop_cipher', 'is', null);
      const rows = data || [];
      const hit = rows.find(r => norm(r.seller_name) === norm(conn.seller_name))
               || (conn.shop_id && rows.find(r => String(r.shop_id) === String(conn.shop_id)))
               || (norm(conn.seller_name) && rows.find(r => norm(r.seller_name).includes(norm(conn.seller_name).split(' ')[0])));
      if (hit?.shop_cipher) return { cipher: hit.shop_cipher, shop_id: String(hit.shop_id), seller_name: conn.seller_name || hit.seller_name };
    } catch { /* ignore */ }
  }
  return null;
};

const fetchAffOrdersPage = ({ ck, cs, accessToken, cipher, pageToken, pageSize = AFF_PAGE_SIZE, geTs = null, ltTs = null }) => {
  const path = `/affiliate_seller/${AFF_ORDERS_VERSION}/orders/search`;
  // Lọc theo create_time (Unix giây) trong body NẾU có → kéo thẳng cửa sổ ngày (gian to khỏi lật từ đầu).
  const bodyObj = {};
  if (geTs) bodyObj.create_time_ge = Number(geTs);
  if (ltTs) bodyObj.create_time_lt = Number(ltTs);
  const bodyStr = JSON.stringify(bodyObj);
  const urlParams = { app_key: ck, timestamp: String(Math.floor(Date.now() / 1000)), page_size: pageSize, shop_cipher: cipher };
  if (pageToken) urlParams.page_token = pageToken;
  urlParams.sign = buildSign(cs, path, urlParams, bodyStr);
  return ttText(`${TIKTOK_BASE}${path}?${new URLSearchParams(urlParams)}`, {
    method: 'POST', headers: { 'x-tts-access-token': accessToken, 'content-type': 'application/json' }, body: bodyStr,
  }, 12000).then(t => { try { return JSON.parse(t); } catch { return { code: -1, message: 'parse error' }; } });
};

// Video analytics theo TỪNG THÁNG (shop_videos/performance bị giới hạn độ dài khoảng
// + views tính theo kỳ). Sync mỗi tháng riêng → tiktok_video_monthly_views (id, ym, views)
// + metadata (title/post_date/product) vào tiktok_shop_videos. Tổng view = cộng các tháng.
const VIDEO_PERF_VERSION = '202409';

// ── RULE đếm video chuẩn: chỉ GIỮ video có đơn (sku_orders>0) HOẶC view>=100.
//    Lọc ngay lúc CÀO (view lấy từ API là chính xác) → bảng nhẹ, query Hiệu suất KOC mượt.
//    Bật theo shop để test trước; để Set() RỖNG = áp cho TẤT CẢ shop.
const VIDEO_RULE_SHOPS = new Set([]); // RỖNG = áp rule lọc video rác cho TẤT CẢ shop
// Gian GIỮ TẤT CẢ video (bỏ lọc <100 view) — đồng bộ với bảng koc_full_video_shops bên DB.
// Thêm gian = thêm shop_id vào đây (sync) VÀ insert vào koc_full_video_shops (hiển thị).
const VIDEO_FULL_SHOPS = new Set(['7495107349171898427', '7494813818973817115', '7495831977917385095', '7494529979361168222', '7495838925500090511']); // Bodymiss, Milaganics, Moaw Moaws, eHerb VN, eHerb HCM
const videoRuleOn = (shop_id) => VIDEO_RULE_SHOPS.size === 0 || VIDEO_RULE_SHOPS.has(String(shop_id));
const keepVideo = (r, shop_id) => !!r.id && (VIDEO_FULL_SHOPS.has(String(shop_id)) || !videoRuleOn(shop_id) || r.views >= 100 || r.sku_orders > 0);
const monthWindow = (ym) => { const [y, m] = ym.split('-').map(Number); const nx = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`; return { sd: `${ym}-01`, ed: nx }; };
const listMonths = (floorDate) => {
  const [fy, fm] = floorDate.split('-').map(Number);
  const now = new Date(); const ny = now.getUTCFullYear(), nm = now.getUTCMonth() + 1;
  const out = []; let y = fy, m = fm;
  while (y < ny || (y === ny && m <= nm)) { out.push(`${y}-${String(m).padStart(2, '0')}`); m++; if (m > 12) { m = 1; y++; } }
  return out;
};
const syncShopVideoMonth = async ({ appKey, appSecret, aconn, shop_id, ym, supabase, maxPages = 8 }) => {
  const path = `/analytics/${VIDEO_PERF_VERSION}/shop_videos/performance`;
  const { sd, ed } = monthWindow(ym);
  const doCall = (pageToken) => {
    const urlParams = { app_key: appKey, timestamp: String(Math.floor(Date.now() / 1000)), start_date_ge: sd, end_date_lt: ed, sort_field: 'views', sort_order: 'DESC', page_size: '50', currency: 'LOCAL' };
    if (aconn.shop_cipher) urlParams.shop_cipher = aconn.shop_cipher;
    if (pageToken) urlParams.page_token = pageToken;
    urlParams.sign = buildSign(appSecret, path, urlParams);
    return ttText(`${TIKTOK_BASE}${path}?${new URLSearchParams(urlParams)}`, { method: 'GET', headers: { 'x-tts-access-token': aconn.access_token, 'content-type': 'application/json' } }, 12000);
  };
  const { data: sm } = await supabase.from('tiktok_video_month_sync').select('token, synced').eq('shop_id', shop_id).eq('ym', ym).maybeSingle();
  let token = sm?.token || null;
  let pages = 0, up = 0, done = false;
  while (pages < maxPages) {
    let raw = await doCall(token);
    let j; try { j = JSON.parse(raw); } catch { break; }
    if (j?.code === 105002 && await refreshAnalyticsToken({ appKey, appSecret, conn: aconn, supabase, table: 'tiktok_analytics_connections' })) { raw = await doCall(token); try { j = JSON.parse(raw); } catch { break; } }
    if (j?.code !== 0) break;
    const vids = j.data?.videos || [];
    if (!vids.length) { done = true; break; }
    const mrows = [], meta = [];
    for (const v of vids) {
      const id = String(v.id || ''); if (!id) continue;
      mrows.push({ id, ym, shop_id: String(shop_id), views: Number(v.views) || 0, gmv: numAmt(v.gmv), updated_at: new Date().toISOString() });
      const pt = v.video_post_time || ''; const prod = (v.products || [])[0] || {};
      meta.push({ id, shop_id: String(shop_id), username: v.username || '', title: v.title || '', video_post_time: pt, post_date: pt ? pt.slice(0, 10) : null, product_id: String(prod.id || ''), product_name: prod.name || '', product_count: (v.products || []).length, synced_at: new Date().toISOString() });
    }
    for (let i = 0; i < mrows.length; i += 200) await supabase.from('tiktok_video_monthly_views').upsert(mrows.slice(i, i + 200), { onConflict: 'id,ym' });
    // QUA RPC chống-wipe: post_date/username/title/product CHỈ ghi đè khi giá trị mới KHÔNG rỗng (coalesce giữ cũ).
    // Trước đây .upsert thẳng → API trả thiếu post_time = đè post_date NULL → video rớt khỏi "Video kỳ" (mất ~63/đêm).
    for (let i = 0; i < meta.length; i += 200) await supabase.rpc('upsert_shop_videos_max', { p_rows: meta.slice(i, i + 200) });
    up += mrows.length;
    token = j.data?.next_page_token;
    pages++;
    if (!token) { done = true; break; }
  }
  await supabase.from('tiktok_video_month_sync').upsert({ shop_id: String(shop_id), ym, token: done ? null : token, done, synced: (Number(sm?.synced) || 0) + up, updated_at: new Date().toISOString() }, { onConflict: 'shop_id,ym' });
  return { ym, videos: up, done };
};
// Mỗi run: refresh tháng hiện tại + backfill 1 tháng cũ chưa xong.
const syncShopVideosAllMonths = async ({ appKey, appSecret, shop_id, supabase, maxPages = 8 }) => {
  const { data: aconns } = await supabase.from('tiktok_analytics_connections').select('access_token, refresh_token, shop_cipher, shop_id').not('access_token', 'is', null);
  const aconn = (aconns || []).find(c => String(c.shop_id) === String(shop_id));
  if (!aconn) return { skipped: 'no analytics conn' };
  const months = listMonths(AFF_SYNC_FLOOR_DATE);
  const cur = months[months.length - 1];
  const out = [];
  out.push(await syncShopVideoMonth({ appKey, appSecret, aconn, shop_id, ym: cur, supabase, maxPages }));
  const past = months.slice(0, -1);
  if (past.length) {
    const { data: sms } = await supabase.from('tiktok_video_month_sync').select('ym, done, updated_at').eq('shop_id', shop_id).in('ym', past);
    const byYm = {}; (sms || []).forEach(x => { byYm[x.ym] = x; });
    const todo = past.filter(ym => !byYm[ym]?.done);
    if (todo.length) {
      // Rotate: never-synced first, then oldest-updated → các tháng cũ tiến song song
      todo.sort((a, b) => (byYm[a]?.updated_at ? new Date(byYm[a].updated_at).getTime() : 0) - (byYm[b]?.updated_at ? new Date(byYm[b].updated_at).getTime() : 0));
      out.push(await syncShopVideoMonth({ appKey, appSecret, aconn, shop_id, ym: todo[0], supabase, maxPages }));
    }
  }
  return out;
};
// Lượt sync "VIDEO MỚI NHẤT": cửa sổ ngày hẹp (vài ngày qua) + sort theo NGÀY ĐĂNG giảm dần →
// bắt video vừa air dù 0 GMV (đường sort-GMV phải cày tới đáy 45k video mới tới → rất lâu).
// sortField cho phép thử nghiệm (param vsort) vì chưa chắc TikTok hỗ trợ field nào.
const syncShopVideosRecent = async ({ appKey, appSecret, shop_id, supabase, days = 14, maxPages = 8, sortField = 'views', sortOrder = 'DESC', deadlineMs = 0, keepChannels = null, startToken = null }) => {
  const { data: aconns } = await supabase.from('tiktok_analytics_connections').select('access_token, refresh_token, shop_cipher, shop_id').not('access_token', 'is', null);
  const aconn = (aconns || []).find(c => String(c.shop_id) === String(shop_id));
  if (!aconn) return { videos: 0, skipped: 'no analytics conn' };
  const path = `/analytics/${VIDEO_PERF_VERSION}/shop_videos/performance`;
  const sd = vnDate(Math.floor(Date.now() / 1000) - days * 86400);
  const ed = vnDate(Math.floor(Date.now() / 1000) + 86400);
  const doCall = (pt) => {
    const u = { app_key: appKey, timestamp: String(Math.floor(Date.now() / 1000)), start_date_ge: sd, end_date_lt: ed, sort_field: sortField, sort_order: sortOrder, page_size: '50', currency: 'LOCAL' };
    if (aconn.shop_cipher) u.shop_cipher = aconn.shop_cipher;
    if (pt) u.page_token = pt;
    u.sign = buildSign(appSecret, path, u);
    return ttText(`${TIKTOK_BASE}${path}?${new URLSearchParams(u)}`, { method: 'GET', headers: { 'x-tts-access-token': aconn.access_token, 'content-type': 'application/json' } }, 12000);
  };
  let token = startToken || null, pages = 0, up = 0, firstCode = null, firstMsg = '', sampleDates = [], errored = false;
  while (pages < maxPages) {
    if (deadlineMs && Date.now() > deadlineMs) break;   // hết quỹ thời gian → để cú sau
    let raw = await doCall(token); let j; try { j = JSON.parse(raw); } catch { firstMsg = String(raw).slice(0, 120); errored = true; break; }
    if (j?.code === 105002 && await refreshAnalyticsToken({ appKey, appSecret, conn: aconn, supabase, table: 'tiktok_analytics_connections' })) { raw = await doCall(token); try { j = JSON.parse(raw); } catch { errored = true; break; } }
    if (firstCode === null) { firstCode = j?.code; firstMsg = j?.message || ''; }
    if (j?.code !== 0) { errored = true; break; }
    const vids = j.data?.videos || []; if (!vids.length) { token = null; break; }   // hết video → reset cursor (vòng sau quét lại từ đầu)
    const rows = vids.map(v => { const pt = v.video_post_time || ''; const prod = (v.products || [])[0] || {}; return { id: String(v.id), shop_id: String(shop_id), username: v.username || '', title: v.title || '', views: Number(v.views) || 0, gmv: numAmt(v.gmv), units_sold: Number(v.units_sold) || 0, sku_orders: Number(v.sku_orders) || 0, ctr: Number(v.click_through_rate) || 0, video_post_time: pt, post_date: pt ? pt.slice(0, 10) : null, product_id: String(prod.id || ''), product_name: prod.name || '', product_count: (v.products || []).length, synced_at: new Date().toISOString() }; }).filter(r => keepVideo(r, shop_id) || (keepChannels && keepChannels.has((r.username || '').replace(/^@/, '').trim().toLowerCase())));
    sampleDates.push(...rows.slice(0, 6).map(r => r.post_date));
    // GREATEST upsert: views/gmv/đơn CHỈ TĂNG, không cho view cửa sổ hẹp đè thấp lại bản gốc (Excel/lần trước).
    for (let i = 0; i < rows.length; i += 200) await supabase.rpc('upsert_shop_videos_max', { p_rows: rows.slice(i, i + 200) });
    up += rows.length; token = j.data?.next_page_token; pages++; if (!token) break;
  }
  // end_token: token để nhịp sau cào tiếp. errored (token cũ/hỏng) → reset null. !token (hết vòng) → null → vòng sau quét lại từ đầu.
  return { videos: up, api_code: firstCode, api_msg: firstMsg, sort: `${sortField} ${sortOrder}`, window_from: sd, sample_post_dates: sampleDates.slice(0, 8), end_token: errored ? null : token };
};
// Window-total sync (1/4 → nay) → tiktok_shop_videos.views = "tổng view" (toàn data mình có). Cycling.
const syncShopVideos = async ({ appKey, appSecret, shop_id, supabase, maxPages = 6 }) => {
  const { data: aconns } = await supabase.from('tiktok_analytics_connections').select('access_token, refresh_token, shop_cipher, shop_id').not('access_token', 'is', null);
  const aconn = (aconns || []).find(c => String(c.shop_id) === String(shop_id));
  if (!aconn) return { videos: 0, skipped: 'no analytics conn' };
  const path = `/analytics/${VIDEO_PERF_VERSION}/shop_videos/performance`;
  const sd = AFF_SYNC_FLOOR_DATE; const ed = vnDate(Math.floor(Date.now() / 1000) + 86400);
  const doCall = (pt) => {
    const u = { app_key: appKey, timestamp: String(Math.floor(Date.now() / 1000)), start_date_ge: sd, end_date_lt: ed, sort_field: 'views', sort_order: 'DESC', page_size: '50', currency: 'LOCAL' };
    if (aconn.shop_cipher) u.shop_cipher = aconn.shop_cipher;
    if (pt) u.page_token = pt;
    u.sign = buildSign(appSecret, path, u);
    return ttText(`${TIKTOK_BASE}${path}?${new URLSearchParams(u)}`, { method: 'GET', headers: { 'x-tts-access-token': aconn.access_token, 'content-type': 'application/json' } }, 12000);
  };
  const { data: m } = await supabase.from('tiktok_affiliate_sync_meta').select('video_token, video_synced').eq('shop_id', shop_id).maybeSingle();
  let token = m?.video_token || null; let pages = 0, up = 0, cycleDone = false;
  while (pages < maxPages) {
    let raw = await doCall(token); let j; try { j = JSON.parse(raw); } catch { break; }
    if (j?.code === 105002 && await refreshAnalyticsToken({ appKey, appSecret, conn: aconn, supabase, table: 'tiktok_analytics_connections' })) { raw = await doCall(token); try { j = JSON.parse(raw); } catch { break; } }
    if (j?.code !== 0) break;
    const vids = j.data?.videos || []; if (!vids.length) { cycleDone = true; break; }
    const rows = vids.map(v => { const pt = v.video_post_time || ''; const prod = (v.products || [])[0] || {}; return { id: String(v.id), shop_id: String(shop_id), username: v.username || '', title: v.title || '', views: Number(v.views) || 0, gmv: numAmt(v.gmv), units_sold: Number(v.units_sold) || 0, sku_orders: Number(v.sku_orders) || 0, ctr: Number(v.click_through_rate) || 0, video_post_time: pt, post_date: pt ? pt.slice(0, 10) : null, product_id: String(prod.id || ''), product_name: prod.name || '', product_count: (v.products || []).length, synced_at: new Date().toISOString() }; }).filter(r => keepVideo(r, shop_id));
    // GREATEST upsert: view chỉ TĂNG, không cho view cửa sổ "1/4→nay" đè thấp lại bản gốc/lần trước (video cũ).
    for (let i = 0; i < rows.length; i += 200) await supabase.rpc('upsert_shop_videos_max', { p_rows: rows.slice(i, i + 200) });
    up += rows.length; token = j.data?.next_page_token; pages++; if (!token) { cycleDone = true; break; }
  }
  try { await supabase.from('tiktok_affiliate_sync_meta').update({ video_token: cycleDone ? null : token, video_synced: (Number(m?.video_synced) || 0) + up }).eq('shop_id', shop_id); } catch { /* ignore */ }
  return { videos: up, cycle_done: cycleDone };
};

const syncOneAffShop = async ({ ck, cs, conn, supabase, appKey, appSecret, videoPages = 12 }) => {
  const ctx = await resolveShopContext({ conn, supabase });
  if (!ctx) {
    // No shop_cipher (shop not authorized on the Orders/Analytics apps). Write a
    // marker meta row so the rotation deprioritizes it instead of re-picking it.
    const skipId = conn.shop_id ? String(conn.shop_id) : `noc:${conn.open_id}`;
    await supabase.from('tiktok_affiliate_sync_meta').upsert({
      shop_id: skipId, seller_name: conn.seller_name, backfill_done: true,
      last_run_at: new Date().toISOString(),
      last_status: 'no shop_cipher — chưa kết nối app Orders/Analytics',
    }, { onConflict: 'shop_id' });
    return { shop: conn.seller_name, skipped: 'no shop_cipher' };
  }
  const { cipher, shop_id, seller_name } = ctx;

  let accessToken = conn.access_token;
  const fetchPage = async (pageToken) => {
    let j = await fetchAffOrdersPage({ ck, cs, accessToken, cipher, pageToken });
    if (j?.code === 105002 && await refreshCreatorToken({ ck, cs, conn, supabase })) {
      accessToken = conn.access_token;
      j = await fetchAffOrdersPage({ ck, cs, accessToken, cipher, pageToken });
    }
    return j;
  };

  const ingest = async (orders) => {
    const rows = []; let minCt = Infinity, maxCt = 0, hitFloor = false;
    for (const o of orders) {
      const ct = Number(o.create_time) || 0;
      if (ct && ct < AFF_SYNC_FLOOR_TS) { hitFloor = true; continue; }
      if (ct) { maxCt = Math.max(maxCt, ct); minCt = Math.min(minCt, ct); }
      rows.push(...affRowsFromOrder(o, shop_id));
    }
    for (let i = 0; i < rows.length; i += 500) {
      await supabase.from('tiktok_affiliate_orders').upsert(rows.slice(i, i + 500), { onConflict: 'order_id,sku_id' });
    }
    return { count: rows.length, minCt: minCt === Infinity ? null : minCt, maxCt: maxCt || null, hitFloor };
  };

  const { data: metaRow } = await supabase.from('tiktok_affiliate_sync_meta').select('*').eq('shop_id', shop_id).maybeSingle();
  const meta = metaRow || { high_water_create_time: 0, backfill_token: null, backfill_done: false, oldest_create_time: null, total_synced: 0 };

  let totalUp = 0, newest = Number(meta.high_water_create_time) || 0, oldest = meta.oldest_create_time || null, status = 'ok';

  // PHASE A — refresh from top
  let token = null;
  for (let p = 0; p < AFF_FWD_PAGES; p++) {
    const j = await fetchPage(token);
    if (j?.code !== 0) { status = `forward ${j?.code}: ${j?.message || ''}`.slice(0, 120); break; }
    const orders = j.data?.orders || [];
    const ing = await ingest(orders);
    totalUp += ing.count; if (ing.maxCt) newest = Math.max(newest, ing.maxCt);
    if (ing.minCt) oldest = oldest ? Math.min(oldest, ing.minCt) : ing.minCt;
    token = j.data?.next_page_token;
    if (ing.hitFloor || !token || !orders.length) break;
  }

  // PHASE B — RE-QUÉT CỬA SỔ N NGÀY bằng FILTER create_time (geTs): API CHỈ trả đơn trong cửa sổ →
  // cursor quét gọn (không phải lật toàn bộ list all-time), gối qua nhiều run quét hết cửa sổ →
  // HỨNG ĐƠN affiliate VỀ TRỄ (đơn create_time cũ nhưng vài ngày sau mới lên API). geTs chốt theo ĐẦU
  // NGÀY (UTC) để page_token còn hiệu lực trong ngày; sang ngày token cũ stale → tự reset cursor=null.
  const windowGeTs = Math.floor(Date.now() / 86400000) * 86400 - AFF_WINDOW_DAYS * 86400;
  const fetchWin = async (pt) => {
    let j = await fetchAffOrdersPage({ ck, cs, accessToken, cipher, pageToken: pt, geTs: windowGeTs });
    if (j?.code === 105002 && await refreshCreatorToken({ ck, cs, conn, supabase })) { accessToken = conn.access_token; j = await fetchAffOrdersPage({ ck, cs, accessToken, cipher, pageToken: pt, geTs: windowGeTs }); }
    return j;
  };
  let cur = meta.backfill_token || null;
  let sweepDone = false;
  for (let p = 0; p < AFF_BACK_PAGES; p++) {
    let j = await fetchWin(cur);
    if (j?.code !== 0 && cur) { cur = null; j = await fetchWin(cur); } // token cũ/stale (đổi ngày) → quét lại từ đầu cửa sổ
    if (j?.code !== 0) { status = `window ${j?.code}: ${j?.message || ''}`.slice(0, 120); break; }
    const orders = j.data?.orders || [];
    const ing = await ingest(orders);
    totalUp += ing.count;
    if (ing.maxCt) newest = Math.max(newest, ing.maxCt);
    if (ing.minCt) oldest = oldest ? Math.min(oldest, ing.minCt) : ing.minCt;
    cur = j.data?.next_page_token;
    if (!cur || !orders.length) { sweepDone = true; break; } // hết cửa sổ → vòng sau quét lại từ đầu
  }
  const backfillDone = true; // lịch sử đã backfill 1 lần xong; từ giờ chỉ re-quét cửa sổ N ngày
  const nextBackfillToken = sweepDone ? null : cur; // quét xong cửa sổ → null để vòng sau quét lại từ đầu

  await supabase.from('tiktok_affiliate_sync_meta').upsert({
    shop_id, seller_name,
    high_water_create_time: newest,
    backfill_token: nextBackfillToken,
    backfill_done: backfillDone,
    oldest_create_time: oldest,
    total_synced: (Number(meta.total_synced) || 0) + totalUp,
    last_run_at: new Date().toISOString(),
    last_status: status,
  }, { onConflict: 'shop_id' });

  // Gentle avatar harvest: a few top-KOC avatars per run (fills cache over time).
  try {
    const { data: top } = await supabase.rpc('koc_order_stats', { p_shop_id: shop_id, p_start: AFF_SYNC_FLOOR_DATE, p_end: null });
    const topUsers = (top || []).slice(0, 40).map(r => r.creator_username).filter(Boolean);
    await harvestAvatars({ ck, cs, conn, cipher, supabase, usernames: topUsers, max: 4 });
  } catch { /* avatars optional */ }

  // Video analytics đã TÁCH sang action=sync_aff_videos (chạy riêng, tránh làm
  // run sync đơn quá nặng → timeout 60s → GitHub Action fail).
  return { shop: seller_name, shop_id, upserted: totalUp, newest_date: vnDate(newest), oldest_date: vnDate(oldest), backfill_done: backfillDone, status };
};

// Cron / manual sync. No ?seller → picks ONE shop per run (never-synced or oldest),
// keeping each invocation within the function time budget. ?all=1 → every shop.
async function handleSyncAffOrders({ params, appKey, appSecret, supabase, res }) {
  const ck = process.env.TIKTOK_CREATOR_APP_KEY?.trim();
  const cs = process.env.TIKTOK_CREATOR_APP_SECRET?.trim();
  if (!ck || !cs) return res.status(200).json({ ok: false, error: 'creator app keys missing' });

  const { data: conns } = await supabase.from('tiktok_creator_connections')
    .select('open_id, shop_id, shop_cipher, seller_name, access_token, refresh_token')
    .not('access_token', 'is', null);
  if (!conns?.length) return res.status(200).json({ ok: false, error: 'no creator connections' });

  const norm = (s) => (s || '').toLowerCase().trim();
  let targets;
  if (params.seller) {
    const w = norm(params.seller);
    targets = conns.filter(c => norm(c.seller_name).includes(w));
  } else if (params.all === '1') {
    targets = conns;
  } else {
    const { data: metas } = await supabase.from('tiktok_affiliate_sync_meta').select('seller_name, last_run_at, backfill_done');
    const metaBy = {}; (metas || []).forEach(m => { metaBy[norm(m.seller_name)] = m; });
    // Xoay vòng CÔNG BẰNG theo độ cũ (last_run_at): shop chưa sync / lâu nhất tới lượt trước.
    // (Trước đây ưu tiên TUYỆT ĐỐI shop đang backfill → 1 shop backfill khổng lồ (eHerb VN) giành
    //  hết mọi lượt, bỏ đói incremental sync của 5 shop kia. Giờ ai cũ nhất thì sync; backfill của
    //  shop đó vẫn tiến tiếp khi tới lượt nó.)
    targets = [...conns].sort((a, b) => {
      const ma = metaBy[norm(a.seller_name)], mb = metaBy[norm(b.seller_name)];
      return (ma?.last_run_at ? new Date(ma.last_run_at).getTime() : 0) - (mb?.last_run_at ? new Date(mb.last_run_at).getTime() : 0);
    }).slice(0, 1);
  }
  if (!targets.length) return res.status(200).json({ ok: false, error: 'no matching shop' });

  // TEST: 1 call có filter create_time → xem API affiliate có lọc ngày không (đơn trả về có nằm trong cửa sổ?).
  if (params.filter_test === '1') {
    const conn = targets[0];
    const ctx = await resolveShopContext({ conn, supabase });
    if (!ctx) return res.status(200).json({ ok: false, error: 'no shop_cipher' });
    const geTs = Number(params.ge_ts) || (Math.floor(Date.now() / 1000) - 7 * 86400);
    const ltTs = Number(params.lt_ts) || Math.floor(Date.now() / 1000);
    let j = await fetchAffOrdersPage({ ck, cs, accessToken: conn.access_token, cipher: ctx.cipher, geTs, ltTs });
    if (j?.code === 105002 && await refreshCreatorToken({ ck, cs, conn, supabase })) {
      j = await fetchAffOrdersPage({ ck, cs, accessToken: conn.access_token, cipher: ctx.cipher, geTs, ltTs });
    }
    const orders = j?.data?.orders || [];
    const cts = orders.map(o => Number(o.create_time) || 0).filter(Boolean);
    return res.status(200).json({ ok: true, shop: ctx.seller_name, code: j?.code, msg: j?.message,
      window: `${vnDate(geTs)} → ${vnDate(ltTs)}`, returned: orders.length, has_next: !!j?.data?.next_page_token,
      min_date: cts.length ? vnDate(Math.min(...cts)) : null, max_date: cts.length ? vnDate(Math.max(...cts)) : null });
  }

  // RE-PULL CỬA SỔ NGÀY (hứng đơn affiliate VỀ TRỄ bị sót): kéo thẳng đơn có create_time trong [start,end]
  //   (VN) bằng filter create_time → không phải lật cursor cả nghìn trang. Lặp qua mọi shop khớp `seller`.
  //   ?action=sync_aff_orders&resync_window=1&seller=eherb&start=2026-06-16&end=2026-06-18
  if (params.resync_window === '1') {
    const dToTs = (d, addDay = 0) => Math.floor(Date.parse(`${d}T00:00:00+07:00`) / 1000) + addDay * 86400;
    const geTs = params.ge_ts ? Number(params.ge_ts) : dToTs(params.start);
    const ltTs = params.lt_ts ? Number(params.lt_ts) : dToTs(params.end, 1); // end inclusive → +1 ngày
    const MAXP = Math.min(Math.max(Number(params.pages) || 40, 1), 80);
    const out = [];
    for (const conn of targets) {
      const ctx = await resolveShopContext({ conn, supabase });
      if (!ctx) { out.push({ shop: conn.seller_name, skip: 'no shop_cipher' }); continue; }
      let accessToken = conn.access_token;
      const pull = async (pt) => {
        let j = await fetchAffOrdersPage({ ck, cs, accessToken, cipher: ctx.cipher, pageToken: pt, geTs, ltTs });
        if (j?.code === 105002 && await refreshCreatorToken({ ck, cs, conn, supabase })) { accessToken = conn.access_token; j = await fetchAffOrdersPage({ ck, cs, accessToken, cipher: ctx.cipher, pageToken: pt, geTs, ltTs }); }
        return j;
      };
      let token = null, pages = 0, up = 0, code = 0;
      while (pages < MAXP) {
        const j = await pull(token);
        code = j?.code;
        if (j?.code !== 0) break;
        const orders = j.data?.orders || [];
        const rows = []; for (const o of orders) rows.push(...affRowsFromOrder(o, ctx.shop_id));
        for (let i = 0; i < rows.length; i += 500) await supabase.from('tiktok_affiliate_orders').upsert(rows.slice(i, i + 500), { onConflict: 'order_id,sku_id' });
        up += rows.length; token = j.data?.next_page_token; pages++;
        if (!token || !orders.length) break;
      }
      out.push({ shop: ctx.seller_name, shop_id: ctx.shop_id, window: `${vnDate(geTs)} → ${vnDate(ltTs)}`, pages, upserted_rows: up, code, done: !token });
    }
    return res.status(200).json({ ok: true, resync: out });
  }

  const results = [];
  for (const conn of targets) {
    try { results.push(await syncOneAffShop({ ck, cs, conn, supabase, appKey, appSecret })); }
    catch (e) { results.push({ shop: conn.seller_name, error: e.message }); }
  }
  return res.status(200).json({ ok: true, floor: AFF_SYNC_FLOOR_DATE, synced: results.length, results });
}

// CÀO VIDEO MỚI "siêu nhanh, phủ HẾT gian" — cho cron-job.org gọi mỗi ~10 phút (URL trần, KHÔNG cần secret).
// Mỗi cú: lướt TẤT CẢ gian, mỗi gian chỉ lớp Recent (cửa sổ hẹp) theo 2 chiều sort:
//   - ASC  (view tăng dần): clip vừa đăng (0 view) nhảy lên ĐẦU → bắt được mà khỏi cào sâu.
//   - DESC (view giảm dần): clip mới nhiều view.
// Ngắt ~50s (deadline) → không timeout, không dồn cục. Idempotent (upsert GREATEST). Nhẹ: ~pages×2×số_gian lệnh gọi.
async function handleSyncVideosFresh({ params, appKey, appSecret, supabase, res }) {
  const { data: metas } = await supabase.from('tiktok_affiliate_sync_meta').select('shop_id, seller_name, vfresh_asc_token').not('shop_id', 'is', null);
  const real = (metas || []).filter(m => m.shop_id && !String(m.shop_id).startsWith('noc:'));
  const days = Math.min(Math.max(Number(params.days) || 10, 1), 30);
  const pages = Math.min(Math.max(Number(params.pages) || 3, 1), 8);
  // Danh sách kênh ĐÃ GỬI ĐƠN (từ 01/06) → giữ cả clip mới 0-view của họ (qua mặt bộ lọc view≥100).
  const { data: dch } = await supabase.from('donguis').select('koc_id_kenh').gte('ngay_gui', '2026-06-01').not('koc_id_kenh', 'is', null);
  const keepChannels = new Set((dch || []).map(d => String(d.koc_id_kenh || '').replace(/^@/, '').trim().toLowerCase()).filter(Boolean));
  const deadline = Date.now() + 50000;
  const out = [];
  for (const m of real) {
    if (Date.now() > deadline) { out.push({ shop: m.seller_name, status: 'skip_het_gio' }); continue; }
    try {
      // Gian "đếm full" (VIDEO_FULL_SHOPS) → ASC dùng cursor quét SÂU DẦN qua các nhịp → bắt cả video GIỮA của
      // kênh đã gửi đơn (hết warning oan, khỏi nạp Excel). Gian khác: ASC từ đầu mỗi lần (như cũ).
      const isFull = VIDEO_FULL_SHOPS.has(String(m.shop_id));
      const ascStart = isFull ? (m.vfresh_asc_token || null) : null;
      const asc  = await syncShopVideosRecent({ appKey, appSecret, shop_id: m.shop_id, supabase, days, maxPages: pages, sortOrder: 'ASC',  deadlineMs: deadline, keepChannels, startToken: ascStart });
      const desc = await syncShopVideosRecent({ appKey, appSecret, shop_id: m.shop_id, supabase, days, maxPages: pages, sortOrder: 'DESC', deadlineMs: deadline, keepChannels });
      if (isFull) { try { await supabase.from('tiktok_affiliate_sync_meta').update({ vfresh_asc_token: asc.end_token || null }).eq('shop_id', m.shop_id); } catch { /* lưu cursor lỗi không chặn */ } }
      out.push({ shop: m.seller_name, moi_asc: asc.videos, asc_code: asc.api_code, moi_desc: desc.videos, win_from: desc.window_from, asc_cursor: isFull ? (asc.end_token ? 'tiep' : 'het-vong') : '-' });
    } catch (e) { out.push({ shop: m.seller_name, error: e.message }); }
  }
  return res.status(200).json({ ok: true, shops: real.length, days, kenh_theo_doi: keepChannels.size, results: out });
}

// Video analytics sync — TÁCH riêng khỏi sync đơn (tránh timeout). 1 shop/run, xoay theo video_last_run_at.
async function handleSyncAffVideos({ params, appKey, appSecret, supabase, res }) {
  const norm = (s) => (s || '').toLowerCase().trim();
  const { data: metas } = await supabase.from('tiktok_affiliate_sync_meta').select('shop_id, seller_name, video_last_run_at').not('shop_id', 'is', null);
  const real = (metas || []).filter(m => m.shop_id && !String(m.shop_id).startsWith('noc:'));
  if (!real.length) return res.status(200).json({ ok: true, synced: 0, results: [] });

  let targets;
  if (params.seller) { const w = norm(params.seller); targets = real.filter(m => norm(m.seller_name).includes(w)); }
  else if (params.all === '1') { targets = real; }
  else {
    targets = [...real].sort((a, b) => (a.video_last_run_at ? new Date(a.video_last_run_at).getTime() : 0) - (b.video_last_run_at ? new Date(b.video_last_run_at).getTime() : 0)).slice(0, 1);
  }

  const vpages = Math.min(Math.max(Number(params.vpages) || 10, 1), 40);
  const vsort = params.vsort ? String(params.vsort) : 'views'; // sort VIEWS: bắt video nhiều-view (kể cả ít đơn). API ko sort theo ngày.
  const vrpages = Math.min(Math.max(Number(params.vrpages) || 8, 1), 20);
  const results = [];
  for (const m of targets) {
    try {
      // Lượt "video mới nhất" TRƯỚC (cửa sổ ngày hẹp + sort views → bắt video vừa air dù ít/không đơn)
      const recent = await syncShopVideosRecent({ appKey, appSecret, shop_id: m.shop_id, supabase, sortField: vsort, maxPages: vrpages });
      const win = await syncShopVideos({ appKey, appSecret, shop_id: m.shop_id, supabase, maxPages: 2 });
      const mon = await syncShopVideosAllMonths({ appKey, appSecret, shop_id: m.shop_id, supabase, maxPages: vpages });
      await supabase.from('tiktok_affiliate_sync_meta').update({ video_last_run_at: new Date().toISOString() }).eq('shop_id', m.shop_id);
      results.push({ shop: m.seller_name, recent, total: win, monthly: mon });
    } catch (e) { results.push({ shop: m.seller_name, error: e.message }); }
  }
  return res.status(200).json({ ok: true, synced: results.length, results });
}

// LẤP VIEW THEO LINK KOC: với video KOC CÓ ĐƠN nhưng thiếu view tháng (sync-cào-GMV chưa tới),
// gọi API by-id /shop_videos/{id}/performance lấy đúng view tháng đó (kể cả video cũ) → đổ vào
// tiktok_video_monthly_views + metadata. Additive, KHÔNG đụng sync cũ. 1 shop/run, batch ?limit (mặc định 40).
async function handleFillKocViews({ params, appKey, appSecret, supabase, res }) {
  const { data: metas } = await supabase.from('tiktok_affiliate_sync_meta').select('shop_id, seller_name, viewfill_last_run_at').not('shop_id', 'is', null);
  const real = (metas || []).filter(m => m.shop_id && !String(m.shop_id).startsWith('noc:'));
  let shop_id = params.shop_id ? String(params.shop_id) : '';
  if (!shop_id) { // xoay shop theo lần fill cũ nhất
    const sorted = [...real].sort((a, b) => (a.viewfill_last_run_at ? new Date(a.viewfill_last_run_at).getTime() : 0) - (b.viewfill_last_run_at ? new Date(b.viewfill_last_run_at).getTime() : 0));
    shop_id = sorted[0]?.shop_id || '';
  }
  if (!shop_id) return res.status(200).json({ ok: false, error: 'no shop' });
  const limit = Math.min(Math.max(Number(params.limit) || 40, 1), 80);
  const { data: aconns } = await supabase.from('tiktok_analytics_connections').select('access_token, refresh_token, shop_cipher, shop_id').not('access_token', 'is', null);
  const aconn = (aconns || []).find(c => String(c.shop_id) === String(shop_id));
  if (!aconn) return res.status(200).json({ ok: false, error: 'no analytics conn for shop ' + shop_id });
  const { data: work } = await supabase.rpc('koc_views_to_fill', { p_shop_id: shop_id, p_limit: limit });
  const callVid = async (vid, sd, ed) => {
    const path = `/analytics/${VIDEO_PERF_VERSION}/shop_videos/${vid}/performance`;
    const u = { app_key: appKey, timestamp: String(Math.floor(Date.now() / 1000)), start_date_ge: sd, end_date_lt: ed, currency: 'LOCAL' };
    if (aconn.shop_cipher) u.shop_cipher = aconn.shop_cipher;
    u.sign = buildSign(appSecret, path, u);
    return ttText(`${TIKTOK_BASE}${path}?${new URLSearchParams(u)}`, { method: 'GET', headers: { 'x-tts-access-token': aconn.access_token, 'content-type': 'application/json' } }, 12000);
  };
  let filled = 0, zero = 0, errs = 0;
  const mvRows = [], metaRows = [];
  for (const w of (work || [])) {
    const { sd, ed } = monthWindow(w.ym);
    let raw = await callVid(w.video_id, sd, ed);
    let j; try { j = JSON.parse(raw); } catch { errs++; continue; }
    if (j?.code === 105002 && await refreshAnalyticsToken({ appKey, appSecret, conn: aconn, supabase, table: 'tiktok_analytics_connections' })) {
      raw = await callVid(w.video_id, sd, ed); try { j = JSON.parse(raw); } catch { errs++; continue; }
    }
    if (j?.code !== 0) { // video xóa/không lấy được → ghi 0 để khỏi lặp mãi
      mvRows.push({ id: String(w.video_id), ym: w.ym, shop_id: String(shop_id), views: 0, updated_at: new Date().toISOString() });
      zero++; continue;
    }
    const perf = j.data?.performance || {};
    const views = (perf.intervals || []).reduce((a, x) => a + (Number(x.views) || 0), 0);
    mvRows.push({ id: String(w.video_id), ym: w.ym, shop_id: String(shop_id), views, updated_at: new Date().toISOString() });
    const pt = perf.video_post_time || '';
    metaRows.push({ id: String(w.video_id), shop_id: String(shop_id), username: w.username || '', video_post_time: pt, post_date: pt ? pt.slice(0, 10) : null, synced_at: new Date().toISOString() });
    filled++;
  }
  for (let i = 0; i < mvRows.length; i += 200) await supabase.from('tiktok_video_monthly_views').upsert(mvRows.slice(i, i + 200), { onConflict: 'id,ym' });
  for (let i = 0; i < metaRows.length; i += 200) await supabase.rpc('upsert_shop_videos_max', { p_rows: metaRows.slice(i, i + 200) });
  await supabase.from('tiktok_affiliate_sync_meta').update({ viewfill_last_run_at: new Date().toISOString() }).eq('shop_id', shop_id);
  return res.status(200).json({ ok: true, shop_id, work: (work || []).length, filled, zero, errs });
}

// Read + aggregate per-KOC sales from the synced table.
// Suy brand từ tên gian hàng (khớp brandOfShop ở frontend + brands.ten_brand). null = không xác định → không lọc.
const brandOf = (sellerName) => {
  const s = (sellerName || '').toUpperCase();
  if (s.includes('BODY')) return 'BODYMISS';
  if (s.includes('EHERB') && s.includes('HCM')) return 'EHERB HCM';
  if (s.includes('EHERB')) return 'EHERB';
  if (s.includes('MILAGANIC')) return 'MILAGANICS';
  if (s.includes('MOAW')) return 'MOAW MOAWS';
  if (s.includes('HEALMI')) return 'HEALMI';
  if (s.includes('MASUBE')) return 'MASUBE';
  if (s.includes('REAL') && s.includes('STEEL')) return 'REAL STEEL';
  return null;
};

// Tìm KOC theo tên (server-side) — KHÔNG dính trần 1000 dòng của bảng xếp hạng.
// Bảng xếp hạng koc_order_stats sắp theo GMV nên KOC nhỏ (ngoài top 1000) bị PostgREST cắt,
// search lọc tại chỗ không thấy. Endpoint này lọc thẳng trong SQL (p_search) → trả đúng vài dòng khớp.
async function handleKocFind({ params, supabase, res }) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  const norm = (s) => (s || '').toLowerCase().trim();
  const q = (params.q || '').trim();
  if (q.length < 2) return res.status(200).json({ ok: true, creators: [], note: 'Gõ ít nhất 2 ký tự' });
  const start = params.start_date || AFF_SYNC_FLOOR_DATE;
  const end = params.end_date || null;
  // Tìm theo TÊN — CHỈ trong shop đang xem (Khánh chốt 1/7: "brand nào ra brand đó, đừng lộn xà ngầu").
  // Trước đây quét TOÀN BỘ shop (p_shop_id=null) → search ở Bodymiss ra cả KOC MOAW/eHerb → gán nhầm brand.
  const shopId = params.shop_id ? String(params.shop_id) : null;
  const { data: stats, error } = await supabase.rpc('koc_order_stats', { p_shop_id: shopId, p_start: start, p_end: end, p_search: q });
  if (error) return res.status(200).json({ ok: false, error: error.message });
  // views/cast/sample để 0 (KOC nhỏ thường ~0); bấm vào dòng sẽ tải chi tiết video/sản phẩm thật.
  const creators = (stats || []).slice(0, 50).map(s => ({
    username: s.creator_username,
    orders: Number(s.orders) || 0, gmv: Number(s.gmv) || 0, qty: Number(s.qty) || 0,
    commission: Number(s.commission) || 0, videos: Number(s.videos) || 0,
    vtotal: Number(s.vtotal) || 0, vperiod: Number(s.vperiod) || 0,
    views: 0, cast: 0, sample_cost: 0,
    lives: Number(s.lives) || 0, products: Number(s.products) || 0, last_order: Number(s.last_order) || 0,
  }));
  return res.status(200).json({ ok: true, creators, search: q });
}

async function handleKocOrders({ params, supabase, res }) {
  // Chống CDN/proxy cache nhầm dữ liệu động (nhân viên thấy số cũ). App tự cache qua koc_orders_cache.
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  const norm = (s) => (s || '').toLowerCase().trim();
  const { data: conns } = await supabase.from('tiktok_creator_connections').select('seller_name, shop_id, open_id').not('access_token', 'is', null);
  const { data: metas } = await supabase.from('tiktok_affiliate_sync_meta').select('*');

  const shopList = (conns || []).map(c => {
    const m = (metas || []).find(mm => norm(mm.seller_name) === norm(c.seller_name));
    return { seller_name: c.seller_name, shop_id: m?.shop_id || c.shop_id || null, synced: !!m,
             last_run_at: m?.last_run_at || null, total_synced: m?.total_synced || 0, backfill_done: m?.backfill_done || false };
  });
  if (params.list === '1') return res.status(200).json({ ok: true, shops: shopList, floor: AFF_SYNC_FLOOR_DATE });

  const want = norm(params.seller || 'body');
  const meta = (metas || []).find(m => norm(m.seller_name).includes(want)) || null;
  const shopId = params.shop_id ? String(params.shop_id) : (meta?.shop_id || null);
  const start = params.start_date || AFF_SYNC_FLOOR_DATE;
  const end = params.end_date || null;
  const brandArg = brandOf(meta?.seller_name || params.seller); // chi phí mẫu lọc theo brand đang xem (gộp eHerb + eHerb HCM)

  // ── Cache CHUNG: mọi máy vào là tức thì cho tới khi shop có data mới ──
  // sync_token đổi khi total_synced / high_water / OLDEST / backfill thay đổi → cache tự stale.
  // (thêm oldest_create_time: backfill chạy nốt làm ngày cũ nhất lùi mà total không đổi → nhãn "đã đủ từ" phải refresh)
  const castAll = params.cast_all === '1'; // Cast scope: "Tất cả" → cộng hết (không lọc ngày)
  const syncToken = 'v13|' + (meta ? `${meta.total_synced || 0}|${meta.high_water_create_time || ''}|${meta.oldest_create_time || ''}|${meta.video_synced || 0}|${meta.backfill_done ? 1 : 0}` : 'no-meta');
  const cacheKey = `${shopId || 'null'}|${start}|${end || 'null'}|c${castAll ? 1 : 0}`; // có castAll để pre-warm hâm đúng
  const force = params.force === '1';
  if (!force) {
    const { data: cc } = await supabase.from('koc_orders_cache').select('payload, sync_token').eq('cache_key', cacheKey).maybeSingle();
    if (cc && cc.sync_token === syncToken && cc.payload) {
      return res.status(200).json({ ...cc.payload, cached: true });
    }
  }

  // Phạm vi RỘNG ("Tất cả" = không start, hoặc > 60 ngày) → chạy TUẦN TỰ tránh tranh tài nguyên DB
  // → timeout. Phạm vi HẸP (7/30 ngày, tháng) → chạy SONG SONG (Promise.all): 58s ↓ ~max(1 RPC).
  const spanDays = (start && end) ? (new Date(end) - new Date(start)) / 86400000 : 9999;
  const wide = !start || spanDays > 60;
  const R = {
    stats:      () => supabase.rpc('koc_order_stats',        { p_shop_id: shopId, p_start: start, p_end: end }),
    totRows:    () => supabase.rpc('koc_order_totals',       { p_shop_id: shopId, p_start: start, p_end: end }),
    viewRows:   () => supabase.rpc('koc_video_views',        { p_shop_id: shopId, p_start: start, p_end: end }),
    viewTotal:  () => supabase.rpc('koc_video_views_total',  { p_shop_id: shopId, p_start: start, p_end: end }),
    castRows:   () => supabase.rpc('koc_cast_by_creator',    { p_shop_id: shopId, p_start: castAll ? null : start, p_end: castAll ? null : end }),
    sampleRows: () => supabase.rpc('koc_sample_cost',        { p_start: castAll ? null : start, p_end: castAll ? null : end, p_brand: brandArg }),
    extraTot:   () => supabase.rpc('koc_perf_extra_totals',  { p_shop_id: shopId, p_start: start, p_end: end, p_cast_start: castAll ? null : start, p_cast_end: castAll ? null : end, p_brand: brandArg }),
    gmvByContent: () => supabase.rpc('koc_gmv_by_content',   { p_shop_id: shopId, p_start: start, p_end: end }),
  };
  let stats, error, totRows, viewRows, viewTotal, castRows, sampleRows, extraTot, gmvByContent;
  if (wide) {
    ({ data: stats, error } = await R.stats());
    if (error) return res.status(200).json({ ok: false, error: error.message });
    ({ data: totRows } = await R.totRows());
    ({ data: viewRows } = await R.viewRows());
    ({ data: viewTotal } = await R.viewTotal());
    ({ data: castRows } = await R.castRows());
    ({ data: sampleRows } = await R.sampleRows());
    ({ data: extraTot } = await R.extraTot());
    ({ data: gmvByContent } = await R.gmvByContent());
  } else {
    const [a, b, c, d, e, f, g, h] = await Promise.all([
      R.stats(), R.totRows(), R.viewRows(), R.viewTotal(), R.castRows(), R.sampleRows(), R.extraTot(), R.gmvByContent(),
    ]);
    if (a.error) return res.status(200).json({ ok: false, error: a.error.message });
    stats = a.data; totRows = b.data; viewRows = c.data; viewTotal = d.data;
    castRows = e.data; sampleRows = f.data; extraTot = g.data; gmvByContent = h.data;
  }

  // Tổng view video mỗi KOC (khớp username bỏ '@' + lowercase) theo khoảng đang chọn
  const normU = (u) => (u || '').toLowerCase().replace(/^@/, '');
  const viewByUser = {};
  for (const r of (viewRows || [])) viewByUser[r.uname] = Number(r.total_views) || 0;
  // Cast (chi phí booking) mỗi KOC: link video air_links.cast ↔ video affiliate (chỉ video có fill cast)
  const castByUser = {};
  for (const r of (castRows || [])) castByUser[normU(r.creator_username)] = Number(r.cast_total) || 0;
  // Chi phí mẫu mỗi KOC (cost×1.08 + vận hành + ship, đơn mẫu TRONG KỲ). uname đã lowercase + bỏ '@'.
  const sampleByUser = {};
  for (const r of (sampleRows || [])) sampleByUser[r.uname] = Number(r.sample_cost) || 0;

  const creators = (stats || []).map(s => ({
    username: s.creator_username,
    orders: Number(s.orders) || 0,
    gmv: Number(s.gmv) || 0,
    qty: Number(s.qty) || 0,
    commission: Number(s.commission) || 0,
    videos: Number(s.videos) || 0,
    vtotal: Number(s.vtotal) || 0,
    vperiod: Number(s.vperiod) || 0,
    views: viewByUser[normU(s.creator_username)] || 0,
    cast: castByUser[normU(s.creator_username)] || 0,
    sample_cost: sampleByUser[normU(s.creator_username)] || 0,
    lives: Number(s.lives) || 0,
    products: Number(s.products) || 0,
    last_order: Number(s.last_order) || 0,
  }));
  const t = (totRows || [])[0] || {};
  const totalViews = Number(viewTotal) || 0; // tổng đầy đủ (không bị cắt dòng); per-KOC viewRows chỉ để điền cột
  // Tổng từ hàm SCALAR (full, không bị cắt 1000 dòng). Trước đây cộng từ mảng creators bị cắt → thiếu ~31-49% ở shop lớn.
  const ex = (extraTot || [])[0] || {};
  const totalCast = Number(ex.cast_total) || 0;
  const totalVtotal = Number(ex.vtotal) || 0;
  const totalVperiod = Number(ex.vperiod) || 0;
  const totalVtotalAll = Number(ex.vtotal_all) || 0;   // shop-wide (không lọc cohort KOC-có-đơn)
  const totalVperiodAll = Number(ex.vperiod_all) || 0;
  const totalSample = Number(ex.sample_total) || 0;
  const gbc = (gmvByContent || [])[0] || {};
  const totals = { gmv: Number(t.gmv) || 0, orders: Number(t.orders) || 0, commission: Number(t.commission) || 0, commission_actual: Number(t.commission_actual) || 0, qty: Number(t.qty) || 0, views: totalViews, cast: totalCast, sample_cost: totalSample, vtotal: totalVtotal, vperiod: totalVperiod, vtotal_all: totalVtotalAll, vperiod_all: totalVperiodAll,
    gmv_video: Number(gbc.gmv_video) || 0, gmv_live: Number(gbc.gmv_live) || 0, gmv_linkshare: Number(gbc.gmv_linkshare) || 0, gmv_shop: Number(gbc.gmv_shop) || 0 };
  const totalCreators = Number(t.creators) || creators.length;

  // Trạng thái cào COUNT video (ghi chú "đang cào tới [time]") — kỳ chạm tháng hiện tại = chưa đủ 100%
  let count_sync = null;
  if (shopId) {
    try {
      const { data: vmeta } = await supabase.from('tiktok_affiliate_sync_meta').select('video_last_run_at').eq('shop_id', shopId).maybeSingle();
      const curMonth = new Date().toISOString().slice(0, 7);
      const endMonth = (end || new Date().toISOString().slice(0, 10)).slice(0, 7);
      count_sync = { last_run_at: vmeta?.video_last_run_at || null, filling: endMonth >= curMonth };
    } catch { /* ignore */ }
  }

  // ĐÈN BÁO TỰ KIỂM view: data view-tháng (tiktok_video_monthly_views) của tháng-cuối-kỳ còn TƯƠI ko?
  // Rủi ro thật khi bỏ Excel: cron sync đứng → tháng hiện tại đếm thiếu mà số vẫn "đông cứng". updated_at
  // mới nhất của tháng đó = lần cron chạm cuối. Lệch > ngưỡng (giờ) → đèn vàng "nghi đứng, số có thể thiếu".
  let view_health = null;
  if (shopId) {
    try {
      const endMonth = (end || new Date().toISOString().slice(0, 10)).slice(0, 7);
      const curMonth = new Date().toISOString().slice(0, 7);
      const { data: fr } = await supabase.from('tiktok_video_monthly_views')
        .select('updated_at').eq('shop_id', shopId).eq('ym', endMonth)
        .order('updated_at', { ascending: false }).limit(1).maybeSingle();
      const last = fr?.updated_at ? new Date(fr.updated_at) : null;
      const hours = last ? Math.round((Date.now() - last.getTime()) / 3600000) : null;
      // Chỉ "soi" tháng còn đang chạy (tháng hiện tại). Tháng quá khứ đã đóng → khỏi báo động.
      const watching = endMonth >= curMonth;
      const stale = watching && (hours == null || hours > 30); // cron chạy nhiều lần/ngày → >30h là bất thường
      view_health = { ym: endMonth, last_updated: fr?.updated_at || null, hours, watching, level: stale ? 'warn' : 'ok' };
    } catch { /* ignore */ }
  }
  const payload = {
    ok: true, shop: meta?.seller_name || params.seller, shop_id: shopId,
    start_date: start, end_date: end, floor: AFF_SYNC_FLOOR_DATE,
    sync: meta ? { last_run_at: meta.last_run_at, total_synced: meta.total_synced, backfill_done: meta.backfill_done, oldest_date: vnDate(meta.oldest_create_time), newest_date: vnDate(meta.high_water_create_time), status: meta.last_status } : null,
    count: totalCreators, shown: creators.length, totals, creators, shops: shopList, count_sync, view_health,
  };
  // Lưu cache chung (best-effort) → máy khác vào là tức thì tới lần sync kế
  try { await supabase.from('koc_orders_cache').upsert({ cache_key: cacheKey, payload, sync_token: syncToken, built_at: new Date().toISOString() }, { onConflict: 'cache_key' }); } catch { /* cache lỗi không chặn response */ }
  return res.status(200).json(payload);
}

// Drill-down: which products one KOC drove (+ videos per product). Product names
// resolved best-effort via the Analytics app connection for the shop.
async function handleKocProducts({ params, appKey, appSecret, supabase, res }) {
  const norm = (s) => (s || '').toLowerCase().trim();
  const creator = params.creator;
  if (!creator) return res.status(200).json({ ok: false, error: 'missing creator' });

  let shopId = params.shop_id ? String(params.shop_id) : null;
  if (!shopId) {
    const { data: metas } = await supabase.from('tiktok_affiliate_sync_meta').select('shop_id, seller_name');
    const want = norm(params.seller || 'body');
    shopId = (metas || []).find(m => norm(m.seller_name).includes(want))?.shop_id || null;
  }
  const start = params.start_date || AFF_SYNC_FLOOR_DATE;
  const end = params.end_date || null;

  const [{ data: rows, error }, { data: pvcRows }] = await Promise.all([
    supabase.rpc('koc_product_breakdown', { p_shop_id: shopId, p_start: start, p_end: end, p_creator: creator }),
    supabase.rpc('koc_product_video_counts', { p_shop_id: shopId, p_creator: creator, p_start: start, p_end: end }),
  ]);
  if (error) return res.status(200).json({ ok: false, error: error.message });

  // Số clip đã đăng cho từng SP (tiktok_shop_videos): vtotal toàn TG, vperiod trong kỳ
  const vcByProduct = {};
  for (const r of (pvcRows || [])) vcByProduct[String(r.product_id)] = { vtotal: Number(r.v_total) || 0, vperiod: Number(r.v_period) || 0 };

  let products = (rows || []).map(r => ({
    product_id: String(r.product_id), orders: Number(r.orders) || 0, gmv: Number(r.gmv) || 0,
    qty: Number(r.qty) || 0, videos: Number(r.videos) || 0, content_types: r.content_types || '',
    vtotal: vcByProduct[String(r.product_id)]?.vtotal || 0,
    vperiod: vcByProduct[String(r.product_id)]?.vperiod || 0,
  }));

  // Tên/ảnh sản phẩm (top 30): cache local trước, chỉ gọi TikTok cho cái chưa cache
  try {
    const { data: aconns } = await supabase.from('tiktok_analytics_connections').select('access_token, shop_cipher, shop_id').not('access_token', 'is', null);
    const conn = (aconns || []).find(c => String(c.shop_id) === String(shopId));
    const ids = products.slice(0, 30).map(p => p.product_id);
    const meta = await resolveProductMeta({ supabase, appKey, appSecret, conn, shopId, ids });
    products = products.map(p => ({ ...p, name: meta[p.product_id]?.name || '', image: meta[p.product_id]?.image || '' }));
  } catch { /* names optional */ }

  return res.status(200).json({ ok: true, creator, shop_id: shopId, count: products.length, products });
}

// Drill-down: từng video của 1 KOC + mốc thời gian (đơn đầu ≈ ngày lên video) + SP chính.
async function handleKocVideos({ params, appKey, appSecret, supabase, res }) {
  const norm = (s) => (s || '').toLowerCase().trim();
  const creator = params.creator;
  if (!creator) return res.status(200).json({ ok: false, error: 'missing creator' });

  let shopId = params.shop_id ? String(params.shop_id) : null;
  if (!shopId) {
    const { data: metas } = await supabase.from('tiktok_affiliate_sync_meta').select('shop_id, seller_name');
    const want = norm(params.seller || 'body');
    shopId = (metas || []).find(m => norm(m.seller_name).includes(want))?.shop_id || null;
  }
  const start = params.start_date || AFF_SYNC_FLOOR_DATE;
  const end = params.end_date || null;

  const { data: rows, error } = await supabase.rpc('koc_video_breakdown', { p_shop_id: shopId, p_start: start, p_end: end, p_creator: creator });
  if (error) return res.status(200).json({ ok: false, error: error.message });

  let videos = (rows || []).map(r => ({
    content_id: String(r.content_id), content_type: r.content_type || '',
    first_order: Number(r.first_order) || 0, last_order: Number(r.last_order) || 0,
    orders: Number(r.orders) || 0, gmv: Number(r.gmv) || 0, qty: Number(r.qty) || 0,
    top_product_id: String(r.top_product_id || ''), product_count: Number(r.product_count) || 0,
  }));

  // Bổ sung TẤT CẢ video KOC đã ĐĂNG (mọi thời điểm, kể cả chưa ra đơn) → "VIDEO ĐÃ LÊN" khớp với VIDEO TỔNG.
  // (Trước đây lọc post_date theo kỳ → KOC không đăng video trong kỳ thì danh sách thiếu so với VIDEO TỔNG.)
  try {
    const cn = norm(creator).replace(/^@/, '');
    const { data: tvids } = await supabase.from('tiktok_shop_videos').select('id, post_date, video_post_time, product_id')
      .eq('shop_id', shopId).or(`username.ilike.${cn},username.ilike.@${cn}`).limit(2000);
    const have = new Set(videos.map(v => v.content_id));
    for (const tv of (tvids || [])) {
      const id = String(tv.id);
      if (have.has(id)) continue;
      have.add(id);
      const fo = tv.video_post_time ? Math.floor(new Date(tv.video_post_time).getTime() / 1000)
               : (tv.post_date ? Math.floor(new Date(tv.post_date + 'T00:00:00Z').getTime() / 1000) : 0);
      videos.push({ content_id: id, content_type: 'VIDEO', first_order: fo, last_order: fo,
        orders: 0, gmv: 0, qty: 0, top_product_id: String(tv.product_id || ''), product_count: tv.product_id ? 1 : 0 });
    }
    videos.sort((a, b) => (b.first_order || 0) - (a.first_order || 0));
  } catch { /* bổ sung video best-effort, không chặn */ }

  // Cast (giá đã thanh toán) mỗi video — map từ koc_payments (+ air_links fallback) theo video id
  try {
    const { data: castRows } = await supabase.rpc('koc_video_cast', { p_shop_id: shopId, p_creator: creator });
    const castById = {};
    for (const r of (castRows || [])) castById[String(r.content_id)] = Number(r.cast_amount) || 0;
    videos = videos.map(v => ({ ...v, cast: castById[v.content_id] || 0 }));
  } catch { /* cast optional */ }

  // Tên/ảnh SP chính của mỗi video (distinct, top 30): cache local trước, chỉ gọi TikTok cho cái chưa cache
  try {
    const ids = [...new Set(videos.map(v => v.top_product_id).filter(Boolean))].slice(0, 30);
    if (ids.length) {
      const { data: aconns } = await supabase.from('tiktok_analytics_connections').select('access_token, shop_cipher, shop_id').not('access_token', 'is', null);
      const conn = (aconns || []).find(c => String(c.shop_id) === String(shopId));
      const meta = await resolveProductMeta({ supabase, appKey, appSecret, conn, shopId, ids });
      videos = videos.map(v => ({ ...v, product_name: meta[v.top_product_id]?.name || '', product_image: meta[v.top_product_id]?.image || '' }));
    }
  } catch { /* names optional */ }

  // Enrich: metadata + TỔNG view (cộng các tháng) + view của THÁNG được chọn (tháng nhiều ngày nhất trong khoảng)
  let ymSel = null;
  try {
    const endForYm = end || vnDate(Math.floor(Date.now() / 1000));
    ymSel = (() => {
      const s = new Date(start + 'T00:00:00Z'); const e = new Date(endForYm + 'T00:00:00Z');
      if (isNaN(s.getTime()) || isNaN(e.getTime())) return null;
      const counts = {}; const d = new Date(s); let g = 0;
      while (d <= e && g < 800) { const k = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`; counts[k] = (counts[k] || 0) + 1; d.setUTCDate(d.getUTCDate() + 1); g++; }
      let best = null, bc = -1; for (const [k, c] of Object.entries(counts)) if (c > bc) { bc = c; best = k; }
      return best;
    })();
    const ids = videos.map(v => v.content_id).filter(Boolean);
    if (ids.length) {
      // Metadata (tiêu đề, ngày đăng) từ API video sync
      const { data: vrows } = await supabase.from('tiktok_shop_videos').select('id, views, video_post_time, title').in('id', ids);
      const meta = {}; (vrows || []).forEach(r => { meta[r.id] = r; });

      // VIEW: ưu tiên data IMPORT (tiktok_performance — đầy đủ theo tháng). Tổng = cộng các tháng đã import.
      let selM = null, selY = null; if (ymSel) { const [y, m] = ymSel.split('-').map(Number); selY = y; selM = m; }
      const { data: perf } = await supabase.from('tiktok_performance').select('video_id, month, year, views, air_date').in('video_id', ids);
      const totById = {}, monthById = {}, airById = {};
      (perf || []).forEach(r => {
        totById[r.video_id] = (totById[r.video_id] || 0) + (Number(r.views) || 0);
        if (selM && r.month === selM && r.year === selY) monthById[r.video_id] = Number(r.views) || 0;
        if (r.air_date && !airById[r.video_id]) airById[r.video_id] = String(r.air_date).slice(0, 10);
      });
      // Fallback view tháng từ API monthly (nếu video chưa có trong import)
      let monFallback = {};
      if (ymSel) {
        const { data: mrows } = await supabase.from('tiktok_video_monthly_views').select('id, views').eq('ym', ymSel).in('id', ids);
        (mrows || []).forEach(r => { monFallback[r.id] = Number(r.views) || 0; });
      }
      videos = videos.map(v => {
        const id = v.content_id;
        const hasImport = id in totById;
        return { ...v,
          title: meta[id]?.title || v.title || '',
          video_post_time: meta[id]?.video_post_time || airById[id] || v.video_post_time || '',
          views: hasImport ? totById[id] : (meta[id] ? (Number(meta[id].views) || 0) : null),
          month_views: (id in monthById) ? monthById[id] : ((id in monFallback) ? monFallback[id] : null),
        };
      });
    }
  } catch { /* views optional */ }

  return res.status(200).json({ ok: true, creator, shop_id: shopId, count: videos.length, ym_selected: ymSel, videos });
}

// ── KOC avatars (best-effort) ────────────────────────────────────────────────
// orders/search không trả avatar → tra cứu qua marketplace_creators/search với
// body {keyword: username} (kết quả khớp username đứng đầu). Endpoint này bị rate
// limit gắt nên cache vào tiktok_creator_avatars + chỉ fetch vài cái mỗi lượt.
const fetchCreatorAvatar = async ({ ck, cs, accessToken, cipher, username }) => {
  const path = '/affiliate_seller/202508/marketplace_creators/search';
  const bodyStr = JSON.stringify({ keyword: username });
  const urlParams = { app_key: ck, timestamp: String(Math.floor(Date.now() / 1000)), page_size: '12', shop_cipher: cipher };
  urlParams.sign = buildSign(cs, path, urlParams, bodyStr);
  let j;
  try { j = JSON.parse(await ttText(`${TIKTOK_BASE}${path}?${new URLSearchParams(urlParams)}`, { method: 'POST', headers: { 'x-tts-access-token': accessToken, 'content-type': 'application/json' }, body: bodyStr }, 10000)); }
  catch { return { rateLimited: false, found: null }; }
  if (j?.code === 36009002) return { rateLimited: true, found: null };
  if (j?.code !== 0) return { rateLimited: false, found: null };
  const u = username.toLowerCase();
  const c = (j.data?.creators || []).find(x => (x.username || '').toLowerCase() === u) || null;
  return { rateLimited: false, found: c ? { username: c.username, avatar_url: c.avatar?.url || '', nickname: c.nickname || '' } : null };
};

// Returns { username: {avatar_url, nickname} } for cached + newly fetched. Stops
// fetching on rate limit. Caches negatives (empty) to avoid re-hammering.
const harvestAvatars = async ({ ck, cs, conn, cipher, supabase, usernames, max = 6 }) => {
  const out = {};
  if (!usernames?.length || !cipher || !ck || !cs) return out;
  const { data: cached } = await supabase.from('tiktok_creator_avatars').select('username, avatar_url, nickname, updated_at').in('username', usernames);
  const freshUntil = Date.now() - 2 * 86400 * 1000;
  const fresh = new Set();
  (cached || []).forEach(r => { out[r.username] = { avatar_url: r.avatar_url, nickname: r.nickname }; if (new Date(r.updated_at).getTime() > freshUntil) fresh.add(r.username); });
  let accessToken = conn.access_token, fetched = 0;
  for (const u of usernames) {
    if (fetched >= max) break;
    if (fresh.has(u)) continue;
    const r = await fetchCreatorAvatar({ ck, cs, accessToken, cipher, username: u });
    if (r.rateLimited) break;
    fetched++;
    const row = { username: u, avatar_url: r.found?.avatar_url || '', nickname: r.found?.nickname || '', updated_at: new Date().toISOString() };
    out[u] = { avatar_url: row.avatar_url, nickname: row.nickname };
    try { await supabase.from('tiktok_creator_avatars').upsert(row, { onConflict: 'username' }); } catch { /* ignore */ }
  }
  return out;
};

async function handleKocAvatars({ params, supabase, res }) {
  const ck = process.env.TIKTOK_CREATOR_APP_KEY?.trim();
  const cs = process.env.TIKTOK_CREATOR_APP_SECRET?.trim();
  const users = String(params.users || '').split(',').map(s => s.trim()).filter(Boolean).slice(0, 80);
  if (!users.length) return res.status(200).json({ ok: true, avatars: {} });

  const { data: conns } = await supabase.from('tiktok_creator_connections').select('open_id, shop_id, shop_cipher, seller_name, access_token, refresh_token').not('access_token', 'is', null);
  const want = String(params.seller || 'body').toLowerCase();
  const conn = (conns || []).find(c => (c.seller_name || '').toLowerCase().includes(want)) || (conns || [])[0];
  let cipher = null;
  if (conn) cipher = (await resolveShopContext({ conn, supabase }))?.cipher;

  const max = Math.min(Math.max(Number(params.max) || 8, 0), 12);
  const map = await harvestAvatars({ ck, cs, conn, cipher, supabase, usernames: users, max });
  const avatars = {};
  for (const [u, v] of Object.entries(map)) if (v.avatar_url) avatars[u] = { avatar: v.avatar_url, nickname: v.nickname };
  return res.status(200).json({ ok: true, avatars });
}

// Pre-warm cache koc_orders: hâm lại các range shop ĐÃ TỪNG XEM (rebuild force=1) sau khi sync
// → bấm vô shop là có cache liền (~3s thay vì ~10s). Chạy ở GitHub runner (ngoài giới hạn 60s Vercel).
async function handlePrewarmKoc({ params, supabase, res }) {
  let shopId = params.shop_id ? String(params.shop_id) : null;
  let seller = params.seller || '';
  if (!shopId) {
    // không chỉ định → lấy shop VỪA SYNC (video_last_run_at mới nhất)
    const { data } = await supabase.from('tiktok_affiliate_sync_meta')
      .select('shop_id, seller_name, video_last_run_at').not('shop_id', 'is', null)
      .order('video_last_run_at', { ascending: false }).limit(1).maybeSingle();
    shopId = data?.shop_id || null; seller = data?.seller_name || seller;
  } else if (!seller) {
    const { data } = await supabase.from('tiktok_affiliate_sync_meta').select('seller_name').eq('shop_id', shopId).maybeSingle();
    seller = data?.seller_name || '';
  }
  if (!shopId) return res.status(200).json({ ok: false, error: 'no shop' });
  const max = Math.min(Math.max(Number(params.max) || 6, 1), 12);
  // Lấy hết key rồi lọc prefix trong JS (tránh .like lỗi với ký tự '|'). Bảng cache nhỏ.
  const { data: allRows } = await supabase.from('koc_orders_cache').select('cache_key, built_at').order('built_at', { ascending: false }).limit(1000);
  const rows = (allRows || []).filter(r => String(r.cache_key).startsWith(shopId + '|')).slice(0, max);
  // Ưu tiên range HẸP (nhanh ~10s); range "Tất cả"/floor (chậm ~40s) để cuối → tránh timeout 60s.
  const isWide = (k) => { const p = String(k).split('|'); return (!p[2] || p[2] === 'null') || p[1] === AFF_SYNC_FLOOR_DATE; };
  rows.sort((a, b) => (isWide(a.cache_key) ? 1 : 0) - (isWide(b.cache_key) ? 1 : 0));
  // res giả: nuốt mọi lời gọi (handleKocOrders dùng setHeader/status/json/...) — chỉ cần nó CHẠY để ghi cache.
  const noop = { setHeader() { return this; }, status() { return this; }, json() { return this; }, send() { return this; }, end() { return this; } };
  let warmed = 0; const keys = []; const t0 = Date.now();
  for (const r of (rows || [])) {
    if (warmed > 0 && Date.now() - t0 > 35000) break; // đã warm ≥1, hết giờ → dừng (tránh timeout)
    const p = r.cache_key.split('|'); // shopId|start|end|cX
    try {
      await handleKocOrders({ params: { seller, shop_id: shopId, start_date: p[1] || '', end_date: (p[2] === 'null' ? '' : p[2]) || '', cast_all: p[3] === 'c1' ? '1' : '0', force: '1' }, supabase, res: noop });
      warmed++; keys.push(r.cache_key);
    } catch (e) { /* bỏ qua key lỗi */ }
  }
  return res.status(200).json({ ok: true, shop_id: shopId, seller, warmed, keys });
}

// ── Main handler ─────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  // Allow GET and POST
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ── Config: prefer analytics app, fallback to orders app ───────────────────
  const appKey    = (process.env.TIKTOK_ANALYTICS_APP_KEY    || process.env.TIKTOK_SHOP_APP_KEY)?.trim();
  const appSecret = (process.env.TIKTOK_ANALYTICS_APP_SECRET || process.env.TIKTOK_SHOP_APP_SECRET)?.trim();
  const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL)?.trim();
  const supabaseKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY)?.trim();

  // Chỉ Supabase là BẮT BUỘC cho mọi action đọc (koc_orders/products/videos…) vì chúng chạy bằng RPC.
  // Key TikTok chỉ cần cho action gọi API TikTok (sync/avatar) — các action đó tự kiểm tra. Nhờ vậy
  // tab Hiệu suất KOC vẫn load dù bản build/đối tượng thiếu key TikTok (vd build cũ chưa có ANALYTICS key).
  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Missing env config', missing: { supabaseUrl: !supabaseUrl, supabaseKey: !supabaseKey } });
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  // ── Parse params ───────────────────────────────────────────────────────────
  const params     = { ...req.query, ...(req.body || {}) };
  const startDate  = params.start_date;
  const endDate    = params.end_date;
  const granularity = params.granularity || '1D';
  const shopIdFilter = params.shop_id || '';
  const action = params.action || '';

  // Product-level analytics (top sản phẩm bán chạy) — merged here to stay within
  // the Vercel Hobby 12-function limit. Returns { ok, ... }.
  if (action === 'shops' || action === 'products') {
    try { return await handleProductAnalytics({ action, params, appKey, appSecret, supabase, res }); }
    catch (err) { return res.status(200).json({ ok: false, error: err.message || 'Internal error' }); }
  }

  if (action === 'koc_creators') {
    try { return await handleKocCreators({ params, supabase, res }); }
    catch (err) { return res.status(200).json({ ok: false, error: err.message }); }
  }

  if (action === 'koc_hunt') {
    try { return await handleKocHunt({ params, supabase, res }); }
    catch (err) { return res.status(200).json({ ok: false, error: err.message }); }
  }

  if (action === 'affil_probe') {
    try { return await handleAffilProbe({ params, supabase, res }); }
    catch (err) { return res.status(200).json({ ok: false, error: err.message }); }
  }

  if (action === 'koc_invite_im') {
    try { return await handleKocInviteIm({ params, supabase, res }); }
    catch (err) { return res.status(200).json({ ok: false, error: err.message }); }
  }

  if (action === 'koc_invite_collab') {
    try { return await handleKocInviteCollab({ params, supabase, res }); }
    catch (err) { return res.status(200).json({ ok: false, error: err.message }); }
  }

  if (action === 'koc_orders') {
    try { return await handleKocOrders({ params, supabase, res }); }
    catch (err) { return res.status(200).json({ ok: false, error: err.message }); }
  }

  if (action === 'koc_find') {
    try { return await handleKocFind({ params, supabase, res }); }
    catch (err) { return res.status(200).json({ ok: false, error: err.message }); }
  }

  if (action === 'koc_search_creator') {
    try { return await handleKocSearchCreator({ params, supabase, res }); }
    catch (err) { return res.status(200).json({ ok: false, error: err.message }); }
  }

  if (action === 'koc_products') {
    try { return await handleKocProducts({ params, appKey, appSecret, supabase, res }); }
    catch (err) { return res.status(200).json({ ok: false, error: err.message }); }
  }

  if (action === 'koc_videos') {
    try { return await handleKocVideos({ params, appKey, appSecret, supabase, res }); }
    catch (err) { return res.status(200).json({ ok: false, error: err.message }); }
  }

  if (action === 'koc_avatars') {
    try { return await handleKocAvatars({ params, supabase, res }); }
    catch (err) { return res.status(200).json({ ok: false, error: err.message }); }
  }

  if (action === 'sync_aff_orders') {
    try { return await handleSyncAffOrders({ params, appKey, appSecret, supabase, res }); }
    catch (err) { return res.status(200).json({ ok: false, error: err.message }); }
  }

  if (action === 'sync_aff_videos') {
    try { return await handleSyncAffVideos({ params, appKey, appSecret, supabase, res }); }
    catch (err) { return res.status(200).json({ ok: false, error: err.message }); }
  }

  if (action === 'sync_videos_fresh') {
    try { return await handleSyncVideosFresh({ params, appKey, appSecret, supabase, res }); }
    catch (err) { return res.status(200).json({ ok: false, error: err.message }); }
  }

  if (action === 'fill_koc_views') {
    try { return await handleFillKocViews({ params, appKey, appSecret, supabase, res }); }
    catch (err) { return res.status(200).json({ ok: false, error: err.message }); }
  }

  if (action === 'prewarm_koc') {
    try { return await handlePrewarmKoc({ params, supabase, res }); }
    catch (err) { return res.status(200).json({ ok: false, error: err.message }); }
  }

  // ── Module 5 "Xưởng Clip" — OpenAI ảnh + HeyGen video (logic ở lib/liveai.js) ──
  if (action === 'live_gen_image') { try { return res.status(200).json(await handleLiveGenImage(params)); } catch (err) { return res.status(200).json({ ok: false, error: err.message }); } }
  if (action === 'live_make_video') { try { return res.status(200).json(await handleLiveMakeVideo(params)); } catch (err) { return res.status(200).json({ ok: false, error: err.message }); } }
  if (action === 'live_check_video') { try { return res.status(200).json(await handleLiveCheckVideo(params)); } catch (err) { return res.status(200).json({ ok: false, error: err.message }); } }
  if (action === 'live_voices') { try { return res.status(200).json(await handleLiveVoices(params)); } catch (err) { return res.status(200).json({ ok: false, error: err.message }); } }
  if (action === 'live_suggest') { try { return res.status(200).json(await handleLiveSuggest(params)); } catch (err) { return res.status(200).json({ ok: false, error: err.message }); } }

  if (!startDate || !endDate) {
    return res.status(400).json({ error: 'Missing start_date and/or end_date (format: YYYY-MM-DD)' });
  }

  // ── Get connections (try analytics table first, fallback to orders table) ──
  let connections = [];
  const { data: analyticsConns } = await supabase
    .from('tiktok_analytics_connections')
    .select('access_token, shop_cipher, shop_id, seller_name, access_token_expires_at')
    .not('access_token', 'is', null);

  if (analyticsConns && analyticsConns.length > 0) {
    connections = analyticsConns;
  } else {
    // Fallback: try orders connections (in case analytics scope was added to orders app)
    const { data: orderConns } = await supabase
      .from('tiktok_shop_connections')
      .select('access_token, shop_cipher, shop_id, seller_name, access_token_expires_at')
      .not('access_token', 'is', null)
      .not('shop_cipher', 'is', null);
    connections = orderConns || [];
  }

  if (!connections.length) {
    return res.status(200).json({ success: true, data: [], message: 'No connections found. Authorize shops with Analytics app first.' });
  }

  // Filter by shop if specified
  const connsToProcess = shopIdFilter
    ? connections.filter(c => String(c.shop_id) === String(shopIdFilter))
    : connections;

  // ── Call analytics for each shop ───────────────────────────────────────────
  const results = [];
  for (const conn of connsToProcess) {
    const shopLabel = conn.seller_name || conn.shop_id || 'unknown';
    try {
      const resp = await fetchShopPerformance({
        appKey, appSecret,
        accessToken: conn.access_token,
        shopCipher:  conn.shop_cipher,
        startDate, endDate, granularity,
      });

      if (resp?.code === 0 && resp?.data) {
        results.push({
          shop_id:     conn.shop_id,
          seller_name: conn.seller_name,
          data:        resp.data,
        });
      } else {
        results.push({
          shop_id:     conn.shop_id,
          seller_name: conn.seller_name,
          error:       resp?.message || `code ${resp?.code}`,
          code:        resp?.code,
        });
      }
    } catch (err) {
      results.push({
        shop_id:     conn.shop_id,
        seller_name: conn.seller_name,
        error:       err.message,
      });
    }
  }

  return res.status(200).json({
    success: true,
    start_date: startDate,
    end_date:   endDate,
    granularity,
    shops: results,
    fetchedAt: new Date().toISOString(),
  });
}
