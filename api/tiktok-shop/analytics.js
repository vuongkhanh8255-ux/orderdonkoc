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
    return res.status(200).json({ ok: false, code: j?.code, error: rateLimited ? 'TikTok đang giới hạn tần suất (quá nhiều request). Thử lại sau ~1 phút.' : (j?.message || `TikTok code ${j?.code}`) });
  }

  const d = j.data || {};
  const creators = (d.creators || []).map(mapCreator);
  return res.status(200).json({
    ok: true, shop: conn.seller_name, shop_id: conn.shop_id,
    count: creators.length, creators, shops: shopList,
    next_page_token: d.next_page_token || null, search_key: d.search_key || null,
  });
}

// ════════════════════════════════════════════════════════════════════════════
// KOC affiliate ORDERS — real per-creator sales for the shop
//   POST /affiliate_seller/202410/orders/search  (creator_username + price + commission)
// Synced into Supabase by a cron (action=sync_aff_orders), read+aggregated by
// action=koc_orders. Only data from AFF_SYNC_FLOOR_DATE onward is kept (lighter).
// ════════════════════════════════════════════════════════════════════════════
const AFF_ORDERS_VERSION = '202410';
const AFF_SYNC_FLOOR_DATE = '2026-04-01';
const AFF_SYNC_FLOOR_TS   = Math.floor(new Date('2026-04-01T00:00:00+07:00').getTime() / 1000);
const AFF_PAGE_SIZE = '100';
const AFF_FWD_PAGES  = 6;   // pages from top each run (refresh recent + settlement status)
const AFF_BACK_PAGES = 26;  // deeper backfill pages each run (resumes via saved cursor)

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

