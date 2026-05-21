/**
 * scripts/github-sync.mjs
 * Chạy trong GitHub Actions — sync TikTok Shop orders trực tiếp vào Supabase
 * Không qua Vercel, không cần browser.
 *
 * Env vars cần thiết (GitHub Secrets):
 *   TIKTOK_SHOP_APP_KEY
 *   TIKTOK_SHOP_APP_SECRET
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_KEY
 */

import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const appKey    = process.env.TIKTOK_SHOP_APP_KEY?.trim();
const appSecret = process.env.TIKTOK_SHOP_APP_SECRET?.trim();
const sbUrl     = process.env.SUPABASE_URL?.trim();
const sbKey     = process.env.SUPABASE_SERVICE_KEY?.trim();

if (!appKey || !appSecret || !sbUrl || !sbKey) {
  console.error('❌ Thiếu env vars:', { appKey:!!appKey, appSecret:!!appSecret, sbUrl:!!sbUrl, sbKey:!!sbKey });
  process.exit(1);
}

const supabase = createClient(sbUrl, sbKey, { auth: { persistSession:false, autoRefreshToken:false } });

const TIKTOK_BASE = 'https://open-api.tiktokglobalshop.com';

// ── Tham số từ command line hoặc mặc định ────────────────────────────────────
const FROM_DATE    = process.env.FROM_DATE    || '2026-04-01';
const WINDOW_DAYS  = parseInt(process.env.WINDOW_DAYS  || '3');
const SKIP_EHERB   = (process.env.SKIP_EHERB_VN || 'yes') === 'yes';

// ── Sign ──────────────────────────────────────────────────────────────────────
const buildSign = (secret, path, urlParams, bodyStr = '') => {
  const keys = Object.keys(urlParams)
    .filter(k => k !== 'sign' && k !== 'access_token')
    .sort();
  const paramStr = keys.map(k => `${k}${urlParams[k]}`).join('');
  const base = `${secret}${path}${paramStr}${bodyStr}${secret}`;
  return crypto.createHmac('sha256', secret).update(base).digest('hex');
};

// ── TikTok API: search orders ─────────────────────────────────────────────────
const searchOrders = async ({ accessToken, shopCipher, createTimeGe, createTimeLt, pageToken }) => {
  const path = '/order/202309/orders/search';
  const ts   = String(Math.floor(Date.now() / 1000));
  const bodyObj = { create_time_ge: createTimeGe, create_time_lt: createTimeLt };
  const bodyStr = JSON.stringify(bodyObj);
  const urlParams = { app_key: appKey, timestamp: ts, shop_cipher: shopCipher, page_size: '50' };
  if (pageToken) urlParams.page_token = pageToken;
  const sign = buildSign(appSecret, path, urlParams, bodyStr);
  const qs   = new URLSearchParams({ ...urlParams, sign });
  const url  = `${TIKTOK_BASE}${path}?${qs.toString()}`;

  const ctrl = new AbortController();
  const tid  = setTimeout(() => ctrl.abort(), 25_000);
  try {
    const res  = await fetch(url, {
      method: 'POST',
      headers: { 'x-tts-access-token': accessToken, 'content-type': 'application/json' },
      body: bodyStr,
      signal: ctrl.signal,
    });
    clearTimeout(tid);
    const text = await res.text();
    try { return JSON.parse(text); } catch { return { code:-1, _raw: text.slice(0,200) }; }
  } catch (e) {
    clearTimeout(tid);
    return { code:-1, message: e.message };
  }
};

// ── Normalize ─────────────────────────────────────────────────────────────────
const normalizeOrder = (order, conn) => {
  const items = order.line_items || [];
  return {
    id:           String(order.id || order.order_id || ''),
    shop_id:      conn.shop_id || null,
    open_id:      conn.open_id || null,
    order_status: order.status || order.order_status || null,
    create_time:  order.create_time || null,
    update_time:  order.update_time || null,
    buyer_uid:    order.buyer_uid || order.user_id || null,
    total_amount: String(order.payment?.total_amount ?? order.payment?.sub_total ?? order.total_amount ?? ''),
    currency:     order.currency || items[0]?.currency || null,
    line_items:   items.map(item => ({
      item_id:      item.item_id || item.id,
      sku_id:       item.sku_id,
      product_name: item.product_name || item.sku_name,
      quantity:     item.quantity || 1,
      sale_price:   item.sale_price || item.original_price,
      currency:     item.currency,
    })),
    synced_at: new Date().toISOString(),
  };
};

// ── Main ──────────────────────────────────────────────────────────────────────
const main = async () => {
  // Lấy connections từ Supabase
  const { data: connections, error } = await supabase
    .from('tiktok_shop_connections')
    .select('access_token, shop_cipher, shop_id, open_id, seller_name')
    .not('access_token', 'is', null)
    .not('shop_cipher', 'is', null);

  if (error) { console.error('❌ Supabase error:', error.message); process.exit(1); }
  if (!connections?.length) { console.log('ℹ️  Không có shop nào.'); return; }

  // Lọc shop
  const EHERB_VN_ID = '7494529979361168222';
  const ONLY_SHOP   = process.env.ONLY_SHOP_ID?.trim();
  let conns;
  if (ONLY_SHOP) {
    conns = connections.filter(c => String(c.shop_id) === ONLY_SHOP);
  } else {
    conns = SKIP_EHERB
      ? connections.filter(c => String(c.shop_id) !== EHERB_VN_ID)
      : connections;
  }

  // Tạo danh sách windows
  const FROM_TS    = Math.floor(new Date(FROM_DATE).getTime() / 1000);
  const NOW        = Math.floor(Date.now() / 1000);
  const WINDOW_SEC = WINDOW_DAYS * 24 * 3600;

  const windows = [];
  for (let t = FROM_TS; t < NOW; t += WINDOW_SEC) {
    windows.push({ ge: t, lt: Math.min(t + WINDOW_SEC, NOW) });
  }

  console.log('='.repeat(50));
  console.log(`FROM : ${FROM_DATE}`);
  console.log(`CHUNK: ${WINDOW_DAYS} ngày (${windows.length} windows)`);
  console.log(`SHOPS: ${conns.map(c => c.seller_name || c.shop_id).join(', ')}`);
  console.log(`SKIP eHerb VN: ${SKIP_EHERB}`);
  console.log('='.repeat(50));

  let totalSynced = 0, totalErrors = 0, chunkNum = 0;

  for (const conn of conns) {
    const shopName = conn.seller_name || conn.shop_id;
    console.log(`\n▶ ${shopName}`);

    for (const { ge, lt } of windows) {
      chunkNum++;
      const fromFmt = new Date(ge * 1000).toLocaleDateString('vi-VN', { day:'2-digit', month:'2-digit' });
      const ltFmt   = new Date(lt * 1000).toLocaleDateString('vi-VN', { day:'2-digit', month:'2-digit' });
      process.stdout.write(`  ${fromFmt}→${ltFmt} ... `);

      const allOrders = [];
      let pageToken;

      while (true) {
        const resp = await searchOrders({
          accessToken: conn.access_token,
          shopCipher:  conn.shop_cipher,
          createTimeGe: ge,
          createTimeLt: lt,
          pageToken,
        });

        if (resp?.code !== 0) {
          process.stdout.write(`⚠️  code=${resp?.code} ${resp?.message || ''}\n`);
          totalErrors++;
          break;
        }

        const orders = resp?.data?.orders || [];
        allOrders.push(...orders);
        const nextToken = resp?.data?.next_page_token;
        if (!nextToken || orders.length === 0) break;
        pageToken = nextToken;
      }

      if (allOrders.length === 0) { process.stdout.write(`— 0 đơn\n`); continue; }

      // Deduplicate
      const seen = new Set();
      const unique = allOrders.filter(o => {
        const id = String(o.id || o.order_id || '');
        if (!id || seen.has(id)) return false;
        seen.add(id); return true;
      });

      const records = unique.map(o => normalizeOrder(o, conn)).filter(r => r.id);

      // Upsert
      const BATCH = 500;
      for (let i = 0; i < records.length; i += BATCH) {
        const { error: upsertErr } = await supabase
          .from('tiktok_shop_orders')
          .upsert(records.slice(i, i + BATCH), { onConflict: 'id' });
        if (upsertErr) { console.error('\n  ❌ upsert:', upsertErr.message); totalErrors++; break; }
      }

      totalSynced += records.length;
      process.stdout.write(`✅ ${records.length} đơn\n`);
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log(`HOÀN THÀNH`);
  console.log(`Tổng đơn đã sync : ${totalSynced.toLocaleString()}`);
  console.log(`Số lỗi           : ${totalErrors}`);
  console.log(`Tổng chunks      : ${chunkNum}`);
  console.log('='.repeat(50));

  process.exit(totalErrors > 0 ? 1 : 0);
};

main().catch(e => { console.error('❌ Fatal:', e.message); process.exit(1); });
