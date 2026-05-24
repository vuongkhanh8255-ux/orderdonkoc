import React, { useState, useEffect, useMemo, useRef } from 'react';
import ReportCSTab from './ReportCSTab';
import ChatInboxTab from './ChatInboxTab';
import { supabase } from '../supabaseClient';
import * as XLSX from 'xlsx';

const PROXY_URL  = 'https://xkyhvcmnkrxdtmwtghln.supabase.co/functions/v1/sheets-proxy';
const CS_SHEET_ID = '1w9Y10K-eSasVbL1_jpT1_o1EkqCJq068OAwRg-ZPYcE';

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
    fetch(`${PROXY_URL}?sheetId=${CS_SHEET_ID}&sheet=${encodeURIComponent('11.1 ĐÁNH GIÁ 2026')}`)
      .then(r => r.json())
      .then(j => {
        const cleaned = (j.data || []).filter(r => r['BRAND'] || r['SẢN PHẨM']);
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
          <h1 className="page-header" style={{ margin: 0 }}>📋 QUẢN LÝ ĐÁNH GIÁ CSKH</h1>
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
                  <td style={{ padding: '10px', color: '#888', fontSize: 12 }}>{(page - 1) * perPage + i + 1}</td>
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

// ── TikTok Account Health Tab ─────────────────────────────────────────────────
const SHOPS = ['BODYMISS', 'MILAGANICS', 'MOAW MOAWS', 'EHERB HCM'];

const METRICS = [
  // { key, label, target, unit, good: 'gte'|'lte', targetVal }
  { section: 'CHĂM SÓC KHÁCH HÀNG', metrics: [
    { key: 'reply_rate_12h',               label: 'Tỷ lệ trả lời 12 giờ',           target: '≥85%',    unit: '%',   good: 'gte', targetVal: 85 },
    { key: 'satisfaction_rate',            label: 'Tỷ lệ hài lòng',                  target: '≥70%',    unit: '%',   good: 'gte', targetVal: 70 },
    { key: 'monthly_conversations',        label: 'Số cuộc trò chuyện 1 tháng',      target: '',        unit: '',    good: null,  targetVal: null },
    { key: 'negative_review_rate',         label: 'Tỷ lệ đánh giá tiêu cực',        target: '≤0.50%',  unit: '%',   good: 'lte', targetVal: 0.50 },
    { key: 'negative_service_review_rate', label: 'Tỷ lệ đánh giá tiêu cực dịch vụ',target: '≤0.50%', unit: '%',   good: 'lte', targetVal: 0.50 },
  ]},
  { section: 'HIỆU SUẤT CỬA HÀNG', metrics: [
    { key: 'return_refund_rate',   label: 'Tỷ lệ trả hàng/hoàn tiền',       target: '≤1.50%',  unit: '%',   good: 'lte', targetVal: 1.50 },
    { key: 'seller_cancel_rate',   label: 'Tỷ lệ hủy do lỗi của người bán', target: '≤2.50%',  unit: '%',   good: 'lte', targetVal: 2.50 },
    { key: 'late_shipping_rate',   label: 'Tỷ lệ gửi hàng muộn',            target: '≤4.00%',  unit: '%',   good: 'lte', targetVal: 4.00 },
    { key: 'fast_shipping_rate',   label: 'Tỷ lệ gửi hàng nhanh',           target: '≥98%',    unit: '%',   good: 'gte', targetVal: 98 },
    { key: 'shop_rating',          label: 'Đánh giá Shop',                   target: '≥4.00/5', unit: '/5',  good: 'gte', targetVal: 4.00 },
  ]},
];

const EMPTY_HEALTH = {
  report_date: new Date().toISOString().slice(0,10),
  shop_name: SHOPS[0],
  reply_rate_12h: '', satisfaction_rate: '', monthly_conversations: '',
  negative_review_rate: '', negative_service_review_rate: '',
  return_refund_rate: '', seller_cancel_rate: '', late_shipping_rate: '',
  fast_shipping_rate: '', shop_rating: '',
};

function getStatus(metric, val) {
  if (val === null || val === undefined || val === '') return 'none';
  const n = Number(val);
  if (isNaN(n)) return 'none';
  if (metric.good === 'gte') return n >= metric.targetVal ? 'good' : 'bad';
  if (metric.good === 'lte') return n <= metric.targetVal ? 'good' : 'bad';
  return 'none';
}

function formatVal(metric, val) {
  if (val === null || val === undefined || val === '') return '—';
  if (metric.unit === '%') return `${val}%`;
  if (metric.unit === '/5') return `${val}/5`;
  return String(val);
}

function TikTokHealthTab() {
  const [records, setRecords]     = useState([]);
  const [loading, setLoading]     = useState(true);
  const [showForm, setShowForm]   = useState(false);
  const [saving, setSaving]       = useState(false);
  const [form, setForm]           = useState(EMPTY_HEALTH);
  const [selectedDate, setSelectedDate] = useState('');
  const [deleteId, setDeleteId]   = useState(null);

  const fetchData = async () => {
    setLoading(true);
    const { data } = await supabase.from('tiktok_account_health').select('*').order('report_date', { ascending: false });
    setRecords(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  // Danh sách tháng có dữ liệu
  const availableDates = [...new Set((records || []).map(r => r.report_date))].sort().reverse();

  // Chọn tháng mới nhất mặc định
  useEffect(() => {
    if (!selectedDate && availableDates.length > 0) setSelectedDate(availableDates[0]);
  }, [availableDates, selectedDate]);

  // Lọc theo tháng đang xem
  const filtered = records.filter(r => !selectedDate || r.report_date === selectedDate);

  const handleSave = async () => {
    setSaving(true);
    const payload = { ...form };
    // Chuyển empty string → null
    Object.keys(payload).forEach(k => { if (payload[k] === '') payload[k] = null; });
    const { error } = await supabase.from('tiktok_account_health').insert([payload]);
    if (!error) { await fetchData(); setShowForm(false); setForm(EMPTY_HEALTH); }
    else alert('Lỗi lưu: ' + error.message);
    setSaving(false);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Xóa bản ghi này?')) return;
    await supabase.from('tiktok_account_health').delete().eq('id', id);
    await fetchData();
    setDeleteId(null);
  };

  const card = { background: '#fff', borderRadius: 12, border: '1px solid #f3f4f6', boxShadow: '0 1px 3px rgba(0,0,0,0.07)' };

  return (
    <div style={{ fontFamily: "'Outfit', sans-serif" }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 900, color: '#0f172a' }}>🔴 Điểm tình trạng tài khoản TikTok</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#888' }}>Theo dõi chỉ số CSKH & Hiệu suất cửa hàng theo từng kỳ báo cáo</p>
        </div>
        <button onClick={() => { setForm(EMPTY_HEALTH); setShowForm(true); }}
          style={{ padding: '10px 20px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #f97316, #ef4444)', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer', boxShadow: '0 4px 12px rgba(249,115,22,0.3)' }}>
          + Nhập kỳ mới
        </button>
      </div>

      {/* Chọn kỳ báo cáo */}
      {availableDates.length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
          {availableDates.map(d => (
            <button key={d} onClick={() => setSelectedDate(d)}
              style={{ padding: '8px 18px', borderRadius: 20, border: 'none', fontWeight: 700, fontSize: 13, cursor: 'pointer',
                background: selectedDate === d ? '#0f172a' : '#f3f4f6',
                color: selectedDate === d ? '#fff' : '#555', transition: 'all 0.18s' }}>
              {new Date(d + 'T00:00:00').toLocaleDateString('vi-VN', { day:'2-digit', month:'2-digit', year:'numeric' })}
            </button>
          ))}
        </div>
      )}

      {loading && <div style={{ textAlign: 'center', padding: 60, color: '#888' }}>⏳ Đang tải...</div>}

      {!loading && filtered.length === 0 && (
        <div style={{ ...card, padding: 60, textAlign: 'center', color: '#aaa' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📊</div>
          <div style={{ fontSize: 15, fontWeight: 600 }}>Chưa có dữ liệu</div>
          <div style={{ fontSize: 13, marginTop: 6 }}>Bấm "+ Nhập kỳ mới" để thêm số liệu</div>
        </div>
      )}

      {/* Bảng chỉ số theo từng shop */}
      {!loading && filtered.length > 0 && METRICS.map(({ section, metrics: mList }) => (
        <div key={section} style={{ ...card, marginBottom: 20, overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', background: '#1e293b', color: '#fff' }}>
            <span style={{ fontWeight: 800, fontSize: '0.9rem', letterSpacing: '0.5px' }}>{section}</span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700, color: '#64748b', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '2px solid #e5e7eb', minWidth: 220 }}>Chỉ số</th>
                  <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 700, color: '#64748b', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '2px solid #e5e7eb', minWidth: 90 }}>Chỉ tiêu</th>
                  {SHOPS.map(shop => {
                    const rec = filtered.find(r => r.shop_name === shop);
                    return (
                      <th key={shop} style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 800, color: '#0f172a', fontSize: 12, borderBottom: '2px solid #e5e7eb', minWidth: 130, background: rec ? '#fffbeb' : '#f8fafc' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                          TIKTOK {shop}
                          {rec && (
                            <button onClick={() => handleDelete(rec.id)} title="Xóa" style={{ padding: '1px 5px', borderRadius: 4, border: 'none', background: '#fee2e2', color: '#ef4444', fontSize: 10, cursor: 'pointer', fontWeight: 700, lineHeight: 1.4 }}>✕</button>
                          )}
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {mList.map((m, i) => (
                  <tr key={m.key} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                    <td style={{ padding: '11px 16px', fontWeight: 500, color: '#334155' }}>{m.label}</td>
                    <td style={{ padding: '11px 16px', textAlign: 'center', color: '#64748b', fontSize: 12 }}>{m.target || '—'}</td>
                    {SHOPS.map(shop => {
                      const rec = filtered.find(r => r.shop_name === shop);
                      const val = rec ? rec[m.key] : null;
                      const status = getStatus(m, val);
                      const bg = status === 'good' ? '#f0fdf4' : status === 'bad' ? '#fef2f2' : 'transparent';
                      const color = status === 'good' ? '#16a34a' : status === 'bad' ? '#dc2626' : '#94a3b8';
                      return (
                        <td key={shop} style={{ padding: '11px 16px', textAlign: 'center' }}>
                          <span style={{ display: 'inline-block', minWidth: 70, padding: '4px 10px', borderRadius: 8, fontWeight: 700, fontSize: 13, background: bg, color }}>
                            {formatVal(m, val)}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {/* Legend */}
      {!loading && filtered.length > 0 && (
        <div style={{ display: 'flex', gap: 16, fontSize: 12, color: '#888', marginBottom: 20 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 12, height: 12, borderRadius: 3, background: '#f0fdf4', border: '1px solid #16a34a', display: 'inline-block' }} /> Đạt chỉ tiêu</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 12, height: 12, borderRadius: 3, background: '#fef2f2', border: '1px solid #dc2626', display: 'inline-block' }} /> Không đạt</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 12, height: 12, borderRadius: 3, background: '#f8fafc', border: '1px solid #e5e7eb', display: 'inline-block' }} /> Chưa có dữ liệu</span>
        </div>
      )}

      {/* Form nhập liệu */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(4px)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={() => setShowForm(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, width: 'min(600px, 95vw)', maxHeight: '90vh', overflow: 'auto', padding: '24px 28px', boxShadow: '0 30px 80px rgba(0,0,0,0.25)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 900 }}>📊 Nhập số liệu TikTok</h2>
              <button onClick={() => setShowForm(false)} style={{ border: 'none', background: 'none', fontSize: '1.4rem', cursor: 'pointer', color: '#94a3b8' }}>×</button>
            </div>

            {/* Kỳ + Shop */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 18 }}>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 5 }}>Ngày báo cáo</label>
                <input type="date" value={form.report_date} onChange={e => setForm(p => ({ ...p, report_date: e.target.value }))}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #e5e7eb', fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 5 }}>Shop</label>
                <select value={form.shop_name} onChange={e => setForm(p => ({ ...p, shop_name: e.target.value }))}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #e5e7eb', fontSize: 14, background: '#fff', outline: 'none', boxSizing: 'border-box' }}>
                  {SHOPS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>

            {/* Metrics */}
            {METRICS.map(({ section, metrics: mList }) => (
              <div key={section} style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: '#f97316', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10, paddingBottom: 6, borderBottom: '2px solid #fed7aa' }}>
                  {section}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {mList.map(m => (
                    <div key={m.key} style={{ display: 'grid', gridTemplateColumns: '1fr 140px', gap: 10, alignItems: 'center' }}>
                      <label style={{ fontSize: 13, color: '#374151' }}>
                        {m.label}
                        {m.target && <span style={{ marginLeft: 6, fontSize: 11, color: '#94a3b8' }}>({m.target})</span>}
                      </label>
                      <input
                        type="number" step="0.01"
                        placeholder={m.unit === '%' ? '0.00' : m.unit === '/5' ? '0.0' : '0'}
                        value={form[m.key]}
                        onChange={e => setForm(p => ({ ...p, [m.key]: e.target.value }))}
                        style={{ padding: '8px 10px', borderRadius: 8, border: '1.5px solid #e5e7eb', fontSize: 13, outline: 'none', textAlign: 'right', boxSizing: 'border-box' }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}

            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button onClick={() => setShowForm(false)} style={{ flex: 1, padding: 12, borderRadius: 9, border: '1.5px solid #e5e7eb', background: '#fff', color: '#64748b', fontWeight: 700, cursor: 'pointer', fontSize: 14 }}>
                Hủy
              </button>
              <button onClick={handleSave} disabled={saving} style={{ flex: 2, padding: 12, borderRadius: 9, border: 'none', background: saving ? '#d1d5db' : 'linear-gradient(135deg, #f97316, #ef4444)', color: '#fff', fontWeight: 800, cursor: saving ? 'default' : 'pointer', fontSize: 14, boxShadow: saving ? 'none' : '0 4px 12px rgba(249,115,22,0.3)' }}>
                {saving ? '⏳ Đang lưu...' : '💾 Lưu'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── TikTok API Reviews Tab ──────────────────────────────────────────────────
const SHOP_COLORS = {
  'BODYMISS':      '#3b82f6',
  'MILAGANICS':    '#10b981',
  'MOAW MOAWS':    '#f97316',
  'MOAWS':         '#f97316',
  'EHERB HCM':     '#eab308',
  'EHERB':         '#eab308',
  'REAL STEEL':    '#8b5cf6',
};

const normalizeShopName = (name) => {
  if (!name) return 'Không rõ';
  const n = name.toUpperCase().trim();
  if (n.includes('BODYMISS')) return 'BODYMISS';
  if (n.includes('MILAGANICS') || n.includes('MILA')) return 'MILAGANICS';
  if (n.includes('MOAW')) return 'MOAW MOAWS';
  if (n.includes('EHERB')) return 'EHERB HCM';
  if (n.includes('REAL') && n.includes('STEEL')) return 'REAL STEEL';
  return name.trim();
};

function TikTokReviewsTab() {
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const [error, setError] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [showImportGuide, setShowImportGuide] = useState(false);
  const fileInputRef = useRef(null);

  // Filters
  const [shopFilter, setShopFilter] = useState('Tất cả');
  const [ratingFilter, setRatingFilter] = useState('Tất cả');
  const [replyFilter, setReplyFilter] = useState('Tất cả');
  const [searchText, setSearchText] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Pagination
  const [page, setPage] = useState(1);
  const perPage = 20;

  const fetchReviews = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: dbErr } = await supabase
        .from('tiktok_shop_reviews')
        .select('*')
        .order('review_at', { ascending: false })
        .limit(2000);
      if (dbErr) throw dbErr;
      setReviews(data || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchReviews(); }, []);

  // Trigger sync
  const handleSync = async (fullSync = false) => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const url = `/api/tiktok-shop/sync-reviews${fullSync ? '?full_sync=1' : ''}`;
      const resp = await fetch(url);
      const json = await resp.json();
      setSyncResult(json);
      if (json.success && json.total_upserted > 0) {
        await fetchReviews();
      }
    } catch (e) {
      setSyncResult({ success: false, message: e.message });
    } finally {
      setSyncing(false);
    }
  };

  // ── Import Excel/CSV handler ─────────────────────────────────────────────
  const COLUMN_MAP = {
    // Vietnamese column names from Seller Center
    'mã đơn hàng': 'order_id', 'order id': 'order_id', 'order_id': 'order_id', 'mã đơn': 'order_id',
    'sản phẩm': 'product_name', 'product name': 'product_name', 'product_name': 'product_name', 'tên sản phẩm': 'product_name', 'tên sp': 'product_name',
    'mã sản phẩm': 'product_id', 'product id': 'product_id', 'product_id': 'product_id',
    'sku': 'sku_name', 'sku_name': 'sku_name', 'phân loại': 'sku_name', 'biến thể': 'sku_name', 'variation': 'sku_name',
    'đánh giá': 'rating', 'rating': 'rating', 'số sao': 'rating', 'star': 'rating', 'sao': 'rating', 'điểm': 'rating',
    'nội dung': 'review_text', 'review': 'review_text', 'review_text': 'review_text', 'nhận xét': 'review_text', 'bình luận': 'review_text', 'comment': 'review_text', 'nội dung đánh giá': 'review_text',
    'người mua': 'reviewer_name', 'buyer': 'reviewer_name', 'reviewer': 'reviewer_name', 'reviewer_name': 'reviewer_name', 'khách hàng': 'reviewer_name', 'tên người mua': 'reviewer_name', 'username': 'reviewer_name',
    'ngày': 'review_at', 'date': 'review_at', 'review_at': 'review_at', 'thời gian': 'review_at', 'ngày đánh giá': 'review_at', 'created': 'review_at', 'create_time': 'review_at', 'ngày tạo': 'review_at',
    'trả lời': 'seller_reply', 'reply': 'seller_reply', 'seller_reply': 'seller_reply', 'phản hồi': 'seller_reply',
    'shop': 'seller_name', 'seller': 'seller_name', 'seller_name': 'seller_name', 'cửa hàng': 'seller_name', 'tên shop': 'seller_name',
  };

  const parseExcelDate = (val) => {
    if (!val) return null;
    // Excel serial number
    if (typeof val === 'number' && val > 25000 && val < 100000) {
      const d = new Date((val - 25569) * 86400 * 1000);
      return d.toISOString();
    }
    // String date
    if (typeof val === 'string') {
      // Try DD/MM/YYYY or DD-MM-YYYY
      const vn = val.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
      if (vn) return new Date(`${vn[3]}-${vn[2].padStart(2,'0')}-${vn[1].padStart(2,'0')}T00:00:00`).toISOString();
      // Try YYYY-MM-DD
      const iso = val.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (iso) return new Date(val).toISOString();
      // Try other formats
      const d = new Date(val);
      if (!isNaN(d)) return d.toISOString();
    }
    if (val instanceof Date && !isNaN(val)) return val.toISOString();
    return null;
  };

  const parseRatingValue = (val) => {
    if (!val) return null;
    const n = typeof val === 'number' ? val : parseInt(String(val).replace(/[^\d]/g, ''), 10);
    return (n >= 1 && n <= 5) ? n : null;
  };

  const handleImportFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportResult(null);

    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array', cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json(ws, { defval: '' });

      if (!raw.length) {
        setImportResult({ success: false, message: 'File rỗng — không có dữ liệu' });
        return;
      }

      // Map columns
      const headers = Object.keys(raw[0]);
      const colMapping = {};
      headers.forEach(h => {
        const key = h.toLowerCase().trim();
        if (COLUMN_MAP[key]) colMapping[h] = COLUMN_MAP[key];
      });

      const mappedFields = Object.values(colMapping);
      if (!mappedFields.includes('review_text') && !mappedFields.includes('rating') && !mappedFields.includes('product_name')) {
        setImportResult({
          success: false,
          message: `Không nhận diện được cột dữ liệu. Cần ít nhất 1 trong: Nội dung/Review, Đánh giá/Rating, Sản phẩm/Product Name.`,
          hint: `Cột tìm thấy: ${headers.join(', ')}`,
        });
        return;
      }

      // Parse rows
      const now = new Date().toISOString();
      const parsed = raw.map((row, idx) => {
        const mapped = {};
        Object.entries(colMapping).forEach(([origCol, field]) => {
          mapped[field] = row[origCol];
        });

        const rating = parseRatingValue(mapped.rating);
        const reviewAt = parseExcelDate(mapped.review_at) || now;
        const reviewText = String(mapped.review_text || '').trim();
        const sellerReply = mapped.seller_reply ? String(mapped.seller_reply).trim() : null;

        return {
          shop_id: mapped.seller_name ? String(mapped.seller_name).trim() : 'import',
          seller_name: mapped.seller_name ? String(mapped.seller_name).trim() : file.name.replace(/\.[^.]+$/, ''),
          review_id: `import_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 6)}`,
          order_id: mapped.order_id ? String(mapped.order_id).trim() : null,
          product_id: mapped.product_id ? String(mapped.product_id).trim() : null,
          product_name: mapped.product_name ? String(mapped.product_name).trim() : '',
          sku_name: mapped.sku_name ? String(mapped.sku_name).trim() : null,
          rating,
          review_text: reviewText,
          reviewer_name: mapped.reviewer_name ? String(mapped.reviewer_name).trim() : '',
          reviewer_avatar: null,
          review_images: [],
          seller_reply: sellerReply || null,
          reply_at: null,
          review_at: reviewAt,
          is_replied: !!sellerReply,
          platform: 'TikTok',
          raw_data: row,
          synced_at: now,
        };
      }).filter(r => r.review_text || r.rating || r.product_name); // skip empty rows

      if (parsed.length === 0) {
        setImportResult({ success: false, message: 'Không tìm thấy dòng dữ liệu hợp lệ' });
        return;
      }

      // Upsert in batches
      const batchSize = 100;
      let totalInserted = 0;
      let errors = [];

      for (let i = 0; i < parsed.length; i += batchSize) {
        const batch = parsed.slice(i, i + batchSize);
        const { error: upsertErr } = await supabase
          .from('tiktok_shop_reviews')
          .upsert(batch, { onConflict: 'shop_id,review_id' });

        if (upsertErr) {
          errors.push(upsertErr.message);
        } else {
          totalInserted += batch.length;
        }
      }

      setImportResult({
        success: totalInserted > 0,
        message: `Đã import ${totalInserted}/${parsed.length} đánh giá từ "${file.name}"`,
        columns_mapped: Object.entries(colMapping).map(([k, v]) => `${k} → ${v}`),
        errors: errors.length > 0 ? errors : undefined,
      });

      if (totalInserted > 0) await fetchReviews();

    } catch (err) {
      setImportResult({ success: false, message: `Lỗi đọc file: ${err.message}` });
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Unique filter values
  const shops = useMemo(() => ['Tất cả', ...new Set(reviews.map(r => normalizeShopName(r.seller_name)).filter(Boolean))], [reviews]);

  // Filtered data
  const filtered = useMemo(() => {
    return reviews.filter(r => {
      if (shopFilter !== 'Tất cả' && normalizeShopName(r.seller_name) !== shopFilter) return false;
      if (ratingFilter !== 'Tất cả' && String(r.rating) !== String(ratingFilter)) return false;
      if (replyFilter === 'Đã trả lời' && !r.is_replied) return false;
      if (replyFilter === 'Chưa trả lời' && r.is_replied) return false;
      if (dateFrom || dateTo) {
        const ts = r.review_at ? new Date(r.review_at).getTime() : 0;
        if (!ts) return false;
        if (dateFrom && ts < new Date(dateFrom).setHours(0, 0, 0, 0)) return false;
        if (dateTo && ts > new Date(dateTo).setHours(23, 59, 59, 999)) return false;
      }
      if (searchText) {
        const s = searchText.toLowerCase();
        const match = [r.product_name, r.review_text, r.reviewer_name, r.order_id]
          .some(v => v && String(v).toLowerCase().includes(s));
        if (!match) return false;
      }
      return true;
    });
  }, [reviews, shopFilter, ratingFilter, replyFilter, searchText, dateFrom, dateTo]);

  // Stats
  const stats = useMemo(() => {
    const byShop = {};
    const byStar = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let totalRating = 0;
    let ratingCount = 0;
    let replied = 0;

    filtered.forEach(r => {
      const shop = normalizeShopName(r.seller_name);
      byShop[shop] = (byShop[shop] || 0) + 1;
      if (r.rating >= 1 && r.rating <= 5) {
        byStar[r.rating]++;
        totalRating += r.rating;
        ratingCount++;
      }
      if (r.is_replied) replied++;
    });

    return {
      byShop,
      byStar,
      total: filtered.length,
      avgRating: ratingCount > 0 ? (totalRating / ratingCount).toFixed(1) : '0.0',
      replyRate: filtered.length > 0 ? ((replied / filtered.length) * 100).toFixed(1) : '0.0',
      replied,
      negative: (byStar[1] || 0) + (byStar[2] || 0),
    };
  }, [filtered]);

  // Top products with most reviews
  const topProducts = useMemo(() => {
    const map = {};
    filtered.forEach(r => {
      const p = r.product_name || 'Không rõ';
      if (!map[p]) map[p] = { count: 0, totalRating: 0, ratingCount: 0 };
      map[p].count++;
      if (r.rating) { map[p].totalRating += r.rating; map[p].ratingCount++; }
    });
    return Object.entries(map)
      .map(([name, d]) => ({ name, count: d.count, avg: d.ratingCount > 0 ? (d.totalRating / d.ratingCount).toFixed(1) : '—' }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }, [filtered]);

  const totalPages = Math.ceil(filtered.length / perPage);
  const pageData = filtered.slice((page - 1) * perPage, page * perPage);

  useEffect(() => { setPage(1); }, [shopFilter, ratingFilter, replyFilter, searchText, dateFrom, dateTo]);

  const formatDate = (d) => {
    if (!d) return '—';
    try {
      const dt = new Date(d);
      if (isNaN(dt)) return '—';
      return dt.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch { return '—'; }
  };

  const formatTime = (d) => {
    if (!d) return '';
    try {
      const dt = new Date(d);
      return dt.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    } catch { return ''; }
  };

  const card = { background: '#fff', borderRadius: 12, padding: '16px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', border: '1px solid #f3f4f6' };
  const labelSt = { fontSize: 11, color: '#888', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4, letterSpacing: '0.5px' };
  const selectSt = { width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13, background: '#fff', cursor: 'pointer', outline: 'none' };
  const pill = (active) => ({
    padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: 'none',
    background: active ? 'linear-gradient(135deg, #f97316, #ef4444)' : '#f3f4f6',
    color: active ? '#fff' : '#666', transition: 'all 0.2s',
  });

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>⏳</div>
        <p style={{ color: '#888', fontSize: 14 }}>Đang tải đánh giá TikTok...</p>
      </div>
    </div>
  );

  return (
    <div style={{ fontFamily: "'Outfit', sans-serif" }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 className="page-header" style={{ margin: 0 }}>🛍️ ĐÁNH GIÁ TIKTOK SHOP (API)</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#888' }}>
            Nguồn: TikTok Shop Open API — Customer Reviews
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button onClick={() => handleSync(false)} disabled={syncing}
            style={{ padding: '10px 20px', borderRadius: 10, border: 'none', background: syncing ? '#d1d5db' : 'linear-gradient(135deg, #f97316, #ef4444)', color: '#fff', fontWeight: 700, fontSize: 13, cursor: syncing ? 'default' : 'pointer', boxShadow: syncing ? 'none' : '0 4px 12px rgba(249,115,22,0.3)', transition: 'all 0.2s' }}>
            {syncing ? '⏳ Đang đồng bộ...' : '🔄 Sync đánh giá'}
          </button>
          <button onClick={() => handleSync(true)} disabled={syncing}
            style={{ padding: '10px 16px', borderRadius: 10, border: '2px solid #e5e7eb', background: '#fff', color: '#666', fontWeight: 600, fontSize: 13, cursor: syncing ? 'default' : 'pointer' }}>
            Full Sync
          </button>
          <div style={{ width: 1, height: 28, background: '#e5e7eb' }} />
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleImportFile} style={{ display: 'none' }} />
          <button onClick={() => fileInputRef.current?.click()} disabled={importing}
            style={{ padding: '10px 16px', borderRadius: 10, border: '2px solid #dbeafe', background: importing ? '#e5e7eb' : '#eff6ff', color: importing ? '#999' : '#2563eb', fontWeight: 700, fontSize: 13, cursor: importing ? 'default' : 'pointer', transition: 'all 0.2s' }}>
            {importing ? '⏳ Importing...' : '📥 Import Excel'}
          </button>
          <button onClick={() => setShowImportGuide(!showImportGuide)}
            style={{ padding: '10px 12px', borderRadius: 10, border: '2px solid #e5e7eb', background: showImportGuide ? '#fef3c7' : '#fff', color: '#666', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
            title="Hướng dẫn import">
            ❓
          </button>
        </div>
      </div>

      {/* Import Guide */}
      {showImportGuide && (
        <div style={{ ...card, marginBottom: 16, background: '#fffbeb', borderLeft: '4px solid #f59e0b' }}>
          <h3 style={{ margin: '0 0 8px', fontSize: 14, color: '#b45309' }}>📥 Hướng dẫn Import Excel / CSV</h3>
          <ol style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: '#78350f', lineHeight: 1.8 }}>
            <li>Vào <b>TikTok Seller Center</b> → Đánh giá → Export Excel</li>
            <li>File cần có ít nhất 1 cột: <b>Nội dung/Review</b>, <b>Đánh giá/Rating</b>, hoặc <b>Sản phẩm/Product Name</b></li>
            <li>Cột tự nhận diện (Tiếng Việt & English): Mã đơn hàng, Sản phẩm, SKU, Đánh giá, Nội dung, Người mua, Ngày, Shop...</li>
            <li>Hỗ trợ định dạng: <code>.xlsx</code>, <code>.xls</code>, <code>.csv</code></li>
          </ol>
          <button onClick={() => setShowImportGuide(false)} style={{ marginTop: 10, fontSize: 12, padding: '4px 12px', borderRadius: 6, border: '1px solid #fbbf24', background: '#fef3c7', color: '#92400e', cursor: 'pointer', fontWeight: 600 }}>Đóng</button>
        </div>
      )}

      {/* Import Result Banner */}
      {importResult && (
        <div style={{
          ...card, marginBottom: 16, borderLeft: `4px solid ${importResult.success ? '#3b82f6' : '#ef4444'}`,
          background: importResult.success ? '#eff6ff' : '#fef2f2',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <span style={{ fontWeight: 700, fontSize: 14, color: importResult.success ? '#2563eb' : '#dc2626' }}>
                {importResult.success ? '📥' : '❌'} {importResult.message}
              </span>
              {importResult.columns_mapped && (
                <p style={{ margin: '6px 0 0', fontSize: 11, color: '#6b7280' }}>
                  Cột đã map: {importResult.columns_mapped.join(' | ')}
                </p>
              )}
              {importResult.hint && (
                <p style={{ margin: '4px 0 0', fontSize: 11, color: '#9ca3af' }}>{importResult.hint}</p>
              )}
              {importResult.errors && (
                <p style={{ margin: '4px 0 0', fontSize: 11, color: '#dc2626' }}>Lỗi: {importResult.errors.join(', ')}</p>
              )}
            </div>
            <button onClick={() => setImportResult(null)} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 16, color: '#999' }}>×</button>
          </div>
        </div>
      )}

      {/* Sync Result Banner */}
      {syncResult && (
        <div style={{
          ...card, marginBottom: 16, borderLeft: `4px solid ${syncResult.success ? '#10b981' : '#ef4444'}`,
          background: syncResult.success ? '#f0fdf4' : '#fef2f2',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span style={{ fontWeight: 700, color: syncResult.success ? '#16a34a' : '#dc2626' }}>
                {syncResult.success ? '✅' : '❌'} {syncResult.success ? `Đã sync ${syncResult.total_upserted || 0} đánh giá` : 'Sync thất bại'}
              </span>
              {syncResult.source && (
                <span style={{ marginLeft: 12, fontSize: 11, padding: '2px 8px', borderRadius: 4, background: syncResult.source === 'research_api' ? '#ede9fe' : '#ecfdf5', color: syncResult.source === 'research_api' ? '#7c3aed' : '#059669' }}>
                  {syncResult.source === 'research_api' ? '🔬 Research API' : '🏪 Partner API'}
                </span>
              )}
              {syncResult.endpoint_used && (
                <span style={{ marginLeft: 8, fontSize: 12, color: '#888' }}>{syncResult.endpoint_used}</span>
              )}
              {syncResult.message && (
                <p style={{ margin: '6px 0 0', fontSize: 12, color: syncResult.success ? '#16a34a' : '#888' }}>{syncResult.message}</p>
              )}
              {syncResult.hint && (
                <p style={{ margin: '4px 0 0', fontSize: 12, color: '#b45309' }}>💡 {syncResult.hint}</p>
              )}
            </div>
            <button onClick={() => setSyncResult(null)} style={{ border: 'none', background: 'none', fontSize: 18, cursor: 'pointer', color: '#94a3b8' }}>×</button>
          </div>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div style={{ ...card, marginBottom: 16, borderLeft: '4px solid #ef4444', background: '#fef2f2' }}>
          <span style={{ fontWeight: 700, color: '#dc2626' }}>⚠️ Lỗi tải dữ liệu: {error}</span>
        </div>
      )}

      {/* Stats Overview */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 20 }}>
        <div style={{ ...card, borderTop: '3px solid #f97316' }}>
          <div style={labelSt}>Tổng đánh giá</div>
          <div style={{ fontSize: 28, fontWeight: 900, color: '#f97316' }}>{stats.total}</div>
        </div>
        <div style={{ ...card, borderTop: '3px solid #10b981' }}>
          <div style={labelSt}>Đánh giá TB</div>
          <div style={{ fontSize: 28, fontWeight: 900, color: '#10b981' }}>{stats.avgRating} ⭐</div>
        </div>
        <div style={{ ...card, borderTop: '3px solid #3b82f6' }}>
          <div style={labelSt}>Tỷ lệ phản hồi</div>
          <div style={{ fontSize: 28, fontWeight: 900, color: '#3b82f6' }}>{stats.replyRate}%</div>
          <div style={{ fontSize: 11, color: '#aaa' }}>{stats.replied}/{stats.total} đã trả lời</div>
        </div>
        <div style={{ ...card, borderTop: '3px solid #ef4444' }}>
          <div style={labelSt}>Đánh giá xấu</div>
          <div style={{ fontSize: 28, fontWeight: 900, color: '#ef4444' }}>{stats.negative}</div>
          <div style={{ fontSize: 11, color: '#aaa' }}>1-2 sao</div>
        </div>
      </div>

      {/* Shop cards + Star distribution */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
        {/* By Shop */}
        <div style={card}>
          <div style={{ ...labelSt, marginBottom: 12 }}>Theo Shop</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {Object.entries(stats.byShop).sort((a, b) => b[1] - a[1]).map(([shop, count]) => {
              const pct = stats.total > 0 ? (count / stats.total * 100).toFixed(1) : 0;
              const color = SHOP_COLORS[shop] || '#6b7280';
              return (
                <div key={shop} onClick={() => setShopFilter(shopFilter === shop ? 'Tất cả' : shop)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '6px 10px', borderRadius: 8, background: shopFilter === shop ? color + '15' : 'transparent', transition: 'all 0.2s' }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: color, flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: 13, fontWeight: shopFilter === shop ? 700 : 400 }}>{shop}</span>
                  <span style={{ fontWeight: 800, color, fontSize: 14 }}>{count}</span>
                  <span style={{ fontSize: 11, color: '#aaa', width: 40, textAlign: 'right' }}>{pct}%</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Star distribution */}
        <div style={card}>
          <div style={{ ...labelSt, marginBottom: 12 }}>Phân bố số sao</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[5, 4, 3, 2, 1].map(s => {
              const count = stats.byStar[s] || 0;
              const pct = stats.total > 0 ? (count / stats.total * 100) : 0;
              return (
                <div key={s} onClick={() => setRatingFilter(ratingFilter === String(s) ? 'Tất cả' : String(s))}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '4px 0' }}>
                  <span style={{ fontSize: 13, fontWeight: 600, width: 20, textAlign: 'right', color: STAR_COLORS[s] }}>{s}⭐</span>
                  <div style={{ flex: 1, height: 16, borderRadius: 8, background: '#f3f4f6', overflow: 'hidden' }}>
                    <div style={{ height: '100%', borderRadius: 8, background: ratingFilter === String(s) ? STAR_COLORS[s] : STAR_COLORS[s] + 'aa', width: `${pct}%`, transition: 'width 0.3s', minWidth: pct > 0 ? 4 : 0 }} />
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: STAR_COLORS[s], width: 30, textAlign: 'right' }}>{count}</span>
                  <span style={{ fontSize: 11, color: '#aaa', width: 40, textAlign: 'right' }}>{pct.toFixed(1)}%</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Top Products */}
      {topProducts.length > 0 && (
        <div style={{ ...card, marginBottom: 20 }}>
          <div style={{ ...labelSt, marginBottom: 12 }}>Top sản phẩm có nhiều đánh giá</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8 }}>
            {topProducts.map((p, i) => (
              <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8, background: '#f9fafb', border: '1px solid #f3f4f6' }}>
                <span style={{ width: 24, height: 24, borderRadius: 6, background: i < 3 ? 'linear-gradient(135deg, #f97316, #ef4444)' : '#e5e7eb', color: i < 3 ? '#fff' : '#888', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, flexShrink: 0 }}>{i + 1}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.name}>{p.name}</div>
                  <div style={{ fontSize: 11, color: '#888' }}>{p.count} đánh giá · ⭐ {p.avg}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div style={{ ...card, marginBottom: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, alignItems: 'end' }}>
          <div>
            <div style={labelSt}>Shop</div>
            <select value={shopFilter} onChange={e => setShopFilter(e.target.value)} style={selectSt}>
              {shops.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <div style={labelSt}>Số sao</div>
            <select value={ratingFilter} onChange={e => setRatingFilter(e.target.value)} style={selectSt}>
              <option value="Tất cả">Tất cả</option>
              {[5, 4, 3, 2, 1].map(s => <option key={s} value={s}>{s} ⭐</option>)}
            </select>
          </div>
          <div>
            <div style={labelSt}>Trạng thái</div>
            <select value={replyFilter} onChange={e => setReplyFilter(e.target.value)} style={selectSt}>
              <option value="Tất cả">Tất cả</option>
              <option value="Đã trả lời">Đã trả lời</option>
              <option value="Chưa trả lời">Chưa trả lời</option>
            </select>
          </div>
          <div>
            <div style={labelSt}>Từ ngày</div>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={selectSt} />
          </div>
          <div>
            <div style={labelSt}>Đến ngày</div>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={selectSt} />
          </div>
          <div>
            <div style={labelSt}>Tìm kiếm</div>
            <input type="text" placeholder="Tên SP, nội dung, người đánh giá..."
              value={searchText} onChange={e => setSearchText(e.target.value)}
              style={{ ...selectSt, border: '1px solid #e5e7eb' }} />
          </div>
        </div>
        {/* Active pills */}
        {(shopFilter !== 'Tất cả' || ratingFilter !== 'Tất cả' || replyFilter !== 'Tất cả' || searchText || dateFrom || dateTo) && (
          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: '#888' }}>Đang lọc:</span>
            {shopFilter !== 'Tất cả' && <button onClick={() => setShopFilter('Tất cả')} style={pill(true)}>{shopFilter} ✕</button>}
            {ratingFilter !== 'Tất cả' && <button onClick={() => setRatingFilter('Tất cả')} style={pill(true)}>{ratingFilter}⭐ ✕</button>}
            {replyFilter !== 'Tất cả' && <button onClick={() => setReplyFilter('Tất cả')} style={pill(true)}>{replyFilter} ✕</button>}
            {dateFrom && <button onClick={() => setDateFrom('')} style={pill(true)}>Từ {dateFrom} ✕</button>}
            {dateTo && <button onClick={() => setDateTo('')} style={pill(true)}>Đến {dateTo} ✕</button>}
            {searchText && <button onClick={() => setSearchText('')} style={pill(true)}>"{searchText}" ✕</button>}
            <button onClick={() => { setShopFilter('Tất cả'); setRatingFilter('Tất cả'); setReplyFilter('Tất cả'); setSearchText(''); setDateFrom(''); setDateTo(''); }}
              style={{ ...pill(false), fontSize: 11 }}>Xóa tất cả</button>
          </div>
        )}
      </div>

      {/* Result count */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontSize: 13, color: '#888' }}>Hiển thị <b style={{ color: '#333' }}>{filtered.length}</b> / {reviews.length} đánh giá</span>
        {reviews.length > 0 && (
          <span style={{ fontSize: 11, color: '#aaa' }}>
            Sync gần nhất: {formatDate(reviews[0]?.synced_at)} {formatTime(reviews[0]?.synced_at)}
          </span>
        )}
      </div>

      {/* Review Cards (card-based layout for better UX) */}
      {filtered.length === 0 && !loading ? (
        <div style={{ ...card, padding: 60, textAlign: 'center', color: '#aaa' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📭</div>
          <div style={{ fontSize: 15, fontWeight: 600 }}>
            {reviews.length === 0 ? 'Chưa có dữ liệu đánh giá' : 'Không có kết quả phù hợp'}
          </div>
          {reviews.length === 0 && (
            <div style={{ fontSize: 13, marginTop: 8, color: '#888' }}>
              Bấm "🔄 Sync đánh giá" để kéo dữ liệu từ TikTok Shop API
            </div>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {pageData.map((r, idx) => {
            const shopName = normalizeShopName(r.seller_name);
            const shopColor = SHOP_COLORS[shopName] || '#6b7280';
            return (
              <div key={r.id || idx} style={{ ...card, padding: 0, overflow: 'hidden', borderLeft: `4px solid ${STAR_COLORS[r.rating] || '#e5e7eb'}` }}>
                <div style={{ padding: '14px 18px' }}>
                  {/* Top row: reviewer + rating + date */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 36, height: 36, borderRadius: '50%', background: `${shopColor}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800, color: shopColor, flexShrink: 0 }}>
                        {(r.reviewer_name || '?')[0]?.toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 13, color: '#0f172a' }}>{r.reviewer_name || 'Ẩn danh'}</div>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 2 }}>
                          <span style={{ padding: '1px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700, background: shopColor + '18', color: shopColor }}>{shopName}</span>
                          <span style={{ fontSize: 11, color: '#aaa' }}>{formatDate(r.review_at)}</span>
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      {r.rating && (
                        <span style={{ padding: '3px 10px', borderRadius: 8, fontSize: 13, fontWeight: 800, background: (STAR_COLORS[r.rating] || '#888') + '18', color: STAR_COLORS[r.rating] || '#888' }}>
                          {'⭐'.repeat(r.rating)}
                        </span>
                      )}
                      <span style={{ padding: '3px 8px', borderRadius: 6, fontSize: 10, fontWeight: 700, background: r.is_replied ? '#f0fdf4' : '#fef2f2', color: r.is_replied ? '#16a34a' : '#dc2626' }}>
                        {r.is_replied ? '✅ Đã TL' : '⏳ Chưa TL'}
                      </span>
                    </div>
                  </div>

                  {/* Product info */}
                  {r.product_name && (
                    <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6, display: 'flex', gap: 6, alignItems: 'center' }}>
                      <span style={{ color: '#aaa' }}>📦</span>
                      <span style={{ fontWeight: 600 }}>{r.product_name}</span>
                      {r.sku_name && <span style={{ color: '#aaa' }}>· {r.sku_name}</span>}
                    </div>
                  )}

                  {/* Review text */}
                  {r.review_text && (
                    <div style={{ fontSize: 13, color: '#334155', lineHeight: 1.6, padding: '8px 12px', background: '#f9fafb', borderRadius: 8, margin: '6px 0' }}>
                      "{r.review_text}"
                    </div>
                  )}

                  {/* Review images */}
                  {r.review_images && r.review_images.length > 0 && (
                    <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                      {(Array.isArray(r.review_images) ? r.review_images : []).slice(0, 5).map((img, imgIdx) => {
                        const imgUrl = typeof img === 'string' ? img : img?.url || img?.thumb_url || '';
                        return imgUrl ? (
                          <img key={imgIdx} src={imgUrl} alt="" style={{ width: 56, height: 56, borderRadius: 8, objectFit: 'cover', border: '1px solid #e5e7eb' }}
                            onError={e => e.target.style.display = 'none'} />
                        ) : null;
                      })}
                    </div>
                  )}

                  {/* Seller reply */}
                  {r.seller_reply && (
                    <div style={{ marginTop: 8, padding: '8px 12px', background: '#eff6ff', borderRadius: 8, borderLeft: '3px solid #3b82f6' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#3b82f6', marginBottom: 4 }}>💬 Phản hồi của shop {r.reply_at ? `· ${formatDate(r.reply_at)}` : ''}</div>
                      <div style={{ fontSize: 12, color: '#1e40af' }}>{r.seller_reply}</div>
                    </div>
                  )}

                  {/* Order ID */}
                  {r.order_id && (
                    <div style={{ marginTop: 8, fontSize: 11, color: '#aaa' }}>
                      ID đơn: <span style={{ fontFamily: 'monospace', color: '#888' }}>{r.order_id}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 20 }}>
          <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
            style={{ ...pill(false), opacity: page === 1 ? 0.4 : 1 }}>← Trước</button>
          {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
            let p;
            if (totalPages <= 7) p = i + 1;
            else if (page <= 4) p = i + 1;
            else if (page >= totalPages - 3) p = totalPages - 6 + i;
            else p = page - 3 + i;
            return (
              <button key={p} onClick={() => setPage(p)} style={pill(page === p)}>{p}</button>
            );
          })}
          <button disabled={page === totalPages} onClick={() => setPage(p => p + 1)}
            style={{ ...pill(false), opacity: page === totalPages ? 0.4 : 1 }}>Sau →</button>
        </div>
      )}
    </div>
  );
}

// Wrapper with tabs
const TABS = [
  { key: 'chat_inbox', label: '💬 Chat Inbox' },
  { key: 'danh_gia', label: '📋 Quản lý đánh giá' },
  { key: 'tiktok_reviews', label: '🛍️ Đánh giá TikTok' },
  { key: 'report_cs', label: '📝 Report CS' },
  { key: 'tiktok_health', label: '🔴 Điểm TK TikTok' },
];

export default function CSKHTab() {
  const [tab, setTab] = useState('chat_inbox');
  return (
    <div style={{ fontFamily: "'Outfit', sans-serif" }}>
      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: '#f3f4f6', borderRadius: 12, padding: 4, width: 'fit-content', flexWrap: 'wrap' }}>
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
      {tab === 'chat_inbox' && <ChatInboxTab />}
      {tab === 'danh_gia' && <DanhGiaTab />}
      {tab === 'tiktok_reviews' && <TikTokReviewsTab />}
      {tab === 'report_cs' && <ReportCSTab />}
      {tab === 'tiktok_health' && <TikTokHealthTab />}
    </div>
  );
}
