// PHÂN LOẠI SẢN PHẨM (danh sách CS gửi 22/7) — DÙNG CHUNG cho Module 1B Đánh giá sàn
// và Module 2 Trả hàng, để 2 nơi luôn phân loại giống hệt nhau.
// >>> Thêm/bớt/sửa phân loại thì CHỈ sửa mảng PRODUCT_CATEGORIES dưới đây. <<<

export const PRODUCT_CATEGORIES = [
  'DARK NIGHT', 'BE LOVER', 'BLINDED LOVE', 'LOVE WINS', 'SUNSET', 'HIDE N SEEK', 'STOP N STARE',
  'FUNKY FRESH', 'PARADISE', 'ĐỘC LẬP', 'TỰ DO', 'HẠNH PHÚC', 'CARE FREE', 'IRICH', 'TALK2MUCH',
  'MONEY HONEY', 'PHÊFAIRY', 'SAYDERELLA', 'MÊMAND', 'AURA TEARS', 'BLACK QUEEN', 'DARK VELVET',
  'GAME ON', 'FREE FLOW', 'SWIFT MOVE', 'FRIEND ZONE', 'LOFI', 'SHAYMEN', '18 ANOTHER TOUCH',
  '18 SCANDAL LUST', 'LOTION REALSTEEL', 'SERUM STANDARD', 'SERUM ULTRA', 'NƯỚC HOA REVOLT',
  'NƯỚC HOA SILENT', 'LIPCERIN BLOOM', 'LIPCERIN VITA', 'MẶT NẠ ĐẬU NÀNH', 'MẶT NẠ ĐẬU ĐỎ',
  'SCRUB MÔI MASUBE', 'GOOD CARE', 'GOOD MOOD', 'GOOD HUG', 'MUỐI TINH THẦN', 'MUỐI TÀI LỘC',
  'MUỐI TÌNH YÊU', 'GEL NHA ĐAM B5', 'GEL NHA ĐAM', 'SCRUB NÁCH DÂU TẰM', 'SCRUB NÁCH HẠNH NHÂN',
  'LOVE OIL', 'CHILL OIL', 'SCRUB HẠNH NHÂN', 'DẦU OLIU BHA', 'BỘT Ủ TRẮNG', 'XỊT BƯỞI',
  'TONER HOA CÚC NEW', 'TẨY TRANG', 'SRM HOA CÚC', 'SUNKISSED', 'SERUM SACHI', 'SCRUB MUỐI HỒNG',
  'SCRUB AHA - BHA', 'MẶT NẠ TRÀM TRÀ', 'MẶT NẠ HOA CÚC', 'GỘI BƯỞI', 'XẢ BƯỞI', 'BỘT MẶT NẠ',
  'BODY OIL', 'SON DƯỠNG', 'Ủ BƯỞI',
];

export const noAccent = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toUpperCase();

// Chuẩn hoá: bỏ dấu, "&"/"and" -> "N" (sàn ghi "HIDE & SEEK", CS ghi "HIDE N SEEK"),
// mọi ký tự lạ -> khoảng trắng (nên "SCRUB AHA - BHA" khớp được "Scrub AHA/BHA").
const catNorm = (s) => noAccent(s || '')
  .replace(/&/g, ' N ').replace(/\bAND\b/g, ' N ')
  .replace(/[^A-Z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();

// Tên khác của cùng 1 SP mà sàn hay đặt (trái: tên trên sàn -> phải: phân loại của CS)
const CAT_ALIASES = [['GEL LO HOI', 'GEL NHA ĐAM']];

// Vòng 1: khớp NGUYÊN CỤM (dài trước, nên "GEL NHA ĐAM B5" không bị "GEL NHA ĐAM" nuốt)
const CAT_PHRASE = [
  ...PRODUCT_CATEGORIES.map(c => [catNorm(c), c]),
  ...CAT_ALIASES.map(([a, c]) => [catNorm(a), c]),
].sort((a, b) => b[0].length - a[0].length);

// Vòng 2: khớp ĐỦ TỪ dù nằm rời nhau ("Dầu oliu dưỡng da BHA" -> DẦU OLIU BHA).
// Chỉ nhận phân loại từ 2 chữ trở lên và mỗi chữ >= 3 ký tự, tránh "TỰ DO"/"Ủ BƯỞI" khớp bừa.
const CAT_TOKENS = PRODUCT_CATEGORIES
  .map(c => [c, catNorm(c).split(' ')])
  .filter(([, t]) => t.length >= 2 && t.every(w => w.length >= 3))
  .sort((a, b) => b[1].length - a[1].length);

/** Đoán phân loại SP từ tên sản phẩm (+ mẫu/SKU nếu có). Trả '' nếu không nhận ra. */
export const autoProductCategory = (productName, sku) => {
  const s = ` ${catNorm(`${productName || ''} ${sku || ''}`)} `;
  for (const [needle, cat] of CAT_PHRASE) if (s.includes(` ${needle} `)) return cat;
  for (const [cat, tokens] of CAT_TOKENS) if (tokens.every(w => s.includes(` ${w} `))) return cat;
  return '';
};
