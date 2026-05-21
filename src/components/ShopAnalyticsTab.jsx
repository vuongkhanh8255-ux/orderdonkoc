// src/components/ShopAnalyticsTab.jsx
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../supabaseClient';
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, LabelList,
} from 'recharts';

// ── Constants ─────────────────────────────────────────────────────────────────
const SYNC_API = '/api/tiktok-shop/sync-analytics';
const ANALYTICS_APP_KEY = '6k2of554me0j9';
const AUTH_URL = `https://services.tiktokshop.com/open/authorize?service_id=${ANALYTICS_APP_KEY}`;

const ACCENT = { orange: '#ea580c', blue: '#3b82f6', green: '#16a34a', purple: '#8b5cf6', cyan: '#0891b2', amber: '#d97706', pink: '#ec4899' };

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmtVnd = (v) => {
  const n = Number(v); if (!Number.isFinite(n) || n === 0) return '0';
  if (n >= 1e9) return `${(n/1e9).toFixed(2)} tỷ`;
  if (n >= 1e6) return `${(n/1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n/1e3).toFixed(1)}K`;
  return n.toLocaleString('vi-VN');
};
const fmtVndFull = (v) => { const n = Number(v); return Number.isFinite(n) ? n.toLocaleString('vi-VN') : '0'; };
const fmtShort = (v) => {
  const n = Number(v); if (!Number.isFinite(n) || n === 0) return '';
  if (n >= 1e6) return `${(n/1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n/1e3).toFixed(1)}K`;
  return String(n);
};
const fmtPercent = (v) => { const n = Number(v); return Number.isFinite(n) ? `${n.toFixed(2)}%` : '0%'; };
const fmtNumber = (v) => { const n = Number(v); return Number.isFinite(n) ? n.toLocaleString('vi-VN') : '0'; };
const toYmd = (d) => {
  const dt = d instanceof Date ? d : new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
};
const shortDate = (ymd) => { if (!ymd) return ''; const p = ymd.split('-'); return `${p[2]}/${p[1]}`; };
const daysBetween = (a, b) => Math.ceil((new Date(b) - new Date(a)) / 86400000);

// ── Sparkline ─────────────────────────────────────────────────────────────────
const Sparkline = ({ data, dataKey, color, height = 44 }) => (
  <ResponsiveContainer width="100%" height={height}>
    <AreaChart data={data} margin={{ top: 4, right: 2, bottom: 0, left: 2 }}>
      <defs>
        <linearGradient id={`sp-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="5%" stopColor={color} stopOpacity={0.25}/>
          <stop offset="95%" stopColor={color} stopOpacity={0}/>
        </linearGradient>
      </defs>
      <Area type="monotone" dataKey={dataKey} stroke={color} strokeWidth={1.8} fill={`url(#sp-${dataKey})`} dot={false} isAnimationActive={false}/>
    </AreaChart>
  </ResponsiveContainer>
);

// ── Change Badge ──────────────────────────────────────────────────────────────
const ChangeBadge = ({ value }) => {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  const up = value >= 0;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 2,
      background: up ? '#dcfce7' : '#fef2f2', color: up ? '#16a34a' : '#ef4444',
      padding: '3px 10px', borderRadius: 20, fontSize: '0.72rem', fontWeight: 700, whiteSpace: 'nowrap',
    }}>
      {up ? '▲' : '▼'} {Math.abs(value).toFixed(1)} %
    </span>
  );
};

// ── Stat Card (Stella-style) ──────────────────────────────────────────────────
const StatCard = ({ icon, label, value, unit, sub, change, sparkData, sparkKey, accentColor = '#ea580c' }) => (
  <div style={{
    background: '#fff', borderRadius: 16, padding: '20px 22px', flex: '1 1 240px', minWidth: 230,
    boxShadow: '0 1px 4px rgba(15,23,42,0.06)', border: '1px solid #f1f5f9',
    borderLeft: `4px solid ${accentColor}`, position: 'relative', overflow: 'hidden',
  }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: '1rem' }}>{icon}</span>
        <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.6px' }}>{label}</span>
      </div>
      <ChangeBadge value={change} />
    </div>
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16 }}>
      <div style={{ flex: '1 1 auto', minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span style={{ fontSize: '1.7rem', fontWeight: 900, color: '#0f172a', lineHeight: 1 }}>{value}</span>
          {unit && <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#94a3b8' }}>{unit}</span>}
        </div>
        {sub && <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: 6, lineHeight: 1.4 }}>{sub}</div>}
      </div>
      {sparkData && sparkData.length > 1 && (
        <div style={{ width: 100, flexShrink: 0 }}>
          <Sparkline data={sparkData} dataKey={sparkKey} color={accentColor} />
        </div>
      )}
    </div>
  </div>
);

// ── Tooltip ───────────────────────────────────────────────────────────────────
const ChartTooltip = ({ active, payload, label, valueFormatter = fmtVnd, suffix = '' }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '10px 14px', fontSize: '0.8rem', boxShadow: '0 4px 16px rgba(15,23,42,0.1)' }}>
      <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color || '#ea580c', display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.color || '#ea580c', display: 'inline-block' }} />
          {p.name}: <strong>{valueFormatter(p.value)}{suffix}</strong>
        </div>
      ))}
    </div>
  );
};

