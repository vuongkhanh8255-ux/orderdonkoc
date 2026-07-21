// src/components/CasesTab.jsx
//
// Module 2+3 (MVP) — Trả/Hoàn hàng & Khiếu nại (nhóm CSKH).
// 1 hệ hồ sơ vụ việc chung: tự bắt đơn bị trả (Shopee TO_RETURN + TikTok fully_return)
// tạo hồ sơ sẵn; CS cập nhật lý do + vòng đời + ghi chú + link bằng chứng.
// Dashboard đếm trạng thái + cảnh báo quá hạn. Bảng: cs_cases. RPC: cs_seed_return_cases.
// Kho đối soát / gửi bù / hồ sơ khách (CRM) = đợt sau.

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../supabaseClient';

const ACCENT = '#ff6a2c';
const CASE_TYPES = [{ v: 'return', l: '↩️ Trả/Hoàn hàng' }, { v: 'complaint', l: '⚠️ Khiếu nại' }];
const REASONS = ['Thiếu hàng', 'Hư hỏng', 'Sai sản phẩm', 'Không nhận được hàng', 'Đổi ý', 'Chất lượng SP', 'Giao chậm', 'Khác'];
const STATUS = {
  new:         { label: 'Mới',         color: '#b45309', bg: '#fef3c7' },
  processing:  { label: 'Đang xử lý',  color: '#1d4ed8', bg: '#dbeafe' },
  reconciling: { label: 'Chờ đối soát', color: '#7c3aed', bg: '#ede9fe' },
  complaint:   { label: 'Khiếu nại',   color: '#dc2626', bg: '#fee2e2' },
  done:        { label: 'Hoàn tất',    color: '#15803d', bg: '#dcfce7' },
};
const FLOW = ['new', 'processing', 'reconciling', 'done'];
const OVERDUE_DAYS = 3;

const fmtDate = (s) => { if (!s) return ''; const d = new Date(s); return isNaN(d) ? '' : d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }); };
const daysSince = (s) => { if (!s) return 0; return Math.floor((Date.now() - new Date(s).getTime()) / 86400000); };
const inputStyle = { padding: '8px 11px', borderRadius: 9, border: '1px solid #e5e7eb', background: '#fff', fontSize: '0.85rem', color: '#1f2937', width: '100%', boxSizing: 'border-box', fontFamily: 'inherit' };
const labelStyle = { fontSize: '0.72rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: 4, display: 'block' };
const th = { padding: '9px 10px', fontSize: '0.68rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.3px', textAlign: 'left', whiteSpace: 'nowrap', background: '#f8fafc', borderBottom: '2px solid #e5e7eb' };
const td = { padding: '8px 10px', fontSize: '0.82rem', color: '#0f172a', borderTop: '1px solid #f1f5f9', verticalAlign: 'top' };
const card = { background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', padding: '14px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' };
const EMPTY = { case_type: 'return', platform: 'shopee', order_sn: '', buyer_name: '', product_summary: '', reason: '', reason_category: '', status: 'new', assigned_to: '', evidence_links: '', note: '', source: 'manual' };

export default function CasesTab({ currentUser }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [seedMsg, setSeedMsg] = useState('');
  const [editing, setEditing] = useState(null);
  const [typeF, setTypeF] = useState('all');
  const [statusF, setStatusF] = useState('open');   // open = chưa hoàn tất
  const [platF, setPlatF] = useState('all');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from('cs_cases').select('*').order('created_at', { ascending: false }).limit(1000);
    if (error) alert('Lỗi tải: ' + error.message);
    setRows(data || []); setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const runSeed = async () => {
    setSeeding(true); setSeedMsg('');
    const { data, error } = await supabase.rpc('cs_seed_return_cases', { p_days: 60 });
    if (error) setSeedMsg('⚠️ ' + error.message);
    else { setSeedMsg(`✅ Đã thêm ${data} hồ sơ đơn trả mới`); await load(); }
    setSeeding(false);
  };

  const save = async () => {
    const r = editing;
    if (!r.order_sn?.trim() && !r.buyer_name?.trim()) { alert('Cần ít nhất Mã đơn hoặc Tên khách'); return; }
    const payload = {
      case_type: r.case_type, platform: r.platform || null, order_sn: r.order_sn || null,
      shop_name: r.shop_name || null, buyer_name: r.buyer_name || null, product_summary: r.product_summary || null,
      reason: r.reason || null, reason_category: r.reason_category || null, status: r.status || 'new',
      assigned_to: r.assigned_to || null, evidence_links: r.evidence_links || null, note: r.note || null,
      updated_at: new Date().toISOString(), done_at: r.status === 'done' ? new Date().toISOString() : null,
    };
    let error;
    if (r.id) ({ error } = await supabase.from('cs_cases').update(payload).eq('id', r.id));
    else ({ error } = await supabase.from('cs_cases').insert({ ...payload, source: 'manual', order_key: r.order_sn ? `${r.platform || 'manual'}|${r.order_sn}` : null }));
    if (error) { alert('Lưu không được: ' + error.message); return; }
    setEditing(null); load();
  };

  const quickStatus = async (row, status) => {
    setRows(prev => prev.map(x => x.id === row.id ? { ...x, status } : x));
    await supabase.from('cs_cases').update({ status, updated_at: new Date().toISOString(), done_at: status === 'done' ? new Date().toISOString() : null }).eq('id', row.id);
  };
  const del = async (row) => { if (!confirm('Xoá hồ sơ này?')) return; await supabase.from('cs_cases').delete().eq('id', row.id); load(); };

  const filtered = useMemo(() => rows.filter(r => {
    if (typeF !== 'all' && r.case_type !== typeF) return false;
    if (statusF === 'open' && r.status === 'done') return false;
    if (statusF !== 'all' && statusF !== 'open' && r.status !== statusF) return false;
    if (platF !== 'all' && r.platform !== platF) return false;
    if (search) { const q = search.toLowerCase(); if (![r.order_sn, r.buyer_name, r.product_summary, r.reason, r.note].some(v => v && String(v).toLowerCase().includes(q))) return false; }
    return true;
  }), [rows, typeF, statusF, platF, search]);

  const kpi = useMemo(() => {
    const c = { new: 0, processing: 0, reconciling: 0, complaint: 0, done: 0, overdue: 0 };
    rows.forEach(r => { c[r.status] = (c[r.status] || 0) + 1; if (r.status !== 'done' && daysSince(r.created_at) >= OVERDUE_DAYS) c.overdue++; });
    return c;
  }, [rows]);

  return (
    <div style={{ fontFamily: "'Outfit', sans-serif", maxWidth: 1400 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 900, color: '#0f172a' }}>↩️ Trả hàng &amp; Khiếu nại</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#94a3b8' }}>Hồ sơ vụ việc — tự bắt đơn bị trả từ sàn · CS cập nhật vòng đời + bằng chứng</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {seedMsg && <span style={{ fontSize: '0.8rem', fontWeight: 700, color: seedMsg.startsWith('⚠️') ? '#dc2626' : '#16a34a' }}>{seedMsg}</span>}
          <button onClick={runSeed} disabled={seeding} style={{ padding: '9px 16px', borderRadius: 9, border: '1.5px solid #bfdbfe', background: '#eff6ff', color: '#2563eb', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>{seeding ? '⏳ Đang bắt...' : '🔄 Bắt đơn bị trả'}</button>
          <button onClick={() => setEditing({ ...EMPTY })} style={{ padding: '9px 18px', borderRadius: 9, border: 'none', background: ACCENT, color: '#fff', fontWeight: 800, fontSize: 13, cursor: 'pointer' }}>+ Thêm hồ sơ</button>
        </div>
      </div>

      {/* KPI */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12, marginBottom: 18 }}>
        {[
          { k: 'new', label: 'Mới', v: kpi.new, color: STATUS.new.color },
          { k: 'processing', label: 'Đang xử lý', v: kpi.processing, color: STATUS.processing.color },
          { k: 'reconciling', label: 'Chờ đối soát', v: kpi.reconciling, color: STATUS.reconciling.color },
          { k: 'complaint', label: 'Khiếu nại', v: kpi.complaint, color: STATUS.complaint.color },
          { k: 'done', label: 'Hoàn tất', v: kpi.done, color: STATUS.done.color },
          { k: 'overdue', label: `Quá ${OVERDUE_DAYS} ngày`, v: kpi.overdue, color: '#dc2626' },
        ].map(c => (
          <div key={c.k} onClick={() => { if (c.k === 'overdue') { setStatusF('open'); } else { setStatusF(c.k); } }}
            style={{ ...card, borderTop: `3px solid ${c.color}`, cursor: 'pointer' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 900, color: c.color }}>{c.v}</div>
            <div style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.3px' }}>{c.label}</div>
          </div>
        ))}
      </div>

      {/* FILTER */}
      <div style={{ ...card, marginBottom: 14, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <input type="text" placeholder="🔍 Tìm mã đơn, khách, SP, lý do..." value={search} onChange={e => setSearch(e.target.value)} style={{ ...inputStyle, width: 260 }} />
        <select value={typeF} onChange={e => setTypeF(e.target.value)} style={{ ...inputStyle, width: 'auto', cursor: 'pointer' }}>
          <option value="all">Loại: Tất cả</option>{CASE_TYPES.map(t => <option key={t.v} value={t.v}>{t.l}</option>)}
        </select>
        <select value={statusF} onChange={e => setStatusF(e.target.value)} style={{ ...inputStyle, width: 'auto', cursor: 'pointer' }}>
          <option value="open">Chưa hoàn tất</option><option value="all">Tất cả trạng thái</option>
          {Object.keys(STATUS).map(s => <option key={s} value={s}>{STATUS[s].label}</option>)}
        </select>
        <select value={platF} onChange={e => setPlatF(e.target.value)} style={{ ...inputStyle, width: 'auto', cursor: 'pointer' }}>
          <option value="all">Sàn: Tất cả</option><option value="shopee">Shopee</option><option value="tiktok">TikTok</option>
        </select>
        <span style={{ marginLeft: 'auto', fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>{filtered.length} hồ sơ</span>
      </div>

      {/* TABLE */}
      <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              <th style={th}>Loại</th><th style={th}>Sàn</th><th style={th}>Mã đơn</th><th style={th}>Khách</th>
              <th style={{ ...th, minWidth: 200 }}>Sản phẩm</th><th style={th}>Lý do</th><th style={{ ...th, textAlign: 'center' }}>Ngày</th>
              <th style={{ ...th, textAlign: 'center' }}>Trạng thái</th><th style={{ ...th, textAlign: 'center', width: 200 }}>Hành động</th>
            </tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={9} style={{ ...td, textAlign: 'center', padding: 40, color: '#94a3b8' }}>⏳ Đang tải...</td></tr>
                : filtered.length === 0 ? <tr><td colSpan={9} style={{ ...td, textAlign: 'center', padding: 40, color: '#94a3b8' }}>Không có hồ sơ — bấm "🔄 Bắt đơn bị trả" hoặc "+ Thêm hồ sơ"</td></tr>
                : filtered.map(r => {
                  const st = STATUS[r.status] || STATUS.new;
                  const over = r.status !== 'done' && daysSince(r.created_at) >= OVERDUE_DAYS;
                  const nextIdx = FLOW.indexOf(r.status);
                  const next = nextIdx >= 0 && nextIdx < FLOW.length - 1 ? FLOW[nextIdx + 1] : null;
                  return (
                    <tr key={r.id} style={{ background: over ? '#fff7f7' : 'transparent' }}>
                      <td style={td}>{r.case_type === 'complaint' ? '⚠️ KN' : '↩️ Trả'}</td>
                      <td style={td}>{r.platform === 'shopee' ? '🟠' : r.platform === 'tiktok' ? '⬛' : '—'}</td>
                      <td style={{ ...td, fontFamily: 'monospace', fontSize: '0.74rem' }}>{r.order_sn || '—'}</td>
                      <td style={{ ...td, fontWeight: 600 }}>{r.buyer_name || '—'}</td>
                      <td style={{ ...td, whiteSpace: 'normal', maxWidth: 300 }}>{r.product_summary || '—'}</td>
                      <td style={td}>{r.reason_category || r.reason || <span style={{ color: '#cbd5e1' }}>chưa nhập</span>}</td>
                      <td style={{ ...td, textAlign: 'center', fontSize: '0.76rem', color: over ? '#dc2626' : '#64748b' }}>{fmtDate(r.created_at)}{over && <div style={{ fontSize: '0.66rem', fontWeight: 700 }}>{daysSince(r.created_at)}n</div>}</td>
                      <td style={{ ...td, textAlign: 'center' }}><span style={{ padding: '3px 9px', borderRadius: 20, fontSize: '0.7rem', fontWeight: 700, background: st.bg, color: st.color }}>{st.label}</span></td>
                      <td style={{ ...td, textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: 5, justifyContent: 'center', flexWrap: 'wrap' }}>
                          {next && <button onClick={() => quickStatus(r, next)} style={miniBtn('#2563eb')} title={`Chuyển sang: ${STATUS[next].label}`}>→ {STATUS[next].label}</button>}
                          <button onClick={() => setEditing(r)} style={miniBtn('#64748b')}>Chi tiết</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>

      {/* DETAIL / FORM MODAL */}
      {editing && (
        <div onClick={() => setEditing(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 16px', zIndex: 1000, overflowY: 'auto' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, padding: 24, width: '100%', maxWidth: 620 }}>
            <h2 style={{ margin: '0 0 16px', fontSize: '1.1rem', fontWeight: 900 }}>{editing.id ? '📋 Hồ sơ vụ việc' : '➕ Thêm hồ sơ'}{editing.source === 'auto' && <span style={{ fontSize: '0.7rem', color: '#2563eb', marginLeft: 8 }}>· tự bắt từ sàn</span>}</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
              <div><label style={labelStyle}>Loại hồ sơ</label><select value={editing.case_type} onChange={e => setEditing({ ...editing, case_type: e.target.value })} style={inputStyle}>{CASE_TYPES.map(t => <option key={t.v} value={t.v}>{t.l}</option>)}</select></div>
              <div><label style={labelStyle}>Sàn</label><select value={editing.platform || ''} onChange={e => setEditing({ ...editing, platform: e.target.value })} style={inputStyle}><option value="">—</option><option value="shopee">Shopee</option><option value="tiktok">TikTok</option></select></div>
              <div><label style={labelStyle}>Mã đơn</label><input value={editing.order_sn || ''} onChange={e => setEditing({ ...editing, order_sn: e.target.value })} style={inputStyle} /></div>
              <div><label style={labelStyle}>Khách hàng</label><input value={editing.buyer_name || ''} onChange={e => setEditing({ ...editing, buyer_name: e.target.value })} style={inputStyle} /></div>
              <div style={{ gridColumn: 'span 2' }}><label style={labelStyle}>Sản phẩm</label><input value={editing.product_summary || ''} onChange={e => setEditing({ ...editing, product_summary: e.target.value })} style={inputStyle} /></div>
              <div><label style={labelStyle}>Phân loại lý do</label><select value={editing.reason_category || ''} onChange={e => setEditing({ ...editing, reason_category: e.target.value })} style={inputStyle}><option value="">— chọn —</option>{REASONS.map(x => <option key={x} value={x}>{x}</option>)}</select></div>
              <div><label style={labelStyle}>Trạng thái</label><select value={editing.status} onChange={e => setEditing({ ...editing, status: e.target.value })} style={inputStyle}>{Object.keys(STATUS).map(s => <option key={s} value={s}>{STATUS[s].label}</option>)}</select></div>
              <div style={{ gridColumn: 'span 2' }}><label style={labelStyle}>Lý do chi tiết</label><input value={editing.reason || ''} onChange={e => setEditing({ ...editing, reason: e.target.value })} style={inputStyle} placeholder="Mô tả cụ thể" /></div>
              <div><label style={labelStyle}>Người xử lý</label><input value={editing.assigned_to || ''} onChange={e => setEditing({ ...editing, assigned_to: e.target.value })} style={inputStyle} /></div>
              <div><label style={labelStyle}>Ngày tạo</label><input value={fmtDate(editing.created_at) || 'mới'} disabled style={{ ...inputStyle, background: '#f8fafc', color: '#94a3b8' }} /></div>
              <div style={{ gridColumn: 'span 2' }}><label style={labelStyle}>Link bằng chứng (ảnh/video khui hàng — mỗi dòng 1 link)</label><textarea value={editing.evidence_links || ''} onChange={e => setEditing({ ...editing, evidence_links: e.target.value })} style={{ ...inputStyle, minHeight: 52, resize: 'vertical' }} placeholder="https://..." /></div>
              <div style={{ gridColumn: 'span 2' }}><label style={labelStyle}>Ghi chú</label><textarea value={editing.note || ''} onChange={e => setEditing({ ...editing, note: e.target.value })} style={{ ...inputStyle, minHeight: 52, resize: 'vertical' }} /></div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: 20 }}>
              {editing.id ? <button onClick={() => { del(editing); setEditing(null); }} style={{ padding: '9px 16px', borderRadius: 9, border: '1.5px solid #fecaca', background: '#fff', color: '#dc2626', fontWeight: 700, cursor: 'pointer' }}>Xoá</button> : <span />}
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => setEditing(null)} style={{ padding: '9px 20px', borderRadius: 9, border: '1.5px solid #e5e7eb', background: '#fff', color: '#64748b', fontWeight: 700, cursor: 'pointer' }}>Đóng</button>
                <button onClick={save} style={{ padding: '9px 24px', borderRadius: 9, border: 'none', background: ACCENT, color: '#fff', fontWeight: 800, cursor: 'pointer' }}>💾 Lưu</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function miniBtn(color) {
  return { padding: '4px 9px', borderRadius: 7, border: 'none', background: color + '18', color, fontWeight: 700, fontSize: '0.72rem', cursor: 'pointer' };
}
