import crypto from 'crypto';

const PARTNER_ID = 2035068;
const HOST       = 'https://partner.shopeemobile.com';

/**
 * GET /api/shopee/auth
 *
 * Generates a Shopee OAuth URL and redirects the user.
 * The redirect_url points back to /api/shopee/callback on the same host.
 */
export default async function handler(req, res) {
  const partnerKey = process.env.SHOPEE_PARTNER_KEY?.trim();

  if (!partnerKey) {
    return res.status(500).json({ error: 'SHOPEE_PARTNER_KEY chưa set trên Vercel' });
  }

  // Redirect URL phải trùng với URL đã đăng ký trong Shopee Partner Center
  const host     = req.headers.host || 'koc-tool.vercel.app';
  const redirect = `https://${host}/shopee-callback`;

  const path      = '/api/v2/shop/auth_partner';
  const timestamp = Math.floor(Date.now() / 1000);
  const baseStr   = PARTNER_ID.toString() + path + timestamp.toString();
  const sign      = crypto.createHmac('sha256', partnerKey).update(baseStr).digest('hex');

  const authUrl = `${HOST}${path}?partner_id=${PARTNER_ID}&timestamp=${timestamp}&sign=${sign}&redirect=${encodeURIComponent(redirect)}`;

  res.redirect(302, authUrl);
}