// ── Channel Bar ───────────────────────────────────────────────────────────────
const ChannelBar = ({ name, color, amount, percent, maxPercent }) => (
  <div style={{ marginBottom: 14 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ width: 10, height: 10, borderRadius: 3, background: color, display: 'inline-block' }} />
        <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#374151' }}>{name}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#0f172a' }}>{percent.toFixed(1)}%</span>
        <span style={{ fontSize: '0.76rem', color: '#64748b', minWidth: 80, textAlign: 'right' }}>{fmtVnd(amount)} đ</span>
      </div>
    </div>
    <div style={{ height: 8, background: '#f1f5f9', borderRadius: 6, overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${(percent / maxPercent) * 100}%`, background: color, borderRadius: 6, transition: 'width 0.5s ease' }} />
    </div>
  </div>
);

// ── Data Label ────────────────────────────────────────────────────────────────
const SmallLabel = ({ x, y, value, color = '#64748b' }) => {
  const label = fmtShort(value);
  if (!label) return null;
  return <text x={x} y={y - 8} textAnchor="middle" fill={color} fontSize={10} fontWeight={600}>{label}</text>;
};

// ══════════════════════════════════════════════════════════════════════════════
// ██  MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════════════════
const ShopAnalyticsTab = () => {
  const [connections, setConnections] = useState([]);
  const [loading, setLoading]       = useState(false);
  const [syncing, setSyncing]       = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const [shopFilter, setShopFilter] = useState('');
  const [dailyData, setDailyData]   = useState([]);
  const [prevData, setPrevData]     = useState([]);
  const [lastSync, setLastSync]     = useState(null);
  const [tablePage, setTablePage]   = useState(0);
  const TABLE_PAGE_SIZE = 10;

  const [dateRange, setDateRange] = useState(() => {
    const end = new Date();
    const start = new Date(); start.setDate(start.getDate() - 30);
    return { start: toYmd(start), end: toYmd(end) };
  });

  const setQuickRange = (days) => {
    const end = new Date();
    const start = new Date(); start.setDate(start.getDate() - days);
    setDateRange({ start: toYmd(start), end: toYmd(end) });
    setTablePage(0);
  };

  const periodLabel = useMemo(() => {
    const days = daysBetween(dateRange.start, dateRange.end);
    return `${days} ngày`;
  }, [dateRange]);

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

  // ── Fetch analytics ───────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // Current period
      let q = supabase.from('tiktok_shop_analytics_daily').select('*')
        .gte('date', dateRange.start).lte('date', dateRange.end)
        .order('date', { ascending: true });
      if (shopFilter) q = q.eq('shop_id', shopFilter);
      const { data, error } = await q;
      if (error) { console.error(error); setDailyData([]); }
      else setDailyData(data || []);

      // Previous period (same length)
      const days = daysBetween(dateRange.start, dateRange.end);
      const prevEnd = new Date(dateRange.start); prevEnd.setDate(prevEnd.getDate() - 1);
      const prevStart = new Date(prevEnd); prevStart.setDate(prevStart.getDate() - days + 1);
      let pq = supabase.from('tiktok_shop_analytics_daily').select('*')
        .gte('date', toYmd(prevStart)).lte('date', toYmd(prevEnd))
        .order('date', { ascending: true });
      if (shopFilter) pq = pq.eq('shop_id', shopFilter);
      const { data: prev } = await pq;
      setPrevData(prev || []);

      // Last sync time
      const { data: latest } = await supabase
        .from('tiktok_shop_analytics_daily').select('synced_at')
        .order('synced_at', { ascending: false }).limit(1);
      if (latest?.[0]) setLastSync(latest[0].synced_at);
    } catch (err) { console.error(err); setDailyData([]); }
    setLoading(false);
  }, [dateRange, shopFilter]);

  // ── Sync ──────────────────────────────────────────────────────────────────
  const doSync = async (fullSync = false) => {
    setSyncing(true); setSyncResult(null);
    try {
      const params = new URLSearchParams();
      if (fullSync) params.set('full_sync', '1');
      else { params.set('start_date', dateRange.start); params.set('end_date', dateRange.end); }
      const res = await fetch(`${SYNC_API}?${params}`);
      const json = await res.json();
      setSyncResult(json);
      await fetchData();
    } catch (err) { setSyncResult({ error: err.message }); }
    setSyncing(false);
  };

  useEffect(() => { fetchConnections(); }, [fetchConnections]);
  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Computed ──────────────────────────────────────────────────────────────
  const computed = useMemo(() => {
    if (!dailyData.length) return null;

    const sumRows = (rows) => {
      const t = { gmv: 0, orders: 0, buyers: 0, pv: 0, visitors: 0, items: 0, refunds: 0 };
      rows.forEach(r => {
        t.gmv      += Number(r.payment_amount) || 0;
        t.orders   += Number(r.order_count) || 0;
        t.buyers   += Number(r.buyer_count) || 0;
        t.pv       += Number(r.page_views) || 0;
        t.visitors += Number(r.visitors) || 0;
        t.items    += Number(r.items_sold) || 0;
        t.refunds  += Number(r.refund_amount) || 0;
      });
      return t;
    };

    const cur = sumRows(dailyData);
    const prev = sumRows(prevData);

    const pctChange = (c, p) => p > 0 ? ((c - p) / p * 100) : (c > 0 ? 100 : null);

    // ── Group by date ────────────────────────────────────────────────────
    const byDate = {};
    dailyData.forEach(row => {
      const d = row.date;
      if (!byDate[d]) byDate[d] = { date: d, gmv: 0, orders: 0, buyers: 0, pv: 0, visitors: 0, items: 0, refunds: 0 };
      byDate[d].gmv      += Number(row.payment_amount) || 0;
      byDate[d].orders   += Number(row.order_count) || 0;
      byDate[d].buyers   += Number(row.buyer_count) || 0;
      byDate[d].pv       += Number(row.page_views) || 0;
      byDate[d].visitors += Number(row.visitors) || 0;
      byDate[d].items    += Number(row.items_sold) || 0;
      byDate[d].refunds  += Number(row.refund_amount) || 0;
    });

    const dailySorted = Object.entries(byDate).sort(([a],[b]) => a.localeCompare(b));

    const chartData = dailySorted.map(([date, v]) => ({
      date: shortDate(date), fullDate: date,
      GMV: v.gmv, 'Đơn hàng': v.orders, 'Người mua': v.buyers,
      'Lượt xem': v.pv, 'Khách truy cập': v.visitors,
    }));

    // Sparkline arrays
    const sparkGmv      = dailySorted.map(([,v]) => ({ v: v.gmv }));
    const sparkOrders   = dailySorted.map(([,v]) => ({ v: v.orders }));
    const sparkVisitors = dailySorted.map(([,v]) => ({ v: v.visitors }));
    const sparkConv     = dailySorted.map(([,v]) => ({ v: v.visitors > 0 ? (v.buyers / v.visitors * 100) : 0 }));

    // ── Channel breakdown from raw_metrics ──────────────────────────────
    const channels = { VIDEO: 0, LIVE: 0, PRODUCT_CARD: 0 };
    dailyData.forEach(row => {
      const breakdowns = row.raw_metrics?.sales?.gmv?.breakdowns;
      if (Array.isArray(breakdowns)) {
        breakdowns.forEach(b => {
          if (b.type && channels[b.type] !== undefined) {
            channels[b.type] += Number(b.gmv?.amount || 0);
          }
        });
      }
    });
    const channelTotal = channels.VIDEO + channels.LIVE + channels.PRODUCT_CARD;
    const channelList = [
      { name: 'Video', color: ACCENT.orange, amount: channels.VIDEO },
      { name: 'Livestream', color: ACCENT.amber, amount: channels.LIVE },
      { name: 'Sản phẩm', color: ACCENT.blue, amount: channels.PRODUCT_CARD },
    ].map(c => ({ ...c, percent: channelTotal > 0 ? (c.amount / channelTotal * 100) : 0 }))
     .sort((a, b) => b.amount - a.amount);

    // ── Daily table ──────────────────────────────────────────────────────
    const dailyTable = dailySorted.map(([date, v]) => ({
      date, dateShort: shortDate(date),
      gmv: v.gmv, orders: v.orders, buyers: v.buyers,
      visitors: v.visitors, pv: v.pv, items: v.items, refunds: v.refunds,
      conversion: v.visitors > 0 ? (v.buyers / v.visitors * 100) : 0,
      aov: v.orders > 0 ? (v.gmv / v.orders) : 0,
    })).reverse();

    // ── By shop ──────────────────────────────────────────────────────────
    const byShop = {};
    dailyData.forEach(row => {
      const sid = row.shop_id;
      if (!byShop[sid]) byShop[sid] = { shop_id: sid, seller_name: row.seller_name || sid, gmv: 0, orders: 0, buyers: 0, pv: 0, visitors: 0 };
      byShop[sid].gmv      += Number(row.payment_amount) || 0;
      byShop[sid].orders   += Number(row.order_count) || 0;
      byShop[sid].buyers   += Number(row.buyer_count) || 0;
      byShop[sid].pv       += Number(row.page_views) || 0;
      byShop[sid].visitors += Number(row.visitors) || 0;
    });
    const shopList = Object.values(byShop).sort((a,b) => b.gmv - a.gmv).map((s,i) => ({
      ...s,
      conversion: s.visitors > 0 ? (s.buyers / s.visitors * 100) : 0,
      aov: s.orders > 0 ? (s.gmv / s.orders) : 0,
      color: Object.values(ACCENT)[i % Object.values(ACCENT).length],
    }));

    const numDays = dailySorted.length;
    const gmvMax = Math.max(...dailySorted.map(([,v]) => v.gmv));
    const gmvAvg = numDays > 0 ? cur.gmv / numDays : 0;

    return {
      cur, prev, numDays, chartData, dailyTable, shopList, channelList, channelTotal,
      sparkGmv, sparkOrders, sparkVisitors, sparkConv,
      gmvMax, gmvAvg,
      changes: {
        gmv: pctChange(cur.gmv, prev.gmv),
        orders: pctChange(cur.orders, prev.orders),
        visitors: pctChange(cur.visitors, prev.visitors),
        conversion: pctChange(
          cur.visitors > 0 ? (cur.buyers / cur.visitors * 100) : 0,
          prev.visitors > 0 ? (prev.buyers / prev.visitors * 100) : 0,
        ),
      },
      conversionRate: cur.visitors > 0 ? (cur.buyers / cur.visitors * 100) : 0,
      aov: cur.orders > 0 ? (cur.gmv / cur.orders) : 0,
    };
  }, [dailyData, prevData]);

  const th = { padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: '#475569', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.3px', borderBottom: '2px solid #e5e7eb', whiteSpace: 'nowrap' };
  const td = { padding: '10px 14px', fontSize: '0.82rem', whiteSpace: 'nowrap' };

  // ══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <div style={{ fontFamily: "'Outfit', sans-serif", color: '#0f172a' }}>

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: '0.7rem', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 4 }}>
            🏪 ECOM &nbsp;/&nbsp; TIKTOK ANALYTICS
          </div>
          <h2 style={{ margin: '0 0 4px', fontSize: '1.4rem', fontWeight: 900 }}>TikTok Shop Analytics</h2>
          <p style={{ margin: 0, color: '#64748b', fontSize: '0.82rem' }}>
            Tổng quan hiệu suất Ecom · {periodLabel} qua
            {lastSync && <span style={{ color: '#94a3b8' }}> · cập nhật <strong>{new Date(lastSync).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</strong> {new Date(lastSync).toLocaleDateString('vi-VN')}</span>}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Quick filters */}
          <div style={{ display: 'flex', gap: 0, background: '#f1f5f9', borderRadius: 10, padding: 3 }}>
            {[{ label: '7 ngày', days: 7 }, { label: '30 ngày', days: 30 }, { label: '90 ngày', days: 90 }].map(r => {
              const end = new Date(); const start = new Date(); start.setDate(start.getDate() - r.days);
              const isActive = dateRange.start === toYmd(start) && dateRange.end === toYmd(end);
              return (
                <button key={r.days} onClick={() => setQuickRange(r.days)}
                  style={{ padding: '7px 16px', borderRadius: 8, fontSize: '0.78rem', fontWeight: 600, border: 'none', background: isActive ? '#fff' : 'transparent', color: isActive ? '#ea580c' : '#64748b', cursor: 'pointer', boxShadow: isActive ? '0 1px 3px rgba(0,0,0,0.08)' : 'none', transition: 'all 0.15s' }}>
                  {r.label}
                </button>
              );
            })}
          </div>
          {/* Date inputs */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="date" value={dateRange.start} onChange={e => setDateRange(p => ({ ...p, start: e.target.value }))}
              style={{ padding: '6px 10px', borderRadius: 8, border: '1.5px solid #e5e7eb', fontSize: '0.78rem', fontFamily: 'inherit' }} />
            <span style={{ color: '#cbd5e1' }}>—</span>
            <input type="date" value={dateRange.end} onChange={e => setDateRange(p => ({ ...p, end: e.target.value }))}
              style={{ padding: '6px 10px', borderRadius: 8, border: '1.5px solid #e5e7eb', fontSize: '0.78rem', fontFamily: 'inherit' }} />
          </div>
          {/* Actions */}
          <button onClick={() => doSync(false)} disabled={syncing}
            style={{ padding: '8px 16px', borderRadius: 8, border: '1.5px solid #e5e7eb', background: '#fff', color: '#374151', fontWeight: 600, fontSize: '0.78rem', cursor: syncing ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            🔄 Đồng bộ
          </button>
          <button onClick={() => doSync(true)} disabled={syncing}
            style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#ea580c', color: '#fff', fontWeight: 700, fontSize: '0.78rem', cursor: syncing ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 6, boxShadow: '0 2px 8px rgba(234,88,12,0.25)', opacity: syncing ? 0.6 : 1 }}>
            {syncing ? '⏳ Đang sync...' : '📥 Full Sync'}
          </button>
        </div>
      </div>

      {/* ── Status badge ─────────────────────────────────────────────────────── */}
      {connections.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          {connections.map((c, i) => {
            const expired = c.access_token_expires_at && new Date(c.access_token_expires_at) < new Date();
            return (
              <div key={i} style={{
                display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 16px',
                background: expired ? '#fef2f2' : '#f0fdf4', border: `1px solid ${expired ? '#fecaca' : '#bbf7d0'}`,
                borderRadius: 20, fontSize: '0.76rem', fontWeight: 600,
              }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: expired ? '#ef4444' : '#22c55e' }} />
                {expired ? '⚠️' : '●'} {c.seller_name || c.shop_id}
                {expired && <span style={{ color: '#dc2626' }}>(hết hạn)</span>}
              </div>
            );
          })}
          <a href={AUTH_URL} target="_blank" rel="noopener noreferrer"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '6px 16px', background: '#0f172a', color: '#fff', borderRadius: 20, fontSize: '0.76rem', fontWeight: 600, textDecoration: 'none' }}>
            + Kết nối Shop
          </a>
        </div>
      )}

      {/* ── Sync result ──────────────────────────────────────────────────────── */}
      {syncResult && (
        <div style={{
          background: syncResult.error ? '#fef2f2' : '#f0fdf4',
          border: `1px solid ${syncResult.error ? '#fecaca' : '#bbf7d0'}`,
          borderRadius: 12, padding: '10px 16px', marginBottom: 16, fontSize: '0.82rem',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span style={{ color: syncResult.error ? '#dc2626' : '#15803d', fontWeight: 700 }}>
            {syncResult.error ? `⚠️ Lỗi: ${syncResult.error}` : `✅ Sync thành công: ${syncResult.total_upserted || 0} bản ghi (${syncResult.elapsed_seconds || 0}s)`}
          </span>
          <button onClick={() => setSyncResult(null)} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '1rem', color: '#94a3b8' }}>×</button>
        </div>
      )}

      {/* ── No connections ───────────────────────────────────────────────────── */}
      {connections.length === 0 && !loading && (
        <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 16, padding: '32px', marginBottom: 20, textAlign: 'center' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: 10 }}>🔗</div>
          <h3 style={{ margin: '0 0 8px', fontWeight: 800, color: '#9a3412' }}>Chưa kết nối shop nào</h3>
          <p style={{ color: '#c2410c', fontSize: '0.84rem', margin: '0 0 16px' }}>Kết nối TikTok Shop để xem dữ liệu analytics.</p>
          <a href={AUTH_URL} target="_blank" rel="noopener noreferrer"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '12px 28px', background: '#ea580c', color: '#fff', borderRadius: 12, fontWeight: 700, textDecoration: 'none', fontSize: '0.88rem', boxShadow: '0 6px 16px rgba(234,88,12,0.25)' }}>
            ♪ Kết nối TikTok Shop
          </a>
        </div>
      )}

      {/* ── Loading ──────────────────────────────────────────────────────────── */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '64px 20px', color: '#64748b' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: 10 }}>⏳</div>
          <p style={{ fontWeight: 600 }}>Đang tải dữ liệu...</p>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* DATA */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {!loading && computed && (
        <>
          {/* ── 4 Stat Cards ─────────────────────────────────────────────────── */}
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 24 }}>
            <StatCard icon="🌐" label="Traffic" accentColor={ACCENT.orange}
              value={fmtVnd(computed.cur.visitors)} unit="lượt"
              change={computed.changes.visitors}
              sub={`vs ${periodLabel} trước · ${fmtVndFull(computed.cur.visitors)} lượt`}
              sparkData={computed.sparkVisitors} sparkKey="v" />

            <StatCard icon="💰" label="Tổng GMV" accentColor={ACCENT.green}
              value={fmtVnd(computed.cur.gmv)} unit="đ"
              change={computed.changes.gmv}
              sub={`vs ${periodLabel} trước · ${fmtVndFull(computed.cur.gmv)} đ`}
              sparkData={computed.sparkGmv} sparkKey="v" />

            <StatCard icon="📦" label="Đơn hàng" accentColor={ACCENT.amber}
              value={fmtNumber(computed.cur.orders)} unit=""
              change={computed.changes.orders}
              sub={`vs ${periodLabel} trước · ${computed.numDays > 0 ? Math.round(computed.cur.orders / computed.numDays) : 0} đơn / ngày`}
              sparkData={computed.sparkOrders} sparkKey="v" />

            <StatCard icon="📊" label="Tỷ lệ chuyển đổi" accentColor={ACCENT.purple}
              value={computed.conversionRate.toFixed(2)} unit="%"
              change={computed.changes.conversion}
              sub={`vs ${periodLabel} trước · CVR trung bình`}
              sparkData={computed.sparkConv} sparkKey="v" />
          </div>

          {/* ── Main Charts: GMV + Channel breakdown ─────────────────────────── */}
          <div style={{ display: 'grid', gap: 20, gridTemplateColumns: computed.channelTotal > 0 ? '1.5fr 1fr' : '1fr', marginBottom: 24 }}>
            {/* GMV Area Chart */}
            <div style={{ background: '#fff', border: '1px solid #f1f5f9', borderRadius: 16, padding: '20px 22px', boxShadow: '0 1px 4px rgba(15,23,42,0.04)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 800 }}>📈 Doanh số theo ngày</h3>
                  <p style={{ margin: '2px 0 0', fontSize: '0.72rem', color: '#94a3b8' }}>Đơn vị: triệu đồng · {computed.numDays} ngày gần nhất</p>
                </div>
                <div style={{ display: 'flex', gap: 16, fontSize: '0.74rem', color: '#64748b' }}>
                  <span>Cao nhất: <strong style={{ color: '#ea580c' }}>{fmtVnd(computed.gmvMax)}</strong></span>
                  <span>TB: <strong style={{ color: '#0f172a' }}>{fmtVnd(computed.gmvAvg)}</strong></span>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={computed.chartData} margin={{ top: 20, right: 10, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="gmvGradMain" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ea580c" stopOpacity={0.12}/>
                      <stop offset="95%" stopColor="#ea580c" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/>
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false}/>
                  <YAxis tickFormatter={fmtVnd} tick={{ fontSize: 11, fill: '#94a3b8' }} width={55} axisLine={false} tickLine={false}/>
                  <Tooltip content={<ChartTooltip valueFormatter={fmtVnd} suffix=" đ"/>}/>
                  <Area type="monotone" dataKey="GMV" stroke="#ea580c" strokeWidth={2.5} fill="url(#gmvGradMain)" dot={{ r: 3, fill: '#ea580c', strokeWidth: 0 }} activeDot={{ r: 5, fill: '#ea580c' }}>
                    <LabelList dataKey="GMV" content={<SmallLabel color="#c2410c" />} />
                  </Area>
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Channel Breakdown */}
            {computed.channelTotal > 0 && (
              <div style={{ background: '#fff', border: '1px solid #f1f5f9', borderRadius: 16, padding: '20px 22px', boxShadow: '0 1px 4px rgba(15,23,42,0.04)' }}>
                <h3 style={{ margin: '0 0 4px', fontSize: '0.92rem', fontWeight: 800 }}>🎯 Doanh thu theo kênh</h3>
                <p style={{ margin: '0 0 20px', fontSize: '0.72rem', color: '#94a3b8' }}>Tỷ trọng GMV trên tổng {periodLabel}</p>
                {computed.channelList.map((ch, i) => (
                  <ChannelBar key={i} name={ch.name} color={ch.color} amount={ch.amount}
                    percent={ch.percent} maxPercent={computed.channelList[0]?.percent || 100} />
                ))}
                <div style={{ marginTop: 18, background: '#f8fafc', borderRadius: 10, padding: '12px 14px', fontSize: '0.78rem', color: '#475569', lineHeight: 1.5 }}>
                  💡 <strong>{computed.channelList[0]?.name}</strong> đang chiếm <strong>{computed.channelList[0]?.percent.toFixed(1)}%</strong> doanh thu
                  {computed.channelList[0]?.amount > 0 && <> — <strong style={{ color: '#ea580c' }}>{fmtVnd(computed.channelList[0]?.amount)} đ</strong></>}
                </div>
              </div>
            )}
          </div>

          {/* ── Orders + Traffic Charts ───────────────────────────────────────── */}
          <div style={{ display: 'grid', gap: 20, gridTemplateColumns: 'repeat(auto-fit, minmax(460px, 1fr))', marginBottom: 24 }}>
            {/* Orders */}
            <div style={{ background: '#fff', border: '1px solid #f1f5f9', borderRadius: 16, padding: '20px 22px', boxShadow: '0 1px 4px rgba(15,23,42,0.04)' }}>
              <h3 style={{ margin: '0 0 14px', fontSize: '0.88rem', fontWeight: 800 }}>🛒 Đơn hàng theo ngày</h3>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={computed.chartData} margin={{ top: 20, right: 10, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/>
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false}/>
                  <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} width={45} axisLine={false} tickLine={false}/>
                  <Tooltip content={<ChartTooltip valueFormatter={fmtNumber}/>}/>
                  <Bar dataKey="Đơn hàng" fill="#3b82f6" radius={[5,5,0,0]}>
                    <LabelList dataKey="Đơn hàng" position="top" style={{ fontSize: 10, fill: '#3b82f6', fontWeight: 600 }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Traffic */}
            <div style={{ background: '#fff', border: '1px solid #f1f5f9', borderRadius: 16, padding: '20px 22px', boxShadow: '0 1px 4px rgba(15,23,42,0.04)' }}>
              <h3 style={{ margin: '0 0 14px', fontSize: '0.88rem', fontWeight: 800 }}>👥 Traffic theo ngày</h3>
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={computed.chartData} margin={{ top: 20, right: 10, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/>
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false}/>
                  <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} width={50} axisLine={false} tickLine={false}/>
                  <Tooltip content={<ChartTooltip valueFormatter={fmtNumber}/>}/>
                  <Legend wrapperStyle={{ fontSize: '0.75rem' }}/>
                  <Line type="monotone" dataKey="Lượt xem" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 2.5, fill: '#8b5cf6' }}>
                    <LabelList dataKey="Lượt xem" content={<SmallLabel color="#7c3aed" />} />
                  </Line>
                  <Line type="monotone" dataKey="Khách truy cập" stroke="#0891b2" strokeWidth={2} dot={{ r: 2.5, fill: '#0891b2' }}>
                    <LabelList dataKey="Khách truy cập" content={<SmallLabel color="#0e7490" />} />
                  </Line>
                  <Line type="monotone" dataKey="Người mua" stroke="#16a34a" strokeWidth={2} dot={{ r: 2.5, fill: '#16a34a' }}>
                    <LabelList dataKey="Người mua" content={<SmallLabel color="#15803d" />} />
                  </Line>
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* ── Bảng thống kê chi tiết (paginated) ────────────────────────────── */}
          {computed.dailyTable.length > 0 && (() => {
            const totalPages = Math.ceil(computed.dailyTable.length / TABLE_PAGE_SIZE);
            const pageRows = computed.dailyTable.slice(tablePage * TABLE_PAGE_SIZE, (tablePage + 1) * TABLE_PAGE_SIZE);
            const pgBtn = (pg, label, disabled) => (
              <button key={label} onClick={() => !disabled && setTablePage(pg)} disabled={disabled}
                style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid #e5e7eb', background: pg === tablePage && typeof label === 'number' ? '#ea580c' : '#fff', color: pg === tablePage && typeof label === 'number' ? '#fff' : disabled ? '#cbd5e1' : '#374151', fontSize: '0.76rem', fontWeight: 600, cursor: disabled ? 'default' : 'pointer', minWidth: 32 }}>
                {typeof label === 'number' ? label + 1 : label}
              </button>
            );
            return (
            <div style={{ background: '#fff', border: '1px solid #f1f5f9', borderRadius: 16, overflow: 'hidden', marginBottom: 24, boxShadow: '0 1px 4px rgba(15,23,42,0.04)' }}>
              <div style={{ padding: '16px 22px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0, fontSize: '0.88rem', fontWeight: 800 }}>📋 Thống kê chi tiết theo ngày</h3>
                <span style={{ fontSize: '0.74rem', color: '#94a3b8' }}>{computed.dailyTable.length} ngày · Trang {tablePage + 1}/{totalPages}</span>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc' }}>
                      <th style={th}>Ngày</th>
                      <th style={{ ...th, textAlign: 'right' }}>GMV</th>
                      <th style={{ ...th, textAlign: 'right' }}>Đơn hàng</th>
                      <th style={{ ...th, textAlign: 'right' }}>SP bán</th>
                      <th style={{ ...th, textAlign: 'right' }}>Người mua</th>
                      <th style={{ ...th, textAlign: 'right' }}>Khách</th>
                      <th style={{ ...th, textAlign: 'right' }}>Lượt xem</th>
                      <th style={{ ...th, textAlign: 'right' }}>CVR</th>
                      <th style={{ ...th, textAlign: 'right' }}>AOV</th>
                      <th style={{ ...th, textAlign: 'right' }}>Hoàn tiền</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((row, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #f8fafc' }}
                        onMouseEnter={e => e.currentTarget.style.background = '#fafbfc'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                        <td style={{ ...td, fontWeight: 700, color: '#374151' }}>{row.dateShort}</td>
                        <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: '#ea580c' }}>{fmtVnd(row.gmv)}</td>
                        <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{fmtNumber(row.orders)}</td>
                        <td style={{ ...td, textAlign: 'right', color: '#475569' }}>{fmtNumber(row.items)}</td>
                        <td style={{ ...td, textAlign: 'right', fontWeight: 600, color: '#16a34a' }}>{fmtNumber(row.buyers)}</td>
                        <td style={{ ...td, textAlign: 'right', color: '#0891b2' }}>{fmtNumber(row.visitors)}</td>
                        <td style={{ ...td, textAlign: 'right', color: '#8b5cf6' }}>{fmtNumber(row.pv)}</td>
                        <td style={{ ...td, textAlign: 'right' }}>
                          <span style={{
                            background: row.conversion > 8 ? '#dcfce7' : row.conversion > 5 ? '#fff7ed' : '#fef2f2',
                            color: row.conversion > 8 ? '#15803d' : row.conversion > 5 ? '#c2410c' : '#dc2626',
                            padding: '2px 8px', borderRadius: 6, fontWeight: 700, fontSize: '0.76rem',
                          }}>{fmtPercent(row.conversion)}</span>
                        </td>
                        <td style={{ ...td, textAlign: 'right', color: '#475569' }}>{fmtVnd(row.aov)}</td>
                        <td style={{ ...td, textAlign: 'right', color: row.refunds > 0 ? '#dc2626' : '#cbd5e1', fontSize: '0.78rem' }}>
                          {row.refunds > 0 ? `-${fmtVnd(row.refunds)}` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: '#f8fafc', borderTop: '2px solid #e5e7eb' }}>
                      <td style={{ ...td, fontWeight: 800 }}>Tổng</td>
                      <td style={{ ...td, textAlign: 'right', fontWeight: 800, color: '#ea580c' }}>{fmtVnd(computed.cur.gmv)}</td>
                      <td style={{ ...td, textAlign: 'right', fontWeight: 800 }}>{fmtNumber(computed.cur.orders)}</td>
                      <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: '#475569' }}>{fmtNumber(computed.cur.items)}</td>
                      <td style={{ ...td, textAlign: 'right', fontWeight: 800, color: '#16a34a' }}>{fmtNumber(computed.cur.buyers)}</td>
                      <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: '#0891b2' }}>{fmtNumber(computed.cur.visitors)}</td>
                      <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: '#8b5cf6' }}>{fmtNumber(computed.cur.pv)}</td>
                      <td style={{ ...td, textAlign: 'right' }}>
                        <span style={{ background: '#f5f3ff', color: '#7c3aed', padding: '2px 8px', borderRadius: 6, fontWeight: 800, fontSize: '0.76rem' }}>
                          {fmtPercent(computed.conversionRate)}
                        </span>
                      </td>
                      <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: '#475569' }}>{fmtVnd(computed.aov)}</td>
                      <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: '#dc2626', fontSize: '0.78rem' }}>
                        {computed.cur.refunds > 0 ? `-${fmtVnd(computed.cur.refunds)}` : '—'}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              {/* Pagination */}
              {totalPages > 1 && (
                <div style={{ padding: '12px 22px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 4 }}>
                  {pgBtn(tablePage - 1, '‹', tablePage === 0)}
                  {Array.from({ length: totalPages }, (_, i) => i).map(pg => {
                    // Show first, last, and pages around current
                    if (pg === 0 || pg === totalPages - 1 || Math.abs(pg - tablePage) <= 1) {
                      return pgBtn(pg, pg, false);
                    }
                    if (pg === 1 && tablePage > 3) return <span key={`d${pg}`} style={{ padding: '0 4px', color: '#94a3b8', fontSize: '0.76rem' }}>…</span>;
                    if (pg === totalPages - 2 && tablePage < totalPages - 4) return <span key={`d${pg}`} style={{ padding: '0 4px', color: '#94a3b8', fontSize: '0.76rem' }}>…</span>;
                    return null;
                  })}
                  {pgBtn(tablePage + 1, '›', tablePage >= totalPages - 1)}
                </div>
              )}
            </div>
            );
          })()}

          {/* ── Hiệu suất theo Shop ──────────────────────────────────────────── */}
          {computed.shopList.length > 0 && (
            <div style={{ background: '#fff', border: '1px solid #f1f5f9', borderRadius: 16, overflow: 'hidden', marginBottom: 24, boxShadow: '0 1px 4px rgba(15,23,42,0.04)' }}>
              <div style={{ padding: '16px 22px', borderBottom: '1px solid #f1f5f9' }}>
                <h3 style={{ margin: 0, fontSize: '0.88rem', fontWeight: 800 }}>🏪 Hiệu suất theo Shop</h3>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc' }}>
                      {['Shop','GMV','Đơn hàng','Người mua','Khách truy cập','Lượt xem','CVR','AOV'].map(h => (
                        <th key={h} style={th}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {computed.shopList.map((s, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #f8fafc' }}
                        onMouseEnter={e => e.currentTarget.style.background = '#fafbfc'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                        <td style={{ ...td, fontWeight: 700 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.color, flexShrink: 0 }}/>
                            {s.seller_name}
                          </div>
                        </td>
                        <td style={{ ...td, fontWeight: 700, color: '#ea580c' }}>{fmtVnd(s.gmv)} đ</td>
                        <td style={td}>{fmtNumber(s.orders)}</td>
                        <td style={td}>{fmtNumber(s.buyers)}</td>
                        <td style={td}>{fmtNumber(s.visitors)}</td>
                        <td style={td}>{fmtNumber(s.pv)}</td>
                        <td style={td}>
                          <span style={{
                            background: s.conversion > 8 ? '#dcfce7' : s.conversion > 5 ? '#fff7ed' : '#fef2f2',
                            color: s.conversion > 8 ? '#15803d' : s.conversion > 5 ? '#c2410c' : '#dc2626',
                            padding: '2px 8px', borderRadius: 6, fontWeight: 700, fontSize: '0.76rem',
                          }}>{fmtPercent(s.conversion)}</span>
                        </td>
                        <td style={{ ...td, color: '#475569' }}>{fmtVnd(s.aov)} đ</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Empty state ──────────────────────────────────────────────────────── */}
      {!loading && !computed && connections.length > 0 && (
        <div style={{ background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: 16, padding: '56px 20px', textAlign: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>📭</div>
          <h3 style={{ margin: '0 0 8px', fontWeight: 800, color: '#374151' }}>Chưa có dữ liệu analytics</h3>
          <p style={{ color: '#64748b', fontSize: '0.84rem', margin: '0 0 16px' }}>Bấm Full Sync để kéo dữ liệu từ TikTok Analytics API.</p>
          <button onClick={() => doSync(true)} disabled={syncing}
            style={{ padding: '12px 28px', background: '#ea580c', color: '#fff', borderRadius: 12, fontWeight: 700, border: 'none', fontSize: '0.88rem', cursor: syncing ? 'not-allowed' : 'pointer', boxShadow: '0 6px 16px rgba(234,88,12,0.25)' }}>
            {syncing ? '⏳ Đang sync...' : '📥 Full Sync từ 01/04/2026'}
          </button>
        </div>
      )}
    </div>
  );
};

export default ShopAnalyticsTab;
