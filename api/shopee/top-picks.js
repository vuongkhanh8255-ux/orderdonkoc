import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const HOST = 'https://partner.shopeemobile.com';
const DEFAULT_SHOP_ID = 341325550;

/* ── Recurring auto-boost config ────────────────────────────────────────── */
const DEFAULT_INTERVAL_HOURS = 4;            // Shopee boost lasts 4h
const BOOST_BATCH_SIZE = 5;                  // Shopee max 5 items per boost
// Shopee KHÓA đẩy lại cùng SP trong 240 phút + slot bump cũ (4h) phải hết hạn trước. Mỗi shop chỉ có đúng 5 mã
// (đẩy lại y hệt mỗi vòng) nên PHẢI chờ QUÁ 240 phút — đẩy sớm dù vài giây là dính "under 240min"/"slot limit".
const DUE_BUFFER_MS = 6 * 60 * 1000;         // chỉ đẩy khi đã QUÁ interval + 6 phút (KHÔNG bao giờ đẩy sớm)
const RETRY_AFTER_MS = 30 * 60 * 1000;       // đẩy hụt (slot/cooldown) → thử lại sau ~30 phút (lượt cron kế), không chờ nguyên interval

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
  // API động: cấm cache (tránh Cloudflare/trình duyệt giữ lại lỗi/dữ liệu cũ giữa các bản deploy)
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
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

/** 12. top_sellers — best-selling products per shop (ranking from synced orders) + cover image.
 *  Ranking is computed in Postgres (RPC shopee_top_sellers) from shopee_orders — no Shopee call.
 *  Cover image + current price are fetched per shop via get_item_base_info (best-effort). */
