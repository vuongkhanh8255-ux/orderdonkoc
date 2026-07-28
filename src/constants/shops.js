// src/constants/shops.js
//
// Danh sách GIAN HÀNG + BRAND dùng chung cho nhóm CSKH (SP lỗi, khiếu nại, voucher…).
// Theo feedback CS: cần chọn ĐÚNG tên gian (VD "Shopee Milaganics", "TikTok Moaw Moaws")
// chứ không chỉ Shopee/TikTok chung chung. Tên gian khớp đúng dữ liệu đã sync trong DB
// (shopee_orders.shop_name / tiktok_affiliate_sync_meta.seller_name) để đối chiếu được.

export const SHOPS = [
  // Shopee
  { san: 'shopee', name: 'eHerb Việt Nam', brand: 'EHERB' },
  { san: 'shopee', name: 'eHerb Hồ Chí Minh', brand: 'EHERB HCM' },
  { san: 'shopee', name: 'Moaw Moaws', brand: 'MOAW MOAWS' },
  { san: 'shopee', name: 'Milaganics', brand: 'MILAGANICS' },
  { san: 'shopee', name: 'Bodymiss Việt Nam', brand: 'BODYMISS' },
  { san: 'shopee', name: 'Masube', brand: 'MASUBE' },
  // TikTok
  { san: 'tiktok', name: 'eHerb Viet Nam', brand: 'EHERB' },
  { san: 'tiktok', name: 'eHerb Hồ Chí Minh', brand: 'EHERB HCM' },
  { san: 'tiktok', name: 'Moaw Moaws Việt Nam', brand: 'MOAW MOAWS' },
  { san: 'tiktok', name: 'Body Miss Việt Nam', brand: 'BODYMISS' },
  { san: 'tiktok', name: 'Milaganics Việt Nam', brand: 'MILAGANICS' },
  { san: 'tiktok', name: 'Healmii Việt Nam', brand: 'HEALMII' },
  { san: 'tiktok', name: 'Real Steel Việt Nam', brand: 'REAL STEEL' },
];

export const BRANDS = ['BODYMISS', 'MILAGANICS', 'MOAW MOAWS', 'EHERB', 'EHERB HCM', 'HEALMII', 'REAL STEEL', 'MASUBE'];

// ⚠️ CÓ GIAN TRÙNG TÊN Y HỆT Ở 2 SÀN ("eHerb Hồ Chí Minh" có cả bên Shopee lẫn TikTok).
// Nên KHÔNG được tra gian bằng mỗi cái tên — `SHOPS.find(s => s.name === ...)` luôn vớ phải
// Shopee (đứng trước), làm chọn "TikTok eHerb Hồ Chí Minh" bị nhảy sang Shopee (CS báo 28/7).
// Dropdown phải dùng shopKey (sàn|tên) làm value rồi tra bằng findShopByKey.
export const shopKey = (sh) => `${sh.san}|${sh.name}`;
export const findShopByKey = (key) => {
  const [san, ...rest] = String(key || '').split('|');
  const name = rest.join('|');
  return SHOPS.find(s => s.san === san && s.name === name) || null;
};

export const sanLabel = (s) => (s === 'shopee' ? 'Shopee' : s === 'tiktok' ? 'TikTok' : s || '');
/** Nhãn đầy đủ để CS nhìn phát biết ngay: "Shopee · Milaganics" */
export const shopLabel = (sh) => `${sanLabel(sh.san)} · ${sh.name}`;
/** Suy brand từ tên gian (khi dòng cũ chưa có cột brand) */
export const brandOfShop = (name) => SHOPS.find(s => s.name === name)?.brand || '';
