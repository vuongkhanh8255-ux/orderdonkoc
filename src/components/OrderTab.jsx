// src/components/OrderTab.jsx

import React, { useState, useMemo, useEffect, Fragment } from 'react';
import { useAppData } from '../context/AppDataContext';
import ResizableHeader from './ResizableHeader';
import { supabase } from '../supabaseClient';
import SearchableDropdown from './SearchableDropdown'; // Shared component
// Import thư viện biểu đồ
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Label, LabelList } from 'recharts';

// Tách 1 chuỗi địa chỉ thành các phần rõ ràng: Tỉnh/TP - Quận/Huyện - Phường/Xã - Số nhà/Đường.
// Quy ước nhập: ngăn cách bằng dấu phẩy, phần cuối là Tỉnh/Thành phố.
const parseDiaChi = (raw) => {
    let s = String(raw || '').replace(/\s+/g, ' ').trim();
    if (!s) return null;
    // Chèn dấu phẩy trước từ khoá hành chính để tách được cả địa chỉ viết LIỀN (không có dấu phẩy)
    s = s.replace(/\s+(phường|xã|thị trấn|quận|huyện|thị xã|tỉnh|thành phố|tp)\b/gi, ', $1');
    const parts = s.split(',').map(p => p.trim()).filter(Boolean);
    if (parts.length < 2) return null; // chưa đủ để tách (cần ít nhất "..., Tỉnh/TP")
    const tinh = parts[parts.length - 1];
    const middle = parts.slice(0, -1);
    const phuongRe = /^(phường|xã|thị trấn|p\.|x\.)\s/i;
    const quanRe = /^(quận|huyện|thị xã|q\.|h\.)\s/i;
    let phuong = '', quan = '';
    const soNhaParts = [];
    middle.forEach(p => {
        if (!phuong && phuongRe.test(p)) phuong = p;
        else if (!quan && quanRe.test(p)) quan = p;
        else soNhaParts.push(p);
    });
    // Nếu không có từ khoá "Phường/Xã" mà còn dư phần giữa → coi phần cuối cùng của số nhà là phường (định dạng "đường, phường, tỉnh")
    if (!phuong && soNhaParts.length > 1) phuong = soNhaParts.pop();
    const soNha = soNhaParts.join(', ');
    return { tinh, quan, phuong, soNha };
};

