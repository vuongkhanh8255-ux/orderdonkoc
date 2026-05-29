import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const HOST = 'https://partner.shopeemobile.com';
const DEFAULT_SHOP_ID = 341325550;

/* ── Multi-app config ───────────────────────────────────────────────────── */
const APPS = {
  dashboard: { id: 2035068, envKey: 'SHOPEE_PARTNER_KEY' },
  marketing: { id: 2035171, envKey: 'SHOPEE_MARKETING_PARTNER_KEY' },
  ads: { id: 2035170, envKey: 'SHOPEE_ADS_PARTNER_KEY' },
};

/* ── CORS headers ───────────────────────────────────────────────────────── */
function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

/* ── Shopee sign helper ─────────────────────────────────────────────────── */
function makeSign(partnerKey, partnerId, path, ts, accessToken = '', shopId = 0) {
  let base = partnerId.toString() + path + ts.toString();
  if (accessToken) base += accessToken;
  if (shopId) base += shopId.toString();
  return crypto.createHmac('sha256', partnerKey).update(base).digest('hex');
}

/* ── Supabase client ────────────────────────────────────────────────────── */
function getSupabase() {
  const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL)?.trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY)?.trim();
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/* ── Load token from Supabase ───────────────────────────────────────────── */
async function loadToken(supabase, shopId, appType) {
  const { data, error } = await supabase
    .from('shopee_tokens')
    .select('*')
    .eq('shop_id', String(shopId))
    .eq('app_type', appType)
    .maybeSingle();
  if (error) throw new Error(`DB error loading ${appType} token: ${error.message}`);
  if (!data) throw new Error(`No ${appType} token found for shop ${shopId}. Please connect via OAuth first.`);
  return data;
}

/* ── Refresh expired token ──────────────────────────────────────────────── */
async function refreshIfNeeded(supabase, tokenRow, app) {
  const expiresAt = new Date(tokenRow.token_expires).getTime();
  // Refresh if token expires within 5 minutes
  if (Date.now() < expiresAt - 5 * 60 * 1000) return tokenRow;

  const partnerKey = process.env[app.envKey]?.trim();
  if (!partnerKey) throw new Error(`${app.envKey} not configured`);

  const path = '/api/v2/auth/access_token/get';
  const ts = Math.floor(Date.now() / 1000);
  const sign = makeSign(partnerKey, app.id, path, ts);
  const url = `${HOST}${path}?partner_id=${app.id}&timestamp=${ts}&sign=${sign}`;

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      shop_id: Number(tokenRow.shop_id),
      refresh_token: tokenRow.refresh_token,
      partner_id: app.id,
    }),
  });
  const result = await resp.json();

  if (result.error || !result.access_token) {
    throw new Error(`Token refresh failed: ${result.error || 'unknown'} — ${result.message || ''}`);
  }

  // Update in DB
  const updated = {
    access_token: result.access_token,
    refresh_token: result.refresh_token,
    token_expires: new Date(Date.now() + (result.expire_in || 14400) * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  };

  await supabase
    .from('shopee_tokens')
    .update(updated)
    .eq('id', tokenRow.id);

  return { ...tokenRow, ...updated };
}

/* ── Shopee API caller (GET) ────────────────────────────────────────────── */
async function shopeeGet(partnerKey, partnerId, apiPath, accessToken, shopId, extraParams = {}) {
  const ts = Math.floor(Date.now() / 1000);
  const sign = makeSign(partnerKey, partnerId, apiPath, ts, accessToken, Number(shopId));

  const params = new URLSearchParams({
    partner_id: partnerId.toString(),
    timestamp: ts.toString(),
    sign,
    access_token: accessToken,
    shop_id: shopId.toString(),
    ...extraParams,
  });

  const url = `${HOST}${apiPath}?${params.toString()}`;
  const resp = await fetch(url);
  return resp.json();
}

/* ── Shopee API caller (POST) ───────────────────────────────────────────── */
async function shopeePost(partnerKey, partnerId, apiPath, accessToken, shopId, body = {}) {
  const ts = Math.floor(Date.now() / 1000);
  const sign = makeSign(partnerKey, partnerId, apiPath, ts, accessToken, Number(shopId));

  const params = new URLSearchParams({
    partner_id: partnerId.toString(),
    timestamp: ts.toString(),
    sign,
    access_token: accessToken,
    shop_id: shopId.toString(),
  });

  const url = `${HOST}${apiPath}?${params.toString()}`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return resp.json();
}

/* ── Get credentials for an app type ────────────────────────────────────── */
async function getCredentials(supabase, shopId, appType) {
  const app = APPS[appType];
  if (!app) throw new Error(`Unknown app type: ${appType}`);

  const partnerKey = process.env[app.envKey]?.trim();
  if (!partnerKey) throw new Error(`${app.envKey} not configured on server`);

  let tokenRow = await loadToken(supabase, shopId, appType);
  tokenRow = await refreshIfNeeded(supabase, tokenRow, app);

  return { partnerKey, partnerId: app.id, accessToken: tokenRow.access_token, shopId };
}

/* ═══════════════════════════════════════════════════════════════════════════
   Shopee Ads (CPC) — merged here to stay within the 12-function Hobby limit.
   Exposed via action=ads&mode=summary|campaigns&days=N (multi-shop).
   ═══════════════════════════════════════════════════════════════════════════ */

/* Shopee Ads daily-performance API wants dates as DD-MM-YYYY */
function toShopeeDate(d) {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}-${mm}-${d.getFullYear()}`;
}

function adsNum(v) {
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return Number.isFinite(n) ? n : 0;
}

/* Normalize one daily row to a stable shape, tolerating field-name drift across regions */
function normalizeDaily(row) {
  const impression = adsNum(row.impression ?? row.impressions);
  const clicks = adsNum(row.clicks ?? row.click);
  const expense = adsNum(row.expense ?? row.cost);
  const gmv = adsNum(row.broad_gmv ?? row.gmv ?? row.broad_order_amount);
  const orders = adsNum(row.broad_order ?? row.broad_order_count ?? row.order ?? row.checkout);
  return {
    date: row.date || row.performance_date || '',
    impression, clicks, expense, gmv, orders,
    ctr: impression > 0 ? clicks / impression : adsNum(row.ctr),
    cpc: clicks > 0 ? expense / clicks : adsNum(row.cpc),
    roas: expense > 0 ? gmv / expense : adsNum(row.broad_roi ?? row.roi),
    raw: row,
  };
}

function sumAdsTotals(daily) {
  const t = { impression: 0, clicks: 0, expense: 0, gmv: 0, orders: 0 };
  for (const d of daily) {
    t.impression += d.impression; t.clicks += d.clicks;
    t.expense += d.expense; t.gmv += d.gmv; t.orders += d.orders;
  }
  t.ctr = t.impression > 0 ? t.clicks / t.impression : 0;
  t.cpc = t.clicks > 0 ? t.expense / t.clicks : 0;
  t.roas = t.expense > 0 ? t.gmv / t.expense : 0;
  return t;
}

/* Per-campaign breakdown (optional, mode=campaigns) */
async function fetchAdsCampaigns(partnerKey, partnerId, accessToken, shopId, startDate, endDate) {
  const idRes = await shopeeGet(partnerKey, partnerId,
    '/api/v2/ads/get_product_level_campaign_id_list',
    accessToken, shopId, { ad_type: 'all', offset: 0, limit: 50 });

  const idList = (idRes.response?.campaign_list || idRes.response?.campaign_id_list || [])
    .map((c) => (typeof c === 'object' ? c.campaign_id : c))
    .filter(Boolean);

  if (idList.length === 0) return { campaigns: [], note: idRes.error || 'no_campaigns' };

  const perfRes = await shopeeGet(partnerKey, partnerId,
    '/api/v2/ads/get_product_campaign_daily_performance',
    accessToken, shopId, { start_date: startDate, end_date: endDate, campaign_id_list: idList.join(',') });

  const list = perfRes.response?.campaign_list || perfRes.response?.performance_list || [];
  const campaigns = list.map((c) => {
    const rows = (c.ads_daily_performance || c.performance_list || c.daily_performance_list || []).map(normalizeDaily);
    return {
      campaign_id: c.campaign_id,
      campaign_name: c.campaign_name || c.ad_name || `#${c.campaign_id}`,
      totals: sumAdsTotals(rows),
      daily: rows,
    };
  }).sort((a, b) => b.totals.expense - a.totals.expense);

  return { campaigns, note: perfRes.error || null };
}

/* Per-shop fetch: balance + toggle + daily performance (+campaigns) */
async function fetchShopAds(supabase, tk, startDate, endDate, withCampaigns) {
  const app = APPS.ads;
  const partnerKey = process.env[app.envKey]?.trim();
  const refreshed = await refreshIfNeeded(supabase, tk, app);
  const at = refreshed.access_token;
  const sid = refreshed.shop_id;

  const [balanceRes, toggleRes, dailyRes] = await Promise.all([
    shopeeGet(partnerKey, app.id, '/api/v2/ads/get_total_balance', at, sid),
    shopeeGet(partnerKey, app.id, '/api/v2/ads/get_shop_toggle_info', at, sid),
    shopeeGet(partnerKey, app.id, '/api/v2/ads/get_all_cpc_ads_daily_performance', at, sid,
      { start_date: startDate, end_date: endDate }),
  ]);

  const balance = adsNum(balanceRes.response?.total_balance ?? balanceRes.response?.balance);
  const toggleOn = toggleRes.response?.auto_top_up_status === 'open'
    || toggleRes.response?.campaign_surface_status === 'open'
    || !!toggleRes.response;

  const rawDaily = dailyRes.response?.performance_list || dailyRes.response?.daily_performance_list || [];
  const daily = rawDaily.map(normalizeDaily).sort((a, b) => (a.date > b.date ? 1 : -1));
  const totals = sumAdsTotals(daily);

  let campaigns = null;
  if (withCampaigns) {
    campaigns = await fetchAdsCampaigns(partnerKey, app.id, at, sid, startDate, endDate).catch((e) => ({ error: e.message }));
  }

  return {
    shop_id: sid,
    shop_name: tk.shop_name || sid,
    balance, toggle_on: toggleOn, totals, daily, campaigns,
    _debug: {
      balance: balanceRes.error || balanceRes.message || null,
      daily: dailyRes.error || dailyRes.message || null,
    },
  };
}

/** action=ads — CPC summary across every shop with an active 'ads' token */
async function handleAds(supabase, reqUrl) {
  const app = APPS.ads;
  const partnerKey = process.env[app.envKey]?.trim();
  if (!partnerKey) return { success: false, error: `${app.envKey} not configured` };

  const mode = reqUrl.searchParams.get('mode') || 'summary';
  const shopId = reqUrl.searchParams.get('shop_id');
  const days = Math.min(Math.max(parseInt(reqUrl.searchParams.get('days') || '7', 10), 1), 60);

  const now = new Date();
  const start = new Date(now);
  start.setDate(start.getDate() - (days - 1));
  const startDate = reqUrl.searchParams.get('start_date') || toShopeeDate(start);
  const endDate = reqUrl.searchParams.get('end_date') || toShopeeDate(now);
  const withCampaigns = mode === 'campaigns';

  let query = supabase.from('shopee_tokens').select('*').eq('app_type', 'ads').eq('status', 'active');
  if (shopId) query = query.eq('shop_id', shopId);
  const { data: tokens, error: dbErr } = await query;
  if (dbErr) return { success: false, error: `DB error: ${dbErr.message}` };
  if (!tokens?.length) {
    return { success: true, shops: [], message: 'Chưa shop nào kết nối app Ads. Cấp quyền tại /api/shopee/auth?app=ads' };
  }

  const shops = await Promise.all(tokens.map(async (tk) => {
    try {
      return await fetchShopAds(supabase, tk, startDate, endDate, withCampaigns);
    } catch (err) {
      return { shop_id: tk.shop_id, shop_name: tk.shop_name || tk.shop_id, error: err.message };
    }
  }));

  return { success: true, start_date: startDate, end_date: endDate, days, shops };
}

/* ═══════════════════════════════════════════════════════════════════════════
   Action handlers
   ═══════════════════════════════════════════════════════════════════════════ */

/** 1. Get available Flash Sale time slots */
async function handleTimeSlots(supabase, shopId) {
  const creds = await getCredentials(supabase, shopId, 'marketing');
  // Shopee requires start_time >= now — add 5min buffer to avoid clock-skew/race condition
  const now = Math.floor(Date.now() / 1000);
  const startTime = now + 300; // 5 minutes from now to be safe

  // Try correct endpoint name first
  let result = await shopeeGet(
    creds.partnerKey, creds.partnerId,
    '/api/v2/shop_flash_sale/get_time_slot_id',
    creds.accessToken, creds.shopId,
    { start_time: startTime, end_time: startTime + 30 * 86400 },
  );

  console.log('[FS TimeSlots] start_time:', startTime, 'result:', JSON.stringify(result).slice(0, 500));

  // If param error, also return useful message
  if (result.error) return { ok: false, error: result.error, message: result.message || 'Lỗi lấy khung giờ' };
  return { ok: true, data: result.response };
}

/** 2. Get product list with details */
async function handleProducts(supabase, shopId, params) {
  const offset = params.offset || '0';
  const pageSize = params.page_size || '20';

  const creds = await getCredentials(supabase, shopId, 'dashboard');

  // Step 1: Get item IDs
  const listResult = await shopeeGet(
    creds.partnerKey, creds.partnerId,
    '/api/v2/product/get_item_list',
    creds.accessToken, creds.shopId,
    { offset, page_size: pageSize, item_status: 'NORMAL' },
  );

  if (listResult.error) return { ok: false, error: listResult.error, message: listResult.message };

  const items = listResult.response?.item || [];
  if (items.length === 0) {
    return {
      ok: true,
      data: {
        items: [],
        total: listResult.response?.total_count || 0,
        has_next: listResult.response?.has_next_page || false,
      },
    };
  }

  // Step 2: Get base info for all items
  const itemIds = items.map((i) => i.item_id).join(',');
  const infoResult = await shopeeGet(
    creds.partnerKey, creds.partnerId,
    '/api/v2/product/get_item_base_info',
    creds.accessToken, creds.shopId,
    { item_id_list: itemIds },
  );

  if (infoResult.error) return { ok: false, error: infoResult.error, message: infoResult.message };

  return {
    ok: true,
    data: {
      items: infoResult.response?.item_list || [],
      total: listResult.response?.total_count || 0,
      has_next: listResult.response?.has_next_page || false,
    },
  };
}

/** 3. Get product models/variants */
async function handleProductModels(supabase, shopId, params) {
  const itemId = params.item_id;
  if (!itemId) return { ok: false, error: 'Missing item_id parameter' };

  const creds = await getCredentials(supabase, shopId, 'dashboard');
  const result = await shopeeGet(
    creds.partnerKey, creds.partnerId,
    '/api/v2/product/get_model_list',
    creds.accessToken, creds.shopId,
    { item_id: itemId },
  );

  if (result.error) return { ok: false, error: result.error, message: result.message };
  return { ok: true, data: result.response };
}

/** 4. Create a Flash Sale */
async function handleCreate(supabase, shopId, body) {
  const { time_slot_id } = body || {};
  if (!time_slot_id) return { ok: false, error: 'Missing time_slot_id in request body' };

  const creds = await getCredentials(supabase, shopId, 'marketing');

  // Correct Shopee v2 endpoint: create_shop_flash_sale (not add_flash_sale)
  // Body uses timeslot_id (no underscore between time/slot in some versions)
  let result = await shopeePost(
    creds.partnerKey, creds.partnerId,
    '/api/v2/shop_flash_sale/create_shop_flash_sale',
    creds.accessToken, creds.shopId,
    { timeslot_id: Number(time_slot_id) },
  );

  // Fallback: try alternate endpoint names if not found
  if (result.error === 'error_not_found') {
    result = await shopeePost(
      creds.partnerKey, creds.partnerId,
      '/api/v2/shop_flash_sale/add_flash_sale',
      creds.accessToken, creds.shopId,
      { time_slot_id: Number(time_slot_id) },
    );
  }

  console.log('[FS Create] timeslot_id:', time_slot_id, 'result:', JSON.stringify(result).slice(0, 500));

  if (result.error) return { ok: false, error: result.error, message: result.message, detail: result };
  return { ok: true, data: result.response };
}

/** 5. Add items to a Flash Sale */
async function handleAddItems(supabase, shopId, body) {
  const { flash_sale_id, items } = body || {};
  if (!flash_sale_id) return { ok: false, error: 'Missing flash_sale_id in request body' };
  if (!items || !Array.isArray(items) || items.length === 0) {
    return { ok: false, error: 'Missing or empty items array in request body' };
  }

  const creds = await getCredentials(supabase, shopId, 'marketing');

  // Correct Shopee v2 endpoint: add_shop_flash_sale_items
  let result = await shopeePost(
    creds.partnerKey, creds.partnerId,
    '/api/v2/shop_flash_sale/add_shop_flash_sale_items',
    creds.accessToken, creds.shopId,
    { flash_sale_id: Number(flash_sale_id), items },
  );

  // Fallback: try alternate endpoint name
  if (result.error === 'error_not_found') {
    result = await shopeePost(
      creds.partnerKey, creds.partnerId,
      '/api/v2/shop_flash_sale/add_flash_sale_item',
      creds.accessToken, creds.shopId,
      { flash_sale_id: Number(flash_sale_id), items },
    );
  }

  console.log('[FS AddItems] flash_sale_id:', flash_sale_id, 'items:', items.length, 'result:', JSON.stringify(result).slice(0, 500));

  if (result.error) return { ok: false, error: result.error, message: result.message, detail: result };
  return { ok: true, data: result.response };
}

/** 6. List existing Flash Sales */
async function handleList(supabase, shopId) {
  const creds = await getCredentials(supabase, shopId, 'marketing');

  // Correct params: type (0=all,1=upcoming,2=ongoing,3=expired), offset, limit
  const result = await shopeeGet(
    creds.partnerKey, creds.partnerId,
    '/api/v2/shop_flash_sale/get_shop_flash_sale_list',
    creds.accessToken, creds.shopId,
    { type: 0, offset: 0, limit: 50 },
  );

  console.log('[FS List] result:', JSON.stringify(result).slice(0, 500));

  // If param error or no flash sales, return empty list
  if (result.error === 'error_not_found' || result.error === 'error_param'
      || result.error === 'shop_flash_sale_param_error') {
    return { ok: true, data: { flash_sale_list: [] } };
  }

  if (result.error) return { ok: false, error: result.error, message: result.message };
  return { ok: true, data: result.response };
}

/** 7. Delete a Flash Sale */
async function handleDelete(supabase, shopId, body) {
  const { flash_sale_id } = body || {};
  if (!flash_sale_id) return { ok: false, error: 'Missing flash_sale_id in request body' };

  const creds = await getCredentials(supabase, shopId, 'marketing');

  // Try correct endpoint name first
  let result = await shopeePost(
    creds.partnerKey, creds.partnerId,
    '/api/v2/shop_flash_sale/delete_shop_flash_sale',
    creds.accessToken, creds.shopId,
    { flash_sale_id: Number(flash_sale_id) },
  );

  if (result.error === 'error_not_found') {
    result = await shopeePost(
      creds.partnerKey, creds.partnerId,
      '/api/v2/shop_flash_sale/delete_flash_sale',
      creds.accessToken, creds.shopId,
      { flash_sale_id: Number(flash_sale_id) },
    );
  }

  if (result.error) return { ok: false, error: result.error, message: result.message };
  return { ok: true, data: result.response };
}

/* ═══════════════════════════════════════════════════════════════════════════
   Main handler
   ═══════════════════════════════════════════════════════════════════════════ */
export default async function handler(req, res) {
  setCors(res);

  // Handle preflight
  if (req.method === 'OPTIONS') return res.status(204).end();

  const reqUrl = new URL(req.url, `https://${req.headers.host || 'koc-tool.vercel.app'}`);
  const action = reqUrl.searchParams.get('action');
  const shopId = reqUrl.searchParams.get('shop_id') || DEFAULT_SHOP_ID;

  if (!action) {
    return res.status(400).json({
      ok: false,
      error: 'Missing ?action= parameter',
      available: ['ads', 'time_slots', 'products', 'product_models', 'create', 'add_items', 'list', 'delete'],
    });
  }

  const supabase = getSupabase();
  if (!supabase) {
    return res.status(500).json({ ok: false, error: 'Supabase not configured on server' });
  }

  // Collect query params for GET actions
  const params = Object.fromEntries(reqUrl.searchParams.entries());

  try {
    let result;

    switch (action) {
      case 'ads':
        result = await handleAds(supabase, reqUrl);
        break;
      case 'time_slots':
        result = await handleTimeSlots(supabase, shopId);
        break;
      case 'products':
        result = await handleProducts(supabase, shopId, params);
        break;
      case 'product_models':
        result = await handleProductModels(supabase, shopId, params);
        break;
      case 'create':
        if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'POST required for create' });
        result = await handleCreate(supabase, shopId, req.body);
        break;
      case 'add_items':
        if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'POST required for add_items' });
        result = await handleAddItems(supabase, shopId, req.body);
        break;
      case 'list':
        result = await handleList(supabase, shopId);
        break;
      case 'delete':
        if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'POST required for delete' });
        result = await handleDelete(supabase, shopId, req.body);
        break;
      default:
        return res.status(400).json({
          ok: false,
          error: `Unknown action: ${action}`,
          available: ['ads', 'time_slots', 'products', 'product_models', 'create', 'add_items', 'list', 'delete'],
        });
    }

    // Always return 200 so Cloudflare doesn't intercept with its own HTML error page.
    // The `ok` field in JSON body indicates success/failure to the frontend.
    return res.status(200).json(result);

  } catch (err) {
    // Return 200 with ok:false so Cloudflare doesn't replace response with HTML error page
    return res.status(200).json({
      ok: false,
      error: err.message || 'Internal server error',
    });
  }
}
