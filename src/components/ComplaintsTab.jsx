// src/components/ComplaintsTab.jsx
//
// MODULE 3 — KHIẾU NẠI KHÁCH HÀNG.
// Theo feedback CS: khiếu nại thì "lên đơn trên web và lưu data ở đó luôn giống của booking".
// CS tạo hồ sơ tay → vòng đời theo brief (Mới tiếp nhận → Xác minh → Đang xử lý → Chờ gửi bù
// → Chờ phản hồi khách → Hoàn tất → Đóng hồ sơ) + đơn gửi bù + bằng chứng.
// Bảng: cs_cases (case_type='complaint'). Trả hàng tách sang Module 2 (ReturnsTab).

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import { SHOPS } from '../constants/shops';
import { PRODUCT_CATEGORIES } from '../constants/productCategories';
import AddressPicker from './AddressPicker';
import EvidenceUploader from './EvidenceUploader';

const ACCENT = '#ff6a2c';
const TABLE = 'cs_cases';
const OVERDUE_DAYS = 3;

// Vòng đời theo brief Module 3
const STATUS = {
  new:                { label: 'Mới tiếp nhận',     color: '#b45309', bg: '#fef3c7' },
  verifying:          { label: 'Chờ xác minh',      color: '#0891b2', bg: '#cffafe' },
  processing:         { label: 'Đang xử lý',        color: '#1d4ed8', bg: '#dbeafe' },
  awaiting_gift:      { label: 'Chờ gửi bù',        color: '#7c3aed', bg: '#ede9fe' },
  awaiting_customer:  { label: 'Chờ phản hồi khách', color: '#db2777', bg: '#fce7f3' },
  done:               { label: 'Đã hoàn tất',       color: '#15803d', bg: '#dcfce7' },
  closed:             { label: 'Đã đóng hồ sơ',     color: '#475569', bg: '#f1f5f9' },
};
const FLOW = ['new', 'verifying', 'processing', 'awaiting_gift', 'awaiting_customer', 'done', 'closed'];
// Phân loại nguyên nhân theo brief + 5 lý do CS bổ sung 27/7
const REASONS = ['Thiếu hàng', 'Hư hỏng', 'Sai sản phẩm', 'Chất lượng sản phẩm', 'Vận chuyển',
  'Dịch vụ khách hàng', 'Không nhận được hàng',
  'Lỗi hệ thống không hiện quà', 'Lỗi vòi', 'Hết hàng', 'Hiểu nhầm chương trình', 'ĐVVC', 'Khác'];

const fmtDate = (s) => { if (!s) return ''; const d = new Date(s); return isNaN(d) ? '' : d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }); };
const daysSince = (s) => (s ? Math.floor((Date.now() - new Date(s).getTime()) / 86400000) : 0);
const fmtN = (n) => new Intl.NumberFormat('vi-VN').format(Number(n) || 0);

