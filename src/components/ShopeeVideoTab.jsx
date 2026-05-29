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
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function fmtDuration(ms) {
  if (!ms) return '—';
  const totalSec = Math.round(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return m > 0 ? `${m}p${s > 0 ? ` ${s}s` : ''}` : `${s}s`;
}
function fmtNum(n) {
  return (n || 0).toLocaleString('vi-VN');
}
function truncate(s, max) {
  if (!s) return '—';
  return s.length > max ? s.slice(0, max) + '…' : s;
}

export default function ShopeeVideoTab() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [shopData, setShopData] = useState([]);
  const [hasFetched, setHasFetched] = useState(false);
  const [shopFilter, setShopFilter] = useState('all');
  const [searchText, setSearchText] = useState('');
  const [sortBy, setSortBy] = useState('recent');

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
        });
      }
    }
    return list;
  }, [shopData]);

  // Stats
  const stats = useMemo(() => {
    const totalShops = shopData.length;
    const totalVideos = allVideos.length;
    const totalViews = allVideos.reduce((s, v) => s + (v.views || 0), 0);
    const totalLikes = allVideos.reduce((s, v) => s + (v.likes || 0), 0);
    const totalComments = allVideos.reduce((s, v) => s + (v.comments || 0), 0);
    const shopErrors = shopData.filter(s => s.error).length;
    return { totalShops, totalVideos, totalViews, totalLikes, totalComments, shopErrors };
  }, [shopData, allVideos]);

  // Filtered + sorted
  const filtered = useMemo(() => {
    let result = [...allVideos];
    if (shopFilter !== 'all') result = result.filter(v => v.shop_id === shopFilter);
    if (searchText) {
      const q = searchText.toLowerCase();
      result = result.filter(v =>
        (v.caption || '').toLowerCase().includes(q) ||
        (v.shop_name || '').toLowerCase().includes(q)
      );
    }
    if (sortBy === 'views') result.sort((a, b) => (b.views || 0) - (a.views || 0));
    else if (sortBy === 'likes') result.sort((a, b) => (b.likes || 0) - (a.likes || 0));
    else result.sort((a, b) => (b.post_time || 0) - (a.post_time || 0));
    return result;
  }, [allVideos, shopFilter, searchText, sortBy]);

  // Styles
  const card = { background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', padding: '20px 24px', boxShadow: '0 1px 2px rgba(15,23,42,0.04)' };
  const thStyle = { padding: '10px 12px', fontSize: '0.72rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '2px solid #e5e7eb', textAlign: 'left', background: '#f8fafc' };
  const tdStyle = { padding: '10px 12px', fontSize: '0.82rem', color: '#0f172a', borderBottom: '1px solid #f1f5f9', verticalAlign: 'middle' };
  const statCard = (label, value) => (
    <div style={card}>
      <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#0f172a', marginTop: 4 }}>{value}</div>
    </div>
  );

  return (
    <div style={{ fontFamily: "'Outfit', sans-serif", maxWidth: 1400, margin: '0 auto', padding: '0 24px 40px' }}>
      {/* ── HEADER ── */}
      <div style={{ ...card, marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 900, color: '#0f172a' }}>🎬 Shopee Video</h2>
            <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: '#64748b' }}>Video đã đăng từ tất cả shop Shopee</p>
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12, marginBottom: 20 }}>
            {statCard('Tổng Video', fmtNum(stats.totalVideos))}
            {statCard('Shop kết nối', `${stats.totalShops - stats.shopErrors}/${stats.totalShops}`)}
            {statCard('Tổng lượt xem', fmtNum(stats.totalViews))}
            {statCard('Tổng lượt thích', fmtNum(stats.totalLikes))}
            {statCard('Tổng bình luận', fmtNum(stats.totalComments))}
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
            <input type="text" placeholder="🔍 Tìm theo nội dung..." value={searchText} onChange={e => setSearchText(e.target.value)}
              style={{ flex: '1 1 200px', padding: '8px 14px', borderRadius: 8, border: '1.5px solid #e5e7eb', fontSize: '0.82rem', fontFamily: 'inherit', outline: 'none' }} />
            <select value={shopFilter} onChange={e => setShopFilter(e.target.value)}
              style={{ padding: '8px 12px', borderRadius: 8, border: '1.5px solid #e5e7eb', fontSize: '0.82rem', fontFamily: 'inherit', cursor: 'pointer' }}>
              <option value="all">Shop: Tất cả</option>
              {shopData.filter(s => !s.error).map(s => (
                <option key={s.shop_id} value={s.shop_id}>{s.shop_name}</option>
              ))}
            </select>
            <select value={sortBy} onChange={e => setSortBy(e.target.value)}
              style={{ padding: '8px 12px', borderRadius: 8, border: '1.5px solid #e5e7eb', fontSize: '0.82rem', fontFamily: 'inherit', cursor: 'pointer' }}>
              <option value="recent">Mới nhất</option>
              <option value="views">Lượt xem cao</option>
              <option value="likes">Lượt thích cao</option>
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
                    <th style={{ ...thStyle, width: 50, textAlign: 'center' }}>#</th>
                    <th style={{ ...thStyle, width: 80 }}>Preview</th>
                    <th style={{ ...thStyle, minWidth: 240 }}>Nội dung</th>
                    <th style={{ ...thStyle, width: 130 }}>Shop</th>
                    <th style={{ ...thStyle, width: 80, textAlign: 'center' }}>👁 Xem</th>
                    <th style={{ ...thStyle, width: 80, textAlign: 'center' }}>❤️ Thích</th>
                    <th style={{ ...thStyle, width: 80, textAlign: 'center' }}>💬 BL</th>
                    <th style={{ ...thStyle, width: 90, textAlign: 'center' }}>Thời lượng</th>
                    <th style={{ ...thStyle, width: 100, textAlign: 'center' }}>Ngày đăng</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={9} style={{ ...tdStyle, textAlign: 'center', padding: 40, color: '#94a3b8', fontStyle: 'italic' }}>
                        {allVideos.length === 0 ? 'Không có video nào' : 'Không tìm thấy video phù hợp'}
                      </td>
                    </tr>
                  ) : filtered.map((v, i) => {
                    const thumb = v.cover_image_url || '';
                    const caption = v.caption || `Video #${i + 1}`;
                    const link = v.video_url || '';
                    const id = v.post_id || v.video_upload_id || i;
                    return (
                      <tr key={id}
                        style={{ transition: 'background 0.12s' }}
                        onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                        <td style={{ ...tdStyle, textAlign: 'center', fontSize: '0.76rem', color: '#94a3b8' }}>{i + 1}</td>
                        <td style={tdStyle}>
                          {thumb ? (
                            <a href={link || thumb} target="_blank" rel="noopener noreferrer">
                              <img src={thumb} alt="" style={{ width: 48, height: 64, objectFit: 'cover', borderRadius: 6, border: '1px solid #e5e7eb', display: 'block' }}
                                onError={e => { e.target.style.display = 'none'; }} />
                            </a>
                          ) : (
                            <div style={{ width: 48, height: 64, borderRadius: 6, background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.3rem' }}>🎬</div>
                          )}
                        </td>
                        <td style={tdStyle}>
                          {link ? (
                            <a href={link} target="_blank" rel="noopener noreferrer"
                              style={{ fontWeight: 600, fontSize: '0.82rem', lineHeight: 1.3, color: '#0f172a', textDecoration: 'none' }}
                              title={caption}>
                              {truncate(caption, 70)}
                            </a>
                          ) : (
                            <div style={{ fontWeight: 600, fontSize: '0.82rem', lineHeight: 1.3 }} title={caption}>
                              {truncate(caption, 70)}
                            </div>
                          )}
                        </td>
                        <td style={{ ...tdStyle, fontSize: '0.78rem', fontWeight: 600 }}>{v.shop_name}</td>
                        <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 700, fontSize: '0.82rem' }}>{fmtNum(v.views)}</td>
                        <td style={{ ...tdStyle, textAlign: 'center', fontSize: '0.82rem', color: '#64748b' }}>{fmtNum(v.likes)}</td>
                        <td style={{ ...tdStyle, textAlign: 'center', fontSize: '0.82rem', color: '#64748b' }}>{fmtNum(v.comments)}</td>
                        <td style={{ ...tdStyle, textAlign: 'center', fontSize: '0.82rem' }}>{fmtDuration(v.duration)}</td>
                        <td style={{ ...tdStyle, textAlign: 'center', fontSize: '0.78rem', color: '#64748b' }}>{fmtDate(v.post_time)}</td>
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
