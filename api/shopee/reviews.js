// api/shopee/reviews.js
// Tự phản hồi ĐÁNH GIÁ Shopee.
//   action=get_comment   — đọc đánh giá (GET /api/v2/product/get_comment) → test quyền + xem cấu trúc thật
//   action=reply_comment — trả lời 1 đánh giá (POST /api/v2/product/reply_comment)
//   action=auto_reply     — cron: quét đánh giá CHƯA trả lời, ≥4★ tự trả lời mẫu cảm ơn; ≤3★ bỏ qua (để người xử)
// Dùng app 'dashboard' (cùng nhóm product mà app đã dùng cho boost SP).
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const HOST = 'https://partner.shopeemobile.com';
const APPS = { dashboard: { id: 2035068, envKey: 'SHOPEE_PARTNER_KEY' } };
const MIN_STAR_AUTO = 4; // chỉ tự trả lời đánh giá >= 4 sao

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
}
function makeSign(partnerKey, partnerId, path, ts, accessToken = '', shopId = 0) {
  let base = partnerId.toString() + path + ts.toString();
  if (accessToken) base += accessToken;
  if (shopId) base += shopId.toString();
  return crypto.createHmac('sha256', partnerKey).update(base).digest('hex');
}
function getSupabase() {
  const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL)?.trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY)?.trim();
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
async function loadToken(supabase, shopId, appType) {
  const { data, error } = await supabase.from('shopee_tokens').select('*')
    .eq('shop_id', String(shopId)).eq('app_type', appType).maybeSingle();
  if (error) throw new Error(`DB error loading ${appType} token: ${error.message}`);
  if (!data) throw new Error(`Chưa có token ${appType} cho shop ${shopId}. Hãy kết nối Shopee trước.`);
  return data;
}
async function refreshIfNeeded(supabase, tokenRow, app) {
  const expiresAt = new Date(tokenRow.token_expires).getTime();
  if (Date.now() < expiresAt - 5 * 60 * 1000) return tokenRow;
  const partnerKey = process.env[app.envKey]?.trim();
  if (!partnerKey) throw new Error(`${app.envKey} not configured`);
  const path = '/api/v2/auth/access_token/get';
  const ts = Math.floor(Date.now() / 1000);
  const sign = makeSign(partnerKey, app.id, path, ts);
  const url = `${HOST}${path}?partner_id=${app.id}&timestamp=${ts}&sign=${sign}`;
  const resp = await fetch(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ shop_id: Number(tokenRow.shop_id), refresh_token: tokenRow.refresh_token, partner_id: app.id }),
  });
  const result = await resp.json();
  if (result.error || !result.access_token) throw new Error(`Token refresh failed: ${result.error || 'unknown'}`);
  const updated = {
    access_token: result.access_token, refresh_token: result.refresh_token,
    token_expires: new Date(Date.now() + (result.expire_in || 14400) * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  };
  await supabase.from('shopee_tokens').update(updated).eq('id', tokenRow.id);
  return { ...tokenRow, ...updated };
}
async function shopeeGet(partnerKey, partnerId, apiPath, accessToken, shopId, extraParams = {}) {
  const ts = Math.floor(Date.now() / 1000);
  const sign = makeSign(partnerKey, partnerId, apiPath, ts, accessToken, Number(shopId));
  const params = new URLSearchParams({ partner_id: partnerId.toString(), timestamp: ts.toString(), sign, access_token: accessToken, shop_id: shopId.toString(), ...extraParams });
  const resp = await fetch(`${HOST}${apiPath}?${params.toString()}`);
  return resp.json();
}
async function shopeePost(partnerKey, partnerId, apiPath, accessToken, shopId, body = {}) {
  const ts = Math.floor(Date.now() / 1000);
  const sign = makeSign(partnerKey, partnerId, apiPath, ts, accessToken, Number(shopId));
  const params = new URLSearchParams({ partner_id: partnerId.toString(), timestamp: ts.toString(), sign, access_token: accessToken, shop_id: shopId.toString() });
  const resp = await fetch(`${HOST}${apiPath}?${params.toString()}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  return resp.json();
}
async function getCredentials(supabase, shopId, appType) {
  const app = APPS[appType];
  if (!app) throw new Error(`Unknown app type: ${appType}`);
  const partnerKey = process.env[app.envKey]?.trim();
  if (!partnerKey) throw new Error(`${app.envKey} not configured on server`);
  let tokenRow = await loadToken(supabase, shopId, appType);
  tokenRow = await refreshIfNeeded(supabase, tokenRow, app);
  return { partnerKey, partnerId: app.id, accessToken: tokenRow.access_token, shopId, shopName: tokenRow.shop_name };
}

// Lấy sao từ nhiều tên field khả dĩ (chưa chắc Shopee trả 'rating_star' hay 'rating').
const starOf = (c) => Number(c.rating_star ?? c.rating ?? c.star ?? 0);
// Đã trả lời chưa? comment_reply.reply có nội dung => đã trả lời.
const isAnswered = (c) => !!(c.comment_reply && (c.comment_reply.reply || c.comment_reply.comment));

/** Đọc đánh giá 1 shop (phân trang theo cursor). limit = số trang tối đa. */
async function fetchComments(creds, { maxPages = 5, pageSize = 50 } = {}) {
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

/** action=get_comment — đọc đánh giá (test quyền + xem cấu trúc thật). Trả raw 1 trang đầu. */
async function handleGetComments(supabase, shopId, params) {
  const creds = await getCredentials(supabase, shopId, 'dashboard');
  const raw = await shopeeGet(creds.partnerKey, creds.partnerId, '/api/v2/product/get_comment', creds.accessToken, creds.shopId,
    { page_size: String(params.page_size || 20) });
  if (raw.error) return { ok: false, error: raw.error, message: raw.message };
  const list = raw.response?.item_comment_list || raw.response?.comment_list || [];
  return { ok: true, data: {
    shop_id: shopId, total_tra_ve: list.length,
    chua_tra_loi: list.filter((c) => !isAnswered(c)).length,
    danh_gia: list.slice(0, 20),   // mẫu để xem cấu trúc
    raw_keys: list[0] ? Object.keys(list[0]) : [],  // tên field thật của Shopee
  } };
}

/** action=reply_comment — trả lời 1 đánh giá. body: { comment_id, comment } */
async function handleReplyComment(supabase, shopId, body) {
  const { comment_id, comment } = body || {};
  if (!comment_id || !comment) return { ok: false, error: 'Thiếu comment_id hoặc comment' };
  const creds = await getCredentials(supabase, shopId, 'dashboard');
  const r = await shopeePost(creds.partnerKey, creds.partnerId, '/api/v2/product/reply_comment', creds.accessToken, creds.shopId,
    { comment_list: [{ comment_id: Number(comment_id), comment: String(comment) }] });
  if (r.error) return { ok: false, error: r.error, message: r.message };
  return { ok: true, data: r.response };
}

/** Mẫu trả lời cảm ơn theo shop. */
const replyTemplate = (shopName) => `Dạ ${shopName || 'shop'} cảm ơn bạn rất nhiều vì đã tin tưởng và ủng hộ sản phẩm ạ! 🥰 Bạn đừng quên bấm "Theo dõi" Shop để nhận ưu đãi sớm nhất nha. Hẹn gặp lại bạn ở những đơn hàng tiếp theo ạ!`;

/** action=auto_reply — cron: quét đánh giá chưa trả lời, ≥4★ tự trả lời. */
async function handleAutoReply(supabase, reqUrl, req) {
  const secret = (process.env.BOOST_CRON_SECRET || '').trim();
  const provided = (req.headers['x-boost-secret'] || reqUrl.searchParams.get('secret') || '').toString().trim();
  const isVercelCron = !!(req.headers['x-vercel-cron'] || (req.headers['user-agent'] || '').toLowerCase().includes('vercel-cron'));
  if (secret && provided !== secret && !isVercelCron) return { ok: false, error: 'unauthorized' };

  const dryRun = reqUrl.searchParams.get('dry_run') === '1';
  const onlyShop = reqUrl.searchParams.get('shop_id');
  const { data: toks } = await supabase.from('shopee_tokens').select('shop_id, shop_name').eq('app_type', 'dashboard').eq('status', 'active');
  const shops = (toks || []).filter((t) => !onlyShop || onlyShop === 'all' || String(t.shop_id) === String(onlyShop));

  const out = [];
  for (const t of shops) {
    try {
      const creds = await getCredentials(supabase, t.shop_id, 'dashboard');
      const fc = await fetchComments(creds, { maxPages: 5, pageSize: 50 });
      if (fc.error) { out.push({ shop_id: t.shop_id, status: 'read_fail', error: fc.error }); continue; }
      const todo = (fc.comments || []).filter((c) => !isAnswered(c) && starOf(c) >= MIN_STAR_AUTO && c.comment_id);
      let replied = 0;
      for (const c of todo) {
        if (dryRun) { replied++; continue; }
        const r = await shopeePost(creds.partnerKey, creds.partnerId, '/api/v2/product/reply_comment', creds.accessToken, creds.shopId,
          { comment_list: [{ comment_id: Number(c.comment_id), comment: replyTemplate(t.shop_name) }] });
        if (!r.error) replied++;
        await new Promise((res) => setTimeout(res, 300));
      }
      out.push({ shop_id: t.shop_id, shop: t.shop_name, da_quet: (fc.comments || []).length, can_tra_loi: todo.length, da_tra_loi: replied, dry: dryRun });
    } catch (e) { out.push({ shop_id: t.shop_id, status: 'error', error: e.message }); }
  }
  return { ok: true, shops: shops.length, results: out };
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  const reqUrl = new URL(req.url, `https://${req.headers.host || 'koc-tool.vercel.app'}`);
  let action = reqUrl.searchParams.get('action');
  const shopId = reqUrl.searchParams.get('shop_id');
  if (!action) {
    const ua = (req.headers['user-agent'] || '').toLowerCase();
    if (req.headers['x-vercel-cron'] || ua.includes('vercel-cron')) action = 'auto_reply';
  }
  const supabase = getSupabase();
  if (!supabase) return res.status(500).json({ ok: false, error: 'Supabase not configured on server' });
  const params = Object.fromEntries(reqUrl.searchParams.entries());
  try {
    let result;
    switch (action) {
      case 'get_comment':
        result = await handleGetComments(supabase, shopId, params);
        break;
      case 'reply_comment':
        if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'POST required' });
        result = await handleReplyComment(supabase, shopId, req.body);
        break;
      case 'auto_reply':
        result = await handleAutoReply(supabase, reqUrl, req);
        break;
      default:
        return res.status(400).json({ ok: false, error: `Unknown action: ${action}`, available: ['get_comment', 'reply_comment', 'auto_reply'] });
    }
    return res.status(200).json(result);
  } catch (err) {
    return res.status(200).json({ ok: false, error: err.message || 'Internal server error' });
  }
}
