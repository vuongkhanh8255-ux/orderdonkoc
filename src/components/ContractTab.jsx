// src/components/ContractTab.jsx

import React, { useState, useEffect } from 'react';
import { useAppData } from '../context/AppDataContext';
import { supabase } from '../supabaseClient';

const ContractTab = () => {
    // Lấy các hàm cũ từ Context
    const {
        contractData,
        setContractData,
        isOutputVisible,
        copyMessage,
        handleContractFormChange,
        handleGenerateContract,
        handleCopyToClipboard,
        contractHTML
    } = useAppData();

    // --- TỰ ĐỘNG: ngày làm HĐ = ngày air − 3 (lấy ngày air từ link video) ---
    const [airLink, setAirLink] = useState('');
    const [airMsg, setAirMsg] = useState('');
    const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const setFromAir = (airDate) => {
        const air = new Date(airDate);
        if (isNaN(air)) return;
        const ky = new Date(air); ky.setDate(ky.getDate() - 3);   // ngày làm HĐ = air − 3 (air luôn SAU ngày HĐ)
        setContractData(prev => ({ ...prev, ngayThucHien: ymd(air), ngayKy: ymd(ky) }));
        setAirMsg(`✅ Ngày air ${air.toLocaleDateString('vi-VN')} → Ngày làm HĐ ${ky.toLocaleDateString('vi-VN')} (air − 3)`);
    };
    const resolveAirDate = async (link) => {
        const s = String(link || '').trim();
        if (!s) { setAirMsg(''); return; }
        const m = s.match(/\/video\/(\d{6,})/) || s.match(/\b(\d{15,})\b/);
        if (!m) { setAirMsg('⚠️ Dán link đầy đủ có /video/số (hoặc điền Ngày air tay).'); return; }
        const vid = m[1];
        setAirMsg('⏳ Đang lấy ngày air...');
        // 1) Thử trong hệ thống trước (nhanh, miễn phí)
        const { data } = await supabase.from('tiktok_shop_videos').select('post_date').eq('id', vid).maybeSingle();
        if (data?.post_date) { setFromAir(data.post_date); return; }
        // 2) Không có → hỏi TikHub (lấy ngày đăng của mọi video)
        try {
            const { data: j } = await supabase.functions.invoke('koc-channel-views', { body: { air_id: vid } });
            if (j?.date) { setFromAir(j.date); return; }
        } catch (_) { /* bỏ qua, xuống báo lỗi */ }
        setAirMsg('⚠️ Không tự lấy được ngày air (video quá mới / TikTok chặn) — điền Ngày air tay, ngày HĐ vẫn tự = air − 3.');
    };
    const soHDPreview = (() => {
        if (!contractData.ngayKy || !contractData.benB_ten) return '(tự sinh khi bấm Tạo)';
        const d = new Date(contractData.ngayKy); if (isNaN(d)) return '(tự sinh khi bấm Tạo)';
        const ten = (contractData.benB_ten || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toUpperCase().replace(/[^A-Z0-9]/g, '');
        return `${String(d.getDate()).padStart(2, '0')}${String(d.getMonth() + 1).padStart(2, '0')}${d.getFullYear()},HĐQC/${ten} - STELLA`;
    })();

    // --- PHẦN MỚI: QUẢN LÝ LINK HỢP ĐỒNG ---
    const [savedContracts, setSavedContracts] = useState([]);
    const [isLoadingContracts, setIsLoadingContracts] = useState(false);
    const [newLinkData, setNewLinkData] = useState({
        id_kenh: '',
        link_hop_dong: '',
        cast_value: '',
        ngay_tao: new Date().toISOString().split('T')[0]
    });

    const loadSavedContracts = async () => {
        setIsLoadingContracts(true);
        const { data, error } = await supabase
            .from('contract_links')
            .select('*')
            .order('created_at', { ascending: false });

        if (!error) setSavedContracts(data || []);
        setIsLoadingContracts(false);
    };

    const handleAddLinkSubmit = async (e) => {
        e.preventDefault();
        const { error } = await supabase.from('contract_links').insert([newLinkData]);

        if (error) {
            alert("Lỗi lưu: " + error.message);
        } else {
            alert("Đã lưu link hợp đồng thành công! 🎉");
            setNewLinkData({ ...newLinkData, id_kenh: '', link_hop_dong: '', cast_value: '' });
            loadSavedContracts();
        }
    };

    const deleteContractLink = async (id) => {
        if (window.confirm("Sếp có chắc muốn xóa link này không?")) {
            const { error } = await supabase.from('contract_links').delete().eq('id', id);
            if (!error) loadSavedContracts();
        }
    };

    useEffect(() => {
        loadSavedContracts();
    }, []);


    return (
        <div style={{ padding: '30px', maxWidth: '1400px', margin: '0 auto', fontFamily: "'Outfit', sans-serif" }}>
            <h1 className="page-header">QUẢN LÝ HỢP ĐỒNG & ĐỐI SOÁT</h1>

            <main style={{ display: 'grid', gridTemplateColumns: isOutputVisible ? '1fr 1fr' : '1fr', gap: '2rem', transition: 'grid-template-columns 0.3s ease-in-out', marginBottom: '3rem' }}>

                {/* FORM ĐIỀN THÔNG TIN */}
                <div className="mirinda-card" style={{ border: '1px solid #eee', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}>
                    <h2 style={{ textAlign: 'center', color: '#ff6a2c', marginBottom: '1.5rem', fontFamily: "'Outfit', sans-serif", letterSpacing: '1px' }}>Thông tin hợp đồng</h2>
                    <form onSubmit={handleGenerateContract} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

                        {/* Thông tin Bên A */}
                        <fieldset style={{ border: '1px solid #ddd', padding: '1.5rem', borderRadius: '12px', backgroundColor: '#f9fafb' }}>
                            <legend style={{ padding: '0 10px', fontWeight: '700', fontSize: '1.1rem', color: '#ff6a2c', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Bên A (Công ty)</legend>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1.5rem', marginTop: '0.5rem' }}>
                                <div><label style={{ color: '#666', marginBottom: '5px', display: 'block', fontSize: '0.9rem' }}>Tên công ty</label><input type="text" value={contractData.benA_ten} readOnly style={{ backgroundColor: '#fff', border: '1px solid #ddd', color: '#333', borderRadius: '8px', padding: '10px' }} /></div>
                                <div><label style={{ color: '#666', marginBottom: '5px', display: 'block', fontSize: '0.9rem' }}>Địa chỉ</label><input type="text" value={contractData.benA_diaChi} readOnly style={{ backgroundColor: '#fff', border: '1px solid #ddd', color: '#333', borderRadius: '8px', padding: '10px' }} /></div>
                                <div style={{ display: 'flex', gap: '10px' }}>
                                    <div style={{ flex: 1 }}><label style={{ color: '#666', marginBottom: '5px', display: 'block', fontSize: '0.9rem' }}>MST</label><input type="text" value={contractData.benA_mst} readOnly style={{ backgroundColor: '#fff', border: '1px solid #ddd', color: '#333', borderRadius: '8px', padding: '10px' }} /></div>
                                    <div style={{ flex: 1 }}><label style={{ color: '#666', marginBottom: '5px', display: 'block', fontSize: '0.9rem' }}>Đại diện</label><input type="text" value={contractData.benA_nguoiDaiDien} readOnly style={{ backgroundColor: '#fff', border: '1px solid #ddd', color: '#333', borderRadius: '8px', padding: '10px' }} /></div>
                                </div>
                            </div>
                        </fieldset>

                        {/* Thông tin Bên B */}
                        <fieldset style={{ border: '1px solid #ddd', padding: '1.5rem', borderRadius: '12px', backgroundColor: '#f9fafb' }}>
                            <legend style={{ padding: '0 10px', fontWeight: '700', fontSize: '1.1rem', color: '#8b5cf6', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Bên B (KOC)</legend>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1.5rem', marginTop: '0.5rem' }}>
                                <div className="form-group"><label style={{ color: '#666', fontSize: '0.9rem' }}>Họ Tên</label><input type="text" id="benB_ten" value={contractData.benB_ten} onChange={handleContractFormChange} required /></div>
                                <div className="form-group"><label style={{ color: '#666', fontSize: '0.9rem' }}>SĐT</label><input type="text" id="benB_sdt" value={contractData.benB_sdt} onChange={handleContractFormChange} required /></div>
                                <div className="form-group" style={{ gridColumn: 'span 2' }}><label style={{ color: '#666', fontSize: '0.9rem' }}>Địa chỉ</label><input type="text" id="benB_diaChi" value={contractData.benB_diaChi} onChange={handleContractFormChange} required /></div>
                                <div className="form-group"><label style={{ color: '#666', fontSize: '0.9rem' }}>CCCD</label><input type="text" id="benB_cccd" value={contractData.benB_cccd} onChange={handleContractFormChange} required /></div>
                                <div className="form-group"><label style={{ color: '#666', fontSize: '0.9rem' }}>MST Cá nhân</label><input type="text" id="benB_mst" value={contractData.benB_mst} onChange={handleContractFormChange} /></div>
                                <div className="form-group"><label style={{ color: '#666', fontSize: '0.9rem' }}>STK</label><input type="text" id="benB_stk" value={contractData.benB_stk} onChange={handleContractFormChange} required /></div>
                                <div className="form-group"><label style={{ color: '#666', fontSize: '0.9rem' }}>Ngân hàng</label><input type="text" id="benB_nganHang" value={contractData.nganHang} onChange={handleContractFormChange} required /></div>
                                <div className="form-group" style={{ gridColumn: 'span 2' }}><label style={{ color: '#666', fontSize: '0.9rem' }}>Chủ tài khoản</label><input type="text" id="benB_nguoiThuHuong" value={contractData.benB_nguoiThuHuong} onChange={handleContractFormChange} required /></div>
                            </div>
                        </fieldset>

                        {/* Chi tiết công việc */}
                        <fieldset style={{ border: '1px solid #ddd', padding: '1.5rem', borderRadius: '12px', backgroundColor: '#f9fafb' }}>
                            <legend style={{ padding: '0 10px', fontWeight: '700', fontSize: '1.1rem', color: '#3b82f6', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Công việc</legend>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem', marginTop: '0.5rem' }}>
                                <div className="form-group"><label style={{ color: '#666', fontSize: '0.9rem' }}>Ngày air (đăng clip) <span style={{ color: '#ff6a2c' }}>(tự nhảy từ Link SP)</span></label><input type="date" id="ngayThucHien" value={contractData.ngayThucHien} onChange={e => setFromAir(e.target.value)} required /></div>
                                <div className="form-group"><label style={{ color: '#666', fontSize: '0.9rem' }}>Ngày làm HĐ <span style={{ color: '#16a34a' }}>(tự = air − 3)</span></label><input type="date" id="ngayKy" value={contractData.ngayKy} readOnly style={{ background: '#f0fdf4', cursor: 'not-allowed' }} /></div>
                                <div className="form-group" style={{ gridColumn: 'span 2' }}><label style={{ color: '#666', fontSize: '0.9rem' }}>Số HĐ <span style={{ color: '#16a34a' }}>(tự động)</span></label><input type="text" value={soHDPreview} readOnly style={{ background: '#f0fdf4', cursor: 'not-allowed', fontWeight: 700 }} /></div>
                                <div className="form-group"><label style={{ color: '#666', fontSize: '0.9rem' }}>Sản phẩm</label><input type="text" id="sanPham" value={contractData.sanPham} onChange={handleContractFormChange} required /></div>
                                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                                    <label style={{ color: '#666', fontSize: '0.9rem' }}>Link SP / Link air clip <span style={{ color: '#ff6a2c' }}>(dán link video air → tự lấy ngày air, ngày HĐ = air − 3)</span></label>
                                    <input type="text" id="linkSanPham" value={contractData.linkSanPham} onChange={handleContractFormChange} onBlur={() => resolveAirDate(contractData.linkSanPham)} required />
                                    {airMsg && <div style={{ fontSize: '0.78rem', marginTop: 5, fontWeight: 600, color: airMsg.startsWith('✅') ? '#16a34a' : airMsg.startsWith('⏳') ? '#64748b' : '#d97706' }}>{airMsg}</div>}
                                </div>
                                <div className="form-group" style={{ gridColumn: 'span 2' }}><label style={{ color: '#666', fontSize: '0.9rem' }}>Link Kênh</label><input type="text" id="linkKenh" value={contractData.linkKenh} onChange={handleContractFormChange} required /></div>
                                <div className="form-group"><label style={{ color: '#666', fontSize: '0.9rem' }}>Số lượng</label><input type="number" id="soLuong" value={contractData.soLuong} onChange={handleContractFormChange} required /></div>
                                <div className="form-group"><label style={{ color: '#666', fontSize: '0.9rem' }}>Đơn giá</label><input type="number" id="donGia" value={contractData.donGia} onChange={handleContractFormChange} required /></div>
                            </div>
                        </fieldset>

                        <button type="submit" className="btn-primary" style={{ marginTop: '20px', padding: '15px', width: '100%', borderRadius: '8px' }}>⭐ Tạo Hợp Đồng ⭐</button>
                    </form>
                </div>

                {/* KẾT QUẢ HỢP ĐỒNG */}
                <div id="outputContainer" className="mirinda-card" style={{ display: isOutputVisible ? 'block' : 'none', border: '1px solid #eee', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                        <h2 style={{ fontSize: '1.5rem', color: '#ff6a2c', margin: 0, fontFamily: "'Outfit', sans-serif" }}>Nội dung hợp đồng</h2>
                        <div>
                            <button onClick={handleCopyToClipboard} className="btn-secondary" style={{ marginRight: '10px' }}>Sao chép</button>
                            <button onClick={() => window.print()} className="btn-secondary">In / PDF</button>
                        </div>
                    </div>
                    <div style={{ backgroundColor: '#fff', color: '#000', padding: '1rem', borderRadius: '8px', maxHeight: '80vh', overflow: 'auto', border: '1px dashed #ccc' }}>
                        <div id="contractContent" dangerouslySetInnerHTML={{ __html: contractHTML }} />
                    </div>
                    {copyMessage.text && <p style={{ color: copyMessage.type === 'success' ? '#10b981' : '#f43f5e', marginTop: '10px', textAlign: 'center', fontWeight: 'bold' }}>{copyMessage.text}</p>}
                </div>
            </main>

            {/* KHO LƯU TRỮ LINK HỢP ĐỒNG */}
            <div className="mirinda-card" style={{ border: '1px solid #eee' }}>
                <h2 style={{ textAlign: 'center', color: '#ff6a2c', marginBottom: '1.5rem', fontSize: '1.8rem', fontWeight: '800' }}>📁 KHO LƯU TRỮ LINK HỢP ĐỒNG</h2>

                {/* FORM THÊM LINK MỚI */}
                <div style={{ backgroundColor: '#f9fafb', padding: '1.5rem', borderRadius: '12px', border: '1px dashed #ddd', marginBottom: '2rem' }}>
                    <h3 style={{ marginTop: 0, color: '#ff6a2c', marginBottom: '15px' }}>+ Lưu Link Mới</h3>
                    <form onSubmit={handleAddLinkSubmit} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 150px', gap: '1rem', alignItems: 'end' }}>
                        <div>
                            <label style={{ color: '#666', fontSize: '0.9rem', marginBottom: '5px', display: 'block' }}>ID Kênh / Tên KOC</label>
                            <input
                                type="text"
                                value={newLinkData.id_kenh}
                                onChange={e => setNewLinkData({ ...newLinkData, id_kenh: e.target.value })}
                                placeholder="VD: hongocha..."
                                required
                            />
                        </div>
                        <div>
                            <label style={{ color: '#666', fontSize: '0.9rem', marginBottom: '5px', display: 'block' }}>Link Hợp Đồng (Drive/PDF)</label>
                            <input
                                type="text"
                                value={newLinkData.link_hop_dong}
                                onChange={e => setNewLinkData({ ...newLinkData, link_hop_dong: e.target.value })}
                                placeholder="Dán link vào đây..."
                                required
                            />
                        </div>
                        <div>
                            <label style={{ color: '#666', fontSize: '0.9rem', marginBottom: '5px', display: 'block' }}>CAST (Giá)</label>
                            <input
                                type="text"
                                value={newLinkData.cast_value}
                                onChange={e => setNewLinkData({ ...newLinkData, cast_value: e.target.value })}
                                placeholder="VD: 5.000.000"
                            />
                        </div>
                        <button type="submit" className="btn-primary" style={{ height: '46px', marginBottom: '2px', borderRadius: '8px' }}>LƯU NGAY</button>
                    </form>
                </div>

                {/* BẢNG DANH SÁCH */}
                <div style={{ overflowX: 'auto', borderRadius: '12px', border: '1px solid #eee' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead style={{ background: '#fff7ed' }}>
                            <tr style={{ color: '#ff6a2c', textTransform: 'uppercase', fontSize: '0.85rem' }}>
                                <th style={{ width: '50px', padding: '12px' }}>STT</th>
                                <th style={{ padding: '12px' }}>ID Kênh / KOC</th>
                                <th style={{ padding: '12px' }}>Link Hợp Đồng</th>
                                <th style={{ padding: '12px' }}>CAST</th>
                                <th style={{ padding: '12px' }}>Ngày Tạo</th>
                                <th style={{ padding: '12px' }}>Hành Động</th>
                            </tr>
                        </thead>
                        <tbody style={{ color: '#333' }}>
                            {isLoadingContracts ? (
                                <tr><td colSpan="6" style={{ textAlign: 'center', padding: '20px', color: '#666' }}>Đang tải dữ liệu...</td></tr>
                            ) : savedContracts.length === 0 ? (
                                <tr><td colSpan="6" style={{ textAlign: 'center', padding: '20px', color: '#999', fontStyle: 'italic' }}>Chưa có link nào được lưu.</td></tr>
                            ) : (
                                savedContracts.map((item, index) => (
                                    <tr key={item.id} style={{ borderBottom: '1px solid #eee' }}>
                                        <td style={{ textAlign: 'center', padding: '10px' }}>{index + 1}</td>
                                        <td style={{ fontWeight: 'bold', color: '#ff6a2c', padding: '10px' }}>{item.id_kenh}</td>
                                        <td style={{ padding: '10px' }}>
                                            <a href={item.link_hop_dong} target="_blank" rel="noopener noreferrer" style={{ color: '#3b82f6', textDecoration: 'underline' }}>
                                                {item.link_hop_dong}
                                            </a>
                                        </td>
                                        <td style={{ padding: '10px' }}>{item.cast_value}</td>
                                        <td style={{ padding: '10px' }}>{new Date(item.ngay_tao).toLocaleDateString('vi-VN')}</td>
                                        <td style={{ textAlign: 'center', padding: '10px' }}>
                                            <button
                                                className="btn-danger" onClick={() => deleteContractLink(item.id)} style={{ padding: '6px 14px', fontSize: '0.9rem', whiteSpace: 'nowrap' }}>
                                                Xóa
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default ContractTab;