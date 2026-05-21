// src/components/ShopAnalyticsTab.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
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
const toYmd = (d) => {
  const dt = d instanceof Date ? d : new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
};
const shortDate = (ymd) => { if (!ymd) return ''; const p = ymd.split('-'); return `${p[2]}/${p[1]}`; };

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
      // Reload data after sync
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

    // Group by date for charts
    const byDate = {};
    const byShop = {};

    dailyData.forEach(row => {
      const d = row.date;
      if (!byDate[d]) byDate[d] = { date: d, gmv: 0, orders: 0, buyers: 0, page_views: 0 };
      byDate[d].gmv        += Number(row.payment_amount) || 0;
      byDate[d].orders     += Number(row.order_count) || 0;
      byDate[d].buyers     += Number(row.buyer_count) || 0;
      byDate[d].page_views += Number(row.page_views) || 0;

      const sid = row.shop_id;
      if (!byShop[sid]) byShop[sid] = { shop_id: sid, seller_name: row.seller_name || sid, gmv: 0, orders: 0, buyers: 0, page_views: 0 };
      byShop[sid].gmv        += Number(row.payment_amount) || 0;
      byShop[sid].orders     += Number(row.order_count) || 0;
      byShop[sid].buyers     += Number(row.buyer_count) || 0;
      byShop[sid].page_views += Number(row.page_views) || 0;
    });

    const chartData = Object.entries(byDate)
      .sort(([a],[b]) => a.localeCompare(b))
      .map(([date, v]) => ({
        date: shortDate(date),
        fullDate: date,
        GMV: v.gmv,
        'Don hang': v.orders,
        'Nguoi mua': v.buyers,
        'Luot xem': v.page_views,
      }));

    const shopList = Object.values(byShop)
      .sort((a,b) => b.gmv - a.gmv)
      .map((s, i) => ({
        ...s,
        conversion: s.buyers > 0 ? (s.orders / s.buyers * 100) : 0,
        aov: s.orders > 0 ? (s.gmv / s.orders) : 0,
        color: SHOP_COLORS[i % SHOP_COLORS.length],
      }));

    const totalGmv    = shopList.reduce((s,v) => s + v.gmv, 0);
    const totalOrders = shopList.reduce((s,v) => s + v.orders, 0);
    const totalBuyers = shopList.reduce((s,v) => s + v.buyers, 0);
    const totalPv     = shopList.reduce((s,v) => s + v.page_views, 0);

    return {
      chartData,
      shopList,
      totalGmv,
      totalOrders,
      totalBuyers,
      totalPv,
      conversionRate: totalBuyers > 0 ? (totalOrders / totalBuyers * 100) : 0,
      aov: totalOrders > 0 ? (totalGmv / totalOrders) : 0,
    };
  }, [dailyData]);

  const hasNoConnections = connections.length === 0;

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
            GMV, don hang, traffic & chuyen doi — du lieu tu Supabase
            {lastSync && <span style={{ marginLeft: 8, color: '#94a3b8' }}>| Sync gan nhat: {new Date(lastSync).toLocaleString('vi-VN')}</span>}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <a href={AUTH_URL} target="_blank" rel="noopener noreferrer"
            style={{ padding: '9px 16px', borderRadius: 8, background: '#0f172a', color: '#fff', fontSize: '0.8rem', fontWeight: 700, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6, boxShadow: '0 4px 12px rgba(15,23,42,0.18)' }}>
            ♪ Ket noi Shop
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
              ? `⚠️ Loi: ${syncResult.error}`
              : `✅ Sync thanh cong: ${syncResult.total_upserted || 0} ban ghi (${syncResult.elapsed_seconds || 0}s)`}
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
                {expired && <span style={{ color: '#dc2626', fontSize: '0.68rem' }}>(het han)</span>}
              </div>
            );
          })}
        </div>
      )}

      {/* ── No connections ───────────────────────────────────────────────────── */}
      {hasNoConnections && !loading && (
        <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 14, padding: '24px 28px', marginBottom: 20, textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', marginBottom: 8 }}>🔗</div>
          <h3 style={{ margin: '0 0 8px', fontSize: '1rem', fontWeight: 800, color: '#9a3412' }}>Chua ket noi shop nao voi Analytics App</h3>
          <p style={{ color: '#c2410c', fontSize: '0.84rem', margin: '0 0 16px' }}>Click nut ben duoi de uy quyen shop.</p>
          <a href={AUTH_URL} target="_blank" rel="noopener noreferrer"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '11px 24px', background: '#ea580c', color: '#fff', borderRadius: 10, fontWeight: 700, textDecoration: 'none', fontSize: '0.88rem', boxShadow: '0 6px 16px rgba(234,88,12,0.25)' }}>
            ♪ Ket noi TikTok Shop
          </a>
        </div>
      )}

      {/* ── Filters ──────────────────────────────────────────────────────────── */}
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: '16px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {[{ label: '7 ngay', days: 7 }, { label: '30 ngay', days: 30 }, { label: '90 ngay', days: 90 }].map(r => {
            const end = new Date(); const start = new Date(); start.setDate(start.getDate() - r.days);
            const isActive = dateRange.start === toYmd(start) && dateRange.end === toYmd(end);
            return (
              <button key={r.days} onClick={() => setQuickRange(r.days)}
                style={{ padding: '6px 14px', borderRadius: 7, fontSize: '0.78rem', fontWeight: 600, border: isActive ? '1.5px solid #ea580c' : '1.5px solid #e5e7eb', background: isActive ? '#fff7ed' : '#fff', color: isActive ? '#ea580c' : '#64748b', cursor: 'pointer' }}>
                {r.label}
              </button>
            );
          })}
          <button onClick={() => setDateRange({ start: '2026-04-01', end: toYmd(new Date()) })}
            style={{ padding: '6px 14px', borderRadius: 7, fontSize: '0.78rem', fontWeight: 600, border: dateRange.start === '2026-04-01' ? '1.5px solid #ea580c' : '1.5px solid #e5e7eb', background: dateRange.start === '2026-04-01' ? '#fff7ed' : '#fff', color: dateRange.start === '2026-04-01' ? '#ea580c' : '#64748b', cursor: 'pointer' }}>
            Tu 01/04
          </button>
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
            <option value="">Tat ca shop</option>
            {connections.map(c => (<option key={c.shop_id} value={c.shop_id}>{c.seller_name || c.shop_id}</option>))}
          </select>
        )}
        <div style={{ fontSize: '0.74rem', color: '#94a3b8', marginLeft: 'auto' }}>
          {dailyData.length} ban ghi
        </div>
      </div>

      {/* ── Loading ──────────────────────────────────────────────────────────── */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '48px 20px', color: '#64748b' }}>
          <div style={{ fontSize: '2rem', marginBottom: 8 }}>⏳</div>
          <p style={{ fontSize: '0.88rem', fontWeight: 600 }}>Dang tai du lieu...</p>
        </div>
      )}

      {/* ── Data ─────────────────────────────────────────────────────────────── */}
      {!loading && computed && (
        <>
          {/* Summary Cards */}
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 24 }}>
            <StatCard icon="💰" label="GMV" value={`${fmtVnd(computed.totalGmv)} VND`}
              sub={`AOV: ${fmtVnd(computed.aov)} VND`} bgColor="#fff7ed" borderColor="#fed7aa" />
            <StatCard icon="🛒" label="Don hang" value={fmtNumber(computed.totalOrders)}
              sub={`${dateRange.start} → ${dateRange.end}`} bgColor="#eff6ff" borderColor="#bfdbfe" />
            <StatCard icon="👥" label="Nguoi mua" value={fmtNumber(computed.totalBuyers)}
              sub={computed.totalPv > 0 ? `${fmtNumber(computed.totalPv)} luot xem` : null} bgColor="#f0fdf4" borderColor="#bbf7d0" />
            <StatCard icon="📊" label="Ty le chuyen doi" value={fmtPercent(computed.conversionRate)}
              sub="Nguoi mua / Luot xem" bgColor="#f5f3ff" borderColor="#ddd6fe" />
          </div>

          {/* Charts */}
          {computed.chartData.length > 0 && (
            <div style={{ display: 'grid', gap: 20, gridTemplateColumns: 'repeat(auto-fit, minmax(480px, 1fr))', marginBottom: 24 }}>
              {/* GMV */}
              <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: '18px 20px' }}>
                <h3 style={{ margin: '0 0 14px', fontSize: '0.88rem', fontWeight: 800 }}>📈 GMV theo ngay</h3>
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={computed.chartData}>
                    <defs><linearGradient id="gmvGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#ea580c" stopOpacity={0.15}/><stop offset="95%" stopColor="#ea580c" stopOpacity={0}/></linearGradient></defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/>
                    <XAxis dataKey="date" tick={{ fontSize:11, fill:'#64748b' }}/>
                    <YAxis tickFormatter={fmtVnd} tick={{ fontSize:11, fill:'#64748b' }} width={70}/>
                    <Tooltip content={<ChartTooltip valueFormatter={fmtVnd} suffix=" VND"/>}/>
                    <Area type="monotone" dataKey="GMV" stroke="#ea580c" strokeWidth={2.5} fill="url(#gmvGrad)" dot={false}/>
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* Orders */}
              <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: '18px 20px' }}>
                <h3 style={{ margin: '0 0 14px', fontSize: '0.88rem', fontWeight: 800 }}>🛒 Don hang theo ngay</h3>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={computed.chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/>
                    <XAxis dataKey="date" tick={{ fontSize:11, fill:'#64748b' }}/>
                    <YAxis tick={{ fontSize:11, fill:'#64748b' }} width={50}/>
                    <Tooltip content={<ChartTooltip valueFormatter={fmtNumber}/>}/>
                    <Bar dataKey="Don hang" fill="#3b82f6" radius={[4,4,0,0]}/>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Traffic */}
              {(computed.chartData.some(d => d['Nguoi mua'] > 0) || computed.chartData.some(d => d['Luot xem'] > 0)) && (
                <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: '18px 20px', gridColumn: '1 / -1' }}>
                  <h3 style={{ margin: '0 0 14px', fontSize: '0.88rem', fontWeight: 800 }}>👥 Traffic theo ngay</h3>
                  <ResponsiveContainer width="100%" height={280}>
                    <LineChart data={computed.chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/>
                      <XAxis dataKey="date" tick={{ fontSize:11, fill:'#64748b' }}/>
                      <YAxis tick={{ fontSize:11, fill:'#64748b' }} width={60}/>
                      <Tooltip content={<ChartTooltip valueFormatter={fmtNumber}/>}/>
                      <Legend/>
                      {computed.chartData.some(d => d['Nguoi mua'] > 0) && <Line type="monotone" dataKey="Nguoi mua" stroke="#16a34a" strokeWidth={2} dot={false}/>}
                      {computed.chartData.some(d => d['Luot xem'] > 0) && <Line type="monotone" dataKey="Luot xem" stroke="#8b5cf6" strokeWidth={2} dot={false}/>}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          )}

          {/* Shop Table */}
          {computed.shopList.length > 0 && (
            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, overflow: 'hidden', marginBottom: 24 }}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid #e5e7eb' }}>
                <h3 style={{ margin: 0, fontSize: '0.88rem', fontWeight: 800 }}>🏪 Hieu suat theo Shop</h3>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc' }}>
                      {['Shop','GMV','Don hang','Nguoi mua','Luot xem','Chuyen doi','AOV'].map(h => (
                        <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 700, color: '#475569', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.4px', borderBottom: '2px solid #e5e7eb' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {computed.shopList.map((s, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}
                        onMouseEnter={e => e.currentTarget.style.background = '#fafafa'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                        <td style={{ padding: '12px 16px', fontWeight: 700 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.color, flexShrink: 0 }}/>
                            {s.seller_name}
                          </div>
                        </td>
                        <td style={{ padding: '12px 16px', fontWeight: 700, color: '#ea580c' }}>{fmtVnd(s.gmv)} VND</td>
                        <td style={{ padding: '12px 16px' }}>{fmtNumber(s.orders)}</td>
                        <td style={{ padding: '12px 16px' }}>{fmtNumber(s.buyers)}</td>
                        <td style={{ padding: '12px 16px' }}>{fmtNumber(s.page_views)}</td>
                        <td style={{ padding: '12px 16px' }}>
                          <span style={{ background: s.conversion > 3 ? '#dcfce7' : s.conversion > 1 ? '#fff7ed' : '#fef2f2', color: s.conversion > 3 ? '#15803d' : s.conversion > 1 ? '#c2410c' : '#dc2626', padding: '3px 8px', borderRadius: 6, fontWeight: 700, fontSize: '0.78rem' }}>
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

          {/* Shop GMV Chart */}
          {computed.shopList.length > 1 && (
            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: '18px 20px', marginBottom: 24 }}>
              <h3 style={{ margin: '0 0 14px', fontSize: '0.88rem', fontWeight: 800 }}>🏆 GMV theo Shop</h3>
              <ResponsiveContainer width="100%" height={Math.max(200, computed.shopList.length * 50)}>
                <BarChart data={computed.shopList} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/>
                  <XAxis type="number" tickFormatter={fmtVnd} tick={{ fontSize:11, fill:'#64748b' }}/>
                  <YAxis type="category" dataKey="seller_name" width={150} tick={{ fontSize:11, fill:'#374151' }}/>
                  <Tooltip content={<ChartTooltip valueFormatter={fmtVnd} suffix=" VND"/>}/>
                  <Bar dataKey="gmv" name="GMV" fill="#ea580c" radius={[0,6,6,0]}/>
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
          <h3 style={{ margin: '0 0 8px', fontWeight: 800, color: '#374151' }}>Chua co du lieu analytics</h3>
          <p style={{ color: '#64748b', fontSize: '0.84rem', margin: '0 0 16px' }}>
            Bam "Full Sync (01/04)" de keo du lieu tu TikTok Analytics API ve Supabase.
          </p>
          <button onClick={() => doSync(true)} disabled={syncing}
            style={{ padding: '11px 24px', background: '#ea580c', color: '#fff', borderRadius: 10, fontWeight: 700, border: 'none', fontSize: '0.88rem', cursor: syncing ? 'not-allowed' : 'pointer', boxShadow: '0 6px 16px rgba(234,88,12,0.25)' }}>
            {syncing ? '⏳ Dang sync...' : '📥 Full Sync tu 01/04/2026'}
          </button>
        </div>
      )}
    </div>
  );
};

export default ShopAnalyticsTab;
