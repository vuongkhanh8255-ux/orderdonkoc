/**
 * api/tiktok-shop/sync-orders.js
 *
 * Vercel serverless function — POST /api/tiktok-shop/sync-orders
 *
 * TikTok Sign Algorithm (per official docs):
 *   base = appSecret + path + sorted_url_params (exclude ONLY sign & access_token) + raw_body_json + appSecret
 *   sign = HMAC-SHA256(key=appSecret, msg=base)
 *   Note: shop_cipher IS included in the sign (unlike access_token)
 */

import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const TIKTOK_BASE      = 'https://open-api.tiktokglobalshop.com';
const TIKTOK_AUTH_BASE = 'https://auth.tiktok-shops.com';

// ── Helper: epoch seconds → ISO string ───────────────────────────────────────
const toIso = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? new Date(n * 1000).toISOString() : null;
};

// ── Auto-refresh access token using refresh_token ─────────────────────────────
// Gọi API TikTok để lấy access_token mới, cập nhật vào Supabase
const tryRefreshToken = async ({ appKey, appSecret, conn, supabase }) => {
  if (!conn.refresh_token) return false;

  try {
    const url = new URL(`${TIKTOK_AUTH_BASE}/api/v2/token/refresh`);
    url.searchParams.set('app_key',       appKey);
    url.searchParams.set('app_secret',    appSecret);
    url.searchParams.set('refresh_token', conn.refresh_token);
    url.searchParams.set('grant_type',    'refresh_token');

    const ctrl = new AbortController();
    const tid  = setTimeout(() => ctrl.abort(), 6000); // timeout 6s
    let res;
    try { res = await fetch(url.toString(), { signal: ctrl.signal }); }
    catch (e) { clearTimeout(tid); console.warn('[sync-orders] token refresh timeout/abort'); return false; }
    clearTimeout(tid);
    const text = await res.text();
    let payload;
    try { payload = JSON.parse(text); } catch { return false; }

    const d = payload?.data;
    if (payload?.code !== 0 || !d?.access_token) {
      console.warn(`[sync-orders] token refresh failed: code=${payload?.code} msg=${payload?.message}`);
      return false;
    }

    // Cập nhật token mới vào Supabase
    const { error } = await supabase
      .from('tiktok_shop_connections')
      .update({
        access_token:             d.access_token,
        refresh_token:            d.refresh_token            || conn.refresh_token,
        access_token_expires_at:  toIso(d.access_token_expire_in),
        refresh_token_expires_at: toIso(d.refresh_token_expire_in),
        updated_at:               new Date().toISOString(),
      })
      .eq('shop_id', conn.shop_id);

    if (error) {
      console.error(`[sync-orders] token refresh save error: ${error.message}`);
      return false;
    }

    // Cập nhật object conn để dùng token mới ngay trong lần sync này
    conn.access_token = d.access_token;
    if (d.refresh_token) conn.refresh_token = d.refresh_token;

    console.log(`[sync-orders] token refreshed for shop ${conn.shop_id}, new expiry: ${toIso(d.access_token_expire_in)}`);
    return true;
  } catch (err) {
    console.error(`[sync-orders] token refresh exception: ${err.message}`);
    return false;
  }
};

// ── TikTok Sign ───────────────────────────────────────────────────────────────
// Official docs: exclude ONLY 'sign' and 'access_token'
// shop_cipher IS included in the sorted URL params
// body (raw JSON string) is appended after URL params
const buildSign = (appSecret, path, urlParams, bodyStr = '') => {
  const keys = Object.keys(urlParams)
    .filter(k => k !== 'sign' && k !== 'access_token')
    .sort();
  const paramStr = keys.map(k => `${k}${urlParams[k]}`).join('');
  // base = secret + path + sortedURLParams + bodyStr + secret
  const base = `${appSecret}${path}${paramStr}${bodyStr}${appSecret}`;
  return crypto.createHmac('sha256', appSecret).update(base).digest('hex');
};

