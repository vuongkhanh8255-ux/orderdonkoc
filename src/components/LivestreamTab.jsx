import { useState, useEffect, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid, Legend,
  PieChart, Pie, Cell
} from 'recharts';

// ── CONFIG ──────────────────────────────────────────────────────────────────
const SHEET_ID    = '19XM9DYn6ZUNNiY2T1OhkndSsC5OQTQXB-bWI-R6CZk4';
const SHEET_VIDEO = 'TỔNG - VIDEO 2025';
const SHEET_LIVE  = 'TỔNG - PERFORMANCE LIVES 2025';

const BRANDS = ['Tất cả', 'Bodymiss', 'Milaganics', 'Moaw Moaws', 'eHerb', 'Masube', 'Real Steel', 'Healmi'];

const BRAND_COLORS = {
  'Bodymiss':   '#f97316',
  'Milaganics': '#22c55e',
  'Moaw Moaws': '#ef4444',
  'eHerb':      '#eab308',
  'Masube':     '#8b5cf6',
  'Real Steel': '#3b82f6',
  'Healmi':     '#ec4899',
};

const PIE_COLORS = ['#f97316','#22c55e','#ef4444','#eab308','#8b5cf6','#3b82f6','#ec4899'];

function normalizeBrand(kenhStr) {
  if (!kenhStr) return 'Khác';
  const s = kenhStr.toLowerCase().replace(/\s+/g,'');
  if (s.includes('bodymiss')) return 'Bodymiss';
  if (s.includes('milaganics')) return 'Milaganics';
  if (s.includes('moaw')) return 'Moaw Moaws';
  if (s.includes('eherb')) return 'eHerb';
  if (s.includes('masube')) return 'Masube';
  if (s.includes('realsteal') || s.includes('realsteel')) return 'Real Steel';
  if (s.includes('healmii') || s.includes('healmi')) return 'Healmi';
  return kenhStr;
}

function fmtMoney(n) {
  if (!n || isNaN(n)) return '0';
  if (n >= 1e9) return (n/1e9).toFixed(2) + ' tỷ';
  if (n >= 1e6) return (n/1e6).toFixed(1) + ' tr';
  if (n >= 1e3) return (n/1e3).toFixed(0) + 'k';
  return n.toLocaleString('vi-VN');
}

function fmtHours(h) {
  if (!h || isNaN(h)) return '0h';
  return (+h).toFixed(1) + 'h';
}

// Dùng Supabase Edge Function proxy (ổn định, không CORS)
const PROXY_URL = 'https://xkyhvcmnkrxdtmwtghln.supabase.co/functions/v1/sheets-proxy';

