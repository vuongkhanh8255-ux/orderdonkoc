// src/components/PromoCheckTab.jsx
//
// Module 5 — Đơn hàng sai chương trình khuyến mãi (nhóm CSKH).
// Admin khai LUẬT CTKM (từ khóa SP + số lượng tối thiểu + mô tả giảm + thời gian).
// Engine (RPC promo_check_orders) dò đơn Shopee ĐỦ điều kiện mà CHƯA giảm (price >= giá gốc)
// -> flag cho CS soạn tin nhắn + đánh dấu xử lý. Bảng: promo_rules, promo_order_status.
// TikTok: chưa dò được (bảng đơn thiếu tên SP + giá gốc) — bản sau.

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../supabaseClient';

const ACCENT = '#ff6a2c';
const PLATFORMS = [{ v: 'shopee', l: 'Shopee' }, { v: 'both', l: 'Shopee (+TikTok sau)' }];
const fmtMoney = (v) => (Number(v) || 0).toLocaleString('vi-VN');
const todayYmd = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const daysAgoYmd = (n) => { const d = new Date(Date.now() - n * 86400000); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const fmtDate = (s) => { if (!s) return ''; const p = String(s).slice(0, 10).split('-'); return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : s; };

const inputStyle = { padding: '8px 11px', borderRadius: 9, border: '1px solid #e5e7eb', background: '#fff', fontSize: '0.85rem', color: '#1f2937', width: '100%', boxSizing: 'border-box', fontFamily: 'inherit' };
const labelStyle = { fontSize: '0.72rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: 4, display: 'block' };
const th = { padding: '9px 10px', fontSize: '0.68rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.3px', textAlign: 'left', whiteSpace: 'nowrap', background: '#f8fafc', borderBottom: '2px solid #e5e7eb' };
const td = { padding: '8px 10px', fontSize: '0.82rem', color: '#0f172a', borderTop: '1px solid #f1f5f9', verticalAlign: 'top' };
const card = { background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', padding: '16px 18px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' };
const RULE_EMPTY = { name: '', platform: 'shopee', keyword: '', min_qty: 2, discount_desc: 'giảm 50%', date_from: '', date_to: '', active: true, note: '' };

const STATUS = {
  pending: { label: 'Chờ xử lý', color: '#b45309', bg: '#fef3c7' },
  handled: { label: 'Đã xử lý', color: '#15803d', bg: '#dcfce7' },
  ignored: { label: 'Bỏ qua', color: '#64748b', bg: '#f1f5f9' },
};

export default function PromoCheckTab({ currentUser }) {
  const isAdmin = currentUser?.role === 'admin';
  const [rules, setRules] = useState([]);
  const [editing, setEditing] = useState(null);
  const [from, setFrom] = useState(daysAgoYmd(30));
  const [to, setTo] = useState(todayYmd());
  const [results, setResults] = useState([]);
  const [scanning, setScanning] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [copiedKey, setCopiedKey] = useState('');

  const loadRules = useCallback(async () => {
    const { data } = await supabase.from('promo_rules').select('*').order('created_at', { ascending: false });
    setRules(data || []);
  }, []);
  useEffect(() => { loadRules(); }, [loadRules]);

  const saveRule = async () => {
    const r = editing;
    if (!r.name?.trim() || !r.keyword?.trim()) { alert('Thiếu Tên luật hoặc Từ khóa sản phẩm'); return; }
    const payload = {
      name: r.name.trim(), platform: r.platform || 'shopee', keyword: r.keyword.trim(),
      min_qty: Number(r.min_qty) || 2, discount_desc: r.discount_desc || null,
      date_from: r.date_from || null, date_to: r.date_to || null, active: r.active !== false, note: r.note || null,
    };
    const { error } = r.id
      ? await supabase.from('promo_rules').update(payload).eq('id', r.id)
      : await supabase.from('promo_rules').insert(payload);
    if (error) { alert('Lưu không được: ' + error.message); return; }
    setEditing(null); loadRules();
  };
  const delRule = async (r) => { if (!confirm(`Xoá luật "${r.name}"?`)) return; await supabase.from('promo_rules').delete().eq('id', r.id); loadRules(); };
  const toggleActive = async (r) => { await supabase.from('promo_rules').update({ active: !r.active }).eq('id', r.id); loadRules(); };

  const runScan = async () => {
    setScanning(true); setScanned(false);
    const { data, error } = await supabase.rpc('promo_check_orders', { p_from: from, p_to: to });
    if (error) alert('Lỗi dò: ' + error.message);
    setResults(data || []); setScanning(false); setScanned(true);
  };

  const setOrderStatus = async (row, status) => {
    setResults(prev => prev.map(x => x.order_key === row.order_key ? { ...x, status } : x));
    await supabase.from('promo_order_status').upsert(
      { order_key: row.order_key, status, handled_by: currentUser?.username || '', handled_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      { onConflict: 'order_key' });
  };

  const msgOf = (r) => `Chào bạn ạ 💛 Đơn ${r.order_sn} bạn mua ${r.qty} sản phẩm "${(r.item_name || '').replace(/\[[^\]]*\]\s*/, '')}" đủ điều kiện ${r.discount_desc || 'ưu đãi'} nhưng chưa được áp giảm. Shop sẽ hỗ trợ điều chỉnh giúp bạn nhé!`;
  const copyMsg = async (r) => { try { await navigator.clipboard.writeText(msgOf(r)); setCopiedKey(r.order_key); setTimeout(() => setCopiedKey(''), 1500); } catch { alert(msgOf(r)); } };

  const activeRulesCount = rules.filter(r => r.active).length;
  const pendingCount = useMemo(() => results.filter(r => (r.status || 'pending') === 'pending').length, [results]);

  return (
    <div style={{ fontFamily: "'Outfit', sans-serif", maxWidth: 1400 }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 900, color: '#0f172a' }}>🎯 Đơn sai khuyến mãi</h1>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: '#94a3b8' }}>Dò đơn <b>đủ điều kiện combo mà chưa được giảm</b> → nhắc khách. Admin khai luật, hệ thống tự dò.</p>
      </div>

      {/* ── LUẬT CTKM ── */}
      <div style={{ ...card, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
          <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: '#0f172a' }}>📋 Luật khuyến mãi ({rules.length}) · <span style={{ color: '#16a34a' }}>{activeRulesCount} đang bật</span></h3>
          {isAdmin && <button onClick={() => setEditing({ ...RULE_EMPTY })} style={{ padding: '8px 16px', borderRadius: 9, border: 'none', background: ACCENT, color: '#fff', fontWeight: 800, fontSize: 13, cursor: 'pointer' }}>+ Thêm luật</button>}
        </div>
        {rules.length === 0 ? (
          <div style={{ fontSize: '0.85rem', color: '#94a3b8', padding: '10px 0' }}>Chưa có luật nào. {isAdmin ? 'Bấm "+ Thêm luật" để khai (ví dụ: từ khóa "MUA 2 GIẢM 50%", số lượng tối thiểu 2).' : 'Chờ admin khai luật.'}</div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {rules.map(r => (
              <div key={r.id} style={{ border: `1.5px solid ${r.active ? '#fed7aa' : '#e5e7eb'}`, background: r.active ? '#fff7ed' : '#f8fafc', borderRadius: 10, padding: '10px 12px', minWidth: 230, opacity: r.active ? 1 : 0.6 }}>
                <div style={{ fontWeight: 800, fontSize: '0.85rem', color: '#0f172a' }}>{r.name}</div>
                <div style={{ fontSize: '0.74rem', color: '#64748b', marginTop: 3 }}>SP chứa "<b>{r.keyword}</b>" · mua ≥ <b>{r.min_qty}</b> · {r.discount_desc}</div>
                <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: 2 }}>{r.platform} · {r.date_from ? fmtDate(r.date_from) : '—'} → {r.date_to ? fmtDate(r.date_to) : 'nay'}</div>
                {isAdmin && (
                  <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                    <button onClick={() => toggleActive(r)} style={miniBtn(r.active ? '#64748b' : '#16a34a')}>{r.active ? 'Tắt' : 'Bật'}</button>
                    <button onClick={() => setEditing(r)} style={miniBtn('#2563eb')}>Sửa</button>
                    <button onClick={() => delRule(r)} style={miniBtn('#dc2626')}>Xoá</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── DÒ ĐƠN ── */}
      <div style={{ ...card, marginBottom: 16, display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div><label style={labelStyle}>Từ ngày</label><input type="date" value={from} onChange={e => setFrom(e.target.value)} style={{ ...inputStyle, width: 'auto' }} /></div>
        <div><label style={labelStyle}>Đến ngày</label><input type="date" value={to} onChange={e => setTo(e.target.value)} style={{ ...inputStyle, width: 'auto' }} /></div>
        <button onClick={runScan} disabled={scanning || activeRulesCount === 0} style={{ padding: '9px 22px', borderRadius: 9, border: 'none', background: scanning || activeRulesCount === 0 ? '#cbd5e1' : ACCENT, color: '#fff', fontWeight: 800, fontSize: 13, cursor: scanning || activeRulesCount === 0 ? 'default' : 'pointer' }}>
          {scanning ? '⏳ Đang dò...' : '🔍 Dò đơn sai KM'}
        </button>
        {activeRulesCount === 0 && <span style={{ fontSize: '0.78rem', color: '#dc2626' }}>Cần bật ít nhất 1 luật để dò.</span>}
        {scanned && <span style={{ marginLeft: 'auto', fontSize: '0.82rem', fontWeight: 700, color: results.length ? '#dc2626' : '#16a34a' }}>{results.length ? `⚠️ ${results.length} đơn sai (${pendingCount} chờ xử lý)` : '✅ Không có đơn sai trong khoảng này'}</span>}
      </div>

      {/* ── KẾT QUẢ ── */}
      {results.length > 0 && (
        <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>
                <th style={th}>Đơn</th><th style={th}>Ngày</th><th style={th}>Khách</th><th style={{ ...th, minWidth: 220 }}>Sản phẩm</th>
                <th style={{ ...th, textAlign: 'center' }}>SL</th><th style={{ ...th, textAlign: 'right' }}>Giá / Gốc</th><th style={th}>Luật</th>
                <th style={{ ...th, textAlign: 'center' }}>Trạng thái</th><th style={{ ...th, textAlign: 'center', width: 210 }}>Hành động</th>
              </tr></thead>
              <tbody>
                {results.map(r => {
                  const st = STATUS[r.status || 'pending'] || STATUS.pending;
                  return (
                    <tr key={r.order_key}>
                      <td style={{ ...td, fontFamily: 'monospace', fontSize: '0.76rem' }}>{r.order_sn}</td>
                      <td style={td}>{fmtDate(r.order_date)}</td>
                      <td style={{ ...td, fontWeight: 600 }}>{r.buyer || '—'}</td>
                      <td style={{ ...td, whiteSpace: 'normal', maxWidth: 320 }}>{r.item_name}</td>
                      <td style={{ ...td, textAlign: 'center', fontWeight: 800 }}>{r.qty}</td>
                      <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(r.price)}<div style={{ fontSize: '0.68rem', color: '#94a3b8', textDecoration: 'line-through' }}>{fmtMoney(r.orig)}</div></td>
                      <td style={{ ...td, fontSize: '0.76rem' }}>{r.rule_name}</td>
                      <td style={{ ...td, textAlign: 'center' }}><span style={{ padding: '3px 9px', borderRadius: 20, fontSize: '0.7rem', fontWeight: 700, background: st.bg, color: st.color }}>{st.label}</span></td>
                      <td style={{ ...td, textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: 5, justifyContent: 'center', flexWrap: 'wrap' }}>
                          <button onClick={() => copyMsg(r)} style={miniBtn('#7c3aed')}>{copiedKey === r.order_key ? '✓ Đã copy' : '📋 Copy tin'}</button>
                          {r.status !== 'handled' && <button onClick={() => setOrderStatus(r, 'handled')} style={miniBtn('#16a34a')}>Đã xử lý</button>}
                          {r.status !== 'ignored' && <button onClick={() => setOrderStatus(r, 'ignored')} style={miniBtn('#64748b')}>Bỏ qua</button>}
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

      {/* ── FORM LUẬT ── */}
      {editing && (
        <div onClick={() => setEditing(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 16px', zIndex: 1000, overflowY: 'auto' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, padding: 24, width: '100%', maxWidth: 560 }}>
            <h2 style={{ margin: '0 0 18px', fontSize: '1.1rem', fontWeight: 900 }}>{editing.id ? '✏️ Sửa luật' : '🎯 Thêm luật khuyến mãi'}</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
              <div style={{ gridColumn: 'span 2' }}><label style={labelStyle}>Tên luật *</label><input value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} style={inputStyle} placeholder="VD: Mua 2 giảm 50% - Bodymist" /></div>
              <div style={{ gridColumn: 'span 2' }}><label style={labelStyle}>Từ khóa trong TÊN sản phẩm *</label><input value={editing.keyword} onChange={e => setEditing({ ...editing, keyword: e.target.value })} style={inputStyle} placeholder='VD: MUA 2 GIẢM 50%   (hoặc tên SP: Bodymist)' /></div>
              <div><label style={labelStyle}>Số lượng tối thiểu</label><input type="number" min={1} value={editing.min_qty} onChange={e => setEditing({ ...editing, min_qty: e.target.value })} style={inputStyle} /></div>
              <div><label style={labelStyle}>Mô tả giảm</label><input value={editing.discount_desc || ''} onChange={e => setEditing({ ...editing, discount_desc: e.target.value })} style={inputStyle} placeholder="giảm 50%" /></div>
              <div><label style={labelStyle}>Sàn</label><select value={editing.platform} onChange={e => setEditing({ ...editing, platform: e.target.value })} style={inputStyle}>{PLATFORMS.map(p => <option key={p.v} value={p.v}>{p.l}</option>)}</select></div>
              <div><label style={labelStyle}>Áp dụng từ ngày</label><input type="date" value={editing.date_from || ''} onChange={e => setEditing({ ...editing, date_from: e.target.value })} style={inputStyle} /></div>
              <div><label style={labelStyle}>Đến ngày (trống = mãi)</label><input type="date" value={editing.date_to || ''} onChange={e => setEditing({ ...editing, date_to: e.target.value })} style={inputStyle} /></div>
              <div style={{ gridColumn: 'span 2' }}><label style={labelStyle}>Ghi chú</label><input value={editing.note || ''} onChange={e => setEditing({ ...editing, note: e.target.value })} style={inputStyle} /></div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
              <button onClick={() => setEditing(null)} style={{ padding: '9px 20px', borderRadius: 9, border: '1.5px solid #e5e7eb', background: '#fff', color: '#64748b', fontWeight: 700, cursor: 'pointer' }}>Huỷ</button>
              <button onClick={saveRule} style={{ padding: '9px 24px', borderRadius: 9, border: 'none', background: ACCENT, color: '#fff', fontWeight: 800, cursor: 'pointer' }}>💾 Lưu luật</button>
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
