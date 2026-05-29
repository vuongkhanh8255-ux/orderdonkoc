import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const HOST = 'https://partner.shopeemobile.com';
const DEFAULT_SHOP_ID = 341325550;

/* ── Recurring auto-boost config ────────────────────────────────────────── */
const DEFAULT_INTERVAL_HOURS = 4;            // Shopee boost lasts 4h
const BOOST_BATCH_SIZE = 5;                  // Shopee max 5 items per boost
const DUE_GRACE_MS = 5 * 60 * 1000;          // 5-min grace so a cron firing exactly on the boundary still counts as "due"

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

/** Core boost call — push up to 5 items to top of search results (4h duration). Reused by manual boost + auto-boost. */
async function boostItems(supabase, shopId, itemIds) {
  const ids = (Array.isArray(itemIds) ? itemIds : []).map(Number).filter(Boolean);
  if (ids.length === 0) return { ok: false, error: 'Danh sách sản phẩm trống' };
  if (ids.length > BOOST_BATCH_SIZE) {
    return { ok: false, error: 'Shopee chỉ cho phép đẩy tối đa 5 sản phẩm cùng lúc' };
  }

  // Boost uses dashboard app (product API), not marketing
  const creds = await getCredentials(supabase, shopId, 'dashboard');

  const result = await shopeePost(
    creds.partnerKey, creds.partnerId,
    '/api/v2/product/boost_item',
    creds.accessToken, creds.shopId,
    { item_id_list: ids },
  );

  if (result.error) return { ok: false, error: result.error, message: result.message, detail: result };
  return { ok: true, data: result.response };
}

/** 5. Boost items — push to top of search results (max 5 items, 4h duration) */
async function handleBoost(supabase, shopId, body) {
  const { item_id_list } = body || {};
  if (!item_id_list || !Array.isArray(item_id_list) || item_id_list.length === 0) {
    return { ok: false, error: 'Missing or empty item_id_list in request body' };
  }
  const result = await boostItems(supabase, shopId, item_id_list);
  console.log('[Boost] items:', item_id_list, 'result:', JSON.stringify(result).slice(0, 500));
  return result;
}

/** 6. Get currently boosted items */
async function handleBoostedList(supabase, shopId) {
  // Boosted list uses dashboard app (product API)
  const creds = await getCredentials(supabase, shopId, 'dashboard');

  const result = await shopeeGet(
    creds.partnerKey, creds.partnerId,
    '/api/v2/product/get_boosted_list',
    creds.accessToken, creds.shopId,
  );

  console.log('[Boosted List] result:', JSON.stringify(result).slice(0, 500));

  if (result.error) return { ok: false, error: result.error, message: result.message };
  return { ok: true, data: result.response };
}

/* ═══════════════════════════════════════════════════════════════════════════
   Recurring auto-boost (Đẩy định kỳ)
   ═══════════════════════════════════════════════════════════════════════════ */

/** Load the schedule config row for a shop (or null) */
async function loadSchedule(supabase, shopId) {
  const { data, error } = await supabase
    .from('shopee_boost_schedule')
    .select('*')
    .eq('shop_id', String(shopId))
    .maybeSingle();
  if (error) throw new Error(`DB error loading schedule: ${error.message}`);
  return data || null;
}

/** Compute the next scheduled run time (ISO) from last_run_at + interval */
function computeNextRun(schedule) {
  if (!schedule || !schedule.last_run_at) return null;
  const interval = (schedule.interval_hours || DEFAULT_INTERVAL_HOURS) * 3600 * 1000;
  return new Date(new Date(schedule.last_run_at).getTime() + interval).toISOString();
}

/** Select up to BOOST_BATCH_SIZE item_ids starting at rotationIndex, wrapping around the list */
function selectBatch(itemIds, rotationIndex, batchSize = BOOST_BATCH_SIZE) {
  const n = itemIds.length;
  if (n === 0) return [];
  const take = Math.min(batchSize, n);
  const batch = [];
  for (let i = 0; i < take; i++) batch.push(itemIds[(rotationIndex + i) % n]);
  return batch;
}

