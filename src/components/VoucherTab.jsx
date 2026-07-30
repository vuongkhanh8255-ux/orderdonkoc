// src/components/VoucherTab.jsx
//
// Module 7 — Voucher hỗ trợ khách hàng (nhóm CSKH).
// Sổ voucher CS cấp bù cho khách (SP lỗi, giao chậm...). Theo dõi trạng thái dùng +
// đối soát kế toán + phân tích nguyên nhân. Bảng: support_vouchers. Nhập tay (đồng bộ sàn = sau).

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '../supabaseClient';
import { useAppData } from '../context/AppDataContext';
import EvidenceUploader from './EvidenceUploader';
import { SHOPS, shopKey, findShopByKey } from '../constants/shops';

const ACCENT = '#ff6a2c';
// 7 nhóm theo brief + 4 nhóm CS thực tế dùng nhiều (soi từ 4.811 voucher đã cấp trên sàn):
// giao sai/nhầm, giao thiếu, lỗi hệ thống không hiện quà, hết hàng — gộp vào "Khác" thì mất
// gần 50% dữ liệu phân tích nên tách riêng.
const REASONS = ['Sản phẩm lỗi', 'Hàng giao chậm', 'Hư hỏng vận chuyển', 'Khách không hài lòng',
  'Hỗ trợ phí ship', 'Chương trình CSKH',
  'Giao sai / nhầm hàng', 'Giao thiếu hàng', 'Lỗi hệ thống / không hiện quà', 'Hết hàng',
  'Khác'];
const USE_STATUS = {
  unused:    { label: 'Chưa dùng', color: '#b45309', bg: '#fef3c7' },
  used:      { label: 'Đã dùng',   color: '#15803d', bg: '#dcfce7' },
  expired:   { label: 'Hết hạn',   color: '#64748b', bg: '#f1f5f9' },
  cancelled: { label: 'Đã hủy',    color: '#dc2626', bg: '#fee2e2' },
};
const num = (v) => { const n = Number(String(v ?? '').replace(/[^\d.-]/g, '')); return Number.isFinite(n) ? n : 0; };
const fmtMoney = (v) => (Number(v) || 0).toLocaleString('vi-VN');
const todayYmd = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const curYm = () => todayYmd().slice(0, 7);
const fmtDate = (s) => { if (!s) return ''; const p = String(s).slice(0, 10).split('-'); return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : s; };

