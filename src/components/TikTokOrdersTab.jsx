// src/components/TikTokOrdersTab.jsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../supabaseClient';
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';

// ── Constants ─────────────────────────────────────────────────────────────────
const STATUS_LABELS = {
  UNPAID:               'Chờ thanh toán',
  ON_HOLD:              'Tạm giữ',
  PARTIALLY_SHIPPING:   'Giao một phần',
  AWAITING_SHIPMENT:    'Chờ giao hàng',
  AWAITING_COLLECTION:  'Chờ lấy hàng',
  IN_TRANSIT:           'Đang vận chuyển',
  DELIVERED:            'Đã giao',
  COMPLETED:            'Hoàn thành',
  CANCELLED:            'Đã hủy',
};

const STATUS_COLOR = {
  COMPLETED:           { bg: '#dcfce7', text: '#15803d' },
  DELIVERED:           { bg: '#dbeafe', text: '#1d4ed8' },
  IN_TRANSIT:          { bg: '#ede9fe', text: '#6d28d9' },
  AWAITING_SHIPMENT:   { bg: '#fff7ed', text: '#c2410c' },
  AWAITING_COLLECTION: { bg: '#fef9c3', text: '#854d0e' },
  PARTIALLY_SHIPPING:  { bg: '#e0f2fe', text: '#0369a1' },
  CANCELLED:           { bg: '#fee2e2', text: '#b91c1c' },
  ON_HOLD:             { bg: '#f1f5f9', text: '#475569' },
  UNPAID:              { bg: '#fef3c7', text: '#92400e' },
};

const SHOP_COLORS = ['#ea580c','#3b82f6','#16a34a','#8b5cf6','#ec4899','#0891b2','#d97706','#dc2626','#059669','#7c3aed'];

const getStatusStyle = (s) => STATUS_COLOR[s] || { bg: '#f1f5f9', text: '#475569' };
const ALL_STATUSES   = Object.keys(STATUS_LABELS);
const PAGE_SIZE      = 50;
const DASH_FETCH_LIMIT = 50000;

// ── Helpers ───────────────────────────────────────────────────────────────────
const formatDate = (epochSeconds) => {
  if (!epochSeconds) return '—';
  return new Date(Number(epochSeconds) * 1000).toLocaleString('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
};
const fmtDay = (epochSeconds) => {
  if (!epochSeconds) return '';
  const d = new Date(Number(epochSeconds) * 1000);
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`;
};
// YYYY-MM-DD key for chronological sorting
const fmtDayKey = (epochSeconds) => {
  if (!epochSeconds) return '';
  const d = new Date(Number(epochSeconds) * 1000);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};
const formatAmount = (amount, currency) => {
  if (amount === null || amount === undefined || amount === '') return '—';
  const num = Number(amount);
  if (!Number.isFinite(num)) return String(amount);
  return `${num.toLocaleString('vi-VN')} ${currency || ''}`.trim();
};
const fmtGmv = (v) => {
  if (!v) return '0';
  if (v >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(1)}B`;
  if (v >= 1_000_000)     return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)         return `${(v / 1_000).toFixed(0)}K`;
  return v.toLocaleString('vi-VN');
};
const shortName = (name = '') => {
  // Rút gọn tên shop cho chart
  return name.replace(/Việt Nam/gi, 'VN').replace(/Hồ Chí Minh/gi, 'HCM').slice(0, 22);
};

// ── Pagination ────────────────────────────────────────────────────────────────
const Pagination = ({ page, totalPages, onChange }) => {
  if (totalPages <= 1) return null;
  const pages = [];
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || Math.abs(i - page) <= 2) pages.push(i);
    else if (pages[pages.length - 1] !== '...') pages.push('...');
  }
  const btn = (label, target, disabled = false, active = false) => (
    <button key={label} onClick={() => !disabled && target && onChange(target)} disabled={disabled}
      style={{ padding:'6px 11px', borderRadius:7, border:'1.5px solid', borderColor: active?'#ea580c':'#e5e7eb',
        background: active?'#ea580c':'#fff', color: active?'#fff': disabled?'#d1d5db':'#374151',
        fontWeight: active?700:500, fontSize:'0.82rem', cursor: disabled?'default':'pointer',
        minWidth:34, fontFamily:'inherit' }}>
      {label}
    </button>
  );
  return (
    <div style={{ display:'flex', gap:4, alignItems:'center', justifyContent:'center', flexWrap:'wrap', padding:'14px 16px' }}>
      {btn('‹', page-1, page===1)}
      {pages.map((p,i) => p==='...'
        ? <span key={`d${i}`} style={{ padding:'6px 4px', color:'#9ca3af', fontSize:'0.82rem' }}>…</span>
        : btn(p, p, false, p===page))}
      {btn('›', page+1, page===totalPages)}
    </div>
  );
};

// ── Custom Tooltip cho recharts ───────────────────────────────────────────────
const GmvTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background:'#fff', border:'1px solid #e5e7eb', borderRadius:10, padding:'10px 14px', fontSize:'0.8rem', boxShadow:'0 4px 16px rgba(15,23,42,0.1)' }}>
      <div style={{ fontWeight:700, color:'#0f172a', marginBottom:4 }}>{label}</div>
      {payload.map((p,i) => (
        <div key={i} style={{ color: p.color || '#ea580c' }}>
          {p.name}: <strong>{fmtGmv(p.value)} VND</strong>
        </div>
      ))}
    </div>
  );
};

