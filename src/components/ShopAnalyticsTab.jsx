// src/components/ShopAnalyticsTab.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';

// ── Constants ─────────────────────────────────────────────────────────────────
const ANALYTICS_API = '/api/tiktok-shop/analytics';
const SHOP_COLORS = ['#ea580c','#3b82f6','#16a34a','#8b5cf6','#ec4899','#0891b2','#d97706','#dc2626','#059669','#7c3aed'];

// TikTok Analytics App auth link (beta mode)
const ANALYTICS_APP_KEY = '6k2of554me0j9';
const AUTH_URL = `https://services.tiktokshop.com/open/authorize?service_id=${ANALYTICS_APP_KEY}`;

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmtVnd = (v) => {
  if (!v && v !== 0) return '0';
  const n = Number(v);
  if (!Number.isFinite(n)) return '0';
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000)     return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)         return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString('vi-VN');
};

const fmtPercent = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return '0%';
  return `${n.toFixed(2)}%`;
};

const fmtNumber = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return '0';
  return n.toLocaleString('vi-VN');
};

const toYmd = (d) => {
  const dt = d instanceof Date ? d : new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
};

const shortDate = (ymd) => {
  if (!ymd) return '';
  const parts = ymd.split('-');
  return `${parts[2]}/${parts[1]}`;
};

// Extract metric value — handles both direct values and nested { value, currency } objects
const metricVal = (obj, key) => {
  if (!obj) return 0;
  const v = obj[key];
  if (v === null || v === undefined) return 0;
  if (typeof v === 'object' && v.value !== undefined) return Number(v.value) || 0;
  return Number(v) || 0;
};

// ── Custom Tooltip ────────────────────────────────────────────────────────────
const ChartTooltip = ({ active, payload, label, valueFormatter = fmtVnd, suffix = '' }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background:'#fff', border:'1px solid #e5e7eb', borderRadius:10, padding:'10px 14px', fontSize:'0.8rem', boxShadow:'0 4px 16px rgba(15,23,42,0.1)' }}>
      <div style={{ fontWeight:700, color:'#0f172a', marginBottom:4 }}>{label}</div>
      {payload.map((p,i) => (
        <div key={i} style={{ color: p.color || '#ea580c', display:'flex', gap:6, alignItems:'center' }}>
          <span style={{ width:8, height:8, borderRadius:'50%', background: p.color || '#ea580c', display:'inline-block' }} />
          {p.name}: <strong>{valueFormatter(p.value)}{suffix}</strong>
        </div>
      ))}
    </div>
  );
};

// ── Stat Card ─────────────────────────────────────────────────────────────────
const StatCard = ({ icon, label, value, sub, color = '#ea580c', bgColor = '#fff7ed', borderColor = '#fed7aa' }) => (
  <div style={{
    background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: '18px 20px',
    display: 'flex', alignItems: 'flex-start', gap: 14, flex: '1 1 220px', minWidth: 200,
    boxShadow: '0 1px 3px rgba(15,23,42,0.04)',
  }}>
    <div style={{
      width: 42, height: 42, borderRadius: 10, background: bgColor, border: `1px solid ${borderColor}`,
      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', flexShrink: 0,
    }}>{icon}</div>
    <div>
      <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#0f172a', lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: 3 }}>{sub}</div>}
    </div>
  </div>
);

// ── Main Component ────────────────────────────────────────────────────────────
const ShopAnalyticsTab = () => {
  const [connections, setConnections] = useState([]);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState(null);
  const [shopFilter, setShopFilter] = useState('');
  const [granularity, setGranularity] = useState('1D');
  const [analyticsData, setAnalyticsData] = useState(null);

  // Date range — default last 30 days
  const [dateRange, setDateRange] = useState(() => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 30);
    return { start: toYmd(start), end: toYmd(end) };
  });

  // Quick range buttons
  const setQuickRange = (days) => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - days);
    setDateRange({ start: toYmd(start), end: toYmd(end) });
  };

  // ── Fetch connections ─────────────────────────────────────────────────────
  const fetchConnections = useCallback(async () => {
    // Try analytics connections first
    const { data: analytics } = await supabase
      .from('tiktok_analytics_connections')
      .select('shop_id, seller_name, access_token_expires_at, shop_cipher')
      .not('access_token', 'is', null);

    if (analytics && analytics.length > 0) {
      setConnections(analytics);
      return;
    }

    // Fallback to orders connections
    const { data: orders } = await supabase
      .from('tiktok_shop_connections')
      .select('shop_id, seller_name, access_token_expires_at, shop_cipher')
      .not('access_token', 'is', null)
      .not('shop_cipher', 'is', null);

    setConnections(orders || []);
  }, []);

  // ── Fetch analytics ───────────────────────────────────────────────────────
  const fetchAnalytics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        start_date: dateRange.start,
        end_date:   dateRange.end,
        granularity,
      });
      if (shopFilter) params.set('shop_id', shopFilter);

      const res = await fetch(`${ANALYTICS_API}?${params}`);
      const json = await res.json();

      if (!res.ok) {
        setError(json.error || `HTTP ${res.status}`);
        setAnalyticsData(null);
      } else if (json.success) {
        setAnalyticsData(json);
      } else {
        setError(json.error || 'Unknown error');
        setAnalyticsData(null);
      }
    } catch (err) {
      setError(err.message);
      setAnalyticsData(null);
    }
    setLoading(false);
  }, [dateRange, granularity, shopFilter]);

  // ── Effects ───────────────────────────────────────────────────────────────
  useEffect(() => { fetchConnections(); }, [fetchConnections]);
  useEffect(() => { fetchAnalytics(); }, [fetchAnalytics]);

  // ── Parse analytics response into displayable metrics ─────────────────────
  const parsed = React.useMemo(() => {
    if (!analyticsData?.shops?.length) return null;

    const allShops = analyticsData.shops;
    const successShops = allShops.filter(s => s.data && !s.error);
    const errorShops   = allShops.filter(s => s.error);

    if (!successShops.length) return { successShops: [], errorShops, summary: null, dailyData: [], shopSummaries: [] };

    // Aggregate metrics across shops
    let totalGmv = 0, totalOrders = 0, totalBuyers = 0, totalPageViews = 0;
    const dailyMap = {};
    const shopSummaries = [];

    successShops.forEach((shop, idx) => {
      const d = shop.data;

      // Try to extract summary metrics from various possible response structures
      // Structure A: { metrics: { payment_amount, order_count, ... } }
      // Structure B: { daily_data: [...] }
      // Structure C: { performance: { ... } }
      // We handle all variants

      let shopGmv = 0, shopOrders = 0, shopBuyers = 0, shopPv = 0;

      // Check if data has a performance/metrics summary
      const perf = d.performance || d.metrics || d.summary || d;

      // Try known metric keys
      shopGmv     = metricVal(perf, 'payment_amount') || metricVal(perf, 'gmv') || metricVal(perf, 'total_payment_amount') || metricVal(perf, 'settled_amount') || 0;
      shopOrders  = metricVal(perf, 'order_count') || metricVal(perf, 'total_orders') || metricVal(perf, 'orders') || 0;
      shopBuyers  = metricVal(perf, 'buyer_count') || metricVal(perf, 'buyers') || metricVal(perf, 'unique_buyers') || 0;
      shopPv      = metricVal(perf, 'page_views') || metricVal(perf, 'product_views') || metricVal(perf, 'shop_page_views') || 0;

      // Check for daily/time-series data
      const timeSeries = d.daily_data || d.time_series || d.data_list || d.daily || [];

      if (Array.isArray(timeSeries) && timeSeries.length > 0) {
        timeSeries.forEach(entry => {
          const date = entry.date || entry.dimensions?.date || entry.day || '';
          if (!date) return;
          if (!dailyMap[date]) dailyMap[date] = { date, gmv: 0, orders: 0, buyers: 0, page_views: 0 };

          const m = entry.metrics || entry;
          const dayGmv = metricVal(m, 'payment_amount') || metricVal(m, 'gmv') || 0;
          const dayOrd = metricVal(m, 'order_count') || metricVal(m, 'orders') || 0;
          const dayBuy = metricVal(m, 'buyer_count') || metricVal(m, 'buyers') || 0;
          const dayPv  = metricVal(m, 'page_views') || metricVal(m, 'product_views') || 0;

          dailyMap[date].gmv        += dayGmv;
          dailyMap[date].orders     += dayOrd;
          dailyMap[date].buyers     += dayBuy;
          dailyMap[date].page_views += dayPv;

          // Also accumulate for shop totals if not in summary
          if (!shopGmv) shopGmv += dayGmv;
        });
      }

      totalGmv    += shopGmv;
      totalOrders += shopOrders;
      totalBuyers += shopBuyers;
      totalPageViews += shopPv;

      shopSummaries.push({
        shop_id: shop.shop_id,
        seller_name: shop.seller_name || shop.shop_id || 'Shop',
        gmv: shopGmv,
        orders: shopOrders,
        buyers: shopBuyers,
        page_views: shopPv,
        conversion: shopBuyers > 0 ? (shopOrders / shopBuyers * 100) : 0,
        aov: shopOrders > 0 ? (shopGmv / shopOrders) : 0,
        color: SHOP_COLORS[idx % SHOP_COLORS.length],
        rawData: d,
      });
    });

    const dailyData = Object.entries(dailyMap)
      .sort(([a],[b]) => a.localeCompare(b))
      .map(([date, vals]) => ({
        date: shortDate(date),
        fullDate: date,
        GMV: vals.gmv,
        'Don hang': vals.orders,
        'Nguoi mua': vals.buyers,
        'Luot xem': vals.page_views,
      }));

    const conversionRate = totalBuyers > 0 ? (totalOrders / totalBuyers * 100) : 0;
    const aov = totalOrders > 0 ? (totalGmv / totalOrders) : 0;

    return {
      successShops,
      errorShops,
      summary: {
        totalGmv,
        totalOrders,
        totalBuyers,
        totalPageViews,
        conversionRate,
        aov,
      },
      dailyData,
      shopSummaries,
    };
  }, [analyticsData]);

  // ── No connections state ──────────────────────────────────────────────────
  const hasNoConnections = connections.length === 0;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: "'Outfit', sans-serif", color: '#0f172a' }}>
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 38, height: 38, background: '#ea580c', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '1.1rem', boxShadow: '0 4px 12px rgba(234,88,12,0.2)' }}>
              📈
            </span>
            TikTok Shop Analytics
          </h2>
          <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: '0.82rem' }}>
            GMV, don hang, traffic & chuyen doi tu TikTok Analytics API
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <a href={AUTH_URL} target="_blank" rel="noopener noreferrer"
            style={{
              padding: '9px 16px', borderRadius: 8, background: '#0f172a', color: '#fff',
              fontSize: '0.8rem', fontWeight: 700, textDecoration: 'none',
              display: 'flex', alignItems: 'center', gap: 6,
              boxShadow: '0 4px 12px rgba(15,23,42,0.18)',
            }}>
            ♪ Ket noi Shop (Analytics)
          </a>
          <button onClick={fetchAnalytics} disabled={loading}
            style={{
              padding: '9px 16px', borderRadius: 8, border: '1.5px solid #ea580c',
              background: '#fff', color: '#ea580c', fontWeight: 700, fontSize: '0.8rem',
              cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1,
            }}>
            {loading ? '...' : '🔄 Tai lai'}
          </button>
        </div>
      </div>

      {/* ── Connections status ───────────────────────────────────────────────── */}
      {connections.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          {connections.map((c, i) => {
            const expired = c.access_token_expires_at && new Date(c.access_token_expires_at) < new Date();
            return (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '7px 14px',
                background: expired ? '#fef2f2' : '#f0fdf4', border: `1px solid ${expired ? '#fecaca' : '#bbf7d0'}`,
                borderRadius: 8, fontSize: '0.76rem', fontWeight: 600,
              }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: expired ? '#ef4444' : '#22c55e' }} />
                <span style={{ color: '#374151' }}>{c.seller_name || c.shop_id}</span>
                {expired && <span style={{ color: '#dc2626', fontSize: '0.68rem' }}>(het han)</span>}
              </div>
            );
          })}
        </div>
      )}

      {/* ── No connections banner ────────────────────────────────────────────── */}
      {hasNoConnections && !loading && (
        <div style={{
          background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 14, padding: '24px 28px',
          marginBottom: 20, textAlign: 'center',
        }}>
          <div style={{ fontSize: '2rem', marginBottom: 8 }}>🔗</div>
          <h3 style={{ margin: '0 0 8px', fontSize: '1rem', fontWeight: 800, color: '#9a3412' }}>
            Chua ket noi shop nao voi Analytics App
          </h3>
          <p style={{ color: '#c2410c', fontSize: '0.84rem', margin: '0 0 16px' }}>
            Click nut ben duoi de uy quyen shop TikTok Shop voi Analytics App. Sau khi uy quyen, du lieu phan tich se tu dong hien thi.
          </p>
          <a href={AUTH_URL} target="_blank" rel="noopener noreferrer"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8, padding: '11px 24px',
              background: '#ea580c', color: '#fff', borderRadius: 10, fontWeight: 700,
              textDecoration: 'none', fontSize: '0.88rem',
              boxShadow: '0 6px 16px rgba(234,88,12,0.25)',
            }}>
            ♪ Ket noi TikTok Shop (Analytics)
          </a>
        </div>
      )}

      {/* ── Filters ──────────────────────────────────────────────────────────── */}
      <div style={{
        background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: '16px 20px',
        marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
      }}>
        {/* Quick range */}
        <div style={{ display: 'flex', gap: 4 }}>
          {[
            { label: '7 ngay', days: 7 },
            { label: '30 ngay', days: 30 },
            { label: '90 ngay', days: 90 },
          ].map(r => {
            const end = new Date();
            const start = new Date(); start.setDate(start.getDate() - r.days);
            const isActive = dateRange.start === toYmd(start) && dateRange.end === toYmd(end);
            return (
              <button key={r.days} onClick={() => setQuickRange(r.days)}
                style={{
                  padding: '6px 14px', borderRadius: 7, fontSize: '0.78rem', fontWeight: 600,
                  border: isActive ? '1.5px solid #ea580c' : '1.5px solid #e5e7eb',
                  background: isActive ? '#fff7ed' : '#fff',
                  color: isActive ? '#ea580c' : '#64748b',
                  cursor: 'pointer',
                }}>
                {r.label}
              </button>
            );
          })}
        </div>

        {/* Date inputs */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="date" value={dateRange.start}
            onChange={e => setDateRange(prev => ({ ...prev, start: e.target.value }))}
            style={{ padding: '6px 10px', borderRadius: 7, border: '1.5px solid #e5e7eb', fontSize: '0.8rem', fontFamily: 'inherit' }} />
          <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>→</span>
          <input type="date" value={dateRange.end}
            onChange={e => setDateRange(prev => ({ ...prev, end: e.target.value }))}
            style={{ padding: '6px 10px', borderRadius: 7, border: '1.5px solid #e5e7eb', fontSize: '0.8rem', fontFamily: 'inherit' }} />
        </div>

        {/* Granularity */}
        <select value={granularity} onChange={e => setGranularity(e.target.value)}
          style={{ padding: '6px 12px', borderRadius: 7, border: '1.5px solid #e5e7eb', fontSize: '0.8rem', fontFamily: 'inherit', color: '#374151', background: '#fff' }}>
          <option value="1D">Theo ngay</option>
          <option value="ALL">Tong hop</option>
        </select>

        {/* Shop filter */}
        {connections.length > 1 && (
          <select value={shopFilter} onChange={e => setShopFilter(e.target.value)}
            style={{ padding: '6px 12px', borderRadius: 7, border: '1.5px solid #e5e7eb', fontSize: '0.8rem', fontFamily: 'inherit', color: '#374151', background: '#fff' }}>
            <option value="">Tat ca shop</option>
            {connections.map(c => (
              <option key={c.shop_id} value={c.shop_id}>{c.seller_name || c.shop_id}</option>
            ))}
          </select>
        )}
      </div>

      {/* ── Loading ──────────────────────────────────────────────────────────── */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '48px 20px', color: '#64748b' }}>
          <div style={{ fontSize: '2rem', marginBottom: 8, animation: 'spin 1s linear infinite' }}>⏳</div>
          <p style={{ fontSize: '0.88rem', fontWeight: 600 }}>Dang tai du lieu analytics...</p>
          <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {/* ── Error ────────────────────────────────────────────────────────────── */}
      {error && !loading && (
        <div style={{
          background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 14, padding: '16px 20px',
          marginBottom: 20, color: '#dc2626', fontSize: '0.84rem', fontWeight: 600,
        }}>
          ⚠️ {error}
        </div>
      )}

      {/* ── Analytics Data ───────────────────────────────────────────────────── */}
      {!loading && parsed && (
        <>
          {/* ── Error shops ──────────────────────────────────────────────────── */}
          {parsed.errorShops.length > 0 && (
            <div style={{
              background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 14, padding: '12px 16px',
              marginBottom: 16, fontSize: '0.8rem',
            }}>
              <strong style={{ color: '#92400e' }}>⚠️ Loi tu mot so shop:</strong>
              {parsed.errorShops.map((s, i) => (
                <div key={i} style={{ color: '#78350f', marginTop: 4 }}>
                  • {s.seller_name || s.shop_id}: {s.error} {s.code ? `(code: ${s.code})` : ''}
                </div>
              ))}
            </div>
          )}

          {/* ── Summary Cards ────────────────────────────────────────────────── */}
          {parsed.summary && (
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 24 }}>
              <StatCard icon="💰" label="GMV" value={`${fmtVnd(parsed.summary.totalGmv)} VND`}
                sub={`AOV: ${fmtVnd(parsed.summary.aov)} VND`}
                bgColor="#fff7ed" borderColor="#fed7aa" />
              <StatCard icon="🛒" label="Don hang" value={fmtNumber(parsed.summary.totalOrders)}
                sub={`${dateRange.start} → ${dateRange.end}`}
                color="#3b82f6" bgColor="#eff6ff" borderColor="#bfdbfe" />
              <StatCard icon="👥" label="Nguoi mua" value={fmtNumber(parsed.summary.totalBuyers)}
                sub={parsed.summary.totalPageViews > 0 ? `${fmtNumber(parsed.summary.totalPageViews)} luot xem` : null}
                color="#16a34a" bgColor="#f0fdf4" borderColor="#bbf7d0" />
              <StatCard icon="📊" label="Ty le chuyen doi" value={fmtPercent(parsed.summary.conversionRate)}
                sub="Nguoi mua / Luot xem"
                color="#8b5cf6" bgColor="#f5f3ff" borderColor="#ddd6fe" />
            </div>
          )}

          {/* ── Daily Charts ─────────────────────────────────────────────────── */}
          {parsed.dailyData.length > 0 && (
            <div style={{ display: 'grid', gap: 20, gridTemplateColumns: 'repeat(auto-fit, minmax(480px, 1fr))', marginBottom: 24 }}>
              {/* GMV Chart */}
              <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: '18px 20px' }}>
                <h3 style={{ margin: '0 0 14px', fontSize: '0.88rem', fontWeight: 800, color: '#0f172a' }}>
                  📈 GMV theo ngay
                </h3>
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={parsed.dailyData}>
                    <defs>
                      <linearGradient id="gmvGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#ea580c" stopOpacity={0.15} />
                        <stop offset="95%" stopColor="#ea580c" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#64748b' }} />
                    <YAxis tickFormatter={fmtVnd} tick={{ fontSize: 11, fill: '#64748b' }} width={70} />
                    <Tooltip content={<ChartTooltip valueFormatter={fmtVnd} suffix=" VND" />} />
                    <Area type="monotone" dataKey="GMV" stroke="#ea580c" strokeWidth={2.5} fill="url(#gmvGrad)" dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* Orders Chart */}
              <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: '18px 20px' }}>
                <h3 style={{ margin: '0 0 14px', fontSize: '0.88rem', fontWeight: 800, color: '#0f172a' }}>
                  🛒 Don hang theo ngay
                </h3>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={parsed.dailyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#64748b' }} />
                    <YAxis tick={{ fontSize: 11, fill: '#64748b' }} width={50} />
                    <Tooltip content={<ChartTooltip valueFormatter={fmtNumber} />} />
                    <Bar dataKey="Don hang" fill="#3b82f6" radius={[4,4,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Buyers / Page Views Chart */}
              {(parsed.dailyData.some(d => d['Nguoi mua'] > 0) || parsed.dailyData.some(d => d['Luot xem'] > 0)) && (
                <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: '18px 20px', gridColumn: 'span 2' }}>
                  <h3 style={{ margin: '0 0 14px', fontSize: '0.88rem', fontWeight: 800, color: '#0f172a' }}>
                    👥 Traffic theo ngay
                  </h3>
                  <ResponsiveContainer width="100%" height={280}>
                    <LineChart data={parsed.dailyData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#64748b' }} />
                      <YAxis tick={{ fontSize: 11, fill: '#64748b' }} width={60} />
                      <Tooltip content={<ChartTooltip valueFormatter={fmtNumber} />} />
                      <Legend />
                      {parsed.dailyData.some(d => d['Nguoi mua'] > 0) && (
                        <Line type="monotone" dataKey="Nguoi mua" stroke="#16a34a" strokeWidth={2} dot={false} />
                      )}
                      {parsed.dailyData.some(d => d['Luot xem'] > 0) && (
                        <Line type="monotone" dataKey="Luot xem" stroke="#8b5cf6" strokeWidth={2} dot={false} />
                      )}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          )}

          {/* ── Shop Breakdown Table ─────────────────────────────────────────── */}
          {parsed.shopSummaries.length > 0 && (
            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, overflow: 'hidden', marginBottom: 24 }}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid #e5e7eb' }}>
                <h3 style={{ margin: 0, fontSize: '0.88rem', fontWeight: 800, color: '#0f172a' }}>
                  🏪 Hieu suat theo Shop
                </h3>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc' }}>
                      {['Shop', 'GMV', 'Don hang', 'Nguoi mua', 'Luot xem', 'Chuyen doi', 'AOV'].map(h => (
                        <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 700, color: '#475569', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.4px', borderBottom: '2px solid #e5e7eb' }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.shopSummaries.map((s, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}
                        onMouseEnter={e => e.currentTarget.style.background = '#fafafa'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                        <td style={{ padding: '12px 16px', fontWeight: 700, color: '#0f172a' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
                            {s.seller_name}
                          </div>
                        </td>
                        <td style={{ padding: '12px 16px', fontWeight: 700, color: '#ea580c' }}>{fmtVnd(s.gmv)} VND</td>
                        <td style={{ padding: '12px 16px' }}>{fmtNumber(s.orders)}</td>
                        <td style={{ padding: '12px 16px' }}>{fmtNumber(s.buyers)}</td>
                        <td style={{ padding: '12px 16px' }}>{fmtNumber(s.page_views)}</td>
                        <td style={{ padding: '12px 16px' }}>
                          <span style={{
                            background: s.conversion > 3 ? '#dcfce7' : s.conversion > 1 ? '#fff7ed' : '#fef2f2',
                            color: s.conversion > 3 ? '#15803d' : s.conversion > 1 ? '#c2410c' : '#dc2626',
                            padding: '3px 8px', borderRadius: 6, fontWeight: 700, fontSize: '0.78rem',
                          }}>
                            {fmtPercent(s.conversion)}
                          </span>
                        </td>
                        <td style={{ padding: '12px 16px', color: '#475569' }}>{fmtVnd(s.aov)} VND</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Shop GMV Bar Chart ───────────────────────────────────────────── */}
          {parsed.shopSummaries.length > 1 && (
            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: '18px 20px', marginBottom: 24 }}>
              <h3 style={{ margin: '0 0 14px', fontSize: '0.88rem', fontWeight: 800, color: '#0f172a' }}>
                🏆 GMV theo Shop
              </h3>
              <ResponsiveContainer width="100%" height={Math.max(200, parsed.shopSummaries.length * 50)}>
                <BarChart data={parsed.shopSummaries} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis type="number" tickFormatter={fmtVnd} tick={{ fontSize: 11, fill: '#64748b' }} />
                  <YAxis type="category" dataKey="seller_name" width={150} tick={{ fontSize: 11, fill: '#374151' }} />
                  <Tooltip content={<ChartTooltip valueFormatter={fmtVnd} suffix=" VND" />} />
                  <Bar dataKey="gmv" name="GMV" radius={[0,6,6,0]}>
                    {parsed.shopSummaries.map((s, i) => (
                      <rect key={i} fill={s.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* ── Raw data debug (collapsed) ───────────────────────────────────── */}
          {parsed.successShops.length > 0 && (
            <details style={{ background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: 14, padding: '12px 16px', marginBottom: 20 }}>
              <summary style={{ cursor: 'pointer', fontSize: '0.78rem', fontWeight: 700, color: '#64748b' }}>
                🔍 Raw API Response (debug)
              </summary>
              <pre style={{ fontSize: '0.72rem', color: '#475569', overflow: 'auto', maxHeight: 400, marginTop: 10, background: '#fff', padding: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}>
                {JSON.stringify(analyticsData, null, 2)}
              </pre>
            </details>
          )}
        </>
      )}

      {/* ── Empty state (no data returned) ───────────────────────────────────── */}
      {!loading && !error && analyticsData && (!parsed || !parsed.summary) && (
        <div style={{
          background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: 14, padding: '48px 20px',
          textAlign: 'center', marginBottom: 20,
        }}>
          <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>📭</div>
          <h3 style={{ margin: '0 0 8px', fontWeight: 800, color: '#374151' }}>Chua co du lieu analytics</h3>
          <p style={{ color: '#64748b', fontSize: '0.84rem', margin: 0 }}>
            {analyticsData?.shops?.length === 0
              ? 'Chua co shop nao duoc ket noi. Hay uy quyen shop voi Analytics App.'
              : 'API chua tra ve du lieu cho khoang thoi gian nay. Thu chon khoang thoi gian khac.'}
          </p>
          {analyticsData?.shops && (
            <details style={{ marginTop: 16, textAlign: 'left' }}>
              <summary style={{ cursor: 'pointer', fontSize: '0.78rem', fontWeight: 700, color: '#64748b' }}>Xem response</summary>
              <pre style={{ fontSize: '0.72rem', color: '#475569', overflow: 'auto', maxHeight: 300, marginTop: 8, background: '#fff', padding: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}>
                {JSON.stringify(analyticsData, null, 2)}
              </pre>
            </details>
          )}
        </div>
      )}
    </div>
  );
};

export default ShopAnalyticsTab;
