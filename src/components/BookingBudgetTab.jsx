// src/components/BookingBudgetTab.jsx
// Module 7: Ngân sách chi phí booking.
// Cast THẬT từng nhân sự, lấy từ file Thanh toán KOC (koc_payments.cast_net), quy về tháng VIDEO AIR
// (ngày video lên sóng) — KHÔNG dùng cast nhân sự điền tay vào link air (cũ, ~98% bỏ trống).
// Nguồn dùng CHUNG với bảng Định Mức ở Dashboard Booking (RPC booking_cast_by_month).
// Panel "Cần đối chiếu" liệt kê đơn không suy ra được ngày air → qua Module 5 sửa link.
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../supabaseClient';

const ACCENT = '#ff6a2c';
const START = { y: 2026, m: 3 }; // rà từ tháng 3/2026 về sau

const fmt = (n) => new Intl.NumberFormat('vi-VN').format(Math.round(Number(n) || 0));
const fmtVnd = (n) => {
  const v = Number(n) || 0;
  if (Math.abs(v) >= 1e9) return (v / 1e9).toFixed(2) + ' tỷ';
  if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(1) + 'tr';
  if (Math.abs(v) >= 1e3) return Math.round(v / 1e3) + 'k';
  return fmt(v);
};
const todayYmd = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const fmtDate = (s) => { if (!s) return '—'; const p = String(s).slice(0, 10).split('-'); return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : s; };

// danh sách tháng từ START tới hiện tại
function monthsRange() {
  const out = []; const now = new Date();
  let y = START.y, m = START.m;
  while (y < now.getFullYear() || (y === now.getFullYear() && m <= now.getMonth() + 1)) {
    out.push({ key: `${y}-${String(m).padStart(2, '0')}`, label: `T${m}`, full: `Tháng ${m}/${y}`, y, m });
    m++; if (m > 12) { m = 1; y++; }
  }
  return out;
}

// ── styles ──
const wrap = { background: '#f1f5f9', minHeight: '100vh', margin: '-20px', padding: '24px 28px', fontFamily: "'Outfit', sans-serif" };
const card = { background: '#fff', borderRadius: 16, boxShadow: '0 1px 3px rgba(15,23,42,0.06)', border: '1px solid #f1f5f9' };
const th = { padding: '11px 12px', textAlign: 'right', fontSize: '0.7rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.03em', borderBottom: '2px solid #e2e8f0', whiteSpace: 'nowrap', background: '#f8fafc' };
const td = { padding: '11px 12px', borderBottom: '1px solid #f1f5f9', fontSize: '0.86rem', color: '#334155', whiteSpace: 'nowrap', textAlign: 'right' };
const btn = (bg, color) => ({ padding: '8px 14px', borderRadius: 9, border: 'none', background: bg, color, fontWeight: 700, fontSize: '0.84rem', cursor: 'pointer' });

