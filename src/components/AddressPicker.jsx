// src/components/AddressPicker.jsx
// Ô địa chỉ kiểu Shopee: Tỉnh/TP → Phường/Xã (lọc theo tỉnh) → Số nhà/Đường.
// Ghép lại thành chuỗi "Đường, Phường X, Tỉnh Y" nên nơi nào đang lưu địa chỉ dạng 1 chuỗi
// vẫn dùng được y như cũ (Order, Khiếu nại gửi bù...).
// Tách ra từ OrderTab (27/7) để Module 3 Khiếu nại dùng CHUNG — CS yêu cầu "địa chỉ chọn
// dropdown giống của BOOKING", khỏi gõ tay sai chính tả.

import React, { useState, useEffect, useMemo } from 'react';
import SearchableDropdown from './SearchableDropdown';

// Cache dữ liệu hành chính (34 tỉnh/thành + ~3.300 phường/xã, cơ cấu mới 2025) — tải 1 lần cho cả app.
let _geoCache = null, _geoPromise = null;
export function loadGeo() {
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

export const stripAdminPrefix = (s) => String(s || '').toLowerCase()
    .replace(/^(tỉnh|thành phố|tp\.?|phường|xã|thị trấn|đặc khu|quận|huyện)\s+/i, '').trim();

/**
 * @param value    chuỗi địa chỉ hiện tại
 * @param onChange nhận chuỗi địa chỉ đã ghép
 * @param label    tiêu đề (mặc định "Địa chỉ nhận hàng (*)"); truyền null để ẩn
 * @param compact  true = kiểu gọn cho form trong popup (chữ nhỏ, ô input bo góc riêng)
 */
export default function AddressPicker({ value, onChange, label = 'Địa chỉ nhận hàng (*)', compact = false }) {
    const [geo, setGeo] = useState(null);
    const [tinhCode, setTinhCode] = useState('');
    const [phuongCode, setPhuongCode] = useState('');
    const [duong, setDuong] = useState('');
    const inited = React.useRef(false);

    useEffect(() => { let alive = true; loadGeo().then(g => { if (alive) setGeo(g); }); return () => { alive = false; }; }, []);

    // Tải xong → cố gắng tách chuỗi địa chỉ sẵn có để điền lại các ô (không đụng onChange, giữ nguyên giá trị cũ).
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

    const subLabel = { fontSize: '0.78rem', color: '#6B7280', marginBottom: 4 };
    const duongInput = compact
        ? { width: '100%', boxSizing: 'border-box', padding: '8px 11px', borderRadius: 9, border: '1px solid #e5e7eb', fontSize: '0.85rem', fontFamily: 'inherit' }
        : { width: '100%' };

    return (
        <div>
            {label && <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', color: '#374151' }}>{label}</label>}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                    <div style={subLabel}>🏙️ Tỉnh / Thành phố (*)</div>
                    <SearchableDropdown options={provOpts} value={tinhCode} onChange={onTinh}
                        placeholder={geo ? 'Chọn Tỉnh / Thành phố' : 'Đang tải…'} />
                </div>
                <div>
                    <div style={subLabel}>📍 Phường / Xã (*)</div>
                    {tinhCode
                        ? <SearchableDropdown options={wardOpts} value={phuongCode} onChange={onPhuong} placeholder="Chọn Phường / Xã" />
                        : <div style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid #eee', background: '#f9fafb', color: '#999', fontSize: 14, minHeight: 40, display: 'flex', alignItems: 'center' }}>Chọn Tỉnh/TP trước</div>}
                </div>
            </div>
            <div style={{ marginTop: 10 }}>
                <div style={subLabel}>🏠 Số nhà / Đường</div>
                <input type="text" value={duong} onChange={e => onDuongChange(e.target.value)} placeholder="VD: 123 Lê Lợi" style={duongInput} />
            </div>
            {value && value.trim() && (
                <div style={{ marginTop: '10px', padding: '10px 14px', background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: '8px', fontSize: '0.88rem', color: '#9A3412' }}>
                    📦 Giao đến: <b>{value}</b>
                </div>
            )}
        </div>
    );
}
