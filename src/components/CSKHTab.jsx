import React, { useState, useEffect, useMemo } from 'react';
import ReportCSTab from './ReportCSTab';

const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwl0bImCEVCdWA8rSM6SxJH1Go9YuKxmcysQiH2ZxRl6jnCSS6Rdna3ztKYnx5nbr9A6A/exec';
const TOKEN = 'stella2026';

const BRAND_COLORS = {
  'BODYMISS':   '#3b82f6',
  'MILAGANICS': '#10b981',
  'MOAWS':      '#f97316',
  'EHERB':      '#eab308',
};

const STAR_COLORS = { 1: '#ef4444', 2: '#f97316', 3: '#eab308', 4: '#22c55e', 5: '#10b981' };

const normalizeBrand = (b) => {
  if (!b) return 'Không rõ';
  const n = b.toUpperCase().replace(/\s+/g, '');
  if (n.includes('BODYMISS')) return 'BODYMISS';
  if (n.includes('MILAGANICS') || n.includes('MILA')) return 'MILAGANICS';
  if (n.includes('MOAW')) return 'MOAWS';
  if (n.includes('EHERB')) return 'EHERB';
  return b.trim();
};

function DanhGiaTab() {
  const [rawData, setRawData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters
  const [brandFilter, setBrandFilter] = useState('Tất cả');
  const [starFilter, setStarFilter] = useState('Tất cả');
  const [categoryFilter, setCategoryFilter] = useState('Tất cả');
  const [platformFilter, setPlatformFilter] = useState('Tất cả');
  const [searchText, setSearchText] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  useEffect(() => {
    setLoading(true);
    fetch(`${SCRIPT_URL}?token=${TOKEN}&sheet=11.1%20%C4%90%C3%81NH%20GI%C3%81%202026`)
      .then(r => r.json())
      .then(j => {
        const cleaned = (j.data || []).filter(r => r['STT'] && r['BRAND']);
        setRawData(cleaned);
        setLoading(false);
      })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

  // Unique filter values
  const brands = useMemo(() => ['Tất cả', ...new Set(rawData.map(r => normalizeBrand(r['BRAND'])).filter(Boolean))], [rawData]);
  const stars = useMemo(() => ['Tất cả', ...new Set(rawData.map(r => r['SỐ SAO']).filter(Boolean).sort())], [rawData]);
  const categories = useMemo(() => ['Tất cả', ...new Set(rawData.map(r => r['PHÂN LOẠI']).filter(Boolean).sort())], [rawData]);
  const platforms = useMemo(() => ['Tất cả', ...new Set(rawData.map(r => r['TÊN SÀN']).filter(Boolean).sort())], [rawData]);

  // Filtered data
  const filtered = useMemo(() => {
    return rawData.filter(r => {
      if (brandFilter !== 'Tất cả' && normalizeBrand(r['BRAND']) !== brandFilter) return false;
      if (starFilter !== 'Tất cả' && String(r['SỐ SAO']) !== String(starFilter)) return false;
      if (categoryFilter !== 'Tất cả' && r['PHÂN LOẠI'] !== categoryFilter) return false;
      if (platformFilter !== 'Tất cả' && r['TÊN SÀN'] !== platformFilter) return false;
      if (dateFrom || dateTo) {
        const d = r['NGÀY'];
        if (!d) return false;
        const ts = new Date(d).getTime();
        if (isNaN(ts)) return false;
        if (dateFrom && ts < new Date(dateFrom).setHours(0,0,0,0)) return false;
        if (dateTo && ts > new Date(dateTo).setHours(23,59,59,999)) return false;
      }
      if (searchText) {
        const s = searchText.toLowerCase();
        const match = [r['SẢN PHẨM'], r['LÝ DO'], r['ID ĐƠN'], r['PHÂN LOẠI']].some(v => v && String(v).toLowerCase().includes(s));
        if (!match) return false;
      }
      return true;
    });
  }, [rawData, brandFilter, starFilter, categoryFilter, platformFilter, searchText, dateFrom, dateTo]);

  // Stats
  const stats = useMemo(() => {
    const byBrand = {};
    const byStar = {};
    const byCategory = {};
    filtered.forEach(r => {
      const b = normalizeBrand(r['BRAND']);
      byBrand[b] = (byBrand[b] || 0) + 1;
      const s = r['SỐ SAO'];
      if (s) byStar[s] = (byStar[s] || 0) + 1;
      const c = r['PHÂN LOẠI'];
      if (c) byCategory[c] = (byCategory[c] || 0) + 1;
    });
    const byProduct = {};
    filtered.forEach(r => {
      const p = r['SẢN PHẨM'];
      if (p) byProduct[p] = (byProduct[p] || 0) + 1;
    });
    return { byBrand, byStar, byCategory, byProduct, total: filtered.length };
  }, [filtered]);

  // Top lists
  const topCategories = useMemo(() =>
    Object.entries(stats.byCategory).sort((a, b) => b[1] - a[1]).slice(0, 10),
    [stats.byCategory]);
  const topProducts = useMemo(() =>
    Object.entries(stats.byProduct).sort((a, b) => b[1] - a[1]).slice(0, 10),
    [stats.byProduct]);

  // Expandable product breakdown
  const [expandedProduct, setExpandedProduct] = useState(null);
  const productBreakdown = useMemo(() => {
    if (!expandedProduct) return [];
    const map = {};
    filtered.filter(r => r['SẢN PHẨM'] === expandedProduct).forEach(r => {
      const c = r['PHÂN LOẠI'] || 'Không rõ';
      map[c] = (map[c] || 0) + 1;
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [filtered, expandedProduct]);

  // Expandable category breakdown
  const [expandedCategory, setExpandedCategory] = useState(null);
  const categoryBreakdown = useMemo(() => {
    if (!expandedCategory) return [];
    const map = {};
    filtered.filter(r => (r['PHÂN LOẠI'] || 'Không rõ') === expandedCategory).forEach(r => {
      const p = r['SẢN PHẨM'] || 'Không rõ';
      map[p] = (map[p] || 0) + 1;
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [filtered, expandedCategory]);

  // Pagination
  const [page, setPage] = useState(1);
  const perPage = 20;
  const totalPages = Math.ceil(filtered.length / perPage);
  const pageData = filtered.slice((page - 1) * perPage, page * perPage);

  // Reset page on filter change
  useEffect(() => { setPage(1); }, [brandFilter, starFilter, categoryFilter, platformFilter, searchText, dateFrom, dateTo]);

  const formatDate = (d) => {
    if (!d) return '';
    if (typeof d === 'string' && d.includes('/')) return d;
    try {
      const dt = new Date(d);
      if (isNaN(dt)) return String(d);
      return dt.toLocaleDateString('vi-VN');
    } catch { return String(d); }
  };

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 16, animation: 'spin 1s linear infinite' }}>⏳</div>
        <p style={{ color: '#888', fontSize: 14 }}>Đang tải dữ liệu đánh giá...</p>
      </div>
    </div>
  );

  if (error) return (
    <div style={{ padding: 40, textAlign: 'center', color: '#ef4444' }}>
      <p style={{ fontSize: 18 }}>Lỗi tải dữ liệu</p>
      <p style={{ fontSize: 14, color: '#888' }}>{error}</p>
    </div>
  );

  const cardStyle = { background: '#fff', borderRadius: 12, padding: '16px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', border: '1px solid #f3f4f6' };
  const labelStyle = { fontSize: 11, color: '#888', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4, letterSpacing: '0.5px' };
  const selectStyle = { width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13, background: '#fff', cursor: 'pointer', outline: 'none' };
  const pillStyle = (active) => ({
    padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: 'none',
    background: active ? 'linear-gradient(135deg, #f97316, #ef4444)' : '#f3f4f6',
    color: active ? '#fff' : '#666', transition: 'all 0.2s',
  });

  return (
    <div style={{ fontFamily: "'Outfit', sans-serif" }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#1a1a2e' }}>
            📋 QUẢN LÝ ĐÁNH GIÁ CSKH
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#888' }}>
            Nguồn: CS Guideline 2026 — Sheet 11.1 ĐÁNH GIÁ 2026
          </p>
        </div>
        <div style={{ fontSize: 13, color: '#888' }}>
          Tổng: <b style={{ color: '#f97316' }}>{rawData.length}</b> đánh giá
        </div>
      </div>

      {/* Stats Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 20 }}>
        {Object.entries(stats.byBrand).map(([brand, count]) => (
          <div key={brand} style={{ ...cardStyle, borderLeft: `4px solid ${BRAND_COLORS[brand] || '#6b7280'}`, cursor: 'pointer', transition: 'all 0.2s', ...(brandFilter === brand ? { boxShadow: '0 0 0 2px #f97316' } : {}) }}
            onClick={() => setBrandFilter(brandFilter === brand ? 'Tất cả' : brand)}
          >
            <div style={labelStyle}>{brand}</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: BRAND_COLORS[brand] || '#333' }}>{count}</div>
            <div style={{ fontSize: 11, color: '#aaa' }}>đánh giá</div>
          </div>
        ))}
      </div>

      {/* Star distribution */}
      <div style={{ ...cardStyle, marginBottom: 20 }}>
        <div style={{ ...labelStyle, marginBottom: 12 }}>Phân bố số sao</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {[1, 2, 3, 4, 5].map(s => {
            const count = stats.byStar[s] || 0;
            const pct = stats.total > 0 ? ((count / stats.total) * 100).toFixed(1) : 0;
            return (
              <div key={s}
                onClick={() => setStarFilter(starFilter === String(s) ? 'Tất cả' : String(s))}
                style={{
                  flex: 1, minWidth: 80, textAlign: 'center', padding: '10px 8px', borderRadius: 10, cursor: 'pointer', transition: 'all 0.2s',
                  background: starFilter === String(s) ? STAR_COLORS[s] + '22' : '#f9fafb',
                  border: starFilter === String(s) ? `2px solid ${STAR_COLORS[s]}` : '2px solid transparent',
                }}
              >
                <div style={{ fontSize: 16 }}>{'⭐'.repeat(s)}</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: STAR_COLORS[s] }}>{count}</div>
                <div style={{ fontSize: 11, color: '#888' }}>{pct}%</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Top breakdown tables */}
      {filtered.length > 0 && (topCategories.length > 0 || topProducts.length > 0) && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
          {/* Top phân loại lỗi */}
          <div style={cardStyle}>
            <div style={{ ...labelStyle, marginBottom: 12 }}>Top phân loại <span style={{ fontSize: 10, color: '#bbb' }}>(bấm để xem chi tiết)</span></div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #f3f4f6' }}>
                  <th style={{ textAlign: 'left', padding: '6px 8px', fontSize: 11, color: '#888', fontWeight: 600 }}>#</th>
                  <th style={{ textAlign: 'left', padding: '6px 8px', fontSize: 11, color: '#888', fontWeight: 600 }}>Phân loại</th>
                  <th style={{ textAlign: 'right', padding: '6px 8px', fontSize: 11, color: '#888', fontWeight: 600 }}>SL</th>
                  <th style={{ textAlign: 'right', padding: '6px 8px', fontSize: 11, color: '#888', fontWeight: 600 }}>Tỷ lệ</th>
                </tr>
              </thead>
              <tbody>
                {topCategories.map(([cat, count], i) => (
                  <React.Fragment key={cat}>
                    <tr style={{ borderBottom: '1px solid #f9fafb', cursor: 'pointer', background: expandedCategory === cat ? '#fff7ed' : 'transparent' }}
                      onClick={() => setExpandedCategory(expandedCategory === cat ? null : cat)}
                      onMouseEnter={e => { if (expandedCategory !== cat) e.currentTarget.style.background = '#fffbeb'; }}
                      onMouseLeave={e => { if (expandedCategory !== cat) e.currentTarget.style.background = 'transparent'; }}
                    >
                      <td style={{ padding: '8px', color: '#bbb', fontSize: 12 }}>
                        <span style={{ display: 'inline-block', transition: 'transform 0.2s', transform: expandedCategory === cat ? 'rotate(90deg)' : 'rotate(0deg)', marginRight: 4, fontSize: 10 }}>▶</span>
                        {i + 1}
                      </td>
                      <td style={{ padding: '8px' }}>
                        <span style={{ padding: '2px 8px', borderRadius: 6, fontSize: 12, background: expandedCategory === cat ? '#f97316' : '#f3f4f6', color: expandedCategory === cat ? '#fff' : '#444', transition: 'all 0.2s' }}>{cat}</span>
                      </td>
                      <td style={{ padding: '8px', textAlign: 'right', fontWeight: 700, color: '#f97316' }}>{count}</td>
                      <td style={{ padding: '8px', textAlign: 'right', fontSize: 12, color: '#888' }}>
                        {(count / filtered.length * 100).toFixed(1)}%
                        <div style={{ marginTop: 2, height: 4, borderRadius: 2, background: '#f3f4f6', overflow: 'hidden' }}>
                          <div style={{ height: '100%', borderRadius: 2, background: 'linear-gradient(90deg, #f97316, #ef4444)', width: `${(count / filtered.length * 100)}%` }} />
                        </div>
                      </td>
                    </tr>
                    {expandedCategory === cat && categoryBreakdown.map(([prod, cnt]) => (
                      <tr key={prod} style={{ background: '#fffbeb', borderBottom: '1px solid #fef3c7' }}>
                        <td style={{ padding: '4px 8px' }} />
                        <td style={{ padding: '4px 8px', paddingLeft: 28, fontSize: 12, color: '#666' }}>{prod}</td>
                        <td style={{ padding: '4px 8px', textAlign: 'right', fontSize: 12, fontWeight: 600, color: '#92400e' }}>{cnt}</td>
                        <td style={{ padding: '4px 8px', textAlign: 'right', fontSize: 11, color: '#b45309' }}>{(cnt / count * 100).toFixed(1)}%</td>
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>

          {/* Top sản phẩm bị lỗi */}
          <div style={cardStyle}>
            <div style={{ ...labelStyle, marginBottom: 12 }}>Top sản phẩm <span style={{ fontSize: 10, color: '#bbb' }}>(bấm để xem chi tiết)</span></div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #f3f4f6' }}>
                  <th style={{ textAlign: 'left', padding: '6px 8px', fontSize: 11, color: '#888', fontWeight: 600 }}>#</th>
                  <th style={{ textAlign: 'left', padding: '6px 8px', fontSize: 11, color: '#888', fontWeight: 600 }}>Sản phẩm</th>
                  <th style={{ textAlign: 'right', padding: '6px 8px', fontSize: 11, color: '#888', fontWeight: 600 }}>SL</th>
                  <th style={{ textAlign: 'right', padding: '6px 8px', fontSize: 11, color: '#888', fontWeight: 600 }}>Tỷ lệ</th>
                </tr>
              </thead>
              <tbody>
                {topProducts.map(([prod, count], i) => (
                  <React.Fragment key={prod}>
                    <tr style={{ borderBottom: '1px solid #f9fafb', cursor: 'pointer', background: expandedProduct === prod ? '#eff6ff' : 'transparent' }}
                      onClick={() => setExpandedProduct(expandedProduct === prod ? null : prod)}
                      onMouseEnter={e => { if (expandedProduct !== prod) e.currentTarget.style.background = '#fffbeb'; }}
                      onMouseLeave={e => { if (expandedProduct !== prod) e.currentTarget.style.background = 'transparent'; }}
                    >
                      <td style={{ padding: '8px', color: '#bbb', fontSize: 12 }}>
                        <span style={{ display: 'inline-block', transition: 'transform 0.2s', transform: expandedProduct === prod ? 'rotate(90deg)' : 'rotate(0deg)', marginRight: 4, fontSize: 10 }}>▶</span>
                        {i + 1}
                      </td>
                      <td style={{ padding: '8px', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: expandedProduct === prod ? 700 : 400 }} title={prod}>{prod}</td>
                      <td style={{ padding: '8px', textAlign: 'right', fontWeight: 700, color: '#3b82f6' }}>{count}</td>
                      <td style={{ padding: '8px', textAlign: 'right', fontSize: 12, color: '#888' }}>
                        {(count / filtered.length * 100).toFixed(1)}%
                        <div style={{ marginTop: 2, height: 4, borderRadius: 2, background: '#f3f4f6', overflow: 'hidden' }}>
                          <div style={{ height: '100%', borderRadius: 2, background: 'linear-gradient(90deg, #3b82f6, #6366f1)', width: `${(count / filtered.length * 100)}%` }} />
                        </div>
                      </td>
                    </tr>
                    {expandedProduct === prod && productBreakdown.map(([cat, cnt]) => (
                      <tr key={cat} style={{ background: '#eff6ff', borderBottom: '1px solid #dbeafe' }}>
                        <td style={{ padding: '4px 8px' }} />
                        <td style={{ padding: '4px 8px', paddingLeft: 28, fontSize: 12, color: '#666' }}>
                          <span style={{ padding: '1px 6px', borderRadius: 4, background: '#e0e7ff', fontSize: 11 }}>{cat}</span>
                        </td>
                        <td style={{ padding: '4px 8px', textAlign: 'right', fontSize: 12, fontWeight: 600, color: '#1e40af' }}>{cnt}</td>
                        <td style={{ padding: '4px 8px', textAlign: 'right', fontSize: 11, color: '#3b82f6' }}>{(cnt / count * 100).toFixed(1)}%</td>
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Filters */}
      <div style={{ ...cardStyle, marginBottom: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, alignItems: 'end' }}>
          <div>
            <div style={labelStyle}>Brand</div>
            <select value={brandFilter} onChange={e => setBrandFilter(e.target.value)} style={selectStyle}>
              {brands.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
          <div>
            <div style={labelStyle}>Số sao</div>
            <select value={starFilter} onChange={e => setStarFilter(e.target.value)} style={selectStyle}>
              {stars.map(s => <option key={s} value={s}>{s === 'Tất cả' ? 'Tất cả' : `${s} ⭐`}</option>)}
            </select>
          </div>
          <div>
            <div style={labelStyle}>Phân loại</div>
            <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} style={selectStyle}>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <div style={labelStyle}>Sàn</div>
            <select value={platformFilter} onChange={e => setPlatformFilter(e.target.value)} style={selectStyle}>
              {platforms.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <div style={labelStyle}>Từ ngày</div>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={selectStyle} />
          </div>
          <div>
            <div style={labelStyle}>Đến ngày</div>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={selectStyle} />
          </div>
          <div>
            <div style={labelStyle}>Tìm kiếm</div>
            <input
              type="text" placeholder="Tên SP, lý do, ID đơn..."
              value={searchText} onChange={e => setSearchText(e.target.value)}
              style={{ ...selectStyle, border: '1px solid #e5e7eb' }}
            />
          </div>
        </div>
        {/* Active filter pills */}
        {(brandFilter !== 'Tất cả' || starFilter !== 'Tất cả' || categoryFilter !== 'Tất cả' || platformFilter !== 'Tất cả' || searchText || dateFrom || dateTo) && (
          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: '#888' }}>Đang lọc:</span>
            {brandFilter !== 'Tất cả' && <button onClick={() => setBrandFilter('Tất cả')} style={pillStyle(true)}>{brandFilter} ✕</button>}
            {starFilter !== 'Tất cả' && <button onClick={() => setStarFilter('Tất cả')} style={pillStyle(true)}>{starFilter}⭐ ✕</button>}
            {categoryFilter !== 'Tất cả' && <button onClick={() => setCategoryFilter('Tất cả')} style={pillStyle(true)}>{categoryFilter} ✕</button>}
            {platformFilter !== 'Tất cả' && <button onClick={() => setPlatformFilter('Tất cả')} style={pillStyle(true)}>{platformFilter} ✕</button>}
            {dateFrom && <button onClick={() => setDateFrom('')} style={pillStyle(true)}>Từ {dateFrom} ✕</button>}
            {dateTo && <button onClick={() => setDateTo('')} style={pillStyle(true)}>Đến {dateTo} ✕</button>}
            {searchText && <button onClick={() => setSearchText('')} style={pillStyle(true)}>"{searchText}" ✕</button>}
            <button onClick={() => { setBrandFilter('Tất cả'); setStarFilter('Tất cả'); setCategoryFilter('Tất cả'); setPlatformFilter('Tất cả'); setSearchText(''); setDateFrom(''); setDateTo(''); }}
              style={{ ...pillStyle(false), fontSize: 11 }}>Xóa tất cả</button>
          </div>
        )}
      </div>

      {/* Result count */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontSize: 13, color: '#888' }}>Hiển thị <b style={{ color: '#333' }}>{filtered.length}</b> / {rawData.length} đánh giá</span>
      </div>

      {/* Data Table */}
      <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'linear-gradient(135deg, #fff7ed, #fef3c7)' }}>
                {['STT', 'Ngày', 'Brand', 'Sản phẩm', 'Sao', 'Sàn', 'Phân loại', 'Sửa ĐG', 'Cần xử lý', 'Lý do'].map(h => (
                  <th key={h} style={{ padding: '12px 10px', textAlign: 'left', fontWeight: 700, color: '#92400e', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '2px solid #fed7aa', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageData.map((r, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #f3f4f6', transition: 'background 0.15s' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#fffbeb'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <td style={{ padding: '10px', color: '#888', fontSize: 12 }}>{r['STT']}</td>
                  <td style={{ padding: '10px', whiteSpace: 'nowrap', fontSize: 12 }}>{formatDate(r['NGÀY'])}</td>
                  <td style={{ padding: '10px' }}>
                    <span style={{ padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700, background: (BRAND_COLORS[normalizeBrand(r['BRAND'])] || '#6b7280') + '18', color: BRAND_COLORS[normalizeBrand(r['BRAND'])] || '#6b7280' }}>
                      {normalizeBrand(r['BRAND'])}
                    </span>
                  </td>
                  <td style={{ padding: '10px', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r['SẢN PHẨM']}</td>
                  <td style={{ padding: '10px', textAlign: 'center' }}>
                    <span style={{ padding: '2px 8px', borderRadius: 12, fontSize: 12, fontWeight: 700, background: (STAR_COLORS[r['SỐ SAO']] || '#888') + '18', color: STAR_COLORS[r['SỐ SAO']] || '#888' }}>
                      {r['SỐ SAO']}⭐
                    </span>
                  </td>
                  <td style={{ padding: '10px', fontSize: 12, color: '#666' }}>{r['TÊN SÀN']}</td>
                  <td style={{ padding: '10px' }}>
                    {r['PHÂN LOẠI'] && (
                      <span style={{ padding: '3px 8px', borderRadius: 6, fontSize: 11, background: '#f3f4f6', color: '#444' }}>
                        {r['PHÂN LOẠI']}
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '10px', fontSize: 12, color: r['SỬA ĐÁNH GIÁ'] ? '#10b981' : '#ccc' }}>{r['SỬA ĐÁNH GIÁ'] || '—'}</td>
                  <td style={{ padding: '10px', fontSize: 12 }}>
                    {r['CẦN XỬ LÝ'] && (
                      <span style={{ padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600, background: r['CẦN XỬ LÝ'].includes('Cần') ? '#fef2f2' : '#f0fdf4', color: r['CẦN XỬ LÝ'].includes('Cần') ? '#ef4444' : '#22c55e' }}>
                        {r['CẦN XỬ LÝ']}
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '10px', fontSize: 12, color: '#666', maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r['LÝ DO']}>{r['LÝ DO'] || '—'}</td>
                </tr>
              ))}
              {pageData.length === 0 && (
                <tr><td colSpan={10} style={{ textAlign: 'center', padding: 40, color: '#aaa' }}>Không có dữ liệu phù hợp</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 16 }}>
          <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
            style={{ ...pillStyle(false), opacity: page === 1 ? 0.4 : 1 }}>← Trước</button>
          {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
            let p;
            if (totalPages <= 7) p = i + 1;
            else if (page <= 4) p = i + 1;
            else if (page >= totalPages - 3) p = totalPages - 6 + i;
            else p = page - 3 + i;
            return (
              <button key={p} onClick={() => setPage(p)} style={pillStyle(page === p)}>{p}</button>
            );
          })}
          <button disabled={page === totalPages} onClick={() => setPage(p => p + 1)}
            style={{ ...pillStyle(false), opacity: page === totalPages ? 0.4 : 1 }}>Sau →</button>
        </div>
      )}
    </div>
  );
}

// Wrapper with tabs
const TABS = [
  { key: 'danh_gia', label: '📋 Quản lý đánh giá' },
  { key: 'report_cs', label: '📝 Report CS' },
];

export default function CSKHTab() {
  const [tab, setTab] = useState('danh_gia');
  return (
    <div style={{ fontFamily: "'Outfit', sans-serif" }}>
      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: '#f3f4f6', borderRadius: 12, padding: 4, width: 'fit-content' }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{
              padding: '10px 24px', borderRadius: 10, border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer',
              fontFamily: 'system-ui, sans-serif', transition: 'all 0.2s',
              background: tab === t.key ? 'linear-gradient(135deg, #f97316, #ef4444)' : 'transparent',
              color: tab === t.key ? '#fff' : '#666',
              boxShadow: tab === t.key ? '0 2px 8px rgba(249,115,22,0.3)' : 'none',
            }}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'danh_gia' && <DanhGiaTab />}
      {tab === 'report_cs' && <ReportCSTab />}
    </div>
  );
}
