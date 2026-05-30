/**
 * api/tiktok-shop/product-analytics.js
 *
 * Vercel serverless — GET/POST /api/tiktok-shop/product-analytics
 *
 * Per-shop product performance ("top sản phẩm bán chạy") from the TikTok Shop
 * Analytics API, enriched with product name / status / stock from the Product API.
 *   GET  /analytics/202405/shop_products/performance   (gmv, units_sold, orders, ctr)
 *   POST /product/202309/products/search               (title, status, skus → stock)
 *
 * Actions:
 *   action=shops     → list TikTok shops connected with the Analytics app
 *   action=products  → top products for one shop + date range (default)
 *
 * Params for action=products:
 *   shop_id     (required) — which shop
 *   start_date  YYYY-MM-DD (required, inclusive)
 *   end_date    YYYY-MM-DD (required, inclusive)
 *   sort_field  gmv | orders | units_sold | click_through_rate   (default gmv)
 *   sort_order  DESC | ASC                                        (default DESC)
 *   page_size   default 20 (max 100)
 *   page_token  cursor for the next page (optional)
 *
 * Always returns HTTP 200 with { ok, ... } so Cloudflare never swaps in an HTML error.
 */

import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const TIKTOK_BASE      = 'https://open-api.tiktokglobalshop.com';
const TIKTOK_AUTH_BASE = 'https://auth.tiktok-shops.com';
const PERF_VERSION     = '202405'; // confirmed valid for shop_products/performance
const PRODUCTS_PATH    = '/product/202309/products/search';
const VALID_SORT       = new Set(['gmv', 'orders', 'units_sold', 'click_through_rate']);

// ── HMAC sign: secret + path + sorted(urlParams except sign/access_token) + body + secret ──
const buildSign = (appSecret, path, urlParams, body = '') => {
  const keys = Object.keys(urlParams).filter(k => k !== 'sign' && k !== 'access_token').sort();
  const paramStr = keys.map(k => `${k}${urlParams[k]}`).join('');
  return crypto.createHmac('sha256', appSecret).update(`${appSecret}${path}${paramStr}${body}${appSecret}`).digest('hex');
};

const toIso = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? new Date(n * 1000).toISOString() : null; };
const num = (v) => { if (v && typeof v === 'object') return Number(v.amount ?? v.value ?? 0) || 0; return Number(v) || 0; };

const addDays = (ymd, n) => {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
};

const fetchText = async (url, opts = {}, ms = 12000) => {
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal });
    clearTimeout(tid);
    return await res.text();
  } catch (e) { clearTimeout(tid); return JSON.stringify({ code: -1, message: `Fetch error: ${e.message}` }); }
};

// ── Refresh an expired analytics token in place ──────────────────────────────
const refreshToken = async ({ appKey, appSecret, conn, supabase, table }) => {
  if (!conn.refresh_token) return false;
  const u = new URL(`${TIKTOK_AUTH_BASE}/api/v2/token/refresh`);
  u.searchParams.set('app_key', appKey);
  u.searchParams.set('app_secret', appSecret);
  u.searchParams.set('refresh_token', conn.refresh_token);
  u.searchParams.set('grant_type', 'refresh_token');
  let payload;
  try { payload = JSON.parse(await fetchText(u.toString(), {}, 8000)); } catch { return false; }
  const d = payload?.data;
  if (payload?.code !== 0 || !d?.access_token) return false;
  conn.access_token = d.access_token;
  if (d.refresh_token) conn.refresh_token = d.refresh_token;
  try {
    await supabase.from(table).update({
      access_token: d.access_token,
      refresh_token: d.refresh_token || conn.refresh_token,
      access_token_expires_at: toIso(d.access_token_expire_in),
    }).eq('shop_id', conn.shop_id);
  } catch { /* best-effort write-back */ }
  return true;
};

// ── Call product-performance; auto-refresh + retry once on expiry ─────────────
const fetchProductPerformance = async (ctx) => {
  const { appKey, appSecret, conn, supabase, table, startDate, endDateLt, sortField, sortOrder, pageSize, pageToken } = ctx;
  const path = `/analytics/${PERF_VERSION}/shop_products/performance`;

  const doCall = () => {
    const urlParams = {
      app_key: appKey,
      timestamp: String(Math.floor(Date.now() / 1000)),
      start_date_ge: startDate,
      end_date_lt: endDateLt,
      sort_field: sortField,
      sort_order: sortOrder,
      page_size: String(pageSize),
      currency: 'LOCAL',
    };
    if (conn.shop_cipher) urlParams.shop_cipher = conn.shop_cipher;
    if (pageToken) urlParams.page_token = pageToken;
    urlParams.sign = buildSign(appSecret, path, urlParams);
    const url = `${TIKTOK_BASE}${path}?${new URLSearchParams(urlParams)}`;
    return fetchText(url, { method: 'GET', headers: { 'x-tts-access-token': conn.access_token, 'content-type': 'application/json' } });
  };

  let raw = await doCall();
  let json; try { json = JSON.parse(raw); } catch { json = { code: -1, message: 'parse error' }; }
  if (json?.code === 105002) { // expired → refresh once and retry
    if (await refreshToken({ appKey, appSecret, conn, supabase, table })) {
      raw = await doCall();
      try { json = JSON.parse(raw); } catch { json = { code: -1, message: 'parse error' }; }
    }
  }
  // Product ids are 64-bit — preserve full precision by stringifying before JSON.parse loses it
  let safe; try { safe = JSON.parse(raw.replace(/"id"\s*:\s*(\d{16,})/g, '"id":"$1"')); } catch { safe = json; }
  return { json: safe, code: json?.code, message: json?.message };
};

