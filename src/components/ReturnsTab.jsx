// src/components/ReturnsTab.jsx
//
// MODULE 2 — TRẢ HÀNG / HOÀN TIỀN (THHT).
// Cập nhật theo feedback CS (26/7):
//  1. Trạng thái đơn "Đề xuất hoàn tiền 1 phần" (khách chấp nhận / từ chối / hệ thống tự từ chối)
//     — đơn khách TỪ CHỐI hay bị miss → khách THHT lý do lỗi → khiếu nại khó.
//  2. Tách đơn THHT vs đơn HOÀN TIỀN (không trả hàng), mỗi bên có lọc ID đơn / lý do / sản phẩm.
//  3. Bộ lọc thời gian: ngày · tháng · khoảng tuỳ chỉnh.
//  4. Tỷ lệ THHT theo nguyên nhân: lọc theo GIAN + CHỌN NHIỀU THÁNG cùng lúc (report tháng/quý nhanh).
//  5. Trạng thái thêm "Khiếu nại thành công" (đơn TikTok bồi hoàn) để tổng hợp kháng nghị.
// Nguồn: RPC cs_return_dashboard (thống kê tự đổ) + bảng cs_cases (đơn trả tự bắt, CS gắn lý do/trạng thái).

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '../supabaseClient';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { SHOPS } from '../constants/shops';
import { PRODUCT_CATEGORIES, autoProductCategory } from '../constants/productCategories';

const ACCENT = '#ff6a2c';
const card = { background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', padding: '14px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' };
const th = { padding: '9px 10px', fontSize: '0.68rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.3px', textAlign: 'left', whiteSpace: 'nowrap', background: '#f8fafc', borderBottom: '2px solid #e5e7eb' };
const td = { padding: '8px 10px', fontSize: '0.82rem', color: '#0f172a', borderTop: '1px solid #f1f5f9', verticalAlign: 'top' };
const inputStyle = { padding: '8px 11px', borderRadius: 9, border: '1px solid #e5e7eb', background: '#fff', fontSize: '0.85rem', color: '#1f2937', fontFamily: 'inherit' };

// Lý do THHT (CS chọn) — gồm các ví dụ CS đưa: Không còn nhu cầu / Chê sản phẩm / Kích ứng
const REASONS = ['Không còn nhu cầu', 'Chê sản phẩm', 'Kích ứng', 'Giao hàng chậm', 'Sai sản phẩm',
  'Thiếu hàng', 'Hư hỏng vận chuyển', 'Không nhận được hàng', 'Đổi ý',
  // CS bổ sung 28/7
  'Lỗi hệ thống không hiện quà', 'Lỗi vòi', 'Hết hàng', 'Hiểu nhầm chương trình', 'ĐVVC', 'Hàng giả/nhái',
  'Khác'];
const RSTATUS = {
  new: { label: 'Mới', color: '#b45309', bg: '#fef3c7' },
  processing: { label: 'Đang xử lý', color: '#1d4ed8', bg: '#dbeafe' },
  complaint_won: { label: 'Khiếu nại thành công', color: '#7c3aed', bg: '#ede9fe' },
  complaint_lost: { label: 'Khiếu nại thất bại', color: '#dc2626', bg: '#fee2e2' },      // CS 28/7
  shopee_rejected: { label: 'Shopee từ chối yêu cầu', color: '#b91c1c', bg: '#fee2e2' }, // CS 28/7
  done: { label: 'Hoàn tất', color: '#15803d', bg: '#dcfce7' },
};
// Loại đơn — CS 28/7 tách "hoàn tiền nguyên đơn" vs "hoàn tiền 1 phần".
// Giữ mã cũ 'refund_only' = nguyên đơn để đơn đã lưu trước đó không bị lệch.
const RETURN_TYPES = [
  { v: 'thht', l: 'Trả hàng' },
  { v: 'refund_only', l: 'Hoàn tiền nguyên đơn' },
  { v: 'refund_partial', l: 'Hoàn tiền 1 phần' },
];
const REFUND_TYPES = ['refund_only', 'refund_partial'];   // 2 loại nằm chung tab "Hoàn tiền"
// Đề xuất hoàn tiền 1 phần
const PARTIAL = {
  accepted: { label: 'Khách chấp nhận', color: '#15803d' },
  rejected: { label: 'Khách từ chối', color: '#dc2626' },
  auto_rejected: { label: 'Hệ thống tự từ chối', color: '#b45309' },
};

const fmtN = (n) => new Intl.NumberFormat('vi-VN').format(Math.round(Number(n) || 0));
const fmtVnd = (n) => fmtN(n) + 'đ';
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return ymd(d); };
const fmtDate = (s) => { if (!s) return ''; const d = new Date(s); return isNaN(d) ? '' : d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }); };
const sanIcon = (s) => (s === 'shopee' ? '🟠 Shopee' : s === 'tiktok' ? '⬛ TikTok' : s || '—');