/** 7. schedule_get — return the schedule config (with computed next_run_at) */
async function handleScheduleGet(supabase, shopId) {
  const schedule = await loadSchedule(supabase, shopId);
  if (!schedule) {
    return {
      ok: true,
      data: {
        exists: false, enabled: false, item_ids: [], items_meta: [],
        interval_hours: DEFAULT_INTERVAL_HOURS, rotation_index: 0,
        last_run_at: null, next_run_at: null,
      },
    };
  }
  return { ok: true, data: { exists: true, ...schedule, next_run_at: computeNextRun(schedule) } };
}

/** 8. schedule_save — upsert config (enabled, item_ids, items_meta, interval_hours) */
async function handleScheduleSave(supabase, shopId, body) {
  const { enabled, item_ids, items_meta, interval_hours } = body || {};
  const ids = Array.isArray(item_ids) ? item_ids.map(Number).filter(Boolean) : [];
  const meta = Array.isArray(items_meta) ? items_meta : [];
  const interval = Number(interval_hours) > 0 ? Number(interval_hours) : DEFAULT_INTERVAL_HOURS;

  const existing = await loadSchedule(supabase, shopId);
  const payload = {
    shop_id: String(shopId),
    enabled: !!enabled,
    item_ids: ids,
    items_meta: meta,
    interval_hours: interval,
    updated_at: new Date().toISOString(),
  };

  let result;
  if (existing) {
    // Keep rotation in range if the item list shrank
    payload.rotation_index = (existing.rotation_index >= ids.length) ? 0 : existing.rotation_index;
    const { data, error } = await supabase
      .from('shopee_boost_schedule')
      .update(payload).eq('id', existing.id).select().maybeSingle();
    if (error) return { ok: false, error: error.message };
    result = data;
  } else {
    payload.rotation_index = 0;
    const { data, error } = await supabase
      .from('shopee_boost_schedule')
      .insert(payload).select().maybeSingle();
    if (error) return { ok: false, error: error.message };
    result = data;
  }
  return { ok: true, data: { ...result, next_run_at: computeNextRun(result) } };
}

