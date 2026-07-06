// Săn KOC Body Miss — creator đăng video bán hàng gần đây (chưa quản lý) để đội lượm về contact.
// Nguồn: RPC bodymiss_scout (từ tiktok_shop_videos đã sync, không gọi API). Lượm → cào liên hệ từ bio.
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../supabaseClient';

const ACCENT = '#ff6a2c';
const API = '/api/tiktok-shop/analytics';
const fmt = (n) => Number(n || 0).toLocaleString('vi-VN');
const fmtK = (n) => { const v = Number(n || 0); return v >= 1e9 ? (v / 1e9).toFixed(2) + ' tỷ' : v >= 1e6 ? (v / 1e6).toFixed(1) + 'M' : v >= 1e3 ? (v / 1e3).toFixed(1) + 'K' : String(v); };
const norm = (s) => String(s || '').toLowerCase().trim();
const MARK = { lum: { t: '📥 Đã lượm', c: '#0891b2', bg: '#ecfeff' }, contacted: { t: '✅ Đã liên hệ', c: '#16a34a', bg: '#f0fdf4' }, skip: { t: '⏭️ Bỏ qua', c: '#94a3b8', bg: '#f1f5f9' } };

export default function BodymissScoutTab({ currentUser } = {}) {
  const me = currentUser?.username || currentUser?.name || 'user';
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(7);
  const [onlyNew, setOnlyNew] = useState(false);
  const [onlyUnmanaged, setOnlyUnmanaged] = useState(true);
  const [minView, setMinView] = useState('');
  const [q, setQ] = useState('');
  const [markFilter, setMarkFilter] = useState('all'); // all | chua | lum | contacted | skip
  const [busyU, setBusyU] = useState('');
  const [play, setPlay] = useState(null); // {id, username, title, url, err} — phát video tại chỗ

  // Phát video ngay trong popup (lách chặn video gắn giỏ) — lấy mp4 trực tiếp qua Edge Function tikwm.
  const openPlay = async (videoId, uname, title) => {
    setPlay({ id: videoId, username: uname, title, url: null, err: null });
    try {
      const { data, error } = await supabase.functions.invoke('koc-channel-views', { body: { video_id: videoId, vuser: uname } });
      const link = data?.hdplay || data?.play;
      if (error || !data?.ok || !link) setPlay(p => p?.id === videoId ? { ...p, err: 'Không tải được video — thử lại hoặc mở TikTok.' } : p);
      else setPlay(p => p?.id === videoId ? { ...p, url: link } : p);
    } catch (e) { setPlay(p => p?.id === videoId ? { ...p, err: e.message } : p); }
  };

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.rpc('bodymiss_scout', {
      p_days: days, p_only_unmanaged: onlyUnmanaged, p_only_new: onlyNew,
      p_min_views: Number(minView) || 0, p_limit: 1000,
    });
    setRows(data || []);
    setLoading(false);
  }, [days, onlyUnmanaged, onlyNew, minView]);
  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const kw = norm(q);
    return rows.filter(r =>
      (!kw || norm(r.username).includes(kw)) &&
      (markFilter === 'all' || (markFilter === 'chua' ? !r.mark_status : r.mark_status === markFilter))
    );
  }, [rows, q, markFilter]);

  const newCount = useMemo(() => rows.filter(r => r.is_new_creator).length, [rows]);

  const grab = async (r, status) => {
    setBusyU(r.username);
    setRows(prev => prev.map(x => x.username === r.username ? { ...x, mark_status: status, marked_by: me } : x));
    try {
      const res = await fetch(`${API}?action=koc_scout_grab`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: r.username, status, by: me }),
      });
      const j = await res.json();
      if (j.ok) setRows(prev => prev.map(x => x.username === r.username ? { ...x, mark_status: status, email: j.email || x.email, sdt: j.sdt || x.sdt, followers: j.followers ?? x.followers } : x));
    } catch { /* giữ optimistic */ }
    setBusyU('');
  };
  const saveNote = async (r, note) => {
    setRows(prev => prev.map(x => x.username === r.username ? { ...x, mark_note: note } : x));
    await supabase.from('koc_scout_marks').upsert({ username: r.username, note, marked_by: me, updated_at: new Date().toISOString() }, { onConflict: 'username' });
  };

  const th = { padding: '10px 12px', textAlign: 'left', fontSize: '0.72rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.03em', borderBottom: '2px solid #e2e8f0', whiteSpace: 'nowrap', background: '#f8fafc', position: 'sticky', top: 0 };
  const td = { padding: '10px 12px', borderBottom: '1px solid #f1f5f9', fontSize: '0.85rem', color: '#334155', verticalAlign: 'middle' };
  const inp = { padding: '8px 12px', borderRadius: 9, border: '1.5px solid #e2e8f0', fontSize: '0.85rem', fontWeight: 600, color: '#334155', boxSizing: 'border-box' };

  return (
    <div style={{ padding: '20px 24px', fontFamily: "'Outfit', sans-serif", background: '#f8fafc', minHeight: '100vh', margin: '-20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 6 }}>
        <h2 style={{ margin: 0, color: ACCENT, fontSize: '1.4rem' }}>🎯 Săn KOC — Body Miss</h2>
        <span style={{ background: '#dcfce7', color: '#166534', fontWeight: 800, padding: '4px 12px', borderRadius: 20, fontSize: '0.82rem' }}>✨ {fmt(newCount)} KOC mới</span>
        <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>Hiện: {fmt(filtered.length)} / {fmt(rows.length)} creator</span>
        <button onClick={load} style={{ marginLeft: 'auto', ...inp, cursor: 'pointer', background: '#fff', fontWeight: 700 }}>🔄 Tải lại</button>
      </div>
      <p style={{ color: '#94a3b8', fontSize: '0.78rem', margin: '0 0 14px', maxWidth: 900 }}>
        Creator đăng video bán hàng cho Body Miss gần đây mà <b>chưa có nhân sự quản lý & chưa từng book cast</b> — lượm KOC ngon về chăm sóc & liên hệ.
        Bấm <b>📥 Lượm</b> để tự cào liên hệ (email/SĐT từ bio) rồi đội đi contact. Data từ video đã sync (không tốn quota).
      </p>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14, alignItems: 'center' }}>
        <select value={days} onChange={e => setDays(Number(e.target.value))} style={{ ...inp, cursor: 'pointer' }}>
          <option value={3}>3 ngày</option><option value={7}>7 ngày</option><option value={14}>14 ngày</option><option value={28}>28 ngày</option>
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, color: onlyNew ? '#16a34a' : '#64748b', cursor: 'pointer', background: '#fff', padding: '8px 12px', borderRadius: 9, border: `1.5px solid ${onlyNew ? '#bbf7d0' : '#e2e8f0'}` }}>
          <input type="checkbox" checked={onlyNew} onChange={e => setOnlyNew(e.target.checked)} style={{ width: 16, height: 16, accentColor: '#16a34a' }} />
          ✨ Chỉ KOC MỚI xuất hiện
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, color: onlyUnmanaged ? '#e85518' : '#64748b', cursor: 'pointer', background: '#fff', padding: '8px 12px', borderRadius: 9, border: `1.5px solid ${onlyUnmanaged ? '#fed7aa' : '#e2e8f0'}` }}>
          <input type="checkbox" checked={onlyUnmanaged} onChange={e => setOnlyUnmanaged(e.target.checked)} style={{ width: 16, height: 16, accentColor: ACCENT }} />
          Chỉ KOC chưa quản lý
        </label>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="🔎 Tìm @kênh..." style={{ ...inp, flex: '1 1 180px' }} />
        <input value={minView} onChange={e => setMinView(e.target.value.replace(/\D/g, ''))} inputMode="numeric" placeholder="View ≥" style={{ ...inp, width: 110 }} />
        <select value={markFilter} onChange={e => setMarkFilter(e.target.value)} style={{ ...inp, cursor: 'pointer' }}>
          <option value="all">Tất cả</option><option value="chua">Chưa lượm</option><option value="lum">Đã lượm</option><option value="contacted">Đã liên hệ</option><option value="skip">Bỏ qua</option>
        </select>
      </div>

      <div style={{ background: '#fff', borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 3px rgba(15,23,42,.06)', border: '1px solid #f1f5f9' }}>
        <div style={{ overflowX: 'auto', maxHeight: '72vh', overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1000 }}>
            <thead><tr>
              <th style={th}>KOC</th><th style={{ ...th, textAlign: 'right' }}>Video kỳ</th><th style={{ ...th, textAlign: 'right' }}>View</th>
              <th style={{ ...th, textAlign: 'right' }}>GMV</th><th style={{ ...th, textAlign: 'right' }}>Đơn</th><th style={th}>Follower</th>
              <th style={th}>Liên hệ</th><th style={th}>Video mới nhất</th><th style={th}>Trạng thái</th><th style={th}>Ghi chú</th>
            </tr></thead>
            <tbody>
              {loading && <tr><td colSpan={10} style={{ ...td, textAlign: 'center', padding: 40, color: '#94a3b8' }}>⏳ Đang tải...</td></tr>}
              {!loading && filtered.length === 0 && <tr><td colSpan={10} style={{ ...td, textAlign: 'center', padding: 40, color: '#94a3b8' }}>Không có KOC nào khớp lọc.</td></tr>}
              {!loading && filtered.map(r => {
                const mk = MARK[r.mark_status];
                return (
                  <tr key={r.username} style={{ background: r.mark_status ? mk.bg : '#fff' }}>
                    <td style={td}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                        {r.avatar ? <img src={r.avatar} alt="" style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} /> : <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#e2e8f0', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontWeight: 800 }}>{r.username[0]?.toUpperCase()}</div>}
                        <div style={{ minWidth: 0 }}>
                          <a href={`https://www.tiktok.com/@${r.username}`} target="_blank" rel="noreferrer" style={{ color: ACCENT, fontWeight: 700, textDecoration: 'none', display: 'block' }}>@{r.username}</a>
                          {r.is_new_creator && <span style={{ background: '#dcfce7', color: '#166534', fontSize: '0.66rem', fontWeight: 800, padding: '1px 7px', borderRadius: 9 }}>✨ MỚI</span>}
                        </div>
                      </div>
                    </td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{fmt(r.n_videos)}</td>
                    <td style={{ ...td, textAlign: 'right', color: '#0891b2', fontWeight: 700 }}>{fmtK(r.total_views)}</td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: r.total_gmv > 0 ? '#16a34a' : '#cbd5e1' }}>{r.total_gmv > 0 ? fmtK(r.total_gmv) + 'đ' : '—'}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{fmt(r.total_orders)}</td>
                    <td style={{ ...td, fontWeight: 700 }}>{r.followers ? fmtK(r.followers) : '—'}</td>
                    <td style={td}>
                      {(r.email || r.sdt) ? (
                        <div style={{ fontSize: '0.72rem', fontWeight: 700, display: 'flex', flexDirection: 'column', gap: 2 }}>
                          {r.email && <span onClick={() => navigator.clipboard?.writeText(r.email)} title="Bấm copy" style={{ color: '#0891b2', cursor: 'pointer' }}>📧 {r.email}</span>}
                          {r.sdt && <span onClick={() => navigator.clipboard?.writeText(r.sdt)} title="Bấm copy" style={{ color: '#16a34a', cursor: 'pointer' }}>📱 {r.sdt}</span>}
                        </div>
                      ) : <span style={{ color: '#cbd5e1', fontSize: '0.72rem' }}>{r.mark_status ? 'bio ko có' : 'lượm để lấy'}</span>}
                    </td>
                    <td style={{ ...td, fontSize: '0.75rem', maxWidth: 210 }}>
                      {r.last_video_id ? (
                        <button onClick={() => openPlay(r.last_video_id, r.username, r.top_title)} title={r.top_title || 'Bấm xem clip tại chỗ'} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: '#fff', background: ACCENT, border: 'none', borderRadius: 8, padding: '5px 10px', fontWeight: 700, cursor: 'pointer', maxWidth: 200 }}>
                          <span style={{ flexShrink: 0 }}>▶️</span>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.top_title || 'Xem clip'}</span>
                        </button>
                      ) : <span style={{ color: '#cbd5e1' }}>—</span>}
                      <div style={{ fontSize: '0.68rem', color: '#94a3b8', marginTop: 3 }}>{r.last_post ? new Date(r.last_post).toLocaleDateString('vi-VN') : ''}{r.has_cast ? <span style={{ color: '#7c3aed', fontWeight: 700 }}> · 💸 có cast</span> : ''}</div>
                    </td>
                    <td style={td}>
                      {r.mark_status
                        ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontWeight: 700, fontSize: '0.74rem', color: mk.c }}>{mk.t}{r.marked_by ? <span style={{ color: '#94a3b8', fontWeight: 500 }}>· {r.marked_by}</span> : null}</span>
                        : <div style={{ display: 'flex', gap: 5 }}>
                            <button onClick={() => grab(r, 'lum')} disabled={busyU === r.username} style={{ border: 'none', cursor: 'pointer', borderRadius: 8, padding: '6px 12px', fontWeight: 800, fontSize: '0.74rem', background: ACCENT, color: '#fff' }}>{busyU === r.username ? '...' : '📥 Lượm'}</button>
                            <button onClick={() => grab(r, 'skip')} disabled={busyU === r.username} title="Bỏ qua" style={{ border: '1px solid #e2e8f0', cursor: 'pointer', borderRadius: 8, padding: '6px 9px', fontWeight: 700, fontSize: '0.74rem', background: '#fff', color: '#94a3b8' }}>⏭</button>
                          </div>}
                      {r.mark_status && r.mark_status !== 'contacted' && <button onClick={() => grab(r, 'contacted')} style={{ display: 'block', marginTop: 4, border: '1px solid #bbf7d0', cursor: 'pointer', borderRadius: 7, padding: '3px 9px', fontWeight: 700, fontSize: '0.7rem', background: '#f0fdf4', color: '#16a34a' }}>✅ Đã liên hệ</button>}
                    </td>
                    <td style={td}><input defaultValue={r.mark_note || ''} onBlur={e => { if (e.target.value !== (r.mark_note || '')) saveNote(r, e.target.value); }} placeholder="ghi chú..." style={{ ...inp, width: 140, padding: '6px 9px', fontSize: '0.78rem' }} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {play && (
        <div onClick={() => setPlay(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.7)', zIndex: 4000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#0f172a', borderRadius: 16, padding: 14, width: 'min(94vw, 380px)', fontFamily: "'Outfit', sans-serif" }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <a href={`https://www.tiktok.com/@${play.username}`} target="_blank" rel="noreferrer" style={{ color: ACCENT, fontWeight: 700, textDecoration: 'none', fontSize: '0.86rem' }}>@{play.username}</a>
              <a href={`https://www.tiktok.com/@${play.username}/video/${play.id}`} target="_blank" rel="noreferrer" style={{ color: '#94a3b8', fontSize: '0.72rem', textDecoration: 'none' }}>↗ mở TikTok</a>
              <button onClick={() => setPlay(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#94a3b8', fontSize: '1.3rem', cursor: 'pointer' }}>✕</button>
            </div>
            <div style={{ width: '100%', aspectRatio: '9/16', background: '#000', borderRadius: 10, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {play.err
                ? <div style={{ color: '#fca5a5', fontSize: '0.82rem', textAlign: 'center', padding: 20 }}>⚠️ {play.err}</div>
                : !play.url
                ? <div style={{ color: '#94a3b8', fontSize: '0.85rem' }}>⏳ Đang tải clip...</div>
                : <video src={play.url} controls autoPlay playsInline style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#000' }} />}
            </div>
            {play.title && <div style={{ color: '#cbd5e1', fontSize: '0.76rem', marginTop: 8, lineHeight: 1.4 }}>{play.title}</div>}
          </div>
        </div>
      )}
    </div>
  );
}
