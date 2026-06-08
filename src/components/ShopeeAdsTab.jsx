import { useState, useCallback, useMemo, Fragment } from 'react';

/* ── Formatters ──────────────────────────────────────────────────── */
function fmtVND(n) {
  return (Math.round(n || 0)).toLocaleString('vi-VN') + 'đ';
}
function fmtNum(n) {
  return (Math.round(n || 0)).toLocaleString('vi-VN');
}
function fmtPct(n) {
  return ((n || 0) * 100).toFixed(2) + '%';
}
function fmtRoas(n) {
  if (!n || !Number.isFinite(n)) return '—';
  return n.toFixed(2) + 'x';
}
function fmtDateVN(s) {
  if (!s) return '—';
  // Shopee returns DD-MM-YYYY
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(s);
  if (m) return `${m[1]}/${m[2]}`;
  return s;
}
function fmtSyncTime(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())} ${p(d.getDate())}/${p(d.getMonth() + 1)}`;
}

const DAYS_OPTIONS = [
  { value: 7, label: '7 ngày' },
  { value: 14, label: '14 ngày' },
  { value: 30, label: '30 ngày' },
];

/* ── Component ───────────────────────────────────────────────────── */
export default function ShopeeAdsTab() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [shops, setShops] = useState([]);
  const [meta, setMeta] = useState(null);
  const [hasFetched, setHasFetched] = useState(false);
  const [days, setDays] = useState(7);
  const [mode, setMode] = useState('summary');     // 'summary' | 'campaigns'
  const [expanded, setExpanded] = useState(null);  // shop_id whose daily rows are open

  const fetchAds = useCallback(async (nextDays = days, nextMode = mode) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/shopee/flash-sale?action=ads&mode=${nextMode}&days=${nextDays}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!data.success) throw new Error(data.error || data.message || 'Lỗi tải dữ liệu');
      setShops(data.shops || []);
      setMeta({ start_date: data.start_date, end_date: data.end_date, days: data.days });
      setHasFetched(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [days, mode]);

  /* Aggregate KPIs across all shops */
  const agg = useMemo(() => {
    const t = { expense: 0, gmv: 0, clicks: 0, impression: 0, orders: 0, balance: 0 };
    for (const s of shops) {
      if (s.error) continue;
      t.expense += s.totals?.expense || 0;
      t.gmv += s.totals?.gmv || 0;
      t.clicks += s.totals?.clicks || 0;
      t.impression += s.totals?.impression || 0;
      t.orders += s.totals?.orders || 0;
      t.balance += s.balance || 0;
    }
    t.roas = t.expense > 0 ? t.gmv / t.expense : 0;
    t.ctr = t.impression > 0 ? t.clicks / t.impression : 0;
    return t;
  }, [shops]);

  const okShops = shops.filter((s) => !s.error);
  const errShops = shops.filter((s) => s.error);

  /* ── Styles ── */
  const card = { background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', padding: '20px 24px', boxShadow: '0 1px 2px rgba(15,23,42,0.04)' };
  const th = { padding: '10px 12px', fontSize: '0.72rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '2px solid #e5e7eb', textAlign: 'right', background: '#f8fafc', whiteSpace: 'nowrap' };
  const thL = { ...th, textAlign: 'left' };
  const td = { padding: '10px 12px', fontSize: '0.84rem', color: '#0f172a', borderBottom: '1px solid #f1f5f9', textAlign: 'right', verticalAlign: 'middle', whiteSpace: 'nowrap' };
  const tdL = { ...td, textAlign: 'left' };

  const kpi = (label, value, sub, color = '#0f172a') => (
    <div style={card}>
      <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{label}</div>
      <div style={{ fontSize: '1.5rem', fontWeight: 900, color, marginTop: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: '0.74rem', color: '#94a3b8', marginTop: 2 }}>{sub}</div>}
    </div>
  );

  return (
    <div style={{ fontFamily: "'Outfit', sans-serif", maxWidth: 1400, margin: '0 auto', padding: '0 24px 40px' }}>
      {/* ── HEADER ── */}
      <div style={{ ...card, marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 900, color: '#0f172a' }}>📣 Shopee Ads (CPC)</h2>
            <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: '#64748b' }}>
              Chi phí, doanh thu &amp; ROAS quảng cáo từ tất cả shop Shopee
              {meta && <span style={{ marginLeft: 8, color: '#94a3b8' }}>· {meta.start_date} → {meta.end_date}</span>}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <select value={days} onChange={(e) => { const d = Number(e.target.value); setDays(d); if (hasFetched) fetchAds(d, mode); }}
              style={{ padding: '9px 12px', borderRadius: 8, border: '1.5px solid #e5e7eb', fontSize: '0.84rem', fontFamily: 'inherit', cursor: 'pointer', fontWeight: 600 }}>
              {DAYS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <button onClick={() => fetchAds(days, mode)} disabled={loading}
              style={{
                padding: '10px 24px', borderRadius: 8, border: 'none',
                background: loading ? '#d1d5db' : '#ff6a2c', color: '#fff',
                fontWeight: 800, fontSize: '0.88rem', cursor: loading ? 'default' : 'pointer',
                boxShadow: loading ? 'none' : '0 4px 12px rgba(255,106,44,0.18)', fontFamily: 'inherit',
              }}>
              {loading ? '⏳ Đang tải...' : hasFetched ? '🔄 Tải lại' : '📥 Tải dữ liệu Ads'}
            </button>
          </div>
        </div>
        {/* mode toggle */}
        {hasFetched && (
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            {[['summary', '📊 Tổng quan'], ['campaigns', '🎯 Theo Campaign']].map(([m, lbl]) => (
              <button key={m} onClick={() => { setMode(m); fetchAds(days, m); }}
                style={{
                  padding: '7px 16px', borderRadius: 8, fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                  border: `1.5px solid ${mode === m ? '#ff6a2c' : '#e5e7eb'}`,
                  background: mode === m ? '#fff7ed' : '#fff', color: mode === m ? '#e85518' : '#64748b',
                }}>
                {lbl}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── ERROR ── */}
      {error && (
        <div style={{ ...card, marginBottom: 20, background: '#fef2f2', borderColor: '#fca5a5' }}>
          <span style={{ color: '#dc2626', fontWeight: 700, fontSize: '0.85rem' }}>❌ {error}</span>
        </div>
      )}

      {/* ── EMPTY STATE ── */}
      {!hasFetched && !loading && !error && (
        <div style={{ ...card, textAlign: 'center', padding: 60 }}>
          <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>📣</div>
          <div style={{ fontWeight: 700, color: '#64748b' }}>Bấm "Tải dữ liệu Ads" để xem chi phí quảng cáo từ tất cả shop</div>
        </div>
      )}

      {loading && !hasFetched && (
        <div style={{ ...card, textAlign: 'center', padding: 60 }}>
          <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>⏳</div>
          <div style={{ fontWeight: 700, color: '#64748b' }}>Đang tải dữ liệu quảng cáo...</div>
        </div>
      )}

      {/* ── DATA ── */}
      {hasFetched && (
        <>
          {/* KPI cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 12, marginBottom: 20 }}>
            {kpi('Chi phí QC', fmtVND(agg.expense), `${okShops.length} shop`, '#dc2626')}
            {kpi('Doanh thu Ads', fmtVND(agg.gmv), 'GMV quy cho QC', '#16a34a')}
            {kpi('ROAS', fmtRoas(agg.roas), 'Doanh thu / Chi phí', '#7c3aed')}
            {kpi('Đơn từ Ads', fmtNum(agg.orders), null, '#0f172a')}
            {kpi('Lượt click', fmtNum(agg.clicks), `CTR ${fmtPct(agg.ctr)}`, '#2563eb')}
            {kpi('Số dư QC', fmtVND(agg.balance), 'Tổng tất cả shop', '#ff6a2c')}
          </div>

          {/* Shop errors */}
          {errShops.length > 0 && (
            <div style={{ ...card, marginBottom: 20, background: '#fffbeb', borderColor: '#fde68a' }}>
              <h4 style={{ margin: '0 0 8px', fontSize: '0.82rem', fontWeight: 800, color: '#92400e' }}>⚠️ Lỗi một số shop</h4>
              {errShops.map((s) => (
                <div key={s.shop_id} style={{ fontSize: '0.78rem', color: '#92400e', marginBottom: 4 }}>
                  <b>{s.shop_name}</b>: {s.error}
                </div>
              ))}
            </div>
          )}

          {/* SUMMARY MODE: per-shop table */}
          {mode === 'summary' && (
            <div style={{ ...card, overflow: 'hidden', padding: 0 }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={thL}>Shop</th>
                      <th style={th}>Chi phí</th>
                      <th style={th}>Doanh thu</th>
                      <th style={th}>ROAS</th>
                      <th style={th}>Đơn</th>
                      <th style={th}>Click</th>
                      <th style={th}>CTR</th>
                      <th style={th}>CPC</th>
                      <th style={th}>Số dư</th>
                    </tr>
                  </thead>
                  <tbody>
                    {okShops.length === 0 ? (
                      <tr><td colSpan={9} style={{ ...tdL, textAlign: 'center', padding: 40, color: '#94a3b8', fontStyle: 'italic' }}>Không có dữ liệu</td></tr>
                    ) : okShops.map((s) => {
                      const t = s.totals || {};
                      const open = expanded === s.shop_id;
                      return (
                        <Fragment key={s.shop_id}>
                          <tr onClick={() => setExpanded(open ? null : s.shop_id)}
                            style={{ cursor: 'pointer', background: open ? '#fff7ed' : 'transparent' }}
                            onMouseEnter={(e) => { if (!open) e.currentTarget.style.background = '#f8fafc'; }}
                            onMouseLeave={(e) => { if (!open) e.currentTarget.style.background = 'transparent'; }}>
                            <td style={{ ...tdL, fontWeight: 700 }}>
                              <span style={{ color: '#94a3b8', marginRight: 6 }}>{open ? '▾' : '▸'}</span>
                              {s.shop_name}
                              {s.toggle_on === false && <span style={{ marginLeft: 6, fontSize: '0.68rem', color: '#dc2626' }}>(QC tắt)</span>}
                            </td>
                            <td style={{ ...td, fontWeight: 700, color: '#dc2626' }}>{fmtVND(t.expense)}</td>
                            <td style={{ ...td, color: '#16a34a' }}>{fmtVND(t.gmv)}</td>
                            <td style={{ ...td, fontWeight: 700, color: '#7c3aed' }}>{fmtRoas(t.roas)}</td>
                            <td style={td}>{fmtNum(t.orders)}</td>
                            <td style={td}>{fmtNum(t.clicks)}</td>
                            <td style={td}>{fmtPct(t.ctr)}</td>
                            <td style={td}>{fmtVND(t.cpc)}</td>
                            <td style={{ ...td, color: '#ff6a2c', fontWeight: 600 }}>{fmtVND(s.balance)}</td>
                          </tr>
                          {open && (
                            <tr>
                              <td colSpan={9} style={{ padding: 0, background: '#fafafa', borderBottom: '1px solid #f1f5f9' }}>
                                <DailyTable daily={s.daily} />
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* CAMPAIGNS MODE */}
          {mode === 'campaigns' && (
            <div style={{ display: 'grid', gap: 16 }}>
              {okShops.map((s) => {
                const camps = s.campaigns?.campaigns || [];
                return (
                  <div key={s.shop_id} style={{ ...card, padding: 0, overflow: 'hidden' }}>
                    <div style={{ padding: '12px 18px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <h3 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 800, color: '#0f172a' }}>🏪 {s.shop_name}</h3>
                      <span style={{ fontSize: '0.76rem', color: '#64748b' }}>
                        {camps.length} campaign · Chi phí {fmtVND(s.totals?.expense)}
                        {fmtSyncTime(s.campaigns?.synced_at) && (
                          <span style={{ color: '#94a3b8' }}> · Đồng bộ {fmtSyncTime(s.campaigns.synced_at)}</span>
                        )}
                      </span>
                    </div>
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr>
                            <th style={thL}>Campaign</th>
                            <th style={th}>Chi phí</th>
                            <th style={th}>Doanh thu</th>
                            <th style={th}>ROAS</th>
                            <th style={th}>Đơn</th>
                            <th style={th}>Click</th>
                            <th style={th}>CTR</th>
                          </tr>
                        </thead>
                        <tbody>
                          {camps.length === 0 ? (
                            <tr><td colSpan={7} style={{ ...tdL, textAlign: 'center', padding: 24, color: '#94a3b8', fontStyle: 'italic' }}>
                              {s.campaigns?.note || 'Không có campaign nào đang chạy'}
                            </td></tr>
                          ) : camps.map((c) => {
                            const t = c.totals || {};
                            return (
                              <tr key={c.campaign_id}>
                                <td style={{ ...tdL, fontWeight: 600 }}>{c.campaign_name}<div style={{ fontSize: '0.68rem', color: '#94a3b8' }}>#{c.campaign_id}</div></td>
                                <td style={{ ...td, fontWeight: 700, color: '#dc2626' }}>{fmtVND(t.expense)}</td>
                                <td style={{ ...td, color: '#16a34a' }}>{fmtVND(t.gmv)}</td>
                                <td style={{ ...td, fontWeight: 700, color: '#7c3aed' }}>{fmtRoas(t.roas)}</td>
                                <td style={td}>{fmtNum(t.orders)}</td>
                                <td style={td}>{fmtNum(t.clicks)}</td>
                                <td style={td}>{fmtPct(t.ctr)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ── Daily breakdown sub-table ───────────────────────────────────── */
function DailyTable({ daily }) {
  const th = { padding: '7px 12px', fontSize: '0.68rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', textAlign: 'right', whiteSpace: 'nowrap' };
  const thL = { ...th, textAlign: 'left' };
  const td = { padding: '7px 12px', fontSize: '0.78rem', color: '#475569', textAlign: 'right', borderTop: '1px solid #f1f5f9', whiteSpace: 'nowrap' };
  const tdL = { ...td, textAlign: 'left' };
  if (!daily || daily.length === 0) {
    return <div style={{ padding: '14px 18px', fontSize: '0.78rem', color: '#94a3b8', fontStyle: 'italic' }}>Không có dữ liệu theo ngày</div>;
  }
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr>
          <th style={thL}>Ngày</th>
          <th style={th}>Chi phí</th>
          <th style={th}>Doanh thu</th>
          <th style={th}>ROAS</th>
          <th style={th}>Đơn</th>
          <th style={th}>Click</th>
          <th style={th}>Hiển thị</th>
          <th style={th}>CTR</th>
        </tr>
      </thead>
      <tbody>
        {daily.map((d, i) => (
          <tr key={d.date || i}>
            <td style={tdL}>{fmtDateVN(d.date)}</td>
            <td style={{ ...td, color: '#dc2626' }}>{fmtVND(d.expense)}</td>
            <td style={{ ...td, color: '#16a34a' }}>{fmtVND(d.gmv)}</td>
            <td style={td}>{fmtRoas(d.roas)}</td>
            <td style={td}>{fmtNum(d.orders)}</td>
            <td style={td}>{fmtNum(d.clicks)}</td>
            <td style={td}>{fmtNum(d.impression)}</td>
            <td style={td}>{fmtPct(d.ctr)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
