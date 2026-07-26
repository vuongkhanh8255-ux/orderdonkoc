// src/components/ReturnsTab.jsx
//
// MODULE 2 — TRẢ HÀNG / HOÀN HÀNG (THHT).
// Theo feedback CS: trả hàng ĐÃ xử lý trên sàn → web KHÔNG bắt CS điền tay,
// chỉ ĐỔ DATA + THỐNG KÊ SẴN theo từng gian hàng.
// Nguồn: RPC cs_return_dashboard (shopee_orders TO_RETURN + tiktok_affiliate_orders fully_return).
// Khiếu nại tách sang Module 3 (ComplaintsTab).

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../supabaseClient';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';

const ACCENT = '#ff6a2c';
const card = { background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', padding: '14px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' };
const th = { padding: '9px 10px', fontSize: '0.68rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.3px', textAlign: 'left', whiteSpace: 'nowrap', background: '#f8fafc', borderBottom: '2px solid #e5e7eb' };
const td = { padding: '8px 10px', fontSize: '0.82rem', color: '#0f172a', borderTop: '1px solid #f1f5f9', verticalAlign: 'top' };
const inputStyle = { padding: '8px 11px', borderRadius: 9, border: '1px solid #e5e7eb', background: '#fff', fontSize: '0.85rem', color: '#1f2937', fontFamily: 'inherit' };

const fmtN = (n) => new Intl.NumberFormat('vi-VN').format(Math.round(Number(n) || 0));
const fmtVnd = (n) => fmtN(n) + 'đ';
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return ymd(d); };
const sanIcon = (s) => (s === 'shopee' ? '🟠 Shopee' : s === 'tiktok' ? '⬛ TikTok' : s);