const inputStyle = { padding: '8px 11px', borderRadius: 9, border: '1px solid #e5e7eb', background: '#fff', fontSize: '0.85rem', color: '#1f2937', width: '100%', boxSizing: 'border-box', fontFamily: 'inherit' };
const labelStyle = { fontSize: '0.72rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: 4, display: 'block' };
const th = { padding: '9px 10px', fontSize: '0.68rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.3px', textAlign: 'left', whiteSpace: 'nowrap', background: '#f8fafc', borderBottom: '2px solid #e5e7eb' };
const td = { padding: '8px 10px', fontSize: '0.82rem', color: '#0f172a', whiteSpace: 'nowrap', borderTop: '1px solid #f1f5f9' };
const card = { background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', padding: '14px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' };
const EMPTY = { issue_date: todayYmd(), platform: 'shopee', order_sn: '', customer_name: '', reason_category: 'Sản phẩm lỗi', voucher_code: '', amount: 0, use_status: 'unused', staff: '', accountant_checked: false, expire_date: '', note: '', evidence_links: '' };

// ── VOUCHER SHOP TẠO (kéo từ sàn) ────────────────────────────────────────────
// CS 29/7 cần cả 2 loại: voucher CS gửi khách (bảng support_vouchers, nhập tay — phần chính bên dưới)
// và voucher SHOP TẠO trên sàn (bảng shopee_vouchers, đồng bộ từ Shopee).
function ShopVouchers() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [msg, setMsg] = useState('');
  const [shopF, setShopF] = useState('all');
  const [stateF, setStateF] = useState('all');     // all | ongoing | upcoming | expired
  const [ownerF, setOwnerF] = useState('shop');
  const [sanF, setSanF] = useState('all');         // all | shopee | tiktok    // shop | shopee | all
  const [search, setSearch] = useState('');

  // ⚠️ Supabase CẮT CỤT 1000 DÒNG mỗi lượt, kể cả khi ghi .limit(3000). Bảng đã 7.389 voucher
  // ⇒ trước đây chỉ tải về 1.000, KPI (tổng voucher / lượt dùng / giá trị) tính trên 1/7 dữ liệu
  // mà không báo lỗi gì. Phải kéo từng trang 1000 cho tới hết.
  const load = useCallback(async () => {
    setLoading(true);
    const all = [];
    for (let pg = 0; pg < 30; pg++) {                     // trần 30.000 voucher
      const { data, error } = await supabase.from('shopee_vouchers').select('*')
        .order('end_time', { ascending: false }).range(pg * 1000, pg * 1000 + 999);
      if (error) { alert('Lỗi tải voucher sàn: ' + error.message); break; }
      all.push(...(data || []));
      if (!data || data.length < 1000) break;
    }
    // Voucher TikTok — đưa về CÙNG dạng field với Shopee để bảng/KPI dùng chung, khỏi viết 2 lần.
    // LƯU Ý: API danh sách của TikTok KHÔNG trả số lượt ĐÃ DÙNG → current_usage = null (hiện '—').
    const tt = [];
    for (let pg = 0; pg < 30; pg++) {
      const { data } = await supabase.from('tiktok_vouchers').select('*')
        .order('claim_end', { ascending: false }).range(pg * 1000, pg * 1000 + 999);
      tt.push(...(data || []));
      if (!data || data.length < 1000) break;
    }
    const ttRows = tt.map(v => ({
      san: 'tiktok', voucher_id: 'tt-' + v.coupon_id, shop_name: v.shop_name,
      voucher_name: v.title, voucher_code: '',
      start_time: v.claim_start, end_time: v.claim_end,
      reward_type: v.discount_type === 'PERCENT_OFF' ? 2 : 1,
      percentage: v.discount_percent, discount_amount: v.discount_amount,
      max_price: null, min_basket_price: null,
      usage_quantity: v.redemption_limit, current_usage: null,
      is_admin: v.creation_source !== 'SELLER_CENTER',
    }));
    setRows([...all.map(v => ({ ...v, san: 'shopee' })), ...ttRows]);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const runSync = async () => {
    setSyncing(true); setMsg('⏳ Đang kéo voucher từ Shopee...');
    try {
      const [rSp, rTt] = await Promise.all([
        fetch('/api/shopee/sync-orders?sync_vouchers=1').then(x => x.json()).catch(() => ({})),
        fetch('/api/tiktok-shop/sync-orders?sync_vouchers=1').then(x => x.json()).catch(() => ({})),
      ]);
      const r = { results: [...(rSp.results || []), ...(rTt.ket_qua || []).map(x => ({ luu: x.luu }))] };
      const tong = (r.results || []).reduce((s, x) => s + (x.luu || 0), 0);
      setMsg(`✅ Đã đồng bộ ${tong} voucher`); load();
    } catch (e) { setMsg('⚠️ ' + e.message); }
    finally { setSyncing(false); }
  };

  const now = Math.floor(Date.now() / 1000);
  const stateOf = (v) => (v.start_time > now ? 'upcoming' : v.end_time < now ? 'expired' : 'ongoing');
  const STATE_LBL = { ongoing: { l: 'Đang chạy', c: '#15803d', bg: '#dcfce7' }, upcoming: { l: 'Sắp chạy', c: '#1d4ed8', bg: '#dbeafe' }, expired: { l: 'Hết hạn', c: '#64748b', bg: '#f1f5f9' } };
  const shops = useMemo(() => [...new Set(rows.map(r => r.shop_name).filter(Boolean))].sort(), [rows]);

  const filtered = useMemo(() => rows.filter(v => {
    if (sanF !== 'all' && v.san !== sanF) return false;
    if (ownerF === 'shop' && v.is_admin) return false;       // chỉ voucher SHOP tự tạo
    if (ownerF === 'shopee' && !v.is_admin) return false;
    if (shopF !== 'all' && v.shop_name !== shopF) return false;
    if (stateF !== 'all' && stateOf(v) !== stateF) return false;
    if (search) { const q = search.toLowerCase(); if (![v.voucher_name, v.voucher_code].some(x => x && x.toLowerCase().includes(q))) return false; }
    return true;
  }), [rows, sanF, ownerF, shopF, stateF, search]);                // eslint-disable-line react-hooks/exhaustive-deps

  const kpi = useMemo(() => ({
    tong: filtered.length,
    dangChay: filtered.filter(v => stateOf(v) === 'ongoing').length,
    luotDung: filtered.reduce((s, v) => s + (Number(v.current_usage) || 0), 0),
    chuaDung: filtered.filter(v => v.current_usage != null && !Number(v.current_usage)).length,
  }), [filtered]);                                            // eslint-disable-line react-hooks/exhaustive-deps

  const mucGiam = (v) => (v.reward_type === 2
    ? `${v.percentage || 0}%${v.max_price ? ` (tối đa ${fmtMoney(v.max_price)}đ)` : ''}`
    : `${fmtMoney(v.discount_amount || v.max_price || 0)}đ`);

  const exportShop = () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filtered.map((v, i) => ({
      STT: i + 1, 'GIAN': v.shop_name, 'TÊN VOUCHER': v.voucher_name, 'MÃ': v.voucher_code,
      'MỨC GIẢM': mucGiam(v), 'ĐƠN TỐI THIỂU': v.min_basket_price || 0,
      'PHÁT HÀNH': v.usage_quantity || 0, 'ĐÃ DÙNG': v.current_usage || 0,
      'BẮT ĐẦU': v.start_time ? fmtDate(new Date(v.start_time * 1000).toISOString()) : '',
      'KẾT THÚC': v.end_time ? fmtDate(new Date(v.end_time * 1000).toISOString()) : '',
      'TRẠNG THÁI': STATE_LBL[stateOf(v)].l, 'AI TẠO': v.is_admin ? 'Shopee' : 'Shop',
    }))), 'Voucher shop tạo');
    XLSX.writeFile(wb, `voucher-shop-tao-${todayYmd()}.xlsx`);
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
        <p style={{ margin: 0, fontSize: 13, color: '#94a3b8' }}>Voucher shop tạo trên Shopee · đồng bộ trực tiếp từ sàn</p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={exportShop} style={{ padding: '9px 16px', borderRadius: 9, border: '1.5px solid #e5e7eb', background: '#fff', color: '#64748b', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>📥 Xuất Excel</button>
          <button onClick={runSync} disabled={syncing} style={{ padding: '9px 18px', borderRadius: 9, border: 'none', background: syncing ? '#d1d5db' : ACCENT, color: '#fff', fontWeight: 800, fontSize: 13, cursor: syncing ? 'default' : 'pointer' }}>
            {syncing ? '⏳ Đang kéo...' : '🔄 Đồng bộ từ sàn'}
          </button>
        </div>
      </div>
      {msg && <div style={{ ...card, marginBottom: 12, fontSize: '0.85rem', fontWeight: 700, color: '#0f172a' }}>{msg}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 16 }}>
        {[
          { label: 'Tổng voucher', v: kpi.tong, color: '#6366f1' },
          { label: 'Đang chạy', v: kpi.dangChay, color: '#15803d' },
          { label: 'Tổng lượt đã dùng', v: kpi.luotDung, color: '#0891b2' },
          { label: 'Chưa ai dùng', v: kpi.chuaDung, color: '#dc2626' },
        ].map((c, i) => (
          <div key={i} style={{ ...card, borderTop: `3px solid ${c.color}` }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 900, color: c.color }}>{fmtMoney(c.v)}</div>
            <div style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 700 }}>{c.label}</div>
          </div>
        ))}
      </div>

      <div style={{ ...card, marginBottom: 14, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <input type="text" placeholder="🔍 Tìm tên / mã voucher..." value={search} onChange={e => setSearch(e.target.value)} style={{ ...inputStyle, width: 240 }} />
        <select value={sanF} onChange={e => setSanF(e.target.value)} style={{ ...inputStyle, width: 'auto', cursor: 'pointer', fontWeight: 700 }}>
          <option value="all">Sàn: Tất cả</option><option value="shopee">🟠 Shopee</option><option value="tiktok">⬛ TikTok</option>
        </select>
        <select value={ownerF} onChange={e => setOwnerF(e.target.value)} style={{ ...inputStyle, width: 'auto', cursor: 'pointer', fontWeight: 700 }}>
          <option value="shop">🏪 Shop tự tạo</option>
          <option value="shopee">🟠 Shopee tạo</option>
          <option value="all">Tất cả</option>
        </select>
        <select value={shopF} onChange={e => setShopF(e.target.value)} style={{ ...inputStyle, width: 'auto', cursor: 'pointer' }}>
          <option value="all">Gian: Tất cả</option>{shops.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={stateF} onChange={e => setStateF(e.target.value)} style={{ ...inputStyle, width: 'auto', cursor: 'pointer' }}>
          <option value="all">Trạng thái: Tất cả</option>
          <option value="ongoing">Đang chạy</option><option value="upcoming">Sắp chạy</option><option value="expired">Hết hạn</option>
        </select>
        <span style={{ marginLeft: 'auto', fontSize: '0.8rem', color: '#64748b', fontWeight: 700 }}>{fmtMoney(filtered.length)} voucher</span>
      </div>

      <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              <th style={th}>Gian</th><th style={th}>Tên voucher</th><th style={th}>Mã</th>
              <th style={th}>Mức giảm</th><th style={th}>Đơn tối thiểu</th>
              <th style={{ ...th, textAlign: 'center' }}>Đã dùng</th>
              <th style={th}>Thời gian</th><th style={{ ...th, textAlign: 'center' }}>Trạng thái</th>
            </tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={8} style={{ ...td, textAlign: 'center', padding: 40, color: '#94a3b8' }}>⏳ Đang tải...</td></tr>
                : filtered.length === 0 ? <tr><td colSpan={8} style={{ ...td, textAlign: 'center', padding: 40, color: '#94a3b8' }}>Chưa có voucher — bấm “🔄 Đồng bộ từ sàn” để kéo về.</td></tr>
                  : filtered.slice(0, 500).map(v => { const st = STATE_LBL[stateOf(v)]; const used = Number(v.current_usage) || 0; const total = Number(v.usage_quantity) || 0; return (
                    <tr key={v.voucher_id}>
                      <td style={{ ...td, fontSize: '0.76rem' }}>{v.san === 'tiktok' ? '⬛' : '🟠'} {v.shop_name}</td>
                      <td style={{ ...td, fontWeight: 600, whiteSpace: 'normal', maxWidth: 240 }}>{v.voucher_name}</td>
                      <td style={{ ...td, fontFamily: 'monospace', fontSize: '0.76rem' }}>{v.voucher_code || '—'}</td>
                      <td style={{ ...td, fontWeight: 700, color: '#0891b2' }}>{mucGiam(v)}</td>
                      <td style={td}>{v.min_basket_price ? fmtMoney(v.min_basket_price) + 'đ' : '—'}</td>
                      <td style={{ ...td, textAlign: 'center', fontWeight: 800, color: v.current_usage == null ? '#cbd5e1' : (used ? '#15803d' : '#dc2626') }}>
                        {v.current_usage == null
                          ? <span style={{ color: '#cbd5e1', fontWeight: 400 }} title="TikTok không trả số lượt đã dùng ở API danh sách">—</span>
                          : fmtMoney(used)}
                        {total ? <span style={{ color: '#94a3b8', fontWeight: 400 }}>/{fmtMoney(total)}</span> : null}
                      </td>
                      <td style={{ ...td, fontSize: '0.74rem', color: '#64748b' }}>
                        {v.start_time ? fmtDate(new Date(v.start_time * 1000).toISOString()) : '?'} → {v.end_time ? fmtDate(new Date(v.end_time * 1000).toISOString()) : '?'}
                      </td>
                      <td style={{ ...td, textAlign: 'center' }}>
                        <span style={{ padding: '2px 9px', borderRadius: 20, fontSize: '0.7rem', fontWeight: 700, background: st.bg, color: st.c }}>{st.l}</span>
                      </td>
                    </tr>
                  ); })}
            </tbody>
          </table>
        </div>
        {filtered.length > 500 && <div style={{ padding: '8px 14px', fontSize: '0.76rem', color: '#94a3b8' }}>Hiện 500/{fmtMoney(filtered.length)} — thu hẹp bộ lọc để xem tiếp.</div>}
      </div>
    </div>
  );
}