const fetchAffOrdersPage = ({ ck, cs, accessToken, cipher, pageToken, pageSize = AFF_PAGE_SIZE }) => {
  const path = `/affiliate_seller/${AFF_ORDERS_VERSION}/orders/search`;
  const bodyStr = '{}';
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
    const urlParams = { app_key: appKey, timestamp: String(Math.floor(Date.now() / 1000)), start_date_ge: sd, end_date_lt: ed, sort_field: 'gmv', sort_order: 'DESC', page_size: '50', currency: 'LOCAL' };
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
    for (let i = 0; i < meta.length; i += 200) await supabase.from('tiktok_shop_videos').upsert(meta.slice(i, i + 200), { onConflict: 'id' });
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
  out.push(await syncShopVideoMonth({ appKey, appSecret, aconn, shop_id, ym: cur, supabase, maxPages: Math.max(4, Math.floor(maxPages / 2)) }));
  const past = months.slice(0, -1);
  if (past.length) {
    const { data: sms } = await supabase.from('tiktok_video_month_sync').select('ym, done').eq('shop_id', shop_id).in('ym', past);
    const doneSet = new Set((sms || []).filter(x => x.done).map(x => x.ym));
    const todo = past.filter(ym => !doneSet.has(ym));
    if (todo.length) out.push(await syncShopVideoMonth({ appKey, appSecret, aconn, shop_id, ym: todo[0], supabase, maxPages }));
  }
  return out;
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

  // PHASE B — backfill deeper (resume from saved cursor; else continue where forward stopped)
  let backfillDone = meta.backfill_done;
  let cur = meta.backfill_token || token;
  if (!backfillDone) {
    let bdone = false;
    for (let p = 0; p < AFF_BACK_PAGES; p++) {
      if (!cur) { bdone = true; break; }
      const j = await fetchPage(cur);
      if (j?.code !== 0) { status = `backfill ${j?.code}: ${j?.message || ''}`.slice(0, 120); break; }
      const orders = j.data?.orders || [];
      const ing = await ingest(orders);
      totalUp += ing.count;
      if (ing.maxCt) newest = Math.max(newest, ing.maxCt);
      if (ing.minCt) oldest = oldest ? Math.min(oldest, ing.minCt) : ing.minCt;
      cur = j.data?.next_page_token;
      if (ing.hitFloor) { bdone = true; break; }
      if (!cur || !orders.length) { bdone = true; break; }
    }
    backfillDone = bdone;
  }

  await supabase.from('tiktok_affiliate_sync_meta').upsert({
    shop_id, seller_name,
    high_water_create_time: newest,
    backfill_token: backfillDone ? null : cur,
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

  // Sync this shop's video analytics (views, post time, title) into tiktok_shop_videos.
  let videoSync = null;
  try { videoSync = await syncShopVideosAllMonths({ appKey, appSecret, shop_id, supabase, maxPages: videoPages }); }
  catch (e) { videoSync = { error: e.message }; }

  return { shop: seller_name, shop_id, upserted: totalUp, newest_date: vnDate(newest), oldest_date: vnDate(oldest), backfill_done: backfillDone, status, videos: videoSync };
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
    const score = (m) => !m ? 0 : (!m.backfill_done ? 1 : 2);
    targets = [...conns].sort((a, b) => {
      const ma = metaBy[norm(a.seller_name)], mb = metaBy[norm(b.seller_name)];
      const sa = score(ma), sb = score(mb);
      if (sa !== sb) return sa - sb;
      return (ma?.last_run_at ? new Date(ma.last_run_at).getTime() : 0) - (mb?.last_run_at ? new Date(mb.last_run_at).getTime() : 0);
    }).slice(0, 1);
  }
  if (!targets.length) return res.status(200).json({ ok: false, error: 'no matching shop' });

  const videoPages = Math.min(Math.max(Number(params.vpages) || 12, 1), 50);
  const results = [];
  for (const conn of targets) {
    try { results.push(await syncOneAffShop({ ck, cs, conn, supabase, appKey, appSecret, videoPages })); }
    catch (e) { results.push({ shop: conn.seller_name, error: e.message }); }
  }
  return res.status(200).json({ ok: true, floor: AFF_SYNC_FLOOR_DATE, synced: results.length, results });
}

// Read + aggregate per-KOC sales from the synced table.
async function handleKocOrders({ params, supabase, res }) {
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

  const [{ data: stats, error }, { data: totRows }] = await Promise.all([
    supabase.rpc('koc_order_stats', { p_shop_id: shopId, p_start: start, p_end: end }),
    supabase.rpc('koc_order_totals', { p_shop_id: shopId, p_start: start, p_end: end }),
  ]);
  if (error) return res.status(200).json({ ok: false, error: error.message });

  const creators = (stats || []).map(s => ({
    username: s.creator_username,
    orders: Number(s.orders) || 0,
    gmv: Number(s.gmv) || 0,
    qty: Number(s.qty) || 0,
    commission: Number(s.commission) || 0,
    videos: Number(s.videos) || 0,
    lives: Number(s.lives) || 0,
    products: Number(s.products) || 0,
    last_order: Number(s.last_order) || 0,
  }));
  const t = (totRows || [])[0] || {};
  const totals = { gmv: Number(t.gmv) || 0, orders: Number(t.orders) || 0, commission: Number(t.commission) || 0, qty: Number(t.qty) || 0 };
  const totalCreators = Number(t.creators) || creators.length;

  return res.status(200).json({
    ok: true, shop: meta?.seller_name || params.seller, shop_id: shopId,
    start_date: start, end_date: end, floor: AFF_SYNC_FLOOR_DATE,
    sync: meta ? { last_run_at: meta.last_run_at, total_synced: meta.total_synced, backfill_done: meta.backfill_done, oldest_date: vnDate(meta.oldest_create_time), newest_date: vnDate(meta.high_water_create_time), status: meta.last_status } : null,
    count: totalCreators, shown: creators.length, totals, creators, shops: shopList,
  });
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

  const { data: rows, error } = await supabase.rpc('koc_product_breakdown', { p_shop_id: shopId, p_start: start, p_end: end, p_creator: creator });
  if (error) return res.status(200).json({ ok: false, error: error.message });

  let products = (rows || []).map(r => ({
    product_id: String(r.product_id), orders: Number(r.orders) || 0, gmv: Number(r.gmv) || 0,
    qty: Number(r.qty) || 0, videos: Number(r.videos) || 0, content_types: r.content_types || '',
  }));

  // Resolve product names/images (top 30) via the shop's Analytics connection
  try {
    const { data: aconns } = await supabase.from('tiktok_analytics_connections').select('access_token, shop_cipher, shop_id').not('access_token', 'is', null);
    const conn = (aconns || []).find(c => String(c.shop_id) === String(shopId));
    if (conn) {
      const ids = products.slice(0, 30).map(p => p.product_id);
      const meta = await fetchProductDetails({ appKey, appSecret, conn, ids });
      products = products.map(p => ({ ...p, name: meta[p.product_id]?.name || '', image: meta[p.product_id]?.image || '' }));
    }
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

  // Resolve product name/image for the dominant product of each video (distinct, top 30)
  try {
    const ids = [...new Set(videos.map(v => v.top_product_id).filter(Boolean))].slice(0, 30);
    if (ids.length) {
      const { data: aconns } = await supabase.from('tiktok_analytics_connections').select('access_token, shop_cipher, shop_id').not('access_token', 'is', null);
      const conn = (aconns || []).find(c => String(c.shop_id) === String(shopId));
      if (conn) {
        const meta = await fetchProductDetails({ appKey, appSecret, conn, ids });
        videos = videos.map(v => ({ ...v, product_name: meta[v.top_product_id]?.name || '', product_image: meta[v.top_product_id]?.image || '' }));
      }
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
      const { data: vrows } = await supabase.from('tiktok_shop_videos').select('id, video_post_time, title').in('id', ids);
      const meta = {}; (vrows || []).forEach(r => { meta[r.id] = r; });
      const { data: mrows } = await supabase.from('tiktok_video_monthly_views').select('id, ym, views').in('id', ids);
      const totalById = {}, monthById = {};
      (mrows || []).forEach(r => {
        totalById[r.id] = (totalById[r.id] || 0) + (Number(r.views) || 0);
        if (r.ym === ymSel) monthById[r.id] = Number(r.views) || 0;
      });
      videos = videos.map(v => ({ ...v,
        video_post_time: meta[v.content_id]?.video_post_time || v.video_post_time || '',
        title: meta[v.content_id]?.title || v.title || '',
        views: (v.content_id in totalById) ? totalById[v.content_id] : null,
        month_views: (v.content_id in monthById) ? monthById[v.content_id] : null,
      }));
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

  if (!appKey || !appSecret || !supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Missing env config', missing: { appKey: !appKey, appSecret: !appSecret, supabaseUrl: !supabaseUrl, supabaseKey: !supabaseKey } });
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

  if (action === 'koc_orders') {
    try { return await handleKocOrders({ params, supabase, res }); }
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