export default function ReturnsTab() {
  const [tab, setTab] = useState('stats');           // stats | thht | refund
  const [from, setFrom] = useState(daysAgo(30));
  const [to, setTo] = useState(ymd(new Date()));
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [sanF, setSanF] = useState('all');

  // Danh sách đơn (cs_cases)
  const [cases, setCases] = useState([]);
  const [loadingCases, setLoadingCases] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [seedMsg, setSeedMsg] = useState('');
  const [shopF, setShopF] = useState('all');
  const [reasonF, setReasonF] = useState('all');
  const [statusF, setStatusF] = useState('all');
  const [catF, setCatF] = useState('all');           // lọc theo PHÂN LOẠI SP (danh sách CS)
  const [search, setSearch] = useState('');
  const [fbsF, setFbsF] = useState('all');           // all | fbs | seller — CS 28/7
  // Mặc định ẨN đơn chưa giao tới khách: đó là đơn khách hủy giữa đường / giao thất bại, CS không tính
  // vào tỉ lệ trả hàng. Bỏ tick nếu muốn xem lại đủ.
  const [hideUndelivered, setHideUndelivered] = useState(true);

  // Phân loại SP: CS chọn tay LUÔN thắng gợi ý tự động (dùng chung với Đánh giá sàn).
  // Phải đưa CẢ product_sku (mẫu trên sàn, vd "SUNSET,105ML") vào — tên SP thường KHÔNG chứa tên mùi,
  // đó là lý do trước đây cột phân loại để trống trong khi Đánh giá sàn hiện đủ (CS báo 28/7).
  const catOf = (r) => r.product_category || autoProductCategory(r.product_summary || '', r.product_sku || '') || '';

  // Phân tích nguyên nhân: chọn NHIỀU THÁNG + gian
  const [rsShop, setRsShop] = useState('all');
  const [rsMonths, setRsMonths] = useState([]);      // [] = tất cả tháng trong kỳ

  const loadStats = useCallback(async () => {
    setLoading(true); setErr('');
    const { data: d, error } = await supabase.rpc('cs_return_dashboard', { p_from: from, p_to: to });
    if (error) { setErr(error.message); setData(null); } else setData(d || null);
    setLoading(false);
  }, [from, to]);

  const loadCases = useCallback(async () => {
    setLoadingCases(true);
    const { data: d, error } = await supabase.from('cs_cases').select('*')
      .eq('case_type', 'return').order('created_at', { ascending: false }).limit(3000);
    if (error) alert('Lỗi tải đơn: ' + error.message);
    setCases(d || []); setLoadingCases(false);
  }, []);

  useEffect(() => { loadStats(); }, [loadStats]);
  useEffect(() => { loadCases(); }, [loadCases]);

  const runSeed = async () => {
    setSeeding(true); setSeedMsg('');
    const { data: n, error } = await supabase.rpc('cs_seed_return_cases', { p_days: 60 });
    setSeeding(false);
    if (error) setSeedMsg('⚠️ ' + error.message);
    else { setSeedMsg(`✅ Đã kéo thêm ${n} đơn trả mới từ sàn`); loadCases(); }
  };

  const patch = async (row, p) => {
    setCases(prev => prev.map(x => (x.id === row.id ? { ...x, ...p } : x)));
    await supabase.from('cs_cases').update({ ...p, updated_at: new Date().toISOString() }).eq('id', row.id);
  };

  // ── LỌC đơn theo thời gian + gian + lý do + trạng thái + tìm kiếm ──
  const inRange = useCallback((r) => {
    const d = (r.created_at || '').slice(0, 10);
    return (!from || d >= from) && (!to || d <= to);
  }, [from, to]);

  const filterCases = useCallback((type) => cases.filter(r => {
    const rt = r.return_type || 'thht';
    if (type === 'refund' ? !REFUND_TYPES.includes(rt) : rt !== type) return false;
    // ĐANG TÌM MÃ ĐƠN thì bỏ qua khoảng ngày: CS than "search ID lúc được lúc không" — đơn nằm
    // ngoài khoảng ngày đang chọn thì tìm hoài không ra dù đơn có trong hệ thống.
    if (!search && !inRange(r)) return false;
    if (sanF !== 'all' && r.platform !== sanF) return false;
    if (shopF !== 'all' && r.shop_name !== shopF) return false;
    if (reasonF !== 'all' && (r.reason_category || '') !== reasonF) return false;
    if (statusF !== 'all' && (r.status || 'new') !== statusF) return false;
    if (catF !== 'all' && (catOf(r) || '(chưa phân loại)') !== catF) return false;
    if (fbsF === 'fbs' && r.fulfillment_flag !== 'fulfilled_by_shopee') return false;
    if (fbsF === 'seller' && !(r.fulfillment_flag && r.fulfillment_flag !== 'fulfilled_by_shopee')) return false;
    // chỉ loại đơn BIẾT CHẮC là chưa giao (delivered=false); đơn chưa rõ (null) vẫn giữ để khỏi mất data
    if (hideUndelivered && r.delivered === false) return false;
    if (search) { const q = search.trim().toLowerCase(); if (![r.order_sn, r.buyer_name, r.koc_username, r.product_summary, r.product_sku, r.reason].some(v => v && String(v).toLowerCase().includes(q))) return false; }
    return true;
  }), [cases, inRange, sanF, shopF, reasonF, statusF, catF, search, fbsF, hideUndelivered]);       // eslint-disable-line react-hooks/exhaustive-deps

  const thhtRows = useMemo(() => filterCases('thht'), [filterCases]);
  const refundRows = useMemo(() => filterCases('refund'), [filterCases]);

  // ── Thống kê tự đổ (RPC) ──
  const shops = useMemo(() => {
    const list = data?.shops || [];
    return sanF === 'all' ? list : list.filter(s => s.san === sanF);
  }, [data, sanF]);
  const prods = useMemo(() => {
    const list = data?.top_products || [];
    return (sanF === 'all' ? list : list.filter(s => s.san === sanF)).slice(0, 12);
  }, [data, sanF]);
  const trend = useMemo(() => (data?.trend || []).map(t => ({ ngay: (t.d || '').slice(5).split('-').reverse().join('/'), don: Number(t.don_tra) || 0 })), [data]);
  const kpi = useMemo(() => {
    const donTra = shops.reduce((a, s) => a + (Number(s.don_tra) || 0), 0);
    const tongDon = shops.reduce((a, s) => a + (Number(s.tong_don) || 0), 0);
    const giaTri = shops.reduce((a, s) => a + (Number(s.gia_tri) || 0), 0);
    return { donTra, tongDon, giaTri, tyLe: tongDon ? (100 * donTra / tongDon) : 0, soGian: shops.length };
  }, [shops]);
  const maxShop = Math.max(1, ...shops.map(s => Number(s.don_tra) || 0));

  // ── TỶ LỆ THHT THEO NGUYÊN NHÂN (lọc gian + nhiều tháng) ──
  const monthOptions = useMemo(() => {
    const set = new Set(cases.map(r => (r.created_at || '').slice(0, 7)).filter(Boolean));
    return Array.from(set).sort().reverse();
  }, [cases]);
  const reasonStats = useMemo(() => {
    const src = cases.filter(r => {
      if ((r.return_type || 'thht') !== 'thht') return false;
      if (rsShop !== 'all' && r.shop_name !== rsShop) return false;
      if (rsMonths.length && !rsMonths.includes((r.created_at || '').slice(0, 7))) return false;
      if (!rsMonths.length && !inRange(r)) return false;   // không chọn tháng → theo khoảng ngày phía trên
      return true;
    });
    const m = {};
    src.forEach(r => { const k = r.reason_category || 'Chưa gắn lý do'; m[k] = (m[k] || 0) + 1; });
    const tong = src.length;
    return { tong, rows: Object.entries(m).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ ly_do: k, n: v, pct: tong ? (100 * v / tong) : 0 })) };
  }, [cases, rsShop, rsMonths, inRange]);

  const toggleMonth = (m) => setRsMonths(prev => (prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m]));

  // ── TỶ LỆ TRẢ THEO PHÂN LOẠI SP (CS cần: "phân loại rõ từng mùi" như trang Đánh giá sàn) ──
  // Dùng chung phạm vi lọc với bảng "theo nguyên nhân" (gian + nhiều tháng / khoảng ngày).
  const catStats = useMemo(() => {
    const src = cases.filter(r => {
      if ((r.return_type || 'thht') !== 'thht') return false;
      if (rsShop !== 'all' && r.shop_name !== rsShop) return false;
      if (rsMonths.length && !rsMonths.includes((r.created_at || '').slice(0, 7))) return false;
      if (!rsMonths.length && !inRange(r)) return false;
      return true;
    });
    const m = {};
    src.forEach(r => { const k = catOf(r) || '(chưa phân loại)'; m[k] = (m[k] || 0) + 1; });
    const tong = src.length;
    return { tong, rows: Object.entries(m).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ sp: k, n: v, pct: tong ? (100 * v / tong) : 0 })) };
  }, [cases, rsShop, rsMonths, inRange]);                                    // eslint-disable-line react-hooks/exhaustive-deps

  // Danh sách phân loại có thật trong kỳ (kèm số đơn) cho ô lọc
  const catList = useMemo(() => {
    const m = {};
    cases.forEach(r => { if (inRange(r)) { const k = catOf(r); if (k) m[k] = (m[k] || 0) + 1; } });
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [cases, inRange]);                                                      // eslint-disable-line react-hooks/exhaustive-deps

  const xuatExcel = () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(shops.map(s => ({
      'SÀN': s.san, 'GIAN HÀNG': s.shop, 'ĐƠN TRẢ': Number(s.don_tra), 'TỔNG ĐƠN': Number(s.tong_don),
      'TỶ LỆ TRẢ (%)': Number(s.ty_le), 'GIÁ TRỊ TRẢ': Number(s.gia_tri),
    }))), 'Theo gian hang');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(reasonStats.rows.map(r => ({
      'LÝ DO': r.ly_do, 'SỐ ĐƠN': r.n, 'TỶ LỆ (%)': Number(r.pct.toFixed(1)),
    }))), 'Ty le theo nguyen nhan');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(catStats.rows.map(r => ({
      'PHÂN LOẠI SP': r.sp, 'SỐ ĐƠN': r.n, 'TỶ LỆ (%)': Number(r.pct.toFixed(1)),
    }))), 'Ty le theo phan loai SP');
    const dump = (rows) => rows.map(r => ({
      'NGÀY': fmtDate(r.created_at), 'SÀN': r.platform, 'GIAN': r.shop_name || '', 'MÃ ĐƠN': r.order_sn || '',
      'KOC': r.koc_username || '', 'SĐT': r.buyer_phone || '', 'TỈNH/TP': r.buyer_province || '',
      'SẢN PHẨM': r.product_summary || '', 'PHÂN LOẠI SP': catOf(r), 'LÝ DO': r.reason_category || '',
      'TRẠNG THÁI': RSTATUS[r.status]?.label || r.status || '', 'HOÀN 1 PHẦN': PARTIAL[r.partial_refund_status]?.label || '',
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dump(thhtRows)), 'Don THHT');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dump(refundRows)), 'Don hoan tien');
    XLSX.writeFile(wb, `TraHang_${from}_${to}.xlsx`);
  };

  const TabBtn = ({ id, children }) => (
    <button onClick={() => setTab(id)} style={{ padding: '8px 16px', borderRadius: 9, border: `1.5px solid ${tab === id ? ACCENT : '#e5e7eb'}`, background: tab === id ? '#fff7ed' : '#fff', color: tab === id ? '#e85518' : '#64748b', fontWeight: 800, fontSize: '0.83rem', cursor: 'pointer' }}>{children}</button>
  );

  // Bảng đơn dùng chung cho tab THHT và tab Hoàn tiền
  const renderCaseTable = (rows, kind) => (
    <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>
            <th style={th}>Ngày</th><th style={th}>Sàn · Gian</th><th style={th}>Mã đơn</th>
            <th style={th}>KOC</th>
            <th style={{ ...th, minWidth: 220 }}>Sản phẩm</th>
            <th style={{ ...th, width: 150 }}>Phân loại SP</th>
            <th style={{ ...th, width: 165 }}>Lý do</th>
            <th style={{ ...th, width: 175 }}>Trạng thái</th>
            <th style={{ ...th, width: 175 }}>Hoàn tiền 1 phần</th>
            <th style={{ ...th, width: 120 }}>Loại đơn</th>
          </tr></thead>
          <tbody>
            {loadingCases ? <tr><td colSpan={10} style={{ ...td, textAlign: 'center', padding: 40, color: '#94a3b8' }}>⏳ Đang tải...</td></tr>
              : rows.length === 0 ? <tr><td colSpan={10} style={{ ...td, textAlign: 'center', padding: 40, color: '#94a3b8' }}>
                  Không có đơn nào khớp bộ lọc.
                  {/* Đơn nằm ở TAB KIA là ca hay làm CS tưởng "search không ra" — chỉ luôn chỗ có nó. */}
                  {search && (() => {
                    const other = kind === 'thht' ? refundRows : thhtRows;
                    if (!other.length) return null;
                    return (
                      <div style={{ marginTop: 10 }}>
                        <button onClick={() => setTab(kind === 'thht' ? 'refund' : 'thht')}
                          style={{ padding: '7px 16px', borderRadius: 9, border: 'none', background: ACCENT, color: '#fff', fontWeight: 800, fontSize: '0.82rem', cursor: 'pointer' }}>
                          👉 Tìm thấy {other.length} đơn ở tab “{kind === 'thht' ? 'Hoàn tiền' : 'Đơn THHT'}” — bấm để xem
                        </button>
                      </div>
                    );
                  })()}
                </td></tr>
                : rows.slice(0, 500).map(r => (
                  <tr key={r.id}>
                    <td style={{ ...td, fontSize: '0.76rem', color: '#64748b' }}>{fmtDate(r.created_at)}</td>
                    <td style={{ ...td, fontSize: '0.76rem' }}>{r.platform === 'shopee' ? '🟠' : '⬛'} {r.shop_name || '—'}</td>
                    <td style={{ ...td, fontFamily: 'monospace', fontSize: '0.73rem' }}>{r.order_sn || '—'}</td>
                    <td style={{ ...td, fontSize: '0.76rem', color: '#7c3aed' }}>{r.koc_username ? '@' + r.koc_username : '—'}</td>
                    <td style={{ ...td, whiteSpace: 'normal', maxWidth: 300, fontSize: '0.78rem' }}>
                      {/* Nhãn FBS + cảnh báo đơn chưa tới khách / sàn đã xử lý xong */}
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 3 }}>
                        {/* FBS = Shopee giữ kho & giao · MP (marketplace) = shop tự giao — CS gọi theo 2 chữ này */}
                        {r.fulfillment_flag === 'fulfilled_by_shopee' &&
                          <span title="Shopee giữ kho & giao" style={{ fontSize: '0.66rem', fontWeight: 800, padding: '1px 6px', borderRadius: 20, background: '#ede9fe', color: '#6d28d9' }}>📦 FBS</span>}
                        {r.fulfillment_flag && r.fulfillment_flag !== 'fulfilled_by_shopee' &&
                          <span title="Marketplace — shop tự giữ hàng, tự giao" style={{ fontSize: '0.66rem', fontWeight: 800, padding: '1px 6px', borderRadius: 20, background: '#f1f5f9', color: '#475569' }}>🏠 MP</span>}
                        {r.delivered === false &&
                          <span title="Đơn chưa tới tay khách mà đã đòi trả — khách hủy giữa đường / giao thất bại"
                            style={{ fontSize: '0.66rem', fontWeight: 800, padding: '1px 6px', borderRadius: 20, background: '#fee2e2', color: '#b91c1c' }}>⚠ chưa giao tới khách</span>}
                        {r.platform_status && r.platform_status !== 'TO_RETURN' &&
                          <span title={`Bên sàn đơn này giờ là ${r.platform_status} — yêu cầu trả đã xử lý xong`}
                            style={{ fontSize: '0.66rem', fontWeight: 800, padding: '1px 6px', borderRadius: 20, background: '#dcfce7', color: '#15803d' }}>✓ sàn đã xong</span>}
                      </div>
                      {/* CS 28/7: đơn combo hiện tên link chương trình dài thòng mà không thấy khách chọn
                          MÙI nào → đưa PHÂN LOẠI lên TRƯỚC, tên link thu nhỏ xuống dưới cho dễ nhìn. */}
                      {r.product_sku
                        ? <div style={{ color: '#6d28d9', fontWeight: 700, fontSize: '0.8rem' }}>🏷️ {r.product_sku}</div>
                        : <div style={{ color: '#b91c1c', fontSize: '0.72rem', fontStyle: 'italic' }}
                            title="Sàn không trả tên phân loại cho đơn này — CS chọn tay ở ô Phân loại SP bên cạnh">
                            ⚠ sàn không trả phân loại
                          </div>}
                      <div style={{ color: '#94a3b8', fontSize: '0.72rem', marginTop: 2 }}>{r.product_summary || '—'}</div>
                      {r.product_qty > 0 && <div style={{ color: '#b45309', fontSize: '0.72rem', fontWeight: 700, marginTop: 1 }}>× {r.product_qty} sản phẩm</div>}
                    </td>
                    <td style={td}>
                      {(() => {
                        const auto = autoProductCategory(r.product_summary || '', r.product_sku || '');
                        const chosen = r.product_category || '';
                        return (
                          <select value={chosen || auto || ''} onChange={e => patch(r, { product_category: e.target.value || null })}
                            style={{
                              ...inputStyle, padding: '4px 7px', fontSize: '0.72rem', width: '100%', cursor: 'pointer',
                              background: chosen ? '#eef2ff' : '#fff', color: chosen ? '#1e3a8a' : '#94a3b8',
                              fontStyle: chosen ? 'normal' : 'italic', fontWeight: chosen ? 700 : 400,
                            }}
                            title={chosen ? 'CS đã chọn' : (auto ? 'Gợi ý tự động từ tên SP — chọn lại nếu sai' : 'CS tự phân loại')}>
                            <option value="">— Phân loại SP —</option>
                            {PRODUCT_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                        );
                      })()}
                    </td>
                    <td style={td}>
                      <select value={r.reason_category || ''} onChange={e => patch(r, { reason_category: e.target.value || null })}
                        style={{ ...inputStyle, padding: '4px 7px', fontSize: '0.74rem', width: '100%', cursor: 'pointer', background: r.reason_category ? '#fff' : '#fffbeb' }}>
                        <option value="">— chưa gắn —</option>{REASONS.map(x => <option key={x} value={x}>{x}</option>)}
                      </select>
                    </td>
                    <td style={td}>
                      <select value={r.status || 'new'} onChange={e => patch(r, { status: e.target.value })}
                        style={{ padding: '4px 7px', borderRadius: 6, border: 'none', fontSize: '0.74rem', fontWeight: 700, width: '100%', cursor: 'pointer', background: (RSTATUS[r.status] || RSTATUS.new).bg, color: (RSTATUS[r.status] || RSTATUS.new).color }}>
                        {Object.keys(RSTATUS).map(s => <option key={s} value={s}>{RSTATUS[s].label}</option>)}
                      </select>
                    </td>
                    <td style={td}>
                      <select value={r.partial_refund_status || ''} onChange={e => patch(r, { partial_refund_status: e.target.value || null })}
                        style={{ ...inputStyle, padding: '4px 7px', fontSize: '0.74rem', width: '100%', cursor: 'pointer', color: PARTIAL[r.partial_refund_status]?.color || '#64748b', fontWeight: r.partial_refund_status ? 700 : 400 }}>
                        <option value="">— không có —</option>{Object.keys(PARTIAL).map(k => <option key={k} value={k}>{PARTIAL[k].label}</option>)}
                      </select>
                    </td>
                    <td style={td}>
                      <select value={r.return_type || 'thht'} onChange={e => patch(r, { return_type: e.target.value })}
                        style={{ ...inputStyle, padding: '4px 7px', fontSize: '0.74rem', width: '100%', cursor: 'pointer' }}>
                        {RETURN_TYPES.map(t => <option key={t.v} value={t.v}>{t.l}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
      {rows.length > 500 && <div style={{ padding: '8px 14px', fontSize: '0.76rem', color: '#94a3b8' }}>Hiện 500/{fmtN(rows.length)} đơn — thu hẹp bộ lọc để xem tiếp.</div>}
      <div style={{ padding: '9px 14px', fontSize: '0.74rem', color: '#94a3b8', borderTop: '1px solid #f1f5f9' }}>
        {kind === 'thht'
          ? 'Đơn trả hàng + hoàn tiền. Đổi ô "Loại đơn" sang Hoàn tiền nếu khách được hoàn mà KHÔNG trả hàng.'
          : 'Đơn hoàn tiền KHÔNG trả hàng — lọc theo mã đơn / lý do / sản phẩm như tab THHT.'}
      </div>
    </div>
  );

  return (
    <div style={{ fontFamily: "'Outfit', sans-serif", maxWidth: 1500 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 900, color: '#0f172a' }}>↩️ Module 2: Trả hàng / Hoàn tiền</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#94a3b8' }}>Đơn tự đổ từ sàn (mỗi giờ) · CS chỉ gắn lý do + trạng thái · thống kê sẵn theo gian hàng</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {seedMsg && <span style={{ fontSize: '0.8rem', fontWeight: 700, color: seedMsg.startsWith('⚠️') ? '#dc2626' : '#16a34a' }}>{seedMsg}</span>}
          <button onClick={runSeed} disabled={seeding} style={{ padding: '9px 16px', borderRadius: 9, border: '1.5px solid #bfdbfe', background: '#eff6ff', color: '#2563eb', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>{seeding ? '⏳ Đang kéo...' : '🔄 Kéo đơn mới'}</button>
          <button onClick={xuatExcel} style={{ padding: '9px 18px', borderRadius: 9, border: 'none', background: '#16a34a', color: '#fff', fontWeight: 800, fontSize: 13, cursor: 'pointer' }}>📥 Xuất Excel</button>
        </div>
      </div>

      {/* BỘ LỌC THỜI GIAN + SÀN + GIAN */}
      <div style={{ ...card, marginBottom: 14, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={inputStyle} />
        <span style={{ color: '#94a3b8' }}>→</span>
        <input type="date" value={to} onChange={e => setTo(e.target.value)} style={inputStyle} />
        {[[7, '7 ngày'], [30, '30 ngày'], [90, '90 ngày'], [365, '1 năm']].map(([n, l]) => (
          <button key={n} onClick={() => { setFrom(daysAgo(n)); setTo(ymd(new Date())); }} style={{ padding: '7px 12px', borderRadius: 8, border: '1.5px solid #e5e7eb', background: '#fff', color: '#64748b', fontWeight: 700, fontSize: '0.77rem', cursor: 'pointer' }}>{l}</button>
        ))}
        <select value={sanF} onChange={e => { setSanF(e.target.value); setShopF('all'); }} style={{ ...inputStyle, cursor: 'pointer' }}>
          <option value="all">Sàn: Tất cả</option><option value="shopee">Shopee</option><option value="tiktok">TikTok</option>
        </select>
        <select value={shopF} onChange={e => setShopF(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
          <option value="all">Gian: Tất cả</option>
          {SHOPS.filter(s => sanF === 'all' || s.san === sanF).map(s => <option key={s.san + s.name} value={s.name}>{s.name}</option>)}
        </select>
        <button onClick={loadStats} style={{ padding: '8px 15px', borderRadius: 9, border: 'none', background: ACCENT, color: '#fff', fontWeight: 800, fontSize: 13, cursor: 'pointer' }}>🔄 Tải lại</button>
      </div>

      {err && <div style={{ ...card, marginBottom: 14, background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', fontWeight: 700, fontSize: '0.85rem' }}>⚠️ {err}</div>}

      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <TabBtn id="stats">📊 Thống kê</TabBtn>
        <TabBtn id="thht">📋 Đơn THHT ({fmtN(thhtRows.length)})</TabBtn>
        <TabBtn id="refund">💸 Hoàn tiền — không trả hàng ({fmtN(refundRows.length)})</TabBtn>
      </div>

      {/* ══ TAB THỐNG KÊ ══ */}
      {tab === 'stats' && (
        <>
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

          {/* TỶ LỆ THHT THEO NGUYÊN NHÂN — lọc gian + nhiều tháng */}
          <div style={{ ...card, marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
              <b style={{ fontSize: '0.92rem', color: '#0f172a' }}>🧭 Tỷ lệ THHT theo nguyên nhân</b>
              <select value={rsShop} onChange={e => setRsShop(e.target.value)} style={{ ...inputStyle, padding: '5px 9px', fontSize: '0.78rem', cursor: 'pointer' }}>
                <option value="all">Tất cả gian</option>
                {SHOPS.map(s => <option key={'rs' + s.san + s.name} value={s.name}>{s.san === 'shopee' ? 'Shopee' : 'TikTok'} · {s.name}</option>)}
              </select>
              <span style={{ fontSize: '0.76rem', color: '#94a3b8' }}>Chọn nhiều tháng:</span>
              {monthOptions.slice(0, 8).map(m => (
                <button key={m} onClick={() => toggleMonth(m)}
                  style={{ padding: '5px 10px', borderRadius: 7, border: `1.5px solid ${rsMonths.includes(m) ? ACCENT : '#e5e7eb'}`, background: rsMonths.includes(m) ? '#fff7ed' : '#fff', color: rsMonths.includes(m) ? '#e85518' : '#64748b', fontWeight: 700, fontSize: '0.75rem', cursor: 'pointer' }}>{m}</button>
              ))}
              {rsMonths.length > 0 && <button onClick={() => setRsMonths([])} style={{ padding: '5px 10px', borderRadius: 7, border: '1.5px solid #fecaca', background: '#fff', color: '#dc2626', fontWeight: 700, fontSize: '0.75rem', cursor: 'pointer' }}>✕ Bỏ chọn</button>}
              <span style={{ marginLeft: 'auto', fontSize: '0.8rem', fontWeight: 800, color: '#0f172a' }}>{fmtN(reasonStats.tong)} đơn</span>
            </div>
            {reasonStats.rows.length === 0 ? <div style={{ color: '#94a3b8', fontSize: '0.84rem' }}>Không có đơn trong phạm vi đã chọn.</div> : reasonStats.rows.map(r => (
              <div key={r.ly_do} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 7 }}>
                <span style={{ fontSize: '0.82rem', color: r.ly_do === 'Chưa gắn lý do' ? '#cbd5e1' : '#475569', width: 190, flexShrink: 0 }}>{r.ly_do}</span>
                <div style={{ flex: 1, height: 10, background: '#f1f5f9', borderRadius: 5, overflow: 'hidden' }}>
                  <div style={{ width: `${r.pct}%`, height: '100%', background: r.ly_do === 'Chưa gắn lý do' ? '#cbd5e1' : ACCENT }} />
                </div>
                <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#0f172a', width: 92, textAlign: 'right' }}>{r.pct.toFixed(0)}% ({fmtN(r.n)})</span>
              </div>
            ))}
          </div>

          {/* TỶ LỆ TRẢ THEO PHÂN LOẠI SP — CS cần "phân loại rõ từng mùi" như trang Đánh giá sàn */}
          <div style={{ ...card, marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
              <b style={{ fontSize: '0.92rem', color: '#0f172a' }}>🧴 Tỷ lệ trả theo PHÂN LOẠI SẢN PHẨM</b>
              <span style={{ fontSize: '0.74rem', color: '#94a3b8' }}>(dùng chung bộ lọc gian + tháng ở trên)</span>
              <span style={{ marginLeft: 'auto', fontSize: '0.8rem', fontWeight: 800, color: '#0f172a' }}>{fmtN(catStats.tong)} đơn</span>
            </div>
            {catStats.rows.length === 0 ? <div style={{ color: '#94a3b8', fontSize: '0.84rem' }}>Không có đơn trong phạm vi đã chọn.</div> : catStats.rows.slice(0, 15).map(r => (
              <div key={r.sp} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 7 }}>
                <span style={{ fontSize: '0.82rem', color: r.sp === '(chưa phân loại)' ? '#cbd5e1' : '#475569', width: 190, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.sp}>{r.sp}</span>
                <div style={{ flex: 1, height: 10, background: '#f1f5f9', borderRadius: 5, overflow: 'hidden' }}>
                  <div style={{ width: `${r.pct}%`, height: '100%', background: r.sp === '(chưa phân loại)' ? '#cbd5e1' : '#7c3aed' }} />
                </div>
                <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#0f172a', width: 92, textAlign: 'right' }}>{r.pct.toFixed(0)}% ({fmtN(r.n)})</span>
              </div>
            ))}
          </div>

          <div style={{ ...card, marginBottom: 16 }}>
            <div style={{ fontWeight: 800, color: '#0f172a', marginBottom: 10, fontSize: '0.92rem' }}>📈 Xu hướng đơn trả theo ngày</div>
            <div style={{ width: '100%', height: 210 }}>
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
                          <td style={td}><div style={{ height: 8, background: '#f1f5f9', borderRadius: 5, overflow: 'hidden' }}><div style={{ width: `${Math.round(100 * (Number(s.don_tra) || 0) / maxShop)}%`, height: '100%', background: ACCENT }} /></div></td>
                        </tr>
                      ))}
                </tbody>
              </table>
            </div>
          </div>

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
        </>
      )}

      {/* ══ TAB ĐƠN THHT / HOÀN TIỀN ══ */}
      {(tab === 'thht' || tab === 'refund') && (
        <>
          <div style={{ ...card, marginBottom: 14, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <input type="text" placeholder="🔍 Tìm ID đơn, khách, sản phẩm..." value={search} onChange={e => setSearch(e.target.value)} style={{ ...inputStyle, width: 280 }} />
            <select value={reasonF} onChange={e => setReasonF(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
              <option value="all">Lý do: Tất cả</option><option value="">— chưa gắn lý do —</option>
              {REASONS.map(x => <option key={x} value={x}>{x}</option>)}
            </select>
            <select value={statusF} onChange={e => setStatusF(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
              <option value="all">Trạng thái: Tất cả</option>
              {Object.keys(RSTATUS).map(s => <option key={s} value={s}>{RSTATUS[s].label}</option>)}
            </select>
            <select value={catF} onChange={e => setCatF(e.target.value)}
              style={{ ...inputStyle, cursor: 'pointer', maxWidth: 230, borderColor: catF !== 'all' ? ACCENT : '#e5e7eb', color: catF !== 'all' ? '#e85518' : '#1f2937', fontWeight: catF !== 'all' ? 700 : 400 }}>
              <option value="all">Phân loại SP: Tất cả</option>
              {catList.map(([c, n]) => <option key={c} value={c}>{c} ({n})</option>)}
              <option value="(chưa phân loại)">— Chưa phân loại —</option>
            </select>
            {/* CS 28/7: lọc riêng đơn FBS (Shopee xử lý) */}
            <select value={fbsF} onChange={e => setFbsF(e.target.value)}
              style={{ ...inputStyle, cursor: 'pointer', borderColor: fbsF !== 'all' ? ACCENT : '#e5e7eb', color: fbsF !== 'all' ? '#e85518' : '#1f2937', fontWeight: fbsF !== 'all' ? 700 : 400 }}>
              <option value="all">Kiểu đơn: Tất cả</option>
              <option value="fbs">📦 FBS — Shopee giữ kho &amp; giao</option>
              <option value="seller">🏠 MP — shop tự giao</option>
            </select>
            {/* CS 28/7: bỏ đơn khách yêu cầu HỦY = đơn CHƯA giao tới khách (giao thất bại / mới lấy hàng) */}
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', fontWeight: 700, color: hideUndelivered ? '#e85518' : '#64748b', cursor: 'pointer' }}
              title="Đơn chưa tới tay khách mà đã đòi trả = khách hủy giữa đường / bom hàng, không phải trả hàng thật">
              <input type="checkbox" checked={hideUndelivered} onChange={e => setHideUndelivered(e.target.checked)} />
              Ẩn đơn chưa giao tới khách
            </label>
            <span style={{ marginLeft: 'auto', fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>
              {fmtN((tab === 'thht' ? thhtRows : refundRows).length)} đơn
            </span>
          </div>
          {renderCaseTable(tab === 'thht' ? thhtRows : refundRows, tab === 'thht' ? 'thht' : 'refund')}
        </>
      )}

      <p style={{ fontSize: '0.74rem', color: '#94a3b8', marginTop: 12 }}>
        * Thống kê lấy từ đơn đã đồng bộ (Shopee TO_RETURN · TikTok fully_return). Đơn trả tự kéo về mỗi giờ.<br />
        * <b>Khách</b>: Shopee lấy tên người nhận thật. Đơn TikTok là báo cáo affiliate — sàn KHÔNG trả thông tin người mua,
        nên cột Khách để trống và tên creator nằm ở cột <b>KOC</b>.<br />
        * <b>Đơn TikTok đã hoàn tiền</b> vào thẳng “Hoàn tất” (sàn hoàn xong, CS không phải thao tác).<br />
        * <b>Phân loại SP</b> máy tự đoán từ tên sản phẩm (chữ nghiêng xám) — CS chọn lại thì lưu đè (chữ xanh đậm).<br />
        * <b>Lý do</b> hiện do CS gắn — lý do trả hàng do SÀN ghi nhận chưa có trong data, cần nối thêm API của sàn.
      </p>
    </div>
  );
}