function BookingBudgetTab() {
  const [rows, setRows] = useState([]);
  const [unresolved, setUnresolved] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [detail, setDetail] = useState(null); // { staff }

  const months = useMemo(() => monthsRange(), []);

  const load = useCallback(async () => {
    setLoading(true); setErr('');
    const from = `${START.y}-${String(START.m).padStart(2, '0')}-01`;
    const to = todayYmd();
    const [a, b] = await Promise.all([
      supabase.rpc('booking_cast_by_month', { p_from: from, p_to: to }),
      supabase.rpc('booking_cast_unresolved', { p_from: from, p_to: to }),
    ]);
    if (a.error) setErr(a.error.message); else setRows(a.data || []);
    setUnresolved(b.error ? [] : (b.data || []));
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  // pivot: nhân sự × tháng
  const pivot = useMemo(() => {
    const map = {};
    rows.forEach(r => {
      const s = r.staff || '—';
      if (!map[s]) map[s] = { staff: s, total: 0, byMonth: {} };
      const c = Number(r.cast_net) || 0;
      map[s].byMonth[r.air_month] = (map[s].byMonth[r.air_month] || 0) + c;
      map[s].total += c;
    });
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [rows]);

  const monthTotal = useMemo(() => {
    const t = {}; let grand = 0;
    rows.forEach(r => { const c = Number(r.cast_net) || 0; t[r.air_month] = (t[r.air_month] || 0) + c; grand += c; });
    return { t, grand };
  }, [rows]);

  const curMonthKey = months.length ? months[months.length - 1].key : '';
  const unresolvedTotal = useMemo(() => unresolved.reduce((a, r) => a + (Number(r.cast_net) || 0), 0), [unresolved]);

  const KPIS = [
    { label: 'Tổng cast đã chi (từ T3)', val: fmtVnd(monthTotal.grand) + ' đ', sub: `${pivot.length} nhân sự`, icon: '💰', color: '#16a34a' },
    { label: `Cast tháng này (${months[months.length - 1]?.label || ''})`, val: fmtVnd(monthTotal.t[curMonthKey] || 0) + ' đ', sub: 'theo ngày video air', icon: '🔥', color: '#ea580c' },
    { label: 'Đơn cần đối chiếu', val: fmt(unresolved.length), sub: `${fmtVnd(unresolvedTotal)} đ chưa rõ ngày air`, icon: '⚠️', color: '#dc2626' },
    { label: 'Số tháng theo dõi', val: fmt(months.length), sub: `từ T${START.m}/${START.y} → nay`, icon: '🗓️', color: '#7c3aed' },
  ];

  const exportExcel = async () => {
    const XLSX = await import('xlsx').then(m => m.default || m);
    const head = ['Nhân sự', ...months.map(m => m.full), 'Tổng'];
    const aoa = [head];
    pivot.forEach(p => aoa.push([p.staff, ...months.map(m => Math.round(p.byMonth[m.key] || 0)), Math.round(p.total)]));
    aoa.push(['TỔNG', ...months.map(m => Math.round(monthTotal.t[m.key] || 0)), Math.round(monthTotal.grand)]);
    const ws = XLSX.utils.aoa_to_sheet(aoa); const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'NganSachCast'); XLSX.writeFile(wb, `ngan-sach-cast-booking.xlsx`);
  };

  return (
    <div style={wrap}>
      <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', margin: '0 0 4px' }}>💰 Module 7 — Ngân Sách Chi Phí Booking</h2>
      <p style={{ color: '#94a3b8', fontSize: '0.85rem', margin: '0 0 18px' }}>
        Cast THẬT từng nhân sự, lấy từ <b>file Thanh toán KOC</b> · quy về <b>tháng video lên sóng</b> (ngày air) · bất kể đã thanh toán hay chưa. Bấm 1 dòng để xem chi tiết từng video.
      </p>

      {/* actions */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <button onClick={load} style={btn('#f97316', '#fff')}>{loading ? '⏳ Đang tải...' : '🔄 Tải lại'}</button>
        <button onClick={exportExcel} style={btn('#16a34a', '#fff')}>📊 Xuất Excel</button>
      </div>

      {err && <div style={{ ...card, background: '#fef2f2', borderColor: '#fecaca', color: '#dc2626', padding: '12px 16px', marginBottom: 16 }}>❌ {err}</div>}

      {/* KPI */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 20 }}>
        {KPIS.map((k, i) => (
          <div key={i} style={{ ...card, padding: '16px 18px', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: -10, right: -10, width: 56, height: 56, borderRadius: '50%', background: k.color, opacity: 0.08 }} />
            <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>{k.icon} {k.label}</span>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: k.color, marginTop: 6 }}>{k.val}</div>
            <div style={{ fontSize: '0.74rem', color: '#94a3b8', marginTop: 2 }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* pivot nhân sự × tháng */}
      <div style={{ ...card, padding: 0, overflow: 'hidden', marginBottom: 20 }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #f1f5f9', fontWeight: 800, color: '#0f172a', fontSize: '0.95rem' }}>
          👥 Cast thật theo nhân sự ({pivot.length}) — đơn vị: đồng
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
            <thead>
              <tr>
                <th style={{ ...th, textAlign: 'left' }}>#</th>
                <th style={{ ...th, textAlign: 'left' }}>Nhân sự</th>
                {months.map(m => <th key={m.key} style={th} title={m.full}>{m.label}</th>)}
                <th style={{ ...th, color: ACCENT }}>Tổng</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={months.length + 3} style={{ ...td, textAlign: 'center', color: '#94a3b8', padding: 40 }}>⏳ Đang tải...</td></tr>}
              {!loading && pivot.length === 0 && <tr><td colSpan={months.length + 3} style={{ ...td, textAlign: 'center', color: '#94a3b8', padding: 40 }}>Không có dữ liệu.</td></tr>}
              {!loading && pivot.map((p, i) => (
                <tr key={p.staff} onClick={() => setDetail({ staff: p.staff })} style={{ cursor: 'pointer' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#fff7ed'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <td style={{ ...td, textAlign: 'left', color: '#94a3b8', fontWeight: 700 }}>{i + 1}</td>
                  <td style={{ ...td, textAlign: 'left', fontWeight: 700, color: '#0f172a' }}>{p.staff}</td>
                  {months.map(m => {
                    const v = p.byMonth[m.key] || 0;
                    return <td key={m.key} style={{ ...td, color: v > 0 ? '#334155' : '#cbd5e1' }}>{v > 0 ? fmt(v) : '–'}</td>;
                  })}
                  <td style={{ ...td, fontWeight: 800, color: ACCENT }}>{fmt(p.total)}</td>
                </tr>
              ))}
            </tbody>
            {!loading && pivot.length > 0 && (
              <tfoot>
                <tr style={{ background: '#fef7f0', borderTop: '2px solid #fed7aa' }}>
                  <td style={{ ...td, textAlign: 'left', fontWeight: 800, color: '#92400e' }} colSpan={2}>TỔNG</td>
                  {months.map(m => <td key={m.key} style={{ ...td, fontWeight: 800, color: '#92400e' }}>{fmt(monthTotal.t[m.key] || 0)}</td>)}
                  <td style={{ ...td, fontWeight: 800, color: ACCENT }}>{fmt(monthTotal.grand)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* cần đối chiếu */}
      <div style={{ ...card, padding: 0, overflow: 'hidden', border: '1px solid #fecaca' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #fee2e2', background: '#fef2f2', fontWeight: 800, color: '#b91c1c', fontSize: '0.95rem' }}>
          ⚠️ Cần đối chiếu — {unresolved.length} đơn ({fmtVnd(unresolvedTotal)} đ) chưa suy ra được ngày video air
          <div style={{ fontSize: '0.74rem', fontWeight: 500, color: '#9a3412', marginTop: 2 }}>Các đơn này CHƯA được tính vào bảng trên. Qua <b>Module 5: Quản lý link air</b> kiểm tra/sửa link air để đồng bộ video.</div>
        </div>
        <div style={{ overflowX: 'auto', maxHeight: 360, overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 820 }}>
            <thead>
              <tr>
                <th style={{ ...th, textAlign: 'left' }}>Nhân sự</th>
                <th style={{ ...th, textAlign: 'left' }}>Kênh KOC</th>
                <th style={{ ...th, textAlign: 'left' }}>Link air</th>
                <th style={th}>Cast</th>
                <th style={{ ...th, textAlign: 'center' }}>Ngày TT</th>
                <th style={{ ...th, textAlign: 'left' }}>Lý do</th>
              </tr>
            </thead>
            <tbody>
              {!loading && unresolved.length === 0 && <tr><td colSpan={6} style={{ ...td, textAlign: 'center', color: '#16a34a', padding: 30 }}>✅ Tất cả đơn đều đã rà được ngày air.</td></tr>}
              {unresolved.map((r, i) => (
                <tr key={r.id || i}>
                  <td style={{ ...td, textAlign: 'left', fontWeight: 600 }}>{r.staff || '—'}</td>
                  <td style={{ ...td, textAlign: 'left' }}>{r.channel_link
                    ? <a href={r.channel_link} target="_blank" rel="noreferrer" style={{ color: '#0891b2', textDecoration: 'none' }}>{(r.channel_link.match(/@[^/?#]+/) || ['link'])[0]}</a>
                    : '—'}</td>
                  <td style={{ ...td, textAlign: 'left', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis' }} title={r.air_link || ''}>
                    {r.air_link ? <a href={r.air_link} target="_blank" rel="noreferrer" style={{ color: '#7c3aed', textDecoration: 'none' }}>{r.air_link.slice(0, 42)}{r.air_link.length > 42 ? '…' : ''}</a> : <span style={{ color: '#cbd5e1' }}>(trống)</span>}
                  </td>
                  <td style={{ ...td, fontWeight: 700, color: '#dc2626' }}>{fmt(r.cast_net)}</td>
                  <td style={{ ...td, textAlign: 'center', color: '#64748b' }}>{fmtDate(r.pay_date)}</td>
                  <td style={{ ...td, textAlign: 'left' }}><span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#b45309', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, padding: '2px 8px' }}>{r.reason}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p style={{ color: '#94a3b8', fontSize: '0.76rem', marginTop: 12 }}>
        * Cast = <b>cast_net</b> (chưa gồm thuế PIT), lấy từ koc_payments. Ngày air = ngày đăng video (ưu tiên tiktok_shop_videos), thiếu thì lấy từ air_links. Cùng nguồn với cột "Đã chi" ở Dashboard Booking.
      </p>

      {detail && <StaffDetailDrawer staff={detail.staff} onClose={() => setDetail(null)} />}
    </div>
  );
}

// ── Drawer chi tiết từng video của 1 nhân sự ──
function StaffDetailDrawer({ staff, onClose }) {
  const [det, setDet] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true; setLoading(true);
    const from = `${START.y}-${String(START.m).padStart(2, '0')}-01`;
    supabase.rpc('booking_cast_detail', { p_staff: staff, p_from: from, p_to: todayYmd() })
      .then(({ data }) => { if (alive) { setDet(data || []); setLoading(false); } });
    return () => { alive = false; };
  }, [staff]);
  const list = Array.isArray(det) ? det : [];
  const total = list.reduce((a, r) => a + (Number(r.cast_net) || 0), 0);

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 9999, display: 'flex', justifyContent: 'flex-end' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 720, height: '100%', background: '#f1f5f9', overflowY: 'auto', boxShadow: '-8px 0 40px rgba(0,0,0,0.2)' }}>
        <div style={{ background: 'linear-gradient(135deg, #ff8c42, #f5591a)', padding: '22px 26px', color: '#fff', position: 'sticky', top: 0, zIndex: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800 }}>{staff}</div>
            <div style={{ fontSize: '0.82rem', opacity: 0.9 }}>Chi tiết cast từng video · từ T{START.m}/{START.y} → nay</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.72rem', opacity: 0.9 }}>Tổng cast</div>
            <div style={{ fontSize: '1.3rem', fontWeight: 800 }}>{fmt(total)} đ</div>
          </div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.25)', border: 'none', color: '#fff', width: 32, height: 32, borderRadius: '50%', cursor: 'pointer', fontSize: '1.1rem', marginLeft: 12 }}>✕</button>
        </div>
        <div style={{ padding: '18px 20px' }}>
          {loading ? <div style={{ textAlign: 'center', color: '#94a3b8', padding: 40 }}>⏳ Đang tải...</div>
            : list.length === 0 ? <div style={{ textAlign: 'center', color: '#94a3b8', padding: 40 }}>Không có video nào rà được ngày air.</div>
              : (
                <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th style={{ ...th, textAlign: 'left' }}>Kênh KOC</th>
                        <th style={{ ...th, textAlign: 'center' }}>Ngày air</th>
                        <th style={th}>Cast</th>
                        <th style={{ ...th, textAlign: 'left' }}>Brand</th>
                        <th style={{ ...th, textAlign: 'center' }}>TT</th>
                      </tr>
                    </thead>
                    <tbody>
                      {list.map((r, i) => (
                        <tr key={i}>
                          <td style={{ ...td, textAlign: 'left' }}>
                            {r.air_link
                              ? <a href={r.air_link} target="_blank" rel="noreferrer" style={{ color: '#7c3aed', textDecoration: 'none', fontWeight: 600 }}>{(r.channel_link && r.channel_link.match(/@[^/?#]+/)) ? r.channel_link.match(/@[^/?#]+/)[0] : '🎬 video'}</a>
                              : ((r.channel_link && (r.channel_link.match(/@[^/?#]+/) || [])[0]) || '—')}
                          </td>
                          <td style={{ ...td, textAlign: 'center', color: '#0891b2', fontWeight: 600 }}>{fmtDate(r.air_date)}</td>
                          <td style={{ ...td, fontWeight: 700 }}>{fmt(r.cast_net)}</td>
                          <td style={{ ...td, textAlign: 'left', color: '#64748b' }}>{r.brand || '—'}</td>
                          <td style={{ ...td, textAlign: 'center' }}>{r.paid ? '✅' : '⏳'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
        </div>
      </div>
    </div>
  );
}

export default BookingBudgetTab;
