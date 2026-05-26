import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const HOST = 'https://partner.shopeemobile.com';
const DEFAULT_SHOP_ID = 341325550;

/* ── Multi-app config ───────────────────────────────────────────────────── */
const APPS = {
  dashboard: { id: 2035068, envKey: 'SHOPEE_PARTNER_KEY' },
  marketing: { id: 2035171, envKey: 'SHOPEE_MARKETING_PARTNER_KEY' },
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
   Action handlers
   ═══════════════════════════════════════════════════════════════════════════ */

/** 1. Get available Flash Sale time slots */
async function handleTimeSlots(supabase, shopId) {
  const creds = await getCredentials(supabase, shopId, 'marketing');
  // Shopee requires start_time/end_time — fetch next 30 days of slots
  const now = Math.floor(Date.now() / 1000);
  const result = await shopeeGet(
    creds.partnerKey, creds.partnerId,
    '/api/v2/shop_flash_sale/get_time_slot_id',
    creds.accessToken, creds.shopId,
    { start_time: now, end_time: now + 30 * 86400 },
  );
  if (result.error) return { ok: false, error: result.error, message: result.message };
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
  const result = await shopeePost(
    creds.partnerKey, creds.partnerId,
    '/api/v2/shop_flash_sale/add_flash_sale',
    creds.accessToken, creds.shopId,
    { time_slot_id: Number(time_slot_id) },
  );

  if (result.error) return { ok: false, error: result.error, message: result.message };
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
  const result = await shopeePost(
    creds.partnerKey, creds.partnerId,
    '/api/v2/shop_flash_sale/add_flash_sale_item',
    creds.accessToken, creds.shopId,
    { flash_sale_id: Number(flash_sale_id), items },
  );

  if (result.error) return { ok: false, error: result.error, message: result.message };
  return { ok: true, data: result.response };
}

/** 6. List existing Flash Sales */
async function handleList(supabase, shopId) {
  const creds = await getCredentials(supabase, shopId, 'marketing');

  // Try get_flash_sale_list first, fall back to get_flash_sale
  let result = await shopeeGet(
    creds.partnerKey, creds.partnerId,
    '/api/v2/shop_flash_sale/get_flash_sale_list',
    creds.accessToken, creds.shopId,
    { page_no: 1, page_size: 20 },
  );

  // If endpoint doesn't exist, try the alternate endpoint
  if (result.error === 'error_not_found') {
    result = await shopeeGet(
      creds.partnerKey, creds.partnerId,
      '/api/v2/shop_flash_sale/get_flash_sale',
      creds.accessToken, creds.shopId,
      { page_no: 1, page_size: 20 },
    );
  }

  // If still error_not_found or error_param, return empty list (no flash sales exist)
  if (result.error === 'error_not_found' || result.error === 'error_param') {
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
  const result = await shopeePost(
    creds.partnerKey, creds.partnerId,
    '/api/v2/shop_flash_sale/delete_flash_sale',
    creds.accessToken, creds.shopId,
    { flash_sale_id: Number(flash_sale_id) },
  );

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
      available: ['time_slots', 'products', 'product_models', 'create', 'add_items', 'list', 'delete'],
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
          available: ['time_slots', 'products', 'product_models', 'create', 'add_items', 'list', 'delete'],
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