export default function ReturnsTab() {
  const [from, setFrom] = useState(daysAgo(30));
  const [to, setTo] = useState(ymd(new Date()));
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [sanF, setSanF] = useState('all');

  const load = useCallback(async () => {
    setLoading(true); setErr('');
    const { data: d, error } = await supabase.rpc('cs_return_dashboard', { p_from: from, p_to: to });
    if (error) { setErr(error.message); setData(null); }
    else setData(d || null);
    setLoading(false);
  }, [from, to]);
  useEffect(() => { load(); }, [load]);

  const shops = useMemo(() => {
    const list = data?.shops || [];
    return sanF === 'all' ? list : list.filter(s => s.san === sanF);
  }, [data, sanF]);
  const prods = useMemo(() => {
    const list = data?.top_products || [];
    return (sanF === 'all' ? list : list.filter(s => s.san === sanF)).slice(0, 12);
  }, [data, sanF]);
  const trend = useMemo(() => (data?.trend || []).map(t => ({
    ngay: (t.d || '').slice(5).split('-').reverse().join('/'), don: Number(t.don_tra) || 0,
  })), [data]);

  const kpi = useMemo(() => {
    const donTra = shops.reduce((a, s) => a + (Number(s.don_tra) || 0), 0);
    const tongDon = shops.reduce((a, s) => a + (Number(s.tong_don) || 0), 0);
    const giaTri = shops.reduce((a, s) => a + (Number(s.gia_tri) || 0), 0);
    return { donTra, tongDon, giaTri, tyLe: tongDon ? (100 * donTra / tongDon) : 0, soGian: shops.length };
  }, [shops]);

  const maxShop = Math.max(1, ...shops.map(s => Number(s.don_tra) || 0));

  const setQuick = (n) => { setFrom(daysAgo(n)); setTo(ymd(new Date())); };

  const xuatExcel = async () => {
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(shops.map(s => ({
      'SÀN': s.san, 'GIAN HÀNG': s.shop, 'ĐƠN TRẢ': Number(s.don_tra), 'TỔNG ĐƠN': Number(s.tong_don),
      'TỶ LỆ TRẢ (%)': Number(s.ty_le), 'GIÁ TRỊ TRẢ': Number(s.gia_tri),
    }))), 'Theo gian hàng');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet((data?.top_products || []).map(p => ({
      'SÀN': p.san, 'GIAN HÀNG': p.shop, 'SẢN PHẨM': p.pname, 'ĐƠN TRẢ': Number(p.don_tra), 'GIÁ TRỊ': Number(p.gia_tri),
    }))), 'Top SP bị trả');
    XLSX.writeFile(wb, `TraHang_${from}_${to}.xlsx`);
  };

  return (
    <div style={{ fontFamily: "'Outfit', sans-serif", maxWidth: 1400 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 900, color: '#0f172a' }}>↩️ Module 2: Trả hàng / Hoàn hàng</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#94a3b8' }}>Trả hàng xử lý trên sàn — web tự đổ data &amp; thống kê sẵn theo từng gian. <b style={{ color: '#16a34a' }}>CS không cần điền tay.</b></p>
        </div>
        <button onClick={xuatExcel} disabled={!shops.length} style={{ padding: '9px 18px', borderRadius: 9, border: 'none', background: shops.length ? '#16a34a' : '#cbd5e1', color: '#fff', fontWeight: 800, fontSize: 13, cursor: shops.length ? 'pointer' : 'default' }}>📥 Xuất Excel</button>
      </div>

      {/* BỘ LỌC */}
      <div style={{ ...card, marginBottom: 14, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={inputStyle} />
        <span style={{ color: '#94a3b8' }}>→</span>
        <input type="date" value={to} onChange={e => setTo(e.target.value)} style={inputStyle} />
        {[[7, '7 ngày'], [30, '30 ngày'], [90, '90 ngày']].map(([n, l]) => (
          <button key={n} onClick={() => setQuick(n)} style={{ padding: '7px 13px', borderRadius: 8, border: '1.5px solid #e5e7eb', background: '#fff', color: '#64748b', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer' }}>{l}</button>
        ))}
        <select value={sanF} onChange={e => setSanF(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
          <option value="all">Sàn: Tất cả</option><option value="shopee">Shopee</option><option value="tiktok">TikTok</option>
        </select>
        <button onClick={load} style={{ padding: '8px 16px', borderRadius: 9, border: 'none', background: ACCENT, color: '#fff', fontWeight: 800, fontSize: 13, cursor: 'pointer' }}>🔄 Tải lại</button>
      </div>

      {err && <div style={{ ...card, marginBottom: 14, background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', fontWeight: 700, fontSize: '0.85rem' }}>⚠️ {err}</div>}

      {/* KPI */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 18 }}>
        {[
          { l: 'Đơn bị trả', v: fmtN(kpi.donTra), c: '#dc2626' },
          { l: 'Giá trị trả', v: fmtVnd(kpi.giaTri), c: '#b45309' },
          { l: 'Tỷ lệ trả', v: kpi.tyLe.toFixed(2) + '%', c: '#7c3aed' },
          { l: 'Tổng đơn kỳ', v: fmtN(kpi.tongDon), c: '#2563eb' },
          { l: 'Gian hàng', v: kpi.soGian, c: '#16a34a' },
        ].map(k => (
          <div key={k.l} style={{ ...card, borderTop: `3px solid ${k.c}` }}>
            <div style={{ fontSize: '1.35rem', fontWeight: 900, color: k.c }}>{loading ? '…' : k.v}</div>
            <div style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.3px' }}>{k.l}</div>
          </div>
        ))}
      </div>

      {/* XU HƯỚNG */}
      <div style={{ ...card, marginBottom: 16 }}>
        <div style={{ fontWeight: 800, color: '#0f172a', marginBottom: 10, fontSize: '0.92rem' }}>📈 Xu hướng đơn trả theo ngày</div>
        <div style={{ width: '100%', height: 220 }}>
          {loading ? <div style={{ color: '#94a3b8', fontSize: '0.85rem' }}>⏳ Đang tải…</div> : trend.length === 0 ? <div style={{ color: '#94a3b8', fontSize: '0.85rem' }}>Không có đơn trả trong kỳ.</div> : (
            <ResponsiveContainer>
              <AreaChart data={trend}>
                <defs><linearGradient id="gRet" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={ACCENT} stopOpacity={0.35} /><stop offset="95%" stopColor={ACCENT} stopOpacity={0} /></linearGradient></defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="ngay" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} allowDecimals={false} />
                <Tooltip formatter={(v) => [fmtN(v) + ' đơn', 'Đơn trả']} />
                <Area type="monotone" dataKey="don" stroke={ACCENT} strokeWidth={2} fill="url(#gRet)" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* THEO GIAN HÀNG */}
      <div style={{ ...card, padding: 0, marginBottom: 16, overflow: 'hidden' }}>
        <div style={{ padding: '13px 16px', fontWeight: 800, color: '#0f172a', fontSize: '0.92rem', borderBottom: '1px solid #f1f5f9' }}>🏪 Thống kê theo gian hàng</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              <th style={th}>Sàn</th><th style={th}>Gian hàng</th>
              <th style={{ ...th, textAlign: 'right' }}>Đơn trả</th><th style={{ ...th, textAlign: 'right' }}>Tổng đơn</th>
              <th style={{ ...th, textAlign: 'right' }}>Tỷ lệ trả</th><th style={{ ...th, textAlign: 'right' }}>Giá trị trả</th>
              <th style={{ ...th, width: 150 }}>Mức độ</th>
            </tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={7} style={{ ...td, textAlign: 'center', padding: 36, color: '#94a3b8' }}>⏳ Đang tải…</td></tr>
                : shops.length === 0 ? <tr><td colSpan={7} style={{ ...td, textAlign: 'center', padding: 36, color: '#94a3b8' }}>Không có dữ liệu trong kỳ.</td></tr>
                  : shops.map((s, i) => (
                    <tr key={s.san + s.shop + i}>
                      <td style={td}>{sanIcon(s.san)}</td>
                      <td style={{ ...td, fontWeight: 700 }}>{s.shop}</td>
                      <td style={{ ...td, textAlign: 'right', fontWeight: 800, color: '#dc2626' }}>{fmtN(s.don_tra)}</td>
                      <td style={{ ...td, textAlign: 'right', color: '#64748b' }}>{fmtN(s.tong_don)}</td>
                      <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: Number(s.ty_le) >= 1 ? '#dc2626' : '#0f172a' }}>{Number(s.ty_le || 0).toFixed(2)}%</td>
                      <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: '#b45309' }}>{fmtVnd(s.gia_tri)}</td>
                      <td style={td}>
                        <div style={{ height: 8, background: '#f1f5f9', borderRadius: 5, overflow: 'hidden' }}>
                          <div style={{ width: `${Math.round(100 * (Number(s.don_tra) || 0) / maxShop)}%`, height: '100%', background: ACCENT }} />
                        </div>
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* TOP SẢN PHẨM BỊ TRẢ */}
      <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '13px 16px', fontWeight: 800, color: '#0f172a', fontSize: '0.92rem', borderBottom: '1px solid #f1f5f9' }}>📦 Top sản phẩm bị trả nhiều nhất</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              <th style={{ ...th, width: 40 }}>#</th><th style={th}>Sàn</th><th style={th}>Gian</th>
              <th style={{ ...th, minWidth: 300 }}>Sản phẩm</th>
              <th style={{ ...th, textAlign: 'right' }}>Đơn trả</th><th style={{ ...th, textAlign: 'right' }}>Giá trị</th>
            </tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={6} style={{ ...td, textAlign: 'center', padding: 36, color: '#94a3b8' }}>⏳ Đang tải…</td></tr>
                : prods.length === 0 ? <tr><td colSpan={6} style={{ ...td, textAlign: 'center', padding: 36, color: '#94a3b8' }}>Không có dữ liệu.</td></tr>
                  : prods.map((p, i) => (
                    <tr key={i}>
                      <td style={{ ...td, color: i < 3 ? ACCENT : '#94a3b8', fontWeight: 800 }}>{i + 1}</td>
                      <td style={td}>{sanIcon(p.san)}</td>
                      <td style={{ ...td, fontSize: '0.76rem', color: '#64748b' }}>{p.shop}</td>
                      <td style={{ ...td, whiteSpace: 'normal', maxWidth: 460 }}>{p.pname}</td>
                      <td style={{ ...td, textAlign: 'right', fontWeight: 800, color: '#dc2626' }}>{fmtN(p.don_tra)}</td>
                      <td style={{ ...td, textAlign: 'right', color: '#b45309', fontWeight: 700 }}>{fmtVnd(p.gia_tri)}</td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
      </div>

      <p style={{ fontSize: '0.74rem', color: '#94a3b8', marginTop: 12 }}>
        * Nguồn: đơn đã đồng bộ từ sàn (Shopee trạng thái TO_RETURN · TikTok fully_return). Tỷ lệ trả = đơn trả ÷ tổng đơn cùng kỳ của gian đó.
        Lý do trả hàng chi tiết cần đồng bộ thêm API trả hàng của sàn — làm ở đợt sau.
      </p>
    </div>
  );
}
