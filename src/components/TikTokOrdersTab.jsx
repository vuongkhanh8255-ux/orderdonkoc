// src/components/TikTokOrdersTab.jsx
// Hiển thị đơn hàng thực tế từ TikTok Shop API
// Dữ liệu được sync qua /api/tiktok-shop/sync-orders và lưu vào Supabase

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../supabaseClient';

// ── Mapping trạng thái ────────────────────────────────────────────────────────
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
  COMPLETED:            { bg: '#dcfce7', text: '#15803d' },
  DELIVERED:            { bg: '#dbeafe', text: '#1d4ed8' },
  IN_TRANSIT:           { bg: '#ede9fe', text: '#6d28d9' },
  AWAITING_SHIPMENT:    { bg: '#fff7ed', text: '#c2410c' },
  AWAITING_COLLECTION:  { bg: '#fef9c3', text: '#854d0e' },
  PARTIALLY_SHIPPING:   { bg: '#e0f2fe', text: '#0369a1' },
  CANCELLED:            { bg: '#fee2e2', text: '#b91c1c' },
  ON_HOLD:              { bg: '#f1f5f9', text: '#475569' },
  UNPAID:               { bg: '#fef3c7', text: '#92400e' },
};

const getStatusStyle = (status) =>
  STATUS_COLOR[status] || { bg: '#f1f5f9', text: '#475569' };

// ── Helpers ───────────────────────────────────────────────────────────────────
const formatDate = (epochSeconds) => {
  if (!epochSeconds) return '—';
  return new Date(Number(epochSeconds) * 1000).toLocaleString('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
};

const formatAmount = (amount, currency) => {
  if (amount === null || amount === undefined || amount === '') return '—';
  const num = Number(amount);
  if (!Number.isFinite(num)) return String(amount);
  return `${num.toLocaleString('vi-VN')} ${currency || ''}`.trim();
};

const ALL_STATUSES = Object.keys(STATUS_LABELS);
const PAGE_SIZE = 50;

// ── Pagination bar ────────────────────────────────────────────────────────────
const Pagination = ({ page, totalPages, onChange }) => {
  if (totalPages <= 1) return null;

  const pages = [];
  const delta = 2;
  const left  = page - delta;
  const right = page + delta;

  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= left && i <= right)) {
      pages.push(i);
    } else if (pages[pages.length - 1] !== '...') {
      pages.push('...');
    }
  }

  const btn = (label, target, disabled = false, active = false) => (
    <button
      key={label}
      onClick={() => !disabled && target && onChange(target)}
      disabled={disabled}
      style={{
        padding: '6px 11px', borderRadius: 7, border: '1.5px solid',
        borderColor: active ? '#ea580c' : '#e5e7eb',
        background: active ? '#ea580c' : '#fff',
        color: active ? '#fff' : disabled ? '#d1d5db' : '#374151',
        fontWeight: active ? 700 : 500, fontSize: '0.82rem',
        cursor: disabled ? 'default' : 'pointer',
        minWidth: 34, fontFamily: 'inherit',
      }}
    >
      {label}
    </button>
  );

  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', padding: '14px 16px' }}>
      {btn('‹', page - 1, page === 1)}
      {pages.map((p, i) =>
        p === '...'
          ? <span key={`dots-${i}`} style={{ padding: '6px 4px', color: '#9ca3af', fontSize: '0.82rem' }}>…</span>
          : btn(p, p, false, p === page)
      )}
      {btn('›', page + 1, page === totalPages)}
    </div>
  );
};