// ── Main Component ────────────────────────────────────────────────────────────
const TikTokOrdersTab = () => {
  // Orders table state
  const [orders,        setOrders]        = useState([]);
  const [connections,   setConnections]   = useState([]);
  const [loading,       setLoading]       = useState(false);
  const [syncing,       setSyncing]       = useState(false);
  const [syncResult,    setSyncResult]    = useState(null);
  const [search,        setSearch]        = useState('');
  const [statusFilter,  setStatusFilter]  = useState('');
  const [shopFilter,    setShopFilter]    = useState('');
  const [expanded,      setExpanded]      = useState(null);
  const [page,          setPage]          = useState(1);
  const [totalCount,    setTotalCount]    = useState(0);
  const [stats,         setStats]         = useState({ total:0, completed:0, shipping:0, cancelled:0 });

  // Dashboard state
  const [activeTab,     setActiveTab]     = useState('dashboard');
  const [dashRange,     setDashRange]     = useState('30d');
  const [dashShop,      setDashShop]      = useState('');
  const [dashData,      setDashData]      = useState(null);
  const [dashLoading,   setDashLoading]   = useState(false);

  const searchDebounce  = useRef(null);
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    clearTimeout(searchDebounce.current);
    searchDebounce.current = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 350);
    return () => clearTimeout(searchDebounce.current);
  }, [search]);

  useEffect(() => { setPage(1); }, [statusFilter, shopFilter]);

  // ── Stats ─────────────────────────────────────────────────────────────────
  const fetchStats = useCallback(async () => {
    const [all, completed, shipping, cancelled] = await Promise.all([
      supabase.from('tiktok_shop_orders').select('*', { count:'exact', head:true }),
      supabase.from('tiktok_shop_orders').select('*', { count:'exact', head:true }).eq('order_status','COMPLETED'),
      supabase.from('tiktok_shop_orders').select('*', { count:'exact', head:true }).in('order_status',['IN_TRANSIT','AWAITING_SHIPMENT','AWAITING_COLLECTION','PARTIALLY_SHIPPING']),
      supabase.from('tiktok_shop_orders').select('*', { count:'exact', head:true }).eq('order_status','CANCELLED'),
    ]);
    setStats({ total: all.count||0, completed: completed.count||0, shipping: shipping.count||0, cancelled: cancelled.count||0 });
  }, []);

  // ── Connections ───────────────────────────────────────────────────────────
  const fetchConnections = useCallback(async () => {
    const { data } = await supabase.from('tiktok_shop_connections_public')
      .select('shop_id,seller_name,seller_base_region,access_token_expires_at');
    if (data) setConnections(data);
  }, []);

  // ── Orders table ──────────────────────────────────────────────────────────
  const fetchOrders = useCallback(async (pg, searchTerm, statusF, shopF) => {
    setLoading(true);
    const from = (pg-1)*PAGE_SIZE, to = from+PAGE_SIZE-1;
    let q = supabase.from('tiktok_shop_orders')
      .select('id,shop_id,open_id,order_status,create_time,update_time,total_amount,currency,line_items,synced_at', { count:'exact' })
      .order('create_time', { ascending:false }).range(from, to);
    if (statusF) q = q.eq('order_status', statusF);
    if (shopF)   q = q.eq('shop_id', shopF);
    if (searchTerm.trim()) q = q.or(`id.ilike.%${searchTerm.trim()}%,shop_id.ilike.%${searchTerm.trim()}%`);
    const { data, error, count } = await q;
    if (!error) { setOrders(data||[]); setTotalCount(count||0); }
    setLoading(false);
  }, []);

  // ── Dashboard data ────────────────────────────────────────────────────────
  const fetchDashboard = useCallback(async (range, shopId, conns) => {
    setDashLoading(true);
    try {
      const now = Math.floor(Date.now() / 1000);
      const fromTs = range === '7d'  ? now - 7*86400
                   : range === '30d' ? now - 30*86400
                   : 1775001600; // 01/04/2026

      // Fetch orders (no line_items) — paginate 1000/batch do Supabase cap
      const baseOrders = [];
      const BATCH = 1000;
      for (let offset = 0; offset < DASH_FETCH_LIMIT; offset += BATCH) {
        let q = supabase.from('tiktok_shop_orders')
          .select('shop_id,total_amount,order_status,create_time')
          .gte('create_time', fromTs)
          .range(offset, offset + BATCH - 1);
        if (shopId) q = q.eq('shop_id', shopId);
        const { data: batch } = await q;
        if (!batch || batch.length === 0) break;
        baseOrders.push(...batch);
        if (batch.length < BATCH) break;
      }

      // Fetch recent orders WITH line_items cho top products (limit 3000)
      let qItems = supabase.from('tiktok_shop_orders')
        .select('line_items,order_status,total_amount')
        .gte('create_time', fromTs)
        .neq('order_status','CANCELLED')   // top products chỉ tính đơn thành công
        .limit(3000)
        .order('create_time', { ascending:false });
      if (shopId) qItems = qItems.eq('shop_id', shopId);
      const { data: itemOrders } = await qItems;

      if (!baseOrders.length) { setDashLoading(false); return; }

      // GMV by shop — gross (kể cả hủy, khớp định nghĩa Seller Center)
      const shopGmv = {}, shopCnt = {}, shopCancelledCnt = {};
      let cancelledCount = 0;
      baseOrders.forEach(o => {
        const sid = o.shop_id || 'unknown';
        const isCancelled = o.order_status === 'CANCELLED';
        if (isCancelled) { cancelledCount++; shopCancelledCnt[sid] = (shopCancelledCnt[sid]||0) + 1; }
        shopGmv[sid] = (shopGmv[sid]||0) + (parseFloat(o.total_amount)||0);
        shopCnt[sid] = (shopCnt[sid]||0) + 1;
      });

      // GMV by day — use YYYY-MM-DD key so entries sort chronologically
      const dayMap = {};
      let emptyAmountCount = 0;
      baseOrders.forEach(o => {
        const key = fmtDayKey(o.create_time);
        if (!key) return;
        const amt = parseFloat(o.total_amount);
        if (!(amt > 0)) emptyAmountCount++;
        dayMap[key] = (dayMap[key]||0) + (amt||0);
      });

      // Top products
      const prodMap = {};
      (itemOrders||[]).forEach(o => {
        (o.line_items||[]).forEach(item => {
          const name = item.product_name || item.sku_name || 'Sản phẩm';
          if (!prodMap[name]) prodMap[name] = { name, qty:0, revenue:0 };
          prodMap[name].qty     += item.quantity || 1;
          prodMap[name].revenue += (parseFloat(item.sale_price)||0) * (item.quantity||1);
        });
      });

      const totalGmv    = Object.values(shopGmv).reduce((s,v)=>s+v, 0);
      const totalOrders = baseOrders.length;
      const netOrders   = totalOrders - cancelledCount;
      const cancelRate  = totalOrders > 0 ? (cancelledCount / totalOrders * 100) : 0;
      const uniqueDays  = Object.keys(dayMap).length;

      setDashData({
        byShop: Object.entries(shopGmv).map(([sid, gmv]) => ({
          shopId: sid,
          name: conns.find(c=>c.shop_id===sid)?.seller_name || sid,
          gmv, orders: shopCnt[sid]||0, cancelled: shopCancelledCnt[sid]||0,
        })).sort((a,b)=>b.gmv-a.gmv),
        byDay: Object.entries(dayMap)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, gmv]) => ({ date: `${key.slice(8)}/${key.slice(5,7)}`, GMV: gmv }))
          .slice(-60),
        topProducts: Object.values(prodMap).sort((a,b)=>b.revenue-a.revenue).slice(0,20),
        totalGmv, totalOrders, netOrders, cancelledCount, cancelRate,
        avgDailyGmv: uniqueDays > 0 ? totalGmv / uniqueDays : 0,
        aov: netOrders > 0 ? totalGmv / netOrders : 0,
        emptyAmountCount,
        isTruncated: baseOrders.length >= DASH_FETCH_LIMIT,
      });
    } catch (err) {
      console.error('Dashboard fetch error:', err);
    }
    setDashLoading(false);
  }, []);

  // ── Effects ───────────────────────────────────────────────────────────────
  useEffect(() => { fetchConnections(); fetchStats(); }, [fetchConnections, fetchStats]);
  useEffect(() => { fetchOrders(page, debouncedSearch, statusFilter, shopFilter); }, [page, debouncedSearch, statusFilter, shopFilter, fetchOrders]);
  useEffect(() => {
    if (activeTab === 'dashboard') fetchDashboard(dashRange, dashShop, connections);
  }, [activeTab, dashRange, dashShop, connections, fetchDashboard]);

  const reloadAll = () => { fetchConnections(); fetchStats(); fetchOrders(page, debouncedSearch, statusFilter, shopFilter); };

  // ── Sync ──────────────────────────────────────────────────────────────────
  const doSync = async () => {
    setSyncing(true); setSyncResult(null);
    try {
      const res  = await fetch('/api/tiktok-shop/sync-orders', { method:'POST' });
      const text = await res.text();
      let data;
      try { data = JSON.parse(text); }
      catch { data = res.status===504||text.includes('timeout') ? { error:'⏱ Timeout — thử lại sau.' } : { error:`Server lỗi (${res.status}): ${text.slice(0,120)}` }; }
      setSyncResult(data);
      if (data.success) { fetchStats(); fetchOrders(1, debouncedSearch, statusFilter, shopFilter); setPage(1); fetchDashboard(dashRange, dashShop, connections); }
    } catch (err) { setSyncResult({ error: err.message }); }
    setSyncing(false);
  };

  const fullResync = async () => {
    setSyncing(true); setSyncResult(null);
    const FROM_TS    = 1775001600; // 01/04/2026
    const WINDOW_SEC = 3 * 24 * 3600; // 3 ngày/chunk — nhỏ nhất có thể
    const nowSec     = Math.floor(Date.now() / 1000);

    // Tạo danh sách windows 3 ngày từ 01/04 đến nay
    const windows = [];
    for (let t = FROM_TS; t < nowSec; t += WINDOW_SEC) {
      windows.push({ ge: t, lt: Math.min(t + WINDOW_SEC, nowSec) });
    }

    let totalSynced = 0, allResults = [], lastSyncedAt = null, errorCount = 0;

    // Flatten tất cả (window × shop) thành 1 task array
    const tasks = [];
    for (const { ge, lt } of windows) {
      for (const conn of connections) {
        tasks.push({ ge, lt, conn });
      }
    }

    const CONCURRENCY = 1; // tuần tự 1 request — an toàn nhất, không timeout
    let done = 0;

    for (let i = 0; i < tasks.length; i += CONCURRENCY) {
      const batch = tasks.slice(i, i + CONCURRENCY);
      setSyncResult({
        _progress: true,
        message: `⏳ ${done}/${tasks.length} chunks · batch ${Math.floor(i/CONCURRENCY)+1}/${Math.ceil(tasks.length/CONCURRENCY)}${errorCount>0?` · ${errorCount} lỗi`:''}`,
      });

      const settled = await Promise.allSettled(
        batch.map(async ({ ge, lt, conn }) => {
          const url = `/api/tiktok-shop/sync-orders?full=true&from_ts=${ge}&to_ts=${lt}&shop_id=${conn.shop_id}`;
          const res  = await fetch(url, { method: 'POST' });
          const text = await res.text();
          try { return JSON.parse(text); }
          catch { return { error: `parse ${res.status}` }; }
        })
      );

      done += batch.length;
      for (const r of settled) {
        if (r.status === 'rejected' || r.value?.error) { errorCount++; continue; }
        totalSynced += r.value?.totalSynced || 0;
        if (r.value?.results) allResults.push(...r.value.results);
        if (r.value?.syncedAt) lastSyncedAt = r.value.syncedAt;
      }
    }

    setSyncResult({
      success: true, totalSynced, results: allResults, syncedAt: lastSyncedAt,
      ...(errorCount > 0 ? { _warn: `${errorCount} chunk bị lỗi/timeout, dữ liệu có thể thiếu.` } : {}),
    });
    fetchStats(); fetchOrders(1, debouncedSearch, statusFilter, shopFilter); setPage(1);
    fetchDashboard(dashRange, dashShop, connections);
    setSyncing(false);
  };

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  // ── RENDER ────────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily:"'Outfit',sans-serif", color:'#111827' }}>

      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:20, flexWrap:'wrap', gap:12 }}>
        <div>
          <div style={{ fontSize:'0.7rem', fontWeight:800, color:'#ea580c', letterSpacing:2, textTransform:'uppercase', marginBottom:4 }}>TikTok Shop</div>
          <h1 style={{ margin:0, fontSize:'1.6rem', fontWeight:900, color:'#0f172a', letterSpacing:'-0.3px' }}>ĐƠN HÀNG TIKTOK SHOP</h1>
          <p style={{ margin:'5px 0 0', color:'#64748b', fontSize:'0.88rem' }}>
            Dữ liệu đơn hàng thực từ TikTok Shop Open API. Nhấn <strong>Sync</strong> để cập nhật.
          </p>
        </div>
        <div style={{ display:'flex', gap:10, flexShrink:0, flexWrap:'wrap' }}>
          <button onClick={reloadAll} disabled={loading}
            style={{ padding:'9px 16px', borderRadius:8, border:'1px solid #e5e7eb', background:'#fff', color:'#64748b', fontWeight:600, cursor:'pointer', fontSize:'0.85rem' }}>
            {loading ? '⏳' : '↺'} Tải lại
          </button>
          <button onClick={fullResync} disabled={syncing} title="Kéo lại toàn bộ từ 01/04/2026"
            style={{ padding:'9px 18px', borderRadius:8, border:'1.5px solid #ea580c', background:'#fff7ed', color:'#ea580c', fontWeight:700, fontSize:'0.88rem', cursor:syncing?'not-allowed':'pointer', opacity:syncing?0.6:1 }}>
            {syncing ? '⏳' : '📦'} Full Resync (60 ngày)
          </button>
          <button onClick={doSync} disabled={syncing}
            style={{ padding:'9px 20px', borderRadius:8, border:'none', background:syncing?'#d1d5db':'#ea580c', color:'#fff', fontWeight:700, cursor:syncing?'default':'pointer', fontSize:'0.85rem', boxShadow:syncing?'none':'0 4px 14px rgba(234,88,12,0.25)' }}>
            {syncing ? '⏳ Đang sync...' : '🔄 Sync Orders'}
          </button>
        </div>
      </div>

      {/* Connected Shops */}
      {connections.length > 0 && (
        <div style={{ display:'flex', gap:10, marginBottom:16, flexWrap:'wrap' }}>
          {connections.map(conn => {
            const expiry  = conn.access_token_expires_at ? new Date(conn.access_token_expires_at) : null;
            const expired = expiry && expiry < new Date();
            const soon    = expiry && !expired && (expiry - Date.now()) < 7*24*3600*1000;
            return (
              <div key={conn.shop_id} style={{ background:'#fff', border:`1px solid ${expired?'#fca5a5':soon?'#fde68a':'#e5e7eb'}`, borderRadius:10, padding:'9px 14px', fontSize:'0.8rem', minWidth:160 }}>
                <div style={{ fontWeight:700, color:'#111827', marginBottom:2 }}>🏪 {conn.seller_name||conn.shop_id}</div>
                {conn.seller_base_region && <div style={{ fontSize:'0.72rem', color:'#9ca3af' }}>📍 {conn.seller_base_region}</div>}
                <div style={{ fontSize:'0.72rem', marginTop:3, color:expired?'#dc2626':soon?'#b45309':'#64748b' }}>
                  {expired ? '⚠️ Token hết hạn' : soon ? `⚡ Hết hạn ${expiry.toLocaleDateString('vi-VN')} (sắp)` : `✓ ${expiry ? expiry.toLocaleDateString('vi-VN') : '—'}`}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {connections.length === 0 && !loading && (
        <div style={{ background:'#fff7ed', border:'1px solid #fed7aa', borderRadius:12, padding:'12px 16px', marginBottom:16, fontSize:'0.85rem', color:'#c2410c' }}>
          ⚠️ Chưa có TikTok Shop nào được kết nối. Authorize app qua TikTok Partner Center trước.
        </div>
      )}

      {/* Sync Result */}
      {syncResult && (
        <div style={{ marginBottom:14, padding:'12px 16px', borderRadius:10,
          background:syncResult._progress?'#eff6ff':syncResult.error?'#fef2f2':'#f0fdf4',
          border:`1px solid ${syncResult._progress?'#bfdbfe':syncResult.error?'#fca5a5':'#bbf7d0'}`,
          color:syncResult._progress?'#1d4ed8':syncResult.error?'#dc2626':'#166534', fontSize:'0.85rem' }}>
          <div style={{ fontWeight:700 }}>
            {syncResult._progress ? syncResult.message
              : syncResult.error ? `❌ ${syncResult.error}`
              : `✅ Sync thành công — ${syncResult.totalSynced?.toLocaleString('vi-VN')} đơn hàng được cập nhật`}
          </div>
          {syncResult._warn && <div style={{ marginTop:4, fontSize:'0.78rem', color:'#92400e' }}>⚠️ {syncResult._warn}</div>}
          {syncResult.results && (
            <div style={{ marginTop:8, display:'flex', flexDirection:'column', gap:3 }}>
              {syncResult.results.map((r,i) => (
                <div key={i} style={{ fontSize:'0.78rem', color:r.error?'#dc2626':'#166534' }}>
                  {r.shop}: {r.error ? `Lỗi — ${r.error}` : r.note||`${r.synced} đơn`}
                </div>
              ))}
            </div>
          )}
          {syncResult.syncedAt && <div style={{ marginTop:5, fontSize:'0.74rem', color:'#6b7280' }}>Thời gian: {new Date(syncResult.syncedAt).toLocaleString('vi-VN')}</div>}
        </div>
      )}

      {/* Stats Cards */}
      <div style={{ display:'flex', gap:12, marginBottom:18, flexWrap:'wrap' }}>
        {[
          { label:'Tổng đơn',   value:stats.total,     color:'#ea580c', icon:'🛒' },
          { label:'Hoàn thành', value:stats.completed, color:'#16a34a', icon:'✅' },
          { label:'Đang giao',  value:stats.shipping,  color:'#2563eb', icon:'🚚' },
          { label:'Đã hủy',     value:stats.cancelled, color:'#dc2626', icon:'❌' },
        ].map(s => (
          <div key={s.label} style={{ background:'#fff', border:'1px solid #e5e7eb', borderRadius:12, padding:'13px 18px', minWidth:110, flex:1, boxShadow:'0 1px 3px rgba(15,23,42,0.04)' }}>
            <div style={{ fontSize:'0.76rem', color:'#64748b', marginBottom:3 }}>{s.icon} {s.label}</div>
            <div style={{ fontSize:'1.45rem', fontWeight:800, color:s.color }}>{s.value.toLocaleString('vi-VN')}</div>
          </div>
        ))}
      </div>

      {/* Tab switcher */}
      <div style={{ display:'flex', gap:0, marginBottom:20, background:'#f8fafc', borderRadius:10, padding:4, width:'fit-content', border:'1px solid #e5e7eb' }}>
        {[
          { key:'dashboard', label:'📊 Dashboard' },
          { key:'orders',    label:'📋 Đơn hàng' },
        ].map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            style={{ padding:'8px 20px', borderRadius:8, border:'none', cursor:'pointer', fontWeight:700, fontSize:'0.85rem', fontFamily:'inherit',
              background: activeTab===t.key ? '#fff' : 'transparent',
              color: activeTab===t.key ? '#ea580c' : '#64748b',
              boxShadow: activeTab===t.key ? '0 1px 4px rgba(15,23,42,0.08)' : 'none',
              transition:'all 0.15s' }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ────────────────── DASHBOARD VIEW ────────────────── */}
      {activeTab === 'dashboard' && (
        <div>
          {/* Dashboard controls */}
          <div style={{ display:'flex', gap:10, marginBottom:18, flexWrap:'wrap', alignItems:'center' }}>
            {/* Date range */}
            <div style={{ display:'flex', gap:0, background:'#f8fafc', borderRadius:8, padding:3, border:'1px solid #e5e7eb' }}>
              {[['7d','7 ngày'],['30d','30 ngày'],['all','Tất cả']].map(([val,label]) => (
                <button key={val} onClick={() => setDashRange(val)}
                  style={{ padding:'6px 14px', borderRadius:6, border:'none', cursor:'pointer', fontWeight:600, fontSize:'0.8rem', fontFamily:'inherit',
                    background: dashRange===val ? '#ea580c' : 'transparent',
                    color: dashRange===val ? '#fff' : '#64748b', transition:'all 0.15s' }}>
                  {label}
                </button>
              ))}
            </div>
            {/* Shop filter */}
            <select value={dashShop} onChange={e => setDashShop(e.target.value)}
              style={{ padding:'7px 12px', borderRadius:8, border:'1.5px solid #e5e7eb', background:'#fff', fontSize:'0.82rem', cursor:'pointer', fontFamily:'inherit', color:dashShop?'#0f172a':'#9ca3af' }}>
              <option value="">Tất cả shop</option>
              {connections.map(c => <option key={c.shop_id} value={c.shop_id}>{c.seller_name||c.shop_id}</option>)}
            </select>
            {dashLoading && <span style={{ fontSize:'0.78rem', color:'#ea580c', fontWeight:700 }}>⟳ Đang tải...</span>}
            {dashData?.isTruncated && <span style={{ fontSize:'0.74rem', color:'#92400e', background:'#fff7ed', border:'1px solid #fed7aa', borderRadius:999, padding:'3px 10px', fontWeight:600 }}>⚠️ Hiển thị 50,000 đơn đầu</span>}
            {dashData?.emptyAmountCount > 0 && (
              <span title={`${dashData.emptyAmountCount} đơn chưa có doanh thu (UNPAID / payment chưa cập nhật). Sync lại để cập nhật.`}
                style={{ fontSize:'0.74rem', color:'#9a3412', background:'#fef2f2', border:'1px solid #fecaca', borderRadius:999, padding:'3px 10px', fontWeight:600, cursor:'default' }}>
                ⚠️ {dashData.emptyAmountCount.toLocaleString('vi-VN')} đơn thiếu doanh thu
              </span>
            )}
          </div>

          {dashData && !dashLoading && (
            <>
              {/* Dashboard summary cards */}
              <div style={{ display:'flex', gap:12, marginBottom:20, flexWrap:'wrap' }}>
                <div style={{ background:'#fff', border:'1px solid #e5e7eb', borderRadius:12, padding:'14px 18px', flex:1, minWidth:140, boxShadow:'0 1px 3px rgba(15,23,42,0.04)' }}>
                  <div style={{ fontSize:'0.74rem', color:'#64748b', marginBottom:4 }}>💰 Tổng GMV (gross)</div>
                  <div style={{ fontSize:'1.25rem', fontWeight:800, color:'#ea580c' }}>{fmtGmv(dashData.totalGmv)} VND</div>
                  <div style={{ fontSize:'0.72rem', color:'#9ca3af', marginTop:2 }}>Kể cả đơn hủy · {fmtGmv(dashData.avgDailyGmv)}/ngày</div>
                </div>
                <div style={{ background:'#fff', border:'1px solid #e5e7eb', borderRadius:12, padding:'14px 18px', flex:1, minWidth:140, boxShadow:'0 1px 3px rgba(15,23,42,0.04)' }}>
                  <div style={{ fontSize:'0.74rem', color:'#64748b', marginBottom:4 }}>🛒 Tổng đơn</div>
                  <div style={{ fontSize:'1.25rem', fontWeight:800, color:'#2563eb' }}>{dashData.totalOrders.toLocaleString('vi-VN')}</div>
                  <div style={{ fontSize:'0.72rem', color:'#9ca3af', marginTop:2 }}>{dashData.netOrders.toLocaleString('vi-VN')} net · {dashData.cancelledCount.toLocaleString('vi-VN')} hủy</div>
                </div>
                <div style={{ background:'#fff', border:'1px solid #e5e7eb', borderRadius:12, padding:'14px 18px', flex:1, minWidth:140, boxShadow:'0 1px 3px rgba(15,23,42,0.04)' }}>
                  <div style={{ fontSize:'0.74rem', color:'#64748b', marginBottom:4 }}>📉 Tỉ lệ hủy</div>
                  <div style={{ fontSize:'1.25rem', fontWeight:800, color:'#dc2626' }}>{dashData.cancelRate.toFixed(1)}%</div>
                  <div style={{ fontSize:'0.72rem', color:'#9ca3af', marginTop:2 }}>{dashData.cancelledCount.toLocaleString('vi-VN')} đơn hủy</div>
                </div>
                <div style={{ background:'#fff', border:'1px solid #e5e7eb', borderRadius:12, padding:'14px 18px', flex:1, minWidth:140, boxShadow:'0 1px 3px rgba(15,23,42,0.04)' }}>
                  <div style={{ fontSize:'0.74rem', color:'#64748b', marginBottom:4 }}>📊 AOV (net)</div>
                  <div style={{ fontSize:'1.25rem', fontWeight:800, color:'#7c3aed' }}>{fmtGmv(dashData.aov)} VND</div>
                  <div style={{ fontSize:'0.72rem', color:'#9ca3af', marginTop:2 }}>Trên {dashData.netOrders.toLocaleString('vi-VN')} đơn thành công</div>
                </div>
              </div>

              {/* GMV by shop — Bar chart */}
              <div style={{ background:'#fff', border:'1px solid #e5e7eb', borderRadius:14, padding:'20px 20px 12px', marginBottom:18, boxShadow:'0 1px 4px rgba(15,23,42,0.05)' }}>
                <div style={{ fontWeight:800, fontSize:'0.9rem', color:'#0f172a', marginBottom:16 }}>💰 GMV theo Shop</div>
                {dashData.byShop.length === 0 ? (
                  <div style={{ textAlign:'center', padding:'32px', color:'#9ca3af', fontSize:'0.85rem' }}>Không có dữ liệu</div>
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={dashData.byShop.map(s => ({ ...s, name: shortName(s.name) }))} margin={{ top:4, right:16, left:10, bottom:60 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="name" tick={{ fontSize:11, fill:'#64748b' }} angle={-30} textAnchor="end" interval={0} />
                      <YAxis tickFormatter={fmtGmv} tick={{ fontSize:11, fill:'#64748b' }} width={70} />
                      <Tooltip content={<GmvTooltip />} />
                      <Bar dataKey="gmv" name="GMV" fill="#ea580c" radius={[5,5,0,0]}
                        label={{ position:'top', formatter:v=>fmtGmv(v), fontSize:10, fill:'#374151', fontWeight:700 }} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
                {/* Shop table below chart */}
                {dashData.byShop.length > 0 && (
                  <div style={{ marginTop:14, overflowX:'auto' }}>
                    <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.8rem' }}>
                      <thead>
                        <tr style={{ background:'#f8fafc', borderBottom:'2px solid #e5e7eb' }}>
                          {['#','Shop','GMV','Đơn','AOV'].map(h => (
                            <th key={h} style={{ padding:'8px 12px', textAlign:h==='#'?'center':'left', fontWeight:700, color:'#374151', whiteSpace:'nowrap' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {dashData.byShop.map((s,i) => (
                          <tr key={s.shopId} style={{ borderBottom:'1px solid #f1f5f9', background:i%2?'#fafafa':'#fff' }}>
                            <td style={{ padding:'8px 12px', textAlign:'center', color:'#9ca3af', fontWeight:700 }}>{i+1}</td>
                            <td style={{ padding:'8px 12px', fontWeight:600, color:'#0f172a' }}>
                              <span style={{ display:'inline-block', width:10, height:10, borderRadius:'50%', background:SHOP_COLORS[i%SHOP_COLORS.length], marginRight:8, verticalAlign:'middle' }}></span>
                              {s.name}
                            </td>
                            <td style={{ padding:'8px 12px', fontWeight:700, color:'#ea580c' }}>{fmtGmv(s.gmv)} ₫</td>
                            <td style={{ padding:'8px 12px', color:'#374151' }}>{s.orders.toLocaleString('vi-VN')}</td>
                            <td style={{ padding:'8px 12px', color:'#64748b' }}>{s.orders>0 ? fmtGmv(s.gmv/s.orders) : '—'} ₫</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* GMV by day — Line chart */}
              <div style={{ background:'#fff', border:'1px solid #e5e7eb', borderRadius:14, padding:'20px 20px 12px', marginBottom:18, boxShadow:'0 1px 4px rgba(15,23,42,0.05)' }}>
                <div style={{ fontWeight:800, fontSize:'0.9rem', color:'#0f172a', marginBottom:16 }}>📈 GMV theo ngày</div>
                {dashData.byDay.length === 0 ? (
                  <div style={{ textAlign:'center', padding:'32px', color:'#9ca3af', fontSize:'0.85rem' }}>Không có dữ liệu</div>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={dashData.byDay} margin={{ top:4, right:16, left:10, bottom:8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="date" tick={{ fontSize:10, fill:'#64748b' }} interval={Math.max(1, Math.floor(dashData.byDay.length/15))} />
                      <YAxis tickFormatter={fmtGmv} tick={{ fontSize:10, fill:'#64748b' }} width={65} />
                      <Tooltip content={<GmvTooltip />} />
                      <Line type="monotone" dataKey="GMV" stroke="#ea580c" strokeWidth={2.5} dot={false} activeDot={{ r:5 }} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>

              {/* Top products */}
              {dashData.topProducts.length > 0 && (
                <div style={{ background:'#fff', border:'1px solid #e5e7eb', borderRadius:14, padding:'20px', marginBottom:18, boxShadow:'0 1px 4px rgba(15,23,42,0.05)' }}>
                  <div style={{ fontWeight:800, fontSize:'0.9rem', color:'#0f172a', marginBottom:12 }}>🏆 Top sản phẩm bán chạy
                    <span style={{ fontSize:'0.74rem', fontWeight:400, color:'#9ca3af', marginLeft:8 }}>(từ {Math.min(3000, stats.total).toLocaleString()} đơn gần nhất)</span>
                  </div>
                  <div style={{ overflowX:'auto' }}>
                    <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.82rem' }}>
                      <thead>
                        <tr style={{ background:'#f8fafc', borderBottom:'2px solid #e5e7eb' }}>
                          {['#','Sản phẩm','SL bán','Doanh thu'].map(h => (
                            <th key={h} style={{ padding:'9px 14px', textAlign:h==='#'?'center':h==='Doanh thu'?'right':'left', fontWeight:700, color:'#374151', whiteSpace:'nowrap' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {dashData.topProducts.map((p,i) => (
                          <tr key={i} style={{ borderBottom:'1px solid #f1f5f9', background:i%2?'#fafafa':'#fff' }}>
                            <td style={{ padding:'9px 14px', textAlign:'center', color:'#9ca3af', fontWeight:700 }}>
                              {i<3 ? ['🥇','🥈','🥉'][i] : i+1}
                            </td>
                            <td style={{ padding:'9px 14px', color:'#0f172a', fontWeight:i<3?700:400, maxWidth:320, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.name}</td>
                            <td style={{ padding:'9px 14px', color:'#374151' }}>{p.qty.toLocaleString('vi-VN')}</td>
                            <td style={{ padding:'9px 14px', textAlign:'right', fontWeight:700, color:'#ea580c' }}>{fmtGmv(p.revenue)} ₫</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}

          {dashLoading && !dashData && (
            <div style={{ textAlign:'center', padding:'60px', color:'#9ca3af', background:'#fff', borderRadius:14, border:'1px solid #e5e7eb' }}>
              <div style={{ fontSize:'2rem', marginBottom:8 }}>⟳</div>
              <div style={{ fontSize:'0.9rem' }}>Đang tải dữ liệu dashboard...</div>
            </div>
          )}
          {!dashLoading && !dashData && connections.length > 0 && (
            <div style={{ textAlign:'center', padding:'60px', color:'#9ca3af', background:'#fff', borderRadius:14, border:'2px dashed #e5e7eb' }}>
              <div style={{ fontSize:'2rem', marginBottom:8 }}>📊</div>
              <div style={{ fontSize:'0.9rem', fontWeight:600, marginBottom:4, color:'#374151' }}>Chưa có dữ liệu để hiển thị</div>
              <div style={{ fontSize:'0.82rem' }}>Nhấn <strong>Sync Orders</strong> để kéo data về trước.</div>
            </div>
          )}
        </div>
      )}

      {/* ────────────────── ORDERS VIEW ────────────────── */}
      {activeTab === 'orders' && (
        <div>
          {/* Filters */}
          <div style={{ display:'flex', gap:10, marginBottom:14, flexWrap:'wrap', alignItems:'center' }}>
            <input type="text" placeholder="🔍 Tìm Order ID..." value={search} onChange={e => setSearch(e.target.value)}
              style={{ padding:'9px 14px', borderRadius:8, border:'1.5px solid #e5e7eb', fontSize:'0.85rem', minWidth:220, outline:'none', fontFamily:'inherit' }} />

            {/* Shop filter */}
            <select value={shopFilter} onChange={e => { setShopFilter(e.target.value); setPage(1); }}
              style={{ padding:'9px 12px', borderRadius:8, border:'1.5px solid #e5e7eb', fontSize:'0.85rem', outline:'none', cursor:'pointer', fontFamily:'inherit', color:shopFilter?'#0f172a':'#9ca3af' }}>
              <option value="">Tất cả shop</option>
              {connections.map(c => <option key={c.shop_id} value={c.shop_id}>{c.seller_name||c.shop_id}</option>)}
            </select>

            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
              style={{ padding:'9px 12px', borderRadius:8, border:'1.5px solid #e5e7eb', fontSize:'0.85rem', outline:'none', cursor:'pointer', fontFamily:'inherit' }}>
              <option value="">Tất cả trạng thái</option>
              {ALL_STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
            </select>

            {(shopFilter || statusFilter || search) && (
              <button onClick={() => { setShopFilter(''); setStatusFilter(''); setSearch(''); setPage(1); }}
                style={{ padding:'8px 12px', borderRadius:8, background:'#fee2e2', border:'1px solid #fca5a5', color:'#dc2626', fontWeight:700, fontSize:'0.8rem', cursor:'pointer' }}>
                ✕ Xóa lọc
              </button>
            )}

            <div style={{ marginLeft:'auto', fontSize:'0.82rem', color:'#64748b', whiteSpace:'nowrap' }}>
              {totalCount > 0 ? <>Trang <strong>{page}</strong>/{totalPages} — <strong>{totalCount.toLocaleString('vi-VN')}</strong> đơn</> : 'Không có đơn nào'}
            </div>
          </div>

          {/* Table */}
          <div style={{ background:'#fff', border:'1px solid #e5e7eb', borderRadius:14, overflow:'hidden', boxShadow:'0 1px 4px rgba(15,23,42,0.05)' }}>
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.85rem' }}>
                <thead>
                  <tr style={{ background:'#f8fafc', borderBottom:'2px solid #e5e7eb' }}>
                    {['Order ID','Trạng thái','Shop','Ngày tạo','Tổng tiền','Sản phẩm'].map(h => (
                      <th key={h} style={{ padding:'11px 16px', textAlign:h==='Tổng tiền'?'right':'left', fontWeight:700, color:'#374151', whiteSpace:'nowrap', fontSize:'0.82rem' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading && <tr><td colSpan={6} style={{ padding:40, textAlign:'center', color:'#9ca3af' }}>⏳ Đang tải...</td></tr>}
                  {!loading && orders.length === 0 && (
                    <tr><td colSpan={6} style={{ padding:48, textAlign:'center', color:'#9ca3af' }}>
                      {stats.total === 0
                        ? <div><div style={{ fontSize:'2rem', marginBottom:8 }}>📭</div><div style={{ fontWeight:600, marginBottom:4 }}>Chưa có đơn hàng</div><div style={{ fontSize:'0.82rem' }}>Nhấn <strong>Sync Orders</strong> để lấy dữ liệu.</div></div>
                        : 'Không tìm thấy đơn phù hợp với bộ lọc.'}
                    </td></tr>
                  )}
                  {!loading && orders.map((order, idx) => {
                    const sc = getStatusStyle(order.order_status);
                    const isExp = expanded === order.id;
                    const items = Array.isArray(order.line_items) ? order.line_items : [];
                    return (
                      <React.Fragment key={order.id}>
                        <tr onClick={() => setExpanded(isExp ? null : order.id)}
                          style={{ borderBottom:'1px solid #f1f5f9', background:isExp?'#fff7ed':idx%2===0?'#fff':'#fafafa', cursor:'pointer', transition:'background 0.15s' }}>
                          <td style={{ padding:'12px 16px', fontFamily:'ui-monospace,monospace', fontWeight:700, color:'#111827', whiteSpace:'nowrap', fontSize:'0.82rem' }}>{order.id}</td>
                          <td style={{ padding:'12px 16px' }}>
                            <span style={{ padding:'3px 10px', borderRadius:20, fontSize:'0.75rem', fontWeight:700, background:sc.bg, color:sc.text }}>
                              {STATUS_LABELS[order.order_status]||order.order_status||'—'}
                            </span>
                          </td>
                          <td style={{ padding:'12px 16px', color:'#64748b', fontSize:'0.8rem' }}>
                            {connections.find(c=>c.shop_id===order.shop_id)?.seller_name||order.shop_id||'—'}
                          </td>
                          <td style={{ padding:'12px 16px', color:'#64748b', fontSize:'0.8rem', whiteSpace:'nowrap' }}>{formatDate(order.create_time)}</td>
                          <td style={{ padding:'12px 16px', fontWeight:700, color:'#111827', textAlign:'right', whiteSpace:'nowrap' }}>{formatAmount(order.total_amount, order.currency)}</td>
                          <td style={{ padding:'12px 16px', color:'#64748b', fontSize:'0.78rem', maxWidth:220 }}>
                            {items.length === 0 ? <span style={{ color:'#d1d5db' }}>—</span>
                              : items.slice(0,2).map((item,i) => <div key={i} style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>• {item.product_name||item.sku_name||'SP'} × {item.quantity||1}</div>)}
                            {items.length > 2 && <div style={{ color:'#9ca3af', fontSize:'0.72rem' }}>+{items.length-2} sản phẩm khác</div>}
                          </td>
                        </tr>
                        {isExp && (
                          <tr style={{ background:'#fffbf5' }}>
                            <td colSpan={6} style={{ padding:'0 16px 14px' }}>
                              <div style={{ background:'#fff7ed', border:'1px solid #fed7aa', borderRadius:10, padding:'12px 16px' }}>
                                <div style={{ fontWeight:700, fontSize:'0.8rem', color:'#c2410c', marginBottom:10 }}>🛍️ Chi tiết đơn {order.id}</div>
                                {items.length === 0 ? <div style={{ color:'#9ca3af', fontSize:'0.82rem' }}>Không có thông tin sản phẩm</div> : (
                                  <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                                    {items.map((item,i) => (
                                      <div key={i} style={{ display:'flex', gap:12, fontSize:'0.82rem', color:'#374151' }}>
                                        <span style={{ fontWeight:600, minWidth:24 }}>{i+1}.</span>
                                        <span style={{ flex:1 }}>{item.product_name||item.sku_name||'SP'}</span>
                                        {item.sku_id && <span style={{ color:'#9ca3af', fontSize:'0.75rem' }}>SKU: {item.sku_id}</span>}
                                        <span style={{ fontWeight:700 }}>× {item.quantity||1}</span>
                                        {item.sale_price && <span style={{ color:'#ea580c', fontWeight:700 }}>{formatAmount(item.sale_price, item.currency)}</span>}
                                      </div>
                                    ))}
                                  </div>
                                )}
                                <div style={{ marginTop:10, paddingTop:10, borderTop:'1px solid #fed7aa', display:'flex', gap:20, fontSize:'0.78rem', color:'#92400e', flexWrap:'wrap' }}>
                                  <span>🕐 Tạo: {formatDate(order.create_time)}</span>
                                  <span>🔄 Cập nhật: {formatDate(order.update_time)}</span>
                                  <span>💰 Tổng: <strong>{formatAmount(order.total_amount, order.currency)}</strong></span>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination page={page} totalPages={totalPages} onChange={p => { setPage(p); setExpanded(null); }} />
          </div>

          <div style={{ marginTop:12, fontSize:'0.74rem', color:'#9ca3af', textAlign:'right' }}>
            Dữ liệu lưu trong Supabase bảng <code>tiktok_shop_orders</code>.
          </div>
        </div>
      )}
    </div>
  );
};

export default TikTokOrdersTab;
