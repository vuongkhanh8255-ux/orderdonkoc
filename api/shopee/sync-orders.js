import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const HOST = 'https://partner.shopeemobile.com';
const APP  = { id: 2035068, envKey: 'SHOPEE_PARTNER_KEY' };

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function getSupabase() {
  const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL)?.trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY)?.trim();
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function makeSign(partnerKey, partnerId, path, ts, accessToken = '', shopId = 0) {
  let base = partnerId.toString() + path + ts.toString();
  if (accessToken) base += accessToken;
  if (shopId) base += shopId.toString();
  return crypto.createHmac('sha256', partnerKey).update(base).digest('hex');
}

async function shopeeApi(partnerKey, method, apiPath, accessToken, shopId, params = {}, body = null) {
  const ts = Math.floor(Date.now() / 1000);
  const sign = makeSign(partnerKey, APP.id, apiPath, ts, accessToken, Number(shopId));
  let url = `${HOST}${apiPath}?partner_id=${APP.id}&timestamp=${ts}&sign=${sign}&access_token=${accessToken}&shop_id=${shopId}`;
  for (const [k, v] of Object.entries(params)) url += `&${k}=${encodeURIComponent(v)}`;

  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  return res.json();
}

async function refreshIfNeeded(supabase, tokenRow) {
  const partnerKey = process.env[APP.envKey]?.trim();
  if (!partnerKey) throw new Error(`${APP.envKey} not configured`);

  const expiresAt = new Date(tokenRow.token_expires).getTime();
  if (Date.now() < expiresAt - 5 * 60 * 1000) return tokenRow;

  const path = '/api/v2/auth/access_token/get';
  const ts = Math.floor(Date.now() / 1000);
  const sign = makeSign(partnerKey, APP.id, path, ts);

  const resp = await fetch(`${HOST}${path}?partner_id=${APP.id}&timestamp=${ts}&sign=${sign}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ shop_id: Number(tokenRow.shop_id), refresh_token: tokenRow.refresh_token, partner_id: APP.id }),
  });
  const result = await resp.json();
  if (result.error || !result.access_token) throw new Error(`Token refresh failed: ${result.error}`);

  const updated = {
    access_token: result.access_token,
    refresh_token: result.refresh_token,
    token_expires: new Date(Date.now() + (result.expire_in || 14400) * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  };
  await supabase.from('shopee_tokens').update(updated).eq('id', tokenRow.id);
  return { ...tokenRow, ...updated };
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchOrderList(partnerKey, accessToken, shopId, timeFrom, timeTo, deadline = Infinity) {
  const STATUSES = ['READY_TO_SHIP', 'PROCESSED', 'SHIPPED', 'COMPLETED', 'IN_CANCEL', 'CANCELLED'];
  const allSns = [];

  for (const status of STATUSES) {
    let cursor = '';
    while (true) {
      if (Date.now() > deadline) return [...new Set(allSns)];
      const params = {
        time_range_field: 'create_time',
        time_from: timeFrom, time_to: timeTo,
        page_size: 100, order_status: status,
      };
      if (cursor) params.cursor = cursor;

      const res = await shopeeApi(partnerKey, 'GET', '/api/v2/order/get_order_list', accessToken, shopId, params);
      if (res.error) break;

      const orders = res.response?.order_list || [];
      allSns.push(...orders.map(o => o.order_sn));

      if (!res.response?.more) break;
      cursor = res.response.next_cursor;
      await sleep(120);
    }
  }
  return [...new Set(allSns)];
}

// Lọc bỏ các order_sn đã có sẵn trong DB → chỉ kéo chi tiết đơn MỚI (giúp sync resumable, chạy lại không phí).
async function existingSns(supabase, sns) {
  const found = new Set();
  for (let i = 0; i < sns.length; i += 300) {
    const chunk = sns.slice(i, i + 300);
    const { data } = await supabase.from('shopee_orders').select('order_sn').in('order_sn', chunk);
    (data || []).forEach(r => found.add(r.order_sn));
  }
  return found;
}

async function fetchOrderDetails(partnerKey, accessToken, shopId, orderSns, deadline = Infinity) {
  const details = [];
  const BATCH = 50;   // Shopee get_order_detail cho tối đa 50 order_sn/lần → ít call hơn, nhanh hơn
  for (let i = 0; i < orderSns.length; i += BATCH) {
    if (Date.now() > deadline) break;
    const batch = orderSns.slice(i, i + BATCH);
    const res = await shopeeApi(partnerKey, 'GET', '/api/v2/order/get_order_detail', accessToken, shopId, {
      order_sn_list: batch.join(','),
      response_optional_fields: 'buyer_username,recipient_address,item_list,actual_shipping_fee,total_amount,pay_time,payment_method,checkout_shipping_carrier',
    });
    if (res.response?.order_list) details.push(...res.response.order_list);
    await sleep(120);
  }
  return details;
}

function transformOrders(orders, shopId, shopName) {
  return orders.map(o => {
    const addr = o.recipient_address || {};
    const items = (o.item_list || []).map(i => ({
      item_id: i.item_id, item_name: i.item_name, model_name: i.model_name,
      qty: i.model_quantity_purchased, price: i.model_discounted_price,
      original_price: i.model_original_price, sku: i.model_sku || i.item_sku,
    }));
    // GMV ("Doanh số" Shopee) = Σ(giá bán item × SL) — KHÁC total_amount (tiền khách trả sau voucher/giảm).
    const gmv = items.reduce((s, it) => s + (Number(it.price) || 0) * (Number(it.qty) || 0), 0);
    return {
      order_sn: o.order_sn, shop_id: shopId.toString(), shop_name: shopName,
      order_status: o.order_status, create_time: o.create_time,
      update_time: o.update_time, pay_time: o.pay_time || null,
      buyer_username: o.buyer_username, currency: o.currency || 'VND',
      total_amount: o.total_amount || 0, gmv,
      shipping_fee: o.estimated_shipping_fee || 0,
      actual_shipping_fee: o.actual_shipping_fee || 0,
      shipping_carrier: o.checkout_shipping_carrier || '',
      payment_method: o.payment_method || '', cod: o.cod || false,
      item_count: items.length, items: JSON.stringify(items),
      recipient_name: addr.name || '', recipient_phone: addr.phone || '',
      recipient_province: addr.state || addr.region || '',
      recipient_city: addr.city || addr.district || '',
      updated_at: new Date().toISOString(),
    };
  });
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  const partnerKey = process.env[APP.envKey]?.trim();
  const supabase = getSupabase();
  if (!partnerKey || !supabase) return res.status(500).json({ error: 'Missing env config' });

  const url = new URL(req.url, `https://${req.headers.host}`);
  const fullSync = url.searchParams.get('full_sync') === '1';
  const maxDays = Number(url.searchParams.get('days')) || (fullSync ? 90 : 40);  // trần backfill mỗi gian / lần chạy
  const shopIdFilter = url.searchParams.get('shop_id');

  const startTime = Date.now();
  const BUDGET_MS = 90_000;                     // ngân sách thời gian → luôn trả JSON, không để Vercel timeout (HTML)
  const deadline = startTime + BUDGET_MS;
  const WINDOW = 7 * 86400;                      // mỗi cửa sổ 7 ngày, kéo MỚI→CŨ
  const now = Math.floor(Date.now() / 1000);

  let query = supabase.from('shopee_tokens').select('*').eq('app_type', 'dashboard').eq('status', 'active');
  if (shopIdFilter) query = query.eq('shop_id', shopIdFilter);
  const { data: shops, error: dbErr } = await query;
  if (dbErr) return res.status(500).json({ error: dbErr.message });
  if (!shops?.length) return res.json({ success: true, message: 'No shops found', results: [] });

  // ── TEST: soi escrow 1 đơn để biết field "trợ giá" → ?escrow_test=<order_sn>&shop_id=<id> ──
  const escrowTest = url.searchParams.get('escrow_test');
  if (escrowTest) {
    const shop = shops[0];
    const token = await refreshIfNeeded(supabase, shop);
    const r = await shopeeApi(partnerKey, 'GET', '/api/v2/payment/get_escrow_detail', token.access_token, Number(shop.shop_id), { order_sn: escrowTest });
    return res.json({ ok: true, order_sn: escrowTest, shop: shop.shop_name, escrow: r });
  }

  // ── NẠP TRỢ GIÁ: lấy escrow cho đơn CHƯA có (income NULL) → lưu buyer_payment_info (để tính Doanh số gồm trợ giá) ──
  if (url.searchParams.get('fill_subsidy') === '1') {
    const fFrom = Number(url.searchParams.get('from_ts')) || 0;
    const fTo   = Number(url.searchParams.get('to_ts')) || 0;
    const results = [];
    for (const shop of shops) {
      const r = { shop_id: shop.shop_id, shop_name: shop.shop_name, filled: 0, errors: 0, partial: false };
      if (Date.now() > deadline) { r.partial = true; results.push(r); continue; }
      try {
        const token = await refreshIfNeeded(supabase, shop);
        let q = supabase.from('shopee_orders').select('order_sn').eq('shop_id', String(shop.shop_id)).is('income', null);
        if (fFrom) q = q.gte('create_time', fFrom);
        if (fTo) q = q.lt('create_time', fTo);
        const { data: rows } = await q.limit(3000);
        for (const row of (rows || [])) {
          if (Date.now() > deadline) { r.partial = true; break; }
          const e = await shopeeApi(partnerKey, 'GET', '/api/v2/payment/get_escrow_detail', token.access_token, Number(shop.shop_id), { order_sn: row.order_sn });
          const bpi = e?.response?.buyer_payment_info;
          if (bpi) { await supabase.from('shopee_orders').update({ income: bpi }).eq('order_sn', row.order_sn); r.filled++; }
          else { r.errors++; }
          await sleep(70);
        }
      } catch (err) { r.error = err.message; }
      results.push(r);
    }
    return res.json({ ok: true, mode: 'fill_subsidy', results });
  }

  // ── BACKFILL CÓ CHỦ ĐÍCH: lấp đúng khoảng [from_ts, to_ts] (vd lỗ hổng sync giữa kỳ) ──
  // Không dùng cơ chế dừng-sớm → cào FULL mọi đơn trong khoảng, chỉ bỏ đơn đã có (resumable).
  const fromTs = Number(url.searchParams.get('from_ts')) || 0;
  const toTs   = Number(url.searchParams.get('to_ts')) || 0;
  if (fromTs && toTs && toTs > fromTs) {
    const bResults = [];
    for (const shop of shops) {
      const r = { shop_id: shop.shop_id, shop_name: shop.shop_name, orders_synced: 0, windows: 0, partial: false, error: null };
      if (Date.now() > deadline) { r.partial = true; r.error = 'skipped (het thoi gian)'; bResults.push(r); continue; }
      try {
        const token = await refreshIfNeeded(supabase, shop);
        const sid = Number(shop.shop_id);
        let upserted = 0;
        for (let to = toTs; to > fromTs; to -= WINDOW) {
          if (Date.now() > deadline) { r.partial = true; break; }
          const from = Math.max(to - WINDOW, fromTs);
          const sns = await fetchOrderList(partnerKey, token.access_token, sid, from, to, deadline);
          r.windows++;
          if (!sns.length) continue;
          const have = await existingSns(supabase, sns);
          const fresh = sns.filter(s => !have.has(s));
          if (!fresh.length) continue;
          const details = await fetchOrderDetails(partnerKey, token.access_token, sid, fresh, deadline);
          const records = transformOrders(details, shop.shop_id, shop.shop_name);
          for (let i = 0; i < records.length; i += 200) {
            const batch = records.slice(i, i + 200);
            const { error } = await supabase.from('shopee_orders').upsert(batch, { onConflict: 'order_sn' });
            if (!error) upserted += batch.length;
          }
        }
        r.orders_synced = upserted;
      } catch (err) { r.error = err.message; }
      bResults.push(r);
    }
    return res.json({ success: true, mode: 'backfill', from_ts: fromTs, to_ts: toTs, total_synced: bResults.reduce((s, x) => s + x.orders_synced, 0), results: bResults });
  }

  // Ưu tiên gian CŨ NHẤT trước (đơn mới nhất trong DB xa hiện tại nhất) để gian đang kẹt được kéo trước.
  const { data: lastRows } = await supabase.from('shopee_orders')
    .select('shop_id, create_time').order('create_time', { ascending: false }).limit(5000);
  const lastByShop = {};
  (lastRows || []).forEach(r => { const s = String(r.shop_id); if (!lastByShop[s]) lastByShop[s] = r.create_time; });
  shops.sort((a, b) => (lastByShop[String(a.shop_id)] || 0) - (lastByShop[String(b.shop_id)] || 0));

  const results = [];

  for (const shop of shops) {
    const shopResult = { shop_id: shop.shop_id, shop_name: shop.shop_name, orders_synced: 0, windows: 0, partial: false, error: null };
    if (Date.now() > deadline) { shopResult.partial = true; shopResult.error = 'skipped (het thoi gian)'; results.push(shopResult); continue; }
    try {
      const token = await refreshIfNeeded(supabase, shop);
      const sid = Number(shop.shop_id);
      const lastSynced = lastByShop[String(shop.shop_id)] || 0;       // đơn mới nhất đã có
      const floor = now - maxDays * 86400;                            // không kéo xa hơn trần
      let upserted = 0;

      // Kéo từng cửa sổ 7 ngày, MỚI→CŨ. Dừng khi: hết giờ, chạm trần, hoặc gặp cửa sổ không có đơn mới (đã sync xong phần cũ).
      for (let to = now; to > floor; to -= WINDOW) {
        if (Date.now() > deadline) { shopResult.partial = true; break; }
        const from = Math.max(to - WINDOW, floor);

        const firstWindow = (to === now);   // 7 ngày gần nhất: kéo lại đầy đủ để cập nhật trạng thái/hủy/hoàn
        const sns = await fetchOrderList(partnerKey, token.access_token, sid, from, to, deadline);
        if (sns.length === 0) {
          // Cửa sổ này đã nằm dưới mốc đã-sync và không có đơn → coi như phần cũ đã xong, dừng.
          if (to <= lastSynced + WINDOW) break;
          shopResult.windows++;
          continue;
        }

        let fresh = sns;
        if (!firstWindow) { const have = await existingSns(supabase, sns); fresh = sns.filter(s => !have.has(s)); }
        shopResult.windows++;

        if (fresh.length > 0) {
          const details = await fetchOrderDetails(partnerKey, token.access_token, sid, fresh, deadline);
          const records = transformOrders(details, shop.shop_id, shop.shop_name);
          for (let i = 0; i < records.length; i += 200) {
            const batch = records.slice(i, i + 200);
            const { error } = await supabase.from('shopee_orders').upsert(batch, { onConflict: 'order_sn' });
            if (!error) upserted += batch.length;
          }
          if (Date.now() > deadline) { shopResult.partial = true; break; } // hết giờ giữa chừng
        } else if (to <= lastSynced + WINDOW) {
          // Không có đơn mới và đã chạm vùng cũ đã sync → dừng.
          break;
        }
      }
      shopResult.orders_synced = upserted;
    } catch (err) {
      shopResult.error = err.message;
    }
    results.push(shopResult);
  }

  const totalSynced = results.reduce((s, r) => s + r.orders_synced, 0);
  res.json({
    success: true,
    total_synced: totalSynced,
    shops_processed: results.length,
    partial: results.some(r => r.partial),
    elapsed_seconds: ((Date.now() - startTime) / 1000).toFixed(1),
    results,
  });
}