async function fetchSheet(sheetName, range = '') {
  let url = `${PROXY_URL}?sheetId=${SHEET_ID}&sheet=${encodeURIComponent(sheetName)}`;
  if (range) url += `&range=${encodeURIComponent(range)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ── DONUT CHART ─────────────────────────────────────────────────────────────
function DonutKPI({ value, total, label, color = '#f97316' }) {
  const pct = total > 0 ? Math.min(value / total, 1) : 0;
  const r = 54, cx = 70, cy = 70;
  const circ = 2 * Math.PI * r;
  const filled = pct * circ;
  return (
    <div style={{ textAlign: 'center' }}>
      <svg width={140} height={140}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#f3f4f6" strokeWidth={14}/>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={14}
          strokeDasharray={`${filled} ${circ - filled}`}
          strokeDashoffset={circ / 4}
          strokeLinecap="round"
        />
        <text x={cx} y={cy - 6} textAnchor="middle" fontSize={18} fontWeight={800} fill="#1f2937">
          {(+value).toFixed(1)}
        </text>
        <text x={cx} y={cy + 14} textAnchor="middle" fontSize={12} fill="#9ca3af">
          / {total}
        </text>
      </svg>
      <div style={{ fontSize: '0.78rem', color: '#6b7280', marginTop: 4 }}>{label}</div>
    </div>
  );
}

// ── KPI CARD ────────────────────────────────────────────────────────────────
function KpiCard({ icon, label, value, sub }) {
  return (
    <div style={{ background: '#fff', borderRadius: 12, padding: '16px 20px', boxShadow: '0 1px 6px rgba(0,0,0,.06)', flex: 1, minWidth: 140 }}>
      <div style={{ fontSize: '1.5rem', marginBottom: 4 }}>{icon}</div>
      <div style={{ fontSize: '0.72rem', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</div>
      <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#1f2937', lineHeight: 1.2 }}>{value}</div>
      {sub && <div style={{ fontSize: '0.72rem', color: '#6b7280', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

// ── MAIN COMPONENT ──────────────────────────────────────────────────────────
export default function LivestreamTab() {
  const [innerTab, setInnerTab]   = useState('performance');
  const [videoRows, setVideoRows] = useState([]);
  const [liveRows, setLiveRows]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);

  // Pending filters (chưa apply)
  const [pendingBrand,    setPendingBrand]    = useState('Tất cả');
  const [pendingHost,     setPendingHost]     = useState('Tất cả');
  const [pendingDateFrom, setPendingDateFrom] = useState('');
  const [pendingDateTo,   setPendingDateTo]   = useState('');
  const [pendingSearch,   setPendingSearch]   = useState('');

  // Applied filters
  const [brand,    setBrand]    = useState('Tất cả');
  const [host,     setHost]     = useState('Tất cả');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo,   setDateTo]   = useState('');
  const [search,   setSearch]   = useState('');

  // Pagination
  const PAGE_SIZE = 50;
  const [page, setPage] = useState(1);

  // Fetch
  useEffect(() => {
    setLoading(true);
    // PERFORMANCE LIVES: data header ở row 14 → range lớn để lấy hết 2025+2026
    Promise.all([fetchSheet(SHEET_VIDEO, 'A2:J10000'), fetchSheet(SHEET_LIVE, 'A14:Q15000')])
      .then(([vid, live]) => {
        setVideoRows(vid.data || []);
        setLiveRows(live.data  || []);
        setLoading(false);
      })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

  // Parse date helper
  const parseDate = (v) => {
    if (!v) return null;
    if (v instanceof Date) return v;
    // Google Sheets serial date
    if (typeof v === 'number') {
      const d = new Date((v - 25569) * 86400 * 1000);
      return d;
    }
    return new Date(v);
  };

  // Filtered video — sort mới nhất lên đầu
  const filteredVideo = useMemo(() => {
    return videoRows
      .filter(r => {
        const b = normalizeBrand(r['KÊNH'] || r['Kênh'] || '');
        if (brand !== 'Tất cả' && b !== brand) return false;
        const d = parseDate(r['NGÀY'] || r['Ngày']);
        if (dateFrom && d && d < new Date(dateFrom)) return false;
        if (dateTo   && d && d > new Date(dateTo + 'T23:59:59')) return false;
        if (search) {
          const q = search.toLowerCase();
          const row = Object.values(r).join(' ').toLowerCase();
          if (!row.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        const da = parseDate(a['NGÀY']||a['Ngày']);
        const db = parseDate(b['NGÀY']||b['Ngày']);
        return (db ? db.getTime() : 0) - (da ? da.getTime() : 0);
      });
  }, [videoRows, brand, dateFrom, dateTo, search]);

  // Video stats by brand
  const videoByBrand = useMemo(() => {
    const map = {};
    filteredVideo.forEach(r => {
      const b = normalizeBrand(r['KÊNH']||r['Kênh']||'');
      if (!map[b]) map[b] = { brand: b, total: 0, talents: new Set() };
      map[b].total++;
      const t = r['TALENT']||r['Talent']||'';
      if (t) map[b].talents.add(t);
    });
    return Object.values(map)
      .map(x => ({ ...x, talents: x.talents.size }))
      .sort((a, b) => b.total - a.total);
  }, [filteredVideo]);

  // All hosts for dropdown
  const allHosts = useMemo(() => {
    const s = new Set();
    liveRows.forEach(r => { const h = r['HOST']||''; if (h) s.add(h); });
    return ['Tất cả', ...Array.from(s).sort()];
  }, [liveRows]);

  // Filtered live — chỉ 2026, sort mới nhất lên đầu
  const filteredLive = useMemo(() => {
    setPage(1);
    return liveRows
      .filter(r => {
        const d = parseDate(r['NGÀY'] || r['Ngày']);
        if (!d || d.getFullYear() < 2026) return false; // chỉ lấy 2026
        const b = normalizeBrand(r['KÊNH'] || r['Kênh'] || '');
        if (brand !== 'Tất cả' && b !== brand) return false;
        const h = r['HOST'] || '';
        if (host !== 'Tất cả' && h !== host) return false;
        if (dateFrom && d < new Date(dateFrom)) return false;
        if (dateTo   && d > new Date(dateTo + 'T23:59:59')) return false;
        return true;
      })
      .sort((a, b) => {
        const da = parseDate(a['NGÀY']||a['Ngày']);
        const db = parseDate(b['NGÀY']||b['Ngày']);
        return (db ? db.getTime() : 0) - (da ? da.getTime() : 0);
      });
  }, [liveRows, brand, host, dateFrom, dateTo]);

  // KPIs
  const totalHours   = useMemo(() => filteredLive.reduce((s,r) => s + (parseFloat(r['GIỜ']||r['Giờ']||0)||0), 0), [filteredLive]);
  const totalRevenue = useMemo(() => filteredLive.reduce((s,r) => s + (parseFloat(r['DOANH SỐ']||0)||0), 0), [filteredLive]);
  const totalOrders  = useMemo(() => filteredLive.reduce((s,r) => s + (parseFloat(r['ĐƠN HÀNG']||0)||0), 0), [filteredLive]);
  const totalAds     = useMemo(() => filteredLive.reduce((s,r) => s + (parseFloat(r['ADS TỔNG']||0)||0), 0), [filteredLive]);
  const acosAvg      = totalRevenue > 0 ? (totalAds / totalRevenue * 100) : 0;

  // By host bar
  const byHost = useMemo(() => {
    const map = {};
    filteredLive.forEach(r => {
      const h = r['HOST'] || r['Host'] || 'N/A';
      if (!map[h]) map[h] = { name: h, hours: 0, revenue: 0, orders: 0 };
      map[h].hours   += parseFloat(r['GIỜ']||0)||0;
      map[h].revenue += parseFloat(r['DOANH SỐ']||0)||0;
      map[h].orders  += parseFloat(r['ĐƠN HÀNG']||0)||0;
    });
    return Object.values(map).sort((a,b) => b.revenue - a.revenue).slice(0,10);
  }, [filteredLive]);

  // By brand pie
  const byBrandPie = useMemo(() => {
    const map = {};
    filteredLive.forEach(r => {
      const b = normalizeBrand(r['KÊNH']||r['Kênh']||'');
      if (!map[b]) map[b] = { name: b, value: 0 };
      map[b].value += parseFloat(r['DOANH SỐ']||0)||0;
    });
    return Object.values(map).filter(x => x.value > 0).sort((a,b) => b.value - a.value);
  }, [filteredLive]);

  // GMV + ACOS by date
  const byDate = useMemo(() => {
    const map = {};
    filteredLive.forEach(r => {
      const d = parseDate(r['NGÀY']||r['Ngày']);
      if (!d) return;
      const key = d.toLocaleDateString('vi-VN', { day:'2-digit', month:'2-digit' });
      if (!map[key]) map[key] = { date: key, revenue: 0, ads: 0, ts: d.getTime() };
      map[key].revenue += parseFloat(r['DOANH SỐ']||0)||0;
      map[key].ads     += parseFloat(r['ADS TỔNG']||0)||0;
    });
    return Object.values(map)
      .sort((a,b) => a.ts - b.ts)
      .map(x => ({ ...x, acos: x.revenue > 0 ? +(x.ads/x.revenue*100).toFixed(1) : 0 }));
  }, [filteredLive]);

  const tabBtn = (t, label) => (
    <button onClick={() => setInnerTab(t)} style={{
      padding: '8px 20px', border: 'none', cursor: 'pointer', borderRadius: 8,
      background: innerTab === t ? 'linear-gradient(135deg,#f59e0b,#ea580c)' : '#f3f4f6',
      color: innerTab === t ? '#fff' : '#6b7280',
      fontWeight: innerTab === t ? 700 : 500, fontSize: '0.85rem',
    }}>{label}</button>
  );

  if (loading) return <div style={{ textAlign:'center', padding: 60, color:'#9ca3af' }}>Đang tải dữ liệu Livestream...</div>;
  if (error)   return <div style={{ textAlign:'center', padding: 60, color:'#ef4444' }}>Lỗi: {error}</div>;

  return (
    <div style={{ fontFamily:"'Outfit',sans-serif", color:'#1f2937' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800, color:'#ea580c' }}>🎬 LIVESTREAM DASHBOARD</h2>
        <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color:'#9ca3af' }}>
          Nguồn: Livestream Guideline — Video 2025 &amp; Performance Lives 2025
        </p>
      </div>

      {/* Filters */}
      <div style={{ background:'#fff', borderRadius:12, padding:'16px 20px', marginBottom:20, boxShadow:'0 1px 6px rgba(0,0,0,.06)' }}>
        <div style={{ display:'flex', gap:12, flexWrap:'wrap', alignItems:'flex-end' }}>
          <div>
            <label style={{ fontSize:'0.72rem', color:'#9ca3af', display:'block', marginBottom:2 }}>BRAND</label>
            <select value={pendingBrand} onChange={e => setPendingBrand(e.target.value)}
              style={{ padding:'7px 10px', borderRadius:8, border:'1.5px solid #e5e7eb', fontSize:'0.83rem', outline:'none', cursor:'pointer' }}>
              {BRANDS.map(b => <option key={b}>{b}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize:'0.72rem', color:'#9ca3af', display:'block', marginBottom:2 }}>NHÂN SỰ</label>
            <select value={pendingHost} onChange={e => setPendingHost(e.target.value)}
              style={{ padding:'7px 10px', borderRadius:8, border:'1.5px solid #e5e7eb', fontSize:'0.83rem', outline:'none', cursor:'pointer', minWidth:130 }}>
              {allHosts.map(h => <option key={h}>{h}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize:'0.72rem', color:'#9ca3af', display:'block', marginBottom:2 }}>TỪ NGÀY</label>
            <input type="date" value={pendingDateFrom} onChange={e => setPendingDateFrom(e.target.value)}
              style={{ padding:'7px 10px', borderRadius:8, border:'1.5px solid #e5e7eb', fontSize:'0.83rem', outline:'none' }}/>
          </div>
          <div>
            <label style={{ fontSize:'0.72rem', color:'#9ca3af', display:'block', marginBottom:2 }}>ĐẾN NGÀY</label>
            <input type="date" value={pendingDateTo} onChange={e => setPendingDateTo(e.target.value)}
              style={{ padding:'7px 10px', borderRadius:8, border:'1.5px solid #e5e7eb', fontSize:'0.83rem', outline:'none' }}/>
          </div>
          {innerTab === 'video' && (
            <div style={{ flex:1, minWidth:180 }}>
              <label style={{ fontSize:'0.72rem', color:'#9ca3af', display:'block', marginBottom:2 }}>TÌM KIẾM</label>
              <input placeholder="Talent, sản phẩm, kênh..." value={pendingSearch} onChange={e => setPendingSearch(e.target.value)}
                style={{ width:'100%', padding:'7px 10px', borderRadius:8, border:'1.5px solid #e5e7eb', fontSize:'0.83rem', outline:'none', boxSizing:'border-box' }}/>
            </div>
          )}
          <button onClick={() => { setBrand(pendingBrand); setHost(pendingHost); setDateFrom(pendingDateFrom); setDateTo(pendingDateTo); setSearch(pendingSearch); }}
            style={{ padding:'7px 20px', background:'linear-gradient(135deg,#f59e0b,#ea580c)', color:'#fff', border:'none', borderRadius:8, cursor:'pointer', fontSize:'0.83rem', fontWeight:700 }}>
            Áp dụng
          </button>
          {(brand !== 'Tất cả' || host !== 'Tất cả' || dateFrom || dateTo || search) && (
            <button onClick={() => {
              setPendingBrand('Tất cả'); setPendingHost('Tất cả'); setPendingDateFrom(''); setPendingDateTo(''); setPendingSearch('');
              setBrand('Tất cả'); setHost('Tất cả'); setDateFrom(''); setDateTo(''); setSearch('');
            }}
              style={{ padding:'7px 14px', background:'#fee2e2', color:'#ef4444', border:'none', borderRadius:8, cursor:'pointer', fontSize:'0.8rem', fontWeight:600 }}>
              Xóa lọc
            </button>
          )}
        </div>
      </div>

      {/* Inner Tabs */}
      <div style={{ display:'flex', gap:8, marginBottom:20 }}>
        {tabBtn('performance', '📊 Performance')}
        {tabBtn('video', '🎥 Video')}
      </div>

      {/* ── PERFORMANCE TAB ── */}
      {innerTab === 'performance' && (
        <div>
          {/* KPI Cards */}
          <div style={{ display:'flex', gap:16, flexWrap:'wrap', marginBottom:24 }}>
            <KpiCard icon="⏱️" label="Tổng giờ live"    value={fmtHours(totalHours)}   sub={`${filteredLive.length} phiên`}/>
            <KpiCard icon="💰" label="Tổng doanh số"   value={fmtMoney(totalRevenue)} sub="VNĐ"/>
            <KpiCard icon="📦" label="Tổng đơn hàng"   value={totalOrders.toLocaleString('vi-VN')} sub="đơn"/>
            <KpiCard icon="📢" label="Tổng chi phí Ads" value={fmtMoney(totalAds)}    sub={`ACOS: ${acosAvg.toFixed(1)}%`}/>
          </div>

          {/* Row 1: Pie + Donut KPI */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20, marginBottom:20 }}>
            {/* GMV by brand pie */}
            <div style={{ background:'#fff', borderRadius:12, padding:20, boxShadow:'0 1px 6px rgba(0,0,0,.06)' }}>
              <h4 style={{ margin:'0 0 16px', fontSize:'0.85rem', fontWeight:700, color:'#374151' }}>📊 DOANH SỐ THEO BRAND</h4>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={byBrandPie} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({name, percent}) => `${name} ${(percent*100).toFixed(0)}%`} labelLine={false}>
                    {byBrandPie.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]}/>)}
                  </Pie>
                  <Tooltip formatter={v => fmtMoney(v)}/>
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* Hours by host */}
            <div style={{ background:'#fff', borderRadius:12, padding:20, boxShadow:'0 1px 6px rgba(0,0,0,.06)' }}>
              <h4 style={{ margin:'0 0 16px', fontSize:'0.85rem', fontWeight:700, color:'#374151' }}>⏱️ GIỜ LIVE THEO HOST</h4>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={byHost} margin={{ left:-10 }}>
                  <XAxis dataKey="name" tick={{ fontSize:11 }}/>
                  <YAxis tick={{ fontSize:11 }}/>
                  <Tooltip formatter={v => v.toFixed(1)+'h'}/>
                  <Bar dataKey="hours" fill="#f97316" radius={[4,4,0,0]} label={{ position:'top', fontSize:10, formatter:v=>v.toFixed(1)+'h' }}/>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Row 2: Doanh số by host */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20, marginBottom:20 }}>
            <div style={{ background:'#fff', borderRadius:12, padding:20, boxShadow:'0 1px 6px rgba(0,0,0,.06)' }}>
              <h4 style={{ margin:'0 0 16px', fontSize:'0.85rem', fontWeight:700, color:'#374151' }}>💰 DOANH SỐ THEO HOST</h4>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={byHost} margin={{ left:0 }}>
                  <XAxis dataKey="name" tick={{ fontSize:11 }}/>
                  <YAxis tick={{ fontSize:11 }} tickFormatter={v => fmtMoney(v)}/>
                  <Tooltip formatter={v => fmtMoney(v)}/>
                  <Bar dataKey="revenue" fill="#22c55e" radius={[4,4,0,0]}/>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* GMV + ACOS trend */}
            <div style={{ background:'#fff', borderRadius:12, padding:20, boxShadow:'0 1px 6px rgba(0,0,0,.06)' }}>
              <h4 style={{ margin:'0 0 16px', fontSize:'0.85rem', fontWeight:700, color:'#374151' }}>📈 GMV &amp; ACOS THEO NGÀY</h4>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={byDate} margin={{ left:0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6"/>
                  <XAxis dataKey="date" tick={{ fontSize:10 }}/>
                  <YAxis yAxisId="left"  tick={{ fontSize:10 }} tickFormatter={v => fmtMoney(v)}/>
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize:10 }} tickFormatter={v => v+'%'}/>
                  <Tooltip formatter={(v, name) => name === 'acos' ? v+'%' : fmtMoney(v)}/>
                  <Legend/>
                  <Bar  yAxisId="left"  dataKey="revenue" name="Doanh số" fill="#ef4444" radius={[3,3,0,0]}/>
                  <Line yAxisId="right" type="monotone" dataKey="acos" name="ACOS" stroke="#22c55e" dot={false} strokeWidth={2}/>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Sessions table */}
          <div style={{ background:'#fff', borderRadius:12, padding:20, boxShadow:'0 1px 6px rgba(0,0,0,.06)' }}>
            <h4 style={{ margin:'0 0 12px', fontSize:'0.85rem', fontWeight:700, color:'#374151' }}>
              📋 CHI TIẾT PHIÊN LIVE <span style={{ color:'#9ca3af', fontWeight:400 }}>({filteredLive.length} phiên)</span>
            </h4>
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.8rem' }}>
                <thead>
                  <tr style={{ background:'#fef3c7' }}>
                    {['NGÀY','KÊNH','HOST','GIỜ','DOANH SỐ','ĐƠN HÀNG','ADS TỔNG','ACOS'].map(h => (
                      <th key={h} style={{ padding:'8px 12px', textAlign:'left', color:'#92400e', fontWeight:700, whiteSpace:'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredLive.slice((page-1)*PAGE_SIZE, page*PAGE_SIZE).map((r,i) => {
                    const d = parseDate(r['NGÀY']||r['Ngày']);
                    const ds = parseFloat(r['DOANH SỐ']||0)||0;
                    const ads = parseFloat(r['ADS TỔNG']||0)||0;
                    const acos = ds > 0 ? (ads/ds*100).toFixed(1)+'%' : '—';
                    return (
                      <tr key={i} style={{ borderBottom:'1px solid #f3f4f6', background: i%2===0?'#fff':'#fafafa' }}>
                        <td style={{ padding:'7px 12px', whiteSpace:'nowrap' }}>{d ? d.toLocaleDateString('vi-VN') : '—'}</td>
                        <td style={{ padding:'7px 12px' }}>{r['KÊNH']||r['Kênh']||'—'}</td>
                        <td style={{ padding:'7px 12px', fontWeight:600, color:'#f97316' }}>{r['HOST']||r['Host']||'—'}</td>
                        <td style={{ padding:'7px 12px' }}>{parseFloat(r['GIỜ']||0).toFixed(1)}h</td>
                        <td style={{ padding:'7px 12px', fontWeight:600 }}>{fmtMoney(ds)}</td>
                        <td style={{ padding:'7px 12px' }}>{parseFloat(r['ĐƠN HÀNG']||0).toLocaleString()}</td>
                        <td style={{ padding:'7px 12px' }}>{fmtMoney(ads)}</td>
                        <td style={{ padding:'7px 12px', color: parseFloat(acos) > 30 ? '#ef4444' : '#22c55e', fontWeight:600 }}>{acos}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {/* Pagination */}
              {filteredLive.length > PAGE_SIZE && (
                <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8, marginTop:16 }}>
                  <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page===1}
                    style={{ padding:'6px 14px', borderRadius:8, border:'1.5px solid #e5e7eb', background: page===1?'#f9fafb':'#fff', color: page===1?'#d1d5db':'#374151', cursor: page===1?'default':'pointer', fontWeight:600 }}>
                    ← Trước
                  </button>
                  <span style={{ fontSize:'0.83rem', color:'#6b7280' }}>
                    Trang {page} / {Math.ceil(filteredLive.length / PAGE_SIZE)} &nbsp;·&nbsp; {filteredLive.length} phiên
                  </span>
                  <button onClick={() => setPage(p => Math.min(Math.ceil(filteredLive.length/PAGE_SIZE), p+1))} disabled={page >= Math.ceil(filteredLive.length/PAGE_SIZE)}
                    style={{ padding:'6px 14px', borderRadius:8, border:'1.5px solid #e5e7eb', background: page>=Math.ceil(filteredLive.length/PAGE_SIZE)?'#f9fafb':'#fff', color: page>=Math.ceil(filteredLive.length/PAGE_SIZE)?'#d1d5db':'#374151', cursor: page>=Math.ceil(filteredLive.length/PAGE_SIZE)?'default':'pointer', fontWeight:600 }}>
                    Tiếp →
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── VIDEO TAB ── */}
      {innerTab === 'video' && (
        <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
          {/* Thống kê theo brand */}
          <div style={{ background:'#fff', borderRadius:12, padding:20, boxShadow:'0 1px 6px rgba(0,0,0,.06)' }}>
            <h4 style={{ margin:'0 0 14px', fontSize:'0.85rem', fontWeight:700, color:'#374151' }}>📊 THỐNG KÊ VIDEO THEO BRAND</h4>
            <div style={{ display:'flex', gap:12, flexWrap:'wrap' }}>
              {videoByBrand.map(x => (
                <div key={x.brand} style={{ background:'#fef3c7', borderRadius:10, padding:'12px 20px', minWidth:140, borderLeft:`4px solid ${BRAND_COLORS[x.brand]||'#f97316'}` }}>
                  <div style={{ fontSize:'0.72rem', color:'#92400e', fontWeight:700, marginBottom:4 }}>{x.brand.toUpperCase()}</div>
                  <div style={{ fontSize:'1.4rem', fontWeight:800, color:'#1f2937' }}>{x.total}</div>
                  <div style={{ fontSize:'0.72rem', color:'#6b7280' }}>video · {x.talents} talent</div>
                </div>
              ))}
            </div>
          </div>

          {/* Danh sách */}
        <div style={{ background:'#fff', borderRadius:12, padding:20, boxShadow:'0 1px 6px rgba(0,0,0,.06)' }}>
          <h4 style={{ margin:'0 0 12px', fontSize:'0.85rem', fontWeight:700, color:'#374151' }}>
            🎥 DANH SÁCH VIDEO <span style={{ color:'#9ca3af', fontWeight:400 }}>({filteredVideo.length} video)</span>
          </h4>
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.8rem' }}>
              <thead>
                <tr style={{ background:'#fef3c7' }}>
                  {['#','NGÀY','TALENT','KÊNH','SẢN PHẨM','CONTENT','KEYWORD 1','LINK'].map(h => (
                    <th key={h} style={{ padding:'8px 12px', textAlign:'left', color:'#92400e', fontWeight:700, whiteSpace:'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredVideo.slice(0,100).map((r,i) => {
                  const d = parseDate(r['NGÀY']||r['Ngày']);
                  const link = r['LINK']||r['Link']||'';
                  const b = normalizeBrand(r['KÊNH']||r['Kênh']||'');
                  return (
                    <tr key={i} style={{ borderBottom:'1px solid #f3f4f6', background: i%2===0?'#fff':'#fafafa' }}>
                      <td style={{ padding:'7px 12px', color:'#9ca3af' }}>{i+1}</td>
                      <td style={{ padding:'7px 12px', whiteSpace:'nowrap' }}>{d ? d.toLocaleDateString('vi-VN') : '—'}</td>
                      <td style={{ padding:'7px 12px', fontWeight:600, color:'#f97316' }}>{r['TALENT']||r['Talent']||'—'}</td>
                      <td style={{ padding:'7px 12px' }}>
                        <span style={{ background: BRAND_COLORS[b]+'22', color: BRAND_COLORS[b]||'#6b7280', padding:'2px 8px', borderRadius:6, fontSize:'0.75rem', fontWeight:600 }}>
                          {r['KÊNH']||r['Kênh']||'—'}
                        </span>
                      </td>
                      <td style={{ padding:'7px 12px' }}>{r['SẢN PHẨM']||r['Sản phẩm']||'—'}</td>
                      <td style={{ padding:'7px 12px' }}>{r['CONTENT']||r['Content']||'—'}</td>
                      <td style={{ padding:'7px 12px', color:'#6b7280' }}>{r['KEYWORD B1']||r['KEYWOR B1']||r['KEYWORD 1']||'—'}</td>
                      <td style={{ padding:'7px 12px' }}>
                        {link ? (
                          <a href={link} target="_blank" rel="noreferrer"
                            style={{ color:'#3b82f6', textDecoration:'none', fontSize:'0.78rem' }}>
                            🔗 Xem
                          </a>
                        ) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filteredVideo.length > 100 && (
              <p style={{ textAlign:'center', color:'#9ca3af', fontSize:'0.78rem', marginTop:8 }}>
                Hiển thị 100 / {filteredVideo.length} video
              </p>
            )}
          </div>
        </div>
        </div>
      )}
    </div>
  );
}
