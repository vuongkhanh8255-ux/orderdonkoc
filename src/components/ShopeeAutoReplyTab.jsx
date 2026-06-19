import { useState, useEffect, useCallback } from 'react';

const API = '/api/shopee/top-picks';
const ACCENT = '#ff6a2c';

const fmtTime = (ts) => { try { return new Date(ts).toLocaleString('vi-VN'); } catch { return ts; } };

export default function ShopeeAutoReplyTab() {
  const [shops, setShops] = useState([]);
  const [defaultTpl, setDefaultTpl] = useState('');
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [runningId, setRunningId] = useState(null);
  const [msg, setMsg] = useState('');
  const [log, setLog] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}?action=review_settings`).then((x) => x.json());
      if (r.ok) { setShops(r.data.shops || []); setDefaultTpl(r.data.default_template || ''); }
      else setMsg('Lỗi tải cài đặt: ' + (r.error || ''));
      const lg = await fetch(`${API}?action=review_log&limit=30`).then((x) => x.json());
      if (lg.ok) setLog(lg.data || []);
    } catch (e) { setMsg('Lỗi tải: ' + e.message); }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const update = (id, patch) => setShops((prev) => prev.map((s) => (s.shop_id === id ? { ...s, ...patch } : s)));

  const save = async (s) => {
    setSavingId(s.shop_id); setMsg('');
    try {
      const r = await fetch(`${API}?action=review_settings_save`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shop_id: s.shop_id, enabled: s.enabled, template: s.template }),
      }).then((x) => x.json());
      setMsg(r.ok ? `✅ Đã lưu cài đặt cho ${s.shop_name}` : 'Lỗi lưu: ' + (r.error || ''));
    } catch (e) { setMsg('Lỗi: ' + e.message); }
    setSavingId(null);
  };

  const runNow = async (s) => {
    if (!confirm(`Trả lời NGAY các đánh giá ≥4★ chưa trả lời của "${s.shop_name}"?\n(Đánh giá ≤3★ sẽ được bỏ qua để bạn tự xử)`)) return;
    setRunningId(s.shop_id); setMsg('⏳ Đang trả lời, chờ chút…');
    try {
      const r = await fetch(`${API}?action=review_run_now&shop_id=${s.shop_id}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}),
      }).then((x) => x.json());
      if (r.ok) { setMsg(`✅ ${s.shop_name}: đã trả lời ${r.data?.da_tra_loi || 0} đánh giá (quét ${r.data?.quet || 0}).`); load(); }
      else setMsg('Lỗi: ' + (r.error || r.message || ''));
    } catch (e) { setMsg('Lỗi: ' + e.message); }
    setRunningId(null);
  };

  const card = { background: '#fff', border: '1px solid #eef0f6', borderRadius: 14, padding: '16px 18px', boxShadow: '0 6px 18px -12px rgba(15,23,42,0.18)' };
  const btn = (bg, color, bd) => ({ padding: '8px 16px', borderRadius: 9, border: `1px solid ${bd}`, background: bg, color, fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' });

  return (
    <div style={{ padding: '20px 24px', maxWidth: 1100, margin: '0 auto', fontFamily: "'Outfit', sans-serif" }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 900, color: '#0f172a', margin: '0 0 4px' }}>💬 Tự trả lời đánh giá</h1>
      <p style={{ fontSize: '0.82rem', color: '#94a3b8', margin: '0 0 16px' }}>
        Bật cho shop nào thì hệ thống tự trả lời đánh giá <b>≥ 4★</b> chưa trả lời (mỗi ~30 phút). Đánh giá <b>≤ 3★</b> luôn được bỏ qua để bạn tự xử lý.
      </p>

      {msg && <div style={{ marginBottom: 14, padding: '10px 14px', borderRadius: 10, background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', fontSize: '0.84rem' }}>{msg}</div>}

      {loading ? <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>⏳ Đang tải…</div> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {shops.length === 0 && <div style={{ ...card, textAlign: 'center', color: '#94a3b8' }}>Chưa có shop Shopee nào kết nối.</div>}
          {shops.map((s) => (
            <div key={s.shop_id} style={card}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontWeight: 800, fontSize: '0.98rem', color: '#0f172a' }}>🛒 {s.shop_name}</span>
                  <span style={{ fontSize: '0.72rem', padding: '3px 10px', borderRadius: 999, fontWeight: 700, background: s.enabled ? '#f0fdf4' : '#f1f5f9', color: s.enabled ? '#16a34a' : '#64748b' }}>
                    {s.enabled ? '🟢 Đang bật' : '⚪ Đang tắt'}
                  </span>
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.84rem', fontWeight: 700, color: '#475569' }}>
                  <input type="checkbox" checked={!!s.enabled} onChange={(e) => update(s.shop_id, { enabled: e.target.checked })} style={{ width: 18, height: 18, cursor: 'pointer' }} />
                  Tự động trả lời
                </label>
              </div>
              <div style={{ fontSize: '0.74rem', color: '#94a3b8', marginBottom: 4 }}>Lời trả lời mẫu (để trống = dùng mẫu mặc định):</div>
              <textarea value={s.template} onChange={(e) => update(s.shop_id, { template: e.target.value })} rows={3}
                placeholder={defaultTpl}
                style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 9, border: '1.5px solid #e5e7eb', fontSize: '0.84rem', fontFamily: 'inherit', resize: 'vertical' }} />
              <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                <button onClick={() => save(s)} disabled={savingId === s.shop_id} style={btn(ACCENT, '#fff', ACCENT)}>
                  {savingId === s.shop_id ? '⏳ Đang lưu…' : '💾 Lưu cài đặt'}
                </button>
                <button onClick={() => runNow(s)} disabled={runningId === s.shop_id} style={btn('#fff', '#0891b2', '#a5f3fc')}>
                  {runningId === s.shop_id ? '⏳ Đang trả lời…' : '▶️ Trả lời ngay các đánh giá tốt'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {log.length > 0 && (
        <div style={{ ...card, marginTop: 20 }}>
          <h3 style={{ margin: '0 0 10px', fontSize: '0.92rem', fontWeight: 800, color: '#0f172a' }}>🕘 Đã trả lời gần đây ({log.length})</h3>
          <div style={{ maxHeight: 280, overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
              <thead><tr style={{ background: '#f8fafc', textAlign: 'left' }}>
                <th style={{ padding: '6px 8px' }}>Đánh giá (comment_id)</th><th style={{ padding: '6px 8px' }}>Shop</th><th style={{ padding: '6px 8px' }}>Sao</th><th style={{ padding: '6px 8px' }}>Lúc</th>
              </tr></thead>
              <tbody>
                {log.map((r) => (
                  <tr key={r.comment_id} style={{ borderTop: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '6px 8px', color: '#64748b' }}>{r.comment_id}</td>
                    <td style={{ padding: '6px 8px' }}>{r.shop_id}</td>
                    <td style={{ padding: '6px 8px' }}>{r.rating_star ? `${r.rating_star}★` : '—'}</td>
                    <td style={{ padding: '6px 8px', color: '#94a3b8' }}>{fmtTime(r.replied_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
