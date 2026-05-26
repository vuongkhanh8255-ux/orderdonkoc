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

/** 1. List Top Picks collections */
async function handleList(supabase, shopId) {
  const creds = await getCredentials(supabase, shopId, 'marketing');

  const result = await shopeeGet(
    creds.partnerKey, creds.partnerId,
    '/api/v2/top_picks/get_top_picks_list',
    creds.accessToken, creds.shopId,
  );

  console.log('[TopPicks List] result:', JSON.stringify(result).slice(0, 500));

  if (result.error) return { ok: false, error: result.error, message: result.message };
  return { ok: true, data: result.response };
}

/** 2. Create a Top Picks collection */
async function handleCreate(supabase, shopId, body) {
  const { name, item_id_list, is_activated } = body || {};
  if (!name) return { ok: false, error: 'Missing name in request body' };
  if (!item_id_list || !Array.isArray(item_id_list) || item_id_list.length === 0) {
    return { ok: false, error: 'Missing or empty item_id_list in request body' };
  }

  const creds = await getCredentials(supabase, shopId, 'marketing');

  const result = await shopeePost(
    creds.partnerKey, creds.partnerId,
    '/api/v2/top_picks/add_top_picks',
    creds.accessToken, creds.shopId,
    { name, item_id_list, is_activated: is_activated ?? true },
  );

  console.log('[TopPicks Create] name:', name, 'items:', item_id_list.length, 'result:', JSON.stringify(result).slice(0, 500));

  if (result.error) return { ok: false, error: result.error, message: result.message, detail: result };
  return { ok: true, data: result.response };
}

/** 3. Update a Top Picks collection */
async function handleUpdate(supabase, shopId, body) {
  const { top_picks_id, name, item_id_list, is_activated } = body || {};
  if (!top_picks_id) return { ok: false, error: 'Missing top_picks_id in request body' };

  const creds = await getCredentials(supabase, shopId, 'marketing');

  const updateBody = { top_picks_id: Number(top_picks_id) };
  if (name !== undefined) updateBody.name = name;
  if (item_id_list !== undefined) updateBody.item_id_list = item_id_list;
  if (is_activated !== undefined) updateBody.is_activated = is_activated;

  const result = await shopeePost(
    creds.partnerKey, creds.partnerId,
    '/api/v2/top_picks/update_top_picks',
    creds.accessToken, creds.shopId,
    updateBody,
  );

  console.log('[TopPicks Update] top_picks_id:', top_picks_id, 'result:', JSON.stringify(result).slice(0, 500));

  if (result.error) return { ok: false, error: result.error, message: result.message, detail: result };
  return { ok: true, data: result.response };
}

/** 4. Delete a Top Picks collection */
async function handleDelete(supabase, shopId, body) {
  const { top_picks_id } = body || {};
  if (!top_picks_id) return { ok: false, error: 'Missing top_picks_id in request body' };

  const creds = await getCredentials(supabase, shopId, 'marketing');

  const result = await shopeePost(
    creds.partnerKey, creds.partnerId,
    '/api/v2/top_picks/delete_top_picks',
    creds.accessToken, creds.shopId,
    { top_picks_id: Number(top_picks_id) },
  );

  console.log('[TopPicks Delete] top_picks_id:', top_picks_id, 'result:', JSON.stringify(result).slice(0, 500));

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
      available: ['list', 'create', 'update', 'delete'],
    });
  }

  const supabase = getSupabase();
  if (!supabase) {
    return res.status(500).json({ ok: false, error: 'Supabase not configured on server' });
  }

  try {
    let result;

    switch (action) {
      case 'list':
        result = await handleList(supabase, shopId);
        break;
      case 'create':
        if (req.method !== 'POST') return res.status(200).json({ ok: false, error: 'POST required for create' });
        result = await handleCreate(supabase, shopId, req.body);
        break;
      case 'update':
        if (req.method !== 'POST') return res.status(200).json({ ok: false, error: 'POST required for update' });
        result = await handleUpdate(supabase, shopId, req.body);
        break;
      case 'delete':
        if (req.method !== 'POST') return res.status(200).json({ ok: false, error: 'POST required for delete' });
        result = await handleDelete(supabase, shopId, req.body);
        break;
      default:
        return res.status(200).json({
          ok: false,
          error: `Unknown action: ${action}`,
          available: ['list', 'create', 'update', 'delete'],
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
