/**
 * Shopee Open Platform v2 — Auth URL Generator
 *
 * Chạy: node scripts/shopee-auth.mjs
 *
 * Sẽ in ra link auth → mở trên trình duyệt → đăng nhập shop → Confirm
 * Shopee redirect về stellakinetics.space với ?code=...&shop_id=...
 */
import crypto from 'crypto';

const PARTNER_ID  = 2035068;
const PARTNER_KEY = 'shpk6444466a5871535a5271646a54766f57674e5a786c62554179666f78646d';
const HOST        = 'https://partner.shopeemobile.com';
const REDIRECT    = 'https://stellakinetics.space/shopee-callback';

// ── Generate sign ────────────────────────────────────────────────────────
const path      = '/api/v2/shop/auth_partner';
const timestamp = Math.floor(Date.now() / 1000);
const baseStr   = PARTNER_ID.toString() + path + timestamp.toString();
const sign      = crypto.createHmac('sha256', PARTNER_KEY).update(baseStr).digest('hex');

const authUrl = `${HOST}${path}?partner_id=${PARTNER_ID}&timestamp=${timestamp}&sign=${sign}&redirect=${encodeURIComponent(REDIRECT)}`;

console.log('');
console.log('═══════════════════════════════════════════════════');
console.log('  SHOPEE SHOP AUTHORIZATION');
console.log('═══════════════════════════════════════════════════');
console.log('');
console.log('Mở link bên dưới trên trình duyệt:');
console.log('');
console.log(authUrl);
console.log('');
console.log('→ Đăng nhập shop Shopee');
console.log('→ Bấm "Confirm Authorization"');
console.log('→ Shopee sẽ redirect về stellakinetics.space');
console.log('→ Copy toàn bộ URL trên thanh address bar');
console.log('');
console.log('═══════════════════════════════════════════════════');