/** Core recurring-boost run. source: 'cron' | 'frontend' | 'manual' */
async function runAutoBoost(supabase, shopId, { source = 'cron', force = false } = {}) {
  const schedule = await loadSchedule(supabase, shopId);
  if (!schedule) return { ok: true, skipped: true, reason: 'no_schedule', message: 'Chưa cấu hình lịch đẩy' };
  if (!schedule.enabled) return { ok: true, skipped: true, reason: 'disabled', message: 'Lịch đẩy đang TẮT' };

  const itemIds = Array.isArray(schedule.item_ids) ? schedule.item_ids.map(Number).filter(Boolean) : [];
  if (itemIds.length === 0) return { ok: true, skipped: true, reason: 'no_items', message: 'Chưa chọn sản phẩm nào' };

  // Due check (skip when not yet due, unless forced)
  const interval = (schedule.interval_hours || DEFAULT_INTERVAL_HOURS) * 3600 * 1000;
  const lastRun = schedule.last_run_at ? new Date(schedule.last_run_at).getTime() : 0;
  const due = !lastRun || (Date.now() - lastRun) >= (interval - DUE_GRACE_MS);
  if (!due && !force) {
    return {
      ok: true, skipped: true, reason: 'not_due',
      message: 'Chưa tới giờ đẩy',
      next_run_at: new Date(lastRun + interval).toISOString(),
    };
  }

  // Select next batch & boost
  const rotationIndex = schedule.rotation_index || 0;
  const batch = selectBatch(itemIds, rotationIndex, BOOST_BATCH_SIZE);
  let boostResult;
  try {
    boostResult = await boostItems(supabase, shopId, batch);
  } catch (e) {
    boostResult = { ok: false, error: e.message };
  }

  // Parse success/fail
  let successCount = 0, failCount = 0, status = 'ok', message = '';
  if (boostResult.ok) {
    failCount = boostResult.data?.failure_count || (boostResult.data?.failure_list?.length || 0);
    successCount = Math.max(0, batch.length - failCount);
    if (failCount > 0) {
      status = successCount > 0 ? 'partial' : 'error';
      const failures = boostResult.data?.failure_list || [];
      const detail = failures.map(f => `${f.item_id}:${f.failed_reason || '?'}`).join(', ');
      message = `Đẩy ${successCount}/${batch.length} SP${detail ? ' — lỗi: ' + detail : ''}`;
    } else {
      status = 'ok';
      message = `Đã đẩy ${batch.length} sản phẩm lên top (hiệu lực 4h)`;
    }
  } else {
    status = 'error';
    failCount = batch.length;
    message = boostResult.message || boostResult.error || 'Lỗi đẩy sản phẩm';
  }

  // Advance rotation + stamp last_run_at (always, when attempted — prevents retry spam; cron retries next cycle)
  const newRotation = itemIds.length > 0 ? (rotationIndex + batch.length) % itemIds.length : 0;
  await supabase
    .from('shopee_boost_schedule')
    .update({ rotation_index: newRotation, last_run_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', schedule.id);

  // Write log
  await supabase.from('shopee_boost_log').insert({
    shop_id: String(shopId), source, item_ids: batch,
    success_count: successCount, fail_count: failCount, status, message,
  });

  console.log('[AutoBoost]', source, 'batch:', batch, 'status:', status, message);

  return {
    ok: true, ran: true, status, message,
    success_count: successCount, fail_count: failCount,
    item_ids: batch, next_rotation_index: newRotation,
    next_run_at: new Date(Date.now() + interval).toISOString(),
  };
}

/** 9. boost_log — recent run history */
async function handleBoostLog(supabase, shopId, limit = 20) {
  const { data, error } = await supabase
    .from('shopee_boost_log')
    .select('*')
    .eq('shop_id', String(shopId))
    .order('ran_at', { ascending: false })
    .limit(Math.min(Number(limit) || 20, 100));
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data || [] };
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
      available: ['list', 'create', 'update', 'delete', 'boost', 'boosted_list', 'schedule_get', 'schedule_save', 'auto_boost', 'boost_log'],
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
      case 'boost':
        if (req.method !== 'POST') return res.status(200).json({ ok: false, error: 'POST required for boost' });
        result = await handleBoost(supabase, shopId, req.body);
        break;
      case 'boosted_list':
        result = await handleBoostedList(supabase, shopId);
        break;
      case 'schedule_get':
        result = await handleScheduleGet(supabase, shopId);
        break;
      case 'schedule_save':
        if (req.method !== 'POST') return res.status(200).json({ ok: false, error: 'POST required for schedule_save' });
        result = await handleScheduleSave(supabase, shopId, req.body);
        break;
      case 'boost_log':
        result = await handleBoostLog(supabase, shopId, reqUrl.searchParams.get('limit'));
        break;
      case 'auto_boost': {
        // Recurring boost trigger. Used by GitHub Actions cron (24/7) and the frontend countdown.
        // Due-gated so it never over-boosts. `force` (skip the timer) is honored only with a valid
        // secret or when explicitly invoked from the frontend "test now" button.
        const secret = (process.env.BOOST_CRON_SECRET || '').trim();
        const providedSecret = (req.headers['x-boost-secret'] || reqUrl.searchParams.get('secret') || '').toString().trim();
        const source = reqUrl.searchParams.get('source') || 'cron';
        const hasValidSecret = !!secret && providedSecret === secret;
        const force = reqUrl.searchParams.get('force') === '1' && (hasValidSecret || source === 'frontend');
        result = await runAutoBoost(supabase, shopId, { source, force });
        break;
      }
      default:
        return res.status(200).json({
          ok: false,
          error: `Unknown action: ${action}`,
          available: ['list', 'create', 'update', 'delete', 'boost', 'boosted_list', 'schedule_get', 'schedule_save', 'auto_boost', 'boost_log'],
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