// ── Build a product id → { name, status, stock } map from the Product API ────
const fetchProductMeta = async ({ appKey, appSecret, conn }) => {
  const map = {};
  let pageToken = null, pages = 0;
  const deadline = Date.now() + 5500;
  do {
    const ts = String(Math.floor(Date.now() / 1000));
    const bodyStr = JSON.stringify({ page_size: 100 });
    const urlParams = { app_key: appKey, timestamp: ts, page_size: '100' };
    if (conn.shop_cipher) urlParams.shop_cipher = conn.shop_cipher;
    if (pageToken) urlParams.page_token = pageToken;
    urlParams.sign = buildSign(appSecret, PRODUCTS_PATH, urlParams, bodyStr);
    const url = `${TIKTOK_BASE}${PRODUCTS_PATH}?${new URLSearchParams(urlParams)}`;
    let json;
    try { json = JSON.parse(await fetchText(url, { method: 'POST', headers: { 'x-tts-access-token': conn.access_token, 'content-type': 'application/json' }, body: bodyStr })); }
    catch { break; }
    if (json?.code !== 0) break;
    for (const p of (json?.data?.products || [])) {
      const id = String(p.id ?? p.product_id ?? '');
      if (!id) continue;
      const stock = (p.skus || []).reduce((s, sku) => s + (sku.inventory || []).reduce((a, inv) => a + (Number(inv.quantity) || 0), 0), 0);
      map[id] = { name: p.title || '', status: p.status || '', stock };
    }
    pageToken = json?.data?.next_page_token || null;
    pages++;
  } while (pageToken && pages < 6 && Date.now() < deadline);
  return map;
};

// ── Load connections (analytics app preferred; fallback to orders app) ────────
const loadConnections = async (supabase) => {
  const a = await supabase.from('tiktok_analytics_connections')
    .select('access_token, refresh_token, shop_cipher, shop_id, seller_name')
    .not('access_token', 'is', null);
  if (a.data?.length) return { rows: a.data, table: 'tiktok_analytics_connections' };
  const o = await supabase.from('tiktok_shop_connections')
    .select('access_token, refresh_token, shop_cipher, shop_id, seller_name')
    .not('access_token', 'is', null).not('shop_cipher', 'is', null);
  return { rows: o.data || [], table: 'tiktok_shop_connections' };
};

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(200).json({ ok: false, error: 'Method not allowed' });
  }

  const appKey    = (process.env.TIKTOK_ANALYTICS_APP_KEY    || process.env.TIKTOK_SHOP_APP_KEY)?.trim();
  const appSecret = (process.env.TIKTOK_ANALYTICS_APP_SECRET || process.env.TIKTOK_SHOP_APP_SECRET)?.trim();
  const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL)?.trim();
  const supabaseKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY)?.trim();
  if (!appKey || !appSecret || !supabaseUrl || !supabaseKey) {
    return res.status(200).json({ ok: false, error: 'Missing env config' });
  }
  const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const params = { ...req.query, ...(req.body || {}) };
  const action = params.action || 'products';

  try {
    const { rows: conns, table } = await loadConnections(supabase);

    if (action === 'shops') {
      const seen = new Set(); const shops = [];
      for (const c of conns) {
        const id = String(c.shop_id);
        if (seen.has(id)) continue;
        seen.add(id);
        shops.push({ shop_id: id, seller_name: c.seller_name || `Shop ${id}` });
      }
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

    const endDateLt = addDays(endDate, 1); // API end_date_lt is exclusive

    const perf = await fetchProductPerformance({
      appKey, appSecret, conn, supabase, table,
      startDate, endDateLt, sortField, sortOrder, pageSize, pageToken,
    });

    if (perf.code !== 0) {
      return res.status(200).json({ ok: false, error: perf.message || `TikTok code ${perf.code}`, code: perf.code });
    }

    const data = perf.json?.data || {};
    const rawList = Array.isArray(data.products) ? data.products : [];

    // Enrich name / status / stock (best-effort; tolerate Product API failure)
    let meta = {};
    try { meta = await fetchProductMeta({ appKey, appSecret, conn }); } catch { /* names optional */ }

    const products = rawList.map(p => {
      const id = String(p.id ?? '');
      const m = meta[id] || {};
      return {
        product_id: id,
        product_name: m.name || `SP ${id}`,
        status: m.status || '',
        stock: m.stock ?? null,
        gmv: num(p.gmv),
        currency: (p.gmv && typeof p.gmv === 'object' && p.gmv.currency) || 'VND',
        units_sold: num(p.units_sold),
        orders: num(p.orders),
        click_through_rate: num(p.click_through_rate),
      };
    });

    return res.status(200).json({
      ok: true,
      shop_id: String(conn.shop_id),
      seller_name: conn.seller_name,
      sort_field: sortField,
      sort_order: sortOrder,
      count: products.length,
      total: data.total_count ?? null,
      next_page_token: data.next_page_token || null,
      latest_available_date: data.latest_available_date || null,
      products,
    });
  } catch (err) {
    return res.status(200).json({ ok: false, error: err.message || 'Internal error' });
  }
}
