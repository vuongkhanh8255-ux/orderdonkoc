// src/components/ShopAnalyticsTab.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, LabelList,
} from 'recharts';

// ── Constants ─────────────────────────────────────────────────────────────────
const SYNC_API = '/api/tiktok-shop/sync-analytics';
const SHOP_COLORS = ['#ea580c','#3b82f6','#16a34a','#8b5cf6','#ec4899','#0891b2','#d97706','#dc2626','#059669','#7c3aed'];
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
const fmtPercent = (v) => { const n = Number(v); return Number.isFinite(n) ? `${n.toFixed(2)}%` : '0%'; };
const fmtNumber = (v) => { const n = Number(v); return Number.isFinite(n) ? n.toLocaleString('vi-VN') : '0'; };
const fmtShort = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n === 0) return '';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
};
const toYmd = (d) => {
  const dt = d instanceof Date ? d : new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
};
const shortDate = (ymd) => { if (!ymd) return ''; const p = ymd.split('-'); return `${p[2]}/${p[1]}`; };

// ── Custom data label for charts ─────────────────────────────────────────────
const SmallLabel = ({ x, y, value, formatter = fmtShort, color = '#64748b' }) => {
  const label = formatter(value);
  if (!label) return null;
  return (
    <text x={x} y={y - 8} textAnchor="middle" fill={color} fontSize={10} fontWeight={600}>
      {label}
    </text>
  );
};

// ── Tooltip ───────────────────────────────────────────────────────────────────
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
const StatCard = ({ icon, label, value, sub, bgColor = '#fff7ed', borderColor = '#fed7aa' }) => (
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
  const [loading, setLoading]       = useState(false);
  const [syncing, setSyncing]       = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const [shopFilter, setShopFilter] = useState('');
  const [dailyData, setDailyData]   = useState([]);
  const [lastSync, setLastSync]     = useState(null);

  // Date range — default last 30 days
  const [dateRange, setDateRange] = useState(() => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 30);
    return { start: toYmd(start), end: toYmd(end) };
  });

  const setQuickRange = (days) => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - days);
    setDateRange({ start: toYmd(start), end: toYmd(end) });
  };

  // ── Fetch connections ─────────────────────────────────────────────────────
  const fetchConnections = useCallback(async () => {
    const { data: analytics } = await supabase
      .from('tiktok_analytics_connections')
      .select('shop_id, seller_name, access_token_expires_at, shop_cipher')
      .not('access_token', 'is', null);
    if (analytics?.length > 0) { setConnections(analytics); return; }

    const { data: orders } = await supabase
      .from('tiktok_shop_connections')
      .select('shop_id, seller_name, access_token_expires_at, shop_cipher')
      .not('access_token', 'is', null).not('shop_cipher', 'is', null);
    setConnections(orders || []);
  }, []);

  // ── Fetch analytics from Supabase ─────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      let q = supabase
        .from('tiktok_shop_analytics_daily')
        .select('*')
        .gte('date', dateRange.start)
        .lte('date', dateRange.end)
        .order('date', { ascending: true });
      if (shopFilter) q = q.eq('shop_id', shopFilter);

      const { data, error } = await q;
      if (error) { console.error('Fetch error:', error); setDailyData([]); }
      else { setDailyData(data || []); }

      // Get last sync time
      const { data: latest } = await supabase
        .from('tiktok_shop_analytics_daily')
        .select('synced_at')
        .order('synced_at', { ascending: false })
        .limit(1);
      if (latest?.[0]) setLastSync(latest[0].synced_at);
    } catch (err) {
      console.error(err);
      setDailyData([]);
    }
    setLoading(false);
  }, [dateRange, shopFilter]);

  // ── Sync analytics (call backend) ─────────────────────────────────────────
  const doSync = async (fullSync = false) => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const params = new URLSearchParams();
      if (fullSync) {
        params.set('full_sync', '1');
      } else {
        params.set('start_date', dateRange.start);
        params.set('end_date', dateRange.end);
      }
      const res = await fetch(`${SYNC_API}?${params}`);
      const json = await res.json();
      setSyncResult(json);
      await fetchData();
    } catch (err) {
      setSyncResult({ error: err.message });
    }
    setSyncing(false);
  };

  // ── Effects ───────────────────────────────────────────────────────────────
  useEffect(() => { fetchConnections(); }, [fetchConnections]);
  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Compute aggregated metrics ────────────────────────────────────────────
  const computed = React.useMemo(() => {
    if (!dailyData.length) return null;

    const byDate = {};
    const byShop = {};

    dailyData.forEach(row => {
      const d = row.date;
      if (!byDate[d]) byDate[d] = { date: d, gmv: 0, orders: 0, buyers: 0, page_views: 0, visitors: 0, items_sold: 0, refund_amount: 0 };
      byDate[d].gmv           += Number(row.payment_amount) || 0;
      byDate[d].orders        += Number(row.order_count) || 0;
      byDate[d].buyers        += Number(row.buyer_count) || 0;
      byDate[d].page_views    += Number(row.page_views) || 0;
      byDate[d].visitors      += Number(row.visitors) || 0;
      byDate[d].items_sold    += Number(row.items_sold) || 0;
      byDate[d].refund_amount += Number(row.refund_amount) || 0;

      const sid = row.shop_id;
      if (!byShop[sid]) byShop[sid] = { shop_id: sid, seller_name: row.seller_name || sid, gmv: 0, orders: 0, buyers: 0, page_views: 0, visitors: 0, items_sold: 0, refund_amount: 0 };
      byShop[sid].gmv           += Number(row.payment_amount) || 0;
      byShop[sid].orders        += Number(row.order_count) || 0;
      byShop[sid].buyers        += Number(row.buyer_count) || 0;
      byShop[sid].page_views    += Number(row.page_views) || 0;
      byShop[sid].visitors      += Number(row.visitors) || 0;
      byShop[sid].items_sold    += Number(row.items_sold) || 0;
      byShop[sid].refund_amount += Number(row.refund_amount) || 0;
    });

    const chartData = Object.entries(byDate)
      .sort(([a],[b]) => a.localeCompare(b))
      .map(([date, v]) => ({
        date: shortDate(date),
        fullDate: date,
        GMV: v.gmv,
        'Đơn hàng': v.orders,
        'Người mua': v.buyers,
        'Lượt xem': v.page_views,
        'Khách truy cập': v.visitors,
        'SP bán ra': v.items_sold,
      }));

    // Daily detail table data
    const dailyTable = Object.entries(byDate)
      .sort(([a],[b]) => b.localeCompare(a)) // newest first
      .map(([date, v]) => ({
        date,
        dateShort: shortDate(date),
        gmv: v.gmv,
        orders: v.orders,
        buyers: v.buyers,
        visitors: v.visitors,
        page_views: v.page_views,
        items_sold: v.items_sold,
        refund_amount: v.refund_amount,
        conversion: v.visitors > 0 ? (v.buyers / v.visitors * 100) : 0,
        aov: v.orders > 0 ? (v.gmv / v.orders) : 0,
      }));

    const shopList = Object.values(byShop)
      .sort((a,b) => b.gmv - a.gmv)
      .map((s, i) => ({
        ...s,
        conversion: s.visitors > 0 ? (s.buyers / s.visitors * 100) : 0,
        aov: s.orders > 0 ? (s.gmv / s.orders) : 0,
        color: SHOP_COLORS[i % SHOP_COLORS.length],
      }));

    const totalGmv      = shopList.reduce((s,v) => s + v.gmv, 0);
    const totalOrders   = shopList.reduce((s,v) => s + v.orders, 0);
    const totalBuyers   = shopList.reduce((s,v) => s + v.buyers, 0);
    const totalPv       = shopList.reduce((s,v) => s + v.page_views, 0);
    const totalVisitors = shopList.reduce((s,v) => s + v.visitors, 0);
    const totalItems    = shopList.reduce((s,v) => s + v.items_sold, 0);
    const totalRefunds  = shopList.reduce((s,v) => s + v.refund_amount, 0);

    return {
      chartData,
      dailyTable,
      shopList,
      totalGmv,
      totalOrders,
      totalBuyers,
      totalPv,
      totalVisitors,
      totalItems,
      totalRefunds,
      conversionRate: totalVisitors > 0 ? (totalBuyers / totalVisitors * 100) : 0,
      aov: totalOrders > 0 ? (totalGmv / totalOrders) : 0,
    };
  }, [dailyData]);

  const hasNoConnections = connections.length === 0;

  // ── Table cell style ─────────────────────────────────────────────────────
  const thStyle = { padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: '#475569', fontSize: '0.73rem', textTransform: 'uppercase', letterSpacing: '0.3px', borderBottom: '2px solid #e5e7eb', whiteSpace: 'nowrap' };
  const tdStyle = { padding: '10px 14px', fontSize: '0.82rem', whiteSpace: 'nowrap' };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: "'Outfit', sans-serif", color: '#0f172a' }}>
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 38, height: 38, background: '#ea580c', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '1.1rem', boxShadow: '0 4px 12px rgba(234,88,12,0.2)' }}>📈</span>
            TikTok Shop Analytics
          </h2>
          <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: '0.82rem' }}>
            GMV, đơn hàng, traffic & chuyển đổi — dữ liệu từ Supabase
            {lastSync && <span style={{ marginLeft: 8, color: '#94a3b8' }}>| Sync gần nhất: {new Date(lastSync).toLocaleString('vi-VN')}</span>}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <a href={AUTH_URL} target="_blank" rel="noopener noreferrer"
            style={{ padding: '9px 16px', borderRadius: 8, background: '#0f172a', color: '#fff', fontSize: '0.8rem', fontWeight: 700, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6, boxShadow: '0 4px 12px rgba(15,23,42,0.18)' }}>
            ♪ Kết nối Shop
          </a>
          <button onClick={() => doSync(true)} disabled={syncing}
            style={{ padding: '9px 16px', borderRadius: 8, border: '1.5px solid #16a34a', background: '#f0fdf4', color: '#16a34a', fontWeight: 700, fontSize: '0.8rem', cursor: syncing ? 'not-allowed' : 'pointer', opacity: syncing ? 0.6 : 1 }}>
            {syncing ? '...' : '📥 Full Sync (01/04)'}
          </button>
          <button onClick={() => doSync(false)} disabled={syncing}
            style={{ padding: '9px 16px', borderRadius: 8, border: '1.5px solid #ea580c', background: '#fff', color: '#ea580c', fontWeight: 700, fontSize: '0.8rem', cursor: syncing ? 'not-allowed' : 'pointer', opacity: syncing ? 0.6 : 1 }}>
            {syncing ? '...' : '🔄 Sync'}
          </button>
        </div>
      </div>

      {/* ── Sync result ──────────────────────────────────────────────────────── */}
      {syncResult && (
        <div style={{
          background: syncResult.error ? '#fef2f2' : '#f0fdf4',
          border: `1px solid ${syncResult.error ? '#fecaca' : '#bbf7d0'}`,
          borderRadius: 14, padding: '12px 16px', marginBottom: 16, fontSize: '0.82rem',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span style={{ color: syncResult.error ? '#dc2626' : '#15803d', fontWeight: 700 }}>
            {syncResult.error
              ? `⚠️ Lỗi: ${syncResult.error}`
              : `✅ Sync thành công: ${syncResult.total_upserted || 0} bản ghi (${syncResult.elapsed_seconds || 0}s)`}
          </span>
          <button onClick={() => setSyncResult(null)} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '1rem', color: '#94a3b8' }}>×</button>
        </div>
      )}

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
                {expired && <span style={{ color: '#dc2626', fontSize: '0.68rem' }}>(hết hạn)</span>}
              </div>
            );
          })}
        </div>
      )}

      {/* ── No connections ───────────────────────────────────────────────────── */}
      {hasNoConnections && !loading && (
        <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 14, padding: '24px 28px', marginBottom: 20, textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', marginBottom: 8 }}>🔗</div>
          <h3 style={{ margin: '0 0 8px', fontSize: '1rem', fontWeight: 800, color: '#9a3412' }}>Chưa kết nối shop nào với Analytics App</h3>
          <p style={{ color: '#c2410c', fontSize: '0.84rem', margin: '0 0 16px' }}>Click nút bên dưới để uỷ quyền shop.</p>
          <a href={AUTH_URL} target="_blank" rel="noopener noreferrer"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '11px 24px', background: '#ea580c', color: '#fff', borderRadius: 10, fontWeight: 700, textDecoration: 'none', fontSize: '0.88rem', boxShadow: '0 6px 16px rgba(234,88,12,0.25)' }}>
            ♪ Kết nối TikTok Shop
          </a>
        </div>
      )}

      {/* ── Filters ──────────────────────────────────────────────────────────── */}
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: '16px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {[{ label: '7 ngày', days: 7 }, { label: '30 ngày', days: 30 }, { label: '90 ngày', days: 90 }].map(r => {
            const end = new Date(); const start = new Date(); start.setDate(start.getDate() - r.days);
            const isActive = dateRange.start === toYmd(start) && dateRange.end === toYmd(end);
            return (
              <button key={r.days} onClick={() => setQuickRange(r.days)}
                style={{ padding: '6px 14px', borderRadius: 7, fontSize: '0.78rem', fontWeight: 600, border: isActive ? '1.5px solid #ea580c' : '1.5px solid #e5e7eb', background: isActive ? '#fff7ed' : '#fff', color: isActive ? '#ea580c' : '#64748b', cursor: 'pointer' }}>
                {r.label}
              </button>
            );
          })}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="date" value={dateRange.start} onChange={e => setDateRange(prev => ({ ...prev, start: e.target.value }))}
            style={{ padding: '6px 10px', borderRadius: 7, border: '1.5px solid #e5e7eb', fontSize: '0.8rem', fontFamily: 'inherit' }} />
          <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>→</span>
          <input type="date" value={dateRange.end} onChange={e => setDateRange(prev => ({ ...prev, end: e.target.value }))}
            style={{ padding: '6px 10px', borderRadius: 7, border: '1.5px solid #e5e7eb', fontSize: '0.8rem', fontFamily: 'inherit' }} />
        </div>
        {connections.length > 1 && (
          <select value={shopFilter} onChange={e => setShopFilter(e.target.value)}
            style={{ padding: '6px 12px', borderRadius: 7, border: '1.5px solid #e5e7eb', fontSize: '0.8rem', fontFamily: 'inherit', color: '#374151', background: '#fff' }}>
            <option value="">Tất cả shop</option>
            {connections.map(c => (<option key={c.shop_id} value={c.shop_id}>{c.seller_name || c.shop_id}</option>))}
          </select>
        )}
        <div style={{ fontSize: '0.74rem', color: '#94a3b8', marginLeft: 'auto' }}>
          {dailyData.length} bản ghi
        </div>
      </div>

      {/* ── Loading ──────────────────────────────────────────────────────────── */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '48px 20px', color: '#64748b' }}>
          <div style={{ fontSize: '2rem', marginBottom: 8 }}>⏳</div>
          <p style={{ fontSize: '0.88rem', fontWeight: 600 }}>Đang tải dữ liệu...</p>
        </div>
      )}

      {/* ── Data ─────────────────────────────────────────────────────────────── */}
      {!loading && computed && (
        <>
          {/* ── Summary Cards ────────────────────────────────────────────────── */}
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 24 }}>
            <StatCard icon="💰" label="GMV" value={`${fmtVnd(computed.totalGmv)} VND`}
              sub={`AOV: ${fmtVnd(computed.aov)} VND`} bgColor="#fff7ed" borderColor="#fed7aa" />
            <StatCard icon="🛒" label="Đơn hàng" value={fmtNumber(computed.totalOrders)}
              sub={`${fmtNumber(computed.totalItems)} SP bán ra`} bgColor="#eff6ff" borderColor="#bfdbfe" />
            <StatCard icon="👥" label="Người mua" value={fmtNumber(computed.totalBuyers)}
              sub={`${fmtNumber(computed.totalVisitors)} khách truy cập · ${fmtNumber(computed.totalPv)} lượt xem`} bgColor="#f0fdf4" borderColor="#bbf7d0" />
            <StatCard icon="📊" label="Tỷ lệ chuyển đổi" value={fmtPercent(computed.conversionRate)}
              sub="Người mua / Khách truy cập" bgColor="#f5f3ff" borderColor="#ddd6fe" />
          </div>

          {/* ── Charts ───────────────────────────────────────────────────────── */}
          {computed.chartData.length > 0 && (
            <div style={{ display: 'grid', gap: 20, gridTemplateColumns: 'repeat(auto-fit, minmax(480px, 1fr))', marginBottom: 24 }}>
              {/* GMV Chart */}
              <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: '18px 20px' }}>
                <h3 style={{ margin: '0 0 14px', fontSize: '0.88rem', fontWeight: 800 }}>📈 GMV theo ngày</h3>
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={computed.chartData}>
                    <defs><linearGradient id="gmvGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#ea580c" stopOpacity={0.15}/><stop offset="95%" stopColor="#ea580c" stopOpacity={0}/></linearGradient></defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/>
                    <XAxis dataKey="date" tick={{ fontSize:11, fill:'#64748b' }}/>
                    <YAxis tickFormatter={fmtVnd} tick={{ fontSize:11, fill:'#64748b' }} width={70}/>
                    <Tooltip content={<ChartTooltip valueFormatter={fmtVnd} suffix=" VND"/>}/>
                    <Area type="monotone" dataKey="GMV" stroke="#ea580c" strokeWidth={2.5} fill="url(#gmvGrad)" dot={{ r: 3, fill: '#ea580c' }}>
                      <LabelList dataKey="GMV" content={<SmallLabel formatter={fmtShort} color="#c2410c" />} />
                    </Area>
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* Orders Chart */}
              <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: '18px 20px' }}>
                <h3 style={{ margin: '0 0 14px', fontSize: '0.88rem', fontWeight: 800 }}>🛒 Đơn hàng theo ngày</h3>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={computed.chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/>
                    <XAxis dataKey="date" tick={{ fontSize:11, fill:'#64748b' }}/>
                    <YAxis tick={{ fontSize:11, fill:'#64748b' }} width={50}/>
                    <Tooltip content={<ChartTooltip valueFormatter={fmtNumber}/>}/>
                    <Bar dataKey="Đơn hàng" fill="#3b82f6" radius={[4,4,0,0]}>
                      <LabelList dataKey="Đơn hàng" position="top" style={{ fontSize: 10, fill: '#3b82f6', fontWeight: 600 }} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Traffic Chart */}
              {(computed.chartData.some(d => d['Khách truy cập'] > 0) || computed.chartData.some(d => d['Lượt xem'] > 0)) && (
                <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: '18px 20px', gridColumn: '1 / -1' }}>
                  <h3 style={{ margin: '0 0 14px', fontSize: '0.88rem', fontWeight: 800 }}>👥 Traffic theo ngày</h3>
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={computed.chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/>
                      <XAxis dataKey="date" tick={{ fontSize:11, fill:'#64748b' }}/>
                      <YAxis tick={{ fontSize:11, fill:'#64748b' }} width={60}/>
                      <Tooltip content={<ChartTooltip valueFormatter={fmtNumber}/>}/>
                      <Legend />
                      {computed.chartData.some(d => d['Lượt xem'] > 0) && (
                        <Line type="monotone" dataKey="Lượt xem" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 3, fill: '#8b5cf6' }}>
                          <LabelList dataKey="Lượt xem" content={<SmallLabel formatter={fmtShort} color="#7c3aed" />} />
                        </Line>
                      )}
                      {computed.chartData.some(d => d['Khách truy cập'] > 0) && (
                        <Line type="monotone" dataKey="Khách truy cập" stroke="#0891b2" strokeWidth={2} dot={{ r: 3, fill: '#0891b2' }}>
                          <LabelList dataKey="Khách truy cập" content={<SmallLabel formatter={fmtShort} color="#0e7490" />} />
                        </Line>
                      )}
                      {computed.chartData.some(d => d['Người mua'] > 0) && (
                        <Line type="monotone" dataKey="Người mua" stroke="#16a34a" strokeWidth={2} dot={{ r: 3, fill: '#16a34a' }}>
                          <LabelList dataKey="Người mua" content={<SmallLabel formatter={fmtShort} color="#15803d" />} />
                        </Line>
                      )}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          )}

          {/* ── Bảng thống kê chi tiết theo ngày ─────────────────────────────── */}
          {computed.dailyTable.length > 0 && (
            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, overflow: 'hidden', marginBottom: 24 }}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid #e5e7eb' }}>
                <h3 style={{ margin: 0, fontSize: '0.88rem', fontWeight: 800 }}>📋 Thống kê chi tiết theo ngày</h3>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc' }}>
                      <th style={thStyle}>Ngày</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>GMV</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>Đơn hàng</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>SP bán</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>Người mua</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>Khách truy cập</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>Lượt xem</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>Chuyển đổi</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>AOV</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>Hoàn tiền</th>
                    </tr>
                  </thead>
                  <tbody>
                    {computed.dailyTable.map((row, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}
                        onMouseEnter={e => e.currentTarget.style.background = '#fafafa'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                        <td style={{ ...tdStyle, fontWeight: 700, color: '#374151' }}>{row.dateShort}</td>
                        <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, color: '#ea580c' }}>{fmtVnd(row.gmv)}</td>
                        <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600 }}>{fmtNumber(row.orders)}</td>
                        <td style={{ ...tdStyle, textAlign: 'right', color: '#475569' }}>{fmtNumber(row.items_sold)}</td>
                        <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600, color: '#16a34a' }}>{fmtNumber(row.buyers)}</td>
                        <td style={{ ...tdStyle, textAlign: 'right', color: '#0891b2' }}>{fmtNumber(row.visitors)}</td>
                        <td style={{ ...tdStyle, textAlign: 'right', color: '#8b5cf6' }}>{fmtNumber(row.page_views)}</td>
                        <td style={{ ...tdStyle, textAlign: 'right' }}>
                          <span style={{
                            background: row.conversion > 8 ? '#dcfce7' : row.conversion > 5 ? '#fff7ed' : '#fef2f2',
                            color: row.conversion > 8 ? '#15803d' : row.conversion > 5 ? '#c2410c' : '#dc2626',
                            padding: '2px 8px', borderRadius: 6, fontWeight: 700, fontSize: '0.78rem',
                          }}>
                            {fmtPercent(row.conversion)}
                          </span>
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'right', color: '#475569' }}>{fmtVnd(row.aov)}</td>
                        <td style={{ ...tdStyle, textAlign: 'right', color: row.refund_amount > 0 ? '#dc2626' : '#94a3b8', fontSize: '0.78rem' }}>
                          {row.refund_amount > 0 ? `-${fmtVnd(row.refund_amount)}` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {/* Totals row */}
                  <tfoot>
                    <tr style={{ background: '#f8fafc', borderTop: '2px solid #e5e7eb' }}>
                      <td style={{ ...tdStyle, fontWeight: 800, color: '#0f172a' }}>Tổng</td>
                      <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 800, color: '#ea580c' }}>{fmtVnd(computed.totalGmv)}</td>
                      <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 800 }}>{fmtNumber(computed.totalOrders)}</td>
                      <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, color: '#475569' }}>{fmtNumber(computed.totalItems)}</td>
                      <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 800, color: '#16a34a' }}>{fmtNumber(computed.totalBuyers)}</td>
                      <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, color: '#0891b2' }}>{fmtNumber(computed.totalVisitors)}</td>
                      <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, color: '#8b5cf6' }}>{fmtNumber(computed.totalPv)}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>
                        <span style={{ background: '#f5f3ff', color: '#7c3aed', padding: '2px 8px', borderRadius: 6, fontWeight: 800, fontSize: '0.78rem' }}>
                          {fmtPercent(computed.conversionRate)}
                        </span>
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, color: '#475569' }}>{fmtVnd(computed.aov)}</td>
                      <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, color: '#dc2626', fontSize: '0.78rem' }}>
                        {computed.totalRefunds > 0 ? `-${fmtVnd(computed.totalRefunds)}` : '—'}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {/* ── Hiệu suất theo Shop ──────────────────────────────────────────── */}
          {computed.shopList.length > 0 && (
            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, overflow: 'hidden', marginBottom: 24 }}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid #e5e7eb' }}>
                <h3 style={{ margin: 0, fontSize: '0.88rem', fontWeight: 800 }}>🏪 Hiệu suất theo Shop</h3>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc' }}>
                      {['Shop','GMV','Đơn hàng','Người mua','Khách truy cập','Lượt xem','Chuyển đổi','AOV'].map(h => (
                        <th key={h} style={thStyle}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {computed.shopList.map((s, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}
                        onMouseEnter={e => e.currentTarget.style.background = '#fafafa'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                        <td style={{ ...tdStyle, fontWeight: 700 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.color, flexShrink: 0 }}/>
                            {s.seller_name}
                          </div>
                        </td>
                        <td style={{ ...tdStyle, fontWeight: 700, color: '#ea580c' }}>{fmtVnd(s.gmv)} VND</td>
                        <td style={tdStyle}>{fmtNumber(s.orders)}</td>
                        <td style={tdStyle}>{fmtNumber(s.buyers)}</td>
                        <td style={tdStyle}>{fmtNumber(s.visitors)}</td>
                        <td style={tdStyle}>{fmtNumber(s.page_views)}</td>
                        <td style={tdStyle}>
                          <span style={{
                            background: s.conversion > 8 ? '#dcfce7' : s.conversion > 5 ? '#fff7ed' : '#fef2f2',
                            color: s.conversion > 8 ? '#15803d' : s.conversion > 5 ? '#c2410c' : '#dc2626',
                            padding: '3px 8px', borderRadius: 6, fontWeight: 700, fontSize: '0.78rem',
                          }}>
                            {fmtPercent(s.conversion)}
                          </span>
                        </td>
                        <td style={{ ...tdStyle, color: '#475569' }}>{fmtVnd(s.aov)} VND</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Shop GMV Chart (multi-shop) ──────────────────────────────────── */}
          {computed.shopList.length > 1 && (
            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: '18px 20px', marginBottom: 24 }}>
              <h3 style={{ margin: '0 0 14px', fontSize: '0.88rem', fontWeight: 800 }}>🏆 GMV theo Shop</h3>
              <ResponsiveContainer width="100%" height={Math.max(200, computed.shopList.length * 50)}>
                <BarChart data={computed.shopList} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/>
                  <XAxis type="number" tickFormatter={fmtVnd} tick={{ fontSize:11, fill:'#64748b' }}/>
                  <YAxis type="category" dataKey="seller_name" width={150} tick={{ fontSize:11, fill:'#374151' }}/>
                  <Tooltip content={<ChartTooltip valueFormatter={fmtVnd} suffix=" VND"/>}/>
                  <Bar dataKey="gmv" name="GMV" fill="#ea580c" radius={[0,6,6,0]}>
                    <LabelList dataKey="gmv" position="right" formatter={fmtVnd} style={{ fontSize: 11, fill: '#ea580c', fontWeight: 700 }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}

      {/* ── Empty state ──────────────────────────────────────────────────────── */}
      {!loading && !computed && (
        <div style={{ background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: 14, padding: '48px 20px', textAlign: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>📭</div>
          <h3 style={{ margin: '0 0 8px', fontWeight: 800, color: '#374151' }}>Chưa có dữ liệu analytics</h3>
          <p style={{ color: '#64748b', fontSize: '0.84rem', margin: '0 0 16px' }}>
            Bấm "Full Sync (01/04)" để kéo dữ liệu từ TikTok Analytics API về Supabase.
          </p>
          <button onClick={() => doSync(true)} disabled={syncing}
            style={{ padding: '11px 24px', background: '#ea580c', color: '#fff', borderRadius: 10, fontWeight: 700, border: 'none', fontSize: '0.88rem', cursor: syncing ? 'not-allowed' : 'pointer', boxShadow: '0 6px 16px rgba(234,88,12,0.25)' }}>
            {syncing ? '⏳ Đang sync...' : '📥 Full Sync từ 01/04/2026'}
          </button>
        </div>
      )}
    </div>
  );
};

export default ShopAnalyticsTab;
