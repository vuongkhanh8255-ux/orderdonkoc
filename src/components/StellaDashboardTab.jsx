// src/components/StellaDashboardTab.jsx
import { useState, useEffect, useMemo, useRef } from 'react';
import DateRangePicker from './DateRangePicker';
import {
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
  Line, Area, AreaChart, ComposedChart,
  BarChart, Bar
} from 'recharts';

// ─── API PATHS ────────────────────────────────────────────────────────────────
const BASE = '/bluecore-api/api/services/app/PublicRecommendation/Get?tenancyName=hoanganhannie&replaceUnicode=false';
const API_ORDERS  = BASE + '&sectionName=Stella_API_donhang';   // đơn hàng tổng hợp theo ngày/org
const API_PRODUCT = BASE + '&sectionName=Stella_api_product';   // chi tiết sản phẩm (dùng cho top products / brand chart)
const API_TRAFFIC = BASE + '&sectionName=Stella_api_traffic';
const API_ADS      = BASE + '&sectionName=stella_api_tongquanads';
const API_CAMPAIGNS = BASE + '&sectionName=Stella_api_tiktokads_spend';

// Danh sách shop filters — dùng chung cho orders + traffic
const SHOP_FILTERS = [
  'Shopee_BODYMISS VIETNAM', 'Shopee_Milaganics Việt Nam',
  'Shopee_Moaw Moaws Việt Nam', 'Shopee_eHerb Việt Nam', 'Shopee_eherbvietnam',
  'Tiktok_Body Miss Việt Nam', 'Tiktok_Healmii Việt Nam', 'Tiktok_MASUBE VIỆT NAM',
  'Tiktok_Milaganics Việt Nam', 'Tiktok_Moaw Moaws Việt Nam',
  'Tiktok_Real Steel Việt Nam', 'Tiktok_eHerb Hồ Chí Minh', 'Tiktok_eHerb Viet Nam',
];
const TRAFFIC_FILTERS = SHOP_FILTERS; // alias giữ tương thích

// Fetch rows: lấy count_row/total_row trước, cap tối đa 10000 (giới hạn API Bluecore)
const API_MAX_SIZE = 10000;
const fetchAllRows = async (url) => {
  const probe = await fetch(url + '&size=1').then(r => r.json());
  const first = probe.result?.[0]?._source;
  // total phải > 0 — nếu count_row/total_row = 0 hoặc không có thì dùng 500 làm fallback
  const rawTotal = first?.count_row || first?.total_row;
  const total = (rawTotal && rawTotal > 0) ? rawTotal : 500;
  const size = Math.min(total, API_MAX_SIZE);
  return fetch(url + '&size=' + size).then(r => r.json());
};

// Ads column aliases (their column names are auto-generated hashes)
const ADS_COST_KEY    = 'col_8DK6I83GD31QQ831CHPG';                         // Chi phí Ads
const ADS_REVENUE_KEY = 'col_8HNM2RJ841Q6GT90C5I76';                         // Doanh thu Ads (mới)
const ADS_ORDERS_KEY  = 'col_AD621H4HOQGMS864I7GRLFRE41QE3ETB41GM8SO';      // Số đơn từ Ads

// Chỉ lấy data 3 tháng gần nhất (tự động tính từ hôm nay)
const DATA_START = (() => { const d = new Date(); d.setMonth(d.getMonth() - 3); d.setHours(0,0,0,0); return d.getTime(); })();

