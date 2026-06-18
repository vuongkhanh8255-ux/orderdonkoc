// src/components/KocBlacklistTab.jsx
//
// Black List KOC — danh sách kênh KOC bị chặn (bảng koc_blacklist).
// CHỈ ADMIN xem/sửa được: tab này gate bằng ROLE_VIEWS (chỉ role 'admin' có
// 'koc_blacklist' trong LoginPage). Trước đây panel nằm trong "Quản Lý Link Air"
// (ai vào booking cũng thấy + có nút mở khoá bằng mật khẩu); tách riêng ra đây để
// chỉ admin biết ai bị blacklist. Logic CẢNH BÁO khi thêm/import link của KOC
// blacklisted vẫn nằm ở AirLinksTab (đọc chung bảng koc_blacklist) — không đổi.

import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../supabaseClient';

const ACCENT = '#ff6a2c';
const PAGE_SIZE = 30;

const KocBlacklistTab = () => {
  const [channels, setChannels] = useState([]);   // [{ id_kenh, created_at }]
  const [airedMap, setAiredMap] = useState({});   // id_kenh chuẩn hoá → { staff, total_air } (nhân sự đã từng air)
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState('');
  const [flag, setFlag]         = useState('all'); // all | aired | none
  const [page, setPage]         = useState(1);
  const [newChannel, setNewChannel] = useState('');
  const [busy, setBusy]         = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('koc_blacklist')
        .select('id_kenh, created_at')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setChannels(data || []);
      // Đối chiếu air_links: nhân sự nào đã từng air kênh blacklist này (kèm số video)
      try {
        const { data: aired } = await supabase.rpc('blacklist_aired_staff');
        const m = {};
        for (const r of (aired || [])) m[(r.id_kenh || '').toLowerCase().replace(/^@/, '')] = r;
        setAiredMap(m);
      } catch (e2) { console.error('aired staff failed:', e2); }
    } catch (e) {
      console.error('Load blacklist failed:', e);
      alert('Không tải được blacklist: ' + (e.message || e));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const add = async () => {
    const trimmed = newChannel.trim();
    if (!trimmed) return;
    if (channels.some(c => (c.id_kenh || '').toLowerCase() === trimmed.toLowerCase())) {
      alert('Kênh này đã có trong blacklist.');
      return;
    }
    setBusy(true);
    const { error } = await supabase.from('koc_blacklist').insert({ id_kenh: trimmed });
    setBusy(false);
    if (error) { alert('Lỗi khi thêm: ' + error.message); return; }
    setNewChannel('');
    setSearch('');
    setPage(1);
    load();
  };

  const remove = async (id) => {
    if (!window.confirm(`Xoá "${id}" khỏi blacklist?`)) return;
    const { error } = await supabase.from('koc_blacklist').delete().eq('id_kenh', id);
    if (error) { alert('Lỗi khi xoá: ' + error.message); return; }
    setChannels(prev => prev.filter(c => c.id_kenh !== id));
  };

  const norm = (s) => (s || '').toLowerCase().replace(/^@/, '');
  const airedCount = useMemo(() => channels.filter(c => airedMap[norm(c.id_kenh)]).length, [channels, airedMap]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = q ? channels.filter(c => (c.id_kenh || '').toLowerCase().includes(q)) : channels;
    if (flag === 'aired') list = list.filter(c => airedMap[norm(c.id_kenh)]);
    else if (flag === 'none') list = list.filter(c => !airedMap[norm(c.id_kenh)]);
    if (flag === 'aired') list = [...list].sort((a, b) => (airedMap[norm(b.id_kenh)]?.total_air || 0) - (airedMap[norm(a.id_kenh)]?.total_air || 0));
    return list;
  }, [channels, search, flag, airedMap]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage   = Math.min(page, totalPages);
  const pageItems  = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const fmtDate = (s) => { try { return s ? new Date(s).toLocaleDateString('vi-VN') : '—'; } catch { return '—'; } };

  const inputStyle = { padding: '9px 13px', borderRadius: 9, border: '1px solid #fca5a5', fontSize: '0.88rem', boxSizing: 'border-box', outline: 'none' };

  return (
    <div style={{ padding: '8px 4px', maxWidth: 1100 }}>
      <h2 style={{ margin: '0 0 4px', fontSize: '1.6rem', fontWeight: 900, color: '#dc2626' }}>🚫 Black List KOC</h2>
      <p style={{ margin: '0 0 18px', color: '#94a3b8', fontSize: '0.9rem' }}>
        Danh sách kênh KOC bị chặn booking — chỉ <b style={{ color: '#dc2626' }}>Admin</b> xem &amp; chỉnh sửa.
        Khi nhân sự dán/import link của kênh trong danh sách này, hệ thống sẽ cảnh báo ở “Quản Lý Link Air”.
      </p>

      {/* Card đếm tổng */}
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, background: '#fff', border: '1px solid #fecaca', borderLeft: `4px solid #dc2626`, borderRadius: 12, padding: '12px 18px', marginBottom: 16, boxShadow: '0 1px 4px rgba(15,23,42,0.05)' }}>
        <span style={{ fontSize: '1.3rem' }}>🚫</span>
        <div>
          <div style={{ fontSize: '0.68rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px' }}>Tổng kênh blacklist</div>
          <div style={{ fontSize: '1.45rem', fontWeight: 900, color: '#dc2626' }}>{loading ? '…' : channels.length.toLocaleString('vi-VN')} kênh</div>
        </div>
      </div>

      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, background: '#fff', border: '1px solid #fde68a', borderLeft: `4px solid #d97706`, borderRadius: 12, padding: '12px 18px', marginBottom: 16, marginLeft: 10, boxShadow: '0 1px 4px rgba(15,23,42,0.05)' }}>
        <span style={{ fontSize: '1.3rem' }}>⚠️</span>
        <div>
          <div style={{ fontSize: '0.68rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px' }}>Đã từng bị nhân sự air</div>
          <div style={{ fontSize: '1.45rem', fontWeight: 900, color: '#d97706' }}>{loading ? '…' : Object.keys(airedMap).length} kênh</div>
        </div>
      </div>

      {/* Thêm kênh */}
      <div style={{ background: '#fff', border: '1px solid #fecaca', borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#dc2626', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 8 }}>+ Thêm kênh vào blacklist</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="text" value={newChannel} placeholder="Nhập ID Kênh (vd: @tenkenh hoặc 123456789)…"
            onChange={e => setNewChannel(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') add(); }}
            style={{ ...inputStyle, flex: 1 }} />
          <button type="button" onClick={add} disabled={busy || !newChannel.trim()}
            style={{ padding: '9px 18px', background: busy || !newChannel.trim() ? '#fca5a5' : '#dc2626', color: '#fff', border: 'none', borderRadius: 9, fontWeight: 800, cursor: busy || !newChannel.trim() ? 'default' : 'pointer', fontSize: '0.88rem', whiteSpace: 'nowrap' }}>
            {busy ? '⏳' : '+ Thêm'}
          </button>
        </div>
      </div>

      {/* Bộ lọc nhân sự đã air */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        {[
          { k: 'all', label: `Tất cả (${channels.length})`, c: '#dc2626' },
          { k: 'aired', label: `⚠️ Có nhân sự air (${airedCount})`, c: '#d97706' },
          { k: 'none', label: `Chưa ai air (${Math.max(0, channels.length - airedCount)})`, c: '#64748b' },
        ].map(b => (
          <button key={b.k} type="button" onClick={() => { setFlag(b.k); setPage(1); }}
            style={{ padding: '7px 14px', borderRadius: 9, fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer', border: `1.5px solid ${flag === b.k ? b.c : '#e5e7eb'}`, background: flag === b.k ? b.c : '#fff', color: flag === b.k ? '#fff' : '#64748b' }}>
            {b.label}
          </button>
        ))}
        {flag === 'aired' && <span style={{ fontSize: '0.76rem', color: '#94a3b8' }}>↓ sắp theo số video air nhiều nhất</span>}
      </div>

      {/* Tìm kiếm */}
      <input
        type="text" value={search} placeholder="🔍 Tìm ID Kênh trong blacklist…"
        onChange={e => { setSearch(e.target.value); setPage(1); }}
        style={{ ...inputStyle, width: '100%', marginBottom: 12 }} />

      {/* Bảng */}
      <div style={{ background: '#fff', border: '1px solid #fecaca', borderRadius: 12, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>⏳ Đang tải…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: '#9ca3af', fontSize: '0.88rem' }}>
            {search ? `Không tìm thấy kênh khớp “${search}”.` : 'Chưa có kênh nào trong blacklist.'}
          </div>
        ) : (
          <>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.86rem' }}>
              <thead>
                <tr style={{ background: '#fef2f2' }}>
                  <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 800, color: '#dc2626', width: 48 }}>#</th>
                  <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 800, color: '#dc2626' }}>
                    ID Kênh {search && <span style={{ fontWeight: 400, color: '#9ca3af' }}>({filtered.length} kết quả)</span>}
                  </th>
                  <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 800, color: '#dc2626' }}>⚠️ Nhân sự đã từng air (số video)</th>
                  <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 800, color: '#dc2626', width: 120 }}>Ngày thêm</th>
                  <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 800, color: '#dc2626', width: 80 }}>Xoá</th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((c, i) => (
                  <tr key={c.id_kenh || i} style={{ borderBottom: '1px solid #fee2e2' }}>
                    <td style={{ padding: '9px 14px', color: '#94a3b8', fontWeight: 700 }}>{(safePage - 1) * PAGE_SIZE + i + 1}</td>
                    <td style={{ padding: '9px 14px', fontFamily: 'monospace', fontWeight: 600, color: '#0f172a' }}>{c.id_kenh}</td>
                    <td style={{ padding: '9px 14px', fontSize: '0.82rem' }}>{(() => {
                      const a = airedMap[(c.id_kenh || '').toLowerCase().replace(/^@/, '')];
                      return a
                        ? <span style={{ color: '#dc2626', fontWeight: 600 }} title={`Tổng ${a.total_air} video đã air kênh này`}>{a.staff}</span>
                        : <span style={{ color: '#cbd5e1' }}>— chưa ai air</span>;
                    })()}</td>
                    <td style={{ padding: '9px 14px', color: '#64748b', fontSize: '0.8rem' }}>{fmtDate(c.created_at)}</td>
                    <td style={{ padding: '9px 14px', textAlign: 'center' }}>
                      <button type="button" onClick={() => remove(c.id_kenh)}
                        style={{ padding: '4px 12px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 7, color: '#dc2626', fontWeight: 700, cursor: 'pointer', fontSize: '0.8rem' }}>
                        Xoá
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {totalPages > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px 0', borderTop: '1px solid #fee2e2' }}>
                <button type="button" onClick={() => setPage(Math.max(1, safePage - 1))} disabled={safePage === 1}
                  style={{ padding: '5px 12px', borderRadius: 7, border: '1px solid #fca5a5', background: safePage === 1 ? '#f9fafb' : '#fff', color: safePage === 1 ? '#d1d5db' : '#dc2626', cursor: safePage === 1 ? 'default' : 'pointer', fontWeight: 800 }}>‹</button>
                <span style={{ fontSize: '0.82rem', color: '#6b7280' }}>Trang {safePage}/{totalPages} ({filtered.length} kênh)</span>
                <button type="button" onClick={() => setPage(Math.min(totalPages, safePage + 1))} disabled={safePage === totalPages}
                  style={{ padding: '5px 12px', borderRadius: 7, border: '1px solid #fca5a5', background: safePage === totalPages ? '#f9fafb' : '#fff', color: safePage === totalPages ? '#d1d5db' : '#dc2626', cursor: safePage === totalPages ? 'default' : 'pointer', fontWeight: 800 }}>›</button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default KocBlacklistTab;
