import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../supabaseClient';
import { useAppData } from '../context/AppDataContext';

// --- HÀM HELPER FORMAT ---
const formatCurrency = (val) => { 
    if(!val) return '';
    return String(val).replace(/\D/g, '').replace(/\B(?=(\d{3})+(?!\d))/g, "."); 
};
const parseMoney = (str) => { return parseFloat(String(str).replace(/[^\d]/g, '')) || 0; };
const formatDate = (dateStr) => { if(!dateStr) return ''; return new Date(dateStr).toLocaleDateString('vi-VN'); };

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
    const [filterMonth, setFilterMonth] = useState(new Date().toISOString().slice(0, 7));

    const loadBookings = async () => {
        setLoading(true);
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
            if (filterMonth) {
                const itemDate = item.ngay_gui_don ? item.ngay_gui_don.slice(0, 7) : '';
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

    // --- XỬ LÝ CHỌN BRAND ĐỂ LỌC SẢN PHẨM ---
    const handleManualBrandChange = (e) => {
        const newBrandId = e.target.value;
        // 1. Cập nhật state form, reset ô sản phẩm về rỗng
        setManualBooking({
            ...manualBooking, 
            brand_id: newBrandId,
            san_pham: '' 
        });
        // 2. Gọi hàm từ Context để tải sản phẩm của Brand này
        loadSanPhamsByBrand(newBrandId);
    };

    // Action: Thêm Booking Ngoài
    const handleManualAdd = async (e) => {
        e.preventDefault();
        if(!manualBooking.id_kenh || !manualBooking.brand_id || !manualBooking.san_pham) {
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
                san_pham: manualBooking.san_pham,
                nhansu_id: manualBooking.nhansu_id,
                status: 'pending',
                link_air: '',
                ghi_chu: 'Booking ngoài'
            }]);
            if(error) throw error;
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
        if (!tempLink) { alert("Vui lòng điền link video!"); return; }
        const videoId = extractVideoId(tempLink);
        try {
            const { error: bookingError } = await supabase.from('bookings').update({ link_air: tempLink, status: 'done' }).eq('id', bookingItem.id);
            if (bookingError) throw bookingError;

            const { error: airLinkError } = await supabase.from('air_links').insert([{
                link_air_koc: tempLink, id_kenh: bookingItem.id_kenh, id_video: videoId,
                brand_id: bookingItem.brand_id, san_pham: bookingItem.san_pham, nhansu_id: bookingItem.nhansu_id,
                cast: bookingItem.cast_amount, cms_brand: bookingItem.cms,
                ngay_air: new Date().toISOString().split('T')[0], ngay_booking: bookingItem.ngay_gui_don
            }]);
            if (airLinkError) throw airLinkError;

            alert("✅ Đã cập nhật! Dữ liệu đã đồng bộ sang Link Air.");
            setEditingId(null); setTempLink(''); loadBookings();
        } catch (err) { alert("Lỗi: " + err.message); }
    };

    const getBrandName = (id) => brands.find(b => b.id === id)?.ten_brand || 'Unknown';
    const getStaffName = (id) => nhanSus.find(n => n.id === id)?.ten_nhansu || 'Unknown';
    
    const generateTikTokLink = (idKenh) => {
        if (!idKenh) return '#';
        const cleanId = idKenh.replace('@', '').trim();
        return `https://www.tiktok.com/@${cleanId}`;
    };

    // Styles
    const inputStyle = { padding:'8px', border:'1px solid #ddd', borderRadius:'4px', width:'100%', boxSizing:'border-box' };
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
            {showManualForm ? (
                <div style={{ backgroundColor:'#e8f5e9', padding:'20px', borderRadius:'10px', marginBottom:'20px', border:'2px solid #2e7d32', animation: 'fadeIn 0.3s' }}>
                    <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'15px'}}>
                        <h3 style={{marginTop:0, color:'#2e7d32', margin:0}}>THÊM BOOKING NGOÀI (CÓ SẴN HÀNG)</h3>
                        <button onClick={() => setShowManualForm(false)} style={{background:'transparent', border:'none', cursor:'pointer', color:'#666'}}>Đóng X</button>
                    </div>
                    <form onSubmit={handleManualAdd} style={{display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:'15px'}}>
                        
                        <input placeholder="ID Kênh (*)" value={manualBooking.id_kenh} onChange={e=>setManualBooking({...manualBooking, id_kenh:e.target.value})} style={inputStyle} required />
                        <input placeholder="Tên KOC" value={manualBooking.ho_ten} onChange={e=>setManualBooking({...manualBooking, ho_ten:e.target.value})} style={inputStyle} />
                        
                        {/* --- SỬA LOGIC CHỌN BRAND --- */}
                        <select 
                            value={manualBooking.brand_id} 
                            onChange={handleManualBrandChange} 
                            style={inputStyle} 
                            required
                        >
                            <option value="">-Brand-</option>
                            {brands.map(b=><option key={b.id} value={b.id}>{b.ten_brand}</option>)}
                        </select>
                        
                        {/* --- SỬA LOGIC NHẬP SẢN PHẨM (SEARCH ĐƯỢC) --- */}
                        <div>
                            <input 
                                list="manual_products_list" // ID này phải khớp với datalist bên dưới
                                placeholder="Sản phẩm (*)" 
                                value={manualBooking.san_pham} 
                                onChange={e=>setManualBooking({...manualBooking, san_pham:e.target.value})} 
                                style={inputStyle} 
                                required 
                                disabled={!manualBooking.brand_id} // Khóa nếu chưa chọn Brand
                                autoComplete="off"
                            />
                            {/* Datalist chứa sản phẩm đã lọc */}
                            <datalist id="manual_products_list">
                                {sanPhams.map(sp => (
                                    <option key={sp.id} value={sp.ten_sanpham} />
                                ))}
                            </datalist>
                        </div>

                        <select value={manualBooking.nhansu_id} onChange={e=>setManualBooking({...manualBooking, nhansu_id:e.target.value})} style={inputStyle}><option value="">-Nhân sự-</option>{nhanSus.map(n=><option key={n.id} value={n.id}>{n.ten_nhansu}</option>)}</select>
                        <input placeholder="Cast (VNĐ)" value={manualBooking.cast} onChange={e=>setManualBooking({...manualBooking, cast:formatCurrency(e.target.value)})} style={inputStyle} />
                        <input placeholder="CMS (%)" value={manualBooking.cms} onChange={e=>setManualBooking({...manualBooking, cms:e.target.value})} style={inputStyle} />
                        
                        <button type="submit" style={{backgroundColor:'#2e7d32', color:'white', border:'none', borderRadius:'4px', cursor:'pointer', fontWeight:'bold'}}>LƯU BOOKING</button>
                    </form>
                </div>
            ) : (
                <div style={{display:'flex', justifyContent:'flex-end', marginBottom:'20px'}}>
                     <button onClick={() => setShowManualForm(true)} style={{backgroundColor:'#165B33', color:'white', padding:'10px 20px', border:'none', borderRadius:'20px', cursor:'pointer', fontWeight:'bold', boxShadow:'0 4px 10px rgba(0,0,0,0.1)'}}>
                        + Thêm Booking Ngoài
                    </button>
                </div>
            )}

            {/* DASHBOARD (CLICKABLE) */}
            <div style={{ display: 'flex', gap: '20px', marginBottom: '30px' }}>
                <div style={statCardStyle('#fff3e0', '#ef6c00', filterStatus === 'pending')} onClick={() => setFilterStatus(filterStatus === 'pending' ? 'all' : 'pending')}>
                    <span style={{fontSize:'2.5rem', fontWeight:'900'}}>{processedData.stats.pending}</span>
                    <span style={{fontSize:'0.9rem', fontWeight:'bold', textTransform:'uppercase'}}>⏳ ĐANG CHỜ (PENDING)</span>
                </div>
                <div style={statCardStyle('#ffebee', '#c62828', filterStatus === 'overdue')} onClick={() => setFilterStatus(filterStatus === 'overdue' ? 'all' : 'overdue')}>
                    <span style={{fontSize:'2.5rem', fontWeight:'900'}}>{processedData.stats.overdue}</span>
                    <span style={{fontSize:'0.9rem', fontWeight:'bold', textTransform:'uppercase'}}>🔥 QUÁ HẠN (&gt;20 NGÀY)</span>
                </div>
                <div style={statCardStyle('#e8f5e9', '#2e7d32', filterStatus === 'done')} onClick={() => setFilterStatus(filterStatus === 'done' ? 'all' : 'done')}>
                    <span style={{fontSize:'2.5rem', fontWeight:'900'}}>{processedData.stats.done}</span>
                    <span style={{fontSize:'0.9rem', fontWeight:'bold', textTransform:'uppercase'}}>✅ ĐÃ AIR (DONE)</span>
                </div>
            </div>

            {/* THANH BỘ LỌC */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr) 100px', gap: '10px', marginBottom: '20px', backgroundColor: 'white', padding: '15px', borderRadius: '10px', boxShadow: '0 2px 5px rgba(0,0,0,0.05)' }}>
                <input type="month" value={filterMonth} onChange={e => setFilterMonth(e.target.value)} style={{...inputStyle, fontWeight:'bold', color:'#165B33'}} />
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
                    onClick={() => { setFilterBrand(''); setFilterProduct(''); setFilterStaff(''); setFilterStatus('all'); setFilterMonth(''); }}
                    style={{backgroundColor:'#eee', border:'none', borderRadius:'4px', cursor:'pointer', fontWeight:'bold', color:'#555'}}
                >
                    Xóa Lọc
                </button>
            </div>
            
            {/* BẢNG CHI TIẾT */}
            <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '12px', boxShadow: '0 4px 15px rgba(0,0,0,0.05)' }}>
                <div style={{marginBottom:'10px', fontSize:'0.9rem', color:'#666'}}>Tìm thấy: <b>{processedData.filtered.length}</b> booking</div>
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
                                        {isOverdue && <div style={{color:'red', fontSize:'0.7rem', fontWeight:'bold', marginTop:'3px'}}>⚠️ &gt; 20 ngày</div>}
                                    </td>
                                    <td style={{ textAlign: 'left', padding: '10px' }}>
                                        <a href={channelLink} target="_blank" rel="noreferrer" style={{ color: '#1976D2', fontWeight: 'bold', display:'block' }}>{item.id_kenh}</a>
                                        <div style={{fontSize:'0.8rem', color:'#666'}}>{item.ho_ten}</div>
                                        <div style={{fontSize:'0.75rem', color:'#555', marginTop:'2px'}}>Cast: {parseInt(item.cast_amount || 0).toLocaleString('vi-VN')} | CMS: {item.cms}</div>
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
                                        <div style={{fontWeight:'bold'}}>{getBrandName(item.brand_id)}</div>
                                        <div style={{fontSize:'0.85rem'}}>{item.san_pham}</div>
                                        {item.ghi_chu && <div style={{fontSize:'0.7rem', color:'purple', fontStyle:'italic'}}>{item.ghi_chu}</div>}
                                    </td>
                                    <td style={{ textAlign: 'center', padding: '10px' }}>{getStaffName(item.nhansu_id)}</td>
                                    <td style={{ textAlign: 'center', padding: '10px' }}>
                                        {isEditing ? (
                                            <div style={{display:'flex', gap:'5px', justifyContent:'center'}}>
                                                <button onClick={() => handleUpdateLink(item)} style={{ backgroundColor: '#165B33', color: 'white', border: 'none', borderRadius: '4px', padding: '5px 10px', cursor: 'pointer', fontSize:'11px' }}>Lưu</button>
                                                <button onClick={() => {setEditingId(null); setTempLink('');}} style={{ backgroundColor: '#777', color: 'white', border: 'none', borderRadius: '4px', padding: '5px 10px', cursor: 'pointer', fontSize:'11px' }}>Hủy</button>
                                            </div>
                                        ) : (
                                            <button 
                                                onClick={() => { setEditingId(item.id); setTempLink(item.link_air || ''); }} 
                                                style={{ backgroundColor: 'white', border: '1px solid #1976D2', color: '#1976D2', borderRadius: '4px', padding: '5px 10px', cursor: 'pointer', fontWeight: 'bold', fontSize:'11px' }}
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
        </div>
    );
};

export default BookingManagerTab;