import { useState, useEffect, useCallback } from 'react';

const API = '/api/shopee/top-picks';
const ACCENT = '#ff6a2c';

const fmtDT = (sec) => { try { return new Date((Number(sec) || 0) * 1000).toLocaleString('vi-VN'); } catch { return ''; } };
const stars = (n) => '★'.repeat(Math.max(0, Math.min(5, Number(n) || 0))) + '☆'.repeat(5 - Math.max(0, Math.min(5, Number(n) || 0)));

export default function ShopeeAutoReplyTab() {
  const [shops, setShops] = useState([]);
  const [defaultTpl, setDefaultTpl] = useState('');
  const [shopId, setShopId] = useState('');
  const [reviews, setReviews] = useState([]);
  const [counts, setCounts] = useState({ total: 0, replied: 0, unreplied: 0 });
  const [tab, setTab] = useState('all');          // all | replied | unreplied
  const [search, setSearch] = useState('');
  const [loadingShops, setLoadingShops] = useState(true);
  const [loadingRv, setLoadingRv] = useState(false);
  const [savingSet, setSavingSet] = useState(false);
  const [replyingId, setReplyingId] = useState(null);
  const [runningAll, setRunningAll] = useState(false);
  const [msg, setMsg] = useState('');

  const curShop = shops.find((s) => s.shop_id === shopId) || null;

  const loadShops = useCallback(async () => {
    setLoadingShops(true);
    try {
      const r = await fetch(`${API}?action=review_settings`).then((x) => x.json());
      if (r.ok) {
        setShops(r.data.shops || []); setDefaultTpl(r.data.default_template || '');
        if (!shopId && r.data.shops?.length) setShopId(r.data.shops[0].shop_id);
      } else setMsg('Lỗi tải shop: ' + (r.error || ''));
    } catch (e) { setMsg('Lỗi: ' + e.message); }
    setLoadingShops(false);
  }, [shopId]);
  useEffect(() => { loadShops(); }, []); // eslint-disable-line

  const loadReviews = useCallback(async (sid) => {
    if (!sid) return;
    setLoadingRv(true); setReviews([]);
    try {
      const r = await fetch(`${API}?action=review_list&shop_id=${sid}`).then((x) => x.json());
      if (r.ok) { setReviews(r.data.reviews || []); setCounts({ total: r.data.total || 0, replied: r.data.replied || 0, unreplied: r.data.unreplied || 0 }); }
      else { setMsg('Lỗi tải đánh giá: ' + (r.error || r.message || '')); }
    } catch (e) { setMsg('Lỗi: ' + e.message); }
    setLoadingRv(false);
  }, []);
  useEffect(() => { if (shopId) loadReviews(shopId); }, [shopId, loadReviews]);

  const updateCur = (patch) => setShops((prev) => prev.map((s) => (s.shop_id === shopId ? { ...s, ...patch } : s)));

  const saveSettings = async () => {
    if (!curShop) return;
    setSavingSet(true); setMsg('');
    try {
      const r = await fetch(`${API}?action=review_settings_save`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ shop_id: curShop.shop_id, enabled: curShop.enabled, template: curShop.template }) }).then((x) => x.json());
      setMsg(r.ok ? '✅ Đã lưu cài đặt' : 'Lỗi lưu: ' + (r.error || ''));
    } catch (e) { setMsg('Lỗi: ' + e.message); }
    setSavingSet(false);
  };

  const replyOne = async (rv) => {
    setReplyingId(rv.comment_id); setMsg('');
    try {
      const body = { comment_id: rv.comment_id };
      if (curShop?.template) body.comment = curShop.template;
      const r = await fetch(`${API}?action=reply_comment&shop_id=${shopId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((x) => x.json());
      if (r.ok) {
        const txt = curShop?.template || defaultTpl;
        setReviews((prev) => prev.map((x) => (x.comment_id === rv.comment_id ? { ...x, replied: true, reply_text: txt } : x)));
        setCounts((c) => ({ ...c, replied: c.replied + 1, unreplied: Math.max(0, c.unreplied - 1) }));
      } else setMsg('Lỗi trả lời: ' + (r.error || r.message || ''));
    } catch (e) { setMsg('Lỗi: ' + e.message); }
    setReplyingId(null);
  };

  const runAll = async () => {
    if (!curShop) return;
    if (!confirm(`Trả lời NGAY tất cả đánh giá ≥4★ chưa trả lời của "${curShop.shop_name}"?`)) return;
    setRunningAll(true); setMsg('⏳ Đang trả lời hàng loạt…');
    try {
      const r = await fetch(`${API}?action=review_run_now&shop_id=${shopId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) }).then((x) => x.json());
      if (r.ok) { setMsg(`✅ Đã trả lời ${r.data?.da_tra_loi || 0} đánh giá.`); loadReviews(shopId); }
      else setMsg('Lỗi: ' + (r.error || r.message || ''));
    } catch (e) { setMsg('Lỗi: ' + e.message); }
    setRunningAll(false);
  };

  const shown = reviews.filter((r) => {
    if (tab === 'replied' && !r.replied) return false;
    if (tab === 'unreplied' && r.replied) return false;
    if (search && !(`${r.order_sn} ${r.buyer_username} ${r.product_name}`.toLowerCase().includes(search.toLowerCase()))) return false;
    return true;
  });

  const sel = { padding: '8px 12px', borderRadius: 9, border: '1.5px solid #e5e7eb', fontSize: '0.85rem', fontWeight: 600, background: '#fff', cursor: 'pointer' };
  const tabBtn = (active) => ({ padding: '7px 16px', borderRadius: 9, border: 'none', background: active ? ACCENT : 'transparent', color: active ? '#fff' : '#64748b', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' });
  const th = { padding: '10px 12px', textAlign: 'left', fontSize: '0.72rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', borderBottom: '1px solid #eef0f6', whiteSpace: 'nowrap' };
  const td = { padding: '12px', fontSize: '0.8rem', color: '#0f172a', borderBottom: '1px solid #f4f6fa', verticalAlign: 'top' };

  return (
    <div style={{ padding: '20px 24px', maxWidth: 1280, margin: '0 auto', fontFamily: "'Outfit', sans-serif" }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 900, color: '#0f172a', margin: '0 0 4px' }}>💬 Tự trả lời đánh giá</h1>
      <p style={{ fontSize: '0.82rem', color: '#94a3b8', margin: '0 0 14px' }}>
        Bật auto cho shop → tự trả lời đánh giá <b>≥4★</b> chưa trả lời (mỗi ~30 phút). <b>≤3★</b> luôn bỏ qua để bạn tự xử.
      </p>

      {msg && <div style={{ marginBottom: 12, padding: '10px 14px', borderRadius: 10, background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', fontSize: '0.84rem' }}>{msg}</div>}

      {/* Thanh điều khiển: chọn shop + cài đặt auto */}
      {loadingShops ? <div style={{ padding: 30, textAlign: 'center', color: '#94a3b8' }}>⏳ Đang tải…</div> : (
        <div style={{ background: 'linear-gradient(135deg, #fff6f0, #ffffff 60%)', border: '1px solid #ffe2d2', borderRadius: 14, padding: '14px 18px', marginBottom: 16, boxShadow: '0 6px 18px -12px rgba(255,106,44,0.3)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#475569' }}>🛒 Cửa hàng:</span>
              <select value={shopId} onChange={(e) => setShopId(e.target.value)} style={sel}>
                {shops.map((s) => <option key={s.shop_id} value={s.shop_id}>{s.shop_name}</option>)}
              </select>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.84rem', fontWeight: 700, color: curShop?.enabled ? '#16a34a' : '#64748b' }}>
              <input type="checkbox" checked={!!curShop?.enabled} onChange={(e) => updateCur({ enabled: e.target.checked })} style={{ width: 18, height: 18, cursor: 'pointer' }} />
              {curShop?.enabled ? '🟢 Auto đang BẬT' : '⚪ Auto đang TẮT'}
            </label>
            <button onClick={saveSettings} disabled={savingSet} style={{ padding: '8px 16px', borderRadius: 9, border: 'none', background: ACCENT, color: '#fff', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}>
              {savingSet ? '⏳…' : '💾 Lưu'}
            </button>
            <button onClick={runAll} disabled={runningAll} style={{ padding: '8px 16px', borderRadius: 9, border: '1px solid #a5f3fc', background: '#fff', color: '#0891b2', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer', marginLeft: 'auto' }}>
              {runningAll ? '⏳ Đang chạy…' : '▶️ Trả lời ngay đánh giá tốt'}
            </button>
          </div>
          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginBottom: 3 }}>Lời trả lời mẫu (để trống = mẫu mặc định):</div>
            <textarea value={curShop?.template || ''} onChange={(e) => updateCur({ template: e.target.value })} rows={2} placeholder={defaultTpl}
              style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 9, border: '1.5px solid #e5e7eb', fontSize: '0.82rem', fontFamily: 'inherit', resize: 'vertical' }} />
          </div>
        </div>
      )}

      {/* Tabs + tìm kiếm */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 4, background: '#f1f5f9', borderRadius: 10, padding: 4 }}>
          <button style={tabBtn(tab === 'all')} onClick={() => setTab('all')}>Tất cả ({counts.total})</button>
          <button style={tabBtn(tab === 'replied')} onClick={() => setTab('replied')}>Đã trả lời ({counts.replied})</button>
          <button style={tabBtn(tab === 'unreplied')} onClick={() => setTab('unreplied')}>Chưa trả lời ({counts.unreplied})</button>
        </div>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔎 Tìm mã đơn / người mua / sản phẩm…"
          style={{ padding: '8px 12px', borderRadius: 9, border: '1.5px solid #e5e7eb', fontSize: '0.82rem', minWidth: 260, flex: 1, maxWidth: 360 }} />
        <button onClick={() => loadReviews(shopId)} disabled={loadingRv} style={{ ...sel, background: '#f8fafc' }}>🔄 Tải lại</button>
      </div>

      {/* Bảng đánh giá */}
      <div style={{ background: '#fff', border: '1px solid #eef0f6', borderRadius: 14, overflow: 'hidden', boxShadow: '0 6px 18px -12px rgba(15,23,42,0.18)' }}>
        {loadingRv ? <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>⏳ Đang tải đánh giá…</div>
          : shown.length === 0 ? <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>Không có đánh giá nào.</div>
          : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr style={{ background: 'linear-gradient(135deg, #fff1e9, #f5f6fb)' }}>
                <th style={th}>Thời gian</th><th style={th}>Đánh giá</th><th style={th}>Sản phẩm</th><th style={th}>Đơn hàng</th><th style={th}>Trả lời</th>
              </tr></thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.comment_id}>
                    <td style={{ ...td, whiteSpace: 'nowrap', color: '#64748b', fontSize: '0.74rem' }}>{fmtDT(r.create_time)}</td>
                    <td style={td}>
                      <div style={{ color: '#f59e0b', fontSize: '0.92rem', letterSpacing: 1 }}>{stars(r.rating_star)}</div>
                      {r.comment && <div style={{ marginTop: 4, color: '#334155', maxWidth: 240, whiteSpace: 'pre-wrap', fontSize: '0.78rem' }}>{r.comment}</div>}
                    </td>
                    <td style={td}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', maxWidth: 240 }}>
                        {r.product_image && <img src={r.product_image} alt="" style={{ width: 38, height: 38, borderRadius: 7, objectFit: 'cover', flexShrink: 0 }} />}
                        <span style={{ fontSize: '0.76rem', color: '#0f172a', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{r.product_name || `SP #${r.item_id}`}</span>
                      </div>
                    </td>
                    <td style={{ ...td, fontSize: '0.74rem', color: '#64748b', whiteSpace: 'nowrap' }}>
                      <div style={{ color: ACCENT, fontWeight: 700 }}>{r.order_sn || '—'}</div>
                      <div>{r.buyer_username}</div>
                    </td>
                    <td style={{ ...td, minWidth: 220, maxWidth: 320 }}>
                      {r.replied
                        ? <div style={{ fontSize: '0.76rem', color: '#16a34a' }}><b>✓ Đã trả lời</b>{r.reply_text && <div style={{ color: '#475569', marginTop: 3, whiteSpace: 'pre-wrap' }}>{r.reply_text}</div>}</div>
                        : r.rating_star >= 4
                          ? <button onClick={() => replyOne(r)} disabled={replyingId === r.comment_id} style={{ padding: '7px 14px', borderRadius: 8, border: 'none', background: ACCENT, color: '#fff', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer' }}>{replyingId === r.comment_id ? '⏳…' : '💬 Trả lời'}</button>
                          : <span style={{ fontSize: '0.74rem', color: '#ef4444' }}>≤3★ — tự xử lý</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