async function handleTopSellers(supabase, params) {
  const days  = Math.min(Math.max(parseInt(params.days, 10)  || 30, 1), 365);
  const limit = Math.min(Math.max(parseInt(params.limit, 10) || 10, 1), 50);
  const shopFilter = params.shop_id ? String(params.shop_id) : null;
  // Optional exact window (YYYY-MM-DD, VN timezone). When both present it overrides `days`.
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  const startDate = dateRe.test(params.start_date || '') ? params.start_date : null;
  const endDate   = dateRe.test(params.end_date || '')   ? params.end_date   : null;

  // 1. Ranking from synced orders (DB aggregation)
  const { data: rows, error } = await supabase.rpc('shopee_top_sellers', {
    p_days: days, p_limit: limit, p_shop_id: shopFilter,
    p_start: startDate, p_end: endDate,
  });
  if (error) return { ok: false, error: error.message };

  const byShop = new Map();
  for (const r of (rows || [])) {
    const sid = String(r.shop_id);
    if (!byShop.has(sid)) byShop.set(sid, { shop_id: sid, shop_name: r.shop_name || sid, items: [] });
    byShop.get(sid).items.push({
      item_id: String(r.item_id),
      item_name: r.item_name || '',
      qty: Number(r.total_qty) || 0,
      revenue: Number(r.revenue) || 0,
      rank: Number(r.rnk) || 0,
      image: null,
      price: null,
    });
  }

  // 2. Cover image + current price via Product API (per shop, parallel, best-effort)
  await Promise.all([...byShop.values()].map(async (shop) => {
    try {
      const creds = await getCredentials(supabase, shop.shop_id, 'dashboard');
      const ids = shop.items.map(i => i.item_id).join(',');
      if (!ids) return;
      const info = await shopeeGet(
        creds.partnerKey, creds.partnerId,
        '/api/v2/product/get_item_base_info',
        creds.accessToken, creds.shopId,
        { item_id_list: ids },
      );
      const meta = new Map();
      for (const it of (info.response?.item_list || [])) {
        meta.set(String(it.item_id), {
          image: it.image?.image_url_list?.[0] || null,
          price: Array.isArray(it.price_info) && it.price_info[0]
            ? Number(it.price_info[0].current_price) : null,
        });
      }
      for (const i of shop.items) {
        const m = meta.get(i.item_id);
        if (m) { i.image = m.image; i.price = m.price; }
      }
    } catch { /* leave image/price null — ranking still works without images */ }
  }));

  return { ok: true, data: { days, limit, start_date: startDate, end_date: endDate, shops: [...byShop.values()] } };
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
  return new Date(new Date(schedule.last_run_at).getTime() + interval + DUE_BUFFER_MS).toISOString();
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
  const due = !lastRun || (Date.now() - lastRun) >= (interval + DUE_BUFFER_MS);
  if (!due && !force) {
    return {
      ok: true, skipped: true, reason: 'not_due',
      message: 'Chưa tới giờ đẩy',
      next_run_at: new Date(lastRun + interval + DUE_BUFFER_MS).toISOString(),
    };
  }

  // Select next batch & boost
  const rotationIndex = schedule.rotation_index || 0;
  const batch = selectBatch(itemIds, rotationIndex, BOOST_BATCH_SIZE);
  // RETRY khi "hết slot": cron chạy mỗi 4h = đúng thời gian boost (4h) → có phiên bắn lúc boost cũ
  // chưa kịp hết hạn (lệch vài chục giây) → Shopee báo "reached shop's bump slot limit". Chờ slot cũ
  // hết hạn rồi đẩy lại (tối đa 2 lần, mỗi lần 25s) → khoảng trống top giảm từ ~4h xuống <1 phút.
  const isSlotLimit = (r) => /slot limit|bump.*limit|boost.*limit|limit.*(boost|bump)/i.test(`${r?.error || ''} ${r?.message || ''}`);
  const SLOT_RETRY_MAX = 2, SLOT_RETRY_WAIT_MS = 25000;
  let boostResult, slotRetries = 0;
  for (let attempt = 0; ; attempt++) {
    try {
      boostResult = await boostItems(supabase, shopId, batch);
    } catch (e) {
      boostResult = { ok: false, error: e.message };
    }
    if (boostResult.ok || !isSlotLimit(boostResult) || attempt >= SLOT_RETRY_MAX) break;
    slotRetries = attempt + 1;
    await new Promise(r => setTimeout(r, SLOT_RETRY_WAIT_MS)); // chờ boost cũ hết hạn
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
  if (slotRetries > 0) message += status === 'error'
    ? ` (đã thử lại ${slotRetries} lần, slot vẫn đầy)`
    : ` (đẩy lại sau ${slotRetries} lần chờ slot)`;

  // Cập nhật lịch theo kết quả:
  //  - Đẩy ĐƯỢC (≥1 SP) → dời mốc 4h tới HIỆN TẠI + xoay vòng → lượt sau cách đủ 4h+.
  //  - Đẩy HỤT hết (slot/cooldown/lỗi) → KHÔNG dời nguyên 4h (kẻo hụt 1 lần là tắt boost suốt 4h). Đặt mốc lùi
  //    để lượt cron kế (sau ~RETRY_AFTER) do lại — lúc đó slot/cooldown đã hết. KHÔNG xoay vòng khi hụt.
  const boostedOk = successCount > 0;
  const newRotation = (boostedOk && itemIds.length > 0) ? (rotationIndex + batch.length) % itemIds.length : rotationIndex;
  const nextLastRun = boostedOk
    ? new Date()
    : new Date(Date.now() - interval - DUE_BUFFER_MS + RETRY_AFTER_MS);
  await supabase
    .from('shopee_boost_schedule')
    .update({ rotation_index: newRotation, last_run_at: nextLastRun.toISOString(), updated_at: new Date().toISOString() })
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
    next_run_at: new Date(nextLastRun.getTime() + interval + DUE_BUFFER_MS).toISOString(),
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

/** 10. list_shops — shops connected for boost (active dashboard token), for the shop selector */
async function handleListShops(supabase) {
  const { data, error } = await supabase
    .from('shopee_tokens')
    .select('shop_id, shop_name')
    .eq('app_type', 'dashboard')
    .eq('status', 'active')
    .order('shop_id');
  if (error) return { ok: false, error: error.message };
  const seen = new Set();
  const shops = [];
  for (const r of (data || [])) {
    if (seen.has(r.shop_id)) continue;
    seen.add(r.shop_id);
    shops.push({ shop_id: r.shop_id, shop_name: r.shop_name || `Shop ${r.shop_id}` });
  }
  return { ok: true, data: shops };
}

/** 11. auto_boost_all — run recurring boost for EVERY enabled schedule (multi-shop cron) */
async function runAutoBoostAll(supabase, { source = 'cron', force = false } = {}) {
  const { data: schedules, error } = await supabase
    .from('shopee_boost_schedule')
    .select('shop_id')
    .eq('enabled', true);
  if (error) return { ok: false, error: error.message };

  const list = schedules || [];
  const results = [];
  for (const s of list) {
    try {
      const r = await runAutoBoost(supabase, s.shop_id, { source, force });
      results.push({ shop_id: s.shop_id, ...r });
    } catch (e) {
      results.push({ shop_id: s.shop_id, ok: false, error: e.message });
    }
  }
  return {
    ok: true,
    total: list.length,
    ran_count: results.filter(r => r.ran).length,
    results,
  };
}

/** Parse cron auth from request: source + whether `force` (skip the timer) is allowed */
function parseCronAuth(req, reqUrl) {
  const secret = (process.env.BOOST_CRON_SECRET || '').trim();
  const providedSecret = (req.headers['x-boost-secret'] || reqUrl.searchParams.get('secret') || '').toString().trim();
  const source = reqUrl.searchParams.get('source') || 'cron';
  const hasValidSecret = !!secret && providedSecret === secret;
  const force = reqUrl.searchParams.get('force') === '1' && (hasValidSecret || source === 'frontend');
  return { source, force };
}

/* ═══════════════════════════════════════════════════════════════════════════
   Main handler
   ═══════════════════════════════════════════════════════════════════════════ */
/* ── ĐÁNH GIÁ: đọc (test quyền + xem cấu trúc Shopee trả về) ─────────────── */
async function handleGetComment(supabase, shopId, params) {
  const creds = await getCredentials(supabase, shopId, 'dashboard');
  const raw = await shopeeGet(creds.partnerKey, creds.partnerId, '/api/v2/product/get_comment', creds.accessToken, creds.shopId,
    { page_size: String(params.page_size || 10) });
  if (raw.error) return { ok: false, error: raw.error, message: raw.message };
  const list = raw.response?.item_comment_list || raw.response?.comment_list || [];
  return { ok: true, data: {
    shop_id: shopId,
    so_danh_gia: list.length,
    field_names: list[0] ? Object.keys(list[0]) : [],
    mau: list.slice(0, 5),
  } };
}

/* ── ĐÁNH GIÁ: mẫu trả lời + trả lời 1 cái + auto-trả-lời ─────────────────── */
const REPLY_TEMPLATE = (shopName) => `Dạ ${shopName || 'Shop'} cảm ơn bạn rất nhiều vì đã tin tưởng và ủng hộ sản phẩm ạ! 🥰 Bạn đừng quên bấm "Theo dõi" Shop để nhận ưu đãi sớm nhất nha. Hẹn gặp lại bạn ở những đơn hàng sau ạ!`;

async function replyOneComment(creds, commentId, text) {
  return shopeePost(creds.partnerKey, creds.partnerId, '/api/v2/product/reply_comment', creds.accessToken, creds.shopId,
    { comment_list: [{ comment_id: Number(commentId), comment: text }] });
}

// Trả lời 1 đánh giá (test quyền ghi / dùng tay). body: { comment_id, comment? }
async function handleReplyComment(supabase, shopId, body) {
  const { comment_id, comment } = body || {};
  if (!comment_id) return { ok: false, error: 'Thiếu comment_id' };
  const creds = await getCredentials(supabase, shopId, 'dashboard');
  const text = comment || REPLY_TEMPLATE(creds.shopName);
  const r = await replyOneComment(creds, comment_id, text);
  if (r.error) return { ok: false, error: r.error, message: r.message, detail: r };
  await supabase.from('shopee_replied_comments').upsert({ comment_id: Number(comment_id), shop_id: String(shopId), replied_at: new Date().toISOString() }, { onConflict: 'comment_id' }).then(() => {}, () => {});
  return { ok: true, data: r.response };
}

// Đọc hết đánh giá 1 shop (phân trang cursor).
async function fetchAllComments(creds, maxPages = 6, pageSize = 100) {
  const all = []; let cursor = ''; let pages = 0;
  while (pages < maxPages) {
    const r = await shopeeGet(creds.partnerKey, creds.partnerId, '/api/v2/product/get_comment', creds.accessToken, creds.shopId,
      cursor ? { cursor, page_size: String(pageSize) } : { page_size: String(pageSize) });
    if (r.error) return { error: r.error, message: r.message, got: all };
    const list = r.response?.item_comment_list || r.response?.comment_list || [];
    all.push(...list);
    pages++;
    if (!r.response?.more || !r.response?.next_cursor) break;
    cursor = r.response.next_cursor;
    await new Promise((res) => setTimeout(res, 150));
  }
  return { comments: all };
}

// Chạy auto-trả-lời cho 1 shop: đọc đánh giá, ≥4★ chưa trả lời → trả lời theo mẫu.
const REPLY_MAX_PER_SHOP = 80;   // trần xử mỗi shop / mỗi lượt cron — tránh timeout, phần dư để lượt sau vét tiếp

async function replyShopComments(supabase, creds, shopId, shopName, template, dryRun, deadlineMs = 0) {
  const fc = await fetchAllComments(creds, 6, 100);
  if (fc.error) return { shop_id: shopId, status: 'read_fail', error: fc.error };
  // Chỉ lấy ≥4★, CHƯA có phản hồi sẵn trên Shopee (c.comment_reply) — tránh gọi API trả lời lại
  // hàng loạt đánh giá đã được trả lời tay ở Seller Center (vốn không nằm trong bảng dedup nội bộ).
  const cand = (fc.comments || []).filter((c) =>
    Number(c.rating_star || 0) >= 4 && c.comment_id &&
    !(c.comment_reply && (c.comment_reply.reply || c.comment_reply.comment)));
  const ids = cand.map((c) => Number(c.comment_id));
  let already = new Set();
  if (ids.length) {
    const { data: done } = await supabase.from('shopee_replied_comments').select('comment_id').in('comment_id', ids);
    already = new Set((done || []).map((d) => Number(d.comment_id)));
  }
  const todoAll = cand.filter((c) => !already.has(Number(c.comment_id)));
  if (dryRun) return { shop_id: shopId, shop: shopName, quet: (fc.comments || []).length, can_tra_loi: todoAll.length, da_tra_loi: todoAll.length, dry: true };
  const todo = todoAll.slice(0, REPLY_MAX_PER_SHOP);   // trần / lượt
  let replied = 0, hetGio = false;
  for (const c of todo) {
    if (deadlineMs && Date.now() > deadlineMs) { hetGio = true; break; }   // hết quỹ thời gian → để lượt sau
    const r = await replyOneComment(creds, c.comment_id, template || REPLY_TEMPLATE(shopName));
    const dup = r.error && /replied|already|duplicate/i.test(JSON.stringify(r));
    if (!r.error || dup) {
      if (!r.error) replied++;
      await supabase.from('shopee_replied_comments').upsert({ comment_id: Number(c.comment_id), shop_id: String(shopId), rating_star: Number(c.rating_star || 0), replied_at: new Date().toISOString() }, { onConflict: 'comment_id' }).then(() => {}, () => {});
    }
    await new Promise((res) => setTimeout(res, 350));
  }
  return { shop_id: shopId, shop: shopName, quet: (fc.comments || []).length, can_tra_loi: todoAll.length, da_tra_loi: replied, con_lai: Math.max(0, todoAll.length - replied), het_gio: hetGio, dry: false };
}

// Cron: auto-trả-lời cho các shop ĐÃ BẬT (enabled) trong cài đặt.
async function handleAutoReplyComments(supabase, reqUrl, req) {
  // Mở (không bắt secret) — giống các endpoint cron khác trong dự án (sync_aff_orders, fill_koc_views, prewarm_koc)
  // để cron-job.org ping thẳng URL trần là chạy. An toàn: chỉ trả lời đánh giá ≥4★ CHƯA trả lời của shop ĐANG BẬT,
  // dùng template cố định, idempotent (đã trả lời thì bỏ qua) → kích nhiều lần cũng vô hại.
  const dryRun = reqUrl.searchParams.get('dry_run') === '1';
  const { data: settings } = await supabase.from('shopee_review_autoreply_settings').select('shop_id, template').eq('enabled', true);
  const enabled = settings || [];
  if (!enabled.length) return { ok: true, shops: 0, results: [], note: 'Chưa shop nào bật auto trả lời.' };
  const { data: toks } = await supabase.from('shopee_tokens').select('shop_id, shop_name').eq('app_type', 'dashboard').eq('status', 'active');
  const nameById = {}; (toks || []).forEach((t) => { nameById[String(t.shop_id)] = t.shop_name; });

  // Quỹ thời gian cả lượt ~50s (chừa biên cho giới hạn Vercel) — vét tới đâu hay tới đó, phần dư lượt cron sau.
  const deadline = dryRun ? 0 : Date.now() + 50000;
  const out = [];
  for (const s of enabled) {
    if (deadline && Date.now() > deadline) { out.push({ shop_id: s.shop_id, status: 'skip_het_gio' }); continue; }
    try {
      const creds = await getCredentials(supabase, s.shop_id, 'dashboard');
      out.push(await replyShopComments(supabase, creds, s.shop_id, nameById[String(s.shop_id)] || creds.shopName, s.template, dryRun, deadline));
    } catch (e) { out.push({ shop_id: s.shop_id, status: 'error', error: e.message }); }
  }
  return { ok: true, shops: enabled.length, results: out };
}

// Trả lời NGAY cho 1 shop (nút bấm trên trang) — bất kể bật/tắt.
async function handleReviewRunNow(supabase, shopId, body) {
  if (!shopId) return { ok: false, error: 'Thiếu shop_id' };
  const creds = await getCredentials(supabase, shopId, 'dashboard');
  const { data: st } = await supabase.from('shopee_review_autoreply_settings').select('template').eq('shop_id', String(shopId)).maybeSingle();
  const r = await replyShopComments(supabase, creds, shopId, creds.shopName, st?.template, body?.dry_run === true || body?.dry_run === '1');
  return { ok: true, data: r };
}

// Danh sách shop + cài đặt auto-trả-lời (cho trang quản lý).
async function handleReviewSettings(supabase) {
  const { data: toks } = await supabase.from('shopee_tokens').select('shop_id, shop_name').eq('app_type', 'dashboard').eq('status', 'active');
  const { data: settings } = await supabase.from('shopee_review_autoreply_settings').select('*');
  const byId = {}; (settings || []).forEach((s) => { byId[String(s.shop_id)] = s; });
  const shops = (toks || []).map((t) => ({
    shop_id: String(t.shop_id), shop_name: t.shop_name,
    enabled: byId[String(t.shop_id)]?.enabled || false,
    template: byId[String(t.shop_id)]?.template || '',
  }));
  return { ok: true, data: { shops, default_template: REPLY_TEMPLATE('') } };
}

// Lưu cài đặt 1 shop. body: { shop_id, enabled, template }
async function handleReviewSettingsSave(supabase, body) {
  const { shop_id, enabled, template } = body || {};
  if (!shop_id) return { ok: false, error: 'Thiếu shop_id' };
  await supabase.from('shopee_review_autoreply_settings').upsert({ shop_id: String(shop_id), enabled: !!enabled, template: template || null, updated_at: new Date().toISOString() }, { onConflict: 'shop_id' });
  return { ok: true };
}

// Danh sách ĐÁNH GIÁ đầy đủ của 1 shop (cho bảng kiểu Salework): sao, nội dung,
// người mua, mã đơn, sản phẩm, đã/chưa trả lời + lời đã trả lời.
async function handleReviewList(supabase, shopId, params) {
  if (!shopId) return { ok: false, error: 'Thiếu shop_id' };
  const creds = await getCredentials(supabase, shopId, 'dashboard');
  const fc = await fetchAllComments(creds, 8, 100);
  if (fc.error) return { ok: false, error: fc.error, message: fc.message };
  const comments = fc.comments || [];

  // Trạng thái đã trả lời: gộp comment_reply (Shopee) + bảng dedup (mình tự trả lời).
  const ids = comments.map((c) => Number(c.comment_id)).filter(Boolean);
  let ourReplied = new Set();
  if (ids.length) {
    const { data: done } = await supabase.from('shopee_replied_comments').select('comment_id').in('comment_id', ids);
    ourReplied = new Set((done || []).map((d) => Number(d.comment_id)));
  }

  // Tên + ảnh sản phẩm (batch get_item_base_info, tối đa 50 item).
  const itemIds = [...new Set(comments.map((c) => Number(c.item_id)).filter(Boolean))].slice(0, 50);
  const prodMap = {};
  if (itemIds.length) {
    try {
      const pr = await shopeeGet(creds.partnerKey, creds.partnerId, '/api/v2/product/get_item_base_info', creds.accessToken, creds.shopId, { item_id_list: itemIds.join(',') });
      (pr.response?.item_list || []).forEach((it) => { prodMap[Number(it.item_id)] = { name: it.item_name || '', image: (it.image?.image_url_list || [])[0] || '' }; });
    } catch { /* tên SP là phụ */ }
  }

  const reviews = comments.map((c) => {
    const shopeeReply = c.comment_reply && (c.comment_reply.reply || c.comment_reply.comment);
    const replied = !!shopeeReply || ourReplied.has(Number(c.comment_id));
    const p = prodMap[Number(c.item_id)] || {};
    return {
      comment_id: c.comment_id, rating_star: Number(c.rating_star || 0), comment: c.comment || '',
      buyer_username: c.buyer_username || '', order_sn: c.order_sn || '', item_id: c.item_id,
      create_time: c.create_time || 0, replied, reply_text: shopeeReply || '',
      product_name: p.name || '', product_image: p.image || '',
    };
  });
  return { ok: true, data: { shop_id: shopId, total: reviews.length, replied: reviews.filter((r) => r.replied).length, unreplied: reviews.filter((r) => !r.replied).length, reviews } };
}

// Nhật ký đã auto-trả-lời (gần nhất).
async function handleReviewLog(supabase, params) {
  let q = supabase.from('shopee_replied_comments').select('comment_id, shop_id, rating_star, replied_at').order('replied_at', { ascending: false }).limit(Number(params.limit) || 50);
  if (params.shop_id) q = q.eq('shop_id', String(params.shop_id));
  const { data } = await q;
  return { ok: true, data: data || [] };
}

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
      available: ['list', 'create', 'update', 'delete', 'boost', 'boosted_list', 'list_shops', 'top_sellers', 'schedule_get', 'schedule_save', 'auto_boost', 'auto_boost_all', 'boost_log'],
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
      case 'get_comment':
        result = await handleGetComment(supabase, shopId, Object.fromEntries(reqUrl.searchParams.entries()));
        break;
      case 'reply_comment':
        if (req.method !== 'POST') return res.status(200).json({ ok: false, error: 'POST required for reply_comment' });
        result = await handleReplyComment(supabase, shopId, req.body);
        break;
      case 'auto_reply_comments':
        result = await handleAutoReplyComments(supabase, reqUrl, req);
        break;
      case 'review_settings':
        result = await handleReviewSettings(supabase);
        break;
      case 'review_settings_save':
        if (req.method !== 'POST') return res.status(200).json({ ok: false, error: 'POST required for review_settings_save' });
        result = await handleReviewSettingsSave(supabase, req.body);
        break;
      case 'review_run_now':
        if (req.method !== 'POST') return res.status(200).json({ ok: false, error: 'POST required for review_run_now' });
        result = await handleReviewRunNow(supabase, shopId, req.body);
        break;
      case 'review_log':
        result = await handleReviewLog(supabase, Object.fromEntries(reqUrl.searchParams.entries()));
        break;
      case 'review_list':
        result = await handleReviewList(supabase, shopId, Object.fromEntries(reqUrl.searchParams.entries()));
        break;
      case 'list_shops':
        result = await handleListShops(supabase);
        break;
      case 'top_sellers':
        result = await handleTopSellers(supabase, {
          days: reqUrl.searchParams.get('days'),
          limit: reqUrl.searchParams.get('limit'),
          shop_id: reqUrl.searchParams.get('shop_id'),
          start_date: reqUrl.searchParams.get('start_date'),
          end_date: reqUrl.searchParams.get('end_date'),
        });
        break;
      case 'auto_boost': {
        // Recurring boost trigger for ONE shop. Used by the frontend countdown / "run now".
        // Due-gated so it never over-boosts. `force` (skip the timer) is honored only with a valid
        // secret or when explicitly invoked from the frontend.
        const { source, force } = parseCronAuth(req, reqUrl);
        result = await runAutoBoost(supabase, shopId, { source, force });
        break;
      }
      case 'auto_boost_all': {
        // Recurring boost for ALL enabled shops at once. Used by the GitHub Actions cron (24/7).
        const { source, force } = parseCronAuth(req, reqUrl);
        result = await runAutoBoostAll(supabase, { source, force });
        break;
      }
      default:
        return res.status(200).json({
          ok: false,
          error: `Unknown action: ${action}`,
          available: ['list', 'create', 'update', 'delete', 'boost', 'boosted_list', 'list_shops', 'top_sellers', 'schedule_get', 'schedule_save', 'auto_boost', 'auto_boost_all', 'boost_log'],
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
