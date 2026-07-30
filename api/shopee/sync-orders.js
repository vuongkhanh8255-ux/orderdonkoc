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

// Các trường CHI TIẾT đơn cần lấy. Thêm 28/7 (CS cần lọc đơn FBS + bỏ đơn khách yêu cầu HỦY):
//   fulfillment_flag  → ai giao: Shopee (FBS) hay shop tự giao
//   package_list      → trạng thái vận chuyển từng kiện (biết đã GIAO TỚI KHÁCH chưa)
//   cancel_by/cancel_reason/buyer_cancel_reason → phân biệt đơn KHÁCH YÊU CẦU HỦY
const DETAIL_FIELDS = 'buyer_username,recipient_address,item_list,actual_shipping_fee,total_amount,pay_time,'
  + 'payment_method,checkout_shipping_carrier,fulfillment_flag,package_list,cancel_by,cancel_reason,buyer_cancel_reason';

async function fetchOrderList(partnerKey, accessToken, shopId, timeFrom, timeTo, deadline = Infinity) {
  // Thêm TO_RETURN / TO_CONFIRM_RECEIVE / UNPAID (28/7): thiếu 3 trạng thái này thì đơn chuyển sang
  // "khách đòi trả" sau khi tạo sẽ KHÔNG được quét lại → Module 2 sót đơn, CS tìm mã đơn không ra.
  const STATUSES = ['UNPAID', 'READY_TO_SHIP', 'PROCESSED', 'SHIPPED', 'TO_CONFIRM_RECEIVE',
    'COMPLETED', 'IN_CANCEL', 'CANCELLED', 'TO_RETURN'];
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
      response_optional_fields: DETAIL_FIELDS,
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
    // Trạng thái vận chuyển: 1 đơn có thể tách nhiều kiện → coi là ĐÃ GIAO khi MỌI kiện đã giao xong.
    const pkgs = Array.isArray(o.package_list) ? o.package_list : [];
    const pkgStatuses = pkgs.map(p => p.logistics_status || p.fulfillment_status || '').filter(Boolean);
    const delivered = pkgStatuses.length > 0 && pkgStatuses.every(s => /DELIVERY_DONE|DELIVERED/i.test(s));
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
      fulfillment_flag: o.fulfillment_flag || null,
      logistics_status: pkgStatuses[0] || null,
      delivered: pkgStatuses.length ? delivered : null,   // null = chưa biết (đơn cũ chưa kéo lại)
      cancel_by: o.cancel_by || null,
      cancel_reason: o.cancel_reason || o.buyer_cancel_reason || null,
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

  // ── TEST: soi CHI TIẾT 1 đơn (xem thật fulfillment_flag / package_list ra sao, đừng đoán)
  //    → ?detail_test=<order_sn>&shop_id=<id> ──
  const detailTest = url.searchParams.get('detail_test');
  if (detailTest) {
    const shop = shops[0];
    const token = await refreshIfNeeded(supabase, shop);
    const r = await shopeeApi(partnerKey, 'GET', '/api/v2/order/get_order_detail', token.access_token, Number(shop.shop_id), {
      order_sn_list: detailTest, response_optional_fields: DETAIL_FIELDS,
    });
    const o = r?.response?.order_list?.[0] || null;
    return res.json({
      ok: !!o, shop: shop.shop_name, error: r?.error || null, message: r?.message || null,
      tom_tat: o ? {
        order_sn: o.order_sn, order_status: o.order_status,
        fulfillment_flag: o.fulfillment_flag ?? '(khong tra ve)',
        cancel_by: o.cancel_by ?? null, cancel_reason: o.cancel_reason ?? null,
        buyer_cancel_reason: o.buyer_cancel_reason ?? null,
        package_list: o.package_list ?? '(khong tra ve)',
      } : null,
      raw_keys: o ? Object.keys(o) : null,
    });
  }

  // ── ĐỒNG BỘ ĐƠN TRẢ HÀNG SHOPEE → bảng shopee_returns ──
  //    ?sync_returns=1[&days=60][&shop_id=]. Lấy được LÝ DO SÀN + lý do khách tự ghi + ảnh/video.
  //    ⚠️ Shopee bắt mỗi lần gọi chỉ được khoảng ≤15 ngày → chia cửa sổ 14 ngày cho chắc.
  if (url.searchParams.get('sync_returns') === '1') {
    const days = Math.min(Number(url.searchParams.get('days')) || 60, 180);
    const WIN = 14 * 86400;
    const results = [];
    for (const shop of shops) {
      const r = { gian: shop.shop_name, lay_ve: 0, luu: 0, cua_so: 0, partial: false, error: null };
      if (Date.now() > deadline) { r.partial = true; r.error = 'het thoi gian'; results.push(r); continue; }
      try {
        const token = await refreshIfNeeded(supabase, shop);
        const sid = Number(shop.shop_id);
        for (let to = now; to > now - days * 86400; to -= WIN) {
          if (Date.now() > deadline) { r.partial = true; break; }
          const from = Math.max(to - WIN, now - days * 86400);
          for (let page = 0; page < 30; page++) {
            if (Date.now() > deadline) { r.partial = true; break; }
            const resp = await shopeeApi(partnerKey, 'GET', '/api/v2/returns/get_return_list', token.access_token, sid, {
              page_no: page, page_size: 100, create_time_from: from, create_time_to: to,
            });
            if (resp?.error) { r.error = `${resp.error}: ${resp.message}`; break; }
            const items = resp?.response?.return || [];
            r.lay_ve += items.length;
            if (items.length) {
              const rows = items.map(x => ({
                return_sn: String(x.return_sn), order_sn: x.order_sn || null,
                shop_id: String(shop.shop_id), shop_name: shop.shop_name,
                reason: x.reason || null, text_reason: x.text_reason || null,
                status: x.status || null,
                refund_amount: Number(x.refund_amount) || 0, currency: x.currency || 'VND',
                return_refund_type: x.return_refund_type || null, return_solution: x.return_solution || null,
                negotiation_status: x.negotiation?.negotiation_status || x.negotiation_status || null,
                seller_proof_status: x.seller_proof_status || null,
                seller_evidence_deadline: x.seller_evidence_deadline || null,
                buyer_username: x.user?.username || null,
                product_names: (x.item || []).map(i => i.name).filter(Boolean).join(' | ').slice(0, 500),
                images: x.image || null, videos: x.buyer_videos || null,
                create_time: x.create_time || null, update_time: x.update_time || null,
                raw: x, synced_at: new Date().toISOString(),
              }));
              for (let i = 0; i < rows.length; i += 200) {
                const { error } = await supabase.from('shopee_returns').upsert(rows.slice(i, i + 200), { onConflict: 'return_sn' });
                if (!error) r.luu += rows.slice(i, i + 200).length;
              }
            }
            if (!resp?.response?.more || items.length === 0) break;
            await sleep(120);
          }
          r.cua_so++;
        }
      } catch (e) { r.error = e.message; }
      results.push(r);
    }
    return res.json({ ok: true, mode: 'sync_returns', so_ngay: days, results });
  }

  // ── DÒ API TRẢ HÀNG SHOPEE (chỉ đọc) → ?return_test=1 ──
  //    Mục tiêu: lấy LÝ DO TRẢ do sàn ghi nhận cho đơn Shopee (TikTok đã có, Shopee còn trống).
  //    Thử vài đường dẫn/tham số vì Shopee đổi tên endpoint theo phiên bản.
  if (url.searchParams.get('return_test') === '1') {
    const shop = shops[0];
    const token = await refreshIfNeeded(supabase, shop);
    const now2 = Math.floor(Date.now() / 1000);
    const thu = [
      { ten: 'returns/get_return_list', path: '/api/v2/returns/get_return_list',
        params: { page_no: 0, page_size: 20, create_time_from: now2 - 30 * 86400, create_time_to: now2 } },
      { ten: 'returns/get_return_list (khong loc ngay)', path: '/api/v2/returns/get_return_list',
        params: { page_no: 0, page_size: 20 } },
      { ten: 'order/get_order_list TO_RETURN', path: '/api/v2/order/get_order_list',
        params: { time_range_field: 'create_time', time_from: now2 - 30 * 86400, time_to: now2, page_size: 20, order_status: 'TO_RETURN' } },
    ];
    const ket_qua = [];
    for (const t of thu) {
      const r = await shopeeApi(partnerKey, 'GET', t.path, token.access_token, Number(shop.shop_id), t.params);
      const ds = r?.response?.return || r?.response?.return_list || r?.response?.order_list || [];
      ket_qua.push({
        thu: t.ten, error: r?.error || null, message: (r?.message || '').slice(0, 140),
        so_ban_ghi: Array.isArray(ds) ? ds.length : null,
        cac_truong: Array.isArray(ds) && ds[0] ? Object.keys(ds[0]) : null,
        vi_du: Array.isArray(ds) ? ds[0] || null : null,
      });
    }
    return res.json({ ok: true, mode: 'return_test', gian: shop.shop_name, ket_qua });
  }

  // ── ĐỒNG BỘ VOUCHER SHOP TẠO → bảng shopee_vouchers (Module 7 CSKH) ──
  //    ?sync_vouchers=1   (thêm &voucher_test=1 để chỉ soi thử, không ghi DB)
  if (url.searchParams.get('sync_vouchers') === '1' || url.searchParams.get('voucher_test') === '1') {
    const dryRun = url.searchParams.get('voucher_test') === '1';
    const results = [];
    for (const shop of shops) {
      const r = { shop: shop.shop_name, lay_ve: 0, luu: 0, partial: false, error: null };
      if (Date.now() > deadline) { r.partial = true; r.error = 'het thoi gian'; results.push(r); continue; }
      try {
        const token = await refreshIfNeeded(supabase, shop);
        const all = [];
        // Voucher hết hạn/đang chạy/sắp chạy nằm ở các "status" khác nhau → quét đủ 3 để không sót.
        for (const status of ['upcoming', 'ongoing', 'expired']) {
          for (let page = 1; page <= 20; page++) {
            if (Date.now() > deadline) { r.partial = true; break; }
            const resp = await shopeeApi(partnerKey, 'GET', '/api/v2/voucher/get_voucher_list', token.access_token, Number(shop.shop_id), {
              page_no: page, page_size: 100, status,
            });
            const list = resp?.response?.voucher_list || [];
            all.push(...list);
            if (!resp?.response?.more || list.length === 0) break;
            await sleep(100);
          }
        }
        r.lay_ve = all.length;
        if (!dryRun && all.length) {
          // Cùng 1 voucher có thể lặp giữa các status → gộp theo voucher_id trước khi ghi.
          const byId = new Map();
          all.forEach(v => byId.set(v.voucher_id, v));
          const rows = [...byId.values()].map(v => ({
            voucher_id: v.voucher_id, shop_id: String(shop.shop_id), shop_name: shop.shop_name,
            voucher_name: v.voucher_name || '', voucher_code: v.voucher_code || '',
            start_time: v.start_time || null, end_time: v.end_time || null,
            voucher_type: v.voucher_type ?? null, reward_type: v.reward_type ?? null,
            percentage: v.percentage ?? null, discount_amount: v.discount_amount ?? null,
            max_price: v.max_price ?? null, min_basket_price: v.min_basket_price ?? null,
            usage_quantity: v.usage_quantity ?? null, current_usage: v.current_usage ?? null,
            is_admin: v.is_admin ?? null, display_channels: v.display_channel_list || null,
            usecase: v.usecase ?? null, synced_at: new Date().toISOString(),
          }));
          for (let i = 0; i < rows.length; i += 200) {
            const { error } = await supabase.from('shopee_vouchers').upsert(rows.slice(i, i + 200), { onConflict: 'voucher_id' });
            if (!error) r.luu += rows.slice(i, i + 200).length;
          }
        }
        if (dryRun) r.vi_du = all[0] || null;
      } catch (e) { r.error = e.message; }
      results.push(r);
    }
    return res.json({ ok: true, mode: dryRun ? 'voucher_test' : 'sync_vouchers', results });
  }

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
          if (bpi) {
            // Trợ giá Shopee = voucher Shopee + coins (đều âm trong API → lấy giá trị dương). seller_voucher KHÔNG tính.
            const subsidy = Math.max(0, -(Number(bpi.shopee_voucher) || 0)) + Math.max(0, -(Number(bpi.shopee_coins_redeemed) || 0));
            await supabase.from('shopee_orders').update({ income: bpi, shopee_voucher: subsidy }).eq('order_sn', row.order_sn); r.filled++;
          } else { r.errors++; }
          await sleep(70);
        }
      } catch (err) { r.error = err.message; }
      results.push(r);
    }
    return res.json({ ok: true, mode: 'fill_subsidy', results });
  }

  // ── LẤP NGƯỢC CHI TIẾT cho đơn ĐÃ CÓ trong DB (fulfillment_flag / trạng thái giao / lý do hủy) ──
  //    Sync thường chỉ kéo chi tiết đơn MỚI, nên đơn cũ không tự có mấy trường thêm 28/7.
  //    ?refresh_detail=1  [&only_status=TO_RETURN] [&limit=1500]
  // ?refresh_status=1 → làm TƯƠI lại đơn đang ở trạng thái CHƯA CHỐT (kể cả đã có fulfillment_flag).
  //   Đo 28/7: 245/280 đơn DB ghi TO_RETURN thì bên sàn đã COMPLETED từ đời nào → Module 2 hiện đơn ma.
  //   Sync thường chỉ quét kỹ 7 ngày gần nhất nên đơn cũ đổi trạng thái không ai biết.
  const refreshStatus = url.searchParams.get('refresh_status') === '1';
  if (url.searchParams.get('refresh_detail') === '1' || refreshStatus) {
    const onlyStatus = url.searchParams.get('only_status') || (refreshStatus ? '' : '');
    const lim = Math.min(Number(url.searchParams.get('limit')) || 1500, 5000);
    const OPEN_STATUSES = ['TO_RETURN', 'TO_CONFIRM_RECEIVE', 'SHIPPED', 'PROCESSED', 'READY_TO_SHIP', 'IN_CANCEL'];
    const results = [];
    for (const shop of shops) {
      const r = { shop_id: shop.shop_id, shop_name: shop.shop_name, updated: 0, scanned: 0, partial: false, error: null };
      if (Date.now() > deadline) { r.partial = true; r.error = 'skipped (het thoi gian)'; results.push(r); continue; }
      try {
        const token = await refreshIfNeeded(supabase, shop);
        const sid = Number(shop.shop_id);
        let q = supabase.from('shopee_orders').select('order_sn')
          .eq('shop_id', String(shop.shop_id))
          .order('create_time', { ascending: false });
        // refresh_status: quét MỌI đơn chưa chốt (dù đã có chi tiết) để cập nhật trạng thái mới nhất.
        // refresh_detail: chỉ đơn còn THIẾU chi tiết → chạy lại không tốn quota vô ích.
        if (refreshStatus) q = q.in('order_status', OPEN_STATUSES);
        else q = q.is('fulfillment_flag', null);
        if (onlyStatus) q = q.eq('order_status', onlyStatus);
        const { data: rows } = await q.limit(lim);
        const sns = (rows || []).map(x => x.order_sn);
        r.scanned = sns.length;
        for (let i = 0; i < sns.length; i += 50) {
          if (Date.now() > deadline) { r.partial = true; break; }
          const details = await fetchOrderDetails(partnerKey, token.access_token, sid, sns.slice(i, i + 50), deadline);
          const records = transformOrders(details, shop.shop_id, shop.shop_name);
          if (records.length) {
            const { error } = await supabase.from('shopee_orders').upsert(records, { onConflict: 'order_sn' });
            if (!error) r.updated += records.length;
          }
        }
      } catch (err) { r.error = err.message; }
      results.push(r);
    }
    return res.json({ ok: true, mode: refreshStatus ? 'refresh_status' : 'refresh_detail', only_status: onlyStatus || '(tat ca)', results });
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
