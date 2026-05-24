/**
 * api/tiktok-shop/sync-reviews.js
 *
 * Vercel serverless — GET/POST /api/tiktok-shop/sync-reviews
 *
 * Sync TikTok Shop Product Reviews → Supabase tiktok_shop_reviews
 *
 * Uses: POST /review_rating/202605/product_reviews/search
 * Docs: https://partner.tiktokshop.com/docv2/page/get-product-reviews-202605
 *
 * Query params:
 *   shop_id     — (optional) sync specific shop only
 *   page_size   — reviews per page (default 50, max 100)
 *   full_sync   — "1" to sync all reviews (more pages)
 *   days        — number of days back to sync (default 7, full_sync ignores)
 *
 * Cron: runs daily at 5am VN (22:00 UTC)
 */

import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const TIKTOK_BASE = 'https://open-api.tiktokglobalshop.com';
const REVIEWS_PATH = '/review_rating/202605/product_reviews/search';
const PRODUCTS_PATH = '/product/202309/products/search';

// ── TikTok HMAC Sign (POST requests must include body in signature) ──────────
const buildSign = (appSecret, path, urlParams, body = '') => {
  const keys = Object.keys(urlParams)
    .filter(k => k !== 'sign' && k !== 'access_token')
    .sort();
  const paramStr = keys.map(k => `${k}${urlParams[k]}`).join('');
  const base = `${appSecret}${path}${paramStr}${body}${appSecret}`;
  return crypto.createHmac('sha256', appSecret).update(base).digest('hex');
};

// ── Fetch with timeout ─────────────────────────────────────────────────────────
const fetchWithTimeout = async (url, options = {}, timeoutMs = 25000) => {
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: ctrl.signal });
    clearTimeout(tid);
    const text = await res.text();
    try { return JSON.parse(text); }
    catch { return { code: -1, message: `Parse error: ${text.slice(0, 500)}` }; }
  } catch (e) {
    clearTimeout(tid);
    return { code: -1, message: `Fetch error: ${e.message}` };
  }
};

// ── Get product list from shop ────────────────────────────────────────────────
const fetchProducts = async ({ appKey, appSecret, accessToken, shopCipher, pageSize = 100, pageToken }) => {
  const ts = String(Math.floor(Date.now() / 1000));

  const bodyObj = { page_size: pageSize };
  const bodyStr = JSON.stringify(bodyObj);

  const urlParams = {
    app_key: appKey,
    timestamp: ts,
    page_size: String(pageSize),
  };
  if (shopCipher) urlParams.shop_cipher = shopCipher;
  if (pageToken) urlParams.page_token = pageToken;

  urlParams.sign = buildSign(appSecret, PRODUCTS_PATH, urlParams, bodyStr);

  const qs = new URLSearchParams(urlParams);
  const url = `${TIKTOK_BASE}${PRODUCTS_PATH}?${qs.toString()}`;

  return fetchWithTimeout(url, {
    method: 'POST',
    headers: {
      'x-tts-access-token': accessToken,
      'content-type': 'application/json',
    },
    body: bodyStr,
  });
};

// ── Fetch reviews for a batch of product IDs ──────────────────────────────────
const fetchReviewsBatch = async ({
  appKey, appSecret, accessToken, shopCipher,
  productIds, pageSize = 50, pageToken,
  reviewStartTime, reviewEndTime,
}) => {
  const ts = String(Math.floor(Date.now() / 1000));

  // Build body first (needed for sign)
  const bodyObj = {};
  if (productIds?.length > 0) {
    bodyObj.tiktok_product_ids = productIds.map(String);
  }
  if (reviewStartTime) bodyObj.review_start_time = reviewStartTime;
  if (reviewEndTime) bodyObj.review_end_time = reviewEndTime;
  const bodyStr = JSON.stringify(bodyObj);

  const urlParams = {
    app_key: appKey,
    timestamp: ts,
    page_size: String(pageSize),
    sort_field: 'create_time',
    sort_order: 'DESC',
  };
  if (shopCipher) urlParams.shop_cipher = shopCipher;
  if (pageToken) urlParams.page_token = pageToken;

  // Include body in HMAC signature for POST requests
  urlParams.sign = buildSign(appSecret, REVIEWS_PATH, urlParams, bodyStr);

  const qs = new URLSearchParams(urlParams);
  const url = `${TIKTOK_BASE}${REVIEWS_PATH}?${qs.toString()}`;

  return fetchWithTimeout(url, {
    method: 'POST',
    headers: {
      'x-tts-access-token': accessToken,
      'content-type': 'application/json',
    },
    body: bodyStr,
  });
};