// ⚠️ Cảnh báo liên hệ KOC: 1 ID kênh gắn >=3 SĐT, hoặc 1 SĐT gắn >=3 ID kênh (rà donguis qua RPC). Thu gọn được.
function KocContactWarnings() {
    const [data, setData] = useState(null);
    const [open, setOpen] = useState(false);
    useEffect(() => {
        let alive = true;
        supabase.rpc('koc_phone_channel_warnings').then(({ data, error }) => { if (alive && !error) setData(data); });
        return () => { alive = false; };
    }, []);
    const kenhSdt = Array.isArray(data?.kenh_nhieu_sdt) ? data.kenh_nhieu_sdt : [];
    const sdtKenh = Array.isArray(data?.sdt_nhieu_kenh) ? data.sdt_nhieu_kenh : [];
    const total = kenhSdt.length + sdtKenh.length;
    if (!data || total === 0) return null;
    const col = (title, items, render) => (
        <div style={{ flex: 1, minWidth: 320 }}>
            <div style={{ fontWeight: 700, color: '#92400e', marginBottom: 6 }}>{title} ({items.length})</div>
            <div style={{ maxHeight: 260, overflowY: 'auto', background: '#fff', borderRadius: 8, border: '1px solid #fde68a' }}>
                {items.map((it, i) => <div key={i} style={{ padding: '8px 10px', borderBottom: '1px solid #fef3c7', fontSize: '0.84rem' }}>{render(it)}</div>)}
            </div>
        </div>
    );
    return (
        <div style={{ background: '#fffbeb', border: '1.5px solid #f59e0b', borderRadius: 12, padding: '14px 18px', marginBottom: '1.5rem' }}>
            <div onClick={() => setOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
                <div style={{ fontWeight: 800, color: '#b45309', fontSize: '1rem' }}>⚠️ Cảnh báo liên hệ KOC ({total}) — {kenhSdt.length} kênh nhiều SĐT · {sdtKenh.length} SĐT nhiều kênh</div>
                <span style={{ color: '#b45309', fontWeight: 700 }}>{open ? '▲ Thu gọn' : '▼ Xem chi tiết'}</span>
            </div>
            {open && (
                <div style={{ display: 'flex', gap: 16, marginTop: 12, flexWrap: 'wrap' }}>
                    {col('🔗 1 ID kênh gắn nhiều SĐT (≥3)', kenhSdt, k => (<>
                        <b>@{k.id_kenh}</b> — <span style={{ color: '#dc2626', fontWeight: 700 }}>{k.so_sdt} SĐT</span>
                        <div style={{ color: '#64748b', fontSize: '0.78rem' }}>{(k.ds_sdt || []).join(' · ')}</div>
                    </>))}
                    {col('📞 1 SĐT gắn nhiều ID kênh (≥3)', sdtKenh, s => (<>
                        <b>{s.sdt}</b> — <span style={{ color: '#dc2626', fontWeight: 700 }}>{s.so_kenh} kênh</span>
                        <div style={{ color: '#64748b', fontSize: '0.78rem' }}>{(s.ds_kenh || []).map(x => '@' + x).join(' · ')}</div>
                    </>))}
                </div>
            )}
        </div>
    );
}

// 📋 Tình trạng lên clip KOC (đơn từ 01/06): liệt kê MỌI kênh đã gửi đơn từ 1/6, đối chiếu với video tải về
// (theo brand/gian hàng) để biết bạn nào ĐÃ lên clip / CHƯA. Gom theo (kênh + brand). Lọc + search + phân trang.
function KocClipStatus() {
    const [rows, setRows] = useState(null);
    const [open, setOpen] = useState(false);
    const [q, setQ] = useState('');
    const [tab, setTab] = useState('pending');   // all | done | pending | unknown
    const [page, setPage] = useState(1);
    const [exp, setExp] = useState(null);        // key dòng đang bung chi tiết
    const [detail, setDetail] = useState({});    // cache chi tiết theo key
    const PAGE = 30;
    const toggleDetail = async (key, idKenh, brand) => {
        if (exp === key) { setExp(null); return; }
        setExp(key);
        if (detail[key]) return;
        const ch = String(idKenh || '').replace(/^@/, '').trim().toLowerCase();
        const { data, error } = await supabase.rpc('koc_clip_detail', { p_ch: ch, p_brand: brand });
        setDetail(d => ({ ...d, [key]: error ? { dons: [], clips: [] } : (data || { dons: [], clips: [] }) }));
    };
    const [loading, setLoading] = useState(false);
    // Tải lại MỖI lần mở panel + có nút Tải lại → không dính data cũ (lúc mở trang sớm video chưa sync xong).
    const reload = () => {
        setLoading(true);
        supabase.rpc('koc_clip_status').then(({ data, error }) => {
            setRows(error ? [] : (Array.isArray(data) ? data : []));
            setLoading(false);
        });
    };
    useEffect(() => { reload(); }, []);
    useEffect(() => { setPage(1); }, [q, tab]);
    if (!rows) return null;
    const stat = (r) => (!r.mapped ? 'unknown' : r.co_clip ? 'done' : 'pending');
    const cnt = { all: rows.length, done: 0, pending: 0, unknown: 0 };
    rows.forEach(r => { cnt[stat(r)]++; });
    const kw = q.trim().toLowerCase();
    const filtered = rows.filter(r => {
        if (tab !== 'all' && stat(r) !== tab) return false;
        if (kw && ![r.id_kenh, r.brand, r.staff].some(x => String(x || '').toLowerCase().includes(kw))) return false;
        return true;
    });
    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE));
    const safePage = Math.min(page, totalPages);
    const paged = filtered.slice((safePage - 1) * PAGE, safePage * PAGE);
    const chip = (key, label, color) => (
        <button onClick={() => setTab(key)} style={{ padding: '5px 12px', borderRadius: 8, border: '1px solid ' + (tab === key ? color : '#cbd5e1'), background: tab === key ? color : '#fff', color: tab === key ? '#fff' : '#475569', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' }}>{label}</button>
    );
    return (
        <div style={{ background: '#f0f9ff', border: '1.5px solid #0ea5e9', borderRadius: 12, padding: '14px 18px', marginBottom: '1.5rem' }}>
            <div onClick={() => setOpen(o => { if (!o) reload(); return !o; })} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
                <div style={{ fontWeight: 800, color: '#0369a1', fontSize: '1rem' }}>📋 Tình trạng lên clip KOC — đơn từ 01/06 ({cnt.all} kênh · <span style={{ color: '#16a34a' }}>{cnt.done} đã lên</span> · <span style={{ color: '#dc2626' }}>{cnt.pending} chưa</span>){loading ? ' · ⏳ đang tải…' : ''}</div>
                <span style={{ color: '#0369a1', fontWeight: 700 }}>{open ? '▲ Thu gọn' : '▼ Xem chi tiết'}</span>
            </div>
            {open && (
                <div style={{ marginTop: 12 }}>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10, alignItems: 'center' }}>
                        {chip('pending', `❌ Chưa lên (${cnt.pending})`, '#dc2626')}
                        {chip('done', `✅ Đã lên (${cnt.done})`, '#16a34a')}
                        {chip('all', `Tất cả (${cnt.all})`, '#0ea5e9')}
                        {chip('unknown', `❔ Chưa rõ (${cnt.unknown})`, '#64748b')}
                        <input value={q} onChange={e => setQ(e.target.value)} placeholder="🔎 Tìm kênh / brand / nhân sự…"
                            style={{ flex: 1, minWidth: 200, maxWidth: 320, padding: '6px 10px', borderRadius: 8, border: '1px solid #7dd3fc', fontSize: '0.85rem' }} />
                        <button onClick={(e) => { e.stopPropagation(); reload(); }} disabled={loading}
                            style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #0ea5e9', background: '#fff', color: '#0369a1', fontWeight: 700, fontSize: '0.82rem', cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.6 : 1 }}>{loading ? '⏳ Đang tải…' : '🔄 Tải lại'}</button>
                    </div>
                    <div style={{ maxHeight: 420, overflowY: 'auto', background: '#fff', borderRadius: 8, border: '1px solid #bae6fd' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                            <thead>
                                <tr style={{ background: '#e0f2fe', color: '#075985', textAlign: 'left', position: 'sticky', top: 0 }}>
                                    <th style={{ padding: '6px 10px' }}>ID kênh</th>
                                    <th style={{ padding: '6px 10px' }}>Brand</th>
                                    <th style={{ padding: '6px 10px' }}>Nhân sự</th>
                                    <th style={{ padding: '6px 10px', textAlign: 'center' }}>Số đơn</th>
                                    <th style={{ padding: '6px 10px' }}>Gửi gần nhất</th>
                                    <th style={{ padding: '6px 10px' }}>Trạng thái clip</th>
                                </tr>
                            </thead>
                            <tbody>
                                {paged.map((it, i) => {
                                    const s = stat(it);
                                    const u = String(it.id_kenh || '').replace(/^@/, '');
                                    const key = u + '|' + it.brand;
                                    const d = detail[key];
                                    return (
                                        <Fragment key={key + i}>
                                        <tr onClick={() => toggleDetail(key, it.id_kenh, it.brand)} style={{ borderTop: '1px solid #f1f5f9', cursor: 'pointer', background: exp === key ? '#f0f9ff' : 'transparent' }}>
                                            <td style={{ padding: '6px 10px', fontWeight: 600 }}>
                                                <span style={{ color: '#94a3b8', marginRight: 4 }}>{exp === key ? '▾' : '▸'}</span>
                                                <a href={`https://www.tiktok.com/@${u}`} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} style={{ color: '#0284c7', textDecoration: 'none' }}>@{u}</a>
                                            </td>
                                            <td style={{ padding: '6px 10px' }}>{it.brand}</td>
                                            <td style={{ padding: '6px 10px', color: '#475569' }}>{it.staff || '—'}</td>
                                            <td style={{ padding: '6px 10px', textAlign: 'center' }}>{it.so_don}</td>
                                            <td style={{ padding: '6px 10px' }}>{it.gui_cuoi} <span style={{ color: '#94a3b8' }}>({it.days_ago}n)</span></td>
                                            <td style={{ padding: '6px 10px' }}>
                                                {s === 'done' ? <span style={{ color: '#16a34a', fontWeight: 700 }}>✅ {it.so_clip} clip{it.clip_cuoi ? ` · ${it.clip_cuoi}` : ''}</span>
                                                    : s === 'pending' ? <span style={{ color: '#dc2626', fontWeight: 700 }}>❌ Chưa lên</span>
                                                        : <span style={{ color: '#64748b' }}>❔ Chưa rõ (brand chưa map shop)</span>}
                                            </td>
                                        </tr>
                                        {exp === key && (
                                            <tr style={{ background: '#f8fafc' }}>
                                                <td colSpan={6} style={{ padding: '10px 16px' }}>
                                                    {!d ? <span style={{ color: '#94a3b8' }}>⏳ Đang tải chi tiết…</span> : (
                                                        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                                                            <div style={{ minWidth: 240, flex: 1 }}>
                                                                <div style={{ fontWeight: 700, color: '#0369a1', marginBottom: 4 }}>📦 Đơn đã gửi ({(d.dons || []).length})</div>
                                                                {(d.dons || []).length === 0 ? <span style={{ color: '#94a3b8' }}>—</span> : (d.dons || []).map((o, k) => (
                                                                    <div key={k} style={{ fontSize: '0.78rem', color: '#334155', marginBottom: 3 }}><b>{o.ngay}</b> · {o.sp || '(không ghi SP)'} <span style={{ color: '#94a3b8' }}>· {o.staff || '—'}</span></div>
                                                                ))}
                                                            </div>
                                                            <div style={{ minWidth: 240, flex: 1 }}>
                                                                <div style={{ fontWeight: 700, color: '#16a34a', marginBottom: 4 }}>🎬 Clip đã lên ({(d.clips || []).length})</div>
                                                                {(d.clips || []).length === 0 ? <span style={{ color: '#dc2626' }}>Chưa thấy clip nào</span> : (d.clips || []).map((c, k) => (
                                                                    <div key={k} style={{ fontSize: '0.78rem', marginBottom: 3 }}>
                                                                        <a href={`https://www.tiktok.com/@${c.username}/video/${c.id}`} target="_blank" rel="noreferrer" style={{ color: '#0284c7', textDecoration: 'none' }}>▶ {c.post}</a>
                                                                        <span style={{ color: '#64748b' }}> · {Number(c.views || 0).toLocaleString('vi-VN')} view</span>
                                                                        <span style={{ color: '#94a3b8' }}> · {c.title ? c.title.slice(0, 40) : ''}</span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                </td>
                                            </tr>
                                        )}
                                        </Fragment>
                                    );
                                })}
                                {paged.length === 0 && <tr><td colSpan={6} style={{ padding: 20, textAlign: 'center', color: '#94a3b8' }}>Không có dòng nào.</td></tr>}
                            </tbody>
                        </table>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, fontSize: '0.8rem', color: '#475569' }}>
                        <span>Hiện {filtered.length} kênh{kw ? ' (đã lọc)' : ''}</span>
                        {totalPages > 1 && (
                            <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={safePage === 1} style={{ padding: '3px 10px', borderRadius: 6, border: '1px solid #bae6fd', background: '#fff', cursor: safePage === 1 ? 'default' : 'pointer' }}>‹</button>
                                Trang {safePage}/{totalPages}
                                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={safePage === totalPages} style={{ padding: '3px 10px', borderRadius: 6, border: '1px solid #bae6fd', background: '#fff', cursor: safePage === totalPages ? 'default' : 'pointer' }}>›</button>
                            </span>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

// ⚠️ #4 Cảnh báo KOC chưa lên video: đơn gửi 14–45 ngày trước mà Hiệu suất KOC chưa đo được video nào của kênh đó (theo brand/gian hàng). eHerb + eHerb HCM tính chung. Admin gỡ tay; hệ thống tự gỡ khi tải được video trùng kênh. Thu gọn được.
function KocNoVideoWarnings({ email }) {
    const [rows, setRows] = useState(null);
    const [open, setOpen] = useState(false);
    const [q, setQ] = useState('');
    const [busy, setBusy] = useState({});
    const [loading, setLoading] = useState(false);
    const reload = () => {
        setLoading(true);
        supabase.rpc('koc_no_video_warnings').then(({ data, error }) => {
            setRows(error ? [] : (Array.isArray(data) ? data : []));
            setLoading(false);
        });
    };
    useEffect(() => { reload(); }, []);
    const handleGo = async (it) => {
        if (!window.confirm(`Gỡ cảnh báo cho kênh @${it.id_kenh} (brand ${it.brand})?`)) return;
        setBusy(b => ({ ...b, [it.dongui_id]: true }));
        const { error } = await supabase.from('koc_video_warning_dismissed')
            .insert({ dongui_id: it.dongui_id, dismissed_by: email || null });
        if (error) { alert('Lỗi gỡ: ' + error.message); setBusy(b => ({ ...b, [it.dongui_id]: false })); return; }
        setRows(rs => (rs || []).filter(r => r.dongui_id !== it.dongui_id));
    };
    if (!rows || rows.length === 0) return null;
    const kw = q.trim().toLowerCase();
    const filtered = kw
        ? rows.filter(r => [r.id_kenh, r.brand, r.staff].some(x => String(x || '').toLowerCase().includes(kw)))
        : rows;
    const sorted = [...filtered].sort((a, b) => (b.days_ago || 0) - (a.days_ago || 0));
    return (
        <div style={{ background: '#fff7ed', border: '1.5px solid #ea580c', borderRadius: 12, padding: '14px 18px', marginBottom: '1.5rem' }}>
            <div onClick={() => setOpen(o => { if (!o) reload(); return !o; })} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
                <div style={{ fontWeight: 800, color: '#c2410c', fontSize: '1rem' }}>🎬 Cảnh báo KOC chưa lên video sau 14 ngày ({rows.length}){loading ? ' · ⏳ đang tải…' : ''}</div>
                <span style={{ color: '#c2410c', fontWeight: 700 }}>{open ? '▲ Thu gọn' : '▼ Xem chi tiết'}</span>
            </div>
            {open && (
                <div style={{ marginTop: 12 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
                        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Lọc theo kênh / brand / nhân sự…"
                            style={{ flex: 1, minWidth: 200, maxWidth: 360, padding: '6px 10px', borderRadius: 8, border: '1px solid #fdba74', fontSize: '0.85rem' }} />
                        <button onClick={(e) => { e.stopPropagation(); reload(); }} disabled={loading}
                            style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #ea580c', background: '#fff', color: '#c2410c', fontWeight: 700, fontSize: '0.82rem', cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.6 : 1 }}>{loading ? '⏳ Đang tải…' : '🔄 Tải lại'}</button>
                    </div>
                    <div style={{ maxHeight: 340, overflowY: 'auto', background: '#fff', borderRadius: 8, border: '1px solid #fed7aa' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                            <thead>
                                <tr style={{ background: '#ffedd5', color: '#9a3412', textAlign: 'left' }}>
                                    <th style={{ padding: '6px 10px' }}>ID kênh</th>
                                    <th style={{ padding: '6px 10px' }}>Brand</th>
                                    <th style={{ padding: '6px 10px' }}>Nhân sự</th>
                                    <th style={{ padding: '6px 10px' }}>Ngày gửi</th>
                                    <th style={{ padding: '6px 10px', textAlign: 'center' }}>Số ngày</th>
                                    <th style={{ padding: '6px 10px', textAlign: 'center' }}></th>
                                </tr>
                            </thead>
                            <tbody>
                                {sorted.map((it) => (
                                    <tr key={it.dongui_id} style={{ borderTop: '1px solid #fef3c7' }}>
                                        <td style={{ padding: '6px 10px', fontWeight: 600 }}>@{it.id_kenh}</td>
                                        <td style={{ padding: '6px 10px' }}>{it.brand}</td>
                                        <td style={{ padding: '6px 10px', color: '#475569' }}>{it.staff || '—'}</td>
                                        <td style={{ padding: '6px 10px' }}>{it.ngay_gui}</td>
                                        <td style={{ padding: '6px 10px', textAlign: 'center', color: '#dc2626', fontWeight: 700 }}>{it.days_ago}</td>
                                        <td style={{ padding: '6px 10px', textAlign: 'center' }}>
                                            <button onClick={() => handleGo(it)} disabled={busy[it.dongui_id]}
                                                style={{ padding: '3px 10px', borderRadius: 6, border: '1px solid #ea580c', background: busy[it.dongui_id] ? '#fed7aa' : '#fff', color: '#c2410c', fontWeight: 700, cursor: 'pointer', fontSize: '0.78rem' }}>
                                                {busy[it.dongui_id] ? '…' : 'Gỡ'}
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {kw && <div style={{ marginTop: 6, color: '#9a3412', fontSize: '0.78rem' }}>Hiện {sorted.length}/{rows.length}</div>}
                </div>
            )}
        </div>
    );
}

// Cache dữ liệu hành chính (34 tỉnh/thành + ~3.300 phường/xã, cơ cấu mới 2025) — tải 1 lần cho cả app.
let _geoCache = null, _geoPromise = null;
function loadGeo() {
    if (_geoCache) return Promise.resolve(_geoCache);
    if (!_geoPromise) {
        _geoPromise = Promise.all([
            fetch('/geo/provinces.json').then(r => r.json()),
            fetch('/geo/wards.json').then(r => r.json()),
        ]).then(([provinces, wards]) => { _geoCache = { provinces, wards }; return _geoCache; })
          .catch(() => ({ provinces: [], wards: [] }));
    }
    return _geoPromise;
}
const stripAdminPrefix = (s) => String(s || '').toLowerCase()
    .replace(/^(tỉnh|thành phố|tp\.?|phường|xã|thị trấn|đặc khu|quận|huyện)\s+/i, '').trim();

// Ô địa chỉ nhận hàng kiểu Shopee: Thành phố (bắt buộc) → Phường/Xã (bắt buộc, lọc theo TP) → Đường (tự do).
// Ghép lại thành chuỗi "Đường, Phường X, Tỉnh Y" lưu vào diaChi để phần xem trước / bảng / parse cũ vẫn chạy.
function AddressPicker({ value, onChange }) {
    const [geo, setGeo] = useState(null);
    const [tinhCode, setTinhCode] = useState('');
    const [phuongCode, setPhuongCode] = useState('');
    const [duong, setDuong] = useState('');
    const inited = React.useRef(false);

    useEffect(() => { let alive = true; loadGeo().then(g => { if (alive) setGeo(g); }); return () => { alive = false; }; }, []);

    // Tải xong → cố gắng tách chuỗi diaChi sẵn có để điền lại các ô (không đụng onChange, giữ nguyên giá trị cũ).
    useEffect(() => {
        if (!geo || inited.current) return;
        inited.current = true;
        const raw = String(value || '').trim();
        if (!raw) return;
        const parts = raw.split(',').map(s => s.trim()).filter(Boolean);
        if (parts.length < 2) { setDuong(raw); return; }
        const tail = stripAdminPrefix(parts[parts.length - 1]);
        const prov = geo.provinces.find(p => stripAdminPrefix(p.name) === tail || stripAdminPrefix(p.fullName) === tail);
        if (!prov) { setDuong(raw); return; }
        setTinhCode(prov.code);
        const wardsP = geo.wards.filter(w => w.provinceCode === prov.code);
        let wardIdx = -1, ward = null;
        for (let i = 0; i < parts.length - 1; i++) {
            const m = wardsP.find(w => stripAdminPrefix(w.name) === stripAdminPrefix(parts[i]));
            if (m) { ward = m; wardIdx = i; break; }
        }
        if (ward) { setPhuongCode(ward.code); setDuong(parts.slice(0, wardIdx).join(', ')); }
        else setDuong(parts.slice(0, -1).join(', '));
    }, [geo, value]);

    const provinces = geo?.provinces || [];
    const wardsForTinh = useMemo(
        () => (geo && tinhCode ? geo.wards.filter(w => w.provinceCode === tinhCode) : []),
        [geo, tinhCode]
    );

    const recompose = (d, pCode, tCode) => {
        const ward = geo?.wards.find(w => w.code === pCode);
        if (pCode && ward && tCode) onChange(`${d.trim() ? d.trim() + ', ' : ''}${ward.fullName}`);
        else onChange('');
    };
    const onTinh = (code) => { setTinhCode(code); setPhuongCode(''); recompose(duong, '', code); };
    const onPhuong = (code) => { setPhuongCode(code); recompose(duong, code, tinhCode); };
    const onDuongChange = (val) => { setDuong(val); recompose(val, phuongCode, tinhCode); };

    const provOpts = provinces.map(p => ({ value: p.code, label: p.fullName }));
    const wardOpts = wardsForTinh.map(w => ({ value: w.code, label: w.fullName.split(',')[0] }));

    return (
        <div>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', color: '#374151' }}>Địa chỉ nhận hàng (*)</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                    <div style={{ fontSize: '0.78rem', color: '#6B7280', marginBottom: 4 }}>🏙️ Tỉnh / Thành phố (*)</div>
                    <SearchableDropdown options={provOpts} value={tinhCode} onChange={onTinh}
                        placeholder={geo ? 'Chọn Tỉnh / Thành phố' : 'Đang tải…'} />
                </div>
                <div>
                    <div style={{ fontSize: '0.78rem', color: '#6B7280', marginBottom: 4 }}>📍 Phường / Xã (*)</div>
                    {tinhCode
                        ? <SearchableDropdown options={wardOpts} value={phuongCode} onChange={onPhuong} placeholder="Chọn Phường / Xã" />
                        : <div style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid #eee', background: '#f9fafb', color: '#999', fontSize: 14, minHeight: 40, display: 'flex', alignItems: 'center' }}>Chọn Tỉnh/TP trước</div>}
                </div>
            </div>
            <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: '0.78rem', color: '#6B7280', marginBottom: 4 }}>🏠 Số nhà / Đường</div>
                <input type="text" value={duong} onChange={e => onDuongChange(e.target.value)} placeholder="VD: 123 Lê Lợi" style={{ width: '100%' }} />
            </div>
            {value && value.trim() && (
                <div style={{ marginTop: '10px', padding: '10px 14px', background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: '8px', fontSize: '0.88rem', color: '#9A3412' }}>
                    📦 Giao đến: <b>{value}</b>
                </div>
            )}
        </div>
    );
}

// Nhân sự ĐÃ NGHỈ/ẩn — không hiện trong dropdown chọn nhân sự (Khánh 1/7). KHÔNG xoá DB (đơn cũ còn tham
// chiếu) → chỉ lọc khỏi dropdown. Đơn cũ vẫn hiện đúng tên người gửi trong bảng.
const ORDER_HIDDEN_STAFF = ['Ngọc Quỳnh', 'Trúc Linh', 'Thiệu Huy', 'Anh Kiệt'];
const isHiddenStaffName = (n) => ORDER_HIDDEN_STAFF.includes((n || '').trim());

const OrderTab = ({ currentUser } = {}) => {
    const {
        user,
        brands, nhanSus, sanPhams,
        isLoading, hoTen, setHoTen, idKenh, setIdKenh, sdt, setSdt,
        diaChi, setDiaChi, cccd, setCccd, selectedBrand, setSelectedBrand,
        selectedSanPhams, setSelectedSanPhams, selectedNhanSu, setSelectedNhanSu,
        loaiShip, setLoaiShip, donHangs, selectedOrders, currentPage, setCurrentPage,
        totalOrderCount, filterIdKenh, setFilterIdKenh, filterSdt, setFilterSdt,
        filterBrand, setFilterBrand, filterSanPham, setFilterSanPham, filterNhanSu, setFilterNhanSu,
        filterNgayStart, setFilterNgayStart, filterNgayEnd, setFilterNgayEnd, filterLoaiShip, setFilterLoaiShip, filterEditedStatus, setFilterEditedStatus,
        productSearchTerm, setProductSearchTerm, summaryDate, setSummaryDate, productSummary,
        rawSummaryData, isSummarizing,
        reportMonth, setReportMonth, reportYear, setReportYear,
        reportData, isReportLoading, sortConfig, editingDonHang, setEditingDonHang, isPastDeadlineForNewOrders,
        columnWidths, handleResize, handleQuantityChange,
        filterSanPhams, handleIdKenhBlur, handleSdtBlur,
        clearFilters, handleGetSummary, handleGenerateReport, requestSort, handleEdit,
        handleCancelEdit, handleUpdate, handleSelect, handleSelectAll, handleBulkUpdateStatus,
        handleExport, handleExportAll, handleExportSPX, sortedReportRows, totalsRow, totalPages,
        handleDeleteOrder, loadInitialData,

        // Dữ liệu Chart
        chartNhanSu, setChartNhanSu, chartData, isChartLoading
    } = useAppData();

    // Blacklist
    const [blacklistChannels, setBlacklistChannels] = useState([]);
    const [blacklistLoaded, setBlacklistLoaded] = useState(false);
    // Blacklist là chốt CHẶN TẠO ĐƠN — đọc theo trang (Supabase cắt 1000 dòng/lượt, blacklist đã 888 kênh)
    const fetchBlacklistAll = async () => {
        let all = [];
        for (let pg = 0; pg < 10; pg++) {
            const { data } = await supabase.from('koc_blacklist').select('id_kenh').range(pg * 1000, (pg + 1) * 1000 - 1);
            all = all.concat(data || []);
            if (!data || data.length < 1000) break;
        }
        return all.map(r => r.id_kenh);
    };
    useEffect(() => {
        fetchBlacklistAll().then(list => { setBlacklistChannels(list); setBlacklistLoaded(true); },
            (error) => { console.error('Blacklist load failed:', error); setBlacklistLoaded(true); });
    }, []);

    // ── CHẶN ORDER KÊNH YẾU: cào view 7 video mới (bỏ video ghim), < 1500 → không cho tạo đơn ──
    const VIEW_GATE_ON = true;                       // cờ bật/tắt (đổi false = về y như cũ, không chặn)
    const [chanView, setChanView] = useState(null);  // { loading, username, total_view, video_count, dat, videos, err, nguong }
    const normKenh = (k) => String(k || '').trim().replace(/^@/, '').replace(/.*tiktok\.com\/@?/i, '').replace(/[/?#].*$/, '').toLowerCase();
    const checkChannelView = async (raw) => {
        const u = normKenh(raw);
        if (!u) { setChanView(null); return; }
        setChanView({ loading: true, username: u });
        try {
            const { data, error } = await supabase.functions.invoke('koc-channel-views', { body: { username: u } });
            if (error || !data?.ok) { setChanView({ username: u, err: 'Không kiểm tra được view (thử lại sau)' }); return; }
            setChanView({ username: u, total_view: data.total_view, video_count: data.video_count, dat: data.dat, videos: data.videos || [], err: data.err, busy: data.busy, by_follower: data.by_follower, follower_count: data.follower_count, nguong: data.nguong || 1500 });
        } catch (e) { setChanView({ username: u, err: e.message }); }
    };
    useEffect(() => { setChanView(null); }, [idKenh]);  // đổi ID kênh → xoá kết quả cũ

    // Popup cào view cho 1 kênh trong BẢNG DANH SÁCH đơn (hiện ảnh + view như tool ngoài)
    const [viewPopup, setViewPopup] = useState(null);   // { username, loading, ...data, err }
    const openViewPopup = async (raw, opts = {}) => {
        const { big = false, force = false } = opts;
        const u = normKenh(raw);
        if (!u) return;
        setViewPopup({ username: u, loading: true, big });
        try {
            const { data, error } = await supabase.functions.invoke('koc-channel-views', { body: { username: u, force } });
            if (error || !data?.ok) setViewPopup({ username: u, big, err: 'Không cào được (thử lại)' });
            else setViewPopup({ username: u, big, ...data });
        } catch (e) { setViewPopup({ username: u, big, err: e.message }); }
    };
    // Lấy link mp4 trực tiếp để PHÁT TẠI CHỖ (lách chặn embed video gắn giỏ)
    const openPlay = async (videoId, uname) => {
        setViewPopup(vp => ({ ...vp, play: videoId, playUrl: null, playErr: null }));
        try {
            const { data, error } = await supabase.functions.invoke('koc-channel-views', { body: { video_id: videoId, vuser: uname } });
            const link = data?.hdplay || data?.play;
            if (error || !data?.ok || !link) setViewPopup(vp => vp?.play === videoId ? { ...vp, playErr: 'Không tải được video (thử lại hoặc mở TikTok)' } : vp);
            else setViewPopup(vp => vp?.play === videoId ? { ...vp, playUrl: link } : vp);
        } catch (e) { setViewPopup(vp => vp?.play === videoId ? { ...vp, playErr: e.message } : vp); }
    };

    // ── KOC ƯU TIÊN: được tạo đơn dù không đủ view (bỏ qua check). Chỉ ADMIN thêm/xoá. ──
    const isAdmin = currentUser?.role === 'admin';
    const [whitelist, setWhitelist] = useState([]);   // [{username, note}]
    const [wlInput, setWlInput] = useState('');
    const [wlOpen, setWlOpen] = useState(false);
    const whitelistSet = useMemo(() => new Set(whitelist.map(w => w.username)), [whitelist]);
    const loadWhitelist = () => supabase.from('koc_view_whitelist').select('username, note').order('created_at', { ascending: false }).then(({ data }) => setWhitelist(data || []));
    useEffect(() => { loadWhitelist(); }, []);
    const addWhitelist = async () => {
        const u = normKenh(wlInput);
        if (!u) return;
        const { error } = await supabase.from('koc_view_whitelist').upsert({ username: u, added_by: currentUser?.username || 'admin' }, { onConflict: 'username' });
        if (error) { alert('Lỗi thêm: ' + error.message); return; }
        setWlInput(''); loadWhitelist();
    };
    const removeWhitelist = async (u) => {
        const { error } = await supabase.from('koc_view_whitelist').delete().eq('username', u);
        if (error) { alert('Lỗi xoá: ' + error.message); return; }
        loadWhitelist();
    };

    // #3: Kênh + brand đã có người gắn tag (approved) ở Hiệu suất KOC → không ai gửi brand đó cho kênh đó nữa.
    const [assignments, setAssignments] = useState([]); // {koc_id, brand_name, staff_name}
    useEffect(() => {
        (async () => { // đọc theo trang (Supabase cắt 1000 dòng/lượt — assignments đang tăng dần)
            let all = [];
            for (let pg = 0; pg < 10; pg++) {
                const { data } = await supabase.from('koc_brand_assignments').select('koc_id, brand_name, staff_name').eq('status', 'approved').range(pg * 1000, (pg + 1) * 1000 - 1);
                all = all.concat(data || []);
                if (!data || data.length < 1000) break;
            }
            setAssignments(all);
        })().catch(() => {});
    }, []);

    // State cục bộ
    const [cast, setCast] = useState('0');
    const [cms, setCms] = useState('10%');
    const [videoCounts, setVideoCounts] = useState({});
    const [productCache, setProductCache] = useState({});
    const [confirmOpen, setConfirmOpen] = useState(false); // modal xác nhận lại đơn bất thường

    // --- CUSTOM AXIS TICK (HIGHLIGHT T7, CN) ---
    const CustomizedAxisTick = (props) => {
        const { x, y, payload } = props;
        const dayNum = parseInt(payload.value.replace('Ngày ', ''), 10);
        const dateObj = new Date(reportYear, reportMonth - 1, dayNum);
        const dayOfWeek = dateObj.getDay(); // 0 là CN, 6 là T7
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

        return (
            <g transform={`translate(${x},${y})`}>
                <text
                    x={0} y={0} dy={16}
                    textAnchor="middle"
                    fill={isWeekend ? "#D42426" : "#666"}
                    fontWeight={isWeekend ? "bold" : "normal"}
                    fontSize={12}
                >
                    {dayNum}
                </text>
            </g>
        );
    };

    const handleVideoCountChange = (productId, val) => {
        setVideoCounts(prev => ({ ...prev, [productId]: val }));
    };

    const handleLocalQuantityChange = (productId, val) => {
        handleQuantityChange(productId, val);
        const sp = sanPhams.find(s => String(s.id) === String(productId));
        if (sp) {
            let brandName = sp?.brands?.ten_brand;
            if (!brandName && sp?.brand_id) {
                const b = brands.find(br => String(br.id) === String(sp.brand_id));
                if (b) brandName = b.ten_brand;
            }
            if (!brandName && selectedBrand) {
                const b = brands.find(br => String(br.id) === String(selectedBrand));
                if (b) brandName = b.ten_brand;
            }

            setProductCache(prev => ({
                ...prev,
                [productId]: {
                    ten_sanpham: sp.ten_sanpham,
                    ten_brand: brandName || 'Unknown',
                    brand_id: sp.brand_id || selectedBrand
                }
            }));
        }
    };

    const formatCurrency = (val) => {
        if (!val) return '';
        return String(val).replace(/\D/g, '').replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    };
    const parseMoney = (str) => parseFloat(String(str).replace(/[^\d]/g, '')) || 0;

    const previewList = useMemo(() => {
        return Object.keys(selectedSanPhams)
            .filter(id => selectedSanPhams[id] > 0)
            .map(id => {
                let info = productCache[id];
                if (!info) {
                    const sp = sanPhams.find(s => String(s.id) === String(id));
                    if (sp) {
                        let bName = sp.brands?.ten_brand;
                        if (!bName && sp.brand_id) {
                            const b = brands.find(br => String(br.id) === String(sp.brand_id));
                            if (b) bName = b.ten_brand;
                        }
                        if (!bName && selectedBrand) {
                            const b = brands.find(br => String(br.id) === String(selectedBrand));
                            if (b) bName = b.ten_brand;
                        }
                        info = { ten_sanpham: sp.ten_sanpham, ten_brand: bName || 'Unknown', brand_id: sp.brand_id };
                    }
                }
                const slVideoRaw = videoCounts[id] !== undefined ? videoCounts[id] : 1;
                return {
                    id,
                    ten_brand: info?.ten_brand || 'Unknown',
                    ten_sanpham: info?.ten_sanpham || 'Unknown',
                    so_luong: selectedSanPhams[id],
                    sl_video: parseInt(slVideoRaw),
                    brand_id: info?.brand_id || selectedBrand
                };
            });
    }, [selectedSanPhams, videoCounts, productCache, sanPhams, brands, selectedBrand]);

    const ORDERS_PER_PAGE = 50;
    const pageNumbers = [];
    const maxButtons = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxButtons / 2));
    let endPage = Math.min(totalPages, startPage + maxButtons - 1);
    if (endPage - startPage + 1 < maxButtons) { startPage = Math.max(1, endPage - maxButtons + 1); }
    for (let i = startPage; i <= endPage; i++) { pageNumbers.push(i); }

    const isDonDaDong = (status) => {
        if (!status) return false;
        return String(status).toLowerCase().includes("đã đóng");
    };

    const handleSafeDelete = (donHang) => {
        if (isDonDaDong(donHang.trang_thai)) {
            alert("❌ KHÔNG THỂ XÓA: Đơn hàng này ĐÃ ĐÓNG!");
            return;
        }
        handleDeleteOrder(donHang);
    };

    const handleBulkDelete = async () => {
        if (selectedOrders.size === 0) return;
        const ordersToDelete = donHangs.filter(order => selectedOrders.has(order.id));
        if (ordersToDelete.some(order => isDonDaDong(order.trang_thai))) {
            alert("❌ LỖI: Có đơn hàng ĐÃ ĐÓNG trong danh sách chọn.");
            return;
        }

        // Logic cũ: Có thể giữ lại hoặc bỏ tùy ý (để giữ nguyên như file cũ của bạn)
        const homNay = new Date();
        const invalidOrders = ordersToDelete.filter(order => {
            const ngayTao = new Date(order.ngay_gui);
            const diffTime = Math.abs(homNay - ngayTao);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            return diffDays > 3;
        });
        // if (invalidOrders.length > 0) { ... } 

        if (window.confirm(`⚠️ CẢNH BÁO: Xóa vĩnh viễn ${selectedOrders.size} đơn hàng hợp lệ?`)) {
            try {
                for (const order of ordersToDelete) {
                    await handleDeleteOrder(order);
                }
                setSelectedOrders(new Set());
            } catch (error) {
                alert("❌ Lỗi xóa: " + error.message);
            }
        }
    };

    const handleCustomSubmit = async (e) => {
        e.preventDefault();
        if (!idKenh || !hoTen || !selectedNhanSu) { alert("Vui lòng điền đủ thông tin bắt buộc!"); return; }
        if (!diaChi || !diaChi.trim()) { alert("Vui lòng chọn Tỉnh/Thành phố và Phường/Xã nhận hàng!"); return; }
        if (previewList.length === 0) { alert("Vui lòng chọn ít nhất 1 sản phẩm!"); return; }

        // CHẶN: chỉ cho gửi khi kênh ĐẠT (cào được + tổng view 7 video >= 1500).
        // Không ĐẠT vì bất kỳ lý do (view yếu HOẶC ID kênh sai/không tìm thấy) → KHÔNG cho gửi (chống gõ ID giả né check).
        // KOC ưu tiên (admin thêm) → BỎ QUA check hoàn toàn.
        if (VIEW_GATE_ON && !whitelistSet.has(normKenh(idKenh))) {
            if (!chanView || chanView.loading || chanView.username !== normKenh(idKenh)) {
                checkChannelView(idKenh);
                alert('⏳ Đang kiểm tra view kênh (7 video, bỏ ghim)... đợi 2-3 giây rồi bấm "Tạo đơn" lại nha.');
                return;
            }
            if (!chanView.dat) {
                if (chanView.busy) {
                    // Dịch vụ cào (tikwm) BẬN/không cào nổi kênh này → KHÔNG chặn cứng (kênh vẫn có thật).
                    // Cho phép tạo đơn nếu nhân sự xác nhận, để 1 kênh tikwm cào không nổi không kẹt đơn mãi.
                    const ok = window.confirm(`⚠️ Dịch vụ cào view đang bận — chưa kiểm tra được view kênh @${chanView.username} lúc này (KHÔNG phải lỗi ID kênh).\n\n• Bấm OK = VẪN TẠO ĐƠN (bỏ qua kiểm tra view lần này)\n• Bấm Cancel = lát bấm 🔄 cào lại rồi tạo`);
                    if (!ok) return;
                    // OK → cho qua, tạo đơn bình thường
                } else if (chanView.err) {
                    alert(`🚫 Kênh @${chanView.username}: ${chanView.err}\n→ ID kênh sai / không tìm thấy nên KHÔNG gửi được.\nKiểm tra lại ID kênh, hoặc bấm 🔄 cào lại. Nếu chắc ID đúng mà vẫn lỗi → báo admin.`);
                    return;
                } else {
                    alert(`🚫 Kênh @${chanView.username} — tổng view ${chanView.video_count} video (bỏ ghim) = ${Number(chanView.total_view).toLocaleString('vi-VN')} < ${Number(chanView.nguong).toLocaleString('vi-VN')}.\nKênh chưa đủ view → KHÔNG gửi được.`);
                    return;
                }
            }
        }

        // Blacklist check — nếu chưa load được thì block lại, reload rồi thử
        if (!blacklistLoaded) {
            alert('⏳ Đang tải danh sách blacklist, vui lòng thử lại sau giây lát.');
            fetchBlacklistAll().then(list => { setBlacklistChannels(list); setBlacklistLoaded(true); }, () => {});
            return;
        }
        const normK = (k) => String(k || '').trim().replace(/^@/, '').toLowerCase();
        if (blacklistChannels.map(c => normK(c)).includes(normK(idKenh))) {
            alert(`🚫 Kênh "${idKenh}" đang trong danh sách Black List!\nKhông thể tạo đơn hàng cho kênh này.`);
            return;
        }

        // #3: Kênh + brand đã có NGƯỜI KHÁC gắn tag (approved) ở Hiệu suất KOC → CHẶN gửi brand đó cho kênh đó (brand khác vẫn gửi được).
        // Nếu chính người đang gửi là người gắn tag thì KHÔNG chặn (không tự trùng với chính mình).
        const normBrand = (b) => String(b || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        const normStaff = (s) => String(s || '').trim().toLowerCase();
        const orderBrands = [...new Set(previewList.map(it => normBrand(it.ten_brand)).filter(Boolean))];
        const ch = normK(idKenh);
        const senderName = normStaff(nhanSus.find(n => String(n.id) === String(selectedNhanSu))?.ten_nhansu);
        const conflict = assignments.find(a => normK(a.koc_id) === ch && orderBrands.includes(normBrand(a.brand_name)) && normStaff(a.staff_name) !== senderName);
        if (conflict) {
            alert(`🚫 Kênh "${idKenh}" đã được "${conflict.staff_name}" gắn brand "${conflict.brand_name}" ở Hiệu suất KOC.\nKhông gửi sản phẩm brand này cho kênh này nữa (có thể gửi brand KHÁC).`);
            return;
        }

        // ⚠️ Đơn bất thường → bắt xác nhận lại 1 lần nữa (tránh kế toán phải hỏi lại):
        //   - có sản phẩm số lượng TỪ 2 trở lên, HOẶC  - đơn có từ 2 sản phẩm trở lên
        const hasHighQty = previewList.some(it => it.so_luong >= 2);
        const multiProduct = previewList.length >= 2;
        if (hasHighQty || multiProduct) {
            setConfirmOpen(true);
            return;
        }
        doCreateOrder();
    };

    const doCreateOrder = async () => {
        setConfirmOpen(false);
        try {
            const summaryString = previewList.map(item => `${item.ten_sanpham} (SL: ${item.so_luong})`).join(', ');
            const orderData = {
                koc_id_kenh: idKenh, koc_ho_ten: hoTen, koc_sdt: sdt, koc_dia_chi: diaChi, koc_cccd: cccd,
                nhansu_id: selectedNhanSu, loai_ship: loaiShip, san_pham_chi_tiet: summaryString, trang_thai: 'Chưa đóng đơn'
            };
            const { data: orderResult, error: orderError } = await supabase.from('donguis').insert([orderData]).select();
            if (orderError) throw orderError;
            const newOrderId = orderResult[0].id;

            const detailInserts = previewList.map(item => ({ dongui_id: newOrderId, sanpham_id: item.id, so_luong: item.so_luong }));
            const { error: detailError } = await supabase.from('chitiettonguis').insert(detailInserts);
            if (detailError) throw detailError;

            const bookingPromises = [];
            previewList.forEach(item => {
                const correctBrandId = item.brand_id || selectedBrand;
                for (let i = 0; i < item.sl_video; i++) {
                    bookingPromises.push(
                        supabase.from('bookings').insert({
                            ngay_gui_don: new Date().toISOString().split('T')[0],
                            id_kenh: idKenh, ho_ten: hoTen, sdt: sdt, dia_chi: diaChi,
                            cast_amount: parseMoney(cast), cms: cms,
                            brand_id: correctBrandId, san_pham: item.ten_sanpham, nhansu_id: selectedNhanSu,
                            status: 'pending', link_air: '',
                            ghi_chu: `Video ${i + 1}/${item.sl_video} - Đơn hàng #${newOrderId}`
                        })
                    );
                }
            });
            if (bookingPromises.length > 0) {
                await Promise.all(bookingPromises);
                alert("✅ Lên đơn thành công! Đã tự động tạo Booking chờ video.");
            } else {
                alert("✅ Lên đơn thành công! (Không tạo Booking do số clip = 0)");
            }

            setHoTen(''); setIdKenh(''); setSdt(''); setDiaChi(''); setCccd('');
            setSelectedSanPhams({}); setVideoCounts({}); setProductCache({});
            setCast('0'); setCms('10%');
            if (loadInitialData) loadInitialData();
        } catch (err) {
            console.error(err); alert("Lỗi khi tạo đơn: " + err.message);
        }
    };

    const headers = [
        { key: 'select', label: <input type="checkbox" onChange={handleSelectAll} /> },
        { key: 'stt', label: 'STT' },
        { key: 'ngayGui', label: 'Ngày Gửi' },
        { key: 'hoTenKOC', label: 'Họ Tên KOC' },
        { key: 'cccd', label: 'CCCD' },
        { key: 'idKenh', label: 'ID Kênh' },
        { key: 'sdt', label: 'SĐT' },
        { key: 'diaChi', label: 'Địa chỉ' },
        { key: 'brand', label: 'Brand' },
        { key: 'sanPham', label: 'Sản Phẩm (SL)' },
        { key: 'nhanSu', label: 'Nhân Sự Gửi' },
        { key: 'loaiShip', label: 'Loại Ship' },
        { key: 'trangThai', label: 'Trạng Thái' },
        { key: 'hanhDong', label: 'Hành Động' },
    ];
    const summaryExportHeaders = [{ label: "Loại Ship", key: "loai_ship" }, { label: "Sản Phẩm", key: "ten_san_pham" }, { label: "Barcode", key: "barcode" }, { label: "Brand", key: "ten_brand" }, { label: "Tổng Số Lượng", key: "total_quantity" }];

    return (
        <>
            <div style={{ position: 'relative', textAlign: 'center', marginBottom: '2rem' }}>
                <h1 className="page-header">QUẢN LÝ ĐƠN HÀNG KOC</h1>
            </div>

            {/* Cảnh báo liên hệ KOC — ẩn hoàn toàn cho mọi account (Khánh chốt 7/7) */}

            {isAdmin && (
                <div className="mirinda-card" style={{ padding: '16px 20px', marginBottom: '1.5rem', border: '2px solid #bfdbfe', background: '#f8fbff' }}>
                    <div onClick={() => setWlOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', flexWrap: 'wrap' }}>
                        <b style={{ color: '#1d4ed8', fontSize: '1rem' }}>⭐ KOC ưu tiên — bỏ qua check view ({whitelist.length})</b>
                        <span style={{ fontSize: '0.78rem', color: '#64748b' }}>(chỉ admin) — KOC trong đây được tạo đơn dù &lt;1500 view</span>
                        <span style={{ marginLeft: 'auto', fontWeight: 700 }}>{wlOpen ? '▲' : '▼'}</span>
                    </div>
                    {wlOpen && (
                        <div style={{ marginTop: 12 }}>
                            <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                                <input value={wlInput} onChange={e => setWlInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addWhitelist(); } }} placeholder="Nhập ID kênh (vd @tenkenh)..." style={{ flex: '1 1 240px', padding: '8px 12px', borderRadius: 8, border: '1.5px solid #cbd5e1' }} />
                                <button type="button" onClick={addWhitelist} className="btn-primary">+ Thêm ưu tiên</button>
                            </div>
                            {whitelist.length === 0 ? <div style={{ color: '#94a3b8', fontSize: '0.85rem' }}>Chưa có KOC ưu tiên nào.</div> : (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                    {whitelist.map(w => (
                                        <span key={w.username} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 20, padding: '5px 12px', fontSize: '0.82rem', fontWeight: 700, color: '#1d4ed8' }}>
                                            @{w.username}
                                            <span onClick={() => removeWhitelist(w.username)} title="Xoá khỏi ưu tiên" style={{ cursor: 'pointer', color: '#dc2626', fontWeight: 800 }}>✕</span>
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            <div style={{ display: 'flex', gap: '2rem', marginBottom: '2rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <div className="mirinda-card" style={{ flex: 1, padding: '30px' }}>
                    <h2 className="section-title" style={{ fontSize: '1.5rem', marginBottom: '1.5rem', color: '#FF6600', borderBottom: '2px solid #FFF7ED', paddingBottom: '10px' }}>
                        📝 Tạo Đơn Gửi KOC
                    </h2>
                    <form onSubmit={handleCustomSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '25px' }}>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                            <div>
                                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', color: '#374151' }}>Số điện thoại</label>
                                <input type="text" inputMode="numeric" value={sdt} onChange={e => setSdt(e.target.value.replace(/\D/g, '').slice(0, 10))} onBlur={handleSdtBlur} required maxLength={10} placeholder="SĐT 10 số (tự bỏ dấu cách khi dán)" style={{ width: '100%' }} />
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', color: '#374151' }}>ID Kênh (*)</label>
                                <input type="text" value={idKenh} onChange={e => setIdKenh(e.target.value)} onBlur={e => { handleIdKenhBlur(e); if (VIEW_GATE_ON) checkChannelView(idKenh); }} required placeholder="Nhập ID kênh..." style={{ width: '100%' }} />
                                {idKenh && whitelistSet.has(normKenh(idKenh)) && (
                                    <div style={{ marginTop: 8, padding: '8px 10px', borderRadius: 8, fontSize: '0.8rem', background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1d4ed8', fontWeight: 700 }}>⭐ KOC ưu tiên — được tạo đơn dù không đủ view (bỏ qua check).</div>
                                )}
                                {VIEW_GATE_ON && chanView && (
                                    <div style={{ marginTop: 8, padding: '8px 10px', borderRadius: 8, fontSize: '0.8rem', border: '1px solid', ...(chanView.loading ? { background: '#f8fafc', borderColor: '#e2e8f0', color: '#64748b' } : chanView.busy ? { background: '#fffbeb', borderColor: '#fde68a', color: '#b45309' } : (chanView.err || !chanView.dat) ? { background: '#fef2f2', borderColor: '#fecaca', color: '#b91c1c' } : { background: '#f0fdf4', borderColor: '#bbf7d0', color: '#166534' }) }}>
                                        {chanView.loading ? '⏳ Đang cào view kênh...' : chanView.busy ? <span>⚠️ Dịch vụ cào view đang bận (cào không nổi kênh này lúc này, KHÔNG phải lỗi ID). Bấm <span onClick={() => checkChannelView(idKenh)} style={{ cursor: 'pointer', textDecoration: 'underline', fontWeight: 700 }}>🔄 cào lại</span> — hoặc vẫn có thể bấm Tạo đơn (sẽ hỏi xác nhận).</span> : chanView.err ? <span>🚫 {chanView.err} — <b>ID kênh sai/không tìm thấy → KHÔNG gửi được.</b> Kiểm tra lại ID hoặc <span onClick={() => checkChannelView(idKenh)} style={{ cursor: 'pointer', textDecoration: 'underline', fontWeight: 700 }}>🔄 cào lại</span>.</span> : (
                                            <>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                                    <b>{chanView.dat ? '✅ ĐẠT' : '🚫 KHÔNG ĐẠT'}</b>
                                                    {chanView.by_follower
                                                        ? <span>Kênh có <b>{Number(chanView.follower_count).toLocaleString('vi-VN')}</b> follower — kênh xịn (tikwm tạm chưa cào được view từng clip nên tính theo follower)</span>
                                                        : <span>Tổng view {chanView.video_count} video (bỏ ghim): <b>{Number(chanView.total_view).toLocaleString('vi-VN')}</b> / ngưỡng {Number(chanView.nguong).toLocaleString('vi-VN')}</span>}
                                                    <button type="button" onClick={() => openViewPopup(chanView.username, { big: true, force: true })} title="Phóng to xem ~10 clip gần nhất — bấm vào video coi luôn" style={{ marginLeft: 'auto', border: '1px solid #fed7aa', background: '#fff7ed', color: '#ea580c', borderRadius: 8, padding: '3px 10px', cursor: 'pointer', fontWeight: 800, fontSize: '0.76rem' }}>🔍 Phóng to</button>
                                                    <a href={`https://www.tiktok.com/@${chanView.username}`} target="_blank" rel="noreferrer" style={{ color: '#2563eb', fontWeight: 700, textDecoration: 'none' }}>Mở TikTok ↗</a>
                                                    <span onClick={() => checkChannelView(idKenh)} title="Cào lại" style={{ cursor: 'pointer', fontWeight: 700 }}>🔄</span>
                                                </div>
                                                {chanView.videos?.length > 0 && (
                                                    <div onClick={() => openViewPopup(chanView.username, { big: true, force: true })} title="Bấm để phóng to + xem video" style={{ display: 'flex', gap: 5, marginTop: 6, overflowX: 'auto', cursor: 'pointer' }}>
                                                        {chanView.videos.map((v, i) => (
                                                            <div key={i} title={`${Number(v.view).toLocaleString('vi-VN')} view`} style={{ flexShrink: 0, textAlign: 'center' }}>
                                                                <img src={v.cover} alt="" style={{ width: 42, height: 56, objectFit: 'cover', borderRadius: 5, border: '1px solid #e2e8f0' }} />
                                                                <div style={{ fontSize: '0.62rem', color: '#64748b' }}>{Number(v.view) >= 1000 ? (v.view / 1000).toFixed(1) + 'K' : v.view}</div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                            <div>
                                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', color: '#374151' }}>Họ tên KOC (*)</label>
                                <input type="text" value={hoTen} onChange={e => setHoTen(e.target.value)} required placeholder="Họ và tên..." style={{ width: '100%' }} />
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', color: '#374151' }}>CCCD (12 số)</label>
                                <input type="text" value={cccd} onChange={e => setCccd(e.target.value)} required maxLength="12" minLength="12" pattern="[0-9]*" title="Vui lòng nhập đủ 12 chữ số." placeholder="CCCD..." style={{ width: '100%' }} />
                            </div>
                        </div>

                        <AddressPicker value={diaChi} onChange={setDiaChi} />

                        {/* Bỏ ô CAST (VNĐ) + CMS (%) khỏi form tạo đơn (cast giờ lấy từ koc_payments). State giữ mặc định cast='0', cms='10%' để booking không vỡ. */}

                        <div>
                            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', color: '#374151' }}>Brand (*)</label>
                            <select value={selectedBrand} onChange={e => setSelectedBrand(e.target.value)} required style={{ width: '100%' }}>
                                <option value="">-- Chọn Brand --</option>
                                {brands.map(brand => (<option key={brand.id} value={brand.id}>{brand.ten_brand}</option>))}
                            </select>
                        </div>

                        <div>
                            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', color: '#374151' }}>Sản phẩm & Số clip</label>
                            <input type="text" placeholder="🔍 Tìm sản phẩm..." value={productSearchTerm} onChange={e => setProductSearchTerm(e.target.value)} disabled={!selectedBrand} style={{ width: '100%', marginBottom: '10px' }} />
                            <div style={{ border: '1px solid #E5E7EB', borderRadius: '12px', padding: '15px', maxHeight: '250px', overflowY: 'auto', backgroundColor: '#FAFAFA' }}>
                                {(() => {
                                    return sanPhams
                                        .filter(sp => sp.ten_sanpham.toLowerCase().includes(productSearchTerm.toLowerCase()))
                                        .map(sp => (

                                            <div key={sp.id} style={{ display: 'flex', alignItems: 'center', marginBottom: '12px', borderBottom: '1px solid #eee', paddingBottom: '8px' }}>
                                                <div style={{ flex: 1 }}>
                                                    <div style={{ fontWeight: '600', color: '#333' }}>{sp.ten_sanpham}</div>
                                                </div>
                                                <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
                                                    <div style={{ textAlign: 'center' }}>
                                                        <div style={{ fontSize: '0.75rem', color: '#666', marginBottom: '4px' }}>SL Hàng</div>
                                                        <input type="number" min="0" id={sp.id} value={selectedSanPhams[sp.id] || ''} onChange={(e) => handleLocalQuantityChange(sp.id, e.target.value)} style={{ width: '60px', padding: '8px', textAlign: 'center', border: '1px solid #ddd', borderRadius: '8px' }} placeholder="0" />
                                                    </div>
                                                    {selectedSanPhams[sp.id] > 0 && (
                                                        <div style={{ textAlign: 'center', animation: 'fadeIn 0.3s' }}>
                                                            <div style={{ fontSize: '0.75rem', color: '#D42426', fontWeight: 'bold', marginBottom: '4px' }}>Clip</div>
                                                            <input type="number" min="0" value={videoCounts[sp.id] !== undefined ? videoCounts[sp.id] : 1} onChange={(e) => handleVideoCountChange(sp.id, e.target.value)} style={{ width: '60px', padding: '8px', textAlign: 'center', border: '2px solid #D42426', borderRadius: '8px', fontWeight: 'bold', color: '#D42426' }} />
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        ))
                                })()}
                                {sanPhams.filter(sp => sp.ten_sanpham.toLowerCase().includes(productSearchTerm.toLowerCase())).length === 0 && (
                                    <p style={{ margin: 0, color: '#9CA3AF', textAlign: 'center', fontStyle: 'italic' }}>{selectedBrand ? 'Không tìm thấy sản phẩm' : '👈 Vui lòng chọn Brand trước'}</p>
                                )}
                            </div>
                        </div>

                        <div>
                            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', color: '#374151' }}>Nhân sự gửi (*)</label>
                            <select value={selectedNhanSu} onChange={e => setSelectedNhanSu(e.target.value)} required style={{ width: '100%' }}>
                                <option value="">-- Chọn nhân sự --</option>
                                {nhanSus.filter(n => !isHiddenStaffName(n.ten_nhansu)).map(nhansu => (<option key={nhansu.id} value={nhansu.id}>{nhansu.ten_nhansu}</option>))}
                            </select>
                        </div>

                        <div>
                            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', color: '#374151' }}>Loại hình vận chuyển</label>
                            <div style={{ display: 'flex', gap: '2rem', padding: '15px', backgroundColor: '#F3F4F6', borderRadius: '12px', border: '1px solid #E5E7EB' }}>
                                <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', fontWeight: '500' }}>
                                    <input type="radio" value="Ship thường" checked={loaiShip === 'Ship thường'} onChange={e => setLoaiShip(e.target.value)} style={{ marginRight: '10px', width: 'auto' }} />
                                    Ship thường 🚚
                                </label>
                                <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', fontWeight: 'bold', color: '#D42426' }}>
                                    <input type="radio" value="Hỏa tốc" checked={loaiShip === 'Hỏa tốc'} onChange={e => setLoaiShip(e.target.value)} style={{ marginRight: '10px', width: 'auto' }} />
                                    Hỏa tốc 🚀
                                </label>
                            </div>
                        </div>

                        {previewList.length > 0 && (() => {
                            const highQty = previewList.some(it => it.so_luong >= 2);
                            const multi = previewList.length >= 2;
                            if (!highQty && !multi) return null;
                            return (
                                <div style={{ marginTop: '1rem', padding: '12px 16px', background: '#FEF3C7', border: '1px solid #FCD34D', borderRadius: '10px', color: '#92400E', fontSize: '0.92rem', fontWeight: 600, animation: 'fadeIn 0.4s', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <span style={{ fontSize: '1.3rem' }}>🔔</span>
                                    <span>
                                        Đơn này {multi && <b>có {previewList.length} sản phẩm</b>}{multi && highQty && ' và '}{highQty && <b>có sản phẩm số lượng từ 2 trở lên</b>} → khi bấm <b>Gửi Đơn</b> sẽ phải <b>xác nhận lại 1 lần nữa</b>.
                                    </span>
                                </div>
                            );
                        })()}

                        <button type="submit" disabled={isLoading || isPastDeadlineForNewOrders} className="btn-primary" style={{ marginTop: '1rem', padding: '16px', fontSize: '1.1rem', fontWeight: '800', borderRadius: '50px', boxShadow: '0 4px 15px rgba(255, 102, 0, 0.3)' }}>
                            {isLoading ? '⏳ ĐANG XỬ LÝ...' : '🎁 GỬI ĐƠN & TẠO BOOKING'}
                        </button>

                        {isPastDeadlineForNewOrders && (
                            <div style={{ backgroundColor: '#FEE2E2', padding: '10px', borderRadius: '8px', marginTop: '10px', textAlign: 'center' }}>
                                <p style={{ color: '#B91C1C', fontWeight: 'bold', margin: 0 }}>⚠️ Đã quá 16h30, không thể tạo đơn hàng mới.</p>
                            </div>
                        )}
                    </form>
                </div>

                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    {previewList.length > 0 && (
                        <div className="mirinda-card" style={{ border: '2px solid #F8B229', animation: 'fadeIn 0.5s' }}>
                            <h3 className="section-title">🛒 REVIEW ĐƠN HÀNG ĐANG TẠO</h3>
                            <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                                <table style={{ width: '100%', fontSize: '0.9rem', borderCollapse: 'collapse' }}>
                                    <thead style={{ backgroundColor: '#fff3e0' }}><tr><th style={{ padding: '8px', textAlign: 'left' }}>Brand</th><th style={{ padding: '8px', textAlign: 'left' }}>Sản phẩm</th><th style={{ padding: '8px', textAlign: 'center' }}>SL</th><th style={{ padding: '8px', textAlign: 'center' }}>Clip</th></tr></thead>
                                    <tbody>{previewList.map((item, idx) => (<tr key={idx} style={{ borderBottom: '1px solid #eee' }}><td style={{ padding: '8px', fontWeight: 'bold', color: '#333' }}>{item.ten_brand}</td><td style={{ padding: '8px' }}>{item.ten_sanpham}</td><td style={{ padding: '8px', textAlign: 'center', fontWeight: 'bold' }}>{item.so_luong}</td><td style={{ padding: '8px', textAlign: 'center', color: '#D42426', fontWeight: 'bold' }}>{item.sl_video}</td></tr>))}</tbody>
                                </table>
                            </div>
                            <div style={{ marginTop: '10px', textAlign: 'right', fontSize: '0.9rem', color: '#666', fontStyle: 'italic' }}>* Kiểm tra kỹ trước khi bấm Gửi Đơn (Clip = 0 sẽ không tạo Booking)</div>
                        </div>
                    )}
                    <div className="mirinda-card">
                        <h2 className="section-title">Tổng Hợp Sản Phẩm (Ngày)</h2>
                        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1rem' }}>
                            <input type="date" value={summaryDate} onChange={e => setSummaryDate(e.target.value)} style={{ flex: 1 }} />
                            <button onClick={handleGetSummary} disabled={isSummarizing} className="btn-primary">{isSummarizing ? '...' : 'Tổng hợp'}</button>
                        </div>
                        <div style={{ marginTop: '1rem', maxHeight: '500px', overflowY: 'auto' }}>
                            {rawSummaryData.length === 0 && !isSummarizing && <p style={{ textAlign: 'center', color: '#999' }}>Chưa có dữ liệu cho ngày đã chọn.</p>}
                            {productSummary['Ship thường'].length > 0 && (
                                <div style={{ marginBottom: '1.5rem' }}>
                                    <h3 className="section-title">📦 Ship Thường</h3>
                                    <table style={{ width: '100%' }}><thead><tr><th>Sản phẩm</th><th>SL</th></tr></thead><tbody>{productSummary['Ship thường'].map(item => (<tr key={`${item.ten_san_pham}-thuong`}><td>{item.ten_san_pham}<br /><small style={{ color: '#777' }}>{item.ten_brand} - {item.barcode}</small></td><td style={{ textAlign: 'center' }}><strong>{item.total_quantity}</strong></td></tr>))}</tbody></table>
                                </div>
                            )}
                            {productSummary['Hỏa tốc'].length > 0 && (
                                <div>
                                    <h3 className="section-title">🚀 Hỏa Tốc</h3>
                                    <table style={{ width: '100%' }}><thead><tr><th>Sản phẩm</th><th>SL</th></tr></thead><tbody>{productSummary['Hỏa tốc'].map(item => (<tr key={`${item.ten_san_pham}-toc`}><td>{item.ten_san_pham}<br /><small style={{ color: '#777' }}>{item.ten_brand} - {item.barcode}</small></td><td style={{ textAlign: 'center' }}><strong>{item.total_quantity}</strong></td></tr>))}</tbody></table>
                                </div>
                            )}
                            {rawSummaryData.length > 0 && <div style={{ marginTop: '1rem', textAlign: 'right' }}><button onClick={() => handleExport({ data: rawSummaryData, headers: summaryExportHeaders, filename: `tong-hop-san-pham-${summaryDate}.xlsx` })} className="btn-secondary">Xuất File Tổng Hợp</button></div>}
                        </div>
                    </div>
                </div>
            </div>

            <div className="mirinda-card" style={{ marginBottom: '2rem' }}>
                <h2 className="section-title">Báo Cáo Hiệu Suất Nhân Sự</h2>
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', justifyContent: 'center', marginBottom: '1.5rem' }}>
                    <select value={reportMonth} onChange={e => setReportMonth(e.target.value)} style={{ width: 'auto' }}>{Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>Tháng {i + 1}</option>)}</select>
                    <input type="number" value={reportYear} onChange={e => setReportYear(e.target.value)} style={{ width: '100px' }} />
                    <button onClick={handleGenerateReport} disabled={isReportLoading} className="btn-primary">{isReportLoading ? 'Đang tính toán...' : '📊 Xem Báo Cáo'}</button>
                </div>

                {/* BẢNG SỐ LIỆU */}
                {reportData.reportRows.length > 0 ? (
                    <div style={{ width: '100%', overflowX: 'auto' }}>
                        <table style={{ width: '100%' }}>
                            <thead><tr><th style={{ cursor: 'pointer' }} onClick={() => requestSort('ten_nhansu')}>Nhân Sự {sortConfig.key === 'ten_nhansu' ? (sortConfig.direction === 'asc' ? '▲' : '▼') : ''}</th><th style={{ cursor: 'pointer', textAlign: 'center' }} onClick={() => requestSort('sl_order')}>SL Order {sortConfig.key === 'sl_order' ? (sortConfig.direction === 'asc' ? '▲' : '▼') : ''}</th><th style={{ textAlign: 'center' }} >AOV Đơn Order</th><th style={{ cursor: 'pointer', textAlign: 'center' }} onClick={() => requestSort('chi_phi_tong')}>Chi Phí Tổng {sortConfig.key === 'chi_phi_tong' ? (sortConfig.direction === 'asc' ? '▲' : '▼') : ''}</th>{reportData.brandHeaders.map(brand => (<th key={brand} style={{ cursor: 'pointer', textAlign: 'center' }} onClick={() => requestSort(brand)}>{brand} {sortConfig.key === brand ? (sortConfig.direction === 'asc' ? '▲' : '▼') : ''}</th>))}</tr></thead>
                            <tbody>
                                {sortedReportRows.map((item) => (
                                    <tr key={item.nhansu_id}>
                                        <td style={{ fontWeight: 'bold', color: '#165B33' }}>{item.ten_nhansu}</td><td style={{ textAlign: 'center' }}>{item.sl_order}</td><td style={{ textAlign: 'center' }}>{Math.round(item.aov_don_order).toLocaleString('vi-VN')} đ</td><td style={{ textAlign: 'center' }}>{Math.round(item.chi_phi_tong).toLocaleString('vi-VN')} đ</td>
                                        {reportData.brandHeaders.map(brand => (<td key={brand} style={{ textAlign: 'center' }}>{item.brand_counts[brand] || 0}</td>))}
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                {totalsRow && (
                                    <tr style={{ backgroundColor: '#FDE2E2', fontWeight: 'bold', color: '#D42426' }}><td>TỔNG CỘNG</td><td style={{ textAlign: 'center' }}>{totalsRow.sl_order}</td><td style={{ textAlign: 'center' }}>{Math.round(totalsRow.aov_don_order).toLocaleString('vi-VN')} đ</td><td style={{ textAlign: 'center' }}>{Math.round(totalsRow.chi_phi_tong).toLocaleString('vi-VN')} đ</td>{reportData.brandHeaders.map(brand => (<td key={brand} style={{ textAlign: 'center' }}>{totalsRow.brand_counts[brand] || 0}</td>))}</tr>
                                )}
                            </tfoot>
                        </table>
                    </div>
                ) : (<p style={{ textAlign: 'center', color: '#999', padding: '20px' }}>{isReportLoading ? 'Đang tải...' : 'Chưa có dữ liệu báo cáo.'}</p>)}

                {/* --- [MỚI] KHU VỰC BIỂU ĐỒ (CHART SECTION) --- */}
                <div style={{ marginTop: '30px', padding: '20px', backgroundColor: '#fff', borderRadius: '10px', border: '1px solid #ddd', boxShadow: '0 4px 10px rgba(0,0,0,0.05)' }}>
                    <h3 className="section-title">📈 Biểu Đồ Hiệu Suất Theo Ngày (Tháng {reportMonth}/{reportYear})</h3>

                    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px' }}>
                        <select
                            value={chartNhanSu}
                            onChange={e => setChartNhanSu(e.target.value)}
                            style={{ padding: '10px 15px', borderRadius: '6px', border: '1px solid #ccc', fontSize: '1rem', minWidth: '250px' }}
                        >
                            <option value="">-- Chọn nhân sự để xem biểu đồ --</option>
                            {nhanSus.filter(n => !isHiddenStaffName(n.ten_nhansu)).map(ns => (
                                <option key={ns.id} value={ns.id}>{ns.ten_nhansu}</option>
                            ))}
                        </select>
                    </div>

                    {isChartLoading ? (
                        <p style={{ textAlign: 'center' }}>Đang tải biểu đồ...</p>
                    ) : chartData.length > 0 ? (
                        <div style={{ width: '100%', height: 350 }}>
                            <ResponsiveContainer>
                                <AreaChart data={chartData} margin={{ top: 20, right: 30, left: 10, bottom: 20 }}>
                                    <defs>
                                        <linearGradient id="colorOrders" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#165B33" stopOpacity={0.8} />
                                            <stop offset="95%" stopColor="#165B33" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>

                                    {/* [YÊU CẦU 1 + 3] Trục X: Highlight cuối tuần + Label Ngày */}
                                    <XAxis
                                        dataKey="day"
                                        tick={<CustomizedAxisTick />}
                                        interval={0}
                                        height={60}
                                    >
                                        <Label value="Ngày trong tháng" offset={0} position="insideBottom" />
                                    </XAxis>

                                    {/* [YÊU CẦU 1] Trục Y: Label Số đơn */}
                                    <YAxis allowDecimals={false}>
                                        <Label value="Số lượng đơn" angle={-90} position="insideLeft" style={{ textAnchor: 'middle' }} />
                                    </YAxis>

                                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                    <Tooltip formatter={(value) => [`${value} đơn`, 'Số lượng']} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 2px 10px rgba(0,0,0,0.1)' }} />

                                    {/* [YÊU CẦU 2] Thêm chấm tròn (dot) VÀ Label số lượng trên đỉnh */}
                                    <Area
                                        type="monotone"
                                        dataKey="orders"
                                        stroke="#165B33"
                                        strokeWidth={3}
                                        fillOpacity={1}
                                        fill="url(#colorOrders)"
                                        dot={{ stroke: '#165B33', strokeWidth: 2, r: 4, fill: 'white' }}
                                        activeDot={{ r: 6, fill: '#D42426' }}
                                        label={{ position: 'top', fill: '#165B33', fontSize: 12, fontWeight: 'bold', dy: -5 }} // [ĐÃ THÊM LABEL SỐ]
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    ) : (
                        <div style={{ textAlign: 'center', color: '#999', padding: '30px', border: '2px dashed #ccc', borderRadius: '8px' }}>
                            {chartNhanSu ? "Không có dữ liệu đơn hàng trong tháng này." : "Vui lòng chọn nhân sự ở trên để xem biểu đồ."}
                        </div>
                    )}
                </div>
            </div>

            <div className="mirinda-card" style={{ marginBottom: '1.5rem', padding: '1.5rem', position: 'relative', zIndex: 20, overflow: 'visible' }}>
                <h2 className="section-title" style={{ textAlign: 'center', width: '100%' }}>Danh Sách Đơn Hàng</h2>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '15px', marginBottom: '1.5rem', alignItems: 'center' }}>
                    <input type="text" placeholder="ID kênh..." value={filterIdKenh} onChange={e => setFilterIdKenh(e.target.value)} style={{ flex: '1 1 150px' }} />
                    <input type="text" placeholder="SĐT..." value={filterSdt} onChange={e => setFilterSdt(e.target.value)} style={{ flex: '1 1 150px' }} />
                    <select value={filterBrand} onChange={e => setFilterBrand(e.target.value)} style={{ flex: '1 1 200px' }}><option value="">Tất cả Brand</option>{brands.map(b => <option key={b.id} value={b.id}>{b.ten_brand}</option>)}</select>
                    <SearchableDropdown
                        options={filterSanPhams
                            .map(sp => ({ value: sp.id, label: sp.ten_sanpham }))}
                        value={filterSanPham}
                        onChange={setFilterSanPham}
                        placeholder={!filterBrand ? "Chọn Brand trước" : "Tất cả Sản phẩm"}
                        style={{ flex: '1 1 320px', opacity: !filterBrand ? 0.6 : 1, pointerEvents: !filterBrand ? 'none' : 'auto' }}
                    />
                    <select value={filterNhanSu} onChange={e => setFilterNhanSu(e.target.value)} style={{ flex: '1 1 180px' }}><option value="">Tất cả nhân sự</option>{nhanSus.filter(n => !isHiddenStaffName(n.ten_nhansu)).map(ns => <option key={ns.id} value={ns.id}>{ns.ten_nhansu}</option>)}</select>
                    <select value={filterLoaiShip} onChange={e => setFilterLoaiShip(e.target.value)} style={{ flex: '1 1 150px' }}><option value="">Tất cả loại ship</option><option value="Ship thường">Ship thường</option><option value="Hỏa tốc">Hỏa tốc</option></select>
                    <select value={filterEditedStatus} onChange={e => setFilterEditedStatus(e.target.value)} style={{ flex: '1 1 150px' }}><option value="all">Tất cả</option><option value="edited">Đơn đã sửa</option><option value="unedited">Đơn chưa sửa</option></select>
                    <div style={{ display:'flex', alignItems:'center', gap:4, flex:'1 1 280px' }}>
                      <input type="date" value={filterNgayStart} onChange={e => setFilterNgayStart(e.target.value)}
                        placeholder="Từ ngày"
                        style={{ flex:1, padding:'8px 10px', borderRadius:8, border:'1.5px solid #e5e7eb', fontSize:'0.85rem', fontFamily:"'Outfit',sans-serif" }} />
                      <span style={{ color:'#9ca3af', fontWeight:600 }}>→</span>
                      <input type="date" value={filterNgayEnd} onChange={e => setFilterNgayEnd(e.target.value)}
                        placeholder="Đến ngày"
                        style={{ flex:1, padding:'8px 10px', borderRadius:8, border:'1.5px solid #e5e7eb', fontSize:'0.85rem', fontFamily:"'Outfit',sans-serif" }} />
                    </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', borderTop: '1px solid #eee', paddingTop: '15px', flexWrap: 'wrap' }}>
                    <button onClick={clearFilters} className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><i className="fa fa-filter"></i> Xóa Lọc</button>
                    <button onClick={handleBulkUpdateStatus} disabled={selectedOrders.size === 0} className={selectedOrders.size > 0 ? 'btn-warning' : 'btn-disabled'}>📦 Đóng Đơn ({selectedOrders.size})</button>
                    <button onClick={handleBulkDelete} disabled={selectedOrders.size === 0} className={selectedOrders.size > 0 ? 'btn-danger' : 'btn-disabled'}>🗑️ XÓA ({selectedOrders.size})</button>
                    <button onClick={handleExportAll} disabled={isLoading} className="btn-primary" style={{ marginLeft: '10px' }}>{isLoading ? '...' : '📊 Xuất Excel'}</button>
                    <button onClick={handleExportSPX} disabled={isLoading} title="Xuất file .xlsx đúng mẫu Shopee Express (spx.vn) — theo bộ lọc đang chọn" style={{ marginLeft: '10px', padding: '10px 18px', background: '#ee4d2d', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 700, cursor: isLoading ? 'default' : 'pointer', opacity: isLoading ? 0.6 : 1 }}>{isLoading ? '...' : '🚚 Xuất Shopee Express'}</button>
                </div>
            </div>

            <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
                <p style={{ marginBottom: '10px', color: '#4B5563', fontWeight: 'bold' }}>Tổng cộng: {totalOrderCount} đơn hàng ({ORDERS_PER_PAGE} đơn/trang) - Trang {currentPage}/{totalPages}</p>
                <button onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))} disabled={currentPage === 1 || isLoading} className="btn-pagination btn-pagination-text">TRANG TRƯỚC</button>
                {pageNumbers.map(number => (<button key={number} onClick={() => setCurrentPage(number)} disabled={isLoading} className={currentPage === number ? 'btn-pagination-active' : 'btn-pagination'}>{number}</button>))}
                <button onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))} disabled={currentPage === totalPages || isLoading} className="btn-pagination btn-pagination-text">TRANG SAU</button>
            </div>

            {viewPopup && (
                <div onClick={() => setViewPopup(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, padding: 20, width: viewPopup.big ? '96vw' : 'min(460px, 92vw)', height: viewPopup.big ? '94vh' : 'auto', maxHeight: viewPopup.big ? '94vh' : '85vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                            <b style={{ fontSize: '1.05rem', color: '#FF6600' }}>👁️ View kênh @{viewPopup.username}</b>
                            <a href={`https://www.tiktok.com/@${viewPopup.username}`} target="_blank" rel="noreferrer" style={{ color: '#2563eb', fontWeight: 700, textDecoration: 'none', fontSize: '0.85rem' }}>Mở TikTok ↗</a>
                            <span onClick={() => openViewPopup(viewPopup.username, { big: viewPopup.big, force: true })} title="Cào lại" style={{ cursor: 'pointer', fontWeight: 700 }}>🔄</span>
                            <button onClick={() => setViewPopup(vp => ({ ...vp, big: !vp.big }))} title={viewPopup.big ? 'Thu nhỏ lại' : 'Phóng to cả màn hình'} style={{ marginLeft: 'auto', border: '1px solid #fed7aa', background: '#fff7ed', color: '#ea580c', borderRadius: 8, padding: '4px 12px', cursor: 'pointer', fontWeight: 700 }}>{viewPopup.big ? '⤡ Thu nhỏ' : '⤢ Phóng to'}</button>
                            <button onClick={() => setViewPopup(null)} style={{ border: 'none', background: '#f1f5f9', borderRadius: 8, padding: '4px 12px', cursor: 'pointer', fontWeight: 700 }}>Đóng</button>
                        </div>
                        {viewPopup.loading ? <div style={{ padding: 30, textAlign: 'center', color: '#64748b' }}>⏳ Đang cào view kênh...</div>
                            : viewPopup.err ? <div style={{ padding: 16, background: '#fef2f2', color: '#b91c1c', borderRadius: 10 }}>🚫 {viewPopup.err} — ID kênh có thể sai / không tồn tại.</div>
                            : (<>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 10, marginBottom: 12, fontWeight: 800, flexWrap: 'wrap', ...(viewPopup.dat ? { background: '#f0fdf4', color: '#166534' } : { background: '#fef2f2', color: '#b91c1c' }) }}>
                                    {viewPopup.dat ? '✅ ĐẠT' : '🚫 KHÔNG ĐẠT'}
                                    <span style={{ fontWeight: 600 }}>Tổng view {viewPopup.video_count} video (bỏ ghim): <b>{Number(viewPopup.total_view).toLocaleString('vi-VN')}</b> / ngưỡng {Number(viewPopup.nguong || 1500).toLocaleString('vi-VN')}</span>
                                    <span style={{ fontWeight: 600, color: '#64748b' }}>· bấm clip nào coi clip đó ngay tại chỗ</span>
                                </div>
                                {(viewPopup.videos_all?.length ? viewPopup.videos_all : viewPopup.videos)?.length > 0 && (
                                    <div style={{ display: 'grid', gridTemplateColumns: viewPopup.big ? 'repeat(auto-fill, minmax(230px, 1fr))' : 'repeat(auto-fill, minmax(100px, 1fr))', gap: 10 }}>
                                        {(viewPopup.videos_all?.length ? viewPopup.videos_all : viewPopup.videos).map((v, i) => {
                                            const playing = String(viewPopup.play) === String(v.id);
                                            return (
                                                <div key={i} style={{ position: 'relative', borderRadius: 10, overflow: 'hidden', background: '#000', border: playing ? '2px solid #ea580c' : '1px solid #e2e8f0' }}>
                                                    {playing ? (
                                                        viewPopup.playErr ? (
                                                            <div style={{ padding: 12, background: '#fffbeb', color: '#92400e', fontSize: '0.78rem', aspectRatio: '9/16', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', flexDirection: 'column', gap: 6 }}>⚠️ {viewPopup.playErr}<a href={`https://www.tiktok.com/@${viewPopup.username}/video/${v.id}`} target="_blank" rel="noreferrer" style={{ fontWeight: 700 }}>Mở TikTok ↗</a></div>
                                                        ) : !viewPopup.playUrl ? (
                                                            <div style={{ aspectRatio: '9/16', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '0.8rem' }}>⏳ Đang tải...</div>
                                                        ) : (
                                                            <video key={v.id} src={viewPopup.playUrl} controls autoPlay playsInline style={{ width: '100%', aspectRatio: '9/16', objectFit: 'contain', background: '#000', display: 'block' }} />
                                                        )
                                                    ) : (
                                                        <div onClick={() => openPlay(v.id, viewPopup.username)} title="Bấm để xem video ngay tại chỗ" style={{ cursor: 'pointer', position: 'relative' }}>
                                                            <img src={v.cover} alt="" style={{ width: '100%', aspectRatio: '9/16', objectFit: 'cover', display: 'block' }} />
                                                            <span style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', fontSize: '2rem', color: '#fff', textShadow: '0 1px 6px rgba(0,0,0,0.7)' }}>▶</span>
                                                            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'linear-gradient(transparent, rgba(0,0,0,0.72))', color: '#fff', fontSize: '0.72rem', fontWeight: 700, padding: '14px 6px 4px', textAlign: 'center' }}>{Number(v.view).toLocaleString('vi-VN')} view</div>
                                                        </div>
                                                    )}
                                                    {playing && <button onClick={() => setViewPopup(vp => ({ ...vp, play: null, playUrl: null, playErr: null }))} title="Tắt video" style={{ position: 'absolute', top: 4, right: 4, border: 'none', background: 'rgba(0,0,0,0.6)', color: '#fff', borderRadius: 6, width: 24, height: 24, cursor: 'pointer', fontWeight: 700, lineHeight: '24px', padding: 0 }}>✕</button>}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </>)}
                    </div>
                </div>
            )}

            <div className="mirinda-card" style={{ padding: '0', overflow: 'hidden' }}>
                <div style={{ width: '100%', overflowX: 'auto' }}>
                    <table style={{ width: '100%' }}>
                        <thead><tr>{headers.map((header) => (<ResizableHeader key={header.key} width={columnWidths[header.key]} onResize={handleResize(header.key)}>{header.label}</ResizableHeader>))}</tr></thead>
                        <tbody>
                            {donHangs.map((donHang) => {
                                const getCellStyle = (currentValue, originalValue) => (originalValue !== null && currentValue !== originalValue) ? { backgroundColor: '#FF6600', color: 'black', fontWeight: 'bold' } : {};
                                const getStatusStyle = (status) => isDonDaDong(status) ? { backgroundColor: '#FF6600', color: 'black', fontWeight: 'bold' } : {};
                                const sanPhamDisplay = donHang.chitiettonguis && donHang.chitiettonguis.map(ct => (<div key={ct.sanphams?.id}>{ct.sanphams?.ten_sanpham} (SL: {ct.so_luong})</div>));
                                return (
                                    <tr key={donHang.id}>
                                        {editingDonHang?.id === donHang.id ? (
                                            <>
                                                <td style={{ width: `${columnWidths.select}px`, padding: '12px', border: '1px solid #ddd' }}></td>
                                                <td style={{ width: `${columnWidths.stt}px`, padding: '12px', border: '1px solid #ddd' }}>{donHang.originalStt}</td>
                                                <td style={{ width: `${columnWidths.ngayGui}px`, padding: '12px', border: '1px solid #ddd' }}>{new Date(donHang.ngay_gui).toLocaleString('vi-VN')}</td>
                                                <td style={{ width: `${columnWidths.hoTenKOC}px`, padding: '12px', border: '1px solid #ddd' }}><input style={{ width: '90%' }} value={editingDonHang.koc_ho_ten} onChange={e => setEditingDonHang({ ...editingDonHang, koc_ho_ten: e.target.value })} /></td>
                                                <td style={{ width: `${columnWidths.cccd}px`, padding: '12px', border: '1px solid #ddd' }}><input style={{ width: '90%' }} value={editingDonHang.koc_cccd} onChange={e => setEditingDonHang({ ...editingDonHang, koc_cccd: e.target.value })} /></td>
                                                <td style={{ width: `${columnWidths.idKenh}px`, padding: '12px', border: '1px solid #ddd' }}><input style={{ width: '90%' }} value={editingDonHang.koc_id_kenh} onChange={e => setEditingDonHang({ ...editingDonHang, koc_id_kenh: e.target.value })} /></td>
                                                <td style={{ width: `${columnWidths.sdt}px`, padding: '12px', border: '1px solid #ddd' }}><input style={{ width: '90%' }} inputMode="numeric" maxLength={10} value={editingDonHang.koc_sdt} onChange={e => setEditingDonHang({ ...editingDonHang, koc_sdt: e.target.value.replace(/\D/g, '').slice(0, 10) })} /></td>
                                                <td style={{ width: `${columnWidths.diaChi}px`, padding: '12px', border: '1px solid #ddd' }}><input style={{ width: '90%' }} value={editingDonHang.koc_dia_chi} onChange={e => setEditingDonHang({ ...editingDonHang, koc_dia_chi: e.target.value })} /></td>
                                                <td style={{ width: `${columnWidths.brand}px`, padding: '12px', border: '1px solid #ddd' }}>{[...new Set(donHang.chitiettonguis?.map(ct => ct.sanphams?.brands?.ten_brand))].map(b => <div key={b}>{b}</div>)}</td>
                                                <td style={{ width: `${columnWidths.sanPham}px`, padding: '12px', border: '1px solid #ddd' }}>{sanPhamDisplay}</td>
                                                <td style={{ width: `${columnWidths.nhanSu}px`, padding: '12px', border: '1px solid #ddd' }}>{donHang.nhansu?.ten_nhansu}</td>
                                                <td style={{ width: `${columnWidths.loaiShip}px`, padding: '12px', border: '1px solid #ddd' }}><select style={{ width: '100%' }} value={editingDonHang.loai_ship} onChange={e => setEditingDonHang({ ...editingDonHang, loai_ship: e.target.value })}><option>Ship thường</option><option>Hỏa tốc</option></select></td>
                                                <td style={{ width: `${columnWidths.trangThai}px`, padding: '12px', border: '1px solid #ddd' }}><select style={{ width: '100%' }} value={editingDonHang.trang_thai} onChange={(e) => setEditingDonHang({ ...editingDonHang, trang_thai: e.target.value })}><option>Chưa đóng đơn</option><option>Đã đóng đơn</option></select></td>
                                                <td style={{ width: `${columnWidths.hanhDong}px`, padding: '12px', border: '1px solid #ddd' }}><button onClick={handleUpdate} className="btn-success" style={{ margin: '2px' }}>Lưu</button><button onClick={handleCancelEdit} className="btn-secondary" style={{ margin: '2px' }}>Hủy</button></td>
                                            </>
                                        ) : (
                                            <>
                                                <td style={{ width: `${columnWidths.select}px`, padding: '12px', border: '1px solid #ddd' }}><input type="checkbox" checked={selectedOrders.has(donHang.id)} onChange={() => handleSelect(donHang.id)} /></td>
                                                <td style={{ width: `${columnWidths.stt}px`, padding: '12px', border: '1px solid #ddd' }}>{donHang.originalStt}</td>
                                                <td style={{ width: `${columnWidths.ngayGui}px`, padding: '12px', border: '1px solid #ddd' }}>{new Date(donHang.ngay_gui).toLocaleString('vi-VN')}</td>
                                                <td style={{ width: `${columnWidths.hoTenKOC}px`, padding: '12px', border: '1px solid #ddd', ...getCellStyle(donHang.koc_ho_ten, donHang.original_koc_ho_ten) }}>{donHang.koc_ho_ten}</td>
                                                <td style={{ width: `${columnWidths.cccd}px`, padding: '12px', border: '1px solid #ddd', ...getCellStyle(donHang.koc_cccd, donHang.original_koc_cccd) }}>{donHang.koc_cccd}</td>
                                                <td style={{ width: `${columnWidths.idKenh}px`, padding: '12px', border: '1px solid #ddd', ...getCellStyle(donHang.koc_id_kenh, donHang.original_koc_id_kenh) }}>
                                                    <span>{donHang.koc_id_kenh}</span>
                                                    {donHang.koc_id_kenh && <button type="button" onClick={() => openViewPopup(donHang.koc_id_kenh)} title="Cào view kênh (ảnh + view)" style={{ marginLeft: 6, border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '1rem', padding: 0 }}>👁️</button>}
                                                </td>
                                                <td style={{ width: `${columnWidths.sdt}px`, padding: '12px', border: '1px solid #ddd', ...getCellStyle(donHang.koc_sdt, donHang.original_koc_sdt) }}>{donHang.koc_sdt}</td>
                                                <td style={{ width: `${columnWidths.diaChi}px`, padding: '12px', border: '1px solid #ddd', ...getCellStyle(donHang.koc_dia_chi, donHang.original_koc_dia_chi) }}>
                                                    <div>{donHang.koc_dia_chi}</div>
                                                    {(() => {
                                                        const p = parseDiaChi(donHang.koc_dia_chi);
                                                        if (!p) return null;
                                                        const rows = [['🏙️', p.tinh], ['🏘️', p.quan], ['📍', p.phuong], ['🏠', p.soNha]].filter(r => r[1]);
                                                        return (
                                                            <div style={{ marginTop: '6px', paddingTop: '6px', borderTop: '1px dashed #ddd', fontSize: '0.78rem', color: '#6B7280', lineHeight: 1.5 }}>
                                                                {rows.map((r, i) => <div key={i}>{r[0]} {r[1]}</div>)}
                                                            </div>
                                                        );
                                                    })()}
                                                </td>
                                                <td style={{ width: `${columnWidths.brand}px`, padding: '12px', border: '1px solid #ddd' }}>{[...new Set(donHang.chitiettonguis?.map(ct => ct.sanphams?.brands?.ten_brand))].map(tenBrand => (<div key={tenBrand}>{tenBrand}</div>))}</td>
                                                <td style={{ width: `${columnWidths.sanPham}px`, padding: '12px', border: '1px solid #ddd' }}>{sanPhamDisplay}</td>
                                                <td style={{ width: `${columnWidths.nhanSu}px`, padding: '12px', border: '1px solid #ddd' }}>{donHang.nhansu?.ten_nhansu}</td>
                                                <td style={{ width: `${columnWidths.loaiShip}px`, padding: '12px', border: '1px solid #ddd', ...getCellStyle(donHang.loai_ship, donHang.original_loai_ship) }}>{donHang.loai_ship}</td>
                                                <td style={{ width: `${columnWidths.trangThai}px`, padding: '12px', border: '1px solid #ddd', ...getCellStyle(donHang.trang_thai, donHang.original_trang_thai), ...getStatusStyle(donHang.trang_thai) }}>{donHang.trang_thai}</td>
                                                <td style={{ width: `${columnWidths.hanhDong}px`, padding: '12px', border: '1px solid #ddd', whiteSpace: 'nowrap' }}>
                                                    <button onClick={() => handleEdit(donHang)} className="btn-warning" style={{ marginRight: '5px' }}>Sửa</button>
                                                    {isDonDaDong(donHang.trang_thai) ? (
                                                        <button disabled className="btn-disabled" title="Đơn đã đóng không thể xóa">Xóa</button>
                                                    ) : (
                                                        <button onClick={() => handleSafeDelete(donHang)} className="btn-danger">Xóa</button>
                                                    )}
                                                </td>
                                            </>
                                        )}
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {confirmOpen && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }} onClick={() => setConfirmOpen(false)}>
                    <div style={{ background: '#fff', borderRadius: '12px', padding: '28px', width: '90%', maxWidth: '560px', boxShadow: '0 10px 40px rgba(0,0,0,0.3)' }} onClick={e => e.stopPropagation()}>
                        <h2 style={{ margin: '0 0 6px', color: '#D97706', fontSize: '1.4rem' }}>⚠️ XÁC NHẬN LẠI ĐƠN HÀNG</h2>
                        <p style={{ margin: '0 0 16px', color: '#6B7280', fontSize: '0.92rem' }}>
                            Đơn này cần kiểm tra kỹ vì:
                        </p>
                        <ul style={{ margin: '0 0 16px', paddingLeft: '20px', color: '#374151', fontSize: '0.92rem' }}>
                            {previewList.length >= 2 && <li>Đơn có <b>{previewList.length} sản phẩm</b> khác nhau.</li>}
                            {previewList.some(it => it.so_luong >= 2) && <li>Có sản phẩm <b>số lượng từ 2 trở lên</b> (đánh dấu đỏ bên dưới).</li>}
                        </ul>
                        <div style={{ maxHeight: '260px', overflowY: 'auto', border: '1px solid #eee', borderRadius: '8px' }}>
                            <table style={{ width: '100%', fontSize: '0.9rem', borderCollapse: 'collapse' }}>
                                <thead style={{ backgroundColor: '#FFF7ED', position: 'sticky', top: 0 }}>
                                    <tr><th style={{ padding: '8px', textAlign: 'left' }}>Brand</th><th style={{ padding: '8px', textAlign: 'left' }}>Sản phẩm</th><th style={{ padding: '8px', textAlign: 'center' }}>SL</th><th style={{ padding: '8px', textAlign: 'center' }}>Clip</th></tr>
                                </thead>
                                <tbody>
                                    {previewList.map((item, idx) => {
                                        const high = item.so_luong >= 2;
                                        return (
                                            <tr key={idx} style={{ borderBottom: '1px solid #eee', background: high ? '#FEF2F2' : 'transparent' }}>
                                                <td style={{ padding: '8px', fontWeight: 'bold', color: '#333' }}>{item.ten_brand}</td>
                                                <td style={{ padding: '8px' }}>{item.ten_sanpham}</td>
                                                <td style={{ padding: '8px', textAlign: 'center', fontWeight: 'bold', color: high ? '#DC2626' : '#333' }}>{high ? `⚠️ ${item.so_luong}` : item.so_luong}</td>
                                                <td style={{ padding: '8px', textAlign: 'center', color: '#D42426', fontWeight: 'bold' }}>{item.sl_video}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '20px' }}>
                            <button type="button" onClick={() => setConfirmOpen(false)} style={{ padding: '10px 18px', borderRadius: '8px', border: '1px solid #D1D5DB', background: '#fff', color: '#374151', fontWeight: 600, cursor: 'pointer' }}>← Kiểm tra lại</button>
                            <button type="button" onClick={doCreateOrder} style={{ padding: '10px 22px', borderRadius: '8px', border: 'none', background: '#16A34A', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>✅ Xác nhận tạo đơn</button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};
export default OrderTab;