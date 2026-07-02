// Module 8 (Booking) — SĂN KOC: marketplace KOC cào từ TikTok (bảng koc_marketplace_pool).
// Đọc RPC koc_hunt_list (kèm brand đã làm với mình). Lọc + đánh dấu đã liên hệ để đội đi contact.
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../supabaseClient';

const ACCENT = '#ff6a2c';
const API = '/api/tiktok-shop/analytics';
const fmt = (n) => Number(n || 0).toLocaleString('vi-VN');
const fmtK = (n) => { const v = Number(n || 0); return v >= 1e6 ? (v / 1e6).toFixed(1) + 'M' : v >= 1e3 ? (v / 1e3).toFixed(1) + 'K' : String(v); };
const norm = (s) => String(s || '').toLowerCase().trim();

export default function KocHuntTab({ currentUser } = {}) {
  const isAdmin = currentUser?.role === 'admin';
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [onlyNew, setOnlyNew] = useState(true);   // mặc định: chỉ KOC chưa làm với mình
  const [q, setQ] = useState('');
  const [minFollow, setMinFollow] = useState('');
  const [minView, setMinView] = useState('');
  const [region, setRegion] = useState('');
  const [contactFilter, setContactFilter] = useState('all'); // all | chua | roi
  const [poolTotal, setPoolTotal] = useState(0);
  const [crawling, setCrawling] = useState(false);
  const [crawlMsg, setCrawlMsg] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.rpc('koc_hunt_list', { p_only_new: onlyNew, p_limit: 1000, p_offset: 0 });
    setRows(data || []);
    const { count } = await supabase.from('koc_marketplace_pool').select('*', { count: 'exact', head: true });
    setPoolTotal(count || 0);
    setLoading(false);
  }, [onlyNew]);
  useEffect(() => { load(); }, [load]);

  const regions = useMemo(() => [...new Set(rows.map(r => r.region).filter(Boolean))].sort(), [rows]);
  const filtered = useMemo(() => {
    const kw = norm(q), mf = Number(minFollow) || 0, mv = Number(minView) || 0;
    return rows.filter(r =>
      (!kw || norm(r.username).includes(kw) || norm(r.nickname).includes(kw)) &&
      (Number(r.followers) || 0) >= mf &&
      (Number(r.avg_views) || 0) >= mv &&
      (!region || r.region === region) &&
      (contactFilter === 'all' || (contactFilter === 'roi' ? r.da_lien_he : !r.da_lien_he))
    );
  }, [rows, q, minFollow, minView, region, contactFilter]);

  const toggleContact = async (r) => {
    const next = !r.da_lien_he;
    setRows(prev => prev.map(x => x.username === r.username ? { ...x, da_lien_he: next } : x));
    await supabase.from('koc_marketplace_pool').update({ da_lien_he: next, lien_he_boi: next ? (currentUser?.username || currentUser?.name || 'user') : null }).eq('username', r.username);
  };
  const saveNote = async (r, note) => {
    setRows(prev => prev.map(x => x.username === r.username ? { ...x, ghi_chu: note } : x));
    await supabase.from('koc_marketplace_pool').update({ ghi_chu: note }).eq('username', r.username);
  };
  const crawlMore = async () => {
    setCrawling(true); setCrawlMsg('Đang cào thêm...');
    try {
      const r = await fetch(`${API}?action=koc_hunt&max_pages=2&force=1`);
      const j = await r.json();
      if (!j.ok) setCrawlMsg('⚠️ ' + (j.error || 'lỗi'));
      else if (j.stop_code === 36009002) setCrawlMsg('⏳ TikTok đang bóp tần suất — thử lại sau ~1 phút. (Cron sẽ tự cào dần mỗi ngày)');
      else { setCrawlMsg(`✅ Cào ${j.shop}: +${j.saved || 0} KOC. Tổng pool: ${fmt(j.pool_total)}`); load(); }
    } catch (e) { setCrawlMsg('⚠️ ' + e.message); }
    setCrawling(false);
  };

  const th = { padding: '10px 12px', textAlign: 'left', fontSize: '0.72rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.03em', borderBottom: '2px solid #e2e8f0', whiteSpace: 'nowrap', background: '#f8fafc', position: 'sticky', top: 0 };
  const td = { padding: '10px 12px', borderBottom: '1px solid #f1f5f9', fontSize: '0.85rem', color: '#334155', verticalAlign: 'middle' };
  const inp = { padding: '8px 12px', borderRadius: 9, border: '1.5px solid #e2e8f0', fontSize: '0.85rem', fontWeight: 600, color: '#334155', boxSizing: 'border-box' };

  return (
    <div style={{ padding: '20px 24px', fontFamily: "'Outfit', sans-serif", background: '#f8fafc', minHeight: '100vh', margin: '-20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <h2 style={{ margin: 0, color: ACCENT, fontSize: '1.4rem' }}>🔍 Săn KOC — Marketplace</h2>
        <span style={{ background: '#eff6ff', color: '#1d4ed8', fontWeight: 800, padding: '4px 12px', borderRadius: 20, fontSize: '0.82rem' }}>Pool: {fmt(poolTotal)} KOC</span>
        <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>Hiện: {fmt(filtered.length)}</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          {crawlMsg && <span style={{ fontSize: '0.78rem', color: '#64748b' }}>{crawlMsg}</span>}
          <button onClick={load} style={{ ...inp, cursor: 'pointer', background: '#fff', fontWeight: 700 }}>🔄 Tải lại</button>
          {isAdmin && <button onClick={crawlMore} disabled={crawling} style={{ ...inp, cursor: 'pointer', background: ACCENT, color: '#fff', border: 'none', fontWeight: 800 }}>{crawling ? '...' : '⛏️ Cào thêm'}</button>}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14, alignItems: 'center' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, color: onlyNew ? '#16a34a' : '#64748b', cursor: 'pointer', background: '#fff', padding: '8px 12px', borderRadius: 9, border: `1.5px solid ${onlyNew ? '#bbf7d0' : '#e2e8f0'}` }}>
          <input type="checkbox" checked={onlyNew} onChange={e => setOnlyNew(e.target.checked)} style={{ width: 16, height: 16, accentColor: '#16a34a' }} />
          ✨ Chỉ KOC CHƯA làm với mình
        </label>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="🔎 Tìm kênh / tên..." style={{ ...inp, flex: '1 1 200px' }} />
        <input value={minFollow} onChange={e => setMinFollow(e.target.value.replace(/\D/g, ''))} inputMode="numeric" placeholder="Follower ≥" style={{ ...inp, width: 120 }} />
        <input value={minView} onChange={e => setMinView(e.target.value.replace(/\D/g, ''))} inputMode="numeric" placeholder="View TB ≥" style={{ ...inp, width: 120 }} />
        <select value={region} onChange={e => setRegion(e.target.value)} style={{ ...inp, width: 130 }}><option value="">Mọi vùng</option>{regions.map(r => <option key={r} value={r}>{r}</option>)}</select>
        <select value={contactFilter} onChange={e => setContactFilter(e.target.value)} style={{ ...inp, width: 150 }}>
          <option value="all">Tất cả liên hệ</option><option value="chua">Chưa liên hệ</option><option value="roi">Đã liên hệ</option>
        </select>
      </div>

      <div style={{ background: '#fff', borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 3px rgba(15,23,42,.06)', border: '1px solid #f1f5f9' }}>
        <div style={{ overflowX: 'auto', maxHeight: '70vh', overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
            <thead><tr>
              <th style={th}>KOC</th><th style={{ ...th, textAlign: 'right' }}>Follower</th><th style={{ ...th, textAlign: 'right' }}>View TB</th>
              <th style={th}>GMV tier</th><th style={th}>Vùng</th><th style={th}>Ngành</th><th style={th}>Đã làm brand</th><th style={th}>Liên hệ</th><th style={th}>Ghi chú</th>
            </tr></thead>
            <tbody>
              {loading && <tr><td colSpan={9} style={{ ...td, textAlign: 'center', padding: 40, color: '#94a3b8' }}>⏳ Đang tải...</td></tr>}
              {!loading && filtered.length === 0 && <tr><td colSpan={9} style={{ ...td, textAlign: 'center', padding: 40, color: '#94a3b8' }}>Chưa có KOC nào khớp lọc. {poolTotal === 0 ? 'Pool đang trống — chờ cron cào dần (hoặc admin bấm "Cào thêm").' : ''}</td></tr>}
              {!loading && filtered.map(r => (
                <tr key={r.username} style={{ background: r.da_lien_he ? '#fffdf5' : '#fff' }}>
                  <td style={td}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                      {r.avatar ? <img src={r.avatar} alt="" style={{ width: 38, height: 38, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} /> : <div style={{ width: 38, height: 38, borderRadius: '50%', background: '#e2e8f0', flexShrink: 0 }} />}
                      <div style={{ minWidth: 0 }}>
                        <a href={`https://www.tiktok.com/@${r.username}`} target="_blank" rel="noreferrer" style={{ color: ACCENT, fontWeight: 700, textDecoration: 'none', display: 'block' }}>@{r.username}</a>
                        <div style={{ fontSize: '0.72rem', color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}>{r.nickname}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{fmtK(r.followers)}</td>
                  <td style={{ ...td, textAlign: 'right', color: '#0891b2', fontWeight: 700 }}>{fmtK(r.avg_views)}</td>
                  <td style={{ ...td, fontSize: '0.78rem', color: '#64748b' }}>{r.gmv_tier || '—'}</td>
                  <td style={{ ...td, fontSize: '0.78rem' }}>{r.region || '—'}</td>
                  <td style={{ ...td, fontSize: '0.72rem', color: '#64748b', maxWidth: 130 }}>{Array.isArray(r.categories) && r.categories.length ? r.categories.slice(0, 2).join(', ') : '—'}</td>
                  <td style={td}>
                    {Array.isArray(r.brands_done) && r.brands_done.length > 0
                      ? <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>{r.brands_done.map(b => <span key={b} style={{ background: '#fef3c7', color: '#92400e', fontSize: '0.68rem', fontWeight: 700, padding: '2px 7px', borderRadius: 10 }}>{b}</span>)}</div>
                      : <span style={{ background: '#dcfce7', color: '#166534', fontSize: '0.7rem', fontWeight: 800, padding: '3px 9px', borderRadius: 10 }}>✨ CHƯA LÀM</span>}
                  </td>
                  <td style={{ ...td, textAlign: 'center' }}>
                    <button onClick={() => toggleContact(r)} title={r.da_lien_he ? `Đã liên hệ${r.lien_he_boi ? ' bởi ' + r.lien_he_boi : ''}` : 'Đánh dấu đã liên hệ'} style={{ border: 'none', cursor: 'pointer', borderRadius: 8, padding: '5px 10px', fontWeight: 700, fontSize: '0.75rem', background: r.da_lien_he ? '#16a34a' : '#f1f5f9', color: r.da_lien_he ? '#fff' : '#64748b' }}>{r.da_lien_he ? '✓ Đã LH' : 'Đánh dấu'}</button>
                  </td>
                  <td style={td}><input defaultValue={r.ghi_chu || ''} onBlur={e => { if (e.target.value !== (r.ghi_chu || '')) saveNote(r, e.target.value); }} placeholder="ghi chú..." style={{ ...inp, width: 150, padding: '6px 9px', fontSize: '0.78rem' }} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p style={{ color: '#94a3b8', fontSize: '0.76rem', marginTop: 10 }}>* Data cào từ TikTok Creator Marketplace, tăng dần mỗi ngày (cron). "✨ CHƯA LÀM" = KOC chưa từng có đơn/video với brand mình → ưu tiên contact. TikTok không cho email/SĐT → bấm @kênh để liên hệ trực tiếp.</p>
    </div>
  );
}
