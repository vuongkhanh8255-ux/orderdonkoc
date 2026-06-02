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

// ── Affiliate discovery probe (TEMP) ─────────────────────────────────────────
// Calls candidate affiliate endpoints with a shop's CREATOR-app token to learn:
//  (1) whether we can get a shop_cipher (seller context), and
//  (2) which affiliate endpoint path/version actually returns data.
// Remove once the real affiliate endpoints are confirmed.
async function handleAffProbe({ params, supabase, res }) {
  const ck = process.env.TIKTOK_CREATOR_APP_KEY?.trim();
  const cs = process.env.TIKTOK_CREATOR_APP_SECRET?.trim();
  if (!ck || !cs) return res.status(200).json({ ok: false, error: 'TIKTOK_CREATOR_APP_KEY/SECRET missing' });
  if (params.go !== '1') return res.status(200).json({ ok: false, error: 'add &go=1 to run the probe' });

  const { data: conns } = await supabase
    .from('tiktok_creator_connections')
    .select('open_id, shop_id, shop_cipher, seller_name, access_token, refresh_token')
    .not('access_token', 'is', null);
  if (!conns?.length) return res.status(200).json({ ok: false, error: 'no creator connections' });

  const want = String(params.seller || 'body').toLowerCase();
  const conn = conns.find(c => (c.seller_name || '').toLowerCase().includes(want)) || conns[0];
  const at = conn.access_token;

  // The creator app couldn't list its own shop_cipher (105005). Borrow Bodymiss's
  // shop_cipher from the orders/analytics apps (same shop, already authorized).
  const cipherCandidates = [];
  if (conn.shop_cipher) cipherCandidates.push({ src: 'creator', cipher: conn.shop_cipher });
  for (const tbl of ['tiktok_analytics_connections', 'tiktok_shop_connections']) {
    try {
      const { data } = await supabase.from(tbl).select('shop_cipher, shop_id, seller_name').not('shop_cipher', 'is', null);
      const hit = (data || []).find(r => (r.seller_name || '').toLowerCase().includes(want))
               || (data || []).find(r => String(r.shop_id) === String(conn.shop_id));
      if (hit?.shop_cipher) cipherCandidates.push({ src: tbl, cipher: hit.shop_cipher });
    } catch { /* ignore */ }
  }

  const run = async (method, path, body, queryExtra = {}, cipher = null) => {
    const ts = String(Math.floor(Date.now() / 1000));
    const bodyStr = body ? JSON.stringify(body) : '';
    const urlParams = { app_key: ck, timestamp: ts, ...queryExtra };
    if (cipher) urlParams.shop_cipher = cipher;
    urlParams.sign = buildSign(cs, path, urlParams, bodyStr);
    const opts = { method, headers: { 'x-tts-access-token': at, 'content-type': 'application/json' } };
    if (body) opts.body = bodyStr;
    const t = await ttText(`${TIKTOK_BASE}${path}?${new URLSearchParams(urlParams)}`, opts, 10000);
    let j; try { j = JSON.parse(t); } catch { j = { _raw: t.slice(0, 200) }; }
    return { code: j?.code, message: j?.message, sample: JSON.stringify(j?.data ?? j).slice(0, 400) };
  };

  const probes = [];
  for (const cc of cipherCandidates) {
    const r = await run('POST', '/affiliate_seller/202508/marketplace_creators/search', {}, { page_size: '20' }, cc.cipher);
    probes.push({ cipher_src: cc.src, ...r });
  }

  return res.status(200).json({
    ok: true, shop: conn.seller_name, open_id: conn.open_id,
    shop_id: conn.shop_id, cipher_candidates: cipherCandidates.map(c => c.src), probes,
  });
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

  if (action === 'aff_probe') {
    try { return await handleAffProbe({ params, supabase, res }); }
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
