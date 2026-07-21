// src/components/VoucherTab.jsx
//
// Module 7 — Voucher hỗ trợ khách hàng (nhóm CSKH).
// Sổ voucher CS cấp bù cho khách (SP lỗi, giao chậm...). Theo dõi trạng thái dùng +
// đối soát kế toán + phân tích nguyên nhân. Bảng: support_vouchers. Nhập tay (đồng bộ sàn = sau).

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '../supabaseClient';
import { useAppData } from '../context/AppDataContext';

const ACCENT = '#ff6a2c';
const REASONS = ['Sản phẩm lỗi', 'Hàng giao chậm', 'Hư hỏng vận chuyển', 'Khách không hài lòng', 'Hỗ trợ phí ship', 'Chương trình CSKH', 'Khác'];
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
const EMPTY = { issue_date: todayYmd(), platform: 'shopee', order_sn: '', customer_name: '', reason_category: 'Sản phẩm lỗi', voucher_code: '', amount: 0, use_status: 'unused', staff: '', accountant_checked: false, expire_date: '', note: '' };

export default function VoucherTab({ currentUser }) {
  const { nhanSus } = useAppData();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(curYm());
  const [statusF, setStatusF] = useState('all');
  const [reasonF, setReasonF] = useState('all');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from('support_vouchers').select('*').order('issue_date', { ascending: false }).order('created_at', { ascending: false }).limit(2000);
    if (error) alert('Lỗi tải: ' + error.message);
    setRows(data || []); setLoading(false);
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
      used_at: r.use_status === 'used' ? (r.used_at || todayYmd()) : null, note: r.note || null,
    };
    const { error } = r.id ? await supabase.from('support_vouchers').update(payload).eq('id', r.id) : await supabase.from('support_vouchers').insert(payload);
    if (error) { alert('Lưu không được: ' + error.message); return; }
    setEditing(null); load();
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

  const exportXlsx = () => {
    const data = filtered.map((r, i) => ({ STT: i + 1, Ngày: fmtDate(r.issue_date), Sàn: r.platform, 'Mã đơn': r.order_sn, 'Khách': r.customer_name, 'Mã voucher': r.voucher_code, 'Số tiền': num(r.amount), 'Lý do': r.reason_category, 'Trạng thái': USE_STATUS[r.use_status]?.label, 'Đối soát KT': r.accountant_checked ? 'x' : '', 'NV': r.staff, 'Ghi chú': r.note }));
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), 'Voucher'); XLSX.writeFile(wb, `Voucher_${month}.xlsx`);
  };

  return (
    <div style={{ fontFamily: "'Outfit', sans-serif", maxWidth: 1400 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 12 }}>
        <div><h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 900, color: '#0f172a' }}>🎫 Voucher hỗ trợ khách</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#94a3b8' }}>Sổ voucher CS cấp bù cho khách · theo dõi sử dụng + đối soát kế toán</p></div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <select value={month} onChange={e => setMonth(e.target.value)} style={{ ...inputStyle, width: 'auto', cursor: 'pointer', fontWeight: 700 }}>{months.map(m => <option key={m} value={m}>{m === 'all' ? '📅 Tất cả' : `📅 ${m}`}</option>)}</select>
          <button onClick={exportXlsx} style={{ padding: '9px 16px', borderRadius: 9, border: '1.5px solid #e5e7eb', background: '#fff', color: '#64748b', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>📥 Xuất Excel</button>
          <button onClick={() => setEditing({ ...EMPTY, staff: currentUser?.username || '' })} style={{ padding: '9px 18px', borderRadius: 9, border: 'none', background: ACCENT, color: '#fff', fontWeight: 800, fontSize: 13, cursor: 'pointer' }}>+ Cấp voucher</button>
        </div>
      </div>

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

      {editing && (
        <div onClick={() => setEditing(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 16px', zIndex: 1000, overflowY: 'auto' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, padding: 24, width: '100%', maxWidth: 600 }}>
            <h2 style={{ margin: '0 0 16px', fontSize: '1.1rem', fontWeight: 900 }}>{editing.id ? '✏️ Sửa voucher' : '🎫 Cấp voucher hỗ trợ'}</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
              <div><label style={labelStyle}>Ngày cấp</label><input type="date" value={editing.issue_date || ''} onChange={e => setEditing({ ...editing, issue_date: e.target.value })} style={inputStyle} /></div>
              <div><label style={labelStyle}>Sàn</label><select value={editing.platform || ''} onChange={e => setEditing({ ...editing, platform: e.target.value })} style={inputStyle}><option value="">—</option><option value="shopee">Shopee</option><option value="tiktok">TikTok</option></select></div>
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
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
              <button onClick={() => setEditing(null)} style={{ padding: '9px 20px', borderRadius: 9, border: '1.5px solid #e5e7eb', background: '#fff', color: '#64748b', fontWeight: 700, cursor: 'pointer' }}>Huỷ</button>
              <button onClick={save} style={{ padding: '9px 24px', borderRadius: 9, border: 'none', background: ACCENT, color: '#fff', fontWeight: 800, cursor: 'pointer' }}>💾 Lưu</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function miniBtn(color) { return { padding: '4px 9px', borderRadius: 7, border: 'none', background: color + '18', color, fontWeight: 700, fontSize: '0.72rem', cursor: 'pointer' }; }
