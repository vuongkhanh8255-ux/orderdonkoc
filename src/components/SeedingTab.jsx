// src/components/SeedingTab.jsx
//
// Module 6 — Quản lý chi phí Seeding (nhóm CSKH).
// Lấy pattern từ Thanh toán KOC nhưng gọn cho seeding: Ngày · Họ tên · Nội dung ·
// Số tiền · VAT (0/5/8/10%) · QR/Link · Duyệt (Nháp→Chờ→Duyệt→Đã TT / Từ chối).
// Tổng = Số tiền + VAT. Bảng Supabase: seeding_payments (RLS allow-all, gate bằng login).
// Ảnh QR / chứng từ: bản đầu NHẬP LINK (paste URL); upload file để bản sau.

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '../supabaseClient';

const ACCENT = '#ff6a2c';
// CS 2/8: "Seeding TikTok" → đổi thành "Seeding" + thêm "Hỗ trợ ngoài"
const CONTENT_TYPES = ['Seeding', 'Hỗ trợ ngoài', 'Review sản phẩm', 'Livestream', 'Affiliate campaign', 'Khác'];
const VAT_OPTIONS = [0, 5, 8, 10];
const ACTION_PW = 'STELLA8255$';   // mật khẩu duyệt / đánh dấu đã thanh toán (1 lần/phiên)
const STATUS = {
  draft:    { label: 'Nháp',          color: '#64748b', bg: '#f1f5f9' },
  pending:  { label: 'Chờ duyệt',     color: '#b45309', bg: '#fef3c7' },
  approved: { label: 'Đã duyệt',      color: '#1d4ed8', bg: '#dbeafe' },
  paid:     { label: 'Đã thanh toán', color: '#15803d', bg: '#dcfce7' },
  rejected: { label: 'Từ chối',       color: '#dc2626', bg: '#fee2e2' },
};
const STATUS_ORDER = ['draft', 'pending', 'approved', 'paid', 'rejected'];

