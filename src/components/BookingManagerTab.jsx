// src/components/BookingManagerTab.jsx

import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../supabaseClient';
import { useAppData } from '../context/AppDataContext';
// Import thư viện vẽ biểu đồ
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer, Label } from 'recharts';
import { normalizeProductName } from '../utils/productMapping';

const COLORS = ['#ff6a2c', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#f43f5e', '#14b8a6'];

// --- HÀM HELPER FORMAT ---
const formatCurrency = (val) => {
    if (!val) return '';
    return String(val).replace(/\D/g, '').replace(/\B(?=(\d{3})+(?!\d))/g, ".");
};
const parseMoney = (str) => { return parseFloat(String(str).replace(/[^\d]/g, '')) || 0; };
const formatDate = (dateStr) => { if (!dateStr) return ''; return new Date(dateStr).toLocaleDateString('vi-VN'); };

const BookingManagerTab = () => {
    // 1. Lấy thêm sanPhams và hàm loadSanPhamsByBrand từ Context
    const { brands, nhanSus, sanPhams, loadSanPhamsByBrand } = useAppData();

    const [bookings, setBookings] = useState([]);
    const [loading, setLoading] = useState(false);

    // State sửa link
    const [editingId, setEditingId] = useState(null);
    const [tempLink, setTempLink] = useState('');

    // State form nhập ngoài
    const [showManualForm, setShowManualForm] = useState(false);
    const [manualBooking, setManualBooking] = useState({
        id_kenh: '', ho_ten: '', brand_id: '', san_pham: '', nhansu_id: '', cast: '0', cms: '10%'
    });

    // --- STATE BỘ LỌC ---
    const [filterBrand, setFilterBrand] = useState('');
    const [filterProduct, setFilterProduct] = useState('');
    const [filterStaff, setFilterStaff] = useState('');
    const [filterStatus, setFilterStatus] = useState('all');
    // Mặc định lấy tháng hiện tại
    const [filterMonth, setFilterMonth] = useState(new Date().toISOString().slice(0, 7));

    const loadBookings = async () => {
        setLoading(true);
        // Lấy tất cả booking sắp xếp mới nhất
        const { data, error } = await supabase.from('bookings').select('*').order('created_at', { ascending: false });
        if (!error) setBookings(data || []);
        setLoading(false);
    };

    useEffect(() => { loadBookings(); }, []);

    // --- LOGIC OVERDUE ---
    const checkOverdue = (dateStr, status) => {
        if (status === 'done') return false;
        if (!dateStr) return false;
        const sentDate = new Date(dateStr);
        const today = new Date();
        const diffTime = Math.abs(today - sentDate);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return diffDays > 20;
    };

    // --- LOGIC LỌC & THỐNG KÊ ---
    const processedData = useMemo(() => {
        const contextFiltered = bookings.filter(item => {
            // Lọc theo Tháng (Quan trọng)
            if (filterMonth) {
                // Ưu tiên ngày gửi đơn, nếu ko có thì lấy ngày tạo
                const dateToCheck = item.ngay_gui_don || item.created_at;
                const itemDate = dateToCheck ? dateToCheck.slice(0, 7) : '';
                if (itemDate !== filterMonth) return false;
            }
            if (filterBrand && String(item.brand_id) !== String(filterBrand)) return false;
            if (filterProduct && !item.san_pham.toLowerCase().includes(filterProduct.toLowerCase())) return false;
            if (filterStaff && String(item.nhansu_id) !== String(filterStaff)) return false;
            return true;
        });

        const stats = { pending: 0, done: 0, overdue: 0 };

        contextFiltered.forEach(item => {
            if (item.status === 'done') stats.done++;
            else if (checkOverdue(item.ngay_gui_don, item.status)) stats.overdue++;
            else stats.pending++;
        });

        const finalFiltered = contextFiltered.filter(item => {
            const isOverdue = checkOverdue(item.ngay_gui_don, item.status);
            if (filterStatus === 'pending') return item.status !== 'done' && !isOverdue;
            if (filterStatus === 'done') return item.status === 'done';
            if (filterStatus === 'overdue') return isOverdue;
            return true;
        });

        return { filtered: finalFiltered, stats };
    }, [bookings, filterBrand, filterProduct, filterStaff, filterStatus, filterMonth]);

    const getBrandName = (id) => brands.find(b => b.id === id)?.ten_brand || 'Khác';
    const getStaffName = (id) => nhanSus.find(n => n.id === id)?.ten_nhansu || 'Unknown';

    // --- TÍNH TOÁN DỮ LIỆU BIỂU ĐỒ (Dựa trên kết quả đã lọc) ---
    const chartData = useMemo(() => {
        const data = processedData.filtered; // Dùng chính dữ liệu đang hiển thị ở bảng
        const map = {};

        data.forEach(item => {
            const bName = getBrandName(item.brand_id);
            map[bName] = (map[bName] || 0) + 1;
        });

        return Object.keys(map).map(key => ({
            name: key,
            value: map[key]
        })).sort((a, b) => b.value - a.value); // Sắp xếp từ cao xuống thấp
    }, [processedData.filtered, brands]);


    // --- XỬ LÝ CHỌN BRAND ĐỂ LỌC SẢN PHẨM ---
    const handleManualBrandChange = (e) => {
        const newBrandId = e.target.value;
        setManualBooking({
            ...manualBooking,
            brand_id: newBrandId,
            san_pham: ''
        });
        loadSanPhamsByBrand(newBrandId);
    };

    // Action: Thêm Booking Ngoài
    const handleManualAdd = async (e) => {
        e.preventDefault();
        if (!manualBooking.id_kenh || !manualBooking.brand_id || !manualBooking.san_pham) {
            alert("Vui lòng điền đủ thông tin!");
            return;
        }
        try {
            const { error } = await supabase.from('bookings').insert([{
                ngay_gui_don: new Date().toISOString().split('T')[0],
                id_kenh: manualBooking.id_kenh,
                ho_ten: manualBooking.ho_ten || manualBooking.id_kenh,
                cast_amount: parseMoney(manualBooking.cast),
                cms: manualBooking.cms,
                brand_id: manualBooking.brand_id,
                san_pham: normalizeProductName(manualBooking.san_pham), // [FIX] Normalize
                nhansu_id: manualBooking.nhansu_id,
                status: 'pending',
                link_air: '',
                ghi_chu: 'Booking ngoài'
            }]);
            if (error) throw error;
            alert("Đã thêm booking thành công!");
            setManualBooking({ id_kenh: '', ho_ten: '', brand_id: '', san_pham: '', nhansu_id: '', cast: '0', cms: '10%' });
            setShowManualForm(false);
            loadBookings();
        } catch (err) { alert("Lỗi: " + err.message); }
    };

    // Action: Update Link Air
    const extractVideoId = (url) => {
        try {
            if (url.includes('video/')) return url.split('video/')[1].split('?')[0].replace('/', '');
            return '';
        } catch (e) { return ''; }
    };

    const handleUpdateLink = async (bookingItem) => {
        if (!tempLink) {
            alert("Vui lòng điền link video!");
            return;
        }
        const videoId = extractVideoId(tempLink);
        try {
            const { error: bookingError } = await supabase.from('bookings').update({ link_air: tempLink, status: 'done' }).eq('id', bookingItem.id);
            if (bookingError) throw bookingError;

            const { error: airLinkError } = await supabase.from('air_links').insert([{
                link_air_koc: tempLink, id_kenh: bookingItem.id_kenh, id_video: videoId,
                brand_id: bookingItem.brand_id, san_pham: normalizeProductName(bookingItem.san_pham), nhansu_id: bookingItem.nhansu_id, // [FIX] Normalize
                cast: bookingItem.cast_amount, cms_brand: bookingItem.cms,
                ngay_air: new Date().toISOString().split('T')[0], ngay_booking: bookingItem.ngay_gui_don
            }]);
            if (airLinkError) throw airLinkError;

            alert("✅ Đã cập nhật! Dữ liệu đã đồng bộ sang Link Air.");
            setEditingId(null); setTempLink(''); loadBookings();
        } catch (err) { alert("Lỗi: " + err.message); }
    };

    const generateTikTokLink = (idKenh) => {
        if (!idKenh) return '#';
        const cleanId = idKenh.replace('@', '').trim();
        return `https://www.tiktok.com/@${cleanId}`;
    };

    // Styles
    // Styles
    const inputStyle = { width: '100%', boxSizing: 'border-box' }; // Global CSS handles padding/border
    const statCardStyle = (bgColor, color, isActive) => ({
        flex: 1, padding: '20px', borderRadius: '12px',
        backgroundColor: isActive ? color : bgColor,
        color: isActive ? 'white' : color,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        boxShadow: isActive ? '0 4px 15px rgba(0,0,0,0.2)' : '0 4px 10px rgba(0,0,0,0.05)',
        minWidth: '150px', cursor: 'pointer',
        transition: 'all 0.2s ease',
        border: isActive ? '2px solid transparent' : `1px solid ${color}`
    });
    const getStatusStyle = (status) => status === 'done'
        ? { backgroundColor: '#e8f5e9', color: 'green', padding: '5px 10px', borderRadius: '15px', fontWeight: 'bold', fontSize: '11px' }
        : { backgroundColor: '#fff3e0', color: '#ef6c00', padding: '5px 10px', borderRadius: '15px', fontWeight: 'bold', fontSize: '11px' };

    return (
        <div style={{ padding: '20px' }}>
            {/* FORM NHẬP TAY */}
            {/* FORM NHẬP TAY - LUÔN HIỆN */}
            <div style={{ backgroundColor: '#fff7ed', padding: '20px', borderRadius: '12px', marginBottom: '20px', border: '1px solid #fed7aa' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                    <h3 style={{ marginTop: 0, color: '#ff6a2c', margin: 0, fontSize: '1.1rem', fontWeight: '700' }}>THÊM BOOKING NGOÀI</h3>
                </div>
                <form onSubmit={handleManualAdd} style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '15px' }}>

                    <input placeholder="ID Kênh (*)" value={manualBooking.id_kenh} onChange={e => setManualBooking({ ...manualBooking, id_kenh: e.target.value })} style={inputStyle} required />
                    <input placeholder="Tên KOC" value={manualBooking.ho_ten} onChange={e => setManualBooking({ ...manualBooking, ho_ten: e.target.value })} style={inputStyle} />

                    <select value={manualBooking.brand_id} onChange={handleManualBrandChange} style={inputStyle} required>
                        <option value="">-Brand-</option>
                        {brands.map(b => <option key={b.id} value={b.id}>{b.ten_brand}</option>)}
                    </select>

                    <div>
                        <input
                            list="manual_products_list"
                            placeholder="Sản phẩm (*)"
                            value={manualBooking.san_pham}
                            onChange={e => setManualBooking({ ...manualBooking, san_pham: e.target.value })}
                            style={inputStyle}
                            required
                            disabled={!manualBooking.brand_id}
                            autoComplete="off"
                        />
                        <datalist id="manual_products_list">
                            {sanPhams.map(sp => (
                                <option key={sp.id} value={sp.ten_sanpham} />
                            ))}
                        </datalist>
                    </div>

                    <select value={manualBooking.nhansu_id} onChange={e => setManualBooking({ ...manualBooking, nhansu_id: e.target.value })} style={inputStyle}><option value="">-Nhân sự-</option>{nhanSus.map(n => <option key={n.id} value={n.id}>{n.ten_nhansu}</option>)}</select>
                    <input placeholder="Cast (VNĐ)" value={manualBooking.cast} onChange={e => setManualBooking({ ...manualBooking, cast: formatCurrency(e.target.value) })} style={inputStyle} />
                    <input placeholder="CMS (%)" value={manualBooking.cms} onChange={e => setManualBooking({ ...manualBooking, cms: e.target.value })} style={inputStyle} />

                    <button type="submit" className="btn-primary">LƯU BOOKING</button>
                </form>
            </div>

            {/* DASHBOARD THỐNG KÊ SỐ LIỆU */}
            <div style={{ display: 'flex', gap: '20px', marginBottom: '30px' }}>
                <div style={statCardStyle('#fff3e0', '#ef6c00', filterStatus === 'pending')} onClick={() => setFilterStatus(filterStatus === 'pending' ? 'all' : 'pending')}>
                    <span style={{ fontSize: '2.5rem', fontWeight: '900' }}>{processedData.stats.pending}</span>
                    <span style={{ fontSize: '0.9rem', fontWeight: 'bold', textTransform: 'uppercase' }}>⏳ ĐANG CHỜ (PENDING)</span>
                </div>
                <div style={statCardStyle('#ffebee', '#c62828', filterStatus === 'overdue')} onClick={() => setFilterStatus(filterStatus === 'overdue' ? 'all' : 'overdue')}>
                    <span style={{ fontSize: '2.5rem', fontWeight: '900' }}>{processedData.stats.overdue}</span>
                    <span style={{ fontSize: '0.9rem', fontWeight: 'bold', textTransform: 'uppercase' }}>🔥 QUÁ HẠN (&gt;20 NGÀY)</span>
                </div>
                <div style={statCardStyle('#e8f5e9', '#2e7d32', filterStatus === 'done')} onClick={() => setFilterStatus(filterStatus === 'done' ? 'all' : 'done')}>
                    <span style={{ fontSize: '2.5rem', fontWeight: '900' }}>{processedData.stats.done}</span>
                    <span style={{ fontSize: '0.9rem', fontWeight: 'bold', textTransform: 'uppercase' }}>✅ ĐÃ AIR (DONE)</span>
                </div>
            </div>

            {/* --- [MỚI] BIỂU ĐỒ TRÒN TỶ TRỌNG BOOKING --- */}
            <div className="mirinda-card" style={{ height: '500px', display: 'flex', flexDirection: 'column' }}>

                <h4 style={{ textAlign: 'center', marginBottom: '10px' }}>
                    <span className="section-title">📊 TỶ TRỌNG BOOKING (Tháng {filterMonth.split('-')[1]}/{filterMonth.split('-')[0]})</span>
                </h4>
                <div style={{ flex: 1, position: 'relative' }}>
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie
                                data={chartData}
                                cx="50%"
                                cy="50%"
                                innerRadius={80}
                                outerRadius={120}
                                paddingAngle={2}
                                dataKey="value"
                                stroke="#000"
                                strokeWidth={2}
                            >
                                {chartData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                ))}
                                <Label
                                    value={chartData.reduce((a, b) => a + b.value, 0)}
                                    position="center"
                                    fill="#374151"
                                    style={{ fontSize: '24px', fontWeight: '700', fontFamily: 'Inter', textAnchor: 'middle' }}
                                />
                            </Pie>
                            <Tooltip formatter={(val) => `${val} booking`} contentStyle={{ borderRadius: '8px', border: '1px solid #ddd', boxShadow: '0 2px 5px rgba(0,0,0,0.1)' }} />
                            <Legend layout="horizontal" verticalAlign="bottom" align="center" wrapperStyle={{ fontSize: '12px', width: '100%', marginBottom: '10px' }} />
                        </PieChart>
                    </ResponsiveContainer>
                </div>
            </div>



            {/* THANH BỘ LỌC */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr) 100px', gap: '10px', marginBottom: '20px', backgroundColor: 'white', padding: '20px', borderRadius: '16px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)', border: '1px solid #f3f4f6' }}>
                <input type="month" value={filterMonth} onChange={e => setFilterMonth(e.target.value)} style={{ ...inputStyle, fontWeight: 'bold', color: '#165B33' }} />
                <select value={filterBrand} onChange={e => setFilterBrand(e.target.value)} style={inputStyle}>
                    <option value="">-- Tất cả Brand --</option>
                    {brands.map(b => <option key={b.id} value={b.id}>{b.ten_brand}</option>)}
                </select>
                <input placeholder="🔍 Tìm tên sản phẩm..." value={filterProduct} onChange={e => setFilterProduct(e.target.value)} style={inputStyle} />
                <select value={filterStaff} onChange={e => setFilterStaff(e.target.value)} style={inputStyle}>
                    <option value="">-- Tất cả Nhân sự --</option>
                    {nhanSus.map(n => <option key={n.id} value={n.id}>{n.ten_nhansu}</option>)}
                </select>
                <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={inputStyle}>
                    <option value="all">Tất cả trạng thái</option>
                    <option value="pending">⏳ Chỉ hiện Pending</option>
                    <option value="overdue">🔥 Chỉ hiện Quá Hạn</option>
                    <option value="done">✅ Chỉ hiện Done</option>
                </select>
                <button
                    onClick={() => { setFilterBrand(''); setFilterProduct(''); setFilterStaff(''); setFilterStatus('all'); setFilterMonth(new Date().toISOString().slice(0, 7)); }}
                    className="mirinda-button secondary"
                >
                    Xóa Lọc
                </button>
            </div>

            {/* BẢNG CHI TIẾT */}
            <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '12px', boxShadow: '0 4px 15px rgba(0,0,0,0.05)' }}>
                <div style={{ marginBottom: '10px', fontSize: '0.9rem', color: '#666' }}>Tìm thấy: <b>{processedData.filtered.length}</b> booking</div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                    <thead style={{ backgroundColor: '#f5f5f5', borderBottom: '2px solid #ddd' }}>
                        <tr>
                            <th style={{ padding: '12px' }}>STT</th>
                            <th style={{ padding: '12px' }}>Ngày Gửi</th>
                            <th style={{ padding: '12px', textAlign: 'left' }}>Thông tin KOC</th>
                            <th style={{ padding: '12px', textAlign: 'left', width: '250px' }}>Link Air (Video)</th>
                            <th style={{ padding: '12px' }}>ID Video</th>
                            <th style={{ padding: '12px' }}>Brand / SP</th>
                            <th style={{ padding: '12px' }}>Nhân sự</th>
                            <th style={{ padding: '12px' }}>Hành động</th>
                        </tr>
                    </thead>
                    <tbody>
                        {processedData.filtered.map((item, index) => {
                            const isEditing = editingId === item.id;
                            const channelLink = generateTikTokLink(item.id_kenh);
                            const videoId = extractVideoId(item.link_air);
                            const isOverdue = checkOverdue(item.ngay_gui_don, item.status);
                            return (
                                <tr key={item.id} style={{ borderBottom: '1px solid #eee', backgroundColor: isOverdue ? '#fff8f8' : 'white' }}>
                                    <td style={{ textAlign: 'center', padding: '10px' }}>{index + 1}</td>
                                    <td style={{ textAlign: 'center', padding: '10px' }}>
                                        {formatDate(item.ngay_gui_don)}
                                        {isOverdue && <div style={{ color: 'red', fontSize: '0.7rem', fontWeight: 'bold', marginTop: '3px' }}>⚠️ &gt; 20 ngày</div>}
                                    </td>
                                    <td style={{ textAlign: 'left', padding: '10px' }}>
                                        <a href={channelLink} target="_blank" rel="noreferrer" style={{ color: '#1976D2', fontWeight: 'bold', display: 'block' }}>{item.id_kenh}</a>
                                        <div style={{ fontSize: '0.8rem', color: '#666' }}>{item.ho_ten}</div>
                                        <div style={{ fontSize: '0.75rem', color: '#555', marginTop: '2px' }}>Cast: {parseInt(item.cast_amount || 0).toLocaleString('vi-VN')} | CMS: {item.cms}</div>
                                    </td>
                                    <td style={{ textAlign: 'left', padding: '10px' }}>
                                        {isEditing ? (
                                            <input type="text" placeholder="Paste link..." value={tempLink} onChange={e => setTempLink(e.target.value)} style={{ width: '100%', padding: '8px', border: '1px solid #1976D2', borderRadius: '4px' }} autoFocus />
                                        ) : (
                                            item.link_air ?
                                                <a href={item.link_air} target="_blank" rel="noreferrer" style={{ color: '#D42426' }}>Link Video</a> :
                                                <span style={getStatusStyle(item.status)}>{isOverdue ? 'Chưa trả bài!' : (item.status === 'done' ? 'Đã Air' : 'Đang chờ...')}</span>
                                        )}
                                    </td>
                                    <td style={{ textAlign: 'center', padding: '10px', fontSize: '0.8rem', color: '#666' }}>{videoId || '-'}</td>
                                    <td style={{ textAlign: 'center', padding: '10px' }}>
                                        <div style={{ fontWeight: 'bold' }}>{getBrandName(item.brand_id)}</div>
                                        <div style={{ fontSize: '0.85rem' }}>{item.san_pham}</div>
                                        {item.ghi_chu && <div style={{ fontSize: '0.7rem', color: 'purple', fontStyle: 'italic' }}>{item.ghi_chu}</div>}
                                    </td>
                                    <td style={{ textAlign: 'center', padding: '10px' }}>{getStaffName(item.nhansu_id)}</td>
                                    <td style={{ textAlign: 'center', padding: '10px' }}>
                                        {isEditing ? (
                                            <div style={{ display: 'flex', gap: '5px', justifyContent: 'center' }}>
                                                <button onClick={() => { setEditingId(null); setTempLink(''); }} style={{ backgroundColor: '#777', color: 'white', border: 'none', borderRadius: '4px', padding: '5px 10px', cursor: 'pointer', fontSize: '11px' }}>Hủy</button>
                                            </div>
                                        ) : (
                                            <button
                                                onClick={() => { setEditingId(item.id); setTempLink(item.link_air || ''); }}
                                                style={{ backgroundColor: 'white', border: '1px solid #1976D2', color: '#1976D2', borderRadius: '4px', padding: '5px 10px', cursor: 'pointer', fontWeight: 'bold', fontSize: '11px' }}
                                            >
                                                {item.link_air ? 'Sửa' : '➕ Link'}
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div >
    );
};

export default BookingManagerTab;