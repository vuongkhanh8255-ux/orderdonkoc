// src/components/KocPerformanceTab.jsx
//
// Hiệu suất KOC — TikTok Creator Marketplace cho 1 shop (mặc định Bodymiss).
// Nguồn: POST /affiliate_seller/202508/marketplace_creators/search (qua action=koc_creators).
// LƯU Ý: đây là dữ liệu Creator Marketplace của TikTok — thông tin + hiệu suất TỔNG
// của creator trên TikTok Shop (follower, GMV, live/video GMV, nhân khẩu học), KHÔNG
// phải doanh số riêng creator mang về cho shop (cái đó cần affiliate orders — app
// Creator hiện không expose).

import React, { useState, useEffect, useCallback, useMemo } from 'react';

const API = '/api/tiktok-shop/analytics';
const ACCENT = '#ea580c';

// ── Formatters ───────────────────────────────────────────────────────────────
const fmtNum = (v) => { const n = Number(v); return Number.isFinite(n) ? n.toLocaleString('vi-VN') : '0'; };
const fmtCompact = (v) => {
  const n = Number(v); if (!Number.isFinite(n) || n === 0) return '0';
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(Math.round(n));
};
const fmtUsd = (v) => {
  const n = Number(v); if (!Number.isFinite(n) || n === 0) return '$0';
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
};

const GENDER = {
  MALE:   { icon: '♂', label: 'Nam', color: '#3b82f6' },
  FEMALE: { icon: '♀', label: 'Nữ',  color: '#ec4899' },
};
const ageLabel = (a) => String(a || '').replace('AGE_RANGE_', '').replace('_PLUS', '+').replace('_', '–');

const SORTS = [
  { key: 'followers',  label: 'Follower' },
  { key: 'live_gmv',   label: 'GMV Live' },
  { key: 'video_gmv',  label: 'GMV Video' },
  { key: 'gmv',        label: 'GMV tổng' },
  { key: 'avg_live_uv', label: 'Live UV TB' },
];

// ── Creator Card ───────────────────────────────────────────────────────────────
const CreatorCard = ({ c, rank }) => {
  const g = GENDER[c.gender] || null;
  const topAge = (c.age_ranges || [])[0];
  return (
    <div style={{
      background: '#fff', borderRadius: 16, padding: 18, border: '1px solid #f1f5f9',
      boxShadow: '0 1px 4px rgba(15,23,42,0.06)', display: 'flex', flexDirection: 'column', gap: 12,
      position: 'relative', overflow: 'hidden',
    }}>
      {/* Rank badge */}
      <span style={{
        position: 'absolute', top: 12, right: 12, fontSize: '0.68rem', fontWeight: 800,
        color: rank <= 3 ? '#fff' : '#94a3b8', background: rank <= 3 ? ACCENT : '#f1f5f9',
        borderRadius: 20, padding: '2px 9px',
      }}>#{rank}</span>

      {/* Header: avatar + name */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {c.avatar
          ? <img src={c.avatar} alt={c.nickname} referrerPolicy="no-referrer" style={{ width: 52, height: 52, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: '2px solid #fed7aa' }} />
          : <div style={{ width: 52, height: 52, borderRadius: '50%', background: '#fff7ed', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '1.3rem' }}>🧑</div>}
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontWeight: 800, fontSize: '0.95rem', color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {c.nickname} {c.region && <span style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 600 }}>· {c.region}</span>}
          </div>
          {c.username && (
            <a href={`https://www.tiktok.com/@${c.username}`} target="_blank" rel="noreferrer"
              style={{ fontSize: '0.78rem', color: ACCENT, textDecoration: 'none', fontWeight: 600 }}>
              @{c.username}
            </a>
          )}
        </div>
      </div>

      {/* Followers + live UV */}
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1, background: '#f8fafc', borderRadius: 10, padding: '8px 10px' }}>
          <div style={{ fontSize: '0.66rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px' }}>👥 Follower</div>
          <div style={{ fontSize: '1.05rem', fontWeight: 900, color: '#0f172a' }}>{fmtCompact(c.followers)}</div>
        </div>
        <div style={{ flex: 1, background: '#f8fafc', borderRadius: 10, padding: '8px 10px' }}>
          <div style={{ fontSize: '0.66rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px' }}>📺 Live UV TB</div>
          <div style={{ fontSize: '1.05rem', fontWeight: 900, color: '#0f172a' }}>{fmtCompact(c.avg_live_uv)}</div>
        </div>
      </div>

      {/* GMV */}
      <div style={{ background: '#fff7ed', borderRadius: 10, padding: '10px 12px', border: '1px solid #fed7aa' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={{ fontSize: '0.68rem', color: '#9a3412', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px' }}>GMV creator (toàn sàn)</span>
          <span style={{ fontSize: '1.1rem', fontWeight: 900, color: ACCENT }}>{fmtUsd(c.gmv)}</span>
        </div>
        <div style={{ display: 'flex', gap: 14, marginTop: 6, fontSize: '0.74rem', color: '#7c2d12' }}>
          <span>🔴 Live <b>{fmtUsd(c.live_gmv)}</b></span>
          <span>🎬 Video <b>{fmtUsd(c.video_gmv)}</b></span>
        </div>
      </div>

      {/* Demographics */}
      {(g || topAge) && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: '0.74rem' }}>
          {g && (
            <span style={{ background: `${g.color}15`, color: g.color, borderRadius: 20, padding: '3px 10px', fontWeight: 700 }}>
              {g.icon} {g.label} {c.gender_pct ? `${c.gender_pct.toFixed(0)}%` : ''}
            </span>
          )}
          {topAge && (
            <span style={{ background: '#f1f5f9', color: '#475569', borderRadius: 20, padding: '3px 10px', fontWeight: 700 }}>
              🎂 {ageLabel(topAge)}
            </span>
          )}
        </div>
      )}
    </div>
  );
};

// ── Main Tab ───────────────────────────────────────────────────────────────────
export default function KocPerformanceTab() {
  const [shops, setShops]         = useState([]);
  const [seller, setSeller]       = useState('body');
  const [creators, setCreators]   = useState([]);
  const [nextToken, setNextToken] = useState(null);
  const [loading, setLoading]     = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError]         = useState(null);
  const [sortKey, setSortKey]     = useState('followers');
  const [shopName, setShopName]   = useState('');

  // Load shop list once
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`${API}?action=koc_creators&list=1`);
        const j = await r.json();
        if (cancelled) return;
        if (j.ok && Array.isArray(j.shops)) {
          setShops(j.shops);
          const body = j.shops.find(s => (s.seller_name || '').toLowerCase().includes('body'));
          if (body) setSeller((body.seller_name || '').toLowerCase().split(' ')[0] || 'body');
        }
      } catch { /* keep default */ }
    })();
    return () => { cancelled = true; };
  }, []);

  const fetchCreators = useCallback(async (sellerKey, token = null, append = false) => {
    append ? setLoadingMore(true) : (setLoading(true), setError(null));
    try {
      const qs = new URLSearchParams({ action: 'koc_creators', seller: sellerKey, page_size: '20' });
      if (token) qs.set('page_token', token);
      const r = await fetch(`${API}?${qs}`);
      const j = await r.json();
      if (!j.ok) { setError(j.error || `Lỗi (code ${j.code || '?'})`); if (!append) setCreators([]); return; }
      setShopName(j.shop || '');
      setNextToken(j.next_page_token || null);
      setCreators(prev => append ? [...prev, ...(j.creators || [])] : (j.creators || []));
    } catch (e) {
      setError(e.message || 'Không tải được dữ liệu');
      if (!append) setCreators([]);
    } finally {
      append ? setLoadingMore(false) : setLoading(false);
    }
  }, []);

  useEffect(() => { fetchCreators(seller); }, [seller, fetchCreators]);

  const sorted = useMemo(() => {
    const arr = [...creators];
    arr.sort((a, b) => (Number(b[sortKey]) || 0) - (Number(a[sortKey]) || 0));
    return arr;
  }, [creators, sortKey]);

  // Summary (trang hiện tại)
  const summary = useMemo(() => {
    const totFollow = creators.reduce((s, c) => s + (c.followers || 0), 0);
    const totGmv = creators.reduce((s, c) => s + (c.gmv || 0), 0);
    const avgLiveUv = creators.length ? creators.reduce((s, c) => s + (c.avg_live_uv || 0), 0) / creators.length : 0;
    return { totFollow, totGmv, avgLiveUv, n: creators.length };
  }, [creators]);

  const selectStyle = { padding: '8px 12px', borderRadius: 10, border: '1px solid #e5e7eb', background: '#fff', fontSize: '0.85rem', fontWeight: 600, color: '#334155', cursor: 'pointer' };

  return (
    <div style={{ padding: '20px 24px', maxWidth: 1400, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 6 }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 900, color: '#0f172a', margin: 0 }}>🌟 Hiệu suất KOC {shopName && <span style={{ color: ACCENT }}>· {shopName}</span>}</h1>
          <p style={{ fontSize: '0.82rem', color: '#94a3b8', margin: '4px 0 0' }}>
            Creator Marketplace TikTok — thông tin & hiệu suất tổng của creator (follower, GMV, live/video, nhân khẩu học).
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {shops.length > 1 && (
            <select value={seller} onChange={e => setSeller(e.target.value)} style={selectStyle}>
              {shops.map(s => {
                const key = (s.seller_name || '').toLowerCase().split(' ')[0] || s.shop_id;
                return <option key={s.open_id || s.shop_id} value={key}>{s.seller_name}</option>;
              })}
            </select>
          )}
          <select value={sortKey} onChange={e => setSortKey(e.target.value)} style={selectStyle}>
            {SORTS.map(s => <option key={s.key} value={s.key}>Sắp xếp: {s.label}</option>)}
          </select>
          <button onClick={() => fetchCreators(seller)} disabled={loading}
            style={{ ...selectStyle, background: ACCENT, color: '#fff', border: 'none', opacity: loading ? 0.6 : 1 }}>
            {loading ? '⏳' : '🔄'} Tải lại
          </button>
        </div>
      </div>

      {/* Note */}
      <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '8px 14px', fontSize: '0.76rem', color: '#92400e', margin: '8px 0 16px' }}>
        ⚠️ GMV hiển thị là GMV <b>tổng của creator trên toàn TikTok Shop</b> (không phải doanh số riêng họ mang về cho shop). Dữ liệu dùng để <b>tìm & đánh giá KOC</b>.
      </div>

      {/* Summary */}
      {!loading && creators.length > 0 && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
          {[
            { label: 'KOC hiển thị', value: fmtNum(summary.n), icon: '🧑‍🤝‍🧑' },
            { label: 'Tổng follower', value: fmtCompact(summary.totFollow), icon: '👥' },
            { label: 'Tổng GMV (toàn sàn)', value: fmtUsd(summary.totGmv), icon: '💰' },
            { label: 'Live UV TB', value: fmtCompact(summary.avgLiveUv), icon: '📺' },
          ].map(s => (
            <div key={s.label} style={{ flex: '1 1 180px', background: '#fff', borderRadius: 14, padding: '14px 18px', border: '1px solid #f1f5f9', borderLeft: `4px solid ${ACCENT}`, boxShadow: '0 1px 4px rgba(15,23,42,0.05)' }}>
              <div style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{s.icon} {s.label}</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#0f172a', marginTop: 4 }}>{s.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* States */}
      {loading && <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8', fontSize: '0.9rem' }}>⏳ Đang tải KOC…</div>}
      {!loading && error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 12, padding: 20, color: '#b91c1c', fontSize: '0.86rem' }}>
          ❌ {error}
          <button onClick={() => fetchCreators(seller)} style={{ marginLeft: 12, padding: '4px 12px', borderRadius: 8, border: '1px solid #fecaca', background: '#fff', color: '#b91c1c', fontWeight: 700, cursor: 'pointer' }}>Thử lại</button>
        </div>
      )}
      {!loading && !error && creators.length === 0 && (
        <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>Không có dữ liệu creator.</div>
      )}

      {/* Grid */}
      {!loading && !error && sorted.length > 0 && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: 16 }}>
            {sorted.map((c, i) => <CreatorCard key={c.open_id || i} c={c} rank={i + 1} />)}
          </div>
          {nextToken && (
            <div style={{ textAlign: 'center', marginTop: 22 }}>
              <button onClick={() => fetchCreators(seller, nextToken, true)} disabled={loadingMore}
                style={{ padding: '10px 28px', borderRadius: 12, border: `1px solid ${ACCENT}`, background: loadingMore ? '#fff7ed' : '#fff', color: ACCENT, fontWeight: 800, fontSize: '0.86rem', cursor: 'pointer' }}>
                {loadingMore ? '⏳ Đang tải…' : '⬇️ Tải thêm KOC'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
