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
  const canInvite = currentUser?.username === 'khanhpro8255'; // CHỈ khanhpro8255 được mời KOC
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
  const [sel, setSel] = useState({});           // username -> true (KOC đã chọn để mời)
  const [inviteOpen, setInviteOpen] = useState(false);

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

  // ── chọn KOC để mời ──
  const toggleSel = (u) => setSel(prev => { const n = { ...prev }; if (n[u]) delete n[u]; else n[u] = true; return n; });
  const selRows = useMemo(() => rows.filter(r => sel[r.username]), [rows, sel]);
  const clearSel = () => setSel({});

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

      {/* Thanh MỜI KOC — chỉ khanhpro8255. Hiện khi đã chọn ≥1 KOC. */}
      {canInvite && selRows.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 14, background: '#fff7ed', border: '1.5px solid #fed7aa', borderRadius: 12, padding: '12px 16px' }}>
          <span style={{ fontWeight: 800, color: '#0f172a' }}>✅ Đã chọn <span style={{ color: ACCENT }}>{selRows.length}</span> KOC</span>
          <button onClick={() => setInviteOpen(true)} style={{ padding: '9px 20px', borderRadius: 10, border: 'none', background: ACCENT, color: '#fff', fontWeight: 800, fontSize: '0.9rem', cursor: 'pointer' }}>📨 Mời hàng loạt</button>
          <button onClick={clearSel} style={{ ...inp, cursor: 'pointer', background: '#fff', fontWeight: 700 }}>Bỏ chọn</button>
          <span style={{ fontSize: '0.74rem', color: '#9a3412' }}>Nhắn tin trực tiếp hoặc tạo chiến dịch mời đích danh (target collab) qua API TikTok.</span>
        </div>
      )}

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
              {canInvite && <th style={{ ...th, textAlign: 'center', width: 34 }} title="Chọn để mời"><input type="checkbox" checked={filtered.length > 0 && filtered.every(r => sel[r.username])} onChange={e => setSel(e.target.checked ? Object.fromEntries(filtered.map(r => [r.username, true])) : {})} style={{ width: 15, height: 15, accentColor: ACCENT }} /></th>}
              <th style={th}>KOC</th><th style={{ ...th, textAlign: 'right' }}>Follower</th><th style={{ ...th, textAlign: 'right' }}>View TB</th>
              <th style={th}>GMV tier</th><th style={th}>Vùng</th><th style={th}>Ngành</th><th style={th}>Đã làm brand</th>{canInvite && <th style={th}>Đã mời</th>}<th style={th}>Liên hệ</th><th style={th}>Ghi chú</th>
            </tr></thead>
            <tbody>
              {loading && <tr><td colSpan={canInvite ? 11 : 9} style={{ ...td, textAlign: 'center', padding: 40, color: '#94a3b8' }}>⏳ Đang tải...</td></tr>}
              {!loading && filtered.length === 0 && <tr><td colSpan={canInvite ? 11 : 9} style={{ ...td, textAlign: 'center', padding: 40, color: '#94a3b8' }}>Chưa có KOC nào khớp lọc. {poolTotal === 0 ? 'Pool đang trống — chờ cron cào dần (hoặc admin bấm "Cào thêm").' : ''}</td></tr>}
              {!loading && filtered.map(r => (
                <tr key={r.username} style={{ background: sel[r.username] ? '#fff7ed' : r.da_lien_he ? '#fffdf5' : '#fff' }}>
                  {canInvite && <td style={{ ...td, textAlign: 'center' }}><input type="checkbox" checked={!!sel[r.username]} onChange={() => toggleSel(r.username)} disabled={!r.open_id} title={r.open_id ? 'Chọn để mời' : 'KOC này chưa có open_id (cào lại để lấy)'} style={{ width: 15, height: 15, accentColor: ACCENT }} /></td>}
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
                  {canInvite && <td style={{ ...td, fontSize: '0.7rem' }}>
                    {r.moi_im_at && <div style={{ color: '#0891b2', fontWeight: 700 }}>💬 {new Date(r.moi_im_at).toLocaleDateString('vi-VN')}</div>}
                    {r.moi_collab_at && <div style={{ color: '#7c3aed', fontWeight: 700 }}>🎯 {new Date(r.moi_collab_at).toLocaleDateString('vi-VN')}</div>}
                    {!r.moi_im_at && !r.moi_collab_at && <span style={{ color: '#cbd5e1' }}>—</span>}
                  </td>}
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

      {inviteOpen && canInvite && (
        <InviteModal selRows={selRows} currentUser={currentUser} onClose={() => setInviteOpen(false)} onDone={() => { setInviteOpen(false); clearSel(); load(); }} />
      )}
    </div>
  );
}

// ── MODAL MỜI KOC (chỉ khanhpro8255): tab Nhắn tin (IM) + tab Chiến dịch (target collab) ──
function InviteModal({ selRows, currentUser, onClose, onDone }) {
  const [tab, setTab] = useState('im');            // 'im' | 'collab'
  const [shops, setShops] = useState([]);
  const [shop, setShop] = useState(null);          // { shop_id, seller_name }
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState([]);              // dòng kết quả từng KOC
  // IM
  const [message, setMessage] = useState('');
  // Collab
  const [name, setName] = useState('');
  const [endDate, setEndDate] = useState('');
  const [pct, setPct] = useState('');
  const [collabMsg, setCollabMsg] = useState('');
  const [email, setEmail] = useState('khanh.vuong@stellakinetics.com');
  const [products, setProducts] = useState([]);
  const [prodSel, setProdSel] = useState({});
  const [loadingProd, setLoadingProd] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`${API}?action=shops`);
        const j = await r.json();
        const list = j.ok ? (j.data || []) : [];
        setShops(list);
        setShop(list.find(s => norm(s.seller_name).includes('body')) || list[0] || null);
      } catch { /* ignore */ }
    })();
  }, []);

  const loadProducts = useCallback(async () => {
    if (!shop) return;
    setLoadingProd(true); setProducts([]); setProdSel({});
    try {
      const end = new Date(); const start = new Date(); start.setDate(start.getDate() - 30);
      const ymd = (d) => d.toISOString().slice(0, 10);
      const qs = new URLSearchParams({ action: 'products', shop_id: shop.shop_id, start_date: ymd(start), end_date: ymd(end), page_size: '50', sort_field: 'gmv' });
      const r = await fetch(`${API}?${qs}`); const j = await r.json();
      setProducts(j.ok && Array.isArray(j.data?.products) ? j.data.products : (j.products || []));
    } catch { /* ignore */ }
    setLoadingProd(false);
  }, [shop]);
  useEffect(() => { if (tab === 'collab' && shop) loadProducts(); }, [tab, shop, loadProducts]);

  const sellerKw = shop ? norm(shop.seller_name).split(' ')[0] : 'body';

  const sendIm = async () => {
    if (!message.trim()) { alert('Nhập nội dung tin nhắn'); return; }
    setBusy(true); setLog([]);
    for (const r of selRows) {
      try {
        const res = await fetch(`${API}?action=koc_invite_im&k=kp8255`, {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ k: 'kp8255', open_id: r.open_id, username: r.username, message: message.trim(), seller: sellerKw }),
        });
        const j = await res.json();
        setLog(prev => [...prev, { u: r.username, ok: j.ok, msg: j.ok ? 'đã gửi' : (j.error || j.code || 'lỗi') }]);
      } catch (e) { setLog(prev => [...prev, { u: r.username, ok: false, msg: e.message }]); }
      await new Promise(z => setTimeout(z, 1200)); // giãn nhịp tránh rate-limit
    }
    setBusy(false);
  };

  const sendCollab = async () => {
    const pids = products.filter(p => prodSel[p.id]).map(p => String(p.id));
    if (!name.trim()) { alert('Nhập tên chiến dịch'); return; }
    if (!endDate) { alert('Chọn ngày kết thúc'); return; }
    if (!(Number(pct) >= 1 && Number(pct) <= 80)) { alert('Hoa hồng phải từ 1 đến 80 (%)'); return; }
    if (!pids.length) { alert('Chọn ít nhất 1 sản phẩm'); return; }
    if (selRows.length > 50) { alert('Tối đa 50 KOC/chiến dịch — bỏ bớt'); return; }
    setBusy(true); setLog([]);
    try {
      const endUnix = String(Math.floor(new Date(endDate + 'T23:59:59').getTime() / 1000));
      const res = await fetch(`${API}?action=koc_invite_collab&k=kp8255`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          k: 'kp8255', seller: sellerKw, name: name.trim(), message: collabMsg.trim() || undefined,
          end_time: endUnix, commission_pct: Number(pct), product_ids: pids, email: email.trim(),
          creators: selRows.map(r => ({ open_id: r.open_id, username: r.username })),
        }),
      });
      const j = await res.json();
      setLog([{ u: `Chiến dịch "${name}"`, ok: j.ok, msg: j.ok ? `đã mời ${j.invited} KOC` : (j.error || j.code || 'lỗi') }]);
    } catch (e) { setLog([{ u: 'Chiến dịch', ok: false, msg: e.message }]); }
    setBusy(false);
  };

  const inp = { padding: '9px 12px', borderRadius: 9, border: '1.5px solid #e2e8f0', fontSize: '0.86rem', color: '#334155', boxSizing: 'border-box', width: '100%' };
  const tabBtn = (t, label) => (
    <button onClick={() => setTab(t)} style={{ flex: 1, padding: '10px', border: 'none', borderRadius: 9, cursor: 'pointer', fontWeight: 800, fontSize: '0.86rem', background: tab === t ? ACCENT : '#f1f5f9', color: tab === t ? '#fff' : '#64748b' }}>{label}</button>
  );
  const okCount = log.filter(l => l.ok).length;

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.45)', zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, width: 640, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', padding: 24, fontFamily: "'Outfit', sans-serif" }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 14 }}>
          <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#0f172a' }}>📨 Mời {selRows.length} KOC</h3>
          <button onClick={onClose} style={{ marginLeft: 'auto', background: 'none', border: 'none', fontSize: '1.3rem', cursor: 'pointer', color: '#94a3b8' }}>✕</button>
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          {tabBtn('im', '💬 Nhắn tin')}
          {tabBtn('collab', '🎯 Chiến dịch mời đích danh')}
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: '0.76rem', fontWeight: 700, color: '#64748b' }}>Gửi từ shop</label>
          <select value={shop?.shop_id || ''} onChange={e => setShop(shops.find(s => String(s.shop_id) === e.target.value))} style={inp}>
            {shops.map(s => <option key={s.shop_id} value={s.shop_id}>{s.seller_name}</option>)}
          </select>
        </div>

        {tab === 'im' ? (
          <div>
            <label style={{ fontSize: '0.76rem', fontWeight: 700, color: '#64748b' }}>Nội dung tin nhắn (gửi cho từng KOC)</label>
            <textarea value={message} onChange={e => setMessage(e.target.value)} rows={4} placeholder="Chào bạn! Shop mình có SP..." style={{ ...inp, resize: 'vertical', marginTop: 4 }} />
            <p style={{ fontSize: '0.72rem', color: '#94a3b8', margin: '6px 0 0' }}>TikTok giới hạn tối đa 5 tin trước khi KOC trả lời; quota mời/tuần tuỳ GMV affiliate shop.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div><label style={{ fontSize: '0.76rem', fontWeight: 700, color: '#64748b' }}>Tên chiến dịch</label><input value={name} onChange={e => setName(e.target.value)} placeholder="VD: Mời KOC làm đẹp T7" style={inp} /></div>
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ flex: 1 }}><label style={{ fontSize: '0.76rem', fontWeight: 700, color: '#64748b' }}>Ngày kết thúc</label><input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} style={inp} /></div>
              <div style={{ flex: 1 }}><label style={{ fontSize: '0.76rem', fontWeight: 700, color: '#64748b' }}>Hoa hồng %</label><input value={pct} onChange={e => setPct(e.target.value.replace(/[^\d.]/g, ''))} inputMode="decimal" placeholder="1 - 80" style={inp} /></div>
            </div>
            <div>
              <label style={{ fontSize: '0.76rem', fontWeight: 700, color: '#64748b' }}>Sản phẩm ({products.filter(p => prodSel[p.id]).length} chọn) {loadingProd && '⏳'}</label>
              <div style={{ maxHeight: 160, overflowY: 'auto', border: '1.5px solid #e2e8f0', borderRadius: 9, marginTop: 4 }}>
                {products.length === 0 && !loadingProd && <div style={{ padding: 12, color: '#94a3b8', fontSize: '0.8rem' }}>Không tải được SP shop này.</div>}
                {products.map(p => (
                  <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderBottom: '1px solid #f1f5f9', cursor: 'pointer', fontSize: '0.8rem' }}>
                    <input type="checkbox" checked={!!prodSel[p.id]} onChange={() => setProdSel(s => ({ ...s, [p.id]: !s[p.id] }))} style={{ accentColor: ACCENT }} />
                    {p.image && <img src={p.image} alt="" style={{ width: 26, height: 26, borderRadius: 5, objectFit: 'cover' }} />}
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name || p.title || p.id}</span>
                  </label>
                ))}
              </div>
            </div>
            <div><label style={{ fontSize: '0.76rem', fontWeight: 700, color: '#64748b' }}>Lời nhắn kèm (tuỳ chọn)</label><input value={collabMsg} onChange={e => setCollabMsg(e.target.value)} placeholder="Lời mời gửi KOC" style={inp} /></div>
            <div><label style={{ fontSize: '0.76rem', fontWeight: 700, color: '#64748b' }}>Email liên hệ (TikTok bắt buộc)</label><input value={email} onChange={e => setEmail(e.target.value)} style={inp} /></div>
          </div>
        )}

        {log.length > 0 && (
          <div style={{ marginTop: 14, maxHeight: 180, overflowY: 'auto', background: '#f8fafc', borderRadius: 9, padding: 10, fontSize: '0.78rem' }}>
            <div style={{ fontWeight: 800, marginBottom: 6, color: okCount === log.length ? '#16a34a' : '#b45309' }}>Kết quả: {okCount}/{log.length} OK</div>
            {log.map((l, i) => <div key={i} style={{ color: l.ok ? '#16a34a' : '#dc2626' }}>{l.ok ? '✅' : '❌'} @{l.u} — {l.msg}</div>)}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
          <button onClick={onClose} style={{ ...inp, width: 'auto', flex: '0 0 auto', cursor: 'pointer', background: '#fff', fontWeight: 700 }}>Đóng</button>
          {log.length > 0 && !busy
            ? <button onClick={onDone} style={{ flex: 1, padding: '11px', borderRadius: 10, border: 'none', background: '#16a34a', color: '#fff', fontWeight: 800, cursor: 'pointer' }}>Xong ✓</button>
            : <button onClick={tab === 'im' ? sendIm : sendCollab} disabled={busy} style={{ flex: 1, padding: '11px', borderRadius: 10, border: 'none', background: ACCENT, color: '#fff', fontWeight: 800, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1 }}>
                {busy ? '⏳ Đang gửi...' : (tab === 'im' ? `Gửi tin cho ${selRows.length} KOC` : `Tạo chiến dịch mời ${selRows.length} KOC`)}
              </button>}
        </div>
      </div>
    </div>
  );
}