const inputStyle = { padding: '8px 11px', borderRadius: 9, border: '1px solid #e5e7eb', background: '#fff', fontSize: '0.85rem', color: '#1f2937', width: '100%', boxSizing: 'border-box', fontFamily: 'inherit' };
const labelStyle = { fontSize: '0.72rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: 4, display: 'block' };
const th = { padding: '9px 10px', fontSize: '0.68rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.3px', textAlign: 'left', whiteSpace: 'nowrap', background: '#f8fafc', borderBottom: '2px solid #e5e7eb' };
const td = { padding: '8px 10px', fontSize: '0.82rem', color: '#0f172a', borderTop: '1px solid #f1f5f9', verticalAlign: 'top' };
const card = { background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', padding: '14px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' };
const miniBtn = (color) => ({ padding: '4px 9px', borderRadius: 7, border: 'none', background: color + '18', color, fontWeight: 700, fontSize: '0.72rem', cursor: 'pointer' });

const EMPTY = {
  case_type: 'complaint', platform: 'shopee', order_sn: '', shop_name: '', buyer_name: '', buyer_phone: '', buyer_address: '',
  product_summary: '', reason_category: '', reason: '', status: 'new', assigned_to: '',
  evidence_links: '', compensation_items: '', compensation_tracking: '', note: '', source: 'manual',
};
const ymdOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const daysAgoYmd = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return ymdOf(d); };
const isImg = (u) => /\.(jpe?g|png|gif|webp|bmp|heic)(\?|$)/i.test(u);
const isVid = (u) => /\.(mp4|mov|webm|avi|mkv)(\?|$)/i.test(u) || /(youtube|youtu\.be|tiktok\.com|drive\.google\.com\/file)/i.test(u);

export default function ComplaintsTab({ currentUser }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [statusF, setStatusF] = useState('open');
  const [platF, setPlatF] = useState('all');
  const [reasonF, setReasonF] = useState('all');
  const [shopF, setShopF] = useState('all');
  const [fromF, setFromF] = useState(daysAgoYmd(90));
  const [toF, setToF] = useState(ymdOf(new Date()));
  const [search, setSearch] = useState('');
  const [view, setView] = useState('list');    // list | library
  const [lightbox, setLightbox] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from(TABLE).select('*')
      .eq('case_type', 'complaint').order('created_at', { ascending: false }).limit(2000);
    if (error) alert('Lỗi tải: ' + error.message);
    setRows(data || []); setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    const r = editing;
    if (!r.order_sn?.trim() && !r.buyer_name?.trim()) { alert('Cần ít nhất Mã đơn hoặc Tên khách'); return; }
    const payload = {
      case_type: 'complaint', platform: r.platform || null, order_sn: r.order_sn?.trim() || null,
      shop_name: r.shop_name || null, buyer_name: r.buyer_name || null, buyer_phone: r.buyer_phone || null,
      buyer_address: r.buyer_address || null,
      product_summary: r.product_summary || null, reason: r.reason || null, reason_category: r.reason_category || null,
      status: r.status || 'new', assigned_to: r.assigned_to || null, evidence_links: r.evidence_links || null,
      compensation_items: r.compensation_items || null, compensation_tracking: r.compensation_tracking || null,
      compensation_at: r.compensation_items ? (r.compensation_at || new Date().toISOString()) : null,
      note: r.note || null, updated_at: new Date().toISOString(),
      done_at: (r.status === 'done' || r.status === 'closed') ? new Date().toISOString() : null,
    };
    let error;
    if (r.id) ({ error } = await supabase.from(TABLE).update(payload).eq('id', r.id));
    else ({ error } = await supabase.from(TABLE).insert({ ...payload, source: 'manual', order_key: null }));
    if (error) { alert('Lưu không được: ' + error.message); return; }
    setEditing(null); load();
  };

  const quickStatus = async (row, status) => {
    setRows(prev => prev.map(x => (x.id === row.id ? { ...x, status } : x)));
    await supabase.from(TABLE).update({
      status, updated_at: new Date().toISOString(),
      done_at: (status === 'done' || status === 'closed') ? new Date().toISOString() : null,
    }).eq('id', row.id);
  };
  const del = async (row) => { if (!confirm('Xoá hồ sơ khiếu nại này?')) return; await supabase.from(TABLE).delete().eq('id', row.id); load(); };

  const filtered = useMemo(() => rows.filter(r => {
    const d = (r.created_at || '').slice(0, 10);
    if (fromF && d && d < fromF) return false;
    if (toF && d && d > toF) return false;
    if (statusF === 'open' && (r.status === 'done' || r.status === 'closed')) return false;
    if (statusF !== 'all' && statusF !== 'open' && r.status !== statusF) return false;
    if (platF !== 'all' && r.platform !== platF) return false;
    if (shopF !== 'all' && r.shop_name !== shopF) return false;
    if (reasonF !== 'all' && r.reason_category !== reasonF) return false;
    if (search) {
      const q = search.toLowerCase();
      if (![r.order_sn, r.buyer_name, r.buyer_phone, r.product_summary, r.reason, r.note].some(v => v && String(v).toLowerCase().includes(q))) return false;
    }
    return true;
  }), [rows, statusF, platF, shopF, reasonF, search, fromF, toF]);

  // Thư viện ảnh/video từ bằng chứng khiếu nại
  const library = useMemo(() => {
    const out = [];
    filtered.forEach(r => (r.evidence_links || '').split('\n').map(s => s.trim()).filter(Boolean).forEach(u => out.push({ url: u, row: r })));
    return out;
  }, [filtered]);

  const kpi = useMemo(() => {
    const c = { new: 0, processing: 0, awaiting_gift: 0, done: 0, overdue: 0 };
    rows.forEach(r => {
      if (r.status === 'new') c.new++;
      if (['verifying', 'processing'].includes(r.status)) c.processing++;
      if (r.status === 'awaiting_gift') c.awaiting_gift++;
      if (r.status === 'done' || r.status === 'closed') c.done++;
      if (!['done', 'closed'].includes(r.status) && daysSince(r.created_at) >= OVERDUE_DAYS) c.overdue++;
    });
    return c;
  }, [rows]);

  // Thống kê nguyên nhân + top SP bị khiếu nại (brief M3 mục 7)
  const byReason = useMemo(() => {
    const m = {};
    rows.forEach(r => { const k = r.reason_category || 'Chưa phân loại'; m[k] = (m[k] || 0) + 1; });
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [rows]);
  const topProducts = useMemo(() => {
    const m = {};
    rows.forEach(r => { const k = (r.product_summary || '').trim(); if (k) m[k] = (m[k] || 0) + 1; });
    return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [rows]);

  const openNew = () => setEditing({ ...EMPTY, assigned_to: currentUser?.name || currentUser?.username || '' });

  return (
    <div style={{ fontFamily: "'Outfit', sans-serif", maxWidth: 1400 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 900, color: '#0f172a' }}>⚠️ Module 3: Khiếu nại khách hàng</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#94a3b8' }}>CS lên đơn khiếu nại trên web — lưu hồ sơ, bằng chứng, đơn gửi bù &amp; vòng đời xử lý.</p>
        </div>
        <button onClick={openNew} style={{ padding: '9px 18px', borderRadius: 9, border: 'none', background: ACCENT, color: '#fff', fontWeight: 800, fontSize: 13, cursor: 'pointer', boxShadow: '0 4px 12px rgba(255,106,44,0.25)' }}>+ Lên đơn khiếu nại</button>
      </div>

      {/* KPI theo brief */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 18 }}>
        {[
          { k: 'new', label: 'Khiếu nại mới', v: kpi.new, color: STATUS.new.color },
          { k: 'processing', label: 'Đang xử lý', v: kpi.processing, color: STATUS.processing.color },
          { k: 'awaiting_gift', label: 'Chờ gửi bù', v: kpi.awaiting_gift, color: STATUS.awaiting_gift.color },
          { k: 'done', label: 'Đã hoàn tất', v: kpi.done, color: STATUS.done.color },
          { k: 'overdue', label: `Quá ${OVERDUE_DAYS} ngày`, v: kpi.overdue, color: '#dc2626' },
        ].map(c => (
          <div key={c.k} onClick={() => setStatusF(c.k === 'overdue' ? 'open' : c.k === 'processing' ? 'processing' : c.k)}
            style={{ ...card, borderTop: `3px solid ${c.color}`, cursor: 'pointer' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 900, color: c.color }}>{c.v}</div>
            <div style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.3px' }}>{c.label}</div>
          </div>
        ))}
      </div>

      {/* PHÂN TÍCH */}
      {rows.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12, marginBottom: 16 }}>
          <div style={card}>
            <div style={{ fontWeight: 800, color: '#0f172a', marginBottom: 10, fontSize: '0.9rem' }}>📊 Theo nguyên nhân</div>
            {byReason.map(([k, v]) => (
              <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: '0.8rem', color: '#475569', width: 160, flexShrink: 0 }}>{k}</span>
                <div style={{ flex: 1, height: 8, background: '#f1f5f9', borderRadius: 5, overflow: 'hidden' }}>
                  <div style={{ width: `${Math.round(100 * v / rows.length)}%`, height: '100%', background: ACCENT }} />
                </div>
                <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#0f172a', width: 56, textAlign: 'right' }}>{v} ({Math.round(100 * v / rows.length)}%)</span>
              </div>
            ))}
          </div>
          <div style={card}>
            <div style={{ fontWeight: 800, color: '#0f172a', marginBottom: 10, fontSize: '0.9rem' }}>📦 Top SP bị khiếu nại</div>
            {topProducts.length === 0 ? <div style={{ color: '#94a3b8', fontSize: '0.82rem' }}>Chưa có dữ liệu.</div>
              : topProducts.map(([k, v], i) => (
                <div key={k} style={{ display: 'flex', gap: 8, fontSize: '0.8rem', padding: '4px 0', borderTop: i ? '1px solid #f8fafc' : 'none' }}>
                  <span style={{ color: i < 3 ? ACCENT : '#94a3b8', fontWeight: 800, width: 18 }}>{i + 1}</span>
                  <span style={{ flex: 1, color: '#475569' }}>{k.length > 70 ? k.slice(0, 70) + '…' : k}</span>
                  <span style={{ fontWeight: 800, color: '#dc2626' }}>{v}</span>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* FILTER — có thời gian + gian hàng */}
      <div style={{ ...card, marginBottom: 14, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <input type="date" value={fromF} onChange={e => setFromF(e.target.value)} style={{ ...inputStyle, width: 'auto' }} />
        <span style={{ color: '#94a3b8' }}>→</span>
        <input type="date" value={toF} onChange={e => setToF(e.target.value)} style={{ ...inputStyle, width: 'auto' }} />
        {[[7, '7N'], [30, '30N'], [90, '90N'], [365, '1 năm']].map(([n, l]) => (
          <button key={n} onClick={() => { setFromF(daysAgoYmd(n)); setToF(ymdOf(new Date())); }} style={{ padding: '6px 11px', borderRadius: 8, border: '1.5px solid #e5e7eb', background: '#fff', color: '#64748b', fontWeight: 700, fontSize: '0.76rem', cursor: 'pointer' }}>{l}</button>
        ))}
        <input type="text" placeholder="🔍 Tìm mã đơn, khách, SĐT, SP..." value={search} onChange={e => setSearch(e.target.value)} style={{ ...inputStyle, width: 230 }} />
        <select value={statusF} onChange={e => setStatusF(e.target.value)} style={{ ...inputStyle, width: 'auto', cursor: 'pointer' }}>
          <option value="open">Chưa hoàn tất</option><option value="all">Tất cả trạng thái</option>
          {FLOW.map(s => <option key={s} value={s}>{STATUS[s].label}</option>)}
        </select>
        <select value={reasonF} onChange={e => setReasonF(e.target.value)} style={{ ...inputStyle, width: 'auto', cursor: 'pointer' }}>
          <option value="all">Nguyên nhân: Tất cả</option>{REASONS.map(x => <option key={x} value={x}>{x}</option>)}
        </select>
        <select value={platF} onChange={e => { setPlatF(e.target.value); setShopF('all'); }} style={{ ...inputStyle, width: 'auto', cursor: 'pointer' }}>
          <option value="all">Sàn: Tất cả</option><option value="shopee">Shopee</option><option value="tiktok">TikTok</option>
        </select>
        <select value={shopF} onChange={e => setShopF(e.target.value)} style={{ ...inputStyle, width: 'auto', cursor: 'pointer' }}>
          <option value="all">Gian: Tất cả</option>
          {SHOPS.filter(s => platF === 'all' || s.san === platF).map(s => <option key={s.san + s.name} value={s.name}>{s.name}</option>)}
        </select>
        <span style={{ marginLeft: 'auto', fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>{fmtN(filtered.length)} hồ sơ</span>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        {[['list', '📋 Danh sách'], ['library', `🖼️ Thư viện ảnh/video (${library.length})`]].map(([v, l]) => (
          <button key={v} onClick={() => setView(v)} style={{ padding: '8px 16px', borderRadius: 9, border: `1.5px solid ${view === v ? ACCENT : '#e5e7eb'}`, background: view === v ? '#fff7ed' : '#fff', color: view === v ? '#e85518' : '#64748b', fontWeight: 800, fontSize: '0.83rem', cursor: 'pointer' }}>{l}</button>
        ))}
      </div>

      {/* THƯ VIỆN ẢNH/VIDEO */}
      {view === 'library' && (
        <div style={card}>
          {library.length === 0 ? <div style={{ color: '#94a3b8', fontSize: '0.85rem', padding: 20, textAlign: 'center' }}>Chưa có ảnh/video bằng chứng nào trong kỳ.</div> : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 12 }}>
              {library.map((m, i) => (
                <div key={i} style={{ border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden', background: '#f8fafc' }}>
                  <div onClick={() => setLightbox(m)} style={{ height: 130, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', background: '#0f172a08' }}>
                    {isImg(m.url)
                      ? <img src={m.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { e.target.style.display = 'none'; e.target.parentNode.innerHTML = '<span style="font-size:2rem">🖼️</span>'; }} />
                      : <span style={{ fontSize: '2rem' }}>{isVid(m.url) ? '🎬' : '📎'}</span>}
                  </div>
                  <div style={{ padding: '7px 9px', fontSize: '0.72rem' }}>
                    <div style={{ fontWeight: 700, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={m.row.product_summary}>{m.row.buyer_name || m.row.order_sn || '—'}</div>
                    <div style={{ color: '#94a3b8' }}>{fmtDate(m.row.created_at)} · {m.row.reason_category || '—'}</div>
                    <a href={m.url} target="_blank" rel="noreferrer" style={{ color: '#0891b2', fontWeight: 700 }}>Mở gốc ↗</a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {lightbox && (
        <div onClick={() => setLightbox(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200, padding: 24 }}>
          <div onClick={e => e.stopPropagation()} style={{ textAlign: 'center' }}>
            {isImg(lightbox.url)
              ? <img src={lightbox.url} alt="" style={{ maxWidth: '86vw', maxHeight: '76vh', borderRadius: 12, background: '#fff' }} />
              : <div style={{ background: '#fff', borderRadius: 12, padding: 40 }}><div style={{ fontSize: '3rem', marginBottom: 12 }}>{isVid(lightbox.url) ? '🎬' : '📎'}</div><a href={lightbox.url} target="_blank" rel="noreferrer" style={{ color: '#0891b2', fontWeight: 800 }}>Mở link ↗</a></div>}
            <div style={{ color: '#fff', marginTop: 12, fontSize: '0.85rem' }}><b>{lightbox.row?.buyer_name}</b> · {lightbox.row?.reason_category} · {fmtDate(lightbox.row?.created_at)}</div>
          </div>
        </div>
      )}

      {/* TABLE */}
      {view === 'list' && (
      <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              <th style={th}>Sàn</th><th style={th}>Mã đơn</th><th style={th}>Khách</th>
              <th style={{ ...th, minWidth: 190 }}>Sản phẩm</th><th style={th}>Nguyên nhân</th>
              <th style={th}>Gửi bù</th><th style={{ ...th, textAlign: 'center' }}>Ngày</th>
              <th style={{ ...th, textAlign: 'center' }}>Trạng thái</th><th style={{ ...th, textAlign: 'center', width: 210 }}>Hành động</th>
            </tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={9} style={{ ...td, textAlign: 'center', padding: 40, color: '#94a3b8' }}>⏳ Đang tải...</td></tr>
                : filtered.length === 0 ? <tr><td colSpan={9} style={{ ...td, textAlign: 'center', padding: 40, color: '#94a3b8' }}>Chưa có khiếu nại nào — bấm “+ Lên đơn khiếu nại”.</td></tr>
                  : filtered.map(r => {
                    const st = STATUS[r.status] || STATUS.new;
                    const over = !['done', 'closed'].includes(r.status) && daysSince(r.created_at) >= OVERDUE_DAYS;
                    const idx = FLOW.indexOf(r.status);
                    const next = idx >= 0 && idx < FLOW.length - 1 ? FLOW[idx + 1] : null;
                    return (
                      <tr key={r.id} style={{ background: over ? '#fff7f7' : 'transparent' }}>
                        <td style={td}>{r.platform === 'shopee' ? '🟠' : r.platform === 'tiktok' ? '⬛' : '—'}</td>
                        <td style={{ ...td, fontFamily: 'monospace', fontSize: '0.74rem' }}>{r.order_sn || '—'}</td>
                        <td style={{ ...td, fontWeight: 600 }}>{r.buyer_name || '—'}{r.buyer_phone && <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>{r.buyer_phone}</div>}</td>
                        <td style={{ ...td, whiteSpace: 'normal', maxWidth: 280 }}>{r.product_summary || '—'}</td>
                        <td style={td}>{r.reason_category || <span style={{ color: '#cbd5e1' }}>chưa phân loại</span>}</td>
                        <td style={{ ...td, fontSize: '0.74rem' }}>{r.compensation_items ? <span style={{ color: '#7c3aed', fontWeight: 700 }}>🎁 {r.compensation_items}</span> : <span style={{ color: '#cbd5e1' }}>—</span>}</td>
                        <td style={{ ...td, textAlign: 'center', fontSize: '0.76rem', color: over ? '#dc2626' : '#64748b' }}>{fmtDate(r.created_at)}{over && <div style={{ fontSize: '0.66rem', fontWeight: 700 }}>{daysSince(r.created_at)}n</div>}</td>
                        <td style={{ ...td, textAlign: 'center' }}><span style={{ padding: '3px 9px', borderRadius: 20, fontSize: '0.7rem', fontWeight: 700, background: st.bg, color: st.color, whiteSpace: 'nowrap' }}>{st.label}</span></td>
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
      )}

      {/* FORM — CS 27/7: TRƯỚC bấm trúng nền là form đóng cái rụp, mất sạch đồ đang nhập ("di chuột là
          out, điền lại từ đầu"). Giờ bấm nền KHÔNG đóng, muốn thoát phải bấm nút Đóng và xác nhận. */}
      {editing && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 16px', zIndex: 1000, overflowY: 'auto' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, padding: 24, width: '100%', maxWidth: 680 }}>
            <h2 style={{ margin: '0 0 16px', fontSize: '1.1rem', fontWeight: 900 }}>{editing.id ? '⚠️ Hồ sơ khiếu nại' : '➕ Lên đơn khiếu nại'}</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
              <div><label style={labelStyle}>Sàn</label><select value={editing.platform || ''} onChange={e => setEditing({ ...editing, platform: e.target.value })} style={inputStyle}><option value="">—</option><option value="shopee">Shopee</option><option value="tiktok">TikTok</option></select></div>
              <div><label style={labelStyle}>Gian hàng</label>
                <select value={editing.shop_name || ''} onChange={e => { const sh = SHOPS.find(s => s.name === e.target.value); setEditing({ ...editing, shop_name: e.target.value, platform: sh ? sh.san : editing.platform }); }} style={inputStyle}>
                  <option value="">— chọn gian —</option>
                  <optgroup label="Shopee">{SHOPS.filter(s => s.san === 'shopee').map(s => <option key={'c-sp' + s.name} value={s.name}>Shopee · {s.name}</option>)}</optgroup>
                  <optgroup label="TikTok">{SHOPS.filter(s => s.san === 'tiktok').map(s => <option key={'c-tt' + s.name} value={s.name}>TikTok · {s.name}</option>)}</optgroup>
                </select>
              </div>
              <div><label style={labelStyle}>Mã đơn hàng</label><input value={editing.order_sn || ''} onChange={e => setEditing({ ...editing, order_sn: e.target.value })} style={inputStyle} /></div>
              <div><label style={labelStyle}>Tên khách</label><input value={editing.buyer_name || ''} onChange={e => setEditing({ ...editing, buyer_name: e.target.value })} style={inputStyle} /></div>
              <div><label style={labelStyle}>SĐT khách</label><input value={editing.buyer_phone || ''} onChange={e => setEditing({ ...editing, buyer_phone: e.target.value })} style={inputStyle} /></div>
              <div><label style={labelStyle}>Người xử lý (CS)</label><input value={editing.assigned_to || ''} onChange={e => setEditing({ ...editing, assigned_to: e.target.value })} style={inputStyle} /></div>
              {/* CS 27/7: chọn dropdown thay vì gõ tay, dùng CHUNG list phân loại với Đánh giá sàn
                  → thống kê khiếu nại theo mùi/loại SP khớp được với bên đánh giá. */}
              <div style={{ gridColumn: 'span 2' }}><label style={labelStyle}>Sản phẩm liên quan</label>
                <select value={editing.product_summary || ''} onChange={e => setEditing({ ...editing, product_summary: e.target.value })} style={inputStyle}>
                  <option value="">— chọn sản phẩm —</option>
                  {PRODUCT_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  {/* hồ sơ cũ gõ tay tên khác list → vẫn giữ nguyên, không bị mất khi mở lại */}
                  {editing.product_summary && !PRODUCT_CATEGORIES.includes(editing.product_summary) &&
                    <option value={editing.product_summary}>{editing.product_summary} (nhập cũ)</option>}
                </select>
              </div>
              <div><label style={labelStyle}>Phân loại nguyên nhân</label><select value={editing.reason_category || ''} onChange={e => setEditing({ ...editing, reason_category: e.target.value })} style={inputStyle}><option value="">— chọn —</option>{REASONS.map(x => <option key={x} value={x}>{x}</option>)}</select></div>
              <div><label style={labelStyle}>Trạng thái</label><select value={editing.status} onChange={e => setEditing({ ...editing, status: e.target.value })} style={inputStyle}>{FLOW.map(s => <option key={s} value={s}>{STATUS[s].label}</option>)}</select></div>
              <div style={{ gridColumn: 'span 2' }}><label style={labelStyle}>Nội dung khiếu nại</label><textarea value={editing.reason || ''} onChange={e => setEditing({ ...editing, reason: e.target.value })} style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }} placeholder="Khách phản ánh cụ thể điều gì..." /></div>
              <div style={{ gridColumn: 'span 2', borderTop: '1px dashed #e5e7eb', paddingTop: 12 }}>
                <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#7c3aed', marginBottom: 8 }}>🎁 Đơn gửi bù (nếu có)</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div><label style={labelStyle}>Sản phẩm + số lượng gửi bù</label><input value={editing.compensation_items || ''} onChange={e => setEditing({ ...editing, compensation_items: e.target.value })} style={inputStyle} placeholder="VD: Gel nha đam 250ml x1" /></div>
                  <div><label style={labelStyle}>Mã vận đơn gửi bù</label><input value={editing.compensation_tracking || ''} onChange={e => setEditing({ ...editing, compensation_tracking: e.target.value })} style={inputStyle} /></div>
                  {/* CS 27/7: địa chỉ chọn dropdown giống Booking/Order (34 tỉnh + phường mới 2025) */}
                  <div style={{ gridColumn: 'span 2' }}>
                    <label style={labelStyle}>📍 Địa chỉ nhận hàng gửi bù</label>
                    <AddressPicker value={editing.buyer_address || ''} label={null} compact
                      onChange={v => setEditing(p => ({ ...p, buyer_address: v }))} />
                  </div>
                </div>
              </div>
              <div style={{ gridColumn: 'span 2' }}><label style={labelStyle}>Ảnh / video bằng chứng</label>
                <EvidenceUploader folder="khieu-nai" value={editing.evidence_links || ''}
                  onChange={v => setEditing(p => ({ ...p, evidence_links: v }))} />
              </div>
              <div style={{ gridColumn: 'span 2' }}><label style={labelStyle}>Ghi chú / lịch sử xử lý</label><textarea value={editing.note || ''} onChange={e => setEditing({ ...editing, note: e.target.value })} style={{ ...inputStyle, minHeight: 52, resize: 'vertical' }} /></div>
              {editing.id && <div style={{ gridColumn: 'span 2', fontSize: '0.74rem', color: '#94a3b8' }}>Tạo: {fmtDate(editing.created_at)} · Cập nhật: {fmtDate(editing.updated_at)}</div>}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: 20 }}>
              {editing.id ? <button onClick={() => { del(editing); setEditing(null); }} style={{ padding: '9px 16px', borderRadius: 9, border: '1.5px solid #fecaca', background: '#fff', color: '#dc2626', fontWeight: 700, cursor: 'pointer' }}>Xoá</button> : <span />}
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => { if (window.confirm('Đóng mà chưa Lưu thì mất phần đang nhập. Đóng luôn?')) setEditing(null); }} style={{ padding: '9px 20px', borderRadius: 9, border: '1.5px solid #e5e7eb', background: '#fff', color: '#64748b', fontWeight: 700, cursor: 'pointer' }}>Đóng</button>
                <button onClick={save} style={{ padding: '9px 24px', borderRadius: 9, border: 'none', background: ACCENT, color: '#fff', fontWeight: 800, cursor: 'pointer' }}>💾 Lưu</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
