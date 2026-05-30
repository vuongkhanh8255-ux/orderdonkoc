import { useState, useCallback, useMemo, useEffect } from 'react';
import {
  ResponsiveContainer, BarChart, Bar, AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, LabelList,
} from 'recharts';

/* ── Formatters ──────────────────────────────────────────────────── */
function fmtVND(n) {
  const v = Number(n) || 0;
  if (Math.abs(v) >= 1e9) return `${(v / 1e9).toFixed(2)} tỷ`;
  if (Math.abs(v) >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (Math.abs(v) >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
  return v.toLocaleString('vi-VN');
}
function fmtVNDfull(n) { return (Math.round(Number(n) || 0)).toLocaleString('vi-VN') + 'đ'; }
function fmtNum(n) { return (Math.round(Number(n) || 0)).toLocaleString('vi-VN'); }
function fmtPct(n) { return ((Number(n) || 0) * 100).toFixed(2) + '%'; }
function fmtRoas(n) { return (!n || !Number.isFinite(n)) ? '—' : n.toFixed(2) + 'x'; }

const SHOP_COLORS = ['#ea580c', '#2563eb', '#16a34a', '#8b5cf6', '#db2777', '#0891b2', '#d97706', '#0d9488'];
const DAYS_OPTIONS = [{ value: 7, label: '7 ngày' }, { value: 14, label: '14 ngày' }, { value: 30, label: '30 ngày' }];

const card = { background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', padding: '18px 20px', boxShadow: '0 1px 2px rgba(15,23,42,0.04)' };

/* sort key for Shopee DD-MM-YYYY dates */
const dkey = (s) => { const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(s || ''); return m ? `${m[3]}${m[2]}${m[1]}` : s; };

/* ── Component ───────────────────────────────────────────────────── */
export default function ShopeeAdsDashboard() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [shops, setShops] = useState([]);
  const [meta, setMeta] = useState(null);
  const [hasFetched, setHasFetched] = useState(false);
  const [days, setDays] = useState(7);

  const fetchAds = useCallback(async (nextDays = days) => {
    setLoading(true); setError('');
    try {
      const res = await fetch(`/api/shopee/flash-sale?action=ads&mode=summary&days=${nextDays}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!data.success) throw new Error(data.error || data.message || 'Lỗi tải dữ liệu');
      setShops(data.shops || []);
      setMeta({ start_date: data.start_date, end_date: data.end_date, days: data.days });
      setHasFetched(true);
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  }, [days]);

  useEffect(() => { fetchAds(days); /* eslint-disable-next-line */ }, []);

  const okShops = useMemo(() => shops.filter((s) => !s.error), [shops]);
  const errShops = useMemo(() => shops.filter((s) => s.error), [shops]);

  /* aggregate KPIs */
  const agg = useMemo(() => {
    const t = { expense: 0, gmv: 0, clicks: 0, impression: 0, orders: 0, balance: 0 };
    for (const s of okShops) {
      t.expense += s.totals?.expense || 0; t.gmv += s.totals?.gmv || 0;
      t.clicks += s.totals?.clicks || 0; t.impression += s.totals?.impression || 0;
      t.orders += s.totals?.orders || 0; t.balance += s.balance || 0;
    }
    t.roas = t.expense > 0 ? t.gmv / t.expense : 0;
    t.ctr = t.impression > 0 ? t.clicks / t.impression : 0;
    return t;
  }, [okShops]);

  /* per-shop rows for bar / pie charts (sorted by spend) */
  const perShop = useMemo(() => okShops.map((s, i) => ({
    name: s.shop_name || String(s.shop_id),
    short: (s.shop_name || String(s.shop_id)).length > 14 ? (s.shop_name).slice(0, 13) + '…' : (s.shop_name || String(s.shop_id)),
    expense: Math.round(s.totals?.expense || 0),
    gmv: Math.round(s.totals?.gmv || 0),
    roas: Number((s.totals?.roas || 0).toFixed(2)),
    orders: Math.round(s.totals?.orders || 0),
    clicks: Math.round(s.totals?.clicks || 0),
    color: SHOP_COLORS[i % SHOP_COLORS.length],
  })).sort((a, b) => b.expense - a.expense), [okShops]);

  /* daily trend merged across all shops */
  const trend = useMemo(() => {
    const map = new Map();
    for (const s of okShops) for (const d of (s.daily || [])) {
      if (!d.date) continue;
      const cur = map.get(d.date) || { date: d.date, expense: 0, gmv: 0 };
      cur.expense += d.expense || 0; cur.gmv += d.gmv || 0;
      map.set(d.date, cur);
    }
    return [...map.values()].sort((a, b) => (dkey(a.date) > dkey(b.date) ? 1 : -1))
      .map((d) => ({ label: (d.date || '').slice(0, 5), expense: Math.round(d.expense), gmv: Math.round(d.gmv) }));
  }, [okShops]);

  /* ── small pieces ── */
  const kpi = (label, value, sub, color = '#0f172a') => (
    <div style={card}>
      <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{label}</div>
      <div style={{ fontSize: '1.45rem', fontWeight: 900, color, marginTop: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: 2 }}>{sub}</div>}
    </div>
  );
  const chartCard = (title, subtitle, height, children) => (
    <div style={{ ...card, padding: '16px 18px' }}>
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#0f172a' }}>{title}</div>
        {subtitle && <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: 1 }}>{subtitle}</div>}
      </div>
      <ResponsiveContainer width="100%" height={height}>{children}</ResponsiveContainer>
    </div>
  );
  const axis = { fontSize: 11, fill: '#64748b' };

  return (
    <div style={{ fontFamily: "'Outfit', sans-serif", maxWidth: 1400, margin: '0 auto', padding: '0 24px 48px' }}>
      {/* HEADER */}
      <div style={{ ...card, marginBottom: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 900, color: '#0f172a' }}>📣 Ads Shopee — Dashboard</h2>
            <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: '#64748b' }}>
              So sánh hiệu quả quảng cáo {okShops.length} shop Shopee
              {meta && <span style={{ marginLeft: 8, color: '#94a3b8' }}>· {meta.start_date} → {meta.end_date}</span>}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <select value={days} onChange={(e) => { const d = Number(e.target.value); setDays(d); fetchAds(d); }}
              style={{ padding: '9px 12px', borderRadius: 8, border: '1.5px solid #e5e7eb', fontSize: '0.84rem', fontFamily: 'inherit', cursor: 'pointer', fontWeight: 600 }}>
              {DAYS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <button onClick={() => fetchAds(days)} disabled={loading}
              style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: loading ? '#d1d5db' : '#ea580c', color: '#fff', fontWeight: 800, fontSize: '0.86rem', cursor: loading ? 'default' : 'pointer', fontFamily: 'inherit' }}>
              {loading ? '⏳ Đang tải...' : '🔄 Tải lại'}
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div style={{ ...card, marginBottom: 18, background: '#fef2f2', borderColor: '#fca5a5' }}>
          <span style={{ color: '#dc2626', fontWeight: 700, fontSize: '0.85rem' }}>❌ {error}</span>
        </div>
      )}

      {loading && !hasFetched && (
        <div style={{ ...card, textAlign: 'center', padding: 60 }}>
          <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>⏳</div>
          <div style={{ fontWeight: 700, color: '#64748b' }}>Đang tải dữ liệu quảng cáo 6 shop...</div>
        </div>
      )}

      {hasFetched && (
        <>
          {/* KPI cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12, marginBottom: 18 }}>
            {kpi('Tổng chi phí QC', fmtVND(agg.expense), `${okShops.length} shop`, '#dc2626')}
            {kpi('Doanh thu Ads', fmtVND(agg.gmv), 'GMV quy cho QC', '#16a34a')}
            {kpi('ROAS chung', fmtRoas(agg.roas), 'Doanh thu / Chi phí', '#7c3aed')}
            {kpi('Tổng đơn Ads', fmtNum(agg.orders), null, '#0f172a')}
            {kpi('Tổng click', fmtNum(agg.clicks), `CTR ${fmtPct(agg.ctr)}`, '#2563eb')}
            {kpi('Tổng số dư', fmtVND(agg.balance), 'Ví QC tất cả shop', '#ea580c')}
          </div>

          {errShops.length > 0 && (
            <div style={{ ...card, marginBottom: 18, background: '#fffbeb', borderColor: '#fde68a' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#92400e' }}>⚠️ Lỗi {errShops.length} shop: </span>
              <span style={{ fontSize: '0.78rem', color: '#92400e' }}>{errShops.map((s) => s.shop_name || s.shop_id).join(', ')}</span>
            </div>
          )}

          {/* Trend full width */}
          <div style={{ marginBottom: 16 }}>
            {chartCard('Xu hướng theo ngày', 'Tổng chi phí & doanh thu Ads của tất cả shop', 280,
              <AreaChart data={trend} margin={{ top: 8, right: 12, bottom: 0, left: 6 }}>
                <defs>
                  <linearGradient id="gExp" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#ea580c" stopOpacity={0.3} /><stop offset="95%" stopColor="#ea580c" stopOpacity={0} /></linearGradient>
                  <linearGradient id="gGmv" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#16a34a" stopOpacity={0.3} /><stop offset="95%" stopColor="#16a34a" stopOpacity={0} /></linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="label" tick={axis} />
                <YAxis tick={axis} tickFormatter={fmtVND} width={48} />
                <Tooltip formatter={(v, n) => [fmtVNDfull(v), n === 'expense' ? 'Chi phí' : 'Doanh thu']} />
                <Legend formatter={(v) => (v === 'expense' ? 'Chi phí' : 'Doanh thu Ads')} />
                <Area type="monotone" dataKey="gmv" stroke="#16a34a" strokeWidth={2} fill="url(#gGmv)" />
                <Area type="monotone" dataKey="expense" stroke="#ea580c" strokeWidth={2} fill="url(#gExp)" />
              </AreaChart>
            )}
          </div>

          {/* 2-up charts */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: 16, marginBottom: 16 }}>
            {chartCard('Chi phí QC theo shop', 'Shop nào tiêu nhiều nhất', 300,
              <BarChart data={perShop} margin={{ top: 18, right: 12, bottom: 4, left: 6 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="short" tick={axis} interval={0} angle={-18} textAnchor="end" height={56} />
                <YAxis tick={axis} tickFormatter={fmtVND} width={48} />
                <Tooltip formatter={(v) => fmtVNDfull(v)} labelFormatter={(l, p) => p?.[0]?.payload?.name || l} />
                <Bar dataKey="expense" radius={[6, 6, 0, 0]}>
                  <LabelList dataKey="expense" position="top" formatter={fmtVND} style={{ fontSize: 10, fill: '#475569' }} />
                  {perShop.map((s, i) => <Cell key={i} fill={s.color} />)}
                </Bar>
              </BarChart>
            )}
            {chartCard('ROAS theo shop', 'Hiệu quả: doanh thu trên mỗi đồng QC', 300,
              <BarChart data={perShop} margin={{ top: 18, right: 12, bottom: 4, left: 6 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="short" tick={axis} interval={0} angle={-18} textAnchor="end" height={56} />
                <YAxis tick={axis} width={36} />
                <Tooltip formatter={(v) => `${v}x`} labelFormatter={(l, p) => p?.[0]?.payload?.name || l} />
                <Bar dataKey="roas" radius={[6, 6, 0, 0]} fill="#7c3aed">
                  <LabelList dataKey="roas" position="top" formatter={(v) => `${v}x`} style={{ fontSize: 10, fill: '#475569' }} />
                </Bar>
              </BarChart>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: 16, marginBottom: 16 }}>
            {chartCard('Chi phí vs Doanh thu theo shop', 'So sánh đầu tư và kết quả', 300,
              <BarChart data={perShop} margin={{ top: 8, right: 12, bottom: 4, left: 6 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="short" tick={axis} interval={0} angle={-18} textAnchor="end" height={56} />
                <YAxis tick={axis} tickFormatter={fmtVND} width={48} />
                <Tooltip formatter={(v, n) => [fmtVNDfull(v), n === 'expense' ? 'Chi phí' : 'Doanh thu']} labelFormatter={(l, p) => p?.[0]?.payload?.name || l} />
                <Legend formatter={(v) => (v === 'expense' ? 'Chi phí' : 'Doanh thu Ads')} />
                <Bar dataKey="expense" fill="#ef4444" radius={[4, 4, 0, 0]} />
                <Bar dataKey="gmv" fill="#16a34a" radius={[4, 4, 0, 0]} />
              </BarChart>
            )}
            {chartCard('Tỷ trọng chi phí', 'Phần chi phí QC mỗi shop chiếm', 300,
              <PieChart>
                <Pie data={perShop.filter((s) => s.expense > 0)} dataKey="expense" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={95} paddingAngle={2}>
                  {perShop.map((s, i) => <Cell key={i} fill={s.color} />)}
                </Pie>
                <Tooltip formatter={(v, n) => [fmtVNDfull(v), n]} />
                <Legend formatter={(v) => (v.length > 16 ? v.slice(0, 15) + '…' : v)} wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            )}
          </div>

          {/* Ranking table */}
          <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '12px 18px', borderBottom: '1px solid #f1f5f9', fontSize: '0.9rem', fontWeight: 800, color: '#0f172a' }}>
              🏆 Bảng xếp hạng theo chi phí
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['Shop', 'Chi phí', 'Doanh thu', 'ROAS', 'Đơn', 'Click'].map((h, i) => (
                      <th key={h} style={{ padding: '9px 14px', fontSize: '0.7rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', borderBottom: '2px solid #e5e7eb', background: '#f8fafc', textAlign: i === 0 ? 'left' : 'right', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {perShop.map((s) => (
                    <tr key={s.name}>
                      <td style={{ padding: '9px 14px', fontSize: '0.84rem', fontWeight: 700, color: '#0f172a', borderBottom: '1px solid #f1f5f9' }}>
                        <span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 3, background: s.color, marginRight: 8 }} />{s.name}
                      </td>
                      <td style={{ padding: '9px 14px', fontSize: '0.84rem', textAlign: 'right', color: '#dc2626', fontWeight: 700, borderBottom: '1px solid #f1f5f9' }}>{fmtVNDfull(s.expense)}</td>
                      <td style={{ padding: '9px 14px', fontSize: '0.84rem', textAlign: 'right', color: '#16a34a', borderBottom: '1px solid #f1f5f9' }}>{fmtVNDfull(s.gmv)}</td>
                      <td style={{ padding: '9px 14px', fontSize: '0.84rem', textAlign: 'right', fontWeight: 700, color: '#7c3aed', borderBottom: '1px solid #f1f5f9' }}>{fmtRoas(s.roas)}</td>
                      <td style={{ padding: '9px 14px', fontSize: '0.84rem', textAlign: 'right', borderBottom: '1px solid #f1f5f9' }}>{fmtNum(s.orders)}</td>
                      <td style={{ padding: '9px 14px', fontSize: '0.84rem', textAlign: 'right', borderBottom: '1px solid #f1f5f9' }}>{fmtNum(s.clicks)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