// ── Component ─────────────────────────────────────────────────────────────────
const TikTokOrdersTab = () => {
  const [orders,       setOrders]       = useState([]);
  const [connections,  setConnections]  = useState([]);
  const [loading,      setLoading]      = useState(false);
  const [syncing,      setSyncing]      = useState(false);
  const [syncResult,   setSyncResult]   = useState(null);
  const [search,       setSearch]       = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [expanded,     setExpanded]     = useState(null);
  const [page,         setPage]         = useState(1);
  const [totalCount,   setTotalCount]   = useState(0);
  const [stats,        setStats]        = useState({ total: 0, completed: 0, shipping: 0, cancelled: 0 });

  const searchDebounce = useRef(null);
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Debounce search input 350ms
  useEffect(() => {
    clearTimeout(searchDebounce.current);
    searchDebounce.current = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 350);
    return () => clearTimeout(searchDebounce.current);
  }, [search]);

  // Reset page khi đổi filter
  useEffect(() => { setPage(1); }, [statusFilter]);

  // ── Fetch stats (4 count queries song song) ───────────────────────────────
  const fetchStats = useCallback(async () => {
    const [all, completed, shipping, cancelled] = await Promise.all([
      supabase.from('tiktok_shop_orders').select('*', { count: 'exact', head: true }),
      supabase.from('tiktok_shop_orders').select('*', { count: 'exact', head: true }).eq('order_status', 'COMPLETED'),
      supabase.from('tiktok_shop_orders').select('*', { count: 'exact', head: true })
        .in('order_status', ['IN_TRANSIT', 'AWAITING_SHIPMENT', 'AWAITING_COLLECTION', 'PARTIALLY_SHIPPING']),
      supabase.from('tiktok_shop_orders').select('*', { count: 'exact', head: true }).eq('order_status', 'CANCELLED'),
    ]);
    setStats({
      total:     all.count     || 0,
      completed: completed.count || 0,
      shipping:  shipping.count  || 0,
      cancelled: cancelled.count || 0,
    });
  }, []);

  // ── Fetch connections ─────────────────────────────────────────────────────
  const fetchConnections = useCallback(async () => {
    const { data, error } = await supabase
      .from('tiktok_shop_connections')
      .select('shop_id,seller_name,seller_base_region,access_token_expires_at');
    if (error) { console.error('fetchConnections error:', error); return; }
    if (data) setConnections(data);
  }, []);

  // ── Fetch 1 page of orders (server-side filter) ───────────────────────────
  const fetchOrders = useCallback(async (pg, searchTerm, statusF) => {
    setLoading(true);
    const from = (pg - 1) * PAGE_SIZE;
    const to   = from + PAGE_SIZE - 1;

    let q = supabase
      .from('tiktok_shop_orders')
      .select('id,shop_id,open_id,order_status,create_time,update_time,total_amount,currency,line_items,synced_at', { count: 'exact' })
      .order('create_time', { ascending: false })
      .range(from, to);

    if (statusF)            q = q.eq('order_status', statusF);
    if (searchTerm.trim())  q = q.or(`id.ilike.%${searchTerm.trim()}%,shop_id.ilike.%${searchTerm.trim()}%`);

    const { data, error, count } = await q;
    if (error) { console.error('fetchOrders error:', error); }
    else {
      setOrders(data || []);
      setTotalCount(count || 0);
    }
    setLoading(false);
  }, []);

  // ── Initial load ──────────────────────────────────────────────────────────
  useEffect(() => {
    fetchConnections();
    fetchStats();
  }, [fetchConnections, fetchStats]);

  // ── Re-fetch orders when page / filter / search changes ───────────────────
  useEffect(() => {
    fetchOrders(page, debouncedSearch, statusFilter);
  }, [page, debouncedSearch, statusFilter, fetchOrders]);

  // ── Reload all ───────────────────────────────────────────────────────────
  const reloadAll = () => {
    fetchConnections();
    fetchStats();
    fetchOrders(page, debouncedSearch, statusFilter);
  };

  // ── Sync orders from TikTok API ───────────────────────────────────────────
  const doSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res  = await fetch('/api/tiktok-shop/sync-orders', { method: 'POST' });
      const text = await res.text();
      let data;
      try { data = JSON.parse(text); }
      catch {
        data = res.status === 504 || text.includes('timeout')
          ? { error: '⏱ Timeout — thử lại sau.' }
          : { error: `Server lỗi (${res.status}): ${text.slice(0, 120)}` };
      }
      setSyncResult(data);
      if (data.success) { fetchStats(); fetchOrders(1, debouncedSearch, statusFilter); setPage(1); }
    } catch (err) {
      setSyncResult({ error: err.message });
    }
    setSyncing(false);
  };

  // Full resync: gọi từng window một để tránh timeout 300s
  const fullResync = async () => {
    setSyncing(true);
    setSyncResult(null);

    const FROM_TS    = 1775001600; // 01/04/2026 UTC
    const WINDOW_SEC = 15 * 24 * 3600;
    const nowSec     = Math.floor(Date.now() / 1000);
    const numWindows = Math.ceil((nowSec - FROM_TS) / WINDOW_SEC);

    let totalSynced = 0;
    const allResults = [];
    let lastSyncedAt = null;
    let hadError = false;

    for (let i = 0; i < numWindows; i++) {
      setSyncResult({ _progress: true, message: `⏳ Đang kéo cửa sổ ${i + 1} / ${numWindows}...` });
      try {
        const res  = await fetch(`/api/tiktok-shop/sync-orders?full=true&window_index=${i}`, { method: 'POST' });
        const text = await res.text();
        let data;
        try { data = JSON.parse(text); }
        catch {
          data = res.status === 504 || text.includes('timeout')
            ? { error: `⏱ Timeout ở cửa sổ ${i + 1}/${numWindows} — thử lại.` }
            : { error: `Server lỗi (${res.status}): ${text.slice(0, 120)}` };
        }
        if (data.error) { setSyncResult({ error: data.error }); hadError = true; break; }
        totalSynced  += data.totalSynced || 0;
        if (data.results)  allResults.push(...data.results);
        if (data.syncedAt) lastSyncedAt = data.syncedAt;
      } catch (err) {
        setSyncResult({ error: err.message }); hadError = true; break;
      }
    }

    if (!hadError) {
      setSyncResult({ success: true, totalSynced, results: allResults, syncedAt: lastSyncedAt });
      fetchStats();
      fetchOrders(1, debouncedSearch, statusFilter);
      setPage(1);
    }
    setSyncing(false);
  };

  const syncOrders = () => doSync();
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: "'Outfit', sans-serif", color: '#111827' }}>

      {/* ── Page Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#ea580c', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 4 }}>TikTok Shop</div>
          <h1 style={{ margin: 0, fontSize: '1.55rem', fontWeight: 800 }}>Đơn hàng TikTok Shop</h1>
          <p style={{ margin: '5px 0 0', color: '#64748b', fontSize: '0.88rem', lineHeight: 1.5 }}>
            Dữ liệu đơn hàng thực từ TikTok Shop Open API. Nhấn <strong>Sync</strong> để cập nhật mới nhất.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
          <button onClick={reloadAll} disabled={loading}
            style={{ padding: '9px 16px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', color: '#64748b', fontWeight: 600, cursor: 'pointer', fontSize: '0.85rem' }}>
            {loading ? '⏳' : '↺'} Tải lại
          </button>
          <button onClick={fullResync} disabled={syncing}
            title="Kéo lại toàn bộ từ 01/04/2026 — dùng khi cần lấy dữ liệu lịch sử"
            style={{
              padding: '9px 18px', borderRadius: 8, border: '1.5px solid #ea580c',
              background: '#fff7ed', color: '#ea580c', fontWeight: 700,
              fontSize: '0.88rem', cursor: syncing ? 'not-allowed' : 'pointer',
              opacity: syncing ? 0.6 : 1,
            }}>
            {syncing ? '⏳' : '📦'} Full Resync (60 ngày)
          </button>
          <button onClick={syncOrders} disabled={syncing}
            style={{
              padding: '9px 20px', borderRadius: 8, border: 'none',
              background: syncing ? '#d1d5db' : '#ea580c',
              color: '#fff', fontWeight: 700, cursor: syncing ? 'default' : 'pointer',
              fontSize: '0.85rem', boxShadow: syncing ? 'none' : '0 4px 14px rgba(234,88,12,0.25)',
              transition: 'all 0.2s',
            }}>
            {syncing ? '⏳ Đang sync...' : '🔄 Sync Orders'}
          </button>
        </div>
      </div>

      {/* ── Connected Shops ── */}
      {connections.length > 0 && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          {connections.map(conn => {
            const expiry  = conn.access_token_expires_at ? new Date(conn.access_token_expires_at) : null;
            const expired = expiry && expiry < new Date();
            const soonExp = expiry && !expired && (expiry - Date.now()) < 7 * 24 * 3600 * 1000;
            return (
              <div key={conn.shop_id} style={{
                background: '#fff',
                border: `1px solid ${expired ? '#fca5a5' : soonExp ? '#fde68a' : '#e5e7eb'}`,
                borderRadius: 10, padding: '10px 16px', fontSize: '0.82rem', minWidth: 180,
              }}>
                <div style={{ fontWeight: 700, color: '#111827', marginBottom: 2 }}>🏪 {conn.seller_name || conn.shop_id}</div>
                {conn.seller_base_region && (
                  <div style={{ fontSize: '0.72rem', color: '#9ca3af' }}>📍 {conn.seller_base_region}</div>
                )}
                <div style={{ fontSize: '0.72rem', marginTop: 3,
                  color: expired ? '#dc2626' : soonExp ? '#b45309' : '#64748b' }}>
                  {expired
                    ? '⚠️ Token đã hết hạn'
                    : soonExp
                      ? `⚡ Hết hạn ${expiry.toLocaleDateString('vi-VN')} (sắp hết)`
                      : `Token hết hạn: ${expiry ? expiry.toLocaleDateString('vi-VN') : '—'}`}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {connections.length === 0 && !loading && (
        <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 12, padding: '14px 18px', marginBottom: 20, fontSize: '0.88rem', color: '#c2410c' }}>
          ⚠️ Chưa có TikTok Shop nào được kết nối. Hãy authorize app qua TikTok Partner Center trước, rồi nhấn <strong>Sync Orders</strong>.
        </div>
      )}

      {/* ── Sync Result ── */}
      {syncResult && (
        <div style={{
          marginBottom: 16, padding: '12px 16px', borderRadius: 10,
          background: syncResult._progress ? '#eff6ff' : syncResult.error ? '#fef2f2' : '#f0fdf4',
          border: `1px solid ${syncResult._progress ? '#bfdbfe' : syncResult.error ? '#fca5a5' : '#bbf7d0'}`,
          color: syncResult._progress ? '#1d4ed8' : syncResult.error ? '#dc2626' : '#166534',
          fontSize: '0.85rem',
        }}>
          <div style={{ fontWeight: 700 }}>
            {syncResult._progress
              ? syncResult.message
              : syncResult.error
                ? `❌ Lỗi khi sync: ${syncResult.error}`
                : `✅ Sync thành công — ${syncResult.totalSynced} đơn hàng được cập nhật`}
          </div>
          {syncResult.results && (
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {syncResult.results.map((r, i) => (
                <div key={i} style={{ fontSize: '0.8rem', color: r.error ? '#dc2626' : '#166534' }}>
                  {r.shop}: {r.error ? `Lỗi — ${r.error}` : r.note || `${r.synced} đơn`}
                </div>
              ))}
            </div>
          )}
          {syncResult.syncedAt && (
            <div style={{ marginTop: 6, fontSize: '0.75rem', color: '#6b7280' }}>
              Thời gian sync: {new Date(syncResult.syncedAt).toLocaleString('vi-VN')}
            </div>
          )}
        </div>
      )}

      {/* ── Stats Cards ── */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        {[
          { label: 'Tổng đơn',   value: stats.total,     color: '#ea580c', icon: '🛒' },
          { label: 'Hoàn thành', value: stats.completed, color: '#16a34a', icon: '✅' },
          { label: 'Đang giao',  value: stats.shipping,  color: '#2563eb', icon: '🚚' },
          { label: 'Đã hủy',    value: stats.cancelled, color: '#dc2626', icon: '❌' },
        ].map(stat => (
          <div key={stat.label} style={{
            background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12,
            padding: '14px 20px', minWidth: 110, flex: 1,
            boxShadow: '0 1px 3px rgba(15,23,42,0.04)',
          }}>
            <div style={{ fontSize: '0.78rem', color: '#64748b', marginBottom: 4 }}>{stat.icon} {stat.label}</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: stat.color }}>
              {stat.value.toLocaleString('vi-VN')}
            </div>
          </div>
        ))}
      </div>

      {/* ── Filters ── */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="text"
          placeholder="🔍 Tìm Order ID..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            padding: '9px 14px', borderRadius: 8, border: '1.5px solid #e5e7eb',
            fontSize: '0.85rem', minWidth: 240, outline: 'none', fontFamily: 'inherit',
          }}
        />
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          style={{
            padding: '9px 14px', borderRadius: 8, border: '1.5px solid #e5e7eb',
            fontSize: '0.85rem', outline: 'none', cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          <option value="">Tất cả trạng thái</option>
          {ALL_STATUSES.map(s => (
            <option key={s} value={s}>{STATUS_LABELS[s]}</option>
          ))}
        </select>
        <div style={{ marginLeft: 'auto', fontSize: '0.82rem', color: '#64748b', whiteSpace: 'nowrap' }}>
          {totalCount > 0
            ? <>Trang <strong>{page}</strong>/{totalPages} — <strong>{totalCount.toLocaleString('vi-VN')}</strong> đơn</>
            : 'Không có đơn nào'}
        </div>
      </div>

      {/* ── Orders Table ── */}
      <div style={{
        background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14,
        overflow: 'hidden', boxShadow: '0 1px 4px rgba(15,23,42,0.05)',
      }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e5e7eb' }}>
                {['Order ID', 'Trạng thái', 'Shop', 'Ngày tạo', 'Tổng tiền', 'Sản phẩm'].map(h => (
                  <th key={h} style={{ padding: '11px 16px', textAlign: h === 'Tổng tiền' ? 'right' : 'left', fontWeight: 700, color: '#374151', whiteSpace: 'nowrap', fontSize: '0.82rem' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={6} style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>⏳ Đang tải...</td>
                </tr>
              )}
              {!loading && orders.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ padding: 48, textAlign: 'center', color: '#9ca3af' }}>
                    {stats.total === 0
                      ? <div>
                          <div style={{ fontSize: '2rem', marginBottom: 8 }}>📭</div>
                          <div style={{ fontWeight: 600, marginBottom: 4 }}>Chưa có đơn hàng nào</div>
                          <div style={{ fontSize: '0.82rem' }}>Nhấn <strong>Sync Orders</strong> để lấy dữ liệu từ TikTok Shop.</div>
                        </div>
                      : 'Không tìm thấy đơn phù hợp với bộ lọc.'
                    }
                  </td>
                </tr>
              )}
              {!loading && orders.map((order, idx) => {
                const sc = getStatusStyle(order.order_status);
                const isExpanded = expanded === order.id;
                const items = Array.isArray(order.line_items) ? order.line_items : [];
                return (
                  <>
                    <tr
                      key={order.id}
                      onClick={() => setExpanded(isExpanded ? null : order.id)}
                      style={{
                        borderBottom: '1px solid #f1f5f9',
                        background: isExpanded ? '#fff7ed' : idx % 2 === 0 ? '#fff' : '#fafafa',
                        cursor: 'pointer', transition: 'background 0.15s',
                      }}
                    >
                      <td style={{ padding: '12px 16px', fontFamily: 'ui-monospace, monospace', fontWeight: 700, color: '#111827', whiteSpace: 'nowrap', fontSize: '0.82rem' }}>
                        {order.id}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: '0.75rem', fontWeight: 700, background: sc.bg, color: sc.text }}>
                          {STATUS_LABELS[order.order_status] || order.order_status || '—'}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', color: '#64748b', fontSize: '0.8rem' }}>
                        {connections.find(c => c.shop_id === order.shop_id)?.seller_name || order.shop_id || '—'}
                      </td>
                      <td style={{ padding: '12px 16px', color: '#64748b', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                        {formatDate(order.create_time)}
                      </td>
                      <td style={{ padding: '12px 16px', fontWeight: 700, color: '#111827', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {formatAmount(order.total_amount, order.currency)}
                      </td>
                      <td style={{ padding: '12px 16px', color: '#64748b', fontSize: '0.78rem', maxWidth: 220 }}>
                        {items.length === 0
                          ? <span style={{ color: '#d1d5db' }}>—</span>
                          : items.slice(0, 2).map((item, i) => (
                              <div key={i} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                • {item.product_name || item.sku_name || 'Sản phẩm'} × {item.quantity || 1}
                              </div>
                            ))
                        }
                        {items.length > 2 && <div style={{ color: '#9ca3af', fontSize: '0.72rem' }}>+{items.length - 2} sản phẩm khác</div>}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr key={`${order.id}-detail`} style={{ background: '#fffbf5' }}>
                        <td colSpan={6} style={{ padding: '0 16px 14px 16px' }}>
                          <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 10, padding: '12px 16px' }}>
                            <div style={{ fontWeight: 700, fontSize: '0.8rem', color: '#c2410c', marginBottom: 10 }}>
                              🛍️ Chi tiết đơn hàng {order.id}
                            </div>
                            {items.length === 0 ? (
                              <div style={{ color: '#9ca3af', fontSize: '0.82rem' }}>Không có thông tin sản phẩm</div>
                            ) : (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                {items.map((item, i) => (
                                  <div key={i} style={{ display: 'flex', gap: 12, fontSize: '0.82rem', color: '#374151' }}>
                                    <span style={{ fontWeight: 600, minWidth: 24 }}>{i + 1}.</span>
                                    <span style={{ flex: 1 }}>{item.product_name || item.sku_name || 'Sản phẩm'}</span>
                                    {item.sku_id && <span style={{ color: '#9ca3af', fontSize: '0.75rem' }}>SKU: {item.sku_id}</span>}
                                    <span style={{ fontWeight: 700 }}>× {item.quantity || 1}</span>
                                    {item.sale_price && (
                                      <span style={{ color: '#ea580c', fontWeight: 700 }}>
                                        {formatAmount(item.sale_price, item.currency)}
                                      </span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                            <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #fed7aa', display: 'flex', gap: 20, fontSize: '0.78rem', color: '#92400e' }}>
                              <span>🕐 Tạo: {formatDate(order.create_time)}</span>
                              <span>🔄 Cập nhật: {formatDate(order.update_time)}</span>
                              <span>💰 Tổng: <strong>{formatAmount(order.total_amount, order.currency)}</strong></span>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* ── Pagination ── */}
        <Pagination page={page} totalPages={totalPages} onChange={p => { setPage(p); setExpanded(null); }} />
      </div>

      <div style={{ marginTop: 14, fontSize: '0.75rem', color: '#9ca3af', textAlign: 'right' }}>
        Order ID từ TikTok Shop thường bắt đầu bằng 57 hoặc 58. Dữ liệu được lưu trong Supabase bảng <code>tiktok_shop_orders</code>.
      </div>
    </div>
  );
};

export default TikTokOrdersTab;