// ── Parse review from API response ────────────────────────────────────────────
const parseReview = (item, shopId, sellerName) => {
  // Response: each item has a "review" object
  const r = item.review || item;

  const reviewId = r.review_id || null;
  const rating = (typeof r.rating === 'number' && r.rating >= 1 && r.rating <= 5) ? r.rating : null;
  const title = r.title || '';
  const content = r.content || '';
  const reviewText = title ? `${title}\n${content}` : content;
  const productId = r.tiktok_product_id || r.external_product_id || '';
  const orderId = r.order_id || '';
  const sellerSku = r.seller_sku || '';
  const productName = r.product_name || '';

  // Review media — array of image/video objects
  const reviewMedia = r.review_media || [];
  const images = reviewMedia.map(m => m.url || m.media_url || '').filter(Boolean);

  // Timestamps
  let reviewAt = r.create_time || r.review_time || null;
  if (reviewAt && typeof reviewAt === 'number') {
    reviewAt = reviewAt > 1e12
      ? new Date(reviewAt).toISOString()
      : new Date(reviewAt * 1000).toISOString();
  } else if (typeof reviewAt === 'string' && !reviewAt.includes('T')) {
    reviewAt = new Date(reviewAt).toISOString();
  }

  // Seller reply
  const reply = r.seller_reply || r.reply || null;
  let sellerReply = null;
  let replyAt = null;
  if (reply && typeof reply === 'object') {
    sellerReply = reply.content || reply.text || null;
    replyAt = reply.create_time || reply.reply_time || null;
  } else if (typeof reply === 'string') {
    sellerReply = reply;
  }

  if (replyAt && typeof replyAt === 'number') {
    replyAt = replyAt > 1e12
      ? new Date(replyAt).toISOString()
      : new Date(replyAt * 1000).toISOString();
  }

  return {
    shop_id: shopId,
    seller_name: sellerName,
    review_id: reviewId ? String(reviewId) : `${shopId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    order_id: orderId ? String(orderId) : null,
    product_id: productId ? String(productId) : null,
    product_name: productName,
    sku_name: sellerSku || null,
    rating,
    review_text: reviewText,
    reviewer_name: r.buyer_name || r.reviewer_name || '',
    reviewer_avatar: r.buyer_avatar || r.reviewer_avatar || null,
    review_images: images,
    seller_reply: sellerReply,
    reply_at: replyAt,
    review_at: reviewAt || new Date().toISOString(),
    is_replied: !!(sellerReply || replyAt),
    platform: 'TikTok',
    raw_data: r,
    synced_at: new Date().toISOString(),
  };
};

// ── Date helpers ─────────────────────────────────────────────────────────────
const toISO = (d) => d.toISOString().replace(/\.\d{3}Z$/, 'Z'); // "2026-03-25T10:45:00Z"

// ── Main handler ────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  const started = Date.now();
  console.log('[sync-reviews] Starting...');

  const appKey    = (process.env.TIKTOK_ANALYTICS_APP_KEY    || process.env.TIKTOK_SHOP_APP_KEY)?.trim();
  const appSecret = (process.env.TIKTOK_ANALYTICS_APP_SECRET || process.env.TIKTOK_SHOP_APP_SECRET)?.trim();
  const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL)?.trim();
  const supabaseKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY)?.trim();

  if (!appKey || !appSecret || !supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Missing env config', details: { appKey: !!appKey, appSecret: !!appSecret, supabaseUrl: !!supabaseUrl, supabaseKey: !!supabaseKey } });
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  // ── Parse params ────────────────────────────────────────────────────────────
  const params = { ...req.query, ...(req.body || {}) };
  const targetShopId = params.shop_id || null;
  const pageSize = Math.min(100, Math.max(1, parseInt(params.page_size) || 50));
  const fullSync = params.full_sync === '1';
  const daysBack = parseInt(params.days) || 7;

  // Date range for filtering
  let reviewStartTime = null;
  let reviewEndTime = null;
  if (!fullSync) {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack);
    reviewStartTime = toISO(startDate);
    reviewEndTime = toISO(endDate);
  }

  console.log(`[sync-reviews] fullSync=${fullSync}, daysBack=${daysBack}, pageSize=${pageSize}`);
  if (reviewStartTime) console.log(`[sync-reviews] Date range: ${reviewStartTime} → ${reviewEndTime}`);

  // ── Get connections ────────────────────────────────────────────────────────
  let connections = [];
  const { data: analyticsConns } = await supabase
    .from('tiktok_analytics_connections')
    .select('access_token, shop_cipher, shop_id, seller_name')
    .not('access_token', 'is', null);

  if (analyticsConns?.length > 0) {
    connections = analyticsConns;
  } else {
    const { data: orderConns } = await supabase
      .from('tiktok_shop_connections')
      .select('access_token, shop_cipher, shop_id, seller_name')
      .not('access_token', 'is', null)
      .not('shop_cipher', 'is', null);
    connections = orderConns || [];
  }

  if (targetShopId) {
    connections = connections.filter(c => c.shop_id === targetShopId);
  }

  if (!connections.length) {
    return res.status(200).json({ success: true, message: 'No connections found', synced: 0 });
  }

  // ── Sync each shop ─────────────────────────────────────────────────────────
  const results = [];
  let totalUpserted = 0;

  for (const conn of connections) {
    const shopLabel = conn.seller_name || conn.shop_id;
    console.log(`[sync-reviews] Processing shop: ${shopLabel}`);

    let shopUpserted = 0;
    let shopError = null;
    let productsFound = 0;

    try {
      // ── Step 1: Get product IDs from shop ──────────────────────────────
      const allProductIds = [];
      let prodPageToken = null;
      let prodPageNum = 0;
      const maxProdPages = fullSync ? 20 : 5;

      do {
        prodPageNum++;
        const prodResp = await fetchProducts({
          appKey, appSecret,
          accessToken: conn.access_token,
          shopCipher: conn.shop_cipher,
          pageSize: 100,
          pageToken: prodPageToken,
        });

        if (prodResp?.code !== 0) {
          console.log(`[sync-reviews] Product list error: code=${prodResp?.code}, msg=${prodResp?.message?.slice(0, 200)}`);
          shopError = `Product list: ${prodResp?.message || `code ${prodResp?.code}`}`;
          break;
        }

        const products = prodResp?.data?.products || [];
        products.forEach(p => {
          const pid = p.id || p.product_id;
          if (pid) allProductIds.push(String(pid));
        });

        prodPageToken = prodResp?.data?.next_page_token || null;
        console.log(`[sync-reviews] ${shopLabel} products page ${prodPageNum}: ${products.length} products`);

        if (!prodPageToken || products.length === 0) break;
      } while (prodPageNum < maxProdPages);

      productsFound = allProductIds.length;
      console.log(`[sync-reviews] ${shopLabel}: ${productsFound} total products`);

      if (productsFound === 0) {
        shopError = shopError || 'No products found in shop';
        results.push({ shop_id: conn.shop_id, seller_name: conn.seller_name, products: 0, upserted: 0, error: shopError });
        continue;
      }

      // ── Step 2: Fetch reviews in batches of 50 product IDs ────────────
      const batchSize = 50; // API max per request
      const maxReviewPages = fullSync ? 20 : 5;

      for (let i = 0; i < allProductIds.length; i += batchSize) {
        const batchIds = allProductIds.slice(i, i + batchSize);
        let pageToken = null;
        let pageNum = 0;

        do {
          pageNum++;
          const resp = await fetchReviewsBatch({
            appKey, appSecret,
            accessToken: conn.access_token,
            shopCipher: conn.shop_cipher,
            productIds: batchIds,
            pageSize,
            pageToken,
            reviewStartTime,
            reviewEndTime,
          });

          // Handle response — may have nested data structure
          const outerCode = resp?.code;
          if (outerCode !== 0 && outerCode !== undefined) {
            const msg = resp?.message || `code ${outerCode}`;
            console.error(`[sync-reviews] API error: ${msg}`);
            // Error 32002017 = app not authorized for this API
            if (outerCode === 32002017 || resp?.code === 32002017) {
              shopError = 'App chưa được cấp quyền Reviews API. Vào Partner Center → App Management → thêm quyền "Reviews and ratings".';
            } else {
              shopError = msg;
            }
            break;
          }

          // TikTok may nest: resp.data.data.reviews or resp.data.reviews
          const innerData = resp?.data?.data || resp?.data || {};
          const reviewItems = innerData.reviews || [];

          if (reviewItems.length === 0) {
            console.log(`[sync-reviews] ${shopLabel} batch ${Math.floor(i/batchSize)+1} page ${pageNum}: 0 reviews`);
            break;
          }

          // Parse reviews
          const parsed = reviewItems.map(item => parseReview(item, conn.shop_id, conn.seller_name));

          // Upsert to Supabase
          if (parsed.length > 0) {
            const { error: upsertErr } = await supabase
              .from('tiktok_shop_reviews')
              .upsert(parsed, { onConflict: 'shop_id,review_id' });

            if (upsertErr) {
              console.error(`[sync-reviews] Upsert error:`, upsertErr.message);
              shopError = upsertErr.message;
            } else {
              shopUpserted += parsed.length;
            }
          }

          console.log(`[sync-reviews] ${shopLabel} batch ${Math.floor(i/batchSize)+1} page ${pageNum}: ${reviewItems.length} reviews`);

          // Pagination
          pageToken = innerData.next_page_token || null;
          if (!pageToken || reviewItems.length < pageSize) break;

        } while (pageNum < maxReviewPages);

        // If we hit an auth error, stop processing this shop
        if (shopError?.includes('cấp quyền')) break;
      }

    } catch (err) {
      shopError = err.message;
      console.error(`[sync-reviews] Exception for ${shopLabel}:`, err.message);
    }

    totalUpserted += shopUpserted;
    results.push({
      shop_id: conn.shop_id,
      seller_name: conn.seller_name,
      products: productsFound,
      upserted: shopUpserted,
      error: shopError,
    });
  }

  const elapsed = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`[sync-reviews] Done in ${elapsed}s. Total upserted: ${totalUpserted}`);

  return res.status(200).json({
    success: !results.every(r => r.error),
    source: 'partner_api',
    endpoint_used: `POST ${REVIEWS_PATH}`,
    total_upserted: totalUpserted,
    shops: results,
    elapsed_seconds: Number(elapsed),
    synced_at: new Date().toISOString(),
  });
}
