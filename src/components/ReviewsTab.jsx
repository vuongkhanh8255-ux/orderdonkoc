import { useState, useMemo, useCallback, useEffect, useRef } from 'react';

const STAR_COLORS = { 5: '#22c55e', 4: '#84cc16', 3: '#eab308', 2: '#f97316', 1: '#ef4444' };
const PAGE_SIZE = 20;

const SHOP_MAP = {
  '1031859035': 'Bodymiss', '1243148826': 'Milaganics', '341325550': 'Milaganics FBS',
  '831509831': 'Milaganics SPA', '1017289279': 'Moaw Moaws',
  '7495107349171898427': 'Bodymiss', '7494529979361168222': 'eHerb',
  '7495838925500090511': 'eHerb HCM', '7495831977917385095': 'Moaw Moaws',
  '7494813818973817115': 'Milaganics', '7494251668499498533': 'Healmii',
};
const shopName = (id) => SHOP_MAP[id] || id;

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function fmtNum(n) {
  return n.toLocaleString('vi-VN');
}
function truncate(s, max = 60) {
  if (!s || s.length <= max) return s || '';
  return s.slice(0, max) + '…';
}

export default function ReviewsTab() {
  const today = new Date().toISOString().split('T')[0];
  const weekAgo = new Date(Date.now() - 6 * 86400000).toISOString().split('T')[0];

  const [startDate, setStartDate] = useState(weekAgo);
  const [endDate, setEndDate] = useState(today);
  const [platform, setPlatform] = useState('both');
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [hasFetched, setHasFetched] = useState(false);

  const [starFilter, setStarFilter] = useState(0);
  const [shopFilter, setShopFilter] = useState('all');
  const [searchText, setSearchText] = useState('');
  const [replyFilter, setReplyFilter] = useState('all');
  const [sortBy, setSortBy] = useState('date_desc');
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState(null);

  const didMount = useRef(false);

  const fetchReviews = useCallback(async () => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diff = (end - start) / 86400000;
    if (diff < 0) { setError('Ngày bắt đầu phải trước ngày kết thúc'); return; }
    if (diff > 7) { setError('Khoảng thời gian tối đa là 7 ngày'); return; }

    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/erp/reviews?platform=${platform}&startDate=${startDate}&endDate=${endDate}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Lỗi tải dữ liệu');

      const normalized = [];
      if (data.shopee?.data) {
        for (const r of data.shopee.data) {
          normalized.push({
            id: `s-${r.commentId}`,
            platform: 'shopee',
            productId: String(r.productId || r.itemId),
            productName: r.productName || '',
            productImage: r.productCover ? `https://cf.shopee.vn/file/${r.productCover}_tn` : '',
            sku: r.modelName?.split('|')[0]?.trim() || '',
            star: r.ratingStar,
            comment: r.comment || '',
            userName: r.userName || '',
            date: r.ctime,
            hasReply: !!r.reply,
            replyText: r.reply?.comment || '',
            sellerId: r.seller_id,
            shop: shopName(r.seller_id),
          });
        }
      }
      if (data.tiktok?.data) {
        for (const r of data.tiktok.data) {
          normalized.push({
            id: `t-${r.main_review_id}`,
            platform: 'tiktok',
            productId: r.product_info?.product_id || '',
            productName: r.product_info?.product_name || '',
            productImage: r.product_info?.img?.thumb_url_list?.[0] || '',
            sku: r.product_info?.sku_specification || '',
            star: r.star_level,
            comment: r.only_star ? '' : (r.review_text || ''),
            userName: r.user_name || '',
            date: r.review_time,
            hasReply: r.reply_count > 0 || !!r.reply_text,
            replyText: r.reply_text || '',
            sellerId: r.seller_id,
            shop: shopName(r.seller_id),
          });
        }
      }
      setReviews(normalized);
      setPage(1);
      setStarFilter(0);
      setHasFetched(true);
    } catch (err) {
      setError(err.message);
      setHasFetched(true);
    } finally {
      setLoading(false);
    }
  }, [platform, startDate, endDate]);

  useEffect(() => {
    if (!didMount.current) { didMount.current = true; fetchReviews(); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Stats ──
  const stats = useMemo(() => {
    const dist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let sum = 0, replied = 0;
    const shopee = { total: 0, sum: 0, dist: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } };
    const tiktok = { total: 0, sum: 0, dist: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } };
    for (const r of reviews) {
      dist[r.star]++;
      sum += r.star;
      if (r.hasReply) replied++;
      const p = r.platform === 'shopee' ? shopee : tiktok;
      p.total++; p.sum += r.star; p.dist[r.star]++;
    }
    const total = reviews.length;
    return {
      total, replied, dist,
      avg: total ? (sum / total).toFixed(1) : '0.0',
      fiveStarPct: total ? ((dist[5] / total) * 100).toFixed(1) : '0.0',
      replyPct: total ? ((replied / total) * 100).toFixed(1) : '0.0',
      shopee: { ...shopee, avg: shopee.total ? (shopee.sum / shopee.total).toFixed(1) : '—' },
      tiktok: { ...tiktok, avg: tiktok.total ? (tiktok.sum / tiktok.total).toFixed(1) : '—' },
    };
  }, [reviews]);

  // ── Product stats ──
  const productStats = useMemo(() => {
    const map = {};
    for (const r of reviews) {
      const key = `${r.platform}-${r.productId}`;
      if (!map[key]) {
        map[key] = {
          key, productId: r.productId, productName: r.productName,
          productImage: r.productImage, platform: r.platform,
          total: 0, sum: 0, replied: 0,
          dist: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
        };
      }
      map[key].total++;
      map[key].sum += r.star;
      map[key].dist[r.star]++;
      if (r.hasReply) map[key].replied++;
    }
    return Object.values(map)
      .map(p => ({ ...p, avg: (p.sum / p.total).toFixed(1) }))
      .sort((a, b) => b.total - a.total);
  }, [reviews]);

  // ── Shop stats ──
  const shopStats = useMemo(() => {
    const map = {};
    for (const r of reviews) {
      const key = `${r.platform}-${r.sellerId}`;
      if (!map[key]) {
        map[key] = {
          key, sellerId: r.sellerId, shop: r.shop, platform: r.platform,
          total: 0, sum: 0, replied: 0,
          dist: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
        };
      }
      map[key].total++;
      map[key].sum += r.star;
      map[key].dist[r.star]++;
      if (r.hasReply) map[key].replied++;
    }
    return Object.values(map)
      .map(s => ({ ...s, avg: (s.sum / s.total).toFixed(1) }))
      .sort((a, b) => b.total - a.total);
  }, [reviews]);

  const shopList = useMemo(() => {
    const set = new Set(reviews.map(r => r.shop));
    return ['all', ...Array.from(set).sort()];
  }, [reviews]);

  // ── Filtered reviews ──
  const filtered = useMemo(() => {
    let result = [...reviews];
    if (shopFilter !== 'all') result = result.filter(r => r.shop === shopFilter);
    if (starFilter > 0) result = result.filter(r => r.star === starFilter);
    if (replyFilter === 'replied') result = result.filter(r => r.hasReply);
    if (replyFilter === 'unreplied') result = result.filter(r => !r.hasReply);
    if (searchText) {
      const q = searchText.toLowerCase();
      result = result.filter(r =>
        r.productName.toLowerCase().includes(q) ||
        r.comment.toLowerCase().includes(q) ||
        r.userName.toLowerCase().includes(q) ||
        r.sku.toLowerCase().includes(q)
      );
    }
    result.sort((a, b) => {
      switch (sortBy) {
        case 'date_asc': return new Date(a.date) - new Date(b.date);
        case 'star_desc': return b.star - a.star;
        case 'star_asc': return a.star - b.star;
        default: return new Date(b.date) - new Date(a.date);
      }
    });
    return result;
  }, [reviews, shopFilter, starFilter, replyFilter, searchText, sortBy]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // ── Styles ──
  const card = { background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', padding: '16px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' };
  const thStyle = { padding: '10px 12px', textAlign: 'left', fontSize: '0.72rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.4px', borderBottom: '2px solid #e5e7eb', background: '#f8fafc', whiteSpace: 'nowrap' };
  const tdStyle = { padding: '10px 12px', fontSize: '0.82rem', color: '#0f172a', borderBottom: '1px solid #f1f5f9', verticalAlign: 'middle' };
  const btnBase = { padding: '8px 16px', borderRadius: 8, fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer', border: '1.5px solid', transition: 'all 0.15s', fontFamily: 'inherit' };

  const platformBtn = (val) => ({
    ...btnBase,
    background: platform === val ? (val === 'shopee' ? '#fff7ed' : val === 'tiktok' ? '#f8fafc' : '#fff7ed') : '#fff',
    color: platform === val ? (val === 'shopee' ? '#ea580c' : val === 'tiktok' ? '#0f172a' : '#ea580c') : '#64748b',
    borderColor: platform === val ? (val === 'shopee' ? '#fed7aa' : val === 'tiktok' ? '#cbd5e1' : '#fed7aa') : '#e5e7eb',
  });

  const starFilterBtn = (val) => ({
    ...btnBase,
    padding: '6px 12px',
    fontSize: '0.78rem',
    background: starFilter === val ? (val === 0 ? '#fff7ed' : (STAR_COLORS[val] + '18')) : '#fff',
    color: starFilter === val ? (val === 0 ? '#ea580c' : STAR_COLORS[val]) : '#94a3b8',
    borderColor: starFilter === val ? (val === 0 ? '#fed7aa' : STAR_COLORS[val]) : '#e5e7eb',
  });

  return (
    <div style={{ fontFamily: "'Outfit', sans-serif", maxWidth: 1400 }}>
      {/* ── HEADER ── */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: '0 0 16px', fontSize: '1.4rem', fontWeight: 900, color: '#0f172a' }}>
          ⭐ Đánh giá sàn
        </h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', borderRadius: 10, border: '1.5px solid #e5e7eb', padding: '6px 12px' }}>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
              style={{ border: 'none', outline: 'none', fontSize: '0.84rem', fontFamily: 'inherit', color: '#0f172a', fontWeight: 600, background: 'transparent' }} />
            <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>→</span>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
              style={{ border: 'none', outline: 'none', fontSize: '0.84rem', fontFamily: 'inherit', color: '#0f172a', fontWeight: 600, background: 'transparent' }} />
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => setPlatform('both')} style={platformBtn('both')}>Tất cả</button>
            <button onClick={() => setPlatform('shopee')} style={platformBtn('shopee')}>🟠 Shopee</button>
            <button onClick={() => setPlatform('tiktok')} style={platformBtn('tiktok')}>⬛ TikTok</button>
          </div>
          <button onClick={fetchReviews} disabled={loading}
            style={{ ...btnBase, background: loading ? '#d1d5db' : '#ea580c', color: '#fff', borderColor: loading ? '#d1d5db' : '#ea580c', boxShadow: loading ? 'none' : '0 4px 12px rgba(234,88,12,0.2)', minWidth: 120 }}>
            {loading ? '⏳ Đang tải...' : '🔍 Tải dữ liệu'}
          </button>
        </div>
      </div>

      {/* ── ERROR ── */}
      {error && (
        <div style={{ ...card, borderColor: '#fca5a5', background: '#fef2f2', color: '#dc2626', marginBottom: 20, fontSize: '0.85rem', fontWeight: 600 }}>
          ⚠️ {error}
        </div>
      )}

      {/* ── LOADING ── */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '60px 20px' }}>
          <div style={{ fontSize: '2rem', marginBottom: 12 }}>⏳</div>
          <div style={{ fontSize: '0.92rem', color: '#64748b', fontWeight: 600 }}>Đang tải đánh giá từ ERP...</div>
          <div style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: 4 }}>Có thể mất 5-10 giây</div>
        </div>
      )}

      {/* ── EMPTY ── */}
      {!loading && hasFetched && reviews.length === 0 && !error && (
        <div style={{ textAlign: 'center', padding: '60px 20px' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>📭</div>
          <div style={{ fontSize: '0.92rem', color: '#64748b', fontWeight: 600 }}>Không có đánh giá trong khoảng thời gian này</div>
        </div>
      )}

      {/* ── MAIN CONTENT ── */}
      {!loading && reviews.length > 0 && (<>

        {/* ── STATS CARDS ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 20 }}>
          {[
            { label: 'Tổng đánh giá', value: fmtNum(stats.total), icon: '📊', color: '#6366f1' },
            { label: 'Trung bình sao', value: `${stats.avg} ⭐`, icon: '⭐', color: '#eab308' },
            { label: 'Tỉ lệ 5 sao', value: `${stats.fiveStarPct}%`, icon: '🏆', color: '#22c55e' },
            { label: 'Đã phản hồi', value: `${stats.replyPct}%`, icon: '💬', color: '#3b82f6' },
          ].map((c, i) => (
            <div key={i} style={{ ...card, display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 44, height: 44, borderRadius: 10, background: c.color + '12', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.3rem', flexShrink: 0 }}>
                {c.icon}
              </div>
              <div>
                <div style={{ fontSize: '1.2rem', fontWeight: 900, color: '#0f172a' }}>{c.value}</div>
                <div style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px' }}>{c.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* ── STAR DISTRIBUTION + PLATFORM BREAKDOWN ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
          {/* Star bars */}
          <div style={card}>
            <h3 style={{ margin: '0 0 14px', fontSize: '0.88rem', fontWeight: 800, color: '#0f172a' }}>Phân bố đánh giá</h3>
            {[5, 4, 3, 2, 1].map(star => {
              const count = stats.dist[star];
              const pct = stats.total ? (count / stats.total) * 100 : 0;
              const isActive = starFilter === star;
              return (
                <div key={star}
                  onClick={() => { setStarFilter(starFilter === star ? 0 : star); setPage(1); }}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 8px', borderRadius: 8, cursor: 'pointer', background: isActive ? STAR_COLORS[star] + '14' : 'transparent', transition: 'background 0.15s', marginBottom: 4 }}>
                  <span style={{ width: 36, fontSize: '0.82rem', fontWeight: 700, color: STAR_COLORS[star] }}>{star} ★</span>
                  <div style={{ flex: 1, height: 14, background: '#f1f5f9', borderRadius: 7, overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: STAR_COLORS[star], borderRadius: 7, transition: 'width 0.5s ease', minWidth: count > 0 ? 4 : 0 }} />
                  </div>
                  <span style={{ width: 50, textAlign: 'right', fontSize: '0.78rem', fontWeight: 700, color: '#0f172a' }}>{fmtNum(count)}</span>
                  <span style={{ width: 48, textAlign: 'right', fontSize: '0.72rem', color: '#94a3b8' }}>{pct.toFixed(1)}%</span>
                </div>
              );
            })}
            {starFilter > 0 && (
              <div style={{ marginTop: 8, fontSize: '0.72rem', color: '#ea580c', fontWeight: 600, cursor: 'pointer' }}
                onClick={() => { setStarFilter(0); setPage(1); }}>
                ✕ Bỏ lọc {starFilter} sao
              </div>
            )}
          </div>

          {/* Platform comparison */}
          <div style={card}>
            <h3 style={{ margin: '0 0 14px', fontSize: '0.88rem', fontWeight: 800, color: '#0f172a' }}>Theo sàn</h3>
            {[
              { key: 'shopee', label: 'Shopee', emoji: '🟠', color: '#ee4d2d', data: stats.shopee },
              { key: 'tiktok', label: 'TikTok', emoji: '⬛', color: '#0f172a', data: stats.tiktok },
            ].map(p => (
              <div key={p.key} style={{ padding: '12px 14px', borderRadius: 10, background: '#f8fafc', border: '1px solid #e5e7eb', marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontSize: '0.86rem', fontWeight: 800, color: p.color }}>{p.emoji} {p.label}</span>
                  <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
                    {fmtNum(p.data.total)} đánh giá · TB {p.data.avg} ⭐
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 4, height: 8, borderRadius: 4, overflow: 'hidden', background: '#e5e7eb' }}>
                  {[5, 4, 3, 2, 1].map(star => {
                    const w = p.data.total ? (p.data.dist[star] / p.data.total) * 100 : 0;
                    return w > 0 ? <div key={star} style={{ width: `${w}%`, background: STAR_COLORS[star], minWidth: 2 }} title={`${star}★: ${p.data.dist[star]}`} /> : null;
                  })}
                </div>
                <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                  {[5, 4, 3, 2, 1].map(star => (
                    <span key={star} style={{ fontSize: '0.68rem', color: STAR_COLORS[star], fontWeight: 600 }}>
                      {star}★ {p.data.dist[star]}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── SHOP STATS ── */}
        <div style={{ ...card, marginBottom: 20 }}>
          <h3 style={{ margin: '0 0 14px', fontSize: '0.88rem', fontWeight: 800, color: '#0f172a' }}>
            🏪 Thống kê theo Shop ({shopStats.length})
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
            {shopStats.map(s => {
              const replyPct = s.total ? ((s.replied / s.total) * 100).toFixed(0) : 0;
              return (
                <div key={s.key}
                  onClick={() => { setShopFilter(shopFilter === s.shop ? 'all' : s.shop); setPage(1); }}
                  style={{ padding: '14px 16px', borderRadius: 10, background: shopFilter === s.shop ? '#fff7ed' : '#f8fafc', border: `1.5px solid ${shopFilter === s.shop ? '#fed7aa' : '#e5e7eb'}`, cursor: 'pointer', transition: 'all 0.15s' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: '0.72rem', padding: '2px 7px', borderRadius: 5, fontWeight: 700, background: s.platform === 'shopee' ? '#fff7ed' : '#f8fafc', color: s.platform === 'shopee' ? '#ea580c' : '#0f172a', border: `1px solid ${s.platform === 'shopee' ? '#fed7aa' : '#e5e7eb'}` }}>
                        {s.platform === 'shopee' ? '🟠' : '⬛'}
                      </span>
                      <span style={{ fontSize: '0.86rem', fontWeight: 800, color: '#0f172a' }}>{s.shop}</span>
                    </div>
                    <span style={{ fontSize: '0.76rem', fontWeight: 700, color: parseFloat(s.avg) >= 4.5 ? '#22c55e' : parseFloat(s.avg) >= 3.5 ? '#eab308' : '#ef4444' }}>
                      {s.avg} ⭐
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 4, height: 6, borderRadius: 3, overflow: 'hidden', background: '#e5e7eb', marginBottom: 8 }}>
                    {[5, 4, 3, 2, 1].map(star => {
                      const w = s.total ? (s.dist[star] / s.total) * 100 : 0;
                      return w > 0 ? <div key={star} style={{ width: `${w}%`, background: STAR_COLORS[star], minWidth: 2 }} title={`${star}★: ${s.dist[star]}`} /> : null;
                    })}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: '#64748b' }}>
                    <span><b style={{ color: '#0f172a' }}>{fmtNum(s.total)}</b> đánh giá</span>
                    <span>Reply: <b style={{ color: parseInt(replyPct) >= 80 ? '#22c55e' : '#eab308' }}>{replyPct}%</b></span>
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                    {[5, 4, 3, 2, 1].map(star => (
                      <span key={star} style={{ fontSize: '0.66rem', color: STAR_COLORS[star], fontWeight: 600 }}>
                        {star}★{s.dist[star]}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          {shopFilter !== 'all' && (
            <div style={{ marginTop: 10, fontSize: '0.72rem', color: '#ea580c', fontWeight: 600, cursor: 'pointer' }}
              onClick={() => { setShopFilter('all'); setPage(1); }}>
              ✕ Bỏ lọc shop "{shopFilter}"
            </div>
          )}
        </div>

        {/* ── PRODUCT STATS TABLE ── */}
        <div style={{ ...card, marginBottom: 20, overflow: 'hidden' }}>
          <h3 style={{ margin: '0 0 14px', fontSize: '0.88rem', fontWeight: 800, color: '#0f172a' }}>
            📦 Thống kê theo sản phẩm ({productStats.length})
          </h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
              <thead>
                <tr>
                  <th style={{ ...thStyle, minWidth: 250 }}>Sản phẩm</th>
                  <th style={{ ...thStyle, textAlign: 'center', width: 55 }}>Sàn</th>
                  <th style={{ ...thStyle, textAlign: 'center', width: 55 }}>Tổng</th>
                  <th style={{ ...thStyle, textAlign: 'center', width: 45, color: STAR_COLORS[5] }}>5★</th>
                  <th style={{ ...thStyle, textAlign: 'center', width: 45, color: STAR_COLORS[4] }}>4★</th>
                  <th style={{ ...thStyle, textAlign: 'center', width: 45, color: STAR_COLORS[3] }}>3★</th>
                  <th style={{ ...thStyle, textAlign: 'center', width: 45, color: STAR_COLORS[2] }}>2★</th>
                  <th style={{ ...thStyle, textAlign: 'center', width: 45, color: STAR_COLORS[1] }}>1★</th>
                  <th style={{ ...thStyle, textAlign: 'center', width: 55 }}>TB</th>
                  <th style={{ ...thStyle, textAlign: 'center', width: 65 }}>Reply</th>
                </tr>
              </thead>
              <tbody>
                {productStats.map(p => {
                  const replyPct = p.total ? ((p.replied / p.total) * 100).toFixed(0) : 0;
                  return (
                    <tr key={p.key} style={{ transition: 'background 0.12s' }}
                      onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                      <td style={tdStyle}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          {p.productImage && (
                            <img src={p.productImage} alt="" style={{ width: 36, height: 36, borderRadius: 6, objectFit: 'cover', border: '1px solid #e5e7eb', flexShrink: 0 }}
                              onError={e => { e.target.style.display = 'none'; }} />
                          )}
                          <span style={{ fontWeight: 600, lineHeight: 1.3 }} title={p.productName}>
                            {truncate(p.productName, 55)}
                          </span>
                        </div>
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        <span style={{ fontSize: '0.72rem', padding: '3px 8px', borderRadius: 6, fontWeight: 700, background: p.platform === 'shopee' ? '#fff7ed' : '#f8fafc', color: p.platform === 'shopee' ? '#ea580c' : '#0f172a', border: `1px solid ${p.platform === 'shopee' ? '#fed7aa' : '#e5e7eb'}` }}>
                          {p.platform === 'shopee' ? 'SPE' : 'TT'}
                        </span>
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 800 }}>{p.total}</td>
                      {[5, 4, 3, 2, 1].map(star => (
                        <td key={star} style={{ ...tdStyle, textAlign: 'center', fontWeight: 600, color: p.dist[star] > 0 ? STAR_COLORS[star] : '#d1d5db' }}>
                          {p.dist[star]}
                        </td>
                      ))}
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        <span style={{ fontWeight: 800, color: parseFloat(p.avg) >= 4.5 ? '#22c55e' : parseFloat(p.avg) >= 3.5 ? '#eab308' : '#ef4444' }}>
                          {p.avg}
                        </span>
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'center', fontSize: '0.76rem', fontWeight: 600, color: parseInt(replyPct) >= 80 ? '#22c55e' : parseInt(replyPct) >= 50 ? '#eab308' : '#ef4444' }}>
                        {replyPct}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── FILTER BAR ── */}
        <div style={{ ...card, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: '1 1 200px', maxWidth: 320 }}>
            <input type="text" placeholder="Tìm sản phẩm, nội dung, user..."
              value={searchText} onChange={e => { setSearchText(e.target.value); setPage(1); }}
              style={{ width: '100%', padding: '8px 12px 8px 34px', borderRadius: 8, border: '1.5px solid #e5e7eb', fontSize: '0.82rem', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', transition: 'border-color 0.15s' }}
              onFocus={e => e.target.style.borderColor = '#ea580c'}
              onBlur={e => e.target.style.borderColor = '#e5e7eb'} />
            <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: '0.85rem', color: '#94a3b8', pointerEvents: 'none' }}>🔍</span>
          </div>

          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={() => { setStarFilter(0); setPage(1); }} style={starFilterBtn(0)}>Tất cả</button>
            {[5, 4, 3, 2, 1].map(s => (
              <button key={s} onClick={() => { setStarFilter(starFilter === s ? 0 : s); setPage(1); }} style={starFilterBtn(s)}>
                {s}★
              </button>
            ))}
          </div>

          <select value={shopFilter} onChange={e => { setShopFilter(e.target.value); setPage(1); }}
            style={{ padding: '8px 12px', borderRadius: 8, border: '1.5px solid #e5e7eb', fontSize: '0.82rem', fontFamily: 'inherit', color: '#0f172a', background: '#fff', cursor: 'pointer' }}>
            {shopList.map(s => (
              <option key={s} value={s}>{s === 'all' ? 'Shop: Tất cả' : s}</option>
            ))}
          </select>

          <select value={replyFilter} onChange={e => { setReplyFilter(e.target.value); setPage(1); }}
            style={{ padding: '8px 12px', borderRadius: 8, border: '1.5px solid #e5e7eb', fontSize: '0.82rem', fontFamily: 'inherit', color: '#0f172a', background: '#fff', cursor: 'pointer' }}>
            <option value="all">Reply: Tất cả</option>
            <option value="replied">Đã phản hồi</option>
            <option value="unreplied">Chưa phản hồi</option>
          </select>

          <select value={sortBy} onChange={e => setSortBy(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: 8, border: '1.5px solid #e5e7eb', fontSize: '0.82rem', fontFamily: 'inherit', color: '#0f172a', background: '#fff', cursor: 'pointer' }}>
            <option value="date_desc">Mới nhất</option>
            <option value="date_asc">Cũ nhất</option>
            <option value="star_desc">Sao cao → thấp</option>
            <option value="star_asc">Sao thấp → cao</option>
          </select>

          <span style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600, marginLeft: 'auto' }}>
            {fmtNum(filtered.length)} kết quả
          </span>
        </div>

        {/* ── REVIEWS TABLE ── */}
        <div style={{ ...card, overflow: 'hidden', padding: 0 }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ ...thStyle, width: 50, textAlign: 'center' }}>Sàn</th>
                  <th style={{ ...thStyle, width: 120 }}>Shop</th>
                  <th style={{ ...thStyle, minWidth: 220 }}>Sản phẩm</th>
                  <th style={{ ...thStyle, width: 50, textAlign: 'center' }}>Sao</th>
                  <th style={{ ...thStyle, minWidth: 200 }}>Nội dung</th>
                  <th style={{ ...thStyle, width: 100 }}>Người dùng</th>
                  <th style={{ ...thStyle, width: 90, textAlign: 'center' }}>Ngày</th>
                  <th style={{ ...thStyle, width: 55, textAlign: 'center' }}>Reply</th>
                </tr>
              </thead>
              <tbody>
                {paged.map(r => {
                  const isExpanded = expandedId === r.id;
                  return (
                    <tr key={r.id} onClick={() => setExpandedId(isExpanded ? null : r.id)}
                      style={{ cursor: 'pointer', background: isExpanded ? '#fffbeb' : 'transparent', transition: 'background 0.12s' }}
                      onMouseEnter={e => { if (!isExpanded) e.currentTarget.style.background = '#f8fafc'; }}
                      onMouseLeave={e => { if (!isExpanded) e.currentTarget.style.background = 'transparent'; }}>
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        <span style={{ fontSize: '0.72rem', padding: '2px 6px', borderRadius: 5, fontWeight: 700, background: r.platform === 'shopee' ? '#fff7ed' : '#f8fafc', color: r.platform === 'shopee' ? '#ea580c' : '#0f172a', border: `1px solid ${r.platform === 'shopee' ? '#fed7aa' : '#e5e7eb'}` }}>
                          {r.platform === 'shopee' ? '🟠' : '⬛'}
                        </span>
                      </td>
                      <td style={{ ...tdStyle, fontSize: '0.76rem', fontWeight: 600, color: '#374151' }}>
                        {r.shop || '—'}
                      </td>
                      <td style={tdStyle}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {r.productImage && (
                            <img src={r.productImage} alt="" style={{ width: 32, height: 32, borderRadius: 5, objectFit: 'cover', border: '1px solid #e5e7eb', flexShrink: 0 }}
                              onError={e => { e.target.style.display = 'none'; }} />
                          )}
                          <div>
                            <div style={{ fontWeight: 600, fontSize: '0.8rem', lineHeight: 1.3 }} title={r.productName}>
                              {truncate(r.productName, 45)}
                            </div>
                            {r.sku && <div style={{ fontSize: '0.68rem', color: '#94a3b8', marginTop: 1 }} title={r.sku}>{truncate(r.sku, 35)}</div>}
                          </div>
                        </div>
                        {isExpanded && (
                          <div style={{ marginTop: 10, padding: '10px 12px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: '0.78rem' }}>
                            {r.comment ? (
                              <div style={{ marginBottom: r.replyText ? 10 : 0 }}>
                                <div style={{ fontWeight: 700, color: '#64748b', fontSize: '0.68rem', textTransform: 'uppercase', marginBottom: 4 }}>Nội dung đánh giá</div>
                                <div style={{ color: '#0f172a', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{r.comment}</div>
                              </div>
                            ) : (
                              <div style={{ color: '#94a3b8', fontStyle: 'italic', marginBottom: r.replyText ? 10 : 0 }}>Chỉ đánh giá sao</div>
                            )}
                            {r.replyText && (
                              <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 10 }}>
                                <div style={{ fontWeight: 700, color: '#3b82f6', fontSize: '0.68rem', textTransform: 'uppercase', marginBottom: 4 }}>Phản hồi shop</div>
                                <div style={{ color: '#374151', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{r.replyText}</div>
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 6, fontWeight: 800, fontSize: '0.82rem', background: STAR_COLORS[r.star] + '18', color: STAR_COLORS[r.star], border: `1px solid ${STAR_COLORS[r.star]}40` }}>
                          {r.star}★
                        </span>
                      </td>
                      <td style={{ ...tdStyle, color: r.comment ? '#374151' : '#c4b5a0', fontStyle: r.comment ? 'normal' : 'italic', fontSize: '0.78rem', lineHeight: 1.4 }}>
                        {r.comment ? truncate(r.comment, 80) : 'Chỉ đánh giá sao'}
                      </td>
                      <td style={{ ...tdStyle, fontSize: '0.78rem', fontWeight: 600 }}>{r.userName}</td>
                      <td style={{ ...tdStyle, textAlign: 'center', fontSize: '0.76rem', color: '#64748b' }}>{fmtDate(r.date)}</td>
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        {r.hasReply
                          ? <span style={{ color: '#22c55e', fontWeight: 700, fontSize: '0.85rem' }} title="Đã phản hồi">✅</span>
                          : <span style={{ color: '#d1d5db', fontWeight: 700, fontSize: '0.85rem' }} title="Chưa phản hồi">—</span>
                        }
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* ── PAGINATION ── */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '14px 16px', borderTop: '1px solid #f1f5f9' }}>
              <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1}
                style={{ ...btnBase, padding: '6px 10px', fontSize: '0.76rem', background: '#fff', color: page === 1 ? '#d1d5db' : '#64748b', borderColor: '#e5e7eb', cursor: page === 1 ? 'default' : 'pointer' }}>
                ‹ Trước
              </button>
              {(() => {
                const pages = [];
                const show = 7;
                let start = Math.max(1, page - Math.floor(show / 2));
                let end = Math.min(totalPages, start + show - 1);
                if (end - start < show - 1) start = Math.max(1, end - show + 1);
                if (start > 1) { pages.push(1); if (start > 2) pages.push('...'); }
                for (let i = start; i <= end; i++) pages.push(i);
                if (end < totalPages) { if (end < totalPages - 1) pages.push('...'); pages.push(totalPages); }
                return pages.map((p, i) => (
                  p === '...'
                    ? <span key={`e${i}`} style={{ padding: '0 4px', color: '#94a3b8' }}>…</span>
                    : <button key={p} onClick={() => setPage(p)}
                        style={{ ...btnBase, padding: '6px 10px', fontSize: '0.76rem', minWidth: 34, background: p === page ? '#ea580c' : '#fff', color: p === page ? '#fff' : '#64748b', borderColor: p === page ? '#ea580c' : '#e5e7eb' }}>
                        {p}
                      </button>
                ));
              })()}
              <button onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page === totalPages}
                style={{ ...btnBase, padding: '6px 10px', fontSize: '0.76rem', background: '#fff', color: page === totalPages ? '#d1d5db' : '#64748b', borderColor: '#e5e7eb', cursor: page === totalPages ? 'default' : 'pointer' }}>
                Sau ›
              </button>
            </div>
          )}
        </div>

        <div style={{ textAlign: 'center', marginTop: 16, fontSize: '0.68rem', color: '#c4b5a0', fontStyle: 'italic' }}>
          Data from Stella ERP · Built by Quốc Khánh
        </div>
      </>)}
    </div>
  );
}
