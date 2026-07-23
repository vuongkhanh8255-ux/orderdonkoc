import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '../supabaseClient';

const STAR_COLORS = { 5: '#22c55e', 4: '#84cc16', 3: '#eab308', 2: '#ff7a30', 1: '#ef4444' };
const PAGE_SIZE = 20;

// ── Module 1 CSKH: phân loại lý do + trạng thái xử lý + đã sửa đánh giá (lưu ở bảng review_cs_meta) ──
const REASON_CATEGORIES = ['Chê sản phẩm', 'Kích ứng / Dị ứng', 'Không hiệu quả', 'Giao hàng chậm', 'Sai hàng', 'Thiếu hàng', 'Đóng gói', 'Shipper', 'Spam', 'Hiểu nhầm', 'Không nhận xét'];
const FIXED_OPTIONS = [{ v: 'chua_sua', l: 'Chưa sửa' }, { v: 'da_sua_4', l: 'Đã sửa 4★' }, { v: 'da_sua_5', l: 'Đã sửa 5★' }];
// CS TỰ PHÂN LOẠI nhóm sản phẩm (lưu vào review_cs_meta.product_category).
// >>> CS gửi danh sách chuẩn thì SỬA ĐÚNG MẢNG NÀY là xong, không cần đụng chỗ khác. <<<
const PRODUCT_CATEGORIES = ['Sữa rửa mặt', 'Toner', 'Serum / Tinh chất', 'Kem dưỡng', 'Chống nắng', 'Tẩy trang', 'Mặt nạ', 'Trị mụn', 'Tắm gội', 'Dưỡng thể / Body', 'Nước hoa / Bodymist', 'Thực phẩm chức năng', 'Khác'];

// (21/7/2026) SỬA MAP SAI: 341325550 + 831509831 trước đây bị ghi nhầm là "Milaganics FBS/SPA",
// thực tế là 2 gian eHerb (đối chiếu shop_name trong shopee_orders: "eHerb Việt Nam" 29k đơn,
// "eHerb Hồ Chí Minh" 4.3k đơn) -> vừa mất tên gian, vừa đếm nhầm đánh giá eHerb sang brand Milaganics.
const SHOP_MAP = {
  // Shopee (seller_id ngắn)
  '1031859035': 'Bodymiss', '1243148826': 'Milaganics',
  '341325550': 'eHerb', '831509831': 'eHerb HCM',
  '1017289279': 'Moaw Moaws', '1616999364': 'Masube',
  // TikTok (seller_id dài)
  '7495107349171898427': 'Bodymiss', '7494529979361168222': 'eHerb',
  '7495838925500090511': 'eHerb HCM', '7495831977917385095': 'Moaw Moaws',
  '7494813818973817115': 'Milaganics', '7494251668499498533': 'Healmii',
  '7496180170889726491': 'Real Steel',
};
const shopName = (id) => SHOP_MAP[id] || id;
// Brand theo GIAN = tên shop bỏ hậu tố sàn/loại (eHerb HCM→eHerb) — chỉ dùng làm phương án dự phòng.
const brandOf = (shop) => (shop || '').replace(/\s+(FBS|SPA|HCM|Mall|MP|Mp)\b.*$/i, '').trim() || (shop || '—');

// (22/7) BRAND suy từ TÊN SẢN PHẨM — theo CS: "brand BODYMISS là nhiều shop bán, lọc brand là ra
// hết các đánh giá chứ không cần lọc theo từng shop". Tên SP không nhận ra brand nào thì mới
// rơi về brand của gian bán. Thêm brand mới -> thêm 1 dòng vào BRAND_KEYS.
const BRAND_KEYS = [
  ['BODYMISS', 'BODYMISS'], ['BODY MISS', 'BODYMISS'],
  ['MILAGANICS', 'MILAGANICS'], ['MILAGANIC', 'MILAGANICS'],
  ['EHERB', 'EHERB'], ['E HERB', 'EHERB'],
  ['MOAW', 'MOAW MOAWS'],
  ['HEALMII', 'HEALMII'], ['HEALMI', 'HEALMII'],
  ['REAL STEEL', 'REAL STEEL'], ['REALSTEEL', 'REAL STEEL'],
  ['MASUBE', 'MASUBE'],
];
const noAccent = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toUpperCase();
const brandOfProduct = (productName, fallbackShop) => {
  const s = noAccent(productName);
  for (const [key, brand] of BRAND_KEYS) if (s.includes(key)) return brand;
  const fb = brandOf(fallbackShop || '');
  return fb && fb !== '—' ? noAccent(fb) : '(không rõ)';
};

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function fmtNum(n) {
  return n.toLocaleString('vi-VN');
}
function truncate(s, max = 60) {
  if (!s || s.length <= max) return s || '';
  return s.slice(0, max) + '…';
}

const MAX_RANGE_DAYS = 62;   // cho phép tới ~2 tháng (tự chia thành các đợt ≤7 ngày khi tải)
const CHUNK_DAYS = 7;        // ERP proxy tối ưu cho cửa sổ ~1 tuần → range dài chia thành nhiều đợt

const toYmd = (d) => {
  const dt = d instanceof Date ? d : new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
};

// (21/7/2026) BỎ ẩn 341325550 + 831509831: HOÁ RA đó là 2 gian eHerb Shopee, trước bị map nhầm tên
// thành "Milaganics FBS/SPA" rồi ẩn oan -> đúng cái "thiếu data eHerb Shopee" CS kêu (1.346 đánh giá T7).
// Muốn ẩn gian nào thì thêm seller_id vào Set này.
const EXCLUDED_SELLERS = new Set([]);

// Ngày review → 'YYYY-MM-DD' an toàn (ISO / ms / unix-giây đều xử lý được, không parse được thì trả '')
const reviewYmd = (d) => {
  if (d == null || d === '') return '';
  let ms = d;
  if (typeof d === 'number' && d < 1e12) ms = d * 1000; // unix giây → ms
  const dt = new Date(ms);
  return isNaN(dt.getTime()) ? '' : toYmd(dt);
};

// Chuẩn hoá 1 batch dữ liệu ERP (shopee + tiktok) về cùng shape review
function normalizeChunk(data) {
  const out = [];
  if (data.shopee?.data) {
    for (const r of data.shopee.data) {
      if (EXCLUDED_SELLERS.has(String(r.seller_id))) continue;
      out.push({
        id: `s-${r.commentId}`,
        platform: 'shopee',
        orderCode: r.orderSn || (r.orderId ? String(r.orderId) : ''),
        orderId: r.orderId ? String(r.orderId) : '',
        userId: r.userId ? String(r.userId) : '',
        productId: String(r.productId || r.itemId),
        productName: r.productName || '',
        productImage: r.productCover ? `https://cf.shopee.vn/file/${r.productCover}_tn` : '',
        sku: r.modelName?.split('|')[0]?.trim() || '',
        star: Number(r.ratingStar) || 0,
        comment: r.comment || '',
        userName: r.userName || '',
        date: r.ctime,
        hasReply: !!r.reply,
        replyText: r.reply?.comment || '',
        sellerId: r.seller_id,
        shop: shopName(r.seller_id),
        shopKey: `shopee-${r.seller_id}`,
        brand: brandOfProduct(r.productName || '', shopName(r.seller_id)),
        images: Array.isArray(r.images)
          ? r.images.map(h => (typeof h === 'string' && h.startsWith('http')) ? h : `https://cf.shopee.vn/file/${h}`)
          : [],
      });
    }
  }
  if (data.tiktok?.data) {
    for (const r of data.tiktok.data) {
      if (EXCLUDED_SELLERS.has(String(r.seller_id))) continue;
      out.push({
        id: `t-${r.main_review_id}`,
        platform: 'tiktok',
        orderCode: r.order_id ? String(r.order_id) : '',
        orderId: '',
        userId: '',
        productId: r.product_info?.product_id || '',
        productName: r.product_info?.product_name || '',
        productImage: r.product_info?.img?.thumb_url_list?.[0] || '',
        sku: r.product_info?.sku_specification || '',
        star: Number(r.star_level) || 0,
        comment: r.only_star ? '' : (r.review_text || ''),
        userName: r.user_name || '',
        date: r.review_time,
        hasReply: r.reply_count > 0 || !!r.reply_text,
        replyText: r.reply_text || '',
        sellerId: r.seller_id,
        shop: shopName(r.seller_id),
        shopKey: `tiktok-${r.seller_id}`,
        brand: brandOfProduct(r.product_info?.product_name || '', shopName(r.seller_id)),
        images: [], // TikTok chỉ trả cờ has_imgs, không kèm URL ảnh review
      });
    }
  }
  return out;
}