// ─── COLORS ──────────────────────────────────────────────────────────────────
const COLORS = ['#ea580c', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6', '#f43f5e', '#6366f1', '#84cc16'];
const SOURCE_COLORS = { Tiktokshop: '#010101', TiktokShop: '#010101', Shopee: '#ee4d2d' };

// ─── SECTION METRIC CONFIGS ──────────────────────────────────────────────────
// S1_CONFIGS and S2_CONFIGS are defined after fmt (see below, near the helpers section)

// ─── HELPERS ─────────────────────────────────────────────────────────────────
const fmt = (n) => {
  if (!n && n !== 0) return '—';
  const v = Number(n);
  if (v >= 1_000_000_000) return (v / 1_000_000_000).toFixed(2) + ' tỷ';
  if (v >= 1_000_000)     return (v / 1_000_000).toFixed(1) + ' tr';
  if (v >= 1_000)         return (v / 1_000).toFixed(0) + 'k';
  return v.toLocaleString('vi-VN');
};

const fmtFull = (n) => Number(n || 0).toLocaleString('vi-VN') + '₫';

const sourceLabel = (s) => {
  if (!s) return s;
  if (s.toLowerCase().includes('tiktok')) return 'TikTok Shop';
  if (s.toLowerCase().includes('shopee')) return 'Shopee';
  return s;
};

const sourceColor = (s) => {
  if (!s) return '#6b7280';
  if (s.toLowerCase().includes('tiktok')) return '#010101';
  if (s.toLowerCase().includes('shopee')) return '#ee4d2d';
  return '#6b7280';
};

// ─── SECTION METRIC CONFIGS (must be after fmt) ──────────────────────────────
const S1_CONFIGS = {
  traffic: { label: 'Traffic',      icon: '👁️', color: '#6366f1', key: 'traffic', format: v => v >= 1e6 ? (v/1e6).toFixed(1)+'tr' : (v/1e3).toFixed(0)+'k' },
  gmv:     { label: 'GMV',          icon: '💰', color: '#ea580c', key: 'gmv',     format: v => fmt(v) },
  orders:  { label: 'Đơn hàng',     icon: '📦', color: '#f59e0b', key: 'orders',  format: v => v.toLocaleString('vi-VN') },
  aov:     { label: 'AOV',          icon: '📊', color: '#8b5cf6', key: 'aov',     format: v => fmt(v) },
  abs:     { label: 'ABS (SP/đơn)', icon: '🛒', color: '#14b8a6', key: 'abs',     format: v => Number(v).toFixed(1) },
};
const S2_CONFIGS = {
  adsCost:    { label: 'Chi phí Ads',    icon: '📢', color: '#3b82f6', key: 'adsCost',    format: v => fmt(v) },
  adsRevenue: { label: 'Doanh thu Ads',  icon: '💰', color: '#10b981', key: 'adsRevenue', format: v => fmt(v) },
  roas:       { label: 'ROAS',           icon: '🚀', color: '#f59e0b', key: 'roas',       format: v => Number(v).toFixed(2)+'x' },
  cpo:        { label: 'CPO',            icon: '💸', color: '#ec4899', key: 'cpo',        format: v => fmt(v) },
  adsOrders:  { label: 'Đơn từ Ads',     icon: '🎯', color: '#8b5cf6', key: 'adsOrders',  format: v => v.toLocaleString('vi-VN') },
};
const S3_CONFIGS = {
  totalSpend: { label: 'Tổng chi phí',   icon: '💸', color: '#f43f5e', key: 'totalSpend', format: v => fmt(v) },
  avgSpend:   { label: 'Avg chi phí/ngày', icon: '📅', color: '#0ea5e9', key: 'avgSpend', format: v => fmt(v) },
};

// Normalize org_name → canonical brand name (gộp mọi shop cùng brand)
const normalizeBrand = (orgName) => {
  if (!orgName) return 'Không rõ';
  const n = orgName.toLowerCase().replace(/[\s_]/g, '');
  if (n.includes('bodymiss'))   return 'Body Miss';
  if (n.includes('milaganics')) return 'Milaganics';
  if (n.includes('moaw'))       return 'Moaw Moaws';
  if (n.includes('eherb'))      return 'eHerb';
  if (n.includes('healmii'))    return 'Healmii';
  if (n.includes('masube'))     return 'MASUBE';
  if (n.includes('realsteel') || n.includes('real steel')) return 'Real Steel';
  return orgName.replace(/^(Tiktok|Shopee)\s*[-–]\s*/i, '').trim();
};

// Kiểm tra advertiser có phải internal/Stella không → loại khỏi campaign stats
const isStellaCampaign = (advertiserName) => {
  if (!advertiserName) return false;
  const n = advertiserName.toLowerCase();
  return n.includes('stella') || n.includes('web');
};

// ─── SUB-COMPONENTS ──────────────────────────────────────────────────────────
const StatCard = ({ icon, label, value, sub, color = '#ea580c', loading, active, onClick, compare }) => {
  const sparkPaths = [
    "polygon(0 60%, 15% 45%, 30% 55%, 45% 35%, 60% 50%, 75% 25%, 90% 35%, 100% 15%, 100% 100%, 0 100%)",
    "polygon(0 70%, 20% 60%, 40% 70%, 55% 45%, 70% 55%, 85% 30%, 100% 20%, 100% 100%, 0 100%)",
    "polygon(0 40%, 20% 55%, 40% 45%, 60% 65%, 80% 50%, 100% 70%, 100% 100%, 0 100%)",
    "polygon(0 55%, 25% 50%, 50% 60%, 75% 40%, 100% 30%, 100% 100%, 0 100%)",
    "polygon(0 50%, 20% 48%, 40% 52%, 60% 47%, 80% 51%, 100% 45%, 100% 100%, 0 100%)",
  ];
  const sparkIdx = Math.abs(label?.charCodeAt(0) || 0) % sparkPaths.length;
  let badge = null;
  if (compare != null && !loading && compare.prev > 0) {
    const delta = ((compare.curr - compare.prev) / compare.prev) * 100;
    const isUp = delta >= 0;
    badge = <div style={{ fontSize: '0.68rem', fontWeight: 700, color: isUp ? '#16a34a' : '#dc2626', marginTop: 4 }}>{isUp ? '▲' : '▼'}{Math.abs(delta).toFixed(1)}% vs kỳ trước</div>;
  }
  return (
    <div onClick={onClick} style={{
      background: '#fff', borderRadius: 14, padding: '20px',
      border: active ? `2px solid ${color}` : '1px solid #e2e8f0',
      boxShadow: active ? `0 4px 16px ${color}22` : '0 2px 8px rgba(0,0,0,0.04)',
      cursor: onClick ? 'pointer' : 'default', transition: 'all 0.2s',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
        <span style={{ fontSize: '0.62rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#64748b' }}>{label}</span>
        {compare != null && !loading && compare.prev > 0 ? (() => {
          const delta = ((compare.curr - compare.prev) / compare.prev) * 100;
          const isUp = delta >= 0;
          return <span style={{ fontSize: '0.68rem', fontWeight: 700, color: isUp ? '#16a34a' : '#dc2626' }}>{isUp ? '+' : ''}{delta.toFixed(1)}%</span>;
        })() : active ? <span style={{ fontSize: '0.6rem', fontWeight: 700, color, background: color+'18', padding: '2px 7px', borderRadius: 99 }}>●</span> : null}
      </div>
      {loading
        ? <div style={{ height: 32, width: '70%', background: '#f1f5f9', borderRadius: 6, animation: 'pulse 1.5s infinite', marginBottom: 12 }} />
        : <div style={{ fontSize: '1.55rem', fontWeight: 900, color: '#0f172a', lineHeight: 1, marginBottom: 12 }}>{value}</div>
      }
      <div style={{ height: 36, borderRadius: 8, background: color+'14', overflow: 'hidden', position: 'relative' }}>
        <div style={{ position: 'absolute', inset: 0, background: color, opacity: 0.2, clipPath: sparkPaths[sparkIdx] }} />
      </div>
      {sub && !loading && <div style={{ fontSize: '0.68rem', color: '#94a3b8', marginTop: 8, fontWeight: 500 }}>{sub}</div>}
    </div>
  );
};

const SectionHeader = ({ title, icon, subtitle }) => (
  <div style={{ marginTop: 40, marginBottom: 20 }}>
    <h2 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 900, color: '#0f172a', letterSpacing: '-0.03em', lineHeight: 1 }}>{title}</h2>
    {subtitle && <p style={{ margin: '5px 0 0', fontSize: '0.82rem', color: '#64748b', fontWeight: 500 }}>{subtitle}</p>}
  </div>
);

const SourceBadge = ({ source }) => (
  <span style={{
    display: 'inline-block', padding: '2px 8px', borderRadius: 99,
    fontSize: '0.7rem', fontWeight: 700, color: '#fff',
    background: sourceColor(source)
  }}>{sourceLabel(source)}</span>
);

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
const StellaDashboardTab = () => {
  const [orderData, setOrderData]   = useState([]);  // Stella_API_donhang — KPI chính
  const [productData, setProductData] = useState([]); // Stella_api_product — brand/product breakdown
  const [trafficData, setTrafficData] = useState([]);
  const [adsData, setAdsData] = useState([]);
  const [campaignData, setCampaignData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState([]);
  const [lastUpdated, setLastUpdated] = useState(null);

  // Filters
  const [platformFilter, setPlatformFilter] = useState('All');
  const [brandFilter, setBrandFilter] = useState('All');
  const [activeProductTab, setActiveProductTab] = useState('gmv'); // gmv | orders | qty
  const [selectedMetric, setSelectedMetric] = useState('gmv'); // for trend chart (legacy)
  const [s1Metrics, setS1Metrics] = useState(['gmv', 'orders']);      // Section 1 dual-chart
  const [s2Metrics, setS2Metrics] = useState(['adsCost', 'adsRevenue']); // Section 2 dual-chart
  const [s3Metrics, setS3Metrics] = useState(['totalSpend', 'avgSpend']); // Section 3 dual-chart

  // Date filters
  const [periodMode, setPeriodMode] = useState('all'); // 'all' | '1' | '7' | '30' | 'range'
  const [dateRange, setDateRange]   = useState({ start: null, end: null });
  const [showPicker, setShowPicker] = useState(false);
  const pickerRef = useRef(null);

  const fetchAll = async () => {
    setLoading(true);
    setErrors([]);
    const errs = [];
    try {
      // Fetch tất cả parallel: Product + Orders/Traffic/Ads per filter + Campaigns
      const [jProduct, jCampaigns, ...filterResults] = await Promise.all([
        fetchAllRows(API_PRODUCT),
        fetch(API_CAMPAIGNS + '&size=5000').then(r => r.json()).catch(() => ({ result: [] })),
        ...SHOP_FILTERS.map(f =>
          fetchAllRows(API_ORDERS + '&filter=' + encodeURIComponent(f))
            .catch(() => ({ success: false, result: [] }))
        ),
        ...SHOP_FILTERS.map(f =>
          fetchAllRows(API_TRAFFIC + '&filter=' + encodeURIComponent(f))
            .catch(() => ({ success: false, result: [] }))
        ),
        ...SHOP_FILTERS.map(f =>
          fetchAllRows(API_ADS + '&filter=' + encodeURIComponent(f))
            .catch(() => ({ success: false, result: [] }))
        ),
      ]);

      if (jProduct.success && jProduct.result) setProductData(jProduct.result.map(i => i._source));
      else errs.push('Product API lỗi');

      // filterResults = [orders×n, traffic×n, ads×n]
      const n = SHOP_FILTERS.length;
      const orderResults   = filterResults.slice(0, n);
      const trafficResults = filterResults.slice(n, n * 2);
      const adsResults     = filterResults.slice(n * 2);

      const allOrders = [];
      orderResults.forEach(j => {
        if (j.success && j.result) j.result.forEach(i => allOrders.push(i._source));
      });
      setOrderData(allOrders);
      if (!allOrders.length) errs.push('Orders API: không có data');

      const allTraffic = [];
      trafficResults.forEach(j => {
        if (j.success && j.result) j.result.forEach(i => allTraffic.push(i._source));
      });
      setTrafficData(allTraffic);

      const allAds = [];
      adsResults.forEach(j => {
        if (j.success && j.result) j.result.forEach(i => allAds.push(i._source));
      });
      if (allAds.length) {
        setAdsData(allAds);
      } else errs.push('Ads API: không có data');

      if (jCampaigns.result?.length) {
        setCampaignData(jCampaigns.result.map(i => i._source));
      }

      setLastUpdated(new Date());
    } catch (e) {
      errs.push('Lỗi kết nối: ' + e.message);
    }
    setErrors(errs);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  // ─── DERIVED DATA ───────────────────────────────────────────────────────────
  const allBrands = useMemo(() => {
    const brands = new Set();
    // Ưu tiên orderData (donhang) vì cover nhiều tháng hơn
    const src = orderData.length ? orderData : productData;
    src.forEach(d => { if (d.org_name) brands.add(normalizeBrand(d.org_name)); });
    return ['All', ...Array.from(brands).sort()];
  }, [orderData, productData]);

  // Close picker when clicking outside
  useEffect(() => {
    if (!showPicker) return;
    const handler = (e) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) setShowPicker(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showPicker]);

  // Max date — dùng orderData (donhang) nếu có, fallback về productData
  const maxProductDate = useMemo(() => {
    const src = orderData.length ? orderData : productData;
    const timestamps = src.map(d => d.created_at).filter(Boolean);
    if (!timestamps.length) return new Date();
    return new Date(Math.max(...timestamps));
  }, [orderData, productData]);

  // Max date from ads data (for display only)
  const maxAdsDate = useMemo(() => {
    const timestamps = adsData.map(d => d.col_9PJS783P || d.created_at).filter(Boolean);
    if (!timestamps.length) return new Date();
    return new Date(Math.max(...timestamps));
  }, [adsData]);

  // ─── ADS NORMALIZATION ─────────────────────────────────────────────────────
  // Bluecore ADS API trả values ở đơn vị khác nhau tuỳ shop (một số shop inflate ×10^6).
  // Cross-reference ADS orders vs donhang orders cùng ngày → tính hệ số chuẩn hoá per shop.
  const adsNormFactors = useMemo(() => {
    if (!adsData.length || !orderData.length) return {};
    // Group donhang orders by shop+date
    const donhangMap = {};              // { "Tiktok_Body Miss…": { "2026-03-24": 498, … } }
    orderData.forEach(d => {
      const shop = d.filter || '';
      if (!shop) return;
      if (!donhangMap[shop]) donhangMap[shop] = {};
      const dt = new Date(d.created_at).toISOString().slice(0, 10);
      donhangMap[shop][dt] = (donhangMap[shop][dt] || 0) + (d.count_order || 0);
    });
    const factors = {};
    const shops = [...new Set(adsData.map(d => d.filter).filter(Boolean))];
    shops.forEach(shop => {
      const dh = donhangMap[shop];
      if (!dh) return;
      let adsOrdSum = 0, dhOrdSum = 0;
      adsData.filter(d => d.filter === shop).forEach(d => {
        const dt = new Date(d.col_9PJS783P).toISOString().slice(0, 10);
        if (dh[dt] && dh[dt] > 0) {
          adsOrdSum += d[ADS_ORDERS_KEY] || 0;
          dhOrdSum  += dh[dt];
        }
      });
      if (dhOrdSum >= 30 && adsOrdSum > 0) {
        const f = adsOrdSum / dhOrdSum;
        if (f > 10) factors[shop] = f;   // chỉ normalize khi lệch > 10×
      }
    });
    return factors;
  }, [adsData, orderData]);

  // Apply normalization → adsData daily values chuẩn hoá về VND
  const normalizedAds = useMemo(() => {
    return adsData.map(d => {
      const f = adsNormFactors[d.filter] || 1;
      if (f === 1) return d;
      return {
        ...d,
        [ADS_COST_KEY]:    (d[ADS_COST_KEY]    || 0) / f,
        [ADS_REVENUE_KEY]: (d[ADS_REVENUE_KEY] || 0) / f,
        [ADS_ORDERS_KEY]:  (d[ADS_ORDERS_KEY]  || 0) / f,
      };
    });
  }, [adsData, adsNormFactors]);

  // Keep maxDataDate as the PRODUCT anchor (so header info stays accurate)
  const maxDataDate = maxProductDate;

  // Date filter helper — anchored from maxProductDate so product & ads stay in sync
  const matchDate = (tsMs) => {
    if (!tsMs) return periodMode === 'all';
    const d = new Date(tsMs);
    if (periodMode === 'range') {
      const { start, end } = dateRange;
      if (!start) return true;
      const lo = new Date(start); lo.setHours(0,0,0,0);
      const hi = end ? new Date(end) : new Date(lo); hi.setHours(23,59,59,999);
      return d >= lo && d <= hi;
    }
    if (periodMode === 'all') return true;
    const days = +periodMode;
    // Upper bound = end of the anchor day (maxProductDate 23:59:59)
    const upperBound = new Date(maxProductDate);
    upperBound.setHours(23, 59, 59, 999);
    // Lower bound = anchor day minus (days-1) days, start of that day
    const cutoff = new Date(maxProductDate);
    cutoff.setDate(cutoff.getDate() - days + 1);
    cutoff.setHours(0, 0, 0, 0);
    return d >= cutoff && d <= upperBound;
  };

  // filteredOrders: dùng cho KPI GMV/orders/qty (Stella_API_donhang — 3 tháng)
  const filteredOrders = useMemo(() => {
    const src = orderData.length ? orderData : productData; // fallback
    return src.filter(d => {
      if (periodMode === 'all' && d.created_at < DATA_START) return false;
      const platform = d.source || '';
      const matchPlatform = platformFilter === 'All'
        || (platformFilter === 'TikTok' && platform.toLowerCase().includes('tiktok'))
        || (platformFilter === 'Shopee' && platform.toLowerCase().includes('shopee'));
      const matchBrand = brandFilter === 'All' || normalizeBrand(d.org_name) === normalizeBrand(brandFilter);
      return matchPlatform && matchBrand && matchDate(d.created_at);
    });
  }, [orderData, productData, platformFilter, brandFilter, periodMode, dateRange]);

  // filtered: productData — dùng cho brand chart, top products
  const filtered = useMemo(() => {
    return productData.filter(d => {
      if (periodMode === 'all' && d.created_at < DATA_START) return false;
      const platform = d.source || '';
      const matchPlatform = platformFilter === 'All'
        || (platformFilter === 'TikTok' && platform.toLowerCase().includes('tiktok'))
        || (platformFilter === 'Shopee' && platform.toLowerCase().includes('shopee'));
      const matchBrand = brandFilter === 'All' || d.org_name === brandFilter;
      return matchPlatform && matchBrand && matchDate(d.created_at);
    });
  }, [productData, platformFilter, brandFilter, periodMode, dateRange]);

  // Traffic data filtered
  const filteredTraffic = useMemo(() => {
    return trafficData.filter(d => {
      if (periodMode === 'all' && d.created_at < DATA_START) return false;
      const platform = d.source || '';
      const matchPlatform = platformFilter === 'All'
        || (platformFilter === 'TikTok' && platform.toLowerCase().includes('tiktok'))
        || (platformFilter === 'Shopee' && platform.toLowerCase().includes('shopee'));
      const shopName = (d.filter || '').replace(/^[^_]+_/, '');
      const matchBrand = brandFilter === 'All' || normalizeBrand(shopName) === normalizeBrand(brandFilter);
      return matchPlatform && matchBrand && matchDate(d.created_at);
    });
  }, [trafficData, platformFilter, brandFilter, periodMode, dateRange]);

  const filteredAds = useMemo(() => {
    return normalizedAds.filter(d => {
      const ts = d.col_9PJS783P || d.created_at;
      if (periodMode === 'all' && ts < DATA_START) return false;
      const platform = d.Source || '';
      const matchPlatform = platformFilter === 'All'
        || (platformFilter === 'TikTok' && platform.toLowerCase().includes('tiktok'))
        || (platformFilter === 'Shopee' && platform.toLowerCase().includes('shopee'));
      // Brand: extract shop name from filter field e.g. "Tiktok_Body Miss Việt Nam" → "Body Miss"
      const shopName = (d.filter || '').replace(/^[^_]+_/, '');
      const matchBrand = brandFilter === 'All' || normalizeBrand(shopName) === normalizeBrand(brandFilter);
      return matchPlatform && matchBrand && matchDate(ts);
    });
  }, [normalizedAds, platformFilter, brandFilter, periodMode, dateRange]);

  // Campaign data filtered (TikTok Ads spend per campaign)
  const filteredCampaigns = useMemo(() => {
    return campaignData.filter(d => {
      if (isStellaCampaign(d.advertiser_name)) return false;
      if (periodMode === 'all' && d.stat_time_day < DATA_START) return false;
      const matchBrand = brandFilter === 'All' || normalizeBrand(d.advertiser_name) === normalizeBrand(brandFilter);
      // Campaign API chỉ có TikTok data
      if (platformFilter === 'Shopee') return false;
      return matchBrand && matchDate(d.stat_time_day);
    });
  }, [campaignData, brandFilter, platformFilter, periodMode, dateRange]);

  // Aggregate campaigns by name+advertiser for table
  const campaignsByName = useMemo(() => {
    const map = {};
    filteredCampaigns.forEach(d => {
      const brand = normalizeBrand(d.advertiser_name);
      const key = d.campaign_name.trim() + '|' + brand;
      if (!map[key]) map[key] = { campaign: d.campaign_name.trim(), brand, spend: 0, days: 0 };
      map[key].spend += d.total_spend || 0;
      map[key].days += 1;
    });
    return Object.values(map).sort((a, b) => b.spend - a.spend);
  }, [filteredCampaigns]);

  const totalCampaignSpend = useMemo(() => filteredCampaigns.reduce((s, d) => s + (d.total_spend || 0), 0), [filteredCampaigns]);

  // Aggregate by brand
  const campaignsByBrand = useMemo(() => {
    const map = {};
    filteredCampaigns.forEach(d => {
      const brand = normalizeBrand(d.advertiser_name);
      if (!map[brand]) map[brand] = { brand, spend: 0 };
      map[brand].spend += d.total_spend || 0;
    });
    return Object.values(map).sort((a, b) => b.spend - a.spend);
  }, [filteredCampaigns]);

  // Campaign daily stats: total spend + avg spend per campaign per day
  const campaignDailyStats = useMemo(() => {
    const map = {};
    filteredCampaigns.forEach(d => {
      const day = new Date(d.stat_time_day).toISOString().slice(0, 10);
      if (!map[day]) map[day] = { date: day.slice(5), fullDate: day, totalSpend: 0, campCount: 0 };
      map[day].totalSpend += d.total_spend || 0;
      map[day].campCount += 1;
    });
    return Object.values(map).sort((a, b) => a.fullDate.localeCompare(b.fullDate))
      .map(d => ({ ...d, avgSpend: d.campCount > 0 ? d.totalSpend / d.campCount : 0 }));
  }, [filteredCampaigns]);

  // Previous period filter (same duration, shifted back)
  const getPrevBounds = useMemo(() => {
    if (periodMode === 'all') return null;
    if (periodMode === 'range') {
      const { start, end } = dateRange;
      if (!start) return null;
      const lo = new Date(start); lo.setHours(0,0,0,0);
      const hi = end ? new Date(end) : new Date(lo); hi.setHours(23,59,59,999);
      const duration = hi - lo;
      const prevHi = new Date(lo.getTime() - 1); prevHi.setHours(23,59,59,999);
      const prevLo = new Date(prevHi.getTime() - duration); prevLo.setHours(0,0,0,0);
      return { lo: prevLo, hi: prevHi };
    }
    const days = +periodMode;
    const upperBound = new Date(maxProductDate); upperBound.setHours(23,59,59,999);
    const cutoff = new Date(maxProductDate); cutoff.setDate(cutoff.getDate() - days + 1); cutoff.setHours(0,0,0,0);
    const prevHi = new Date(cutoff.getTime() - 1); prevHi.setHours(23,59,59,999);
    const prevLo = new Date(prevHi); prevLo.setDate(prevLo.getDate() - days + 1); prevLo.setHours(0,0,0,0);
    return { lo: prevLo, hi: prevHi };
  }, [periodMode, dateRange, maxProductDate]);

  const prevFiltered = useMemo(() => {
    if (!getPrevBounds) return [];
    const { lo, hi } = getPrevBounds;
    const src = orderData.length ? orderData : productData;
    return src.filter(d => {
      if (!d.created_at) return false;
      const ts = new Date(d.created_at);
      if (ts < lo || ts > hi) return false;
      const platform = d.source || '';
      const matchPlatform = platformFilter === 'All'
        || (platformFilter === 'TikTok' && platform.toLowerCase().includes('tiktok'))
        || (platformFilter === 'Shopee' && platform.toLowerCase().includes('shopee'));
      return matchPlatform && (brandFilter === 'All' || normalizeBrand(d.org_name) === normalizeBrand(brandFilter));
    });
  }, [orderData, productData, platformFilter, brandFilter, getPrevBounds]);

  const prevFilteredAds = useMemo(() => {
    if (!getPrevBounds) return [];
    const { lo, hi } = getPrevBounds;
    return normalizedAds.filter(d => {
      const ts = new Date(d.col_9PJS783P || d.created_at);
      if (!ts || ts < lo || ts > hi) return false;
      const platform = d.Source || '';
      const matchPlatform = platformFilter === 'All'
        || (platformFilter === 'TikTok' && platform.toLowerCase().includes('tiktok'))
        || (platformFilter === 'Shopee' && platform.toLowerCase().includes('shopee'));
      const shopName = (d.filter || '').replace(/^[^_]+_/, '');
      return matchPlatform && (brandFilter === 'All' || normalizeBrand(shopName) === normalizeBrand(brandFilter));
    });
  }, [normalizedAds, platformFilter, brandFilter, getPrevBounds]);

  const prevFilteredTraffic = useMemo(() => {
    if (!getPrevBounds) return [];
    const { lo, hi } = getPrevBounds;
    return trafficData.filter(d => {
      if (!d.created_at) return false;
      const ts = new Date(d.created_at);
      if (ts < lo || ts > hi) return false;
      const platform = d.source || '';
      const matchPlatform = platformFilter === 'All'
        || (platformFilter === 'TikTok' && platform.toLowerCase().includes('tiktok'))
        || (platformFilter === 'Shopee' && platform.toLowerCase().includes('shopee'));
      const shopName = (d.filter || '').replace(/^[^_]+_/, '');
      const matchBrand = brandFilter === 'All' || normalizeBrand(shopName) === normalizeBrand(brandFilter);
      return matchPlatform && matchBrand;
    });
  }, [trafficData, platformFilter, brandFilter, getPrevBounds]);

  // Summary stats — GMV/orders/qty từ orderData (donhang), brand/product từ productData
  const totalGMV        = useMemo(() => filteredOrders.reduce((s, d) => s + (d.GMV || 0), 0), [filteredOrders]);
  const totalOrders     = useMemo(() => filteredOrders.reduce((s, d) => s + (d.count_order || 0), 0), [filteredOrders]);
  const totalQty        = useMemo(() => filteredOrders.reduce((s, d) => s + (d.product_quantity || 0), 0), [filteredOrders]);
  const totalAdsCost    = useMemo(() => filteredAds.reduce((s, d) => s + (d[ADS_COST_KEY] || 0), 0), [filteredAds]);
  const totalAdsRevenue = useMemo(() => filteredAds.reduce((s, d) => s + (d[ADS_REVENUE_KEY] || 0), 0), [filteredAds]);
  const totalAdsOrd     = useMemo(() => filteredAds.reduce((s, d) => s + (d[ADS_ORDERS_KEY] || 0), 0), [filteredAds]);
  const totalTraffic   = useMemo(() => filteredTraffic.reduce((s, d) => s + (d.traffic || 0), 0), [filteredTraffic]);
  const avgCPO  = totalAdsOrd > 0 ? totalAdsCost / totalAdsOrd : 0;
  const roas    = totalAdsCost > 0 ? totalAdsRevenue / totalAdsCost : 0;

  // Previous period stats — dùng prevFiltered (orderData hoặc productData)
  const prevGMV        = useMemo(() => prevFiltered.reduce((s, d) => s + (d.GMV || 0), 0), [prevFiltered]);
  const prevOrders     = useMemo(() => prevFiltered.reduce((s, d) => s + (d.count_order || 0), 0), [prevFiltered]);
  const prevQty        = useMemo(() => prevFiltered.reduce((s, d) => s + (d.product_quantity || 0), 0), [prevFiltered]);
  const prevAdsCost    = useMemo(() => prevFilteredAds.reduce((s, d) => s + (d[ADS_COST_KEY] || 0), 0), [prevFilteredAds]);
  const prevAdsRevenue = useMemo(() => prevFilteredAds.reduce((s, d) => s + (d[ADS_REVENUE_KEY] || 0), 0), [prevFilteredAds]);
  const prevAdsOrd     = useMemo(() => prevFilteredAds.reduce((s, d) => s + (d[ADS_ORDERS_KEY] || 0), 0), [prevFilteredAds]);
  const prevTraffic    = useMemo(() => prevFilteredTraffic.reduce((s, d) => s + (d.traffic || 0), 0), [prevFilteredTraffic]);
  const prevAvgCPO  = prevAdsOrd > 0 ? prevAdsCost / prevAdsOrd : 0;
  const prevRoas    = prevAdsCost > 0 ? prevAdsRevenue / prevAdsCost : 0;

  // AOV / ABS
  const avgAOV = totalOrders > 0 ? totalGMV / totalOrders : 0;
  const avgABS = totalOrders > 0 ? totalQty / totalOrders : 0;
  const prevAOV = prevOrders > 0 ? prevGMV / prevOrders : 0;
  const prevABS = prevOrders > 0 ? prevQty / prevOrders : 0;

  // By platform for pie
  // Dùng filteredOrders (donhang) thay vì filtered (product) vì donhang có data 3 tháng gần nhất
  const chartSource = filteredOrders.length ? filteredOrders : filtered;

  const byPlatform = useMemo(() => {
    const map = {};
    chartSource.forEach(d => {
      const k = sourceLabel(d.source);
      if (!map[k]) map[k] = { name: k, GMV: 0, orders: 0, color: sourceColor(d.source) };
      map[k].GMV += d.GMV || 0;
      map[k].orders += d.count_order || 0;
    });
    return Object.values(map).sort((a, b) => b.GMV - a.GMV);
  }, [chartSource]);

  // By brand bar chart
  const byBrand = useMemo(() => {
    const map = {};
    chartSource.forEach(d => {
      const name = normalizeBrand(d.org_name);
      if (!map[name]) map[name] = { name, GMV: 0, orders: 0 };
      map[name].GMV += d.GMV || 0;
      map[name].orders += d.count_order || 0;
    });
    return Object.values(map).sort((a, b) => b.GMV - a.GMV).slice(0, 8);
  }, [chartSource]);

  // Top products sorted by selected tab
  const topProducts = useMemo(() => {
    const sortKey = activeProductTab === 'gmv' ? 'GMV' : activeProductTab === 'orders' ? 'count_order' : 'product_quantity';
    return [...filtered].sort((a, b) => (b[sortKey] || 0) - (a[sortKey] || 0)).slice(0, 15);
  }, [filtered, activeProductTab]);

  // Ads aggregated by brand (sum daily deltas per shop)
  const adsByBrand = useMemo(() => {
    const map = {};
    filteredAds.forEach(d => {
      const shop = normalizeBrand((d.filter || '').replace(/^[^_]+_/, ''));
      const platform = d.Source || '';
      const key = shop + '|' + platform;
      if (!map[key]) map[key] = { name: shop, Source: platform, [ADS_COST_KEY]: 0, [ADS_REVENUE_KEY]: 0, [ADS_ORDERS_KEY]: 0 };
      map[key][ADS_COST_KEY]    += d[ADS_COST_KEY]    || 0;
      map[key][ADS_REVENUE_KEY] += d[ADS_REVENUE_KEY] || 0;
      map[key][ADS_ORDERS_KEY]  += d[ADS_ORDERS_KEY]  || 0;
    });
    return Object.values(map).sort((a, b) => (b[ADS_COST_KEY] || 0) - (a[ADS_COST_KEY] || 0));
  }, [filteredAds]);

  // ─── DAILY STATS (all metrics per day for dual-line charts) ─────────────────
  const dailyStats = useMemo(() => {
    const map = {};
    const ensure = (day) => {
      if (!map[day]) map[day] = { fullDate: day, date: day.slice(5), traffic: 0, gmv: 0, orders: 0, qty: 0, adsCost: 0, adsRevenue: 0, adsOrders: 0 };
    };
    filteredTraffic.forEach(d => {
      const day = d.created_at ? new Date(d.created_at).toISOString().slice(0, 10) : null;
      if (!day) return; ensure(day);
      map[day].traffic += d.traffic || 0;
    });
    filteredOrders.forEach(d => {
      const day = d.created_at ? new Date(d.created_at).toISOString().slice(0, 10) : null;
      if (!day) return; ensure(day);
      map[day].gmv    += d.GMV || 0;
      map[day].orders += d.count_order || 0;
      map[day].qty    += d.product_quantity || 0;
    });
    filteredAds.forEach(d => {
      const ts  = d.col_9PJS783P || d.created_at;
      const day = ts ? new Date(ts).toISOString().slice(0, 10) : null;
      if (!day) return; ensure(day);
      map[day].adsCost    += d[ADS_COST_KEY]    || 0;
      map[day].adsRevenue += d[ADS_REVENUE_KEY] || 0;
      map[day].adsOrders  += d[ADS_ORDERS_KEY]  || 0;
    });
    return Object.values(map)
      .sort((a, b) => a.fullDate.localeCompare(b.fullDate))
      .map(d => ({
        ...d,
        aov:  d.orders > 0 ? d.gmv / d.orders : 0,
        abs:  d.orders > 0 ? d.qty / d.orders : 0,
        cpo:  d.adsOrders > 0 ? d.adsCost / d.adsOrders : 0,
        roas: d.adsCost   > 0 ? d.adsRevenue / d.adsCost : 0,
      }));
  }, [filteredOrders, filteredTraffic, filteredAds]);

  // ─── METRIC CONFIGS (for trend chart) ─────────────────────────────────────
  const METRIC_CONFIGS = {
    traffic:     { label: 'Tổng Traffic',      color: '#6366f1', source: 'traffic', key: 'traffic',          format: v => v.toLocaleString('vi-VN') },
    gmv:         { label: 'Tổng GMV',         color: '#ea580c', source: 'orders', key: 'GMV',              format: fmt },
    orders:      { label: 'Tổng đơn hàng',    color: '#f59e0b', source: 'orders', key: 'count_order',     format: v => v.toLocaleString('vi-VN') },
    qty:         { label: 'Tổng sản phẩm',    color: '#10b981', source: 'orders', key: 'product_quantity', format: v => v.toLocaleString('vi-VN') },
    adsCost:     { label: 'Chi phí Ads',       color: '#3b82f6', source: 'ads',     key: ADS_COST_KEY,      format: fmt },
    adsRevenue:  { label: 'Doanh thu Ads',     color: '#10b981', source: 'ads',     key: ADS_REVENUE_KEY,   format: fmt },
    adsOrders:   { label: 'Đơn từ Ads',        color: '#8b5cf6', source: 'ads',     key: ADS_ORDERS_KEY,    format: v => v.toLocaleString('vi-VN') },
    cpo:         { label: 'CPO',               color: '#ec4899', source: 'ads',     key: null,              format: fmt },
    roas:        { label: 'ROAS',              color: '#f59e0b', source: 'ads',     key: null,              format: v => v.toFixed(2) + 'x' },
  };

  // ─── TREND DATA (daily aggregation for selected metric) ───────────────────
  const trendData = useMemo(() => {
    const cfg = METRIC_CONFIGS[selectedMetric];
    if (!cfg) return [];
    const data = cfg.source === 'orders' ? filteredOrders : cfg.source === 'traffic' ? filteredTraffic : filteredAds;
    const dateKey = cfg.source === 'ads' ? (d => d.col_9PJS783P || d.created_at) : 'created_at';

    const map = {};
    data.forEach(d => {
      const ts = typeof dateKey === 'function' ? dateKey(d) : d[dateKey];
      if (!ts) return;
      const day = new Date(ts).toISOString().slice(0, 10);
      if (!map[day]) map[day] = 0;

      if (selectedMetric === 'cpo') {
        // accumulate cost and orders separately, compute later
        if (!map[day + '_cost']) map[day + '_cost'] = 0;
        if (!map[day + '_ord']) map[day + '_ord'] = 0;
        map[day + '_cost'] += d[ADS_COST_KEY] || 0;
        map[day + '_ord'] += d[ADS_ORDERS_KEY] || 0;
      } else if (selectedMetric === 'roas') {
        if (!map[day + '_rev']) map[day + '_rev'] = 0;
        if (!map[day + '_cost']) map[day + '_cost'] = 0;
        map[day + '_rev'] += d[ADS_REVENUE_KEY] || 0;
        map[day + '_cost'] += d[ADS_COST_KEY] || 0;
      } else {
        map[day] += d[cfg.key] || 0;
      }
    });

    const days = [...new Set(data.map(d => {
      const ts = typeof dateKey === 'function' ? dateKey(d) : d[dateKey];
      return ts ? new Date(ts).toISOString().slice(0, 10) : null;
    }).filter(Boolean))].sort();

    return days.map(day => {
      let value;
      if (selectedMetric === 'cpo') {
        const ord = map[day + '_ord'] || 0;
        value = ord > 0 ? (map[day + '_cost'] || 0) / ord : 0;
      } else if (selectedMetric === 'roas') {
        const cost = map[day + '_cost'] || 0;
        value = cost > 0 ? (map[day + '_rev'] || 0) / cost : 0;
      } else {
        value = map[day] || 0;
      }
      return { date: day.slice(5), fullDate: day, value: Math.round(value) };
    });
  }, [filtered, filteredAds, filteredTraffic, selectedMetric]);

  // ─── RENDER ─────────────────────────────────────────────────────────────────
  const toggleMetric = (m, setter) => setter(prev => prev[0] === m ? prev : [m, prev[0]]);
  const s2DailyStats = dailyStats.filter(d => d.adsCost > 0 || d.adsOrders > 0);

  const filterBtnStyle = (active, color = '#ea580c') => ({
    padding: '7px 16px', borderRadius: '99px', fontWeight: 700,
    fontSize: '0.8rem', cursor: 'pointer', border: 'none',
    background: active ? color : '#f3f4f6',
    color: active ? '#fff' : '#666',
    transition: 'all 0.2s',
  });

  const tabStyle = (active) => ({
    padding: '6px 14px', borderRadius: 8, fontWeight: 700, fontSize: '0.8rem',
    cursor: 'pointer', border: 'none', transition: 'all 0.2s',
    background: active ? '#ea580c' : '#f3f4f6',
    color: active ? '#fff' : '#555',
  });

  const metricBtnStyle = (isP, isS, color) => ({
    padding: '7px 14px', borderRadius: 8, fontWeight: 700, fontSize: '0.8rem',
    cursor: 'pointer', border: `2px solid ${isP || isS ? color : '#f0f0f0'}`,
    background: isP ? color : isS ? color + '20' : '#f9fafb',
    color: isP ? '#fff' : isS ? color : '#9ca3af',
    transition: 'all 0.18s', display: 'flex', alignItems: 'center', gap: 5,
  });

  // Dual-line chart component
  const DualChart = ({ data, cfg1, cfg2, height = 250 }) => {
    if (!data || !data.length) return (
      <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: '0.85rem' }}>Không có dữ liệu</div>
    );
    const id1 = `dg_${cfg1.key}`;
    return (
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={data} margin={{ top: 20, right: 72, left: 0, bottom: 4 }}>
          <defs>
            <linearGradient id={id1} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={cfg1.color} stopOpacity={0.18} />
              <stop offset="95%" stopColor={cfg1.color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
          <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#9ca3af' }} tickLine={false} axisLine={false} />
          <YAxis yAxisId="left"  tick={{ fontSize: 11, fill: cfg1.color }} tickLine={false} axisLine={false} tickFormatter={cfg1.format} width={72} />
          <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: cfg2.color }} tickLine={false} axisLine={false} tickFormatter={cfg2.format} width={72} />
          <Tooltip
            contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 16px rgba(0,0,0,0.12)', fontFamily: "'Outfit',sans-serif" }}
            labelFormatter={(l, p) => p?.[0]?.payload?.fullDate || l}
            formatter={(v, name) => {
              const allCfg = { ...S1_CONFIGS, ...S2_CONFIGS, ...S3_CONFIGS };
              const c = Object.values(allCfg).find(x => x.key === name);
              return [c ? c.format(v) : v, c ? c.label : name];
            }}
          />
          <Area  yAxisId="left"  type="monotone" dataKey={cfg1.key} stroke={cfg1.color} strokeWidth={2.5} fill={`url(#${id1})`} dot={data.length <= 45 ? { r: 2.5, fill: cfg1.color } : false} activeDot={{ r: 5 }} />
          <Line  yAxisId="right" type="monotone" dataKey={cfg2.key} stroke={cfg2.color} strokeWidth={2} strokeDasharray="6 3" dot={false} activeDot={{ r: 4 }} />
        </ComposedChart>
      </ResponsiveContainer>
    );
  };

  return (
    <div style={{ fontFamily: "'Inter', 'Outfit', sans-serif", color: '#0f172a', maxWidth: 1300, margin: '0 auto', background: '#f8fafc', minHeight: '100vh', padding: '0 0 48px' }}>
      {/* Header */}
      <div style={{ background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '18px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 0 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 900, color: '#0f172a', letterSpacing: '-0.02em' }}>Stella Dashboard</h1>
          <p style={{ margin: '3px 0 0', color: '#94a3b8', fontSize: '0.75rem', fontWeight: 500 }}>
            {lastUpdated ? `Cập nhật lần cuối: ${lastUpdated.toLocaleTimeString('vi-VN')}` : 'Đang tải dữ liệu...'}
            {!loading && productData.length > 0 && (
              <span style={{ marginLeft: 10, color: '#f59e0b', fontWeight: 700 }}>
                📦 {maxProductDate.toLocaleDateString('vi-VN')}
                {adsData.length > 0 && <span style={{ color: '#60a5fa', marginLeft: 8 }}>📣 {maxAdsDate.toLocaleDateString('vi-VN')}</span>}
              </span>
            )}
          </p>
        </div>
        <button onClick={fetchAll} style={{
          padding: '9px 18px', borderRadius: 10, background: '#ea580c', color: '#fff',
          border: 'none', fontWeight: 700, cursor: 'pointer', fontSize: '0.82rem',
          boxShadow: '0 2px 8px rgba(234,88,12,0.3)', display: 'flex', alignItems: 'center', gap: 6, letterSpacing: '-0.01em'
        }}>🔄 Làm mới</button>
      </div>
      <div style={{ padding: '24px 28px' }}>

      {/* Errors */}
      {errors.length > 0 && (
        <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 12, padding: '12px 16px', marginBottom: 16, color: '#dc2626', fontSize: '0.85rem' }}>
          ⚠️ {errors.join(' | ')}
        </div>
      )}

      {/* ── FILTERS ── */}
      <div style={{ background: '#fff', borderRadius: 14, padding: '16px 20px', marginBottom: 28, border: '1px solid #e2e8f0', boxShadow: '0 1px 4px rgba(0,0,0,0.03)', position: 'sticky', top: 0, zIndex: 10 }}>
        {/* Row 1: Platform + Brand */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#6b7280' }}>Sàn:</span>
          {['All', 'TikTok', 'Shopee'].map(p => (
            <button key={p} style={filterBtnStyle(platformFilter === p)} onClick={() => setPlatformFilter(p)}>{p === 'All' ? '🌐 Tất cả' : p === 'TikTok' ? '🎵 TikTok' : '🛍️ Shopee'}</button>
          ))}
          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#6b7280', marginLeft: 8 }}>Nhãn hàng:</span>
          <select value={brandFilter} onChange={e => setBrandFilter(e.target.value)} style={{
            padding: '7px 12px', borderRadius: 10, border: '1px solid #e5e7eb', fontSize: '0.82rem',
            fontFamily: "'Outfit', sans-serif", fontWeight: 600, background: '#fff', cursor: 'pointer', color: '#333'
          }}>
            {allBrands.map(b => <option key={b} value={b}>{b === 'All' ? '— Tất cả nhãn hàng —' : b}</option>)}
          </select>
        </div>

        {/* Row 2: Period + Popup Calendar */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', position: 'relative' }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#6b7280' }}>Kỳ:</span>
          {[['all','📅 Tất cả'], ['1','1 Ngày'], ['7','7 Ngày'], ['30','30 Ngày']].map(([v, l]) => (
            <button key={v} style={filterBtnStyle(periodMode === v)}
              onClick={() => { setPeriodMode(v); setShowPicker(false); }}>
              {l}
            </button>
          ))}

          {/* Tuỳ chọn button → opens popup */}
          <div ref={pickerRef} style={{ position: 'relative' }}>
            <button
              style={filterBtnStyle(periodMode === 'range', '#0D9488')}
              onClick={() => { setPeriodMode('range'); setShowPicker(v => !v); }}
            >
              📆 Tuỳ chọn
              {periodMode === 'range' && dateRange.start && (
                <span style={{ marginLeft: 6, fontWeight: 400, fontSize: '0.75rem', opacity: 0.85 }}>
                  {dateRange.start.toLocaleDateString('vi-VN',{day:'2-digit',month:'2-digit'})}
                  {dateRange.end ? ' → ' + dateRange.end.toLocaleDateString('vi-VN',{day:'2-digit',month:'2-digit'}) : ''}
                </span>
              )}
            </button>

            {/* Popup calendar */}
            {showPicker && (
              <div style={{ position: 'absolute', top: 'calc(100% + 8px)', left: 0, zIndex: 999 }}>
                <DateRangePicker
                  value={dateRange}
                  anchorDate={maxProductDate}
                  onChange={(r) => {
                    setDateRange(r);
                    setPeriodMode('range');
                  }}
                  onClose={() => setShowPicker(false)}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ══ SECTION 1: TỔNG QUAN ══ */}
      <SectionHeader title="Tổng Quan" subtitle="Chỉ số hiệu suất tổng hợp theo ngày." />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 14 }}>
        <StatCard icon="👁️" label="Traffic"    value={totalTraffic.toLocaleString('vi-VN')} sub="lượt xem"   color="#6366f1" loading={loading} active={s1Metrics.includes('traffic')} onClick={() => toggleMetric('traffic', setS1Metrics)} compare={getPrevBounds ? { curr: totalTraffic, prev: prevTraffic } : null} />
        <StatCard icon="💰" label="Tổng GMV"   value={fmt(totalGMV)} sub={fmtFull(totalGMV)}                  color="#ea580c" loading={loading} active={s1Metrics.includes('gmv')}     onClick={() => toggleMetric('gmv', setS1Metrics)}     compare={getPrevBounds ? { curr: totalGMV, prev: prevGMV } : null} />
        <StatCard icon="📦" label="Đơn hàng"   value={totalOrders.toLocaleString('vi-VN')} sub="đơn"          color="#f59e0b" loading={loading} active={s1Metrics.includes('orders')}  onClick={() => toggleMetric('orders', setS1Metrics)}  compare={getPrevBounds ? { curr: totalOrders, prev: prevOrders } : null} />
        <StatCard icon="📊" label="AOV"         value={fmt(avgAOV)} sub="₫/đơn"                                color="#8b5cf6" loading={loading} active={s1Metrics.includes('aov')}     onClick={() => toggleMetric('aov', setS1Metrics)}     compare={getPrevBounds ? { curr: avgAOV, prev: prevAOV } : null} />
        <StatCard icon="🛒" label="ABS"         value={avgABS.toFixed(1)} sub="SP/đơn"                        color="#14b8a6" loading={loading} active={s1Metrics.includes('abs')}     onClick={() => toggleMetric('abs', setS1Metrics)}     compare={getPrevBounds ? { curr: avgABS, prev: prevABS } : null} />
      </div>

      {/* Section 1 Chart */}
      <div style={{ background: '#fff', borderRadius: 14, padding: '20px 24px', marginBottom: 36, boxShadow: '0 2px 8px rgba(0,0,0,0.04)', border: '1px solid #e2e8f0' }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
          {Object.entries(S1_CONFIGS).map(([k, cfg]) => {
            const isP = s1Metrics[0] === k, isS = s1Metrics[1] === k;
            return (
              <button key={k} onClick={() => toggleMetric(k, setS1Metrics)} style={metricBtnStyle(isP, isS, cfg.color)}>
                {cfg.icon} {cfg.label}
                {isP && <span style={{ width: 7, height: 7, borderRadius: 99, background: cfg.color, flexShrink: 0 }} />}
                {isS && <span style={{ width: 7, height: 7, borderRadius: 99, border: `2px solid ${cfg.color}`, flexShrink: 0 }} />}
              </button>
            );
          })}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 16, fontSize: '0.75rem', color: '#9ca3af', alignItems: 'center' }}>
            <span><span style={{ display: 'inline-block', width: 20, height: 2.5, background: S1_CONFIGS[s1Metrics[0]]?.color, marginRight: 4, verticalAlign: 'middle' }} />{S1_CONFIGS[s1Metrics[0]]?.label} (trái)</span>
            <span><span style={{ display: 'inline-block', width: 20, borderTop: `2px dashed ${S1_CONFIGS[s1Metrics[1]]?.color}`, marginRight: 4, verticalAlign: 'middle' }} />{S1_CONFIGS[s1Metrics[1]]?.label} (phải)</span>
            <span>({dailyStats.length} ngày)</span>
          </div>
        </div>
        {loading
          ? <div style={{ height: 250, background: '#f9fafb', borderRadius: 12, animation: 'pulse 1.5s infinite' }} />
          : <DualChart data={dailyStats} cfg1={S1_CONFIGS[s1Metrics[0]]} cfg2={S1_CONFIGS[s1Metrics[1]]} />
        }
      </div>

      {/* ══ SECTION 2: ADS ══ */}
      <SectionHeader title="Ads" subtitle="Hiệu suất chi tiêu quảng cáo có trả phí." />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 14 }}>
        <StatCard icon="📢" label="Chi phí Ads"   value={fmt(totalAdsCost)} sub={fmtFull(totalAdsCost)}         color="#3b82f6" loading={loading} active={s2Metrics.includes('adsCost')}    onClick={() => toggleMetric('adsCost', setS2Metrics)}    compare={getPrevBounds ? { curr: totalAdsCost, prev: prevAdsCost } : null} />
        <StatCard icon="💰" label="Doanh thu Ads" value={fmt(totalAdsRevenue)} sub={fmtFull(totalAdsRevenue)}   color="#10b981" loading={loading} active={s2Metrics.includes('adsRevenue')} onClick={() => toggleMetric('adsRevenue', setS2Metrics)} compare={getPrevBounds ? { curr: totalAdsRevenue, prev: prevAdsRevenue } : null} />
        <StatCard icon="🚀" label="ROAS"          value={roas > 0 ? roas.toFixed(2)+'x' : '—'} sub="DT/chi phí" color="#f59e0b" loading={loading} active={s2Metrics.includes('roas')}      onClick={() => toggleMetric('roas', setS2Metrics)}      compare={getPrevBounds ? { curr: roas, prev: prevRoas } : null} />
        <StatCard icon="💸" label="CPO"           value={fmt(avgCPO)} sub="₫/đơn"                               color="#ec4899" loading={loading} active={s2Metrics.includes('cpo')}       onClick={() => toggleMetric('cpo', setS2Metrics)}       compare={getPrevBounds ? { curr: avgCPO, prev: prevAvgCPO } : null} />
        <StatCard icon="🎯" label="Đơn từ Ads"   value={totalAdsOrd.toLocaleString('vi-VN')} sub="đơn"          color="#8b5cf6" loading={loading} active={s2Metrics.includes('adsOrders')} onClick={() => toggleMetric('adsOrders', setS2Metrics)} compare={getPrevBounds ? { curr: totalAdsOrd, prev: prevAdsOrd } : null} />
      </div>

      {/* Section 2 Chart */}
      <div style={{ background: '#fff', borderRadius: 14, padding: '20px 24px', marginBottom: 36, boxShadow: '0 2px 8px rgba(0,0,0,0.04)', border: '1px solid #e2e8f0' }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
          {Object.entries(S2_CONFIGS).map(([k, cfg]) => {
            const isP = s2Metrics[0] === k, isS = s2Metrics[1] === k;
            return (
              <button key={k} onClick={() => toggleMetric(k, setS2Metrics)} style={metricBtnStyle(isP, isS, cfg.color)}>
                {cfg.icon} {cfg.label}
                {isP && <span style={{ width: 7, height: 7, borderRadius: 99, background: cfg.color, flexShrink: 0 }} />}
                {isS && <span style={{ width: 7, height: 7, borderRadius: 99, border: `2px solid ${cfg.color}`, flexShrink: 0 }} />}
              </button>
            );
          })}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 16, fontSize: '0.75rem', color: '#9ca3af', alignItems: 'center' }}>
            <span><span style={{ display: 'inline-block', width: 20, height: 2.5, background: S2_CONFIGS[s2Metrics[0]]?.color, marginRight: 4, verticalAlign: 'middle' }} />{S2_CONFIGS[s2Metrics[0]]?.label} (trái)</span>
            <span><span style={{ display: 'inline-block', width: 20, borderTop: `2px dashed ${S2_CONFIGS[s2Metrics[1]]?.color}`, marginRight: 4, verticalAlign: 'middle' }} />{S2_CONFIGS[s2Metrics[1]]?.label} (phải)</span>
            <span>({s2DailyStats.length} ngày)</span>
          </div>
        </div>
        {loading
          ? <div style={{ height: 250, background: '#f9fafb', borderRadius: 12, animation: 'pulse 1.5s infinite' }} />
          : <DualChart data={s2DailyStats} cfg1={S2_CONFIGS[s2Metrics[0]]} cfg2={S2_CONFIGS[s2Metrics[1]]} />
        }
      </div>

      {/* ══ PHÂN TÍCH BRAND ══ */}
      <SectionHeader title="Phân Tích" subtitle="Phân tích chi tiết doanh thu theo nhãn hàng." />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 16, marginBottom: 28, alignItems: 'start' }}>
        {/* Brand GMV Table */}
        <div style={{ background: '#fff', borderRadius: 14, overflow: 'hidden', border: '1px solid #e2e8f0', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.83rem' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                <th style={{ padding: '12px 20px', textAlign: 'left', fontWeight: 800, fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.07em', color: '#64748b' }}>Brand</th>
                <th style={{ padding: '12px 20px', textAlign: 'right', fontWeight: 800, fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.07em', color: '#64748b' }}>GMV</th>
                <th style={{ padding: '12px 20px', textAlign: 'right', fontWeight: 800, fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.07em', color: '#64748b' }}>Đơn</th>
                <th style={{ padding: '12px 20px', textAlign: 'left', fontWeight: 800, fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.07em', color: '#64748b' }}>Share</th>
              </tr>
            </thead>
            <tbody>
              {loading ? Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  {[1,2,3,4].map(j => <td key={j} style={{ padding: '14px 20px' }}><div style={{ height: 14, background: '#f1f5f9', borderRadius: 4, animation: 'pulse 1.5s infinite' }} /></td>)}
                </tr>
              )) : (() => {
                const totalGMVBrand = byBrand.reduce((s, d) => s + d.GMV, 0);
                const initials = (n) => n.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase();
                return byBrand.map((item, i) => {
                  const pct = totalGMVBrand > 0 ? (item.GMV / totalGMVBrand * 100) : 0;
                  return (
                    <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}
                      onMouseEnter={e => e.currentTarget.style.background = '#fef7f0'}
                      onMouseLeave={e => e.currentTarget.style.background = ''}>
                      <td style={{ padding: '14px 20px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ width: 32, height: 32, borderRadius: 8, background: COLORS[i % COLORS.length]+'20', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', fontWeight: 900, color: COLORS[i % COLORS.length], flexShrink: 0 }}>
                            {initials(item.name)}
                          </div>
                          <span style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.85rem' }}>{item.name}</span>
                        </div>
                      </td>
                      <td style={{ padding: '14px 20px', textAlign: 'right', fontWeight: 800, color: '#ea580c', fontSize: '0.85rem' }}>{fmt(item.GMV)}</td>
                      <td style={{ padding: '14px 20px', textAlign: 'right', fontWeight: 600, color: '#64748b', fontSize: '0.82rem' }}>{(item.orders||0).toLocaleString()}</td>
                      <td style={{ padding: '14px 20px', minWidth: 120 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ flex: 1, height: 5, background: '#f1f5f9', borderRadius: 99, overflow: 'hidden' }}>
                            <div style={{ width: pct+'%', height: '100%', background: COLORS[i % COLORS.length], borderRadius: 99 }} />
                          </div>
                          <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#475569', minWidth: 32 }}>{pct.toFixed(0)}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                });
              })()}
            </tbody>
          </table>
        </div>
        {/* Ring chart */}
        <div style={{ background: '#fff', borderRadius: 14, padding: '24px', border: '1px solid #e2e8f0', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', width: 280, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ fontWeight: 800, fontSize: '0.85rem', color: '#0f172a', marginBottom: 16 }}>Brand Distribution</div>
          {loading ? <div style={{ height: 200, width: 200, background: '#f1f5f9', borderRadius: '50%', animation: 'pulse 1.5s infinite' }} /> : (
            <ResponsiveContainer width={200} height={200}>
              <PieChart>
                <Pie data={byBrand} dataKey="GMV" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={88} labelLine={false}
                  label={({ cx, cy, midAngle, innerRadius, outerRadius, percent }) => {
                    if (percent < 0.07) return null;
                    const R = Math.PI / 180, r = innerRadius + (outerRadius - innerRadius) * 0.55;
                    return <text x={cx + r * Math.cos(-midAngle * R)} y={cy + r * Math.sin(-midAngle * R)} fill="#fff" textAnchor="middle" dominantBaseline="central" fontSize={10} fontWeight={800}>{(percent * 100).toFixed(0)}%</text>;
                  }}>
                  {byBrand.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v, name) => [fmt(v), name]} />
              </PieChart>
            </ResponsiveContainer>
          )}
          <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: '8px 16px', justifyContent: 'center' }}>
            {byBrand.slice(0,4).map((item, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: COLORS[i % COLORS.length] }} />
                <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{item.name.split(' ')[0]} {byBrand.reduce((s,d)=>s+d.GMV,0) > 0 ? Math.round(item.GMV/byBrand.reduce((s,d)=>s+d.GMV,0)*100)+'%' : ''}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── TOP PRODUCTS TABLE ── */}
      <SectionHeader title="Top Sản Phẩm" subtitle="Sản phẩm bán chạy nhất theo kỳ đã chọn." />
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        {[['gmv', '💰 Theo GMV'], ['orders', '📦 Theo đơn'], ['qty', '🛒 Theo số lượng']].map(([k, l]) => (
          <button key={k} style={tabStyle(activeProductTab === k)} onClick={() => setActiveProductTab(k)}>{l}</button>
        ))}
      </div>
      <div style={{ background: '#fff', borderRadius: 14, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', border: '1px solid #e2e8f0' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.83rem' }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 800, fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.07em', color: '#64748b', width: 36 }}>#</th>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 800, fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.07em', color: '#64748b' }}>Sản phẩm</th>
              <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 800, fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.07em', color: '#64748b' }}>GMV</th>
              <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 800, fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.07em', color: '#64748b' }}>Đơn</th>
              <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 800, fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.07em', color: '#64748b' }}>SL bán</th>
              <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 800, fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.07em', color: '#64748b' }}>Sàn</th>
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #f9fafb' }}>
                  {Array.from({ length: 6 }).map((_, j) => (
                    <td key={j} style={{ padding: '14px 16px' }}><div style={{ height: 14, background: '#f3f4f6', borderRadius: 4, animation: 'pulse 1.5s infinite' }} /></td>
                  ))}
                </tr>
              ))
              : topProducts.map((item, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #f9fafb', transition: 'background 0.15s' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#fffbf5'}
                  onMouseLeave={e => e.currentTarget.style.background = ''}>
                  <td style={{ padding: '12px 16px', color: i < 3 ? '#ea580c' : '#9ca3af', fontWeight: 800, fontSize: '0.95rem' }}>
                    {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
                  </td>
                  <td style={{ padding: '12px 16px', maxWidth: 380 }}>
                    <div style={{ fontWeight: 600, color: '#111', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                      {item.product_name}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: '#9ca3af', marginTop: 2 }}>{item.org_name}</div>
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 800, color: '#ea580c', whiteSpace: 'nowrap' }}>{fmt(item.GMV)}</td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: '#374151' }}>{(item.count_order || 0).toLocaleString()}</td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: '#374151' }}>{(item.product_quantity || 0).toLocaleString()}</td>
                  <td style={{ padding: '12px 16px', textAlign: 'center' }}><SourceBadge source={item.source} /></td>
                </tr>
              ))
            }
          </tbody>
        </table>
      </div>

      {/* ── ADS TABLE ── */}
      <SectionHeader title="Chi Tiết Ads theo Nhãn Hàng" subtitle="Chi phí, doanh thu và hiệu quả quảng cáo theo từng brand." />
      <div style={{ background: '#fff', borderRadius: 14, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', border: '1px solid #e2e8f0', marginBottom: 36 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.83rem' }}>
          <thead>
            <tr style={{ background: '#f9fafb', borderBottom: '2px solid #f3f4f6' }}>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 800, color: '#374151' }}>Nhãn hàng / Shop</th>
              <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 800, color: '#374151' }}>Sàn</th>
              <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 800, color: '#374151' }}>Chi phí Ads</th>
              <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 800, color: '#374151' }}>Doanh thu Ads</th>
              <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 800, color: '#374151' }}>Đơn từ Ads</th>
              <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 800, color: '#374151' }}>CPO</th>
              <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 800, color: '#374151' }}>ROAS</th>
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #f9fafb' }}>
                  {Array.from({ length: 5 }).map((_, j) => (
                    <td key={j} style={{ padding: '14px 16px' }}><div style={{ height: 14, background: '#f3f4f6', borderRadius: 4 }} /></td>
                  ))}
                </tr>
              ))
              : adsByBrand.map((item, i) => {
                const cost    = item[ADS_COST_KEY] || 0;
                const rev     = item[ADS_REVENUE_KEY] || 0;
                const orders  = item[ADS_ORDERS_KEY] || 0;
                const cpo     = orders > 0 ? cost / orders : 0;
                const itemROAS = cost > 0 ? rev / cost : 0;
                return (
                  <tr key={i} style={{ borderBottom: '1px solid #f9fafb' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#fffbf5'}
                    onMouseLeave={e => e.currentTarget.style.background = ''}>
                    <td style={{ padding: '12px 16px', fontWeight: 700, color: '#111' }}>{item.name || '—'}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'center' }}><SourceBadge source={item.Source} /></td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 800, color: '#3b82f6' }}>{fmt(cost)}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 800, color: '#10b981' }}>{rev > 0 ? fmt(rev) : '—'}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: '#374151' }}>{orders.toLocaleString()}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: cpo < 50000 ? '#10b981' : '#f59e0b' }}>
                      {orders > 0 ? fmt(cpo) : '—'}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 800, color: itemROAS >= 3 ? '#10b981' : itemROAS >= 1 ? '#f59e0b' : '#ef4444' }}>
                      {cost > 0 ? itemROAS.toFixed(2) + 'x' : '—'}
                    </td>
                  </tr>
                );
              })
            }
            {/* Total row */}
            {!loading && adsByBrand.length > 0 && (
              <tr style={{ background: '#fff7ed', borderTop: '2px solid #fed7aa' }}>
                <td colSpan={2} style={{ padding: '14px 16px', fontWeight: 900, color: '#ea580c' }}>TỔNG</td>
                <td style={{ padding: '14px 16px', textAlign: 'right', fontWeight: 900, color: '#ea580c' }}>{fmt(totalAdsCost)}</td>
                <td style={{ padding: '14px 16px', textAlign: 'right', fontWeight: 900, color: '#10b981' }}>{fmt(totalAdsRevenue)}</td>
                <td style={{ padding: '14px 16px', textAlign: 'right', fontWeight: 900, color: '#ea580c' }}>{totalAdsOrd.toLocaleString()}</td>
                <td style={{ padding: '14px 16px', textAlign: 'right', fontWeight: 900, color: '#ea580c' }}>{totalAdsOrd > 0 ? fmt(avgCPO) : '—'}</td>
                <td style={{ padding: '14px 16px', textAlign: 'right', fontWeight: 900, color: roas >= 3 ? '#10b981' : '#f59e0b' }}>{roas > 0 ? roas.toFixed(2) + 'x' : '—'}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ══ SECTION 3: CHIẾN DỊCH TIKTOK ADS ══ */}
      <SectionHeader title="Chiến Dịch TikTok Ads" subtitle="Chi phí theo từng chiến dịch quảng cáo TikTok." />

      {/* KPI row — clickable cards swap chart metric */}
      {(() => {
        const avgSpendVal = filteredCampaigns.length > 0
          ? totalCampaignSpend / [...new Set(filteredCampaigns.map(d => new Date(d.stat_time_day).toISOString().slice(0,10)))].length
          : 0;
        const cards = [
          { key: 'totalSpend', icon: '💸', label: 'Tổng chi phí chiến dịch', value: fmt(totalCampaignSpend), sub: Number(totalCampaignSpend).toLocaleString('vi-VN')+'₫', color: '#f43f5e' },
          { key: null,         icon: '📋', label: 'Số chiến dịch',           value: campaignsByName.length.toLocaleString(), sub: 'chiến dịch active', color: '#8b5cf6' },
          { key: 'avgSpend',   icon: '📅', label: 'Avg chi phí/ngày',        value: fmt(avgSpendVal), sub: '₫/ngày', color: '#0ea5e9' },
        ];
        return (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 12, marginBottom: 12 }}>
            {cards.map(c => {
              const active = c.key && s3Metrics.includes(c.key);
              const isPrimary = c.key === s3Metrics[0];
              return (
                <div key={c.key || 'count'}
                  onClick={() => c.key && toggleMetric(c.key, setS3Metrics)}
                  style={{ background: '#fff', borderRadius: 14, padding: '16px 18px', boxShadow: '0 1px 6px rgba(0,0,0,0.06)', border: active ? `2px solid ${c.color}` : '2px solid transparent', cursor: c.key ? 'pointer' : 'default', transition: 'border 0.2s' }}>
                  <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
                    {c.icon} {c.label}
                    {active && <span style={{ marginLeft: 6, fontSize: '0.65rem', background: c.color, color: '#fff', borderRadius: 99, padding: '1px 6px' }}>{isPrimary ? 'Trái' : 'Phải'}</span>}
                  </div>
                  {loading
                    ? <div style={{ height: 28, background: '#f3f4f6', borderRadius: 6, animation: 'pulse 1.5s infinite', margin: '4px 0' }} />
                    : <div style={{ fontSize: '1.5rem', fontWeight: 900, color: active ? c.color : '#111' }}>{c.value}</div>
                  }
                  <div style={{ fontSize: '0.72rem', color: '#9ca3af', marginTop: 2 }}>{c.sub}</div>
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* Dual chart — Tổng chi phí vs Avg chi phí/ngày */}
      <div style={{ background: '#fff', borderRadius: 16, padding: '18px 24px', marginBottom: 20, boxShadow: '0 1px 6px rgba(0,0,0,0.06)', border: '1px solid #f3f4f6' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <span style={{ fontWeight: 800, fontSize: '0.88rem', color: '#111' }}>📈 Chi phí chiến dịch theo ngày</span>
          <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
            — {S3_CONFIGS[s3Metrics[0]]?.label} (trái) &nbsp;·&nbsp; - - {S3_CONFIGS[s3Metrics[1]]?.label} (phải) &nbsp;·&nbsp; ({campaignDailyStats.length} ngày)
          </span>
        </div>
        <DualChart data={campaignDailyStats} cfg1={S3_CONFIGS[s3Metrics[0]]} cfg2={S3_CONFIGS[s3Metrics[1]]} height={240} />
      </div>

      {/* Brand summary table */}
      <div style={{ background: '#fff', borderRadius: 16, overflow: 'hidden', boxShadow: '0 1px 6px rgba(0,0,0,0.06)', border: '1px solid #f3f4f6', marginBottom: 16 }}>
        <div style={{ padding: '14px 20px', borderBottom: '2px solid #f3f4f6', fontWeight: 800, fontSize: '0.88rem', color: '#111' }}>
          📊 Tổng chi phí theo Brand
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
          <thead>
            <tr style={{ background: '#f9fafb' }}>
              <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 700, color: '#374151' }}>Brand</th>
              <th style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 700, color: '#374151' }}>Chi phí Ads</th>
              <th style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 700, color: '#374151' }}>% Tổng</th>
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 4 }).map((_, i) => (
                <tr key={i} style={{ borderTop: '1px solid #f3f4f6' }}>
                  {[1,2,3].map(j => <td key={j} style={{ padding: '12px 16px' }}><div style={{ height: 14, background: '#f3f4f6', borderRadius: 4, animation: 'pulse 1.5s infinite' }} /></td>)}
                </tr>
              ))
              : campaignsByBrand.map((item, i) => {
                const pct = totalCampaignSpend > 0 ? (item.spend / totalCampaignSpend * 100) : 0;
                return (
                  <tr key={i} style={{ borderTop: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '12px 16px', fontWeight: 700, color: '#111' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ width: 10, height: 10, borderRadius: '50%', background: COLORS[i % COLORS.length], display: 'inline-block' }} />
                        {item.brand}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 800, color: '#f43f5e' }}>{fmt(item.spend)}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
                        <div style={{ width: 60, height: 6, background: '#f3f4f6', borderRadius: 99, overflow: 'hidden' }}>
                          <div style={{ width: pct + '%', height: '100%', background: COLORS[i % COLORS.length], borderRadius: 99 }} />
                        </div>
                        <span style={{ fontWeight: 700, color: '#374151', minWidth: 36 }}>{pct.toFixed(1)}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })
            }
            {!loading && campaignsByBrand.length > 0 && (
              <tr style={{ borderTop: '2px solid #f3f4f6', background: '#fafafa' }}>
                <td style={{ padding: '12px 16px', fontWeight: 900, color: '#111' }}>TỔNG</td>
                <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 900, color: '#f43f5e' }}>{fmt(totalCampaignSpend)}</td>
                <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: '#9ca3af' }}>100%</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Campaign breakdown table */}
      <div style={{ background: '#fff', borderRadius: 14, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', border: '1px solid #e2e8f0', marginBottom: 36 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.83rem' }}>
          <thead>
            <tr style={{ background: '#f9fafb', borderBottom: '2px solid #f3f4f6' }}>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 800, color: '#374151', width: 36 }}>#</th>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 800, color: '#374151' }}>Chiến dịch</th>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 800, color: '#374151' }}>Nhãn hàng</th>
              <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 800, color: '#374151' }}>Chi phí</th>
              <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 800, color: '#374151' }}>% Tổng</th>
              <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 800, color: '#374151' }}>Số ngày</th>
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #f9fafb' }}>
                  {Array.from({ length: 6 }).map((_, j) => (
                    <td key={j} style={{ padding: '14px 16px' }}><div style={{ height: 14, background: '#f3f4f6', borderRadius: 4, animation: 'pulse 1.5s infinite' }} /></td>
                  ))}
                </tr>
              ))
              : campaignsByName.slice(0, 20).map((item, i) => {
                const pct = totalCampaignSpend > 0 ? (item.spend / totalCampaignSpend * 100) : 0;
                return (
                  <tr key={i} style={{ borderBottom: '1px solid #f9fafb', transition: 'background 0.15s' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#fff5f5'}
                    onMouseLeave={e => e.currentTarget.style.background = ''}>
                    <td style={{ padding: '12px 16px', color: i < 3 ? '#f43f5e' : '#9ca3af', fontWeight: 800 }}>
                      {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
                    </td>
                    <td style={{ padding: '12px 16px', fontWeight: 600, color: '#111', maxWidth: 280 }}>
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.campaign}</div>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{ padding: '2px 10px', borderRadius: 99, background: '#fef3c7', color: '#92400e', fontSize: '0.75rem', fontWeight: 700 }}>{item.brand}</span>
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 800, color: '#f43f5e' }}>{fmt(item.spend)}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
                        <div style={{ width: 60, height: 6, background: '#f3f4f6', borderRadius: 99, overflow: 'hidden' }}>
                          <div style={{ width: pct + '%', height: '100%', background: '#f43f5e', borderRadius: 99 }} />
                        </div>
                        <span style={{ fontWeight: 700, color: '#374151', fontSize: '0.8rem', minWidth: 36 }}>{pct.toFixed(1)}%</span>
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', color: '#6b7280', fontWeight: 600 }}>{item.days}</td>
                  </tr>
                );
              })
            }
            {!loading && campaignsByName.length === 0 && (
              <tr><td colSpan={6} style={{ padding: 32, textAlign: 'center', color: '#9ca3af' }}>Không có data chiến dịch cho kỳ này</td></tr>
            )}
          </tbody>
        </table>
      </div>

      </div>
      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: .5; } }
      `}</style>
    </div>
  );
};

export default StellaDashboardTab;
