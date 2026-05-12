// src/components/TikTokOrdersTab.jsx
// Hiển thị đơn hàng thực tế từ TikTok Shop API
// Dữ liệu được sync qua /api/tiktok-shop/sync-orders và lưu vào Supabase

import { useState, useEffect, useCallback } from 'react';
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

// ── Component ─────────────────────────────────────────────────────────────────
const TikTokOrdersTab = () => {
  const [orders,      setOrders]      = useState([]);
  const [connections, setConnections] = useState([]);
  const [loading,     setLoading]     = useState(false);
  const [syncing,     setSyncing]     = useState(false);
  const [syncResult,  setSyncResult]  = useState(null);
  const [search,      setSearch]      = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [expanded,    setExpanded]    = useState(null); // order id

  // ── Fetch from Supabase ───────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // Supabase mặc định giới hạn 1000 rows/query → dùng range pagination
      const PAGE = 1000;
      let allOrders = [];
      let from = 0;
      while (true) {
        const { data, error } = await supabase
          .from('tiktok_shop_orders')
          .select('id,shop_id,open_id,order_status,create_time,update_time,total_amount,currency,line_items,synced_at')
          .order('create_time', { ascending: false })
          .range(from, from + PAGE - 1);
        if (error) { console.error('fetchData page error:', error); break; }
        if (!data?.length) break;
        allOrders = [...allOrders, ...data];
        if (data.length < PAGE) break; // last page
        from += PAGE;
      }
      setOrders(allOrders);

      const connRes = await supabase
        .from('tiktok_shop_connections')
        .select('shop_id,seller_name,seller_base_region,access_token_expires_at')
        .order('updated_at', { ascending: false });
      if (connRes.data) setConnections(connRes.data);
    } catch (err) {
      console.error('TikTokOrdersTab fetchData error:', err);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Sync orders from TikTok API ───────────────────────────────────────────
  const doSync = async (full = false) => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const url = full ? '/api/tiktok-shop/sync-orders?full=true' : '/api/tiktok-shop/sync-orders';
      const res  = await fetch(url, { method: 'POST' });
      const text = await res.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        const preview = text.slice(0, 120);
        if (res.status === 504 || text.includes('FUNCTION_INVOCATION_TIMEOUT') || text.includes('timeout')) {
          data = { error: '⏱ Timeout — bấm Full Resync thêm vài lần nữa để kéo hết dữ liệu cũ.' };
        } else {
          data = { error: `Server lỗi (${res.status}): ${preview}` };
        }
      }
      setSyncResult(data);
      if (data.success) fetchData();
    } catch (err) {
      setSyncResult({ error: err.message });
    }
    setSyncing(false);
  };

  const syncOrders     = () => doSync(false);
  const fullResync     = () => doSync(true);

  // ── Filtered rows ─────────────────────────────────────────────────────────
  const filtered = orders.filter(o => {
    const term = search.trim().toLowerCase();
    const matchSearch = !term
      || (o.id || '').toLowerCase().includes(term)
      || (o.shop_id || '').toLowerCase().includes(term);
    const matchStatus = !statusFilter || o.order_status === statusFilter;
    return matchSearch && matchStatus;
  });

  // ── Stats ─────────────────────────────────────────────────────────────────
  const stats = {
    total:     orders.length,
    completed: orders.filter(o => o.order_status === 'COMPLETED').length,
    shipping:  orders.filter(o => ['IN_TRANSIT','AWAITING_SHIPMENT','AWAITING_COLLECTION','PARTIALLY_SHIPPING'].includes(o.order_status)).length,
    cancelled: orders.filter(o => o.order_status === 'CANCELLED').length,
  };

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
          <button onClick={fetchData} disabled={loading}
            style={{ padding: '9px 16px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', color: '#64748b', fontWeight: 600, cursor: 'pointer', fontSize: '0.85rem' }}>
            {loading ? '⏳' : '↺'} Tải lại
          </button>
          <button onClick={fullResync} disabled={syncing}
            title="Kéo lại toàn bộ 60 ngày — dùng khi cần lấy dữ liệu lịch sử"
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
            const expiry = conn.access_token_expires_at ? new Date(conn.access_token_expires_at) : null;
            const expired = expiry && expiry < new Date();
            return (
              <div key={conn.shop_id} style={{
                background: '#fff', border: `1px solid ${expired ? '#fca5a5' : '#e5e7eb'}`,
                borderRadius: 10, padding: '10px 16px', fontSize: '0.82rem', minWidth: 180,
              }}>
                <div style={{ fontWeight: 700, color: '#111827', marginBottom: 2 }}>🏪 {conn.seller_name || conn.shop_id}</div>
                {conn.seller_base_region && (
                  <div style={{ fontSize: '0.72rem', color: '#9ca3af' }}>📍 {conn.seller_base_region}</div>
                )}
                <div style={{ fontSize: '0.72rem', color: expired ? '#dc2626' : '#64748b', marginTop: 3 }}>
                  {expired ? '⚠️ Token đã hết hạn' : `Token hết hạn: ${expiry ? expiry.toLocaleDateString('vi-VN') : '—'}`}
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
          background: syncResult.error ? '#fef2f2' : '#f0fdf4',
          border: `1px solid ${syncResult.error ? '#fca5a5' : '#bbf7d0'}`,
          color: syncResult.error ? '#dc2626' : '#166534',
          fontSize: '0.85rem',
        }}>
          <div style={{ fontWeight: 700 }}>
            {syncResult.error
              ? `❌ Lỗi khi sync: ${syncResult.error}`
              : `✅ Sync thành công — ${syncResult.totalSynced} đơn hàng được cập nhật`}
          </div>
          {syncResult.results && (
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {syncResult.results.map((r, i) => (
                <div key={i}>
                  <div style={{ fontSize: '0.8rem', color: r.error ? '#dc2626' : '#166534' }}>
                    {r.shop}: {r.error ? `Lỗi — ${r.error}` : r.note || `${r.synced} đơn`}
                  </div>
                  {r.first_window_debug && (
                    <div style={{ marginTop: 4, padding: '8px 10px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: '0.72rem', fontFamily: 'monospace', color: '#374151', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                      <div><b>API code:</b> {r.first_window_debug.code} | <b>message:</b> {r.first_window_debug.message}</div>
                      <div><b>data keys:</b> {(r.first_window_debug.data_keys || []).join(', ') || '(none)'}</div>
                      <div style={{ marginTop: 4 }}><b>raw:</b> {r.first_window_debug.raw}</div>
                    </div>
                  )}
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
      {orders.length > 0 && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          {[
            { label: 'Tổng đơn',     value: stats.total,     color: '#ea580c', icon: '🛒' },
            { label: 'Hoàn thành',   value: stats.completed, color: '#16a34a', icon: '✅' },
            { label: 'Đang giao',    value: stats.shipping,  color: '#2563eb', icon: '🚚' },
            { label: 'Đã hủy',      value: stats.cancelled, color: '#dc2626', icon: '❌' },
          ].map(stat => (
            <div key={stat.label} style={{
              background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12,
              padding: '14px 20px', minWidth: 110, flex: 1,
              boxShadow: '0 1px 3px rgba(15,23,42,0.04)',
            }}>
              <div style={{ fontSize: '0.78rem', color: '#64748b', marginBottom: 4 }}>{stat.icon} {stat.label}</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: stat.color }}>{stat.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Filters ── */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="text"
          placeholder="🔍 Tìm Order ID, Shop ID..."
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
          Hiển thị <strong>{filtered.length}</strong> / {orders.length} đơn
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
                  <td colSpan={6} style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>⏳ Đang tải dữ liệu...</td>
                </tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ padding: 48, textAlign: 'center', color: '#9ca3af' }}>
                    {orders.length === 0
                      ? <div>
                          <div style={{ fontSize: '2rem', marginBottom: 8 }}>📭</div>
                          <div style={{ fontWeight: 600, marginBottom: 4 }}>Chưa có đơn hàng nào</div>
                          <div style={{ fontSize: '0.82rem' }}>Nhấn <strong>Sync Orders</strong> để lấy dữ liệu từ TikTok Shop API.</div>
                        </div>
                      : 'Không tìm thấy đơn phù hợp với bộ lọc.'
                    }
                  </td>
                </tr>
              )}
              {!loading && filtered.map((order, idx) => {
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
                        cursor: 'pointer',
                        transition: 'background 0.15s',
                      }}
                    >
                      {/* Order ID */}
                      <td style={{ padding: '12px 16px', fontFamily: 'ui-monospace, monospace', fontWeight: 700, color: '#111827', whiteSpace: 'nowrap', fontSize: '0.82rem' }}>
                        {order.id}
                      </td>
                      {/* Status */}
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{
                          padding: '3px 10px', borderRadius: 20, fontSize: '0.75rem', fontWeight: 700,
                          background: sc.bg, color: sc.text,
                        }}>
                          {STATUS_LABELS[order.order_status] || order.order_status || '—'}
                        </span>
                      </td>
                      {/* Shop */}
                      <td style={{ padding: '12px 16px', color: '#64748b', fontSize: '0.8rem' }}>
                        {connections.find(c => c.shop_id === order.shop_id)?.seller_name || order.shop_id || '—'}
                      </td>
                      {/* Date */}
                      <td style={{ padding: '12px 16px', color: '#64748b', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                        {formatDate(order.create_time)}
                      </td>
                      {/* Amount */}
                      <td style={{ padding: '12px 16px', fontWeight: 700, color: '#111827', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {formatAmount(order.total_amount, order.currency)}
                      </td>
                      {/* Items preview */}
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
                    {/* Expanded row with all items */}
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
      </div>

      {/* Bottom note */}
      <div style={{ marginTop: 14, fontSize: '0.75rem', color: '#9ca3af', textAlign: 'right' }}>
        Order ID từ TikTok Shop thường bắt đầu bằng 57 hoặc 58. Dữ liệu được lưu trong Supabase bảng <code>tiktok_shop_orders</code>.
      </div>
    </div>
  );
};

export default TikTokOrdersTab;