export default function ReviewsTab() {
  const today = new Date().toISOString().split('T')[0];
  const weekAgo = new Date(Date.now() - 6 * 86400000).toISOString().split('T')[0];

  const [startDate, setStartDate] = useState(weekAgo);
  const [endDate, setEndDate] = useState(today);
  const [platform, setPlatform] = useState('both');
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [hasFetched, setHasFetched] = useState(false);
  const [progress, setProgress] = useState('');

  // (22/7) CHỌN NHIỀU cùng lúc: [] = tất cả. starSel = [1,2,3] lọc 1 lần; shopSel theo shopKey
  // (`sàn-sellerId`) nên chọn "Shopee Milaganics" KHÔNG kéo theo "TikTok Milaganics" nữa.
  const [starSel, setStarSel] = useState([]);
  const [shopSel, setShopSel] = useState([]);
  const [brandFilter, setBrandFilter] = useState('all');
  const toggleStar = (s) => { setStarSel(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]); setPage(1); };
  const toggleShop = (k) => { setShopSel(prev => prev.includes(k) ? prev.filter(x => x !== k) : [...prev, k]); setPage(1); };
  const [searchText, setSearchText] = useState('');
  const [replyFilter, setReplyFilter] = useState('all');
  const [sortBy, setSortBy] = useState('date_desc');
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState(null);

  // CSKH meta (phân loại/xử lý/đã sửa) — lưu ở review_cs_meta, key theo review id (s-/t-)
  const [metaMap, setMetaMap] = useState({});
  const [reasonFilter, setReasonFilter] = useState('all');
  const [handleFilter, setHandleFilter] = useState('all');
  const [fixedFilter, setFixedFilter] = useState('all');
  const [prodNameFilter, setProdNameFilter] = useState('all');   // lọc theo SẢN PHẨM
  const [skuFilter, setSkuFilter] = useState('all');             // lọc theo PHÂN LOẠI (SKU/mẫu)

  const didMount = useRef(false);
  const reviewsRef = useRef(null);
  const [productFilter, setProductFilter] = useState(null); // { productId, platform, productName } | null
  const [showProducts, setShowProducts] = useState(false);   // bảng thống kê SP thu gọn mặc định
  const focusReviews = () => { setTimeout(() => reviewsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60); };

  const fetchReviews = useCallback(async (sOverride, eOverride) => {
    const start = new Date(sOverride || startDate);
    const end = new Date(eOverride || endDate);
    const diff = (end - start) / 86400000;
    if (diff < 0) { setError('Ngày bắt đầu phải trước ngày kết thúc'); return; }
    if (diff > MAX_RANGE_DAYS) { setError(`Khoảng thời gian tối đa là ${MAX_RANGE_DAYS} ngày`); return; }

    setLoading(true);
    setError('');
    setProgress('');
    try {
      // Chia range thành các đợt ~7 ngày. MỐC ĐỢT SAU = mốc đợt trước kết thúc → tile khít
      // khoảng [start,end] dù ERP hiểu end là inclusive hay exclusive (phần trùng ở ranh giới
      // đã được dedupe theo id). Tải tuần tự rồi gộp.
      const chunks = [];
      const endMs = end.getTime();
      let cs = start.getTime();
      while (true) {
        const ceMs = Math.min(cs + CHUNK_DAYS * 86400000, endMs);
        chunks.push([toYmd(new Date(cs)), toYmd(new Date(ceMs))]);
        if (ceMs >= endMs) break;
        cs = ceMs;
      }

      const byId = new Map();
      for (let i = 0; i < chunks.length; i++) {
        if (chunks.length > 1) setProgress(`Đang tải đợt ${i + 1}/${chunks.length}...`);
        const [cStart, cEnd] = chunks[i];
        // Luôn tải CẢ 2 sàn → nút Shopee/TikTok lọc client-side tức thì (không cần tải lại)
        const res = await fetch(`/api/erp/reviews?platform=both&startDate=${cStart}&endDate=${cEnd}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!data.success) throw new Error(data.error || 'Lỗi tải dữ liệu');
        for (const r of normalizeChunk(data)) byId.set(r.id, r);
        // NHẢ luồng cho trình duyệt "thở" giữa các đợt: mỗi đợt ~5-6MB JSON, tải cả tháng ~28MB.
        // Không nhả thì Chrome báo "Trang không phản hồi" dù thực ra vẫn đang chạy.
        setProgress(`Đã tải ${byId.size.toLocaleString('vi-VN')} đánh giá (đợt ${i + 1}/${chunks.length})...`);
        await new Promise((r) => setTimeout(r, 0));
      }

      setReviews([...byId.values()]);
      setPage(1);
      setStarFilter(0);
      setProductFilter(null);
      setHasFetched(true);
    } catch (err) {
      setError(err.message);
      setHasFetched(true);
    } finally {
      setLoading(false);
      setProgress('');
    }
  }, [startDate, endDate]);

  useEffect(() => {
    if (!didMount.current) { didMount.current = true; fetchReviews(); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Tải nhãn CSKH cho các đánh giá đang hiển thị (chia đợt 300 tránh URL quá dài)
  // Tải nhãn CSKH 1 LẦN lúc vào trang. Bảng review_cs_meta chỉ chứa review ĐÃ gán nhãn (nhỏ),
  // nên tải hết theo trang nhẹ hơn nhiều so với chia đợt .in() theo hàng ngàn id (trước gây treo).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const m = {};
      for (let from = 0; from < 50000; from += 1000) {
        const { data, error } = await supabase.from('review_cs_meta').select('*').range(from, from + 999);
        if (error || !data || data.length === 0) break;
        data.forEach(x => { m[x.review_id] = x; });
        if (data.length < 1000) break;
        await new Promise((r) => setTimeout(r, 0));
      }
      if (!cancelled) setMetaMap(m);
    })().catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Lưu 1 nhãn CSKH cho 1 đánh giá → upsert review_cs_meta (optimistic)
  const updateMeta = async (r, patch) => {
    setMetaMap(prev => ({ ...prev, [r.id]: { review_id: r.id, platform: r.platform, handle_status: 'chua_xu_ly', fixed_status: 'chua_sua', ...(prev[r.id] || {}), ...patch } }));
    const { error } = await supabase.from('review_cs_meta')
      .upsert({ review_id: r.id, platform: r.platform, ...patch, updated_at: new Date().toISOString() }, { onConflict: 'review_id' });
    if (error) alert('Lưu không được: ' + error.message);
  };

  // Phạm vi dashboard theo nút Sàn (Shopee/TikTok/Tất cả) + khoảng ngày → MỌI thống kê bám theo
  const scoped = useMemo(() => reviews.filter(r => {
    if (platform !== 'both' && r.platform !== platform) return false;
    const d = reviewYmd(r.date);
    if (d && (d < startDate || d > endDate)) return false;
    return true;
  }), [reviews, platform, startDate, endDate]);

  // ── Stats ──
  const stats = useMemo(() => {
    const dist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    const byReason = {};
    let sum = 0, replied = 0, fixedCount = 0, handledCount = 0;
    const shopee = { total: 0, sum: 0, dist: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } };
    const tiktok = { total: 0, sum: 0, dist: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } };
    for (const r of scoped) {
      dist[r.star]++;
      sum += r.star;
      if (r.hasReply) replied++;
      const meta = metaMap[r.id];
      if (meta?.reason_category) byReason[meta.reason_category] = (byReason[meta.reason_category] || 0) + 1;
      if (meta?.fixed_status === 'da_sua_4' || meta?.fixed_status === 'da_sua_5') fixedCount++;
      if (meta?.handle_status === 'da_xu_ly') handledCount++;
      const p = r.platform === 'shopee' ? shopee : tiktok;
      p.total++; p.sum += r.star; p.dist[r.star]++;
    }
    const total = reviews.length;
    return {
      total, replied, dist, byReason, fixedCount, handledCount,
      avg: total ? (sum / total).toFixed(1) : '0.0',
      fiveStarPct: total ? ((dist[5] / total) * 100).toFixed(1) : '0.0',
      replyPct: total ? ((replied / total) * 100).toFixed(1) : '0.0',
      shopee: { ...shopee, avg: shopee.total ? (shopee.sum / shopee.total).toFixed(1) : '—' },
      tiktok: { ...tiktok, avg: tiktok.total ? (tiktok.sum / tiktok.total).toFixed(1) : '—' },
    };
  }, [scoped, metaMap]);

  // ── Product stats ──
  const productStats = useMemo(() => {
    const map = {};
    for (const r of scoped) {
      const key = `${r.platform}-${r.productId}`;
      if (!map[key]) {
        map[key] = {
          key, productId: r.productId, productName: r.productName,
          productImage: r.productImage, platform: r.platform,
          total: 0, sum: 0, replied: 0,
          dist: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
        };
      }
      map[key].total++;
      map[key].sum += r.star;
      map[key].dist[r.star]++;
      if (r.hasReply) map[key].replied++;
    }
    return Object.values(map)
      .map(p => ({ ...p, avg: (p.sum / p.total).toFixed(1) }))
      .sort((a, b) => b.total - a.total);
  }, [scoped]);

  // ── Shop stats ──
  const shopStats = useMemo(() => {
    const map = {};
    for (const r of scoped) {
      const key = `${r.platform}-${r.sellerId}`;
      if (!map[key]) {
        map[key] = {
          key, sellerId: r.sellerId, shop: r.shop, platform: r.platform,
          total: 0, sum: 0, replied: 0,
          dist: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
        };
      }
      map[key].total++;
      map[key].sum += r.star;
      map[key].dist[r.star]++;
      if (r.hasReply) map[key].replied++;
    }
    return Object.values(map)
      .map(s => ({ ...s, avg: (s.sum / s.total).toFixed(1) }))
      .sort((a, b) => b.total - a.total);
  }, [scoped]);

  // Danh sách GIAN tách theo sàn (shopKey duy nhất) — để chọn nhiều gian mà không dính nhầm sàn kia
  const shopList = useMemo(() => {
    const m = new Map();
    reviews.forEach(r => { if (!m.has(r.shopKey)) m.set(r.shopKey, { key: r.shopKey, label: r.shop, platform: r.platform }); });
    return Array.from(m.values()).sort((a, b) => a.label.localeCompare(b.label) || a.platform.localeCompare(b.platform));
  }, [reviews]);

  const brandList = useMemo(() => {
    const set = new Set(reviews.map(r => r.brand));   // brand theo TÊN SẢN PHẨM (gộp mọi gian)
    return ['all', ...Array.from(set).sort()];
  }, [reviews]);

  // ── Brand stats (gom nhiều shop cùng brand) ──
  const brandStats = useMemo(() => {
    const map = {};
    for (const r of scoped) {
      const brand = r.brand;
      if (!map[brand]) map[brand] = { brand, total: 0, sum: 0, replied: 0, dist: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }, shops: new Set() };
      const m = map[brand];
      m.total++; m.sum += r.star; m.dist[r.star]++; if (r.hasReply) m.replied++; m.shops.add(r.shop);
    }
    return Object.values(map)
      .map(b => ({ ...b, avg: (b.sum / b.total).toFixed(1), bad: b.dist[1] + b.dist[2] + b.dist[3], shopCount: b.shops.size }))
      .sort((a, b) => b.total - a.total);
  }, [scoped]);

  // Review xấu (1-3★) chưa phản hồi → tồn đọng cần xử lý
  const needFixCount = useMemo(() => scoped.filter(r => r.star <= 3 && !r.hasReply).length, [scoped]);

  // Top sản phẩm bị chê nhiều nhất (1-3★)
  const topBad = useMemo(() => productStats
    .map(p => ({ ...p, bad: p.dist[1] + p.dist[2] + p.dist[3] }))
    .filter(p => p.bad > 0)
    .sort((a, b) => b.bad - a.bad)
    .slice(0, 8), [productStats]);

  // Top phân loại lý do (CSKH)
  const topReasons = useMemo(() => Object.entries(stats.byReason).sort((a, b) => b[1] - a[1]), [stats.byReason]);

  // Danh sách SẢN PHẨM + PHÂN LOẠI (SKU) cho bộ lọc CS — xếp theo SỐ ĐÁNH GIÁ giảm dần
  // và cắt 300 mục: lọc cả tháng có thể ra hàng nghìn mục, render hết sẽ làm đơ trang.
  const topOf = (getKey) => {
    const m = {};
    scoped.forEach(r => { const k = getKey(r); if (k) m[k] = (m[k] || 0) + 1; });
    return ['all', ...Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 300).map(([k]) => k)];
  };
  const prodList = useMemo(() => topOf(r => r.productName), [scoped]);   // eslint-disable-line react-hooks/exhaustive-deps
  const skuList = useMemo(() => topOf(r => r.sku || '—'), [scoped]);     // eslint-disable-line react-hooks/exhaustive-deps

  // ── TOP XẤU (1-3★) — số CS cần để report ──
  const badScoped = useMemo(() => scoped.filter(r => r.star > 0 && r.star <= 3), [scoped]);
  const topBadReasons = useMemo(() => {
    const m = {};
    badScoped.forEach(r => { const k = metaMap[r.id]?.reason_category; if (k) m[k] = (m[k] || 0) + 1; });
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [badScoped, metaMap]);
  const topBadSku = useMemo(() => {
    const m = {};
    badScoped.forEach(r => { const k = r.sku || '(không phân loại)'; m[k] = (m[k] || 0) + 1; });
    return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 10);
  }, [badScoped]);
  const chuaPhanLoai = useMemo(() => badScoped.filter(r => !metaMap[r.id]?.reason_category).length, [badScoped, metaMap]);

  // ── Filtered reviews ──
  const filtered = useMemo(() => {
    let result = [...scoped]; // đã lọc sàn + ngày
    if (brandFilter !== 'all') result = result.filter(r => r.brand === brandFilter);
    if (shopSel.length) result = result.filter(r => shopSel.includes(r.shopKey));
    if (productFilter) result = result.filter(r => r.productId === productFilter.productId && r.platform === productFilter.platform);
    if (starSel.length) result = result.filter(r => starSel.includes(r.star));
    if (replyFilter === 'replied') result = result.filter(r => r.hasReply);
    if (replyFilter === 'unreplied') result = result.filter(r => !r.hasReply);
    if (reasonFilter !== 'all') result = result.filter(r => (metaMap[r.id]?.reason_category || '') === reasonFilter);
    if (handleFilter !== 'all') result = result.filter(r => (metaMap[r.id]?.handle_status || 'chua_xu_ly') === handleFilter);
    if (fixedFilter !== 'all') result = result.filter(r => (metaMap[r.id]?.fixed_status || 'chua_sua') === fixedFilter);
    if (prodNameFilter !== 'all') result = result.filter(r => r.productName === prodNameFilter);
    if (skuFilter !== 'all') result = result.filter(r => (r.sku || '—') === skuFilter);
    if (searchText) {
      const q = searchText.toLowerCase();
      result = result.filter(r =>
        r.productName.toLowerCase().includes(q) ||
        r.comment.toLowerCase().includes(q) ||
        r.userName.toLowerCase().includes(q) ||
        r.sku.toLowerCase().includes(q) ||
        String(r.orderCode || '').toLowerCase().includes(q) ||
        String(r.userId || '').toLowerCase().includes(q)
      );
    }
    result.sort((a, b) => {
      switch (sortBy) {
        case 'date_asc': return new Date(a.date) - new Date(b.date);
        case 'star_desc': return b.star - a.star;
        case 'star_asc': return a.star - b.star;
        default: return new Date(b.date) - new Date(a.date);
      }
    });
    return result;
  }, [scoped, brandFilter, shopSel, productFilter, starSel, replyFilter, reasonFilter, handleFilter, fixedFilter, prodNameFilter, skuFilter, searchText, sortBy, metaMap]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // ── Styles ──
  const card = { background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', padding: '16px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' };
  const thStyle = { padding: '10px 12px', textAlign: 'left', fontSize: '0.72rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.4px', borderBottom: '2px solid #e5e7eb', background: '#f8fafc', whiteSpace: 'nowrap' };
  const tdStyle = { padding: '10px 12px', fontSize: '0.82rem', color: '#0f172a', borderBottom: '1px solid #f1f5f9', verticalAlign: 'middle' };
  const btnBase = { padding: '8px 16px', borderRadius: 8, fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer', border: '1.5px solid', transition: 'all 0.15s', fontFamily: 'inherit' };

  const platformBtn = (val) => {
    const active = platform === val;
    const fill = val === 'tiktok' ? '#0f172a' : val === 'shopee' ? '#ff6a2c' : '#475569';
    return {
      ...btnBase,
      fontWeight: active ? 800 : 600,
      background: active ? fill : '#fff',
      color: active ? '#fff' : '#64748b',
      borderColor: active ? fill : '#e5e7eb',
    };
  };

  // val=0 là nút "Tất cả" (bật khi chưa chọn sao nào); còn lại bật khi sao đó nằm trong starSel
  const starFilterBtn = (val) => {
    const on = val === 0 ? starSel.length === 0 : starSel.includes(val);
    return {
      ...btnBase,
      padding: '6px 12px',
      fontSize: '0.78rem',
      background: on ? (val === 0 ? '#fff7ed' : (STAR_COLORS[val] + '18')) : '#fff',
      color: on ? (val === 0 ? '#ff6a2c' : STAR_COLORS[val]) : '#94a3b8',
      borderColor: on ? (val === 0 ? '#fed7aa' : STAR_COLORS[val]) : '#e5e7eb',
      fontWeight: on ? 800 : 600,
    };
  };

  // Chọn nhanh TRỌN 1 THÁNG (CS cần lọc cả tháng để chỉnh phân loại lý do).
  // offset 0 = tháng này, -1 = tháng trước... Tháng hiện tại thì kẹp ngày cuối = hôm nay.
  const pickMonth = (offset) => {
    const now = new Date();
    const first = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0);
    const s = toYmd(first);
    const e = toYmd(lastDay > now ? now : lastDay);
    setStartDate(s); setEndDate(e); fetchReviews(s, e);
  };
  const monthBtn = { ...btnBase, padding: '6px 12px', fontSize: '0.78rem', background: '#fff7ed', color: '#ff6a2c', borderColor: '#fed7aa', fontWeight: 700 };

  // Xuất Excel ĐÚNG data đang lọc — kèm mã đơn / ID người dùng / phân loại lý do (CS khỏi report tay).
  const exportXlsx = () => {
    const rows = filtered.map((r, i) => {
      const meta = metaMap[r.id] || {};
      return {
        STT: i + 1,
        'Sàn': r.platform === 'shopee' ? 'Shopee' : 'TikTok',
        'Shop': r.shop,
        'Brand': r.brand,
        'Sản phẩm': r.productName,
        'Phân loại (SKU)': r.sku,
        'Sao': r.star,
        'Nội dung': r.comment,
        'Người dùng': r.userName,
        'ID người dùng': r.userId || '',
        'Mã đơn': r.orderCode || '',
        'Ngày': fmtDate(r.date),
        'Đã phản hồi': r.hasReply ? 'x' : '',
        'Phân loại lý do': meta.reason_category || '',
        'Phân loại SP (CS)': meta.product_category || '',
        'Trạng thái xử lý': meta.handle_status === 'da_xu_ly' ? 'Đã xử lý' : 'Chưa xử lý',
        'Đã sửa đánh giá': meta.fixed_status === 'da_sua_5' ? '5 sao' : meta.fixed_status === 'da_sua_4' ? '4 sao' : '',
      };
    });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'DanhGia');
    XLSX.writeFile(wb, `DanhGiaSan_${startDate}_den_${endDate}.xlsx`);
  };

  return (
    <div style={{ fontFamily: "'Outfit', sans-serif", maxWidth: 1400 }}>
      {/* ── HEADER ── */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: '0 0 16px', fontSize: '1.4rem', fontWeight: 900, color: '#0f172a' }}>
          ⭐ Đánh giá sàn
        </h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', borderRadius: 10, border: '1.5px solid #e5e7eb', padding: '6px 12px' }}>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
              style={{ border: 'none', outline: 'none', fontSize: '0.84rem', fontFamily: 'inherit', color: '#0f172a', fontWeight: 600, background: 'transparent' }} />
            <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>→</span>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
              style={{ border: 'none', outline: 'none', fontSize: '0.84rem', fontFamily: 'inherit', color: '#0f172a', fontWeight: 600, background: 'transparent' }} />
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            {[7, 30, 60].map(d => (
              <button key={d}
                onClick={() => { const s = toYmd(new Date(Date.now() - (d - 1) * 86400000)); setStartDate(s); setEndDate(today); fetchReviews(s, today); }}
                style={{ ...btnBase, padding: '6px 12px', fontSize: '0.78rem', background: '#fff', color: '#64748b', borderColor: '#e5e7eb' }}>
                {d} ngày
              </button>
            ))}
            <button onClick={() => pickMonth(0)} style={monthBtn}>Tháng này</button>
            <button onClick={() => pickMonth(-1)} style={monthBtn}>Tháng trước</button>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => setPlatform('both')} style={platformBtn('both')}>Tất cả</button>
            <button onClick={() => setPlatform('shopee')} style={platformBtn('shopee')}>🟠 Shopee</button>
            <button onClick={() => setPlatform('tiktok')} style={platformBtn('tiktok')}>⬛ TikTok</button>
          </div>
          <select value={brandFilter} onChange={e => { setBrandFilter(e.target.value); setPage(1); }}
            style={{ padding: '8px 12px', borderRadius: 8, border: `1.5px solid ${brandFilter !== 'all' ? '#ff6a2c' : '#e5e7eb'}`, fontSize: '0.82rem', fontFamily: 'inherit', color: brandFilter !== 'all' ? '#ff6a2c' : '#0f172a', background: brandFilter !== 'all' ? '#fff7ed' : '#fff', cursor: 'pointer', fontWeight: 700 }}>
            {brandList.map(b => <option key={b} value={b}>{b === 'all' ? '🏷️ Brand: Tất cả' : `🏷️ ${b}`}</option>)}
          </select>
          <button onClick={fetchReviews} disabled={loading}
            style={{ ...btnBase, background: loading ? '#d1d5db' : '#ff6a2c', color: '#fff', borderColor: loading ? '#d1d5db' : '#ff6a2c', boxShadow: loading ? 'none' : '0 4px 12px rgba(255,106,44,0.2)', minWidth: 120 }}>
            {loading ? '⏳ Đang tải...' : '🔍 Tải dữ liệu'}
          </button>
          <button onClick={exportXlsx} disabled={loading || filtered.length === 0}
            style={{ ...btnBase, background: '#0f172a', color: '#fff', borderColor: '#0f172a', opacity: (loading || filtered.length === 0) ? 0.45 : 1 }}
            title="Xuất đúng data đang lọc ra Excel (kèm mã đơn, ID người dùng, phân loại lý do)">
            📥 Xuất Excel
          </button>
        </div>
      </div>

      {/* ── ERROR ── */}
      {error && (
        <div style={{ ...card, borderColor: '#fca5a5', background: '#fef2f2', color: '#dc2626', marginBottom: 20, fontSize: '0.85rem', fontWeight: 600 }}>
          ⚠️ {error}
        </div>
      )}

      {/* ── LOADING ── */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '60px 20px' }}>
          <div style={{ fontSize: '2rem', marginBottom: 12 }}>⏳</div>
          <div style={{ fontSize: '0.92rem', color: '#64748b', fontWeight: 600 }}>Đang tải đánh giá từ ERP...</div>
          <div style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: 4 }}>{progress || 'Có thể mất 5-10 giây'}</div>
        </div>
      )}

      {/* ── EMPTY ── */}
      {!loading && hasFetched && reviews.length === 0 && !error && (
        <div style={{ textAlign: 'center', padding: '60px 20px' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>📭</div>
          <div style={{ fontSize: '0.92rem', color: '#64748b', fontWeight: 600 }}>Không có đánh giá trong khoảng thời gian này</div>
        </div>
      )}

      {/* ── MAIN CONTENT ── */}
      {!loading && reviews.length > 0 && (<>

        {/* ── STATS CARDS ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 20 }}>
          {[
            { label: 'Tổng đánh giá', value: fmtNum(stats.total), icon: '📊', color: '#6366f1' },
            { label: 'Trung bình sao', value: `${stats.avg} ⭐`, icon: '⭐', color: '#eab308' },
            { label: 'Tỉ lệ 5 sao', value: `${stats.fiveStarPct}%`, icon: '🏆', color: '#22c55e' },
            { label: 'Đã phản hồi', value: `${stats.replyPct}%`, icon: '💬', color: '#3b82f6' },
            { label: 'Đã sửa đánh giá', value: fmtNum(stats.fixedCount), icon: '🔧', color: '#8b5cf6' },
            { label: 'CS đã xử lý', value: fmtNum(stats.handledCount), icon: '✅', color: '#16a34a' },
          ].map((c, i) => (
            <div key={i} style={{ ...card, display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 44, height: 44, borderRadius: 10, background: c.color + '12', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.3rem', flexShrink: 0 }}>
                {c.icon}
              </div>
              <div>
                <div style={{ fontSize: '1.2rem', fontWeight: 900, color: '#0f172a' }}>{c.value}</div>
                <div style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px' }}>{c.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* ── STAR DISTRIBUTION + PLATFORM BREAKDOWN ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
          {/* Star bars */}
          <div style={card}>
            <h3 style={{ margin: '0 0 14px', fontSize: '0.88rem', fontWeight: 800, color: '#0f172a' }}>Phân bố đánh giá</h3>
            {[5, 4, 3, 2, 1].map(star => {
              const count = stats.dist[star];
              const pct = stats.total ? (count / stats.total) * 100 : 0;
              const isActive = starSel.includes(star);
              return (
                <div key={star}
                  onClick={() => toggleStar(star)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 8px', borderRadius: 8, cursor: 'pointer', background: isActive ? STAR_COLORS[star] + '14' : 'transparent', transition: 'background 0.15s', marginBottom: 4 }}>
                  <span style={{ width: 36, fontSize: '0.82rem', fontWeight: 700, color: STAR_COLORS[star] }}>{star} ★</span>
                  <div style={{ flex: 1, height: 14, background: '#f1f5f9', borderRadius: 7, overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: STAR_COLORS[star], borderRadius: 7, transition: 'width 0.5s ease', minWidth: count > 0 ? 4 : 0 }} />
                  </div>
                  <span style={{ width: 50, textAlign: 'right', fontSize: '0.78rem', fontWeight: 700, color: '#0f172a' }}>{fmtNum(count)}</span>
                  <span style={{ width: 48, textAlign: 'right', fontSize: '0.72rem', color: '#94a3b8' }}>{pct.toFixed(1)}%</span>
                </div>
              );
            })}
            {starSel.length > 0 && (
              <div style={{ marginTop: 8, fontSize: '0.72rem', color: '#ff6a2c', fontWeight: 600, cursor: 'pointer' }}
                onClick={() => { setStarSel([]); setPage(1); }}>
                ✕ Bỏ lọc {starSel.slice().sort().join('-')} sao (bấm nhiều mức để chọn cùng lúc)
              </div>
            )}
          </div>

          {/* Platform comparison */}
          <div style={card}>
            <h3 style={{ margin: '0 0 14px', fontSize: '0.88rem', fontWeight: 800, color: '#0f172a' }}>Theo sàn</h3>
            {[
              { key: 'shopee', label: 'Shopee', emoji: '🟠', color: '#ee4d2d', data: stats.shopee },
              { key: 'tiktok', label: 'TikTok', emoji: '⬛', color: '#0f172a', data: stats.tiktok },
            ].map(p => (
              <div key={p.key} style={{ padding: '12px 14px', borderRadius: 10, background: '#f8fafc', border: '1px solid #e5e7eb', marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontSize: '0.86rem', fontWeight: 800, color: p.color }}>{p.emoji} {p.label}</span>
                  <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
                    {fmtNum(p.data.total)} đánh giá · TB {p.data.avg} ⭐
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 4, height: 8, borderRadius: 4, overflow: 'hidden', background: '#e5e7eb' }}>
                  {[5, 4, 3, 2, 1].map(star => {
                    const w = p.data.total ? (p.data.dist[star] / p.data.total) * 100 : 0;
                    return w > 0 ? <div key={star} style={{ width: `${w}%`, background: STAR_COLORS[star], minWidth: 2 }} title={`${star}★: ${p.data.dist[star]}`} /> : null;
                  })}
                </div>
                <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                  {[5, 4, 3, 2, 1].map(star => (
                    <span key={star} style={{ fontSize: '0.68rem', color: STAR_COLORS[star], fontWeight: 600 }}>
                      {star}★ {p.data.dist[star]}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── BRAND STATS ── */}
        <div style={{ ...card, marginBottom: 20 }}>
          <h3 style={{ margin: '0 0 14px', fontSize: '0.88rem', fontWeight: 800, color: '#0f172a' }}>
            🏷️ Thống kê theo Brand ({brandStats.length})
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
            {brandStats.map(b => {
              const replyPct = b.total ? ((b.replied / b.total) * 100).toFixed(0) : 0;
              const badPct = b.total ? ((b.bad / b.total) * 100).toFixed(1) : '0.0';
              const active = brandFilter === b.brand;
              return (
                <div key={b.brand}
                  onClick={() => { setBrandFilter(active ? 'all' : b.brand); setPage(1); focusReviews(); }}
                  style={{ padding: '14px 16px', borderRadius: 10, background: active ? '#fff7ed' : '#f8fafc', border: `1.5px solid ${active ? '#fed7aa' : '#e5e7eb'}`, cursor: 'pointer', transition: 'all 0.15s' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontSize: '0.9rem', fontWeight: 800, color: '#0f172a' }}>{b.brand}</span>
                    <span style={{ fontSize: '0.78rem', fontWeight: 700, color: parseFloat(b.avg) >= 4.5 ? '#22c55e' : parseFloat(b.avg) >= 3.5 ? '#eab308' : '#ef4444' }}>{b.avg} ⭐</span>
                  </div>
                  <div style={{ display: 'flex', gap: 4, height: 6, borderRadius: 3, overflow: 'hidden', background: '#e5e7eb', marginBottom: 8 }}>
                    {[5, 4, 3, 2, 1].map(star => { const w = b.total ? (b.dist[star] / b.total) * 100 : 0; return w > 0 ? <div key={star} style={{ width: `${w}%`, background: STAR_COLORS[star], minWidth: 2 }} title={`${star}★: ${b.dist[star]}`} /> : null; })}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: '#64748b' }}>
                    <span><b style={{ color: '#0f172a' }}>{fmtNum(b.total)}</b> đg · {b.shopCount} shop</span>
                    <span>Xấu <b style={{ color: b.bad > 0 ? '#ef4444' : '#22c55e' }}>{badPct}%</b> · Reply {replyPct}%</span>
                  </div>
                </div>
              );
            })}
          </div>
          {brandFilter !== 'all' && (
            <div style={{ marginTop: 10, fontSize: '0.72rem', color: '#ff6a2c', fontWeight: 600, cursor: 'pointer' }}
              onClick={() => { setBrandFilter('all'); setPage(1); }}>✕ Bỏ lọc brand "{brandFilter}"</div>
          )}
        </div>

        {/* ── CẦN XỬ LÝ (review xấu chưa phản hồi) ── */}
        <div style={{ ...card, marginBottom: 20, borderColor: needFixCount > 0 ? '#fecaca' : '#f1f5f9' }}>
          <h3 style={{ margin: '0 0 4px', fontSize: '0.88rem', fontWeight: 800, color: '#0f172a' }}>
            ⚠️ Cần xử lý — <span style={{ color: needFixCount > 0 ? '#ef4444' : '#22c55e' }}>{fmtNum(needFixCount)}</span> review xấu (1-3★) chưa phản hồi
          </h3>
          <p style={{ margin: '0 0 12px', fontSize: '0.74rem', color: '#94a3b8' }}>Top sản phẩm bị chê nhiều nhất — bấm để lọc xem review</p>
          {topBad.length === 0 ? (
            <div style={{ fontSize: '0.82rem', color: '#22c55e', fontWeight: 600 }}>🎉 Không có review xấu trong khoảng này</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {topBad.map(p => (
                <div key={p.key}
                  onClick={() => { setProductFilter({ productId: p.productId, platform: p.platform, productName: p.productName }); setStarFilter(0); setPage(1); focusReviews(); }}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, background: '#fff7f7', border: '1px solid #fee2e2', cursor: 'pointer' }}>
                  {p.productImage && <img src={p.productImage} alt="" style={{ width: 32, height: 32, borderRadius: 5, objectFit: 'cover', flexShrink: 0 }} onError={e => { e.target.style.display = 'none'; }} />}
                  <span style={{ flex: 1, fontSize: '0.8rem', fontWeight: 600, color: '#0f172a', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.productName}>
                    <span style={{ fontSize: '0.66rem', padding: '1px 5px', borderRadius: 4, marginRight: 6, fontWeight: 700, background: p.platform === 'shopee' ? '#fff7ed' : '#f1f5f9', color: p.platform === 'shopee' ? '#ff6a2c' : '#0f172a' }}>{p.platform === 'shopee' ? 'SPE' : 'TT'}</span>
                    {truncate(p.productName, 48)}
                  </span>
                  <span style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                    {[1, 2, 3].map(s => p.dist[s] > 0 ? <span key={s} style={{ fontSize: '0.72rem', fontWeight: 700, color: STAR_COLORS[s] }}>{s}★{p.dist[s]}</span> : null)}
                    <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#ef4444', minWidth: 26, textAlign: 'right' }}>{p.bad}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── TOP PHÂN LOẠI LÝ DO (CSKH) ── */}
        {topReasons.length > 0 && (
          <div style={{ ...card, marginBottom: 20 }}>
            <h3 style={{ margin: '0 0 12px', fontSize: '0.88rem', fontWeight: 800, color: '#0f172a' }}>🏷️ Top phân loại lý do đánh giá</h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {topReasons.map(([reason, count]) => {
                const active = reasonFilter === reason;
                const pct = stats.total ? (count / stats.total * 100).toFixed(1) : 0;
                return (
                  <div key={reason} onClick={() => { setReasonFilter(active ? 'all' : reason); setPage(1); focusReviews(); }}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '7px 12px', borderRadius: 8, background: active ? '#fff7ed' : '#f8fafc', border: `1.5px solid ${active ? '#fed7aa' : '#e5e7eb'}` }}>
                    <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#0f172a' }}>{reason}</span>
                    <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#ff6a2c' }}>{count}</span>
                    <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>{pct}%</span>
                  </div>
                );
              })}
            </div>
            {reasonFilter !== 'all' && (
              <div style={{ marginTop: 10, fontSize: '0.72rem', color: '#ff6a2c', fontWeight: 600, cursor: 'pointer' }}
                onClick={() => { setReasonFilter('all'); setPage(1); }}>✕ Bỏ lọc lý do "{reasonFilter}"</div>
            )}
          </div>
        )}

        {/* ── TOP ĐÁNH GIÁ XẤU (1-3★) — số CS cần để report ── */}
        {badScoped.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
            <div style={card}>
              <h3 style={{ margin: '0 0 3px', fontSize: '0.88rem', fontWeight: 800, color: '#0f172a' }}>😡 Top LÝ DO bị đánh giá xấu <span style={{ color: '#94a3b8', fontWeight: 600, fontSize: '0.74rem' }}>(1-3★)</span></h3>
              <p style={{ margin: '0 0 10px', fontSize: '0.72rem', color: '#94a3b8' }}>
                {fmtNum(badScoped.length)} đánh giá xấu · {chuaPhanLoai > 0
                  ? <b style={{ color: '#ef4444' }}>{fmtNum(chuaPhanLoai)} chưa gán lý do</b>
                  : <b style={{ color: '#22c55e' }}>đã gán hết lý do 🎉</b>}
              </p>
              {topBadReasons.length === 0 ? (
                <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Chưa gán lý do nào — gán ở cột “🏷️ CSKH xử lý” cuối bảng review.</div>
              ) : topBadReasons.map(([reason, n]) => {
                const pct = badScoped.length ? (n / badScoped.length * 100) : 0;
                const active = reasonFilter === reason;
                return (
                  <div key={reason} onClick={() => { setReasonFilter(active ? 'all' : reason); setPage(1); focusReviews(); }}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 6px', borderRadius: 8, cursor: 'pointer', background: active ? '#fff7ed' : 'transparent' }}>
                    <span style={{ flex: 1, fontSize: '0.82rem', fontWeight: active ? 800 : 600 }}>{reason}</span>
                    <div style={{ width: 80, height: 12, background: '#f1f5f9', borderRadius: 6, overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: '#ef4444', borderRadius: 6, minWidth: n > 0 ? 3 : 0 }} />
                    </div>
                    <span style={{ width: 34, textAlign: 'right', fontSize: '0.82rem', fontWeight: 800, color: '#ef4444' }}>{n}</span>
                    <span style={{ width: 44, textAlign: 'right', fontSize: '0.72rem', color: '#94a3b8' }}>{pct.toFixed(1)}%</span>
                  </div>
                );
              })}
            </div>
            <div style={card}>
              <h3 style={{ margin: '0 0 3px', fontSize: '0.88rem', fontWeight: 800, color: '#0f172a' }}>📦 Top PHÂN LOẠI SP bị đánh giá xấu</h3>
              <p style={{ margin: '0 0 10px', fontSize: '0.72rem', color: '#94a3b8' }}>Theo phân loại/mẫu (SKU) — bấm để lọc review</p>
              {topBadSku.map(([sku, n]) => {
                const pct = badScoped.length ? (n / badScoped.length * 100) : 0;
                const active = skuFilter === sku;
                return (
                  <div key={sku} onClick={() => { setSkuFilter(active ? 'all' : sku); setPage(1); focusReviews(); }}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 6px', borderRadius: 8, cursor: 'pointer', background: active ? '#fff7ed' : 'transparent' }}>
                    <span style={{ flex: 1, fontSize: '0.8rem', fontWeight: active ? 800 : 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={sku}>{sku}</span>
                    <div style={{ width: 80, height: 12, background: '#f1f5f9', borderRadius: 6, overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: '#f97316', borderRadius: 6, minWidth: n > 0 ? 3 : 0 }} />
                    </div>
                    <span style={{ width: 34, textAlign: 'right', fontSize: '0.82rem', fontWeight: 800, color: '#f97316' }}>{n}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── SHOP STATS ── */}
        <div style={{ ...card, marginBottom: 20 }}>
          <h3 style={{ margin: '0 0 14px', fontSize: '0.88rem', fontWeight: 800, color: '#0f172a' }}>
            🏪 Thống kê theo Shop ({shopStats.length})
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
            {shopStats.map(s => {
              const replyPct = s.total ? ((s.replied / s.total) * 100).toFixed(0) : 0;
              return (
                <div key={s.key}
                  onClick={() => { toggleShop(`${s.platform}-${s.sellerId}`); focusReviews(); }}
                  style={{ padding: '14px 16px', borderRadius: 10, background: shopSel.includes(`${s.platform}-${s.sellerId}`) ? '#fff7ed' : '#f8fafc', border: `1.5px solid ${shopSel.includes(`${s.platform}-${s.sellerId}`) ? '#fed7aa' : '#e5e7eb'}`, cursor: 'pointer', transition: 'all 0.15s' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: '0.72rem', padding: '2px 7px', borderRadius: 5, fontWeight: 700, background: s.platform === 'shopee' ? '#fff7ed' : '#f8fafc', color: s.platform === 'shopee' ? '#ff6a2c' : '#0f172a', border: `1px solid ${s.platform === 'shopee' ? '#fed7aa' : '#e5e7eb'}` }}>
                        {s.platform === 'shopee' ? '🟠' : '⬛'}
                      </span>
                      <span style={{ fontSize: '0.86rem', fontWeight: 800, color: '#0f172a' }}>{s.shop}</span>
                    </div>
                    <span style={{ fontSize: '0.76rem', fontWeight: 700, color: parseFloat(s.avg) >= 4.5 ? '#22c55e' : parseFloat(s.avg) >= 3.5 ? '#eab308' : '#ef4444' }}>
                      {s.avg} ⭐
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 4, height: 6, borderRadius: 3, overflow: 'hidden', background: '#e5e7eb', marginBottom: 8 }}>
                    {[5, 4, 3, 2, 1].map(star => {
                      const w = s.total ? (s.dist[star] / s.total) * 100 : 0;
                      return w > 0 ? <div key={star} style={{ width: `${w}%`, background: STAR_COLORS[star], minWidth: 2 }} title={`${star}★: ${s.dist[star]}`} /> : null;
                    })}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: '#64748b' }}>
                    <span><b style={{ color: '#0f172a' }}>{fmtNum(s.total)}</b> đánh giá</span>
                    <span>Reply: <b style={{ color: parseInt(replyPct) >= 80 ? '#22c55e' : '#eab308' }}>{replyPct}%</b></span>
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                    {[5, 4, 3, 2, 1].map(star => (
                      <span key={star} style={{ fontSize: '0.66rem', color: STAR_COLORS[star], fontWeight: 600 }}>
                        {star}★{s.dist[star]}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          {shopSel.length > 0 && (
            <div style={{ marginTop: 10, fontSize: '0.72rem', color: '#ff6a2c', fontWeight: 600, cursor: 'pointer' }}
              onClick={() => { setShopSel([]); setPage(1); }}>
              ✕ Bỏ lọc {shopSel.length} gian đang chọn (bấm nhiều thẻ để chọn cùng lúc)
            </div>
          )}
        </div>

        {/* ── PRODUCT STATS TABLE (thu gọn mặc định; bấm 1 SP để lọc review SP đó) ── */}
        <div style={{ ...card, marginBottom: 20, overflow: 'hidden' }}>
          <div onClick={() => setShowProducts(v => !v)}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', userSelect: 'none' }}>
            <h3 style={{ margin: 0, fontSize: '0.88rem', fontWeight: 800, color: '#0f172a' }}>
              📦 Thống kê theo sản phẩm ({productStats.length})
            </h3>
            <span style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 700 }}>
              {showProducts ? '▲ Thu gọn' : '▼ Mở rộng — bấm 1 SP để xem review SP đó'}
            </span>
          </div>
          {showProducts && (
          <div style={{ overflowX: 'auto', marginTop: 14 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
              <thead>
                <tr>
                  <th style={{ ...thStyle, minWidth: 250 }}>Sản phẩm</th>
                  <th style={{ ...thStyle, textAlign: 'center', width: 55 }}>Sàn</th>
                  <th style={{ ...thStyle, textAlign: 'center', width: 55 }}>Tổng</th>
                  <th style={{ ...thStyle, textAlign: 'center', width: 45, color: STAR_COLORS[5] }}>5★</th>
                  <th style={{ ...thStyle, textAlign: 'center', width: 45, color: STAR_COLORS[4] }}>4★</th>
                  <th style={{ ...thStyle, textAlign: 'center', width: 45, color: STAR_COLORS[3] }}>3★</th>
                  <th style={{ ...thStyle, textAlign: 'center', width: 45, color: STAR_COLORS[2] }}>2★</th>
                  <th style={{ ...thStyle, textAlign: 'center', width: 45, color: STAR_COLORS[1] }}>1★</th>
                  <th style={{ ...thStyle, textAlign: 'center', width: 55 }}>TB</th>
                  <th style={{ ...thStyle, textAlign: 'center', width: 65 }}>Reply</th>
                </tr>
              </thead>
              <tbody>
                {productStats.map(p => {
                  const replyPct = p.total ? ((p.replied / p.total) * 100).toFixed(0) : 0;
                  const isActive = productFilter?.productId === p.productId && productFilter?.platform === p.platform;
                  return (
                    <tr key={p.key}
                      onClick={() => { setProductFilter(isActive ? null : { productId: p.productId, platform: p.platform, productName: p.productName }); setPage(1); focusReviews(); }}
                      style={{ transition: 'background 0.12s', cursor: 'pointer', background: isActive ? '#fff7ed' : 'transparent' }}
                      onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = '#f8fafc'; }}
                      onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}>
                      <td style={tdStyle}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          {p.productImage && (
                            <img src={p.productImage} alt="" style={{ width: 36, height: 36, borderRadius: 6, objectFit: 'cover', border: '1px solid #e5e7eb', flexShrink: 0 }}
                              onError={e => { e.target.style.display = 'none'; }} />
                          )}
                          <span style={{ fontWeight: 600, lineHeight: 1.3 }} title={p.productName}>
                            {truncate(p.productName, 55)}
                          </span>
                        </div>
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        <span style={{ fontSize: '0.72rem', padding: '3px 8px', borderRadius: 6, fontWeight: 700, background: p.platform === 'shopee' ? '#fff7ed' : '#f8fafc', color: p.platform === 'shopee' ? '#ff6a2c' : '#0f172a', border: `1px solid ${p.platform === 'shopee' ? '#fed7aa' : '#e5e7eb'}` }}>
                          {p.platform === 'shopee' ? 'SPE' : 'TT'}
                        </span>
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 800 }}>{p.total}</td>
                      {[5, 4, 3, 2, 1].map(star => (
                        <td key={star} style={{ ...tdStyle, textAlign: 'center', fontWeight: 600, color: p.dist[star] > 0 ? STAR_COLORS[star] : '#d1d5db' }}>
                          {p.dist[star]}
                        </td>
                      ))}
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        <span style={{ fontWeight: 800, color: parseFloat(p.avg) >= 4.5 ? '#22c55e' : parseFloat(p.avg) >= 3.5 ? '#eab308' : '#ef4444' }}>
                          {p.avg}
                        </span>
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'center', fontSize: '0.76rem', fontWeight: 600, color: parseInt(replyPct) >= 80 ? '#22c55e' : parseInt(replyPct) >= 50 ? '#eab308' : '#ef4444' }}>
                        {replyPct}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          )}
        </div>

        {/* ── FILTER BAR (mốc cuộn tới — ngay trên danh sách review) ── */}
        <div ref={reviewsRef} style={{ ...card, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          {productFilter && (
            <div onClick={() => { setProductFilter(null); setPage(1); }}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 8, background: '#fff7ed', border: '1px solid #fed7aa', color: '#e85518', fontSize: '0.76rem', fontWeight: 700, cursor: 'pointer' }}
              title="Bỏ lọc sản phẩm">
              📦 {truncate(productFilter.productName, 28)} ✕
            </div>
          )}
          <div style={{ position: 'relative', flex: '1 1 200px', maxWidth: 320 }}>
            <input type="text" placeholder="Tìm sản phẩm, nội dung, user..."
              value={searchText} onChange={e => { setSearchText(e.target.value); setPage(1); }}
              style={{ width: '100%', padding: '8px 12px 8px 34px', borderRadius: 8, border: '1.5px solid #e5e7eb', fontSize: '0.82rem', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', transition: 'border-color 0.15s' }}
              onFocus={e => e.target.style.borderColor = '#ff6a2c'}
              onBlur={e => e.target.style.borderColor = '#e5e7eb'} />
            <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: '0.85rem', color: '#94a3b8', pointerEvents: 'none' }}>🔍</span>
          </div>

          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={() => { setStarSel([]); setPage(1); }} style={starFilterBtn(0)}>Tất cả</button>
            {[5, 4, 3, 2, 1].map(s => (
              <button key={s} onClick={() => toggleStar(s)} style={starFilterBtn(s)} title="Bấm nhiều mức để lọc cùng lúc (vd 1+2+3★)">
                {s}★
              </button>
            ))}
            <button onClick={() => { setStarSel([1, 2, 3]); setPage(1); }}
              style={{ ...btnBase, padding: '6px 12px', fontSize: '0.78rem', background: '#fef2f2', color: '#ef4444', borderColor: '#fecaca', fontWeight: 800 }}
              title="Chọn nhanh toàn bộ đánh giá xấu">1-2-3★</button>
          </div>

          {/* CHỌN NHIỀU GIAN — tách theo sàn nên "Shopee Milaganics" không kéo theo "TikTok Milaganics" */}
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: '0.76rem', color: '#94a3b8', fontWeight: 700 }}>Gian:</span>
            <button onClick={() => { setShopSel([]); setPage(1); }}
              style={{ ...btnBase, padding: '5px 10px', fontSize: '0.74rem', background: shopSel.length === 0 ? '#fff7ed' : '#fff', color: shopSel.length === 0 ? '#ff6a2c' : '#94a3b8', borderColor: shopSel.length === 0 ? '#fed7aa' : '#e5e7eb', fontWeight: shopSel.length === 0 ? 800 : 600 }}>
              Tất cả
            </button>
            {shopList.map(s => {
              const on = shopSel.includes(s.key);
              return (
                <button key={s.key} onClick={() => toggleShop(s.key)}
                  style={{ ...btnBase, padding: '5px 10px', fontSize: '0.74rem', background: on ? '#fff7ed' : '#fff', color: on ? '#ff6a2c' : '#64748b', borderColor: on ? '#fed7aa' : '#e5e7eb', fontWeight: on ? 800 : 600 }}
                  title={`${s.platform === 'shopee' ? 'Shopee' : 'TikTok'} · ${s.label}`}>
                  {s.platform === 'shopee' ? '🟠' : '⬛'} {s.label}
                </button>
              );
            })}
          </div>

          <select value={replyFilter} onChange={e => { setReplyFilter(e.target.value); setPage(1); }}
            style={{ padding: '8px 12px', borderRadius: 8, border: '1.5px solid #e5e7eb', fontSize: '0.82rem', fontFamily: 'inherit', color: '#0f172a', background: '#fff', cursor: 'pointer' }}>
            <option value="all">Reply: Tất cả</option>
            <option value="replied">Đã phản hồi</option>
            <option value="unreplied">Chưa phản hồi</option>
          </select>

          <select value={reasonFilter} onChange={e => { setReasonFilter(e.target.value); setPage(1); }}
            style={{ padding: '8px 12px', borderRadius: 8, border: `1.5px solid ${reasonFilter !== 'all' ? '#ff6a2c' : '#e5e7eb'}`, fontSize: '0.82rem', fontFamily: 'inherit', color: reasonFilter !== 'all' ? '#ff6a2c' : '#0f172a', background: reasonFilter !== 'all' ? '#fff7ed' : '#fff', cursor: 'pointer', fontWeight: reasonFilter !== 'all' ? 700 : 400 }}>
            <option value="all">Lý do: Tất cả</option>
            {REASON_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>

          <select value={handleFilter} onChange={e => { setHandleFilter(e.target.value); setPage(1); }}
            style={{ padding: '8px 12px', borderRadius: 8, border: '1.5px solid #e5e7eb', fontSize: '0.82rem', fontFamily: 'inherit', color: '#0f172a', background: '#fff', cursor: 'pointer' }}>
            <option value="all">Xử lý: Tất cả</option>
            <option value="chua_xu_ly">Chưa xử lý</option>
            <option value="da_xu_ly">Đã xử lý</option>
          </select>

          <select value={fixedFilter} onChange={e => { setFixedFilter(e.target.value); setPage(1); }}
            style={{ padding: '8px 12px', borderRadius: 8, border: '1.5px solid #e5e7eb', fontSize: '0.82rem', fontFamily: 'inherit', color: '#0f172a', background: '#fff', cursor: 'pointer' }}>
            <option value="all">Đã sửa: Tất cả</option>
            <option value="chua_sua">Chưa sửa</option>
            <option value="da_sua_4">Đã sửa 4★</option>
            <option value="da_sua_5">Đã sửa 5★</option>
          </select>

          <select value={prodNameFilter} onChange={e => { setProdNameFilter(e.target.value); setPage(1); }}
            style={{ padding: '8px 12px', borderRadius: 8, border: `1.5px solid ${prodNameFilter !== 'all' ? '#ff6a2c' : '#e5e7eb'}`, fontSize: '0.82rem', fontFamily: 'inherit', color: prodNameFilter !== 'all' ? '#ff6a2c' : '#0f172a', background: prodNameFilter !== 'all' ? '#fff7ed' : '#fff', cursor: 'pointer', maxWidth: 240, fontWeight: prodNameFilter !== 'all' ? 700 : 400 }}>
            <option value="all">Sản phẩm: Tất cả</option>
            {prodList.filter(p => p !== 'all').map(p => <option key={p} value={p}>{truncate(p, 60)}</option>)}
          </select>

          <select value={skuFilter} onChange={e => { setSkuFilter(e.target.value); setPage(1); }}
            style={{ padding: '8px 12px', borderRadius: 8, border: `1.5px solid ${skuFilter !== 'all' ? '#ff6a2c' : '#e5e7eb'}`, fontSize: '0.82rem', fontFamily: 'inherit', color: skuFilter !== 'all' ? '#ff6a2c' : '#0f172a', background: skuFilter !== 'all' ? '#fff7ed' : '#fff', cursor: 'pointer', maxWidth: 220, fontWeight: skuFilter !== 'all' ? 700 : 400 }}>
            <option value="all">Phân loại: Tất cả</option>
            {skuList.filter(s => s !== 'all').map(s => <option key={s} value={s}>{truncate(s, 50)}</option>)}
          </select>

          <select value={sortBy} onChange={e => setSortBy(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: 8, border: '1.5px solid #e5e7eb', fontSize: '0.82rem', fontFamily: 'inherit', color: '#0f172a', background: '#fff', cursor: 'pointer' }}>
            <option value="date_desc">Mới nhất</option>
            <option value="date_asc">Cũ nhất</option>
            <option value="star_desc">Sao cao → thấp</option>
            <option value="star_asc">Sao thấp → cao</option>
          </select>

          <span style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600, marginLeft: 'auto' }}>
            {fmtNum(filtered.length)} kết quả
          </span>
        </div>

        {/* ── REVIEWS TABLE ── */}
        <div style={{ ...card, overflow: 'hidden', padding: 0 }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ ...thStyle, width: 50, textAlign: 'center' }}>Sàn</th>
                  <th style={{ ...thStyle, width: 120 }}>Shop</th>
                  <th style={{ ...thStyle, minWidth: 220 }}>Sản phẩm</th>
                  <th style={{ ...thStyle, width: 50, textAlign: 'center' }}>Sao</th>
                  <th style={{ ...thStyle, minWidth: 200 }}>Nội dung</th>
                  <th style={{ ...thStyle, width: 100 }}>Người dùng</th>
                  <th style={{ ...thStyle, width: 120 }}>Mã đơn</th>
                  <th style={{ ...thStyle, width: 90, textAlign: 'center' }}>Ngày</th>
                  <th style={{ ...thStyle, width: 55, textAlign: 'center' }}>Reply</th>
                  <th style={{ ...thStyle, width: 190 }}>🏷️ CSKH xử lý</th>
                </tr>
              </thead>
              <tbody>
                {paged.map(r => {
                  const isExpanded = expandedId === r.id;
                  return (
                    <tr key={r.id} onClick={() => setExpandedId(isExpanded ? null : r.id)}
                      style={{ cursor: 'pointer', background: isExpanded ? '#fffbeb' : 'transparent', transition: 'background 0.12s' }}
                      onMouseEnter={e => { if (!isExpanded) e.currentTarget.style.background = '#f8fafc'; }}
                      onMouseLeave={e => { if (!isExpanded) e.currentTarget.style.background = 'transparent'; }}>
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        <span style={{ fontSize: '0.72rem', padding: '2px 6px', borderRadius: 5, fontWeight: 700, background: r.platform === 'shopee' ? '#fff7ed' : '#f8fafc', color: r.platform === 'shopee' ? '#ff6a2c' : '#0f172a', border: `1px solid ${r.platform === 'shopee' ? '#fed7aa' : '#e5e7eb'}` }}>
                          {r.platform === 'shopee' ? '🟠' : '⬛'}
                        </span>
                      </td>
                      <td style={{ ...tdStyle, fontSize: '0.76rem', fontWeight: 600, color: '#374151' }}>
                        {r.shop || '—'}
                      </td>
                      <td style={tdStyle}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {r.productImage && (
                            <img src={r.productImage} alt="" style={{ width: 32, height: 32, borderRadius: 5, objectFit: 'cover', border: '1px solid #e5e7eb', flexShrink: 0 }}
                              onError={e => { e.target.style.display = 'none'; }} />
                          )}
                          <div>
                            <div style={{ fontWeight: 600, fontSize: '0.8rem', lineHeight: 1.3 }} title={r.productName}>
                              {truncate(r.productName, 45)}
                            </div>
                            {r.sku && <div style={{ fontSize: '0.68rem', color: '#94a3b8', marginTop: 1 }} title={r.sku}>{truncate(r.sku, 35)}</div>}
                          </div>
                        </div>
                        {isExpanded && (
                          <div style={{ marginTop: 10, padding: '10px 12px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: '0.78rem' }}>
                            {r.comment ? (
                              <div style={{ marginBottom: 10 }}>
                                <div style={{ fontWeight: 700, color: '#64748b', fontSize: '0.68rem', textTransform: 'uppercase', marginBottom: 4 }}>Nội dung đánh giá</div>
                                <div style={{ color: '#0f172a', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{r.comment}</div>
                              </div>
                            ) : (
                              <div style={{ color: '#94a3b8', fontStyle: 'italic', marginBottom: 10 }}>Chỉ đánh giá sao</div>
                            )}
                            {r.images?.length > 0 && (
                              <div style={{ marginBottom: 10 }}>
                                <div style={{ fontWeight: 700, color: '#64748b', fontSize: '0.68rem', textTransform: 'uppercase', marginBottom: 6 }}>Ảnh đính kèm ({r.images.length})</div>
                                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                  {r.images.map((src, idx) => (
                                    <a key={idx} href={src} target="_blank" rel="noopener noreferrer">
                                      <img src={src} alt="" loading="lazy"
                                        style={{ width: 64, height: 64, borderRadius: 8, objectFit: 'cover', border: '1px solid #e5e7eb', display: 'block' }}
                                        onError={e => { e.target.style.display = 'none'; }} />
                                    </a>
                                  ))}
                                </div>
                              </div>
                            )}
                            {r.replyText && (
                              <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 10 }}>
                                <div style={{ fontWeight: 700, color: '#3b82f6', fontSize: '0.68rem', textTransform: 'uppercase', marginBottom: 4 }}>Phản hồi shop</div>
                                <div style={{ color: '#374151', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{r.replyText}</div>
                              </div>
                            )}
                            {(r.orderCode || r.userId) && (
                              <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 8, marginTop: 8, display: 'flex', gap: 18, flexWrap: 'wrap', fontSize: '0.72rem', color: '#64748b' }}>
                                {r.orderCode && <span>🧾 Mã đơn: <b style={{ color: '#0f172a', fontFamily: 'monospace', userSelect: 'all' }}>{r.orderCode}</b></span>}
                                {r.userId && <span>🆔 User ID: <b style={{ color: '#0f172a', userSelect: 'all' }}>{r.userId}</b></span>}
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 6, fontWeight: 800, fontSize: '0.82rem', background: STAR_COLORS[r.star] + '18', color: STAR_COLORS[r.star], border: `1px solid ${STAR_COLORS[r.star]}40` }}>
                          {r.star}★
                        </span>
                      </td>
                      <td style={{ ...tdStyle, color: r.comment ? '#374151' : '#c4b5a0', fontStyle: r.comment ? 'normal' : 'italic', fontSize: '0.78rem', lineHeight: 1.4 }}>
                        {r.comment ? truncate(r.comment, 80) : 'Chỉ đánh giá sao'}
                        {r.images?.length > 0 && <span style={{ marginLeft: 6, color: '#ff6a2c', fontSize: '0.72rem', fontWeight: 700, fontStyle: 'normal', whiteSpace: 'nowrap' }} title={`${r.images.length} ảnh`}>📷{r.images.length}</span>}
                      </td>
                      <td style={{ ...tdStyle, fontSize: '0.78rem', fontWeight: 600 }}>{r.userName}</td>
                      <td style={{ ...tdStyle, fontSize: '0.72rem', fontFamily: 'monospace', color: '#475569' }} onClick={e => e.stopPropagation()}>
                        {r.orderCode ? <span style={{ userSelect: 'all' }} title="Bấm giữ để copy">{r.orderCode}</span> : <span style={{ color: '#cbd5e1' }}>—</span>}
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'center', fontSize: '0.76rem', color: '#64748b' }}>{fmtDate(r.date)}</td>
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        {r.hasReply
                          ? <span style={{ color: '#22c55e', fontWeight: 700, fontSize: '0.85rem' }} title="Đã phản hồi">✅</span>
                          : <span style={{ color: '#d1d5db', fontWeight: 700, fontSize: '0.85rem' }} title="Chưa phản hồi">—</span>
                        }
                      </td>
                      <td style={tdStyle} onClick={e => e.stopPropagation()}>
                        {(() => {
                          const meta = metaMap[r.id] || {};
                          const handled = meta.handle_status === 'da_xu_ly';
                          const fixed = meta.fixed_status || 'chua_sua';
                          return (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 170 }}>
                              <select value={meta.reason_category || ''} onChange={e => updateMeta(r, { reason_category: e.target.value || null })}
                                style={{ padding: '4px 6px', borderRadius: 6, border: '1px solid #e5e7eb', fontSize: '0.72rem', fontFamily: 'inherit', background: '#fff', cursor: 'pointer' }}>
                                <option value="">— Phân loại lý do —</option>
                                {REASON_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                              </select>
                              <select value={meta.product_category || ''} onChange={e => updateMeta(r, { product_category: e.target.value || null })}
                                style={{ padding: '4px 6px', borderRadius: 6, border: '1px solid #e5e7eb', fontSize: '0.72rem', fontFamily: 'inherit', background: '#fff', cursor: 'pointer' }}
                                title="CS tự phân loại nhóm sản phẩm">
                                <option value="">— Phân loại SP —</option>
                                {PRODUCT_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                              </select>
                              <div style={{ display: 'flex', gap: 5 }}>
                                <button onClick={() => updateMeta(r, handled ? { handle_status: 'chua_xu_ly', handled_at: null } : { handle_status: 'da_xu_ly', handled_at: new Date().toISOString() })}
                                  style={{ flex: 1, padding: '4px 6px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: '0.7rem', fontWeight: 700, background: handled ? '#16a34a' : '#f1f5f9', color: handled ? '#fff' : '#64748b' }}>
                                  {handled ? '✅ Đã xử lý' : '○ Xử lý'}
                                </button>
                                <select value={fixed} onChange={e => updateMeta(r, { fixed_status: e.target.value })}
                                  style={{ padding: '4px 6px', borderRadius: 6, border: '1px solid #e5e7eb', fontSize: '0.7rem', fontFamily: 'inherit', background: '#fff', cursor: 'pointer', color: (fixed === 'da_sua_4' || fixed === 'da_sua_5') ? '#16a34a' : '#64748b' }}>
                                  {FIXED_OPTIONS.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                                </select>
                              </div>
                            </div>
                          );
                        })()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* ── PAGINATION ── */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '14px 16px', borderTop: '1px solid #f1f5f9' }}>
              <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1}
                style={{ ...btnBase, padding: '6px 10px', fontSize: '0.76rem', background: '#fff', color: page === 1 ? '#d1d5db' : '#64748b', borderColor: '#e5e7eb', cursor: page === 1 ? 'default' : 'pointer' }}>
                ‹ Trước
              </button>
              {(() => {
                const pages = [];
                const show = 7;
                let start = Math.max(1, page - Math.floor(show / 2));
                let end = Math.min(totalPages, start + show - 1);
                if (end - start < show - 1) start = Math.max(1, end - show + 1);
                if (start > 1) { pages.push(1); if (start > 2) pages.push('...'); }
                for (let i = start; i <= end; i++) pages.push(i);
                if (end < totalPages) { if (end < totalPages - 1) pages.push('...'); pages.push(totalPages); }
                return pages.map((p, i) => (
                  p === '...'
                    ? <span key={`e${i}`} style={{ padding: '0 4px', color: '#94a3b8' }}>…</span>
                    : <button key={p} onClick={() => setPage(p)}
                        style={{ ...btnBase, padding: '6px 10px', fontSize: '0.76rem', minWidth: 34, background: p === page ? '#ff6a2c' : '#fff', color: p === page ? '#fff' : '#64748b', borderColor: p === page ? '#ff6a2c' : '#e5e7eb' }}>
                        {p}
                      </button>
                ));
              })()}
              <button onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page === totalPages}
                style={{ ...btnBase, padding: '6px 10px', fontSize: '0.76rem', background: '#fff', color: page === totalPages ? '#d1d5db' : '#64748b', borderColor: '#e5e7eb', cursor: page === totalPages ? 'default' : 'pointer' }}>
                Sau ›
              </button>
            </div>
          )}
        </div>

        <div style={{ textAlign: 'center', marginTop: 16, fontSize: '0.68rem', color: '#c4b5a0', fontStyle: 'italic' }}>
          Data from Stella ERP · Built by Quốc Khánh
        </div>
      </>)}
    </div>
  );
}
