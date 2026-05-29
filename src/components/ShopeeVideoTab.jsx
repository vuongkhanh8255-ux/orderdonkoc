import { useState, useCallback, useMemo } from 'react';

const SHOPS = {
  '341325550':  'eHerb Việt Nam',
  '831509831':  'eHerb HCM',
  '1031859035': 'Bodymiss',
  '1243148826': 'Milaganics',
  '1017289279': 'Moaw Moaws',
  '1616999364': 'Masube',
};

function fmtDate(ts) {
  if (!ts) return '—';
  const d = typeof ts === 'number' ? new Date(ts * 1000) : new Date(ts);
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function fmtDuration(sec) {
  if (!sec) return '—';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}p${s > 0 ? s + 's' : ''}` : `${s}s`;
}
function fmtNum(n) {
  return (n || 0).toLocaleString('vi-VN');
}
function truncate(s, max) {
  if (!s) return '—';
  return s.length > max ? s.slice(0, max) + '…' : s;
}

const STATUS_MAP = {
  NORMAL:       { label: 'Hoạt động', color: '#22c55e', bg: '#f0fdf4' },
  TRANSCODING:  { label: 'Đang xử lý', color: '#eab308', bg: '#fefce8' },
  FAILED:       { label: 'Lỗi', color: '#ef4444', bg: '#fef2f2' },
  DELETED:      { label: 'Đã xóa', color: '#94a3b8', bg: '#f8fafc' },
  REVIEWING:    { label: 'Đang duyệt', color: '#3b82f6', bg: '#eff6ff' },
};

export default function ShopeeVideoTab() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [shopData, setShopData] = useState([]);
  const [hasFetched, setHasFetched] = useState(false);
  const [shopFilter, setShopFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchText, setSearchText] = useState('');

  const fetchVideos = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/shopee/videos?page_size=50');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Lỗi tải dữ liệu');
      setShopData(data.shops || []);
      setHasFetched(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Flatten all videos with shop info
  const allVideos = useMemo(() => {
    const list = [];
    for (const shop of shopData) {
      for (const v of (shop.videos || [])) {
        list.push({
          ...v,
          shop_id: shop.shop_id,
          shop_name: shop.shop_name || SHOPS[shop.shop_id] || shop.shop_id,
          _shopError: shop.error,
        });
      }
    }
    return list;
  }, [shopData]);

  // Stats
  const stats = useMemo(() => {
    const totalShops = shopData.length;
    const totalVideos = allVideos.length;
    const byStatus = {};
    for (const v of allVideos) {
      const st = (v.file_status || v.status || 'UNKNOWN').toUpperCase();
      byStatus[st] = (byStatus[st] || 0) + 1;
    }
    const shopErrors = shopData.filter(s => s.error).length;
    return { totalShops, totalVideos, byStatus, shopErrors };
  }, [shopData, allVideos]);

  // Filtered
  const filtered = useMemo(() => {
    let result = [...allVideos];
    if (shopFilter !== 'all') result = result.filter(v => v.shop_id === shopFilter);
    if (statusFilter !== 'all') {
      result = result.filter(v => (v.file_status || v.status || '').toUpperCase() === statusFilter);
    }
    if (searchText) {
      const q = searchText.toLowerCase();
      result = result.filter(v =>
        (v.file_name || v.video_id || '').toString().toLowerCase().includes(q) ||
        (v.shop_name || '').toLowerCase().includes(q)
      );
    }
    return result;
  }, [allVideos, shopFilter, statusFilter, searchText]);

  // Styles
  const card = { background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', padding: '20px 24px', boxShadow: '0 1px 2px rgba(15,23,42,0.04)' };
  const thStyle = { padding: '10px 12px', fontSize: '0.72rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '2px solid #e5e7eb', textAlign: 'left', background: '#f8fafc' };
  const tdStyle = { padding: '10px 12px', fontSize: '0.82rem', color: '#0f172a', borderBottom: '1px solid #f1f5f9', verticalAlign: 'middle' };

  return (
    <div style={{ fontFamily: "'Outfit', sans-serif", maxWidth: 1400, margin: '0 auto', padding: '0 24px 40px' }}>
      {/* ── HEADER ── */}
      <div style={{ ...card, marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 900, color: '#0f172a' }}>🎬 Shopee Video</h2>
            <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: '#64748b' }}>Danh sách video từ tất cả shop Shopee</p>
          </div>
          <button onClick={fetchVideos} disabled={loading}
            style={{
              padding: '10px 24px', borderRadius: 8, border: 'none',
              background: loading ? '#d1d5db' : '#ea580c', color: '#fff',
              fontWeight: 800, fontSize: '0.88rem', cursor: loading ? 'default' : 'pointer',
              boxShadow: loading ? 'none' : '0 4px 12px rgba(234,88,12,0.18)',
              fontFamily: 'inherit',
            }}>
            {loading ? '⏳ Đang tải...' : hasFetched ? '🔄 Tải lại' : '📥 Tải danh sách video'}
          </button>
        </div>
      </div>

      {/* ── ERROR ── */}
      {error && (
        <div style={{ ...card, marginBottom: 20, background: '#fef2f2', borderColor: '#fca5a5' }}>
          <span style={{ color: '#dc2626', fontWeight: 700, fontSize: '0.85rem' }}>❌ {error}</span>
        </div>
      )}

      {/* ── LOADING ── */}
      {loading && !hasFetched && (
        <div style={{ ...card, textAlign: 'center', padding: 60 }}>
          <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>⏳</div>
          <div style={{ fontWeight: 700, color: '#64748b' }}>Đang tải video từ {Object.keys(SHOPS).length} shop...</div>
          <div style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: 6 }}>Có thể mất 10-15 giây</div>
        </div>
      )}

      {/* ── NOT FETCHED YET ── */}
      {!hasFetched && !loading && !error && (
        <div style={{ ...card, textAlign: 'center', padding: 60 }}>
          <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>🎬</div>
          <div style={{ fontWeight: 700, color: '#64748b' }}>Bấm "Tải danh sách video" để xem video từ tất cả shop</div>
        </div>
      )}

      {/* ── DATA LOADED ── */}
      {hasFetched && (
        <>
          {/* ── STATS ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, marginBottom: 20 }}>
            <div style={card}>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Tổng Video</div>
              <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#0f172a', marginTop: 4 }}>{fmtNum(stats.totalVideos)}</div>
            </div>
            <div style={card}>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Shop kết nối</div>
              <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#0f172a', marginTop: 4 }}>{stats.totalShops - stats.shopErrors}/{stats.totalShops}</div>
            </div>
            {Object.entries(stats.byStatus).map(([st, count]) => {
              const info = STATUS_MAP[st] || { label: st, color: '#64748b', bg: '#f8fafc' };
              return (
                <div key={st} style={{ ...card, background: info.bg, cursor: 'pointer', border: statusFilter === st ? `2px solid ${info.color}` : '1px solid #e5e7eb' }}
                  onClick={() => setStatusFilter(statusFilter === st ? 'all' : st)}>
                  <div style={{ fontSize: '0.72rem', fontWeight: 700, color: info.color, textTransform: 'uppercase' }}>{info.label}</div>
                  <div style={{ fontSize: '1.6rem', fontWeight: 900, color: info.color, marginTop: 4 }}>{fmtNum(count)}</div>
                </div>
              );
            })}
          </div>

          {/* ── SHOP ERRORS ── */}
          {shopData.filter(s => s.error).length > 0 && (
            <div style={{ ...card, marginBottom: 20, background: '#fffbeb', borderColor: '#fde68a' }}>
              <h4 style={{ margin: '0 0 8px', fontSize: '0.82rem', fontWeight: 800, color: '#92400e' }}>⚠️ Lỗi kết nối một số shop</h4>
              {shopData.filter(s => s.error).map(s => (
                <div key={s.shop_id} style={{ fontSize: '0.78rem', color: '#92400e', marginBottom: 4 }}>
                  <b>{s.shop_name}</b>: {s.error}
                </div>
              ))}
            </div>
          )}

          {/* ── SHOP SUMMARY CARDS ── */}
          <div style={{ ...card, marginBottom: 20 }}>
            <h3 style={{ margin: '0 0 14px', fontSize: '0.88rem', fontWeight: 800, color: '#0f172a' }}>
              🏪 Video theo Shop
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
              {shopData.filter(s => !s.error).map(s => (
                <div key={s.shop_id}
                  onClick={() => { setShopFilter(shopFilter === s.shop_id ? 'all' : s.shop_id); }}
                  style={{
                    padding: '12px 14px', borderRadius: 10, cursor: 'pointer',
                    background: shopFilter === s.shop_id ? '#fff7ed' : '#f8fafc',
                    border: `1.5px solid ${shopFilter === s.shop_id ? '#fed7aa' : '#e5e7eb'}`,
                    transition: 'all 0.15s',
                  }}>
                  <div style={{ fontSize: '0.84rem', fontWeight: 800, color: '#0f172a' }}>{s.shop_name}</div>
                  <div style={{ fontSize: '0.76rem', color: '#64748b', marginTop: 4 }}>
                    <b style={{ color: '#ea580c' }}>{fmtNum(s.videos?.length || 0)}</b> video
                  </div>
                </div>
              ))}
            </div>
            {shopFilter !== 'all' && (
              <div style={{ marginTop: 10, fontSize: '0.72rem', color: '#ea580c', fontWeight: 600, cursor: 'pointer' }}
                onClick={() => setShopFilter('all')}>
                ✕ Bỏ lọc shop
              </div>
            )}
          </div>

          {/* ── FILTERS ── */}
          <div style={{ ...card, marginBottom: 20, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <input type="text" placeholder="🔍 Tìm theo tên file..." value={searchText} onChange={e => setSearchText(e.target.value)}
              style={{ flex: '1 1 200px', padding: '8px 14px', borderRadius: 8, border: '1.5px solid #e5e7eb', fontSize: '0.82rem', fontFamily: 'inherit', outline: 'none' }} />
            <select value={shopFilter} onChange={e => setShopFilter(e.target.value)}
              style={{ padding: '8px 12px', borderRadius: 8, border: '1.5px solid #e5e7eb', fontSize: '0.82rem', fontFamily: 'inherit', cursor: 'pointer' }}>
              <option value="all">Shop: Tất cả</option>
              {shopData.filter(s => !s.error).map(s => (
                <option key={s.shop_id} value={s.shop_id}>{s.shop_name}</option>
              ))}
            </select>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
              style={{ padding: '8px 12px', borderRadius: 8, border: '1.5px solid #e5e7eb', fontSize: '0.82rem', fontFamily: 'inherit', cursor: 'pointer' }}>
              <option value="all">Trạng thái: Tất cả</option>
              {Object.entries(STATUS_MAP).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
            <span style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600, marginLeft: 'auto' }}>
              {fmtNum(filtered.length)} video
            </span>
          </div>

          {/* ── VIDEO TABLE ── */}
          <div style={{ ...card, overflow: 'hidden', padding: 0 }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ ...thStyle, width: 60, textAlign: 'center' }}>#</th>
                    <th style={{ ...thStyle, width: 80 }}>Preview</th>
                    <th style={{ ...thStyle, minWidth: 200 }}>Tên file</th>
                    <th style={{ ...thStyle, width: 140 }}>Shop</th>
                    <th style={{ ...thStyle, width: 80, textAlign: 'center' }}>Thời lượng</th>
                    <th style={{ ...thStyle, width: 100, textAlign: 'center' }}>Trạng thái</th>
                    <th style={{ ...thStyle, width: 100, textAlign: 'center' }}>Ngày tạo</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ ...tdStyle, textAlign: 'center', padding: 40, color: '#94a3b8', fontStyle: 'italic' }}>
                        {allVideos.length === 0 ? 'Không có video nào' : 'Không tìm thấy video phù hợp'}
                      </td>
                    </tr>
                  ) : filtered.map((v, i) => {
                    const st = (v.file_status || v.status || 'UNKNOWN').toUpperCase();
                    const info = STATUS_MAP[st] || { label: st, color: '#64748b', bg: '#f8fafc' };
                    const thumb = v.thumbnail_url || v.cover_url || v.url || '';
                    const fileName = v.file_name || v.video_id || `Video #${i + 1}`;
                    const duration = v.duration || v.file_duration || 0;
                    const createdAt = v.create_time || v.upload_time || v.created_at || '';
                    return (
                      <tr key={v.file_id || v.video_id || i}
                        style={{ transition: 'background 0.12s' }}
                        onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                        <td style={{ ...tdStyle, textAlign: 'center', fontSize: '0.76rem', color: '#94a3b8' }}>{i + 1}</td>
                        <td style={tdStyle}>
                          {thumb ? (
                            <img src={thumb} alt="" style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 6, border: '1px solid #e5e7eb' }}
                              onError={e => { e.target.style.display = 'none'; }} />
                          ) : (
                            <div style={{ width: 56, height: 56, borderRadius: 6, background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.3rem' }}>🎬</div>
                          )}
                        </td>
                        <td style={tdStyle}>
                          <div style={{ fontWeight: 600, fontSize: '0.82rem', lineHeight: 1.3 }} title={fileName}>
                            {truncate(fileName, 50)}
                          </div>
                          {v.file_id && <div style={{ fontSize: '0.68rem', color: '#94a3b8', marginTop: 2 }}>ID: {v.file_id}</div>}
                        </td>
                        <td style={{ ...tdStyle, fontSize: '0.78rem', fontWeight: 600 }}>{v.shop_name}</td>
                        <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 700, fontSize: '0.82rem' }}>{fmtDuration(duration)}</td>
                        <td style={{ ...tdStyle, textAlign: 'center' }}>
                          <span style={{ fontSize: '0.72rem', padding: '3px 8px', borderRadius: 6, fontWeight: 700, background: info.bg, color: info.color, border: `1px solid ${info.color}30` }}>
                            {info.label}
                          </span>
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'center', fontSize: '0.78rem', color: '#64748b' }}>{fmtDate(createdAt)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
