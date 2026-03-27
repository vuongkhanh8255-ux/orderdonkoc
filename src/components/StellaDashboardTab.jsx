// src/components/StellaDashboardTab.jsx
import { useState, useEffect, useMemo, useRef } from 'react';
import DateRangePicker from './DateRangePicker';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
  LineChart, Line, Area, AreaChart
} from 'recharts';

// ─── API PATHS ────────────────────────────────────────────────────────────────
const BASE = '/bluecore-api/api/services/app/PublicRecommendation/Get?tenancyName=hoanganhannie&replaceUnicode=false';
const API_ORDERS  = BASE + '&sectionName=Stella_API_donhang';   // đơn hàng tổng hợp theo ngày/org
const API_PRODUCT = BASE + '&sectionName=Stella_api_product';   // chi tiết sản phẩm (dùng cho top products / brand chart)
const API_TRAFFIC = BASE + '&sectionName=Stella_api_traffic';
const API_ADS     = BASE + '&sectionName=stella_api_tongquanads';

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
  const total = first?.count_row || first?.total_row || 100;
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

// Normalize org_name → canonical brand name (gộp mọi shop cùng brand)
const normalizeBrand = (orgName) => {
  if (!orgName) return 'Không rõ';
  const n = orgName.toLowerCase().replace(/[\s_]/g, '');
  if (n.includes('bodymiss'))  return 'Body Miss';
  if (n.includes('milaganics')) return 'Milaganics';
  if (n.includes('moaw'))      return 'Moaw Moaws';
  if (n.includes('eherb'))     return 'eHerb';
  return orgName.replace(/^(Tiktok|Shopee)\s*[-–]\s*/i, '').trim();
};

// ─── SUB-COMPONENTS ──────────────────────────────────────────────────────────
const StatCard = ({ icon, label, value, sub, color = '#ea580c', loading, active, onClick, compare }) => {
  let badge = null;
  if (compare != null && !loading && compare.prev > 0) {
    const { curr, prev } = compare;
    const delta = ((curr - prev) / prev) * 100;
    const isUp = delta >= 0;
    badge = (
      <div style={{
        fontSize: '0.68rem', fontWeight: 700, marginTop: 3,
        color: isUp ? '#16a34a' : '#dc2626',
      }}>
        {isUp ? '▲' : '▼'}{Math.abs(delta).toFixed(1)}% vs kỳ trước
      </div>
    );
  }
  return (
    <div onClick={onClick} style={{
      background: active ? color + '08' : '#fff', borderRadius: '16px', padding: '20px 24px',
      boxShadow: active ? `0 0 0 2px ${color}, 0 4px 12px ${color}25` : '0 1px 6px rgba(0,0,0,0.06)',
      border: active ? 'none' : '1px solid #f3f4f6',
      display: 'flex', gap: '16px', alignItems: 'center',
      cursor: onClick ? 'pointer' : 'default', transition: 'all 0.2s',
    }}>
      <div style={{
        width: 48, height: 48, borderRadius: '14px', flexShrink: 0,
        background: color + '18', display: 'flex', alignItems: 'center',
        justifyContent: 'center', fontSize: '1.4rem'
      }}>{icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '0.75rem', color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 2 }}>{label}</div>
        {loading
          ? <div style={{ height: 28, width: '60%', background: '#f3f4f6', borderRadius: 6, animation: 'pulse 1.5s infinite' }} />
          : <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#111', lineHeight: 1.1 }}>{value}</div>
        }
        {sub && !loading && <div style={{ fontSize: '0.78rem', color: '#6b7280', marginTop: 2 }}>{sub}</div>}
        {badge}
      </div>
    </div>
  );
};

const SectionHeader = ({ title, icon }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '28px 0 14px' }}>
    <span style={{ fontSize: '1.3rem' }}>{icon}</span>
    <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#111', letterSpacing: '0.3px' }}>{title}</h3>
    <div style={{ flex: 1, height: 1, background: '#f3f4f6', marginLeft: 8 }} />
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
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState([]);
  const [lastUpdated, setLastUpdated] = useState(null);

  // Filters
  const [platformFilter, setPlatformFilter] = useState('All');
  const [brandFilter, setBrandFilter] = useState('All');
  const [activeProductTab, setActiveProductTab] = useState('gmv'); // gmv | orders | qty
  const [selectedMetric, setSelectedMetric] = useState('gmv'); // for trend chart

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
      // Fetch tất cả parallel: Orders (per filter), Product, Ads, Traffic (per filter)
      const [jAds, jProduct, ...filterResults] = await Promise.all([
        fetchAllRows(API_ADS),
        fetchAllRows(API_PRODUCT),
        ...SHOP_FILTERS.map(f =>
          fetchAllRows(API_ORDERS + '&filter=' + encodeURIComponent(f))
            .catch(() => ({ success: false, result: [] }))
        ),
        ...SHOP_FILTERS.map(f =>
          fetchAllRows(API_TRAFFIC + '&filter=' + encodeURIComponent(f))
            .catch(() => ({ success: false, result: [] }))
        ),
      ]);

      if (jAds.success && jAds.result) setAdsData(jAds.result.map(i => i._source));
      else errs.push('Ads API lỗi');

      if (jProduct.success && jProduct.result) setProductData(jProduct.result.map(i => i._source));
      else errs.push('Product API lỗi');

      // filterResults = [orders×13, traffic×13]
      const n = SHOP_FILTERS.length;
      const orderResults  = filterResults.slice(0, n);
      const trafficResults = filterResults.slice(n);

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
      if (!allTraffic.length) errs.push('Traffic API: không có data');

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
    productData.forEach(d => { if (d.org_name) brands.add(d.org_name); });
    return ['All', ...Array.from(brands).sort()];
  }, [productData]);

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
    return adsData.filter(d => {
      const ts = d.col_9PJS783P || d.created_at;
      if (periodMode === 'all' && ts < DATA_START) return false;
      const platform = d.Source || '';
      const matchPlatform = platformFilter === 'All'
        || (platformFilter === 'TikTok' && platform.toLowerCase().includes('tiktok'))
        || (platformFilter === 'Shopee' && platform.toLowerCase().includes('shopee'));
      const matchBrand = brandFilter === 'All' || d.col_9TP6E83EC5MMA === brandFilter;
      return matchPlatform && matchBrand && matchDate(ts);
    });
  }, [adsData, platformFilter, brandFilter, periodMode, dateRange]);

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
    return adsData.filter(d => {
      const ts = new Date(d.col_9PJS783P || d.created_at);
      if (!ts || ts < lo || ts > hi) return false;
      const platform = d.Source || '';
      const matchPlatform = platformFilter === 'All'
        || (platformFilter === 'TikTok' && platform.toLowerCase().includes('tiktok'))
        || (platformFilter === 'Shopee' && platform.toLowerCase().includes('shopee'));
      return matchPlatform && (brandFilter === 'All' || d.col_9TP6E83EC5MMA === brandFilter);
    });
  }, [adsData, platformFilter, brandFilter, getPrevBounds]);

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

  // By platform for pie
  const byPlatform = useMemo(() => {
    const map = {};
    filtered.forEach(d => {
      const k = sourceLabel(d.source);
      if (!map[k]) map[k] = { name: k, GMV: 0, orders: 0, color: sourceColor(d.source) };
      map[k].GMV += d.GMV || 0;
      map[k].orders += d.count_order || 0;
    });
    return Object.values(map).sort((a, b) => b.GMV - a.GMV);
  }, [filtered]);

  // By brand bar chart
  const byBrand = useMemo(() => {
    const map = {};
    filtered.forEach(d => {
      const name = normalizeBrand(d.org_name);
      if (!map[name]) map[name] = { name, GMV: 0, orders: 0 };
      map[name].GMV += d.GMV || 0;
      map[name].orders += d.count_order || 0;
    });
    return Object.values(map).sort((a, b) => b.GMV - a.GMV).slice(0, 8);
  }, [filtered]);

  // Top products sorted by selected tab
  const topProducts = useMemo(() => {
    const sortKey = activeProductTab === 'gmv' ? 'GMV' : activeProductTab === 'orders' ? 'count_order' : 'product_quantity';
    return [...filtered].sort((a, b) => (b[sortKey] || 0) - (a[sortKey] || 0)).slice(0, 15);
  }, [filtered, activeProductTab]);

  // Ads by brand
  const adsByBrand = useMemo(() => {
    return [...filteredAds].sort((a, b) => (b[ADS_COST_KEY] || 0) - (a[ADS_COST_KEY] || 0));
  }, [filteredAds]);

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

  const selectStyle = {
    padding: '7px 10px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: '0.82rem',
    fontFamily: "'Outfit', sans-serif", fontWeight: 700, background: '#fff',
    cursor: 'pointer', color: '#333', minWidth: 60
  };

  return (
    <div style={{ fontFamily: "'Outfit', sans-serif", color: '#111', maxWidth: 1200, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 900, color: '#ea580c' }}>📊 Stella Dashboard</h1>
          <p style={{ margin: '4px 0 0', color: '#9ca3af', fontSize: '0.82rem' }}>
            {lastUpdated ? `Cập nhật lần cuối: ${lastUpdated.toLocaleTimeString('vi-VN')}` : 'Đang tải dữ liệu...'}
            {!loading && productData.length > 0 && (
              <span style={{ marginLeft: 12, color: '#f59e0b', fontWeight: 700 }}>
                📦 Sản phẩm: {maxProductDate.toLocaleDateString('vi-VN')}
                {adsData.length > 0 && <span style={{ color: '#60a5fa', marginLeft: 8 }}>📣 Ads: {maxAdsDate.toLocaleDateString('vi-VN')}</span>}
                {' '}<span style={{ color: '#9ca3af', fontWeight: 400 }}>(Bộ lọc kỳ tính từ ngày sản phẩm)</span>
              </span>
            )}
          </p>
        </div>
        <button onClick={fetchAll} style={{
          padding: '10px 20px', borderRadius: 12, background: '#ea580c', color: '#fff',
          border: 'none', fontWeight: 700, cursor: 'pointer', fontSize: '0.85rem',
          boxShadow: '0 2px 8px rgba(234,88,12,0.25)', display: 'flex', alignItems: 'center', gap: 6
        }}>🔄 Làm mới</button>
      </div>

      {/* Errors */}
      {errors.length > 0 && (
        <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 12, padding: '12px 16px', marginBottom: 16, color: '#dc2626', fontSize: '0.85rem' }}>
          ⚠️ {errors.join(' | ')}
        </div>
      )}

      {/* ── FILTERS ── */}
      <div style={{ background: '#fff', borderRadius: 14, padding: '16px 20px', marginBottom: 20, border: '1px solid #f3f4f6', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
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

      {/* ── KPI CARDS (clickable → trend chart) ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 8 }}>
        <StatCard icon="👁️" label="Tổng Traffic" value={totalTraffic.toLocaleString('vi-VN')} sub="lượt xem" color="#6366f1" loading={loading} active={selectedMetric==='traffic'} onClick={()=>setSelectedMetric('traffic')} compare={getPrevBounds ? { curr: totalTraffic, prev: prevTraffic } : null} />
        <StatCard icon="💰" label="Tổng GMV" value={fmt(totalGMV)} sub={fmtFull(totalGMV)} color="#ea580c" loading={loading} active={selectedMetric==='gmv'} onClick={()=>setSelectedMetric('gmv')} compare={getPrevBounds ? { curr: totalGMV, prev: prevGMV } : null} />
        <StatCard icon="📦" label="Tổng đơn hàng" value={totalOrders.toLocaleString('vi-VN')} sub="đơn" color="#f59e0b" loading={loading} active={selectedMetric==='orders'} onClick={()=>setSelectedMetric('orders')} compare={getPrevBounds ? { curr: totalOrders, prev: prevOrders } : null} />
        <StatCard icon="🛒" label="Tổng sản phẩm bán" value={totalQty.toLocaleString('vi-VN')} sub="sản phẩm" color="#10b981" loading={loading} active={selectedMetric==='qty'} onClick={()=>setSelectedMetric('qty')} compare={getPrevBounds ? { curr: totalQty, prev: prevQty } : null} />
        <StatCard icon="📢" label="Chi phí Ads" value={fmt(totalAdsCost)} sub={fmtFull(totalAdsCost)} color="#3b82f6" loading={loading} active={selectedMetric==='adsCost'} onClick={()=>setSelectedMetric('adsCost')} compare={getPrevBounds ? { curr: totalAdsCost, prev: prevAdsCost } : null} />
        <StatCard icon="💰" label="Doanh thu Ads" value={fmt(totalAdsRevenue)} sub={fmtFull(totalAdsRevenue)} color="#10b981" loading={loading} active={selectedMetric==='adsRevenue'} onClick={()=>setSelectedMetric('adsRevenue')} compare={getPrevBounds ? { curr: totalAdsRevenue, prev: prevAdsRevenue } : null} />
        <StatCard icon="🎯" label="Đơn từ Ads" value={totalAdsOrd.toLocaleString('vi-VN')} sub="đơn" color="#8b5cf6" loading={loading} active={selectedMetric==='adsOrders'} onClick={()=>setSelectedMetric('adsOrders')} compare={getPrevBounds ? { curr: totalAdsOrd, prev: prevAdsOrd } : null} />
        <StatCard icon="💸" label="CPO" value={fmt(avgCPO)} sub="₫/đơn" color="#ec4899" loading={loading} active={selectedMetric==='cpo'} onClick={()=>setSelectedMetric('cpo')} compare={getPrevBounds ? { curr: avgCPO, prev: prevAvgCPO } : null} />
        <StatCard icon="🚀" label="ROAS" value={roas > 0 ? roas.toFixed(2) + 'x' : '—'} sub="doanh thu / chi phí" color="#f59e0b" loading={loading} active={selectedMetric==='roas'} onClick={()=>setSelectedMetric('roas')} compare={getPrevBounds ? { curr: roas, prev: prevRoas } : null} />
      </div>

      {/* ── TREND CHART ── */}
      {!loading && trendData.length > 0 && (() => {
        const cfg = METRIC_CONFIGS[selectedMetric];
        return (
          <div style={{ background: '#fff', borderRadius: 16, padding: '20px 24px', marginTop: 16, marginBottom: 8, boxShadow: '0 1px 6px rgba(0,0,0,0.06)', border: '1px solid #f3f4f6' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <div style={{ width: 8, height: 8, borderRadius: 99, background: cfg.color }} />
              <span style={{ fontWeight: 800, fontSize: '0.95rem', color: '#111' }}>Xu hướng: {cfg.label}</span>
              <span style={{ fontSize: '0.78rem', color: '#9ca3af' }}>({trendData.length} ngày)</span>
            </div>
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={trendData} margin={{ top: 24, right: 60, left: 0, bottom: 4 }}>
                <defs>
                  <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={cfg.color} stopOpacity={0.2} />
                    <stop offset="95%" stopColor={cfg.color} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#9ca3af' }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} tickLine={false} axisLine={false} tickFormatter={fmt} width={60} />
                <Tooltip
                  contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 16px rgba(0,0,0,0.12)', fontFamily: "'Outfit', sans-serif" }}
                  labelFormatter={(l, payload) => payload?.[0]?.payload?.fullDate || l}
                  formatter={(v) => [cfg.format(v), cfg.label]}
                />
                <Area type="monotone" dataKey="value" stroke={cfg.color} strokeWidth={2.5} fill="url(#trendGrad)"
                  dot={trendData.length <= 31 ? { r: 3, fill: cfg.color } : false}
                  activeDot={{ r: 5, fill: cfg.color }}
                  label={trendData.length <= 31 ? ({ x, y, value }) => (
                    <text x={x} y={y - 12} textAnchor="middle" fontSize={11} fontWeight={700} fill={cfg.color}>{fmt(value)}</text>
                  ) : false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        );
      })()}

      {/* ── CHARTS ROW ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 24 }}>
        {/* Pie: GMV by Brand */}
        <div style={{ background: '#fff', borderRadius: 16, padding: '20px 24px', boxShadow: '0 1px 6px rgba(0,0,0,0.06)', border: '1px solid #f3f4f6' }}>
          <div style={{ fontWeight: 800, fontSize: '0.9rem', marginBottom: 16, color: '#111' }}>🥧 Tỷ trọng GMV theo brand</div>
          {loading ? <div style={{ height: 220, background: '#f9fafb', borderRadius: 12 }} /> : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={byBrand} dataKey="GMV" nameKey="name" cx="50%" cy="50%" outerRadius={90}
                  labelLine={false}
                  label={({ cx, cy, midAngle, innerRadius, outerRadius, percent }) => {
                    if (percent < 0.05) return null;
                    const R = Math.PI / 180;
                    const r = innerRadius + (outerRadius - innerRadius) * 0.55;
                    const x = cx + r * Math.cos(-midAngle * R);
                    const y = cy + r * Math.sin(-midAngle * R);
                    return (
                      <text x={x} y={y} fill="#fff" textAnchor="middle" dominantBaseline="central" fontSize={12} fontWeight={800}>
                        {(percent * 100).toFixed(0)}%
                      </text>
                    );
                  }}>
                  {byBrand.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v, name) => [fmt(v), name]} />
                <Legend formatter={(name) => <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#374151' }}>{name}</span>} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Bar: GMV by Brand */}
        <div style={{ background: '#fff', borderRadius: 16, padding: '20px 24px', boxShadow: '0 1px 6px rgba(0,0,0,0.06)', border: '1px solid #f3f4f6' }}>
          <div style={{ fontWeight: 800, fontSize: '0.9rem', marginBottom: 16, color: '#111' }}>📊 GMV theo nhãn hàng</div>
          {loading ? <div style={{ height: 220, background: '#f9fafb', borderRadius: 12 }} /> : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={byBrand} margin={{ top: 4, right: 8, left: 0, bottom: 40 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#6b7280' }} angle={-30} textAnchor="end" interval={0} />
                <YAxis tick={{ fontSize: 10, fill: '#6b7280' }} tickFormatter={fmt} />
                <Tooltip formatter={(v) => [fmt(v), 'GMV']} />
                <Bar dataKey="GMV" radius={[6, 6, 0, 0]}>
                  {byBrand.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* ── TOP PRODUCTS TABLE ── */}
      <SectionHeader title="Top Sản Phẩm" icon="🏆" />
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        {[['gmv', '💰 Theo GMV'], ['orders', '📦 Theo đơn'], ['qty', '🛒 Theo số lượng']].map(([k, l]) => (
          <button key={k} style={tabStyle(activeProductTab === k)} onClick={() => setActiveProductTab(k)}>{l}</button>
        ))}
      </div>
      <div style={{ background: '#fff', borderRadius: 16, overflow: 'hidden', boxShadow: '0 1px 6px rgba(0,0,0,0.06)', border: '1px solid #f3f4f6' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.83rem' }}>
          <thead>
            <tr style={{ background: '#f9fafb', borderBottom: '2px solid #f3f4f6' }}>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 800, color: '#374151', width: 36 }}>#</th>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 800, color: '#374151' }}>Sản phẩm</th>
              <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 800, color: '#374151' }}>GMV</th>
              <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 800, color: '#374151' }}>Đơn</th>
              <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 800, color: '#374151' }}>SL bán</th>
              <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 800, color: '#374151' }}>Sàn</th>
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
      <SectionHeader title="Chi Tiết Ads theo Nhãn Hàng" icon="📢" />
      <div style={{ background: '#fff', borderRadius: 16, overflow: 'hidden', boxShadow: '0 1px 6px rgba(0,0,0,0.06)', border: '1px solid #f3f4f6', marginBottom: 32 }}>
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
                    <td style={{ padding: '12px 16px', fontWeight: 700, color: '#111' }}>{item.col_9TP6E83EC5MMA || item.org_name || '—'}</td>
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

      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: .5; } }
      `}</style>
    </div>
  );
};

export default StellaDashboardTab;