const num = (v) => { const n = Number(String(v ?? '').replace(/[^\d.-]/g, '')); return Number.isFinite(n) ? n : 0; };
const fmtMoney = (v) => (Number(v) || 0).toLocaleString('vi-VN');
const round = (v) => Math.round(Number(v) || 0);
const todayYmd = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const curYm = () => todayYmd().slice(0, 7);
const monthRange = (ym) => { const [y, m] = ym.split('-').map(Number); const start = `${ym}-01`; const end = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`; return { start, end }; };
const fmtDate = (s) => { if (!s) return ''; const p = String(s).slice(0, 10).split('-'); return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : s; };
const calcTotal = (amount, vat) => round(num(amount) * (1 + num(vat) / 100));

const EMPTY = {
  pay_date: todayYmd(), staff: '', seeder_name: '', content_type: 'Seeding',
  budget_source: '',        // CS 1/8: Nguồn ngân sách BẮT BUỘC — Stella / Optimax (quản lý riêng, không dùng chung)
  amount: 0, vat_pct: 0, bank_account: '', bank_name: '', beneficiary: '',
  qr_image: '', link: '', invoice_file: '', note: '', status: 'draft',
};
const BUDGET_SOURCES = ['Stella', 'Optimax'];

const inputStyle = { padding: '8px 11px', borderRadius: 9, border: '1px solid #e5e7eb', background: '#fff', fontSize: '0.85rem', color: '#1f2937', width: '100%', boxSizing: 'border-box', fontFamily: 'inherit' };
const labelStyle = { fontSize: '0.72rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: 4, display: 'block' };
const th = { padding: '9px 10px', fontSize: '0.68rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.3px', textAlign: 'left', whiteSpace: 'nowrap', background: '#f8fafc', borderBottom: '2px solid #e5e7eb' };
const td = { padding: '8px 10px', fontSize: '0.82rem', color: '#0f172a', whiteSpace: 'nowrap', borderTop: '1px solid #f1f5f9' };
const card = { background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', padding: '16px 18px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' };
const Field = ({ label, children, span }) => (<div style={span ? { gridColumn: `span ${span}` } : undefined}><label style={labelStyle}>{label}</label>{children}</div>);

export default function SeedingTab({ currentUser }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(curYm());
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null);   // object đang sửa/thêm, null = đóng form
  const [authed, setAuthed] = useState(false);     // đã nhập mật khẩu duyệt trong phiên
  const [budgets, setBudgets] = useState({});      // { 'YYYY-MM': số tiền } — ngân sách ĐẶT TAY theo tháng

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from('seeding_payments').select('*')
      .order('pay_date', { ascending: false }).order('created_at', { ascending: false });
    if (error) alert('Lỗi tải dữ liệu: ' + error.message);
    setRows(data || []); setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  // Ngân sách đặt tay theo THÁNG × NGUỒN (CS 1/8: Stella / Optimax quản lý riêng, không dùng chung).
  // srcBudgets = { 'YYYY-MM': { Stella: n, Optimax: n } }. Bảng cũ seeding_budgets (tổng tháng) vẫn
  // đọc làm fallback cho tháng chưa đặt theo nguồn.
  const [srcBudgets, setSrcBudgets] = useState({});
  const [budgetEdit, setBudgetEdit] = useState(null);   // { Stella: '', Optimax: '' } — popup Đặt ngân sách
  const loadBudgets = useCallback(async () => {
    const { data } = await supabase.from('seeding_budgets').select('ym, amount');
    const m = {}; (data || []).forEach(b => { m[b.ym] = Number(b.amount) || 0; });
    setBudgets(m);
    const { data: d2 } = await supabase.from('seeding_budget_sources').select('ym, source, amount');
    const s = {}; (d2 || []).forEach(b => { (s[b.ym] = s[b.ym] || {})[b.source] = Number(b.amount) || 0; });
    setSrcBudgets(s);
  }, []);
  useEffect(() => { loadBudgets(); }, [loadBudgets]);

  const setBudget = () => {
    if (month === 'all') { alert('Chọn 1 tháng cụ thể rồi mới đặt ngân sách nha.'); return; }
    const cur = srcBudgets[month] || {};
    setBudgetEdit({ Stella: cur.Stella ?? '', Optimax: cur.Optimax ?? '' });
  };
  const saveBudget = async () => {
    const rows2 = BUDGET_SOURCES.map(src => ({
      ym: month, source: src, amount: Number(String(budgetEdit[src] ?? '').replace(/[^\d]/g, '')) || 0,
      updated_by: currentUser?.username || '', updated_at: new Date().toISOString(),
    }));
    const { error } = await supabase.from('seeding_budget_sources').upsert(rows2, { onConflict: 'ym,source' });
    if (error) { alert('Lưu ngân sách không được: ' + error.message); return; }
    setSrcBudgets(s => ({ ...s, [month]: Object.fromEntries(rows2.map(r => [r.source, r.amount])) }));
    setBudgetEdit(null);
  };

  // Tên CS đã dùng → gợi ý cho ô "Người tạo" (thay danh sách nhân sự booking)
  const csNames = useMemo(() => [...new Set(rows.map(r => r.staff).filter(Boolean))].sort(), [rows]);

  const requirePw = () => {
    if (authed) return true;
    if (window.prompt('Nhập mật khẩu duyệt:') === ACTION_PW) { setAuthed(true); return true; }
    alert('Sai mật khẩu'); return false;
  };

  const save = async () => {
    const r = editing;
    if (!r.seeder_name?.trim()) { alert('Thiếu Họ tên seeder'); return; }
    if (!r.budget_source) { alert('Vui lòng chọn nguồn ngân sách'); return; }   // CS 1/8: bắt buộc, không cho lưu
    if (!r.note?.trim()) { alert('Vui lòng điền GHI CHÚ (lý do) trước khi lưu phiếu'); return; }   // CS 2/8: bắt buộc
    const payload = {
      pay_date: r.pay_date || todayYmd(), staff: r.staff || (currentUser?.username || ''),
      budget_source: r.budget_source,
      seeder_name: r.seeder_name.trim(), content_type: r.content_type || 'Khác',
      amount: num(r.amount), vat_pct: num(r.vat_pct), total: calcTotal(r.amount, r.vat_pct),
      bank_account: r.bank_account || null, bank_name: r.bank_name || null, beneficiary: r.beneficiary || null,
      qr_image: r.qr_image || null, link: r.link || null, invoice_file: r.invoice_file || null,
      note: r.note || null, status: r.status || 'draft',
    };
    const { error } = r.id
      ? await supabase.from('seeding_payments').update(payload).eq('id', r.id)
      : await supabase.from('seeding_payments').insert(payload);
    if (error) { alert('Lưu không được: ' + error.message); return; }
    setEditing(null); load();
  };

  const del = async (row) => {
    if (!window.confirm(`Xoá phiếu seeding của "${row.seeder_name}"?`)) return;
    const { error } = await supabase.from('seeding_payments').delete().eq('id', row.id);
    if (error) { alert('Xoá không được: ' + error.message); return; }
    load();
  };

  const setStatus = async (row, status) => {
    if ((status === 'approved' || status === 'paid') && !requirePw()) return;
    const patch = { status };
    if (status === 'approved') { patch.approved_at = new Date().toISOString(); patch.approved_by = currentUser?.username || ''; }
    if (status === 'paid') patch.paid_at = new Date().toISOString();
    const { error } = await supabase.from('seeding_payments').update(patch).eq('id', row.id);
    if (error) { alert('Lỗi: ' + error.message); return; }
    load();
  };

  const { start, end } = monthRange(month === 'all' ? curYm() : month);
  const filtered = useMemo(() => rows.filter(r => {
    if (month !== 'all') { const d = (r.pay_date || '').slice(0, 10); if (!(d >= start && d < end)) return false; }
    if (statusFilter !== 'all' && r.status !== statusFilter) return false;
    if (search) { const q = search.toLowerCase(); if (![r.seeder_name, r.content_type, r.note, r.beneficiary].some(v => v && String(v).toLowerCase().includes(q))) return false; }
    return true;
  }), [rows, month, statusFilter, search, start, end]);

  const kpi = useMemo(() => {
    let spend = 0, paid = 0, pending = 0;
    filtered.forEach(r => { const t = num(r.total); spend += t; if (r.status === 'paid') paid += t; else if (r.status !== 'rejected') pending += t; });
    // Ngân sách THEO NGUỒN (CS 1/8): phiếu nguồn nào trừ nguồn đó, không cộng dồn/trừ chéo.
    const srcOf = (ym) => srcBudgets[ym] || {};
    const budgetSrc = {}, spendSrc = {};
    BUDGET_SOURCES.forEach(src => {
      budgetSrc[src] = month === 'all'
        ? Object.keys(srcBudgets).reduce((a, ym) => a + (Number(srcOf(ym)[src]) || 0), 0)
        : (Number(srcOf(month)[src]) || 0);
      spendSrc[src] = filtered.filter(r => r.budget_source === src && r.status !== 'rejected')
        .reduce((a, r) => a + num(r.total), 0);
    });
    // Tổng ngân sách: ưu tiên tổng 2 nguồn đã đặt; tháng chưa đặt theo nguồn → fallback số tổng cũ.
    const sumSrc = BUDGET_SOURCES.reduce((a, s) => a + budgetSrc[s], 0);
    const legacy = month === 'all'
      ? Object.values(budgets).reduce((a, b) => a + (Number(b) || 0), 0)
      : (Number(budgets[month]) || 0);
    const budget = sumSrc > 0 ? sumSrc : legacy;
    return { budget, spend, paid, pending, remain: budget - paid, hasBudget: budget > 0, budgetSrc, spendSrc };
  }, [filtered, budgets, srcBudgets, month]);

  const months = useMemo(() => {
    const set = new Set(rows.map(r => (r.pay_date || '').slice(0, 7)).filter(Boolean));
    set.add(curYm());
    return ['all', ...Array.from(set).sort().reverse()];
  }, [rows]);

  const exportXlsx = () => {
    const data = filtered.map((r, i) => ({
      STT: i + 1, 'Ngày': fmtDate(r.pay_date), 'Họ tên': r.seeder_name, 'Nội dung': r.content_type, 'Nguồn ngân sách': r.budget_source || '',
      'Số tiền': num(r.amount), 'VAT %': num(r.vat_pct), 'Tổng': num(r.total),
      'Ngân hàng': r.bank_name || '', 'Số TK': r.bank_account || '', 'Chủ TK': r.beneficiary || '',
      'Link': r.link || '', 'Trạng thái': STATUS[r.status]?.label || r.status, 'Ghi chú': r.note || '',
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Seeding');
    XLSX.writeFile(wb, `Seeding_${month}.xlsx`);
  };

  const liveTotal = editing ? calcTotal(editing.amount, editing.vat_pct) : 0;

  return (
    <div style={{ fontFamily: "'Outfit', sans-serif", maxWidth: 1400 }}>
      {/* HEADER */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 900, color: '#0f172a' }}>🌱 Chi phí Seeding</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#94a3b8' }}>Quản lý thanh toán seeding — VAT tự tính tổng · duyệt · xuất Excel</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <select value={month} onChange={e => setMonth(e.target.value)} style={{ ...inputStyle, width: 'auto', cursor: 'pointer', fontWeight: 700 }}>
            {months.map(m => <option key={m} value={m}>{m === 'all' ? '📅 Tất cả tháng' : `📅 ${m}`}</option>)}
          </select>
          <button onClick={setBudget} title="Đặt ngân sách seeding cho tháng đang chọn" style={{ padding: '9px 16px', borderRadius: 9, border: '1.5px solid #c7d2fe', background: '#eef2ff', color: '#4f46e5', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>💰 Đặt ngân sách</button>
          <button onClick={exportXlsx} style={{ padding: '9px 16px', borderRadius: 9, border: '1.5px solid #e5e7eb', background: '#fff', color: '#64748b', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>📥 Xuất Excel</button>
          <button onClick={() => setEditing({ ...EMPTY, staff: currentUser?.username || '' })} style={{ padding: '9px 18px', borderRadius: 9, border: 'none', background: ACCENT, color: '#fff', fontWeight: 800, fontSize: 13, cursor: 'pointer', boxShadow: '0 4px 12px rgba(255,106,44,0.25)' }}>+ Thêm phiếu</button>
        </div>
      </div>

      {/* KPI */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 20 }}>
        {[
          { label: kpi.hasBudget ? 'Ngân sách tháng' : 'Ngân sách (chưa đặt)', value: kpi.budget, color: '#6366f1' },
          { label: 'Đã thanh toán', value: kpi.paid, color: '#16a34a' },
          { label: 'Chờ thanh toán', value: kpi.pending, color: '#d97706' },
          { label: kpi.hasBudget ? 'Ngân sách còn lại' : 'Tổng đã lên phiếu', value: kpi.hasBudget ? kpi.remain : kpi.spend, color: kpi.hasBudget && kpi.remain < 0 ? '#dc2626' : '#dc2626' },
        ].map((c, i) => (
          <div key={i} style={{ ...card, borderTop: `3px solid ${c.color}` }}>
            <div style={labelStyle}>{c.label}</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 900, color: c.color }}>{fmtMoney(c.value)}<span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#94a3b8' }}> đ</span></div>
          </div>
        ))}
      </div>

      {/* NGÂN SÁCH THEO NGUỒN (CS 1/8): Stella / Optimax riêng biệt, phiếu nguồn nào trừ nguồn đó */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 20 }}>
        {BUDGET_SOURCES.map(src => {
          const b = kpi.budgetSrc[src] || 0, s = kpi.spendSrc[src] || 0, con = b - s;
          const mau = src === 'Stella' ? '#7c3aed' : '#ea580c';
          return (
            <div key={src} style={{ ...card, borderTop: `3px solid ${mau}` }}>
              <div style={{ ...labelStyle, color: mau }}>💰 Nguồn {src}</div>
              {b > 0 ? (
                <>
                  <div style={{ fontSize: '1.25rem', fontWeight: 900, color: con < 0 ? '#dc2626' : mau }}>{fmtMoney(con)}<span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#94a3b8' }}> đ còn lại</span></div>
                  <div style={{ fontSize: '0.74rem', color: '#64748b', marginTop: 2 }}>Đã chi {fmtMoney(s)}đ / ngân sách {fmtMoney(b)}đ</div>
                  <div style={{ height: 7, background: '#f1f5f9', borderRadius: 5, overflow: 'hidden', marginTop: 6 }}>
                    <div style={{ width: `${Math.min(100, Math.round(100 * s / b))}%`, height: '100%', background: con < 0 ? '#dc2626' : mau }} />
                  </div>
                </>
              ) : (
                <div style={{ fontSize: '0.82rem', color: '#94a3b8' }}>Chưa đặt ngân sách {month === 'all' ? '' : `tháng ${month}`} — đã chi <b style={{ color: mau }}>{fmtMoney(s)}đ</b>. Bấm “💰 Đặt ngân sách”.</div>
              )}
            </div>
          );
        })}
      </div>

      {/* FILTER */}
      <div style={{ ...card, marginBottom: 16, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <input type="text" placeholder="🔍 Tìm seeder, nội dung, ghi chú..." value={search} onChange={e => setSearch(e.target.value)}
          style={{ ...inputStyle, width: 280 }} />
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          <button onClick={() => setStatusFilter('all')} style={pill(statusFilter === 'all', '#64748b')}>Tất cả</button>
          {STATUS_ORDER.map(s => (
            <button key={s} onClick={() => setStatusFilter(statusFilter === s ? 'all' : s)} style={pill(statusFilter === s, STATUS[s].color)}>{STATUS[s].label}</button>
          ))}
        </div>
        <span style={{ marginLeft: 'auto', fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>{filtered.length} phiếu</span>
      </div>

      {/* TABLE */}
      <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...th, width: 40, textAlign: 'center' }}>#</th>
                <th style={{ ...th, width: 90 }}>Ngày</th>
                <th style={{ ...th, minWidth: 140 }}>Họ tên</th>
                <th style={{ ...th, minWidth: 140 }}>Nội dung</th>
                <th style={{ ...th, width: 84, textAlign: 'center' }}>Nguồn NS</th>
                <th style={{ ...th, textAlign: 'right' }}>Số tiền</th>
                <th style={{ ...th, textAlign: 'center', width: 55 }}>VAT</th>
                <th style={{ ...th, textAlign: 'right' }}>Tổng</th>
                <th style={{ ...th, width: 90, textAlign: 'center' }}>QR/Link</th>
                <th style={{ ...th, width: 120, textAlign: 'center' }}>Trạng thái</th>
                <th style={{ ...th, width: 200, textAlign: 'center' }}>Hành động</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={11} style={{ ...td, textAlign: 'center', padding: 40, color: '#94a3b8' }}>⏳ Đang tải...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={11} style={{ ...td, textAlign: 'center', padding: 40, color: '#94a3b8' }}>Chưa có phiếu seeding nào — bấm "+ Thêm phiếu"</td></tr>
              ) : filtered.map((r, i) => {
                const st = STATUS[r.status] || STATUS.draft;
                return (
                  <tr key={r.id}>
                    <td style={{ ...td, textAlign: 'center', color: '#94a3b8' }}>{i + 1}</td>
                    <td style={td}>{fmtDate(r.pay_date)}</td>
                    <td style={{ ...td, fontWeight: 700 }}>{r.seeder_name}{r.beneficiary && r.beneficiary !== r.seeder_name ? <div style={{ fontSize: '0.68rem', color: '#94a3b8', fontWeight: 400 }}>{r.beneficiary}</div> : null}</td>
                    <td style={td}>{r.content_type}</td>
                    <td style={{ ...td, textAlign: 'center' }}>
                      {r.budget_source
                        ? <span style={{ padding: '2px 9px', borderRadius: 20, fontSize: '0.7rem', fontWeight: 800, background: r.budget_source === 'Stella' ? '#ede9fe' : '#ffedd5', color: r.budget_source === 'Stella' ? '#7c3aed' : '#ea580c' }}>{r.budget_source}</span>
                        : <span style={{ color: '#cbd5e1' }} title="Phiếu cũ trước khi có trường Nguồn ngân sách — mở Sửa để gắn">—</span>}
                    </td>
                    <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(r.amount)}</td>
                    <td style={{ ...td, textAlign: 'center', color: '#64748b' }}>{num(r.vat_pct)}%</td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(r.total)}</td>
                    <td style={{ ...td, textAlign: 'center' }}>
                      {r.qr_image ? <a href={r.qr_image} target="_blank" rel="noreferrer" title="QR">🏦</a> : null}
                      {r.link ? <a href={r.link} target="_blank" rel="noreferrer" title="Link" style={{ marginLeft: 6 }}>🔗</a> : null}
                      {r.invoice_file ? <a href={r.invoice_file} target="_blank" rel="noreferrer" title="Chứng từ" style={{ marginLeft: 6 }}>🧾</a> : null}
                      {!r.qr_image && !r.link && !r.invoice_file ? <span style={{ color: '#cbd5e1' }}>—</span> : null}
                    </td>
                    <td style={{ ...td, textAlign: 'center' }}>
                      <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: '0.72rem', fontWeight: 700, background: st.bg, color: st.color }}>{st.label}</span>
                    </td>
                    <td style={{ ...td, textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: 5, justifyContent: 'center', flexWrap: 'wrap' }}>
                        {r.status === 'draft' && <button onClick={() => setStatus(r, 'pending')} style={actBtn('#b45309', '#fef3c7')}>Gửi duyệt</button>}
                        {r.status === 'pending' && <button onClick={() => setStatus(r, 'approved')} style={actBtn('#1d4ed8', '#dbeafe')}>Duyệt</button>}
                        {r.status === 'pending' && <button onClick={() => setStatus(r, 'rejected')} style={actBtn('#dc2626', '#fee2e2')}>Từ chối</button>}
                        {r.status === 'approved' && <button onClick={() => setStatus(r, 'paid')} style={actBtn('#15803d', '#dcfce7')}>Đã TT</button>}
                        <button onClick={() => setEditing(r)} style={actBtn('#64748b', '#f1f5f9')}>Sửa</button>
                        {currentUser?.role === 'admin' && <button onClick={() => del(r)} style={actBtn('#dc2626', '#fef2f2')}>Xoá</button>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* FORM MODAL */}
      {editing && (
        <div onClick={() => setEditing(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 16px', zIndex: 1000, overflowY: 'auto' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, padding: 24, width: '100%', maxWidth: 640, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <h2 style={{ margin: '0 0 18px', fontSize: '1.15rem', fontWeight: 900, color: '#0f172a' }}>{editing.id ? '✏️ Sửa phiếu seeding' : '🌱 Thêm phiếu seeding'}</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
              <Field label="Ngày"><input type="date" value={editing.pay_date || ''} onChange={e => setEditing({ ...editing, pay_date: e.target.value })} style={inputStyle} /></Field>
              {/* CS 1/8: Nguồn ngân sách BẮT BUỘC — ngay dưới Ngày. Stella/Optimax quản lý riêng. */}
              <Field label="Nguồn ngân sách *">
                <select value={editing.budget_source || ''} onChange={e => setEditing({ ...editing, budget_source: e.target.value })}
                  style={{ ...inputStyle, borderColor: editing.budget_source ? '#e5e7eb' : '#fca5a5', fontWeight: 700 }}>
                  <option value="">Chọn nguồn ngân sách</option>
                  {BUDGET_SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                {!editing.budget_source && <div style={{ fontSize: '0.68rem', color: '#dc2626', marginTop: 3 }}>Vui lòng chọn nguồn ngân sách để tách riêng chi phí</div>}
              </Field>
              {/* Người tạo = TÊN CS (trước đây đổ nhầm danh sách nhân sự booking).
                  Gõ tự do + gợi ý các tên CS đã dùng trước đó → CS tự thêm tên mình, khỏi chờ khai báo. */}
              <Field label="Người tạo (CS)">
                <input list="cs-staff-list" value={editing.staff || ''} onChange={e => setEditing({ ...editing, staff: e.target.value })} style={inputStyle} placeholder="Tên CS tạo phiếu" />
                <datalist id="cs-staff-list">{csNames.map(n => <option key={n} value={n} />)}</datalist>
              </Field>
              <Field label="Họ tên seeder *"><input value={editing.seeder_name || ''} onChange={e => setEditing({ ...editing, seeder_name: e.target.value })} style={inputStyle} placeholder="Tên người nhận" /></Field>
              <Field label="Nội dung">
                <select value={editing.content_type || ''} onChange={e => setEditing({ ...editing, content_type: e.target.value })} style={inputStyle}>
                  {CONTENT_TYPES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>
              <Field label="Số tiền (chưa VAT)"><input value={editing.amount || ''} onChange={e => setEditing({ ...editing, amount: e.target.value })} style={inputStyle} placeholder="0" inputMode="numeric" /></Field>
              <Field label="VAT">
                <select value={editing.vat_pct ?? 0} onChange={e => setEditing({ ...editing, vat_pct: Number(e.target.value) })} style={inputStyle}>
                  {VAT_OPTIONS.map(v => <option key={v} value={v}>{v}%</option>)}
                </select>
              </Field>
              <div style={{ gridColumn: 'span 2', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 9, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#9a3412' }}>Tổng thanh toán (gồm VAT)</span>
                <span style={{ fontSize: '1.2rem', fontWeight: 900, color: ACCENT }}>{fmtMoney(liveTotal)} đ</span>
              </div>
              <Field label="Ngân hàng"><input value={editing.bank_name || ''} onChange={e => setEditing({ ...editing, bank_name: e.target.value })} style={inputStyle} /></Field>
              <Field label="Số tài khoản"><input value={editing.bank_account || ''} onChange={e => setEditing({ ...editing, bank_account: e.target.value })} style={inputStyle} /></Field>
              <Field label="Chủ tài khoản"><input value={editing.beneficiary || ''} onChange={e => setEditing({ ...editing, beneficiary: e.target.value })} style={inputStyle} /></Field>
              <Field label="Link QR (dán URL ảnh)"><input value={editing.qr_image || ''} onChange={e => setEditing({ ...editing, qr_image: e.target.value })} style={inputStyle} placeholder="https://..." /></Field>
              <Field label="Link nội dung (Drive/video/bài đăng)" span={2}><input value={editing.link || ''} onChange={e => setEditing({ ...editing, link: e.target.value })} style={inputStyle} placeholder="https://..." /></Field>
              <Field label="Link chứng từ (hoá đơn VAT/biên nhận)" span={2}><input value={editing.invoice_file || ''} onChange={e => setEditing({ ...editing, invoice_file: e.target.value })} style={inputStyle} placeholder="https://..." /></Field>
              {/* CS 2/8: GHI CHÚ (lý do) BẮT BUỘC mới cho lưu phiếu */}
              <Field label="Ghi chú (lý do) *" span={2}>
                <input value={editing.note || ''} onChange={e => setEditing({ ...editing, note: e.target.value })}
                  placeholder="Lý do chi khoản này…"
                  style={{ ...inputStyle, borderColor: editing.note?.trim() ? '#e5e7eb' : '#fca5a5' }} />
                {!editing.note?.trim() && <div style={{ fontSize: '0.68rem', color: '#dc2626', marginTop: 3 }}>Bắt buộc điền lý do mới lưu được phiếu</div>}
              </Field>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
              <button onClick={() => setEditing(null)} style={{ padding: '9px 20px', borderRadius: 9, border: '1.5px solid #e5e7eb', background: '#fff', color: '#64748b', fontWeight: 700, cursor: 'pointer' }}>Huỷ</button>
              <button onClick={save} style={{ padding: '9px 24px', borderRadius: 9, border: 'none', background: ACCENT, color: '#fff', fontWeight: 800, cursor: 'pointer' }}>💾 Lưu</button>
            </div>
          </div>
        </div>
      )}

      {/* POPUP ĐẶT NGÂN SÁCH THEO NGUỒN (CS 1/8): Stella / Optimax nhập riêng, cập nhật độc lập */}
      {budgetEdit && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 1000 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, padding: 24, width: '100%', maxWidth: 420 }}>
            <h2 style={{ margin: '0 0 4px', fontSize: '1.05rem', fontWeight: 900 }}>💰 Đặt ngân sách — tháng {month}</h2>
            <p style={{ margin: '0 0 16px', fontSize: '0.78rem', color: '#94a3b8' }}>Thiết lập hoặc cập nhật ngân sách cho từng nguồn.</p>
            {BUDGET_SOURCES.map(src => (
              <div key={src} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                <span style={{ width: 90, padding: '6px 0', textAlign: 'center', borderRadius: 8, fontWeight: 800, fontSize: '0.82rem', background: src === 'Stella' ? '#ede9fe' : '#ffedd5', color: src === 'Stella' ? '#7c3aed' : '#ea580c' }}>{src}</span>
                <input value={budgetEdit[src]} inputMode="numeric" placeholder="0"
                  onChange={e => setBudgetEdit(b => ({ ...b, [src]: e.target.value.replace(/[^\d]/g, '') }))}
                  style={{ ...inputStyle, flex: 1, textAlign: 'right', fontWeight: 700 }} />
                <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>đ</span>
              </div>
            ))}
            <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1d4ed8', borderRadius: 9, padding: '8px 12px', fontSize: '0.76rem', marginBottom: 16 }}>
              ⓘ Hai nguồn ngân sách được quản lý riêng biệt, không dùng chung — phiếu nguồn nào trừ nguồn đó.
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button onClick={() => setBudgetEdit(null)} style={{ padding: '9px 20px', borderRadius: 9, border: '1.5px solid #e5e7eb', background: '#fff', color: '#64748b', fontWeight: 700, cursor: 'pointer' }}>Huỷ</button>
              <button onClick={saveBudget} style={{ padding: '9px 24px', borderRadius: 9, border: 'none', background: ACCENT, color: '#fff', fontWeight: 800, cursor: 'pointer' }}>Lưu</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function pill(active, color) {
  return { padding: '5px 12px', borderRadius: 20, fontSize: '0.76rem', fontWeight: 700, cursor: 'pointer', border: `1.5px solid ${active ? color : '#e5e7eb'}`, background: active ? color : '#fff', color: active ? '#fff' : '#64748b' };
}
function actBtn(color, bg) {
  return { padding: '4px 9px', borderRadius: 7, border: 'none', background: bg, color, fontWeight: 700, fontSize: '0.72rem', cursor: 'pointer' };
}