export default function VoucherTab({ currentUser }) {
  const { nhanSus } = useAppData();
  const [mainTab, setMainTab] = useState('cs');   // cs = CS gửi khách · shop = shop tạo trên sàn
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(curYm());
  const [statusF, setStatusF] = useState('all');
  const [reasonF, setReasonF] = useState('all');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null);
  const [csView, setCsView] = useState('list');            // list | report (brief mục 8)
  const [importing, setImporting] = useState(false);
  const [periodMode, setPeriodMode] = useState('month');   // week | month | quarter

  const load = useCallback(async () => {
    setLoading(true);
    // ⚠️ Supabase CẮT CỤT 1000 dòng mỗi lượt dù .limit() để cao hơn. Sau khi nhập từ sàn bảng đã
    // 4.800+ dòng → không phân trang thì KPI/báo cáo tính trên 1/5 dữ liệu mà không báo lỗi gì.
    const all = [];
    for (let pg = 0; pg < 30; pg++) {
      const { data, error } = await supabase.from('support_vouchers').select('*')
        .order('issue_date', { ascending: false }).order('created_at', { ascending: false })
        .range(pg * 1000, pg * 1000 + 999);
      if (error) { alert('Lỗi tải: ' + error.message); break; }
      all.push(...(data || []));
      if (!data || data.length < 1000) break;
    }
    setRows(all); setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    const r = editing;
    if (!r.customer_name?.trim() && !r.voucher_code?.trim()) { alert('Cần Tên khách hoặc Mã voucher'); return; }
    const payload = {
      issue_date: r.issue_date || todayYmd(), platform: r.platform || null, order_sn: r.order_sn || null,
      customer_name: r.customer_name || null, reason_category: r.reason_category || null, voucher_code: r.voucher_code || null,
      amount: num(r.amount), use_status: r.use_status || 'unused', staff: r.staff || (currentUser?.username || ''),
      accountant_checked: !!r.accountant_checked, expire_date: r.expire_date || null,
      used_at: r.use_status === 'used' ? (r.used_at || todayYmd()) : null, note: r.note || null, evidence_links: r.evidence_links || null,
    };
    const { error } = r.id ? await supabase.from('support_vouchers').update(payload).eq('id', r.id) : await supabase.from('support_vouchers').insert(payload);
    if (error) { alert('Lưu không được: ' + error.message); return; }
    setEditing(null); load();
  };
  // Nhập voucher hỗ trợ đã cấp trên sàn về (chỉ lấy voucher phát hành ≤5 lượt = cấp riêng cho khách)
  const runImport = async () => {
    setImporting(true);
    const { data: n, error } = await supabase.rpc('import_support_vouchers', { p_max_qty: 5 });
    setImporting(false);
    if (error) alert('Nhập không được: ' + error.message);
    else { alert(n > 0 ? `✅ Đã nhập thêm ${n} voucher từ sàn` : 'Không có voucher mới — đã nhập đủ trước đó'); load(); }
  };

  const del = async (r) => { if (!confirm(`Xoá voucher của "${r.customer_name || r.voucher_code}"?`)) return; await supabase.from('support_vouchers').delete().eq('id', r.id); load(); };
  const patch = async (r, p) => { setRows(prev => prev.map(x => x.id === r.id ? { ...x, ...p } : x)); await supabase.from('support_vouchers').update(p).eq('id', r.id); };

  const monthRange = (ym) => { const [y, m] = ym.split('-').map(Number); return { start: `${ym}-01`, end: m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01` }; };
  const { start, end } = monthRange(month === 'all' ? curYm() : month);
  const filtered = useMemo(() => rows.filter(r => {
    if (month !== 'all') { const d = (r.issue_date || '').slice(0, 10); if (!(d >= start && d < end)) return false; }
    if (statusF !== 'all' && r.use_status !== statusF) return false;
    if (reasonF !== 'all' && r.reason_category !== reasonF) return false;
    if (search) { const q = search.toLowerCase(); if (![r.customer_name, r.voucher_code, r.order_sn, r.note].some(v => v && String(v).toLowerCase().includes(q))) return false; }
    return true;
  }), [rows, month, statusF, reasonF, search, start, end]);

  const kpi = useMemo(() => {
    let total = 0, used = 0, unused = 0, valTotal = 0, valUsed = 0, waitAcc = 0;
    filtered.forEach(r => { total++; const a = num(r.amount); valTotal += a; if (r.use_status === 'used') { used++; valUsed += a; } if (r.use_status === 'unused') unused++; if (!r.accountant_checked) waitAcc += a; });
    return { total, used, unused, valTotal, valUsed, waitAcc, useRate: total ? (used / total * 100).toFixed(0) : 0 };
  }, [filtered]);

  const byReason = useMemo(() => {
    const m = {}; filtered.forEach(r => { const k = r.reason_category || 'Khác'; if (!m[k]) m[k] = { n: 0, val: 0 }; m[k].n++; m[k].val += num(r.amount); });
    return Object.entries(m).sort((a, b) => b[1].val - a[1].val);
  }, [filtered]);

  const months = useMemo(() => { const s = new Set(rows.map(r => (r.issue_date || '').slice(0, 7)).filter(Boolean)); s.add(curYm()); return ['all', ...Array.from(s).sort().reverse()]; }, [rows]);

  // ══ BÁO CÁO & PHÂN TÍCH — brief mục 4 · 5 · 8 · 9 ═══════════════════════════
  // Kỳ báo cáo TUẦN / THÁNG / QUÝ (brief mục 8). Trả về chuỗi so sánh được trực tiếp.
  const periodKey = (ymd, mode) => {
    if (!ymd) return '—';
    const d = String(ymd).slice(0, 10);
    if (mode === 'month') return d.slice(0, 7);
    if (mode === 'quarter') { const [y, m] = d.split('-').map(Number); return `${y}-Q${Math.floor((m - 1) / 3) + 1}`; }
    const dt = new Date(d + 'T00:00:00');
    if (isNaN(dt)) return '—';
    const t = new Date(dt); t.setDate(dt.getDate() + 4 - (dt.getDay() || 7));   // tuần ISO
    const y0 = new Date(t.getFullYear(), 0, 1);
    return `${t.getFullYear()}-T${String(Math.ceil(((t - y0) / 86400000 + 1) / 7)).padStart(2, '0')}`;
  };

  // Báo cáo tính trên TOÀN BỘ voucher (KHÔNG dính bộ lọc tháng của bảng danh sách) — có vậy mới
  // so được kỳ này với kỳ trước.
  const rpt = useMemo(() => {
    const byPeriod = {}, byShop = {}, byReasonAll = {};
    rows.forEach(r => {
      const a = num(r.amount), used = r.use_status === 'used';
      const pk = periodKey(r.issue_date, periodMode);
      if (!byPeriod[pk]) byPeriod[pk] = { ky: pk, n: 0, val: 0, used: 0 };
      byPeriod[pk].n++; byPeriod[pk].val += a; if (used) byPeriod[pk].used++;

      const sk = r.shop_name || (r.platform === 'tiktok' ? 'TikTok (chưa rõ gian)' : 'Shopee (chưa rõ gian)');
      if (!byShop[sk]) byShop[sk] = { gian: sk, n: 0, val: 0, used: 0 };
      byShop[sk].n++; byShop[sk].val += a; if (used) byShop[sk].used++;

      const rk = r.reason_category || 'Khác';
      if (!byReasonAll[rk]) byReasonAll[rk] = { ly_do: rk, n: 0, val: 0, used: 0 };
      byReasonAll[rk].n++; byReasonAll[rk].val += a; if (used) byReasonAll[rk].used++;
    });
    const tong = rows.length || 1;
    return {
      periods: Object.values(byPeriod).sort((a, b) => b.ky.localeCompare(a.ky)),
      shops: Object.values(byShop).sort((a, b) => b.val - a.val),
      reasons: Object.values(byReasonAll).map(x => ({ ...x, pct: x.n / tong * 100 })).sort((a, b) => b.n - a.n),
      tong: rows.length,
    };
  }, [rows, periodMode]);                                    // eslint-disable-line react-hooks/exhaustive-deps

  // Cảnh báo tự động (brief mục 9): so kỳ MỚI NHẤT với kỳ LIỀN TRƯỚC theo ngưỡng.
  // Cố ý KHÔNG gắn mác "AI" — đây là đếm + so kỳ trước bằng luật, số liệu chính xác và giải thích được.
  const canhBao = useMemo(() => {
    const out = [];
    const congNo = rows.filter(r => !r.accountant_checked).reduce((s, r) => s + num(r.amount), 0);
    const ps = rpt.periods;
    if (ps.length >= 2) {
      const nay = ps[0], truoc = ps[1];
      const tang = truoc.n ? ((nay.n - truoc.n) / truoc.n * 100) : 0;
      if (truoc.n >= 3 && tang >= 30) out.push({ muc: 'do', chu: `Voucher hỗ trợ TĂNG ${tang.toFixed(0)}% so với kỳ trước (${nay.n} vs ${truoc.n})` });
      if (truoc.n >= 3 && tang <= -30) out.push({ muc: 'xanh', chu: `Voucher hỗ trợ GIẢM ${Math.abs(tang).toFixed(0)}% so với kỳ trước — dấu hiệu tốt` });
      const dem = (ky, ly) => rows.filter(r => periodKey(r.issue_date, periodMode) === ky && (r.reason_category || 'Khác') === ly).length;
      rpt.reasons.forEach(x => {
        const a = dem(nay.ky, x.ly_do), b = dem(truoc.ky, x.ly_do);
        if (a >= 5 && b >= 1 && (a - b) / b >= 0.5) out.push({ muc: 'do', chu: `Voucher do "${x.ly_do}" tăng mạnh: ${b} → ${a} trong kỳ này` });
      });
    }
    const top = rpt.shops[0];
    if (top && rpt.shops.length > 1 && rpt.tong && top.n / rpt.tong >= 0.5)
      out.push({ muc: 'vang', chu: `Gian "${top.gian}" chiếm ${(top.n / rpt.tong * 100).toFixed(0)}% tổng voucher — soi lại xem có bất thường không` });
    if (congNo > 0) out.push({ muc: 'vang', chu: `Còn ${fmtMoney(congNo)}đ voucher CHƯA đối soát kế toán (công nợ voucher)` });
    return out;
  }, [rpt, rows, periodMode]);                               // eslint-disable-line react-hooks/exhaustive-deps

  const exportXlsx = () => {
    // Đủ trường brief mục 2 + gian (mục 8) + ảnh bằng chứng — kho & kế toán tra thẳng trên file này.
    const data = filtered.map((r, i) => ({
      STT: i + 1, 'Ngày tạo': fmtDate(r.issue_date), 'Sàn': r.platform, 'Gian hàng': r.shop_name || '',
      'Mã đơn': r.order_sn, 'Khách hàng': r.customer_name, 'Mã voucher': r.voucher_code,
      'Số tiền hỗ trợ': num(r.amount), 'Lý do tạo': r.reason_category,
      'Trạng thái': USE_STATUS[r.use_status]?.label, 'Ngày dùng': fmtDate(r.used_at), 'Hạn dùng': fmtDate(r.expire_date),
      'Đối soát KT': r.accountant_checked ? 'x' : '', 'Nhân viên tạo': r.staff,
      'Ảnh bằng chứng': (r.evidence_links || '').split('\n').filter(Boolean).join(' , '), 'Ghi chú': r.note,
    }));
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), 'Voucher'); XLSX.writeFile(wb, `Voucher_${month}.xlsx`);
  };

  return (
    <div style={{ fontFamily: "'Outfit', sans-serif", maxWidth: 1400 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 12 }}>
        <div><h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 900, color: '#0f172a' }}>🎫 Voucher</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#94a3b8' }}>Voucher CS cấp bù cho khách · và voucher shop tạo trên sàn</p></div>
        {mainTab === 'cs' && <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <select value={month} onChange={e => setMonth(e.target.value)} style={{ ...inputStyle, width: 'auto', cursor: 'pointer', fontWeight: 700 }}>{months.map(m => <option key={m} value={m}>{m === 'all' ? '📅 Tất cả' : `📅 ${m}`}</option>)}</select>
          <button onClick={exportXlsx} style={{ padding: '9px 16px', borderRadius: 9, border: '1.5px solid #e5e7eb', background: '#fff', color: '#64748b', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>📥 Xuất Excel</button>
          {/* Voucher hỗ trợ CS ĐÃ được tạo sẵn trên Shopee, tên chứa "mã đơn - lý do - tiền - NV"
              → nhập thẳng về, khỏi gõ tay lại hàng nghìn dòng. Chạy lại chỉ lấy voucher CHƯA có. */}
          <button onClick={runImport} disabled={importing}
            style={{ padding: '9px 16px', borderRadius: 9, border: '1.5px solid #bbf7d0', background: importing ? '#f1f5f9' : '#f0fdf4', color: '#15803d', fontWeight: 800, fontSize: 13, cursor: importing ? 'default' : 'pointer' }}>
            {importing ? '⏳ Đang nhập...' : '⬇️ Nhập từ sàn'}
          </button>
          <button onClick={() => setEditing({ ...EMPTY, staff: currentUser?.username || '' })} style={{ padding: '9px 18px', borderRadius: 9, border: 'none', background: ACCENT, color: '#fff', fontWeight: 800, fontSize: 13, cursor: 'pointer' }}>+ Cấp voucher</button>
        </div>}
      </div>

      {/* CS 29/7 can CA 2 loai voucher */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 18, background: '#f3f4f6', borderRadius: 12, padding: 4, width: 'fit-content' }}>
        {[{ k: 'cs', l: '🎁 Voucher CS gửi khách' }, { k: 'shop', l: '🏪 Voucher shop tạo (từ sàn)' }].map(t => (
          <button key={t.k} onClick={() => setMainTab(t.k)}
            style={{ padding: '9px 20px', borderRadius: 9, border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
              background: mainTab === t.k ? 'linear-gradient(135deg, #ff7a30, #ef4444)' : 'transparent',
              color: mainTab === t.k ? '#fff' : '#666' }}>{t.l}</button>
        ))}
      </div>

      {mainTab === 'shop' ? <ShopVouchers /> : <>

      {/* Chuyển giữa Danh sách và Báo cáo (brief mục 8) */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, background: '#f8fafc', borderRadius: 10, padding: 3, width: 'fit-content' }}>
        {[{ k: 'list', l: '📋 Danh sách voucher' }, { k: 'report', l: '📊 Báo cáo & Phân tích' }].map(t => (
          <button key={t.k} onClick={() => setCsView(t.k)}
            style={{ padding: '7px 16px', borderRadius: 8, border: 'none', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
              background: csView === t.k ? '#fff' : 'transparent', color: csView === t.k ? ACCENT : '#64748b',
              boxShadow: csView === t.k ? '0 1px 3px rgba(0,0,0,0.08)' : 'none' }}>{t.l}</button>
        ))}
      </div>

      {csView === 'report' ? (
        <div style={{ display: 'grid', gap: 14 }}>
          {/* ── Cảnh báo tự động (brief mục 9) ── */}
          {canhBao.length > 0 && (
            <div style={card}>
              <div style={{ ...labelStyle, marginBottom: 10 }}>🔔 Cảnh báo tự động</div>
              <div style={{ display: 'grid', gap: 7 }}>
                {canhBao.map((c, i) => {
                  const mau = c.muc === 'do' ? { bg: '#fef2f2', bd: '#fecaca', tx: '#b91c1c', ic: '⚠️' }
                    : c.muc === 'xanh' ? { bg: '#f0fdf4', bd: '#bbf7d0', tx: '#15803d', ic: '✅' }
                      : { bg: '#fffbeb', bd: '#fde68a', tx: '#92400e', ic: '📌' };
                  return (
                    <div key={i} style={{ background: mau.bg, border: `1px solid ${mau.bd}`, color: mau.tx, borderRadius: 9, padding: '9px 13px', fontSize: '0.85rem', fontWeight: 600 }}>
                      {mau.ic} {c.chu}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Báo cáo theo THỜI GIAN: tuần / tháng / quý (brief mục 8) ── */}
          <div style={card}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
              <div style={labelStyle}>📅 Báo cáo theo thời gian</div>
              <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
                {[{ k: 'week', l: 'Tuần' }, { k: 'month', l: 'Tháng' }, { k: 'quarter', l: 'Quý' }].map(m => (
                  <button key={m.k} onClick={() => setPeriodMode(m.k)}
                    style={{ padding: '5px 14px', borderRadius: 7, border: `1.5px solid ${periodMode === m.k ? ACCENT : '#e5e7eb'}`, background: periodMode === m.k ? '#fff7ed' : '#fff', color: periodMode === m.k ? ACCENT : '#64748b', fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>{m.l}</button>
                ))}
              </div>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={th}>Kỳ</th><th style={{ ...th, textAlign: 'right' }}>Số voucher</th><th style={{ ...th, textAlign: 'right' }}>Giá trị</th><th style={{ ...th, textAlign: 'right' }}>Đã dùng</th><th style={{ ...th, textAlign: 'right' }}>Tỷ lệ dùng</th></tr></thead>
              <tbody>
                {rpt.periods.slice(0, 12).map(p => (
                  <tr key={p.ky}>
                    <td style={{ ...td, fontWeight: 700 }}>{p.ky}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{fmtMoney(p.n)}</td>
                    <td style={{ ...td, textAlign: 'right', color: '#0891b2', fontWeight: 700 }}>{fmtMoney(p.val)}đ</td>
                    <td style={{ ...td, textAlign: 'right' }}>{fmtMoney(p.used)}</td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 800, color: p.n && p.used / p.n >= 0.5 ? '#15803d' : '#b45309' }}>{p.n ? (p.used / p.n * 100).toFixed(0) : 0}%</td>
                  </tr>
                ))}
                {rpt.periods.length === 0 && <tr><td colSpan={5} style={{ ...td, textAlign: 'center', color: '#94a3b8', padding: 30 }}>Chưa có voucher nào</td></tr>}
              </tbody>
            </table>
          </div>

          {/* ── Theo GIAN (brief mục 8) + tỷ lệ dùng theo sàn (brief mục 5) ── */}
          <div style={card}>
            <div style={{ ...labelStyle, marginBottom: 10 }}>🏪 Báo cáo theo gian hàng · tỷ lệ sử dụng từng gian</div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={th}>Gian</th><th style={{ ...th, textAlign: 'right' }}>Số voucher</th><th style={{ ...th, textAlign: 'right' }}>Giá trị hỗ trợ</th><th style={{ ...th, textAlign: 'right' }}>Tỷ lệ dùng</th></tr></thead>
              <tbody>
                {rpt.shops.map(sh => (
                  <tr key={sh.gian}>
                    <td style={{ ...td, fontWeight: 600 }}>{sh.gian}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{fmtMoney(sh.n)}</td>
                    <td style={{ ...td, textAlign: 'right', color: '#0891b2', fontWeight: 700 }}>{fmtMoney(sh.val)}đ</td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 800, color: sh.n && sh.used / sh.n >= 0.5 ? '#15803d' : '#b45309' }}>{sh.n ? (sh.used / sh.n * 100).toFixed(0) : 0}%</td>
                  </tr>
                ))}
                {rpt.shops.length === 0 && <tr><td colSpan={4} style={{ ...td, textAlign: 'center', color: '#94a3b8', padding: 30 }}>Chưa có data</td></tr>}
              </tbody>
            </table>
          </div>

          {/* ── Nguyên nhân: số lượng · TỶ LỆ % · giá trị (brief mục 4) ── */}
          <div style={card}>
            <div style={{ ...labelStyle, marginBottom: 10 }}>🎯 Thống kê lý do tạo voucher</div>
            {rpt.reasons.map(x => (
              <div key={x.ly_do} style={{ marginBottom: 9 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.84rem', marginBottom: 3 }}>
                  <span style={{ flex: 1, fontWeight: 600 }}>{x.ly_do}</span>
                  <span style={{ fontWeight: 900, color: ACCENT, minWidth: 46, textAlign: 'right' }}>{x.pct.toFixed(0)}%</span>
                  <span style={{ color: '#64748b', minWidth: 54, textAlign: 'right' }}>{fmtMoney(x.n)} cái</span>
                  <span style={{ color: '#0891b2', fontWeight: 700, minWidth: 96, textAlign: 'right' }}>{fmtMoney(x.val)}đ</span>
                </div>
                <div style={{ height: 7, background: '#f1f5f9', borderRadius: 5, overflow: 'hidden' }}>
                  <div style={{ width: `${x.pct}%`, height: '100%', background: ACCENT, borderRadius: 5 }} />
                </div>
              </div>
            ))}
            {rpt.reasons.length === 0 && <div style={{ color: '#94a3b8', fontSize: '0.85rem' }}>Chưa có data</div>}
          </div>
        </div>
      ) : (<>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 16 }}>
        {[
          { label: 'Tổng voucher', v: kpi.total, sub: `${kpi.useRate}% đã dùng`, color: '#6366f1', money: false },
          { label: 'Chưa dùng', v: kpi.unused, sub: 'còn hiệu lực', color: '#b45309', money: false },
          { label: 'Tổng giá trị cấp', v: kpi.valTotal, sub: 'đ', color: '#0891b2', money: true },
          { label: 'Giá trị đã dùng', v: kpi.valUsed, sub: 'đ', color: '#15803d', money: true },
          { label: 'Chờ đối soát KT', v: kpi.waitAcc, sub: 'đ chưa soát', color: '#dc2626', money: true },
        ].map((c, i) => (
          <div key={i} style={{ ...card, borderTop: `3px solid ${c.color}` }}>
            <div style={{ fontSize: c.money ? '1.2rem' : '1.5rem', fontWeight: 900, color: c.color }}>{c.money ? fmtMoney(c.v) : c.v}</div>
            <div style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 700 }}>{c.label} · {c.sub}</div>
          </div>
        ))}
      </div>

      {byReason.length > 0 && (
        <div style={{ ...card, marginBottom: 16 }}>
          <div style={{ ...labelStyle, marginBottom: 10 }}>Phân tích theo nguyên nhân</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {byReason.map(([r, d]) => { const active = reasonF === r; return (
              <div key={r} onClick={() => setReasonF(active ? 'all' : r)} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '7px 12px', borderRadius: 8, background: active ? '#fff7ed' : '#f8fafc', border: `1.5px solid ${active ? '#fed7aa' : '#e5e7eb'}` }}>
                <span style={{ fontSize: '0.82rem', fontWeight: 700 }}>{r}</span><span style={{ fontSize: '0.82rem', fontWeight: 800, color: ACCENT }}>{d.n}</span><span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>{fmtMoney(d.val)}đ</span>
              </div>); })}
          </div>
        </div>
      )}

      <div style={{ ...card, marginBottom: 14, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <input type="text" placeholder="🔍 Tìm khách, mã voucher, đơn..." value={search} onChange={e => setSearch(e.target.value)} style={{ ...inputStyle, width: 240 }} />
        <select value={statusF} onChange={e => setStatusF(e.target.value)} style={{ ...inputStyle, width: 'auto', cursor: 'pointer' }}><option value="all">Trạng thái: Tất cả</option>{Object.keys(USE_STATUS).map(s => <option key={s} value={s}>{USE_STATUS[s].label}</option>)}</select>
        {reasonF !== 'all' && <button onClick={() => setReasonF('all')} style={{ padding: '6px 12px', borderRadius: 20, border: '1.5px solid #fed7aa', background: '#fff7ed', color: ACCENT, fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>{reasonF} ✕</button>}
        <span style={{ marginLeft: 'auto', fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>{filtered.length} voucher</span>
      </div>

      <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              <th style={th}>Ngày</th><th style={th}>Khách</th><th style={th}>Mã voucher</th><th style={{ ...th, textAlign: 'right' }}>Số tiền</th>
              <th style={th}>Lý do</th><th style={{ ...th, textAlign: 'center' }}>Trạng thái</th><th style={{ ...th, textAlign: 'center' }}>Đối soát KT</th><th style={th}>NV</th><th style={{ ...th, textAlign: 'center', width: 150 }}>Hành động</th>
            </tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={9} style={{ ...td, textAlign: 'center', padding: 40, color: '#94a3b8' }}>⏳ Đang tải...</td></tr>
                : filtered.length === 0 ? <tr><td colSpan={9} style={{ ...td, textAlign: 'center', padding: 40, color: '#94a3b8' }}>Chưa có voucher — bấm "+ Cấp voucher"</td></tr>
                : filtered.map(r => { const st = USE_STATUS[r.use_status] || USE_STATUS.unused; return (
                  <tr key={r.id}>
                    <td style={td}>{fmtDate(r.issue_date)}</td>
                    <td style={{ ...td, fontWeight: 600 }}>{r.customer_name || '—'}{r.order_sn && <div style={{ fontSize: '0.66rem', color: '#94a3b8', fontFamily: 'monospace' }}>{r.order_sn}</div>}</td>
                    <td style={{ ...td, fontFamily: 'monospace', fontSize: '0.76rem' }}>{r.voucher_code || '—'}</td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(r.amount)}</td>
                    <td style={td}>{r.reason_category || '—'}</td>
                    <td style={{ ...td, textAlign: 'center' }}>
                      <select value={r.use_status} onChange={e => patch(r, { use_status: e.target.value, used_at: e.target.value === 'used' ? todayYmd() : null })} style={{ padding: '3px 6px', borderRadius: 6, border: 'none', fontSize: '0.72rem', fontWeight: 700, background: st.bg, color: st.color, cursor: 'pointer' }}>
                        {Object.keys(USE_STATUS).map(s => <option key={s} value={s}>{USE_STATUS[s].label}</option>)}
                      </select>
                    </td>
                    <td style={{ ...td, textAlign: 'center' }}><input type="checkbox" checked={!!r.accountant_checked} onChange={e => patch(r, { accountant_checked: e.target.checked })} style={{ cursor: 'pointer', width: 16, height: 16 }} /></td>
                    <td style={{ ...td, fontSize: '0.76rem' }}>{r.staff || '—'}</td>
                    <td style={{ ...td, textAlign: 'center' }}><div style={{ display: 'flex', gap: 5, justifyContent: 'center' }}><button onClick={() => setEditing(r)} style={miniBtn('#64748b')}>Sửa</button><button onClick={() => del(r)} style={miniBtn('#dc2626')}>Xoá</button></div></td>
                  </tr>); })}
            </tbody>
          </table>
        </div>
      </div>
      </>)}

      {/* Form cấp voucher: nằm NGOÀI phần Danh sách/Báo cáo để mở được ở cả 2 chỗ.
          Bấm nền KHÔNG đóng — tránh mất data đang nhập (bài học từ Khiếu nại / SP lỗi 27/7). */}
      {editing && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 16px', zIndex: 1000, overflowY: 'auto' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, padding: 24, width: '100%', maxWidth: 600 }}>
            <h2 style={{ margin: '0 0 16px', fontSize: '1.1rem', fontWeight: 900 }}>{editing.id ? '✏️ Sửa voucher' : '🎫 Cấp voucher hỗ trợ'}</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
              <div><label style={labelStyle}>Ngày cấp</label><input type="date" value={editing.issue_date || ''} onChange={e => setEditing({ ...editing, issue_date: e.target.value })} style={inputStyle} /></div>
              {/* Brief mục 8 cần báo cáo theo TỪNG GIAN → chọn gian, sàn tự suy ra khỏi phải chọn 2 lần */}
              <div style={{ gridColumn: 'span 2' }}><label style={labelStyle}>Sàn · Gian hàng</label>
                <select value={editing.shop_name ? `${editing.platform}|${editing.shop_name}` : ''}
                  onChange={e => { const sh = findShopByKey(e.target.value); setEditing({ ...editing, shop_name: sh ? sh.name : '', platform: sh ? sh.san : editing.platform }); }}
                  style={inputStyle}>
                  <option value="">— chọn gian —</option>
                  <optgroup label="Shopee">{SHOPS.filter(s => s.san === 'shopee').map(s => <option key={shopKey(s)} value={shopKey(s)}>Shopee · {s.name}</option>)}</optgroup>
                  <optgroup label="TikTok">{SHOPS.filter(s => s.san === 'tiktok').map(s => <option key={shopKey(s)} value={shopKey(s)}>TikTok · {s.name}</option>)}</optgroup>
                </select>
              </div>
              <div><label style={labelStyle}>Khách hàng</label><input value={editing.customer_name || ''} onChange={e => setEditing({ ...editing, customer_name: e.target.value })} style={inputStyle} /></div>
              <div><label style={labelStyle}>Mã đơn</label><input value={editing.order_sn || ''} onChange={e => setEditing({ ...editing, order_sn: e.target.value })} style={inputStyle} /></div>
              <div><label style={labelStyle}>Mã voucher</label><input value={editing.voucher_code || ''} onChange={e => setEditing({ ...editing, voucher_code: e.target.value })} style={inputStyle} /></div>
              <div><label style={labelStyle}>Số tiền hỗ trợ</label><input value={editing.amount || ''} onChange={e => setEditing({ ...editing, amount: e.target.value })} style={inputStyle} inputMode="numeric" /></div>
              <div><label style={labelStyle}>Lý do cấp</label><select value={editing.reason_category || ''} onChange={e => setEditing({ ...editing, reason_category: e.target.value })} style={inputStyle}>{REASONS.map(x => <option key={x} value={x}>{x}</option>)}</select></div>
              <div><label style={labelStyle}>Trạng thái</label><select value={editing.use_status} onChange={e => setEditing({ ...editing, use_status: e.target.value })} style={inputStyle}>{Object.keys(USE_STATUS).map(s => <option key={s} value={s}>{USE_STATUS[s].label}</option>)}</select></div>
              <div><label style={labelStyle}>Hết hạn</label><input type="date" value={editing.expire_date || ''} onChange={e => setEditing({ ...editing, expire_date: e.target.value })} style={inputStyle} /></div>
              <div><label style={labelStyle}>Nhân viên cấp</label><select value={editing.staff || ''} onChange={e => setEditing({ ...editing, staff: e.target.value })} style={inputStyle}><option value="">— chọn —</option>{(nhanSus || []).map(n => <option key={n.id} value={n.ten_nhansu}>{n.ten_nhansu}</option>)}</select></div>
              <div style={{ gridColumn: 'span 2', display: 'flex', alignItems: 'center', gap: 8 }}><input type="checkbox" checked={!!editing.accountant_checked} onChange={e => setEditing({ ...editing, accountant_checked: e.target.checked })} style={{ width: 16, height: 16, cursor: 'pointer' }} /><label style={{ fontSize: '0.84rem', fontWeight: 600 }}>Đã đối soát kế toán</label></div>
              <div style={{ gridColumn: 'span 2' }}><label style={labelStyle}>Ghi chú</label><input value={editing.note || ''} onChange={e => setEditing({ ...editing, note: e.target.value })} style={inputStyle} /></div>
              {/* Brief mục 2: voucher phải lưu HÌNH ẢNH BẰNG CHỨNG — up thẳng lên web, khỏi qua Drive */}
              <div style={{ gridColumn: 'span 2' }}><label style={labelStyle}>📷 Hình ảnh bằng chứng</label>
                <EvidenceUploader folder="voucher" value={editing.evidence_links || ''}
                  onChange={v => setEditing(p => ({ ...p, evidence_links: v }))} />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
              <button onClick={() => { if (window.confirm('Huỷ thì mất phần đang nhập. Huỷ luôn?')) setEditing(null); }} style={{ padding: '9px 20px', borderRadius: 9, border: '1.5px solid #e5e7eb', background: '#fff', color: '#64748b', fontWeight: 700, cursor: 'pointer' }}>Huỷ</button>
              <button onClick={save} style={{ padding: '9px 24px', borderRadius: 9, border: 'none', background: ACCENT, color: '#fff', fontWeight: 800, cursor: 'pointer' }}>💾 Lưu</button>
            </div>
          </div>
        </div>
      )}
      </>}
    </div>
  );
}

function miniBtn(color) { return { padding: '4px 9px', borderRadius: 7, border: 'none', background: color + '18', color, fontWeight: 700, fontSize: '0.72rem', cursor: 'pointer' }; }