// ── POST /order/202309/orders/search ─────────────────────────────────────────
// page_size and page_token are URL query params (not body)
// create_time_ge, create_time_lt are body params
const searchOrders = async ({ appKey, appSecret, accessToken, shopCipher, createTimeGe, createTimeLt, pageToken }) => {
  const path = '/order/202309/orders/search';
  const ts = String(Math.floor(Date.now() / 1000));

  // Body: only time filters
  const bodyObj = { create_time_ge: createTimeGe, create_time_lt: createTimeLt };
  const bodyStr = JSON.stringify(bodyObj);

  // URL params: app_key, timestamp, shop_cipher, page_size (and optional page_token)
  const urlParams = { app_key: appKey, timestamp: ts, shop_cipher: shopCipher, page_size: '50' };
  if (pageToken) urlParams.page_token = pageToken;

  const sign = buildSign(appSecret, path, urlParams, bodyStr);

  const qs = new URLSearchParams({ ...urlParams, sign });
  const url = `${TIKTOK_BASE}${path}?${qs.toString()}`;

  const ctrl = new AbortController();
  const tid  = setTimeout(() => ctrl.abort(), 25_000); // 25s per TikTok call
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'x-tts-access-token': accessToken,
        'content-type': 'application/json',
      },
      body: bodyStr,
      signal: ctrl.signal,
    });
  } catch (e) {
    clearTimeout(tid);
    console.warn(`[sync-orders] TikTok API timeout: ${e.message}`);
    return { code: -1, message: 'tiktok_api_timeout' };
  }
  clearTimeout(tid);
  const text = await res.text();
  try { return JSON.parse(text); } catch { return { _raw: text }; }
};

// ── DÒ API TRẢ HÀNG/HOÀN TIỀN — CHỈ ĐỌC, KHÔNG GHI DB ────────────────────────
// Mục đích: xem app có quyền gọi không, và sàn có trả LÝ DO TRẢ HÀNG không
// (CS xin từ lâu để đối chiếu với lý do CS tự điền). Dò xong mới quyết làm tiếp.
const searchReturns = async ({ appKey, appSecret, accessToken, shopCipher, path, bodyObj, pageToken, pageSize }) => {
  const ts = String(Math.floor(Date.now() / 1000));
  const bodyStr = JSON.stringify(bodyObj || {});
  const urlParams = { app_key: appKey, timestamp: ts, shop_cipher: shopCipher, page_size: pageSize || '10' };
  if (pageToken) urlParams.page_token = pageToken;
  const sign = buildSign(appSecret, path, urlParams, bodyStr);
  const url = `${TIKTOK_BASE}${path}?${new URLSearchParams({ ...urlParams, sign })}`;
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), 20_000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'x-tts-access-token': accessToken, 'content-type': 'application/json' },
      body: bodyStr, signal: ctrl.signal,
    });
    clearTimeout(tid);
    const text = await res.text();
    try { return JSON.parse(text); } catch { return { _raw: text.slice(0, 300) }; }
  } catch (e) { clearTimeout(tid); return { code: -1, message: String(e.message) }; }
};

// ── Normalize order for Supabase ──────────────────────────────────────────────
const normalizeOrder = (order, conn) => {
  const items = order.line_items || [];
  return {
    id: String(order.id || order.order_id || ''),
    shop_id: conn.shop_id || null,
    open_id: conn.open_id || null,
    order_status: order.status || order.order_status || null,
    create_time: order.create_time || null,
    update_time: order.update_time || null,
    buyer_uid: order.buyer_uid || order.user_id || null,
    total_amount: String(order.payment?.total_amount ?? order.payment?.sub_total ?? order.total_amount ?? ''),
    currency: order.currency || items[0]?.currency || null,
    line_items: items.map(item => ({
      item_id: item.item_id || item.id,
      sku_id: item.sku_id,
      product_name: item.product_name || '',
      // TÊN PHÂN LOẠI khách đặt (mùi/dung tích) — GIỮ RIÊNG, đừng gộp vào product_name.
      // Trước gộp `product_name || sku_name` nên tên SP luôn thắng, mùi không bao giờ hiện ra
      // → Module 2 không biết khách chọn mùi nào (CS phản ánh 28/7). Dò vài tên field theo phiên bản API.
      sku_name: item.sku_name || item.sku_title || item.seller_sku || '',
      quantity: item.quantity || 1,
      sale_price: item.sale_price || item.original_price,
      currency: item.currency,
    })),
    synced_at: new Date().toISOString(),
  };
};

// ── Main handler ──────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const appKey      = process.env.TIKTOK_SHOP_APP_KEY?.trim();
  const appSecret   = process.env.TIKTOK_SHOP_APP_SECRET?.trim();
  const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL)?.trim();
  const supabaseKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY)?.trim();

  if (!appKey || !appSecret || !supabaseUrl || !supabaseKey) {
    return res.status(500).json({
      error: 'Missing configuration',
      missing: { TIKTOK_SHOP_APP_KEY: !appKey, TIKTOK_SHOP_APP_SECRET: !appSecret, SUPABASE_URL: !supabaseUrl, SUPABASE_KEY: !supabaseKey }
    });
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const { data: connections, error: connErr } = await supabase
    .from('tiktok_shop_connections')
    .select('access_token, refresh_token, shop_cipher, shop_id, open_id, seller_name, access_token_expires_at, refresh_token_expires_at')
    .not('access_token', 'is', null)
    .not('shop_cipher', 'is', null);

  if (connErr) return res.status(500).json({ error: `Supabase error: ${connErr.message}` });
  if (!connections?.length) {
    return res.status(200).json({ success: true, totalSynced: 0, message: 'No active TikTok Shop connections found.' });
  }

  // ?full=true → bỏ qua incremental, kéo toàn bộ 60 ngày
  // ?sync_returns=1 → KÉO ĐƠN TRẢ HÀNG TikTok về bảng tiktok_returns.
  //   Dùng app CUSTOMER REVIEWS (scope Return & Refund nằm ở app đó) → bảng tiktok_reviews_connections.
  //   Nhẹ hơn kéo toàn bộ đơn ~30-50 lần vì sàn đưa thẳng danh sách đơn BỊ TRẢ.
  //   &days=N (mặc định 60) · &shop_id=... (chỉ 1 gian)
  if (req.query?.sync_returns === '1') {
    const rKey = process.env.TIKTOK_REVIEWS_APP_KEY?.trim();
    const rSecret = process.env.TIKTOK_REVIEWS_APP_SECRET?.trim();
    if (!rKey || !rSecret) return res.status(500).json({ error: 'Thiếu TIKTOK_REVIEWS_APP_KEY/SECRET trên Vercel' });
    const days = Math.min(Number(req.query?.days) || 60, 180);
    const onlyShop = (req.query?.shop_id || '').trim();
    const { data: rConns } = await supabase.from('tiktok_reviews_connections')
      .select('access_token, shop_cipher, shop_id, seller_name, access_token_expires_at')
      .not('access_token', 'is', null).not('shop_cipher', 'is', null);
    const list = (rConns || []).filter(c => !onlyShop || String(c.shop_id) === onlyShop);
    const t1 = Math.floor(Date.now() / 1000);
    const t0 = t1 - days * 86400;
    const DEADLINE = Date.now() + 240_000;         // chừa thời gian trả JSON, khỏi timeout
    const out = [];
    for (const c of list) {
      const r = { gian: c.seller_name, lay_ve: 0, luu: 0, error: null, partial: false };
      if (new Date(c.access_token_expires_at) <= new Date()) { r.error = 'token het han - can uy quyen lai'; out.push(r); continue; }
      try {
        let pageToken = '';
        for (let page = 0; page < 40; page++) {
          if (Date.now() > DEADLINE) { r.partial = true; break; }
          const body = { create_time_ge: t0, create_time_lt: t1 };
          const resp = await searchReturns({
            appKey: rKey, appSecret: rSecret, accessToken: c.access_token, shopCipher: c.shop_cipher,
            path: '/return_refund/202309/returns/search', bodyObj: body, pageToken, pageSize: '50',
          });
          if (resp?.code !== 0) { r.error = `code ${resp?.code}: ${resp?.message}`; break; }
          const items = resp?.data?.return_orders || [];
          r.lay_ve += items.length;
          if (items.length) {
            const rows = items.map(x => {
              const li = x.return_line_items || [];
              return {
                return_id: String(x.return_id), order_id: String(x.order_id || ''),
                shop_id: String(c.shop_id), shop_name: c.seller_name,
                return_type: x.return_type || null, return_status: x.return_status || null,
                return_reason: x.return_reason || null, return_reason_text: x.return_reason_text || null,
                arbitration_status: x.arbitration_status || null,
                refund_total: Number(x.refund_amount?.refund_total) || 0,
                currency: x.refund_amount?.currency || 'VND',
                product_names: [...new Set(li.map(i => i.product_name).filter(Boolean))].join(' | ').slice(0, 500),
                sku_names: [...new Set(li.map(i => i.sku_name).filter(Boolean))].join(' | ').slice(0, 300),
                qty: li.length,
                create_time: Number(x.create_time) || null, update_time: Number(x.update_time) || null,
                raw: x, synced_at: new Date().toISOString(),
              };
            });
            for (let i = 0; i < rows.length; i += 200) {
              const { error } = await supabase.from('tiktok_returns').upsert(rows.slice(i, i + 200), { onConflict: 'return_id' });
              if (!error) r.luu += rows.slice(i, i + 200).length;
            }
          }
          pageToken = resp?.data?.next_page_token || '';
          if (!pageToken || items.length === 0) break;
        }
      } catch (e) { r.error = e.message; }
      out.push(r);
    }
    return res.status(200).json({ ok: true, mode: 'sync_returns', so_ngay: days, ket_qua: out });
  }

  // ?return_test=1 → DÒ API trả hàng/hoàn tiền (chỉ đọc, KHÔNG ghi DB). Xem có quyền + có LÝ DO TRẢ không.
  if (req.query?.return_test === '1') {
    // Chọn gian để dò: ưu tiên ?shop_id=..., không có thì lấy gian ỦY QUYỀN GẦN NHẤT
    // (quyền mới chỉ có hiệu lực với gian vừa ủy quyền lại — gian cũ vẫn bị 105005).
    const wantShop = (req.query?.shop_id || '').trim();
    // ?app=reviews → dò bằng app "Customer Reviews": scope Return & Refund nằm ở APP ĐÓ, không phải
    // app Managing Orders (Khánh phát hiện 30/7). Mỗi app có app_key/secret + BẢNG TOKEN riêng.
    if ((req.query?.app || '') === 'reviews') {
      const rKey = process.env.TIKTOK_REVIEWS_APP_KEY?.trim();
      const rSecret = process.env.TIKTOK_REVIEWS_APP_SECRET?.trim();
      if (!rKey || !rSecret) return res.status(500).json({ error: 'Thiếu TIKTOK_REVIEWS_APP_KEY/SECRET trên Vercel' });
      const { data: rConns } = await supabase.from('tiktok_reviews_connections')
        .select('access_token, shop_cipher, shop_id, seller_name, access_token_expires_at')
        .not('access_token', 'is', null).not('shop_cipher', 'is', null);
      const c = (wantShop && (rConns || []).find(x => String(x.shop_id) === wantShop))
        || [...(rConns || [])].sort((a, b) => new Date(b.access_token_expires_at) - new Date(a.access_token_expires_at))[0];
      if (!c) return res.status(200).json({ ok: false, error: 'App Customer Reviews chưa nối gian nào' });
      const t0 = Math.floor(Date.now() / 1000);
      const out = [];
      for (const t of [
        { ten: 'returns/search', path: '/return_refund/202309/returns/search' },
        { ten: 'cancellations/search', path: '/return_refund/202309/cancellations/search' },
      ]) {
        const r = await searchReturns({ appKey: rKey, appSecret: rSecret, accessToken: c.access_token, shopCipher: c.shop_cipher, path: t.path, bodyObj: { create_time_ge: t0 - 30 * 86400, create_time_lt: t0 } });
        const ds = r?.data?.return_orders || r?.data?.cancellations || r?.data?.returns || [];
        out.push({ thu: t.ten, code: r?.code, message: r?.message, so_ban_ghi: Array.isArray(ds) ? ds.length : null, cac_truong: Array.isArray(ds) && ds[0] ? Object.keys(ds[0]) : null, vi_du: Array.isArray(ds) ? ds[0] || null : null });
      }
      return res.status(200).json({ ok: true, mode: 'return_test', app: 'Customer Reviews', gian_thu: c.seller_name, token_song: new Date(c.access_token_expires_at) > new Date(), ket_qua: out });
    }
    const conn = (wantShop && connections.find(c => String(c.shop_id) === wantShop))
      || [...connections].sort((a, b) => new Date(b.access_token_expires_at) - new Date(a.access_token_expires_at))[0]
      || connections[0];
    const now = Math.floor(Date.now() / 1000);
    const ge = now - 30 * 86400;
    const thu = [
      { ten: 'returns/search 202309', path: '/return_refund/202309/returns/search', body: { create_time_ge: ge, create_time_lt: now } },
      { ten: 'returns/search 202502', path: '/return_refund/202502/returns/search', body: { create_time_ge: ge, create_time_lt: now } },
      { ten: 'cancellations/search',   path: '/return_refund/202309/cancellations/search', body: { create_time_ge: ge, create_time_lt: now } },
    ];
    const ket_qua = [];
    for (const t of thu) {
      const r = await searchReturns({ appKey, appSecret, accessToken: conn.access_token, shopCipher: conn.shop_cipher, path: t.path, bodyObj: t.body });
      const ds = r?.data?.return_orders || r?.data?.cancellations || r?.data?.returns || [];
      ket_qua.push({
        thu: t.ten, code: r?.code, message: r?.message,
        so_ban_ghi: Array.isArray(ds) ? ds.length : null,
        cac_truong: Array.isArray(ds) && ds[0] ? Object.keys(ds[0]) : null,
        vi_du: Array.isArray(ds) ? ds[0] || null : null,
      });
    }
    return res.status(200).json({ ok: true, mode: 'return_test', gian_thu: conn.seller_name, ket_qua });
  }

  const forceFullSync = req.query?.full === 'true' || req.body?.full === true;

  // Direct window params: from_ts / to_ts / shop_id (per-shop per-window từ frontend)
  const directFromTs  = req.query?.from_ts ? parseInt(req.query.from_ts) : null;
  const directToTs    = req.query?.to_ts   ? parseInt(req.query.to_ts)   : null;
  const shopIdFilter  = (req.query?.shop_id || '').trim() || null;

  const now = Math.floor(Date.now() / 1000);
  const WINDOW_SEC   = 15 * 24 * 3600;
  const BUFFER_SEC   = 12 * 3600;      // 12h overlap (tránh bỏ sót đơn API delay)
  const FULL_WINDOWS = 4;              // 4 × 15 ngày = 60 ngày

  const results = [];
  let totalSynced = 0;

  // Lọc theo shop_id nếu có (per-shop sync)
  const connsToProcess = shopIdFilter
    ? connections.filter(c => String(c.shop_id) === String(shopIdFilter))
    : connections;

  for (const conn of connsToProcess) {
    const shopLabel = conn.seller_name || conn.shop_id || '(unknown)';
    try {
      // ── Auto-refresh token — skip khi đang per-window sync (tránh hang) ──
      if (!directFromTs && !directToTs) {
        const REFRESH_THRESHOLD_MS = 7 * 24 * 3600 * 1000;
        const expiresAt = conn.access_token_expires_at ? new Date(conn.access_token_expires_at) : null;
        const shouldRefresh = !expiresAt || (expiresAt - Date.now()) < REFRESH_THRESHOLD_MS;
        if (shouldRefresh) {
          await tryRefreshToken({ appKey, appSecret, conn, supabase });
        }
      }

      let timeWindows;
      let syncMode;

      if (directFromTs && directToTs) {
        // Per-window call từ frontend: 1 shop × 1 khoảng thời gian cụ thể
        syncMode = 'direct-window';
        timeWindows = [{ createTimeGe: directFromTs, createTimeLt: directToTs }];
      } else if (forceFullSync) {
        // ── Full resync: từ 01/04/2026 đến nay ──
        syncMode = 'full';
        const FROM_TS = 1775001600; // 01/04/2026 00:00:00 UTC
        const rangeSize   = now - FROM_TS;
        const numWindows  = Math.ceil(rangeSize / WINDOW_SEC);
        const allWindows  = Array.from({ length: numWindows }, (_, i) => ({
          createTimeLt: now - i * WINDOW_SEC,
          createTimeGe: Math.max(FROM_TS, now - (i + 1) * WINDOW_SEC),
        }));
        // Optional: process only a specific window index (sent by frontend)
        const windowIdx = req.query?.window_index !== undefined ? parseInt(req.query.window_index) : null;
        if (windowIdx !== null && !isNaN(windowIdx)) {
          timeWindows = allWindows[windowIdx] ? [allWindows[windowIdx]] : [];
        } else {
          timeWindows = allWindows;
        }
      } else {
        // ── Incremental: chỉ kéo từ đơn cuối trong DB ──
        syncMode = 'incremental';
        const { data: latestRows } = await supabase
          .from('tiktok_shop_orders')
          .select('create_time')
          .eq('shop_id', conn.shop_id)
          .order('create_time', { ascending: false })
          .limit(1);

        const latestTs = latestRows?.[0]?.create_time;

        if (latestTs) {
          const fromTs    = latestTs - BUFFER_SEC;
          const rangeSize = now - fromTs;
          if (rangeSize <= WINDOW_SEC) {
            timeWindows = [{ createTimeGe: fromTs, createTimeLt: now }];
          } else {
            const numW = Math.min(Math.ceil(rangeSize / WINDOW_SEC), FULL_WINDOWS);
            timeWindows = Array.from({ length: numW }, (_, i) => ({
              createTimeLt: now - i * WINDOW_SEC,
              createTimeGe: Math.max(fromTs, now - (i + 1) * WINDOW_SEC),
            }));
          }
        } else {
          syncMode = 'full';
          timeWindows = Array.from({ length: FULL_WINDOWS }, (_, i) => ({
            createTimeLt: now - i * WINDOW_SEC,
            createTimeGe: now - (i + 1) * WINDOW_SEC,
          }));
        }
      }

      console.log(`[sync-orders] ${shopLabel}: mode=${syncMode} windows=${timeWindows.length} forceFullSync=${forceFullSync}`);

      const allOrders = [];
      let firstWindowDebug = null;
      // Dừng fetch khi còn 50s để upsert kịp trước khi Vercel timeout (800s)
      const FETCH_DEADLINE_MS = Date.now() + 750_000;
      let totalFetched = 0;

      outer:
      for (const { createTimeGe, createTimeLt } of timeWindows) {
        let pageToken = undefined;

        while (true) {
          if (Date.now() >= FETCH_DEADLINE_MS) break outer;

          const resp = await searchOrders({
            appKey, appSecret,
            accessToken: conn.access_token,
            shopCipher: conn.shop_cipher,
            createTimeGe, createTimeLt,
            pageToken,
          });

          if (firstWindowDebug === null) {
            firstWindowDebug = {
              window: `${new Date(createTimeGe * 1000).toISOString().slice(0, 10)} → ${new Date(createTimeLt * 1000).toISOString().slice(0, 10)}`,
              code: resp?.code,
              message: resp?.message,
              orders_count: resp?.data?.orders?.length ?? 0,
            };
            console.log('[sync-orders] first window:', JSON.stringify(firstWindowDebug));
          }

          if (resp?.code !== 0) break;

          const orders = resp?.data?.orders || [];
          allOrders.push(...orders);
          totalFetched += orders.length;

          const nextToken = resp?.data?.next_page_token;
          if (!nextToken || orders.length === 0) break;
          pageToken = nextToken;
        }
      }

      if (allOrders.length === 0) {
        results.push({ shop: shopLabel, synced: 0, mode: syncMode, note: 'No new orders found', first_window_debug: firstWindowDebug });
        continue;
      }

      // Deduplicate
      const seen = new Set();
      const uniqueOrders = allOrders.filter(o => {
        const id = String(o.id || o.order_id || '');
        if (!id || seen.has(id)) return false;
        seen.add(id); return true;
      });

      const records = uniqueOrders.map(o => normalizeOrder(o, conn)).filter(r => r.id);

      if (records.length > 0) {
        // Batch upsert 500 rows mỗi lần để tránh payload quá lớn
        const BATCH = 500;
        for (let i = 0; i < records.length; i += BATCH) {
          const { error: upsertErr } = await supabase
            .from('tiktok_shop_orders')
            .upsert(records.slice(i, i + BATCH), { onConflict: 'id' });
          if (upsertErr) throw new Error(upsertErr.message);
        }
        totalSynced += records.length;
        results.push({ shop: shopLabel, synced: records.length, total_found: uniqueOrders.length, mode: syncMode });
      }

    } catch (err) {
      results.push({ shop: shopLabel, synced: 0, error: err.message });
    }
  }

  const FROM_TS_RESP = 1775001600;
  const totalWindows = Math.ceil((now - FROM_TS_RESP) / WINDOW_SEC);
  return res.status(200).json({ success: true, totalSynced, connections: connections.length, results, syncedAt: new Date().toISOString(), totalWindows });
}
