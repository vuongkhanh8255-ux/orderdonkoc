// src/components/ContractTab.jsx

import React, { useState, useEffect } from 'react';
import { useAppData } from '../context/AppDataContext';
import { supabase } from '../supabaseClient';

const ContractTab = () => {
    // Lấy các hàm cũ từ Context
    const {
        contractData,
        isOutputVisible,
        copyMessage,
        handleContractFormChange,
        handleGenerateContract,
        handleCopyToClipboard,
        contractHTML
    } = useAppData();

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
            <h1 className="page-header" style={{ marginBottom: '30px', background: 'linear-gradient(135deg, #FFFFFF 0%, #00D4FF 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', textAlign: 'center', fontSize: '2.5rem', fontWeight: '800', fontFamily: "'Space Grotesk', sans-serif" }}>QUẢN LÝ HỢP ĐỒNG & ĐỐI SOÁT</h1>

            <main style={{ display: 'grid', gridTemplateColumns: isOutputVisible ? '1fr 1fr' : '1fr', gap: '2rem', transition: 'grid-template-columns 0.3s ease-in-out', marginBottom: '3rem' }}>

                {/* FORM ĐIỀN THÔNG TIN */}
                <div className="mirinda-card" style={{ backdropFilter: 'blur(10px)', border: '1px solid rgba(0, 212, 255, 0.2)', boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2)' }}>
                    <h2 style={{ textAlign: 'center', color: '#00D4FF', marginBottom: '1.5rem', fontFamily: "'Space Grotesk', sans-serif", letterSpacing: '1px' }}>Thông tin hợp đồng</h2>
                    <form onSubmit={handleGenerateContract} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

                        {/* Thông tin Bên A */}
                        <fieldset style={{ border: '1px solid rgba(0, 212, 255, 0.3)', padding: '1.5rem', borderRadius: '12px', backgroundColor: 'rgba(15, 37, 68, 0.5)' }}>
                            <legend style={{ padding: '0 10px', fontWeight: '700', fontSize: '1.1rem', color: '#00D4FF', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Bên A (Công ty)</legend>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1.5rem', marginTop: '0.5rem' }}>
                                <div><label style={{ color: '#FFFFFF', marginBottom: '5px', display: 'block', fontSize: '0.9rem' }}>Tên công ty</label><input type="text" value={contractData.benA_ten} readOnly style={{ backgroundColor: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: '8px', padding: '10px' }} /></div>
                                <div><label style={{ color: '#FFFFFF', marginBottom: '5px', display: 'block', fontSize: '0.9rem' }}>Địa chỉ</label><input type="text" value={contractData.benA_diaChi} readOnly style={{ backgroundColor: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: '8px', padding: '10px' }} /></div>
                                <div style={{ display: 'flex', gap: '10px' }}>
                                    <div style={{ flex: 1 }}><label style={{ color: '#FFFFFF', marginBottom: '5px', display: 'block', fontSize: '0.9rem' }}>MST</label><input type="text" value={contractData.benA_mst} readOnly style={{ backgroundColor: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: '8px', padding: '10px' }} /></div>
                                    <div style={{ flex: 1 }}><label style={{ color: '#FFFFFF', marginBottom: '5px', display: 'block', fontSize: '0.9rem' }}>Đại diện</label><input type="text" value={contractData.benA_nguoiDaiDien} readOnly style={{ backgroundColor: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: '8px', padding: '10px' }} /></div>
                                </div>
                            </div>
                        </fieldset>

                        {/* Thông tin Bên B */}
                        <fieldset style={{ border: '1px solid rgba(168, 85, 247, 0.3)', padding: '1.5rem', borderRadius: '12px', backgroundColor: 'rgba(15, 37, 68, 0.5)' }}>
                            <legend style={{ padding: '0 10px', fontWeight: '700', fontSize: '1.1rem', color: '#A855F7', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Bên B (KOC)</legend>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1.5rem', marginTop: '0.5rem' }}>
                                <div className="form-group"><label style={{ color: '#fff', fontSize: '0.9rem' }}>Họ Tên</label><input className="cosmic-input" type="text" id="benB_ten" value={contractData.benB_ten} onChange={handleContractFormChange} required /></div>
                                <div className="form-group"><label style={{ color: '#fff', fontSize: '0.9rem' }}>SĐT</label><input className="cosmic-input" type="text" id="benB_sdt" value={contractData.benB_sdt} onChange={handleContractFormChange} required /></div>
                                <div className="form-group" style={{ gridColumn: 'span 2' }}><label style={{ color: '#fff', fontSize: '0.9rem' }}>Địa chỉ</label><input className="cosmic-input" type="text" id="benB_diaChi" value={contractData.benB_diaChi} onChange={handleContractFormChange} required /></div>
                                <div className="form-group"><label style={{ color: '#fff', fontSize: '0.9rem' }}>CCCD</label><input className="cosmic-input" type="text" id="benB_cccd" value={contractData.benB_cccd} onChange={handleContractFormChange} required /></div>
                                <div className="form-group"><label style={{ color: '#fff', fontSize: '0.9rem' }}>MST Cá nhân</label><input className="cosmic-input" type="text" id="benB_mst" value={contractData.benB_mst} onChange={handleContractFormChange} /></div>
                                <div className="form-group"><label style={{ color: '#fff', fontSize: '0.9rem' }}>STK</label><input className="cosmic-input" type="text" id="benB_stk" value={contractData.benB_stk} onChange={handleContractFormChange} required /></div>
                                <div className="form-group"><label style={{ color: '#fff', fontSize: '0.9rem' }}>Ngân hàng</label><input className="cosmic-input" type="text" id="benB_nganHang" value={contractData.nganHang} onChange={handleContractFormChange} required /></div>
                                <div className="form-group" style={{ gridColumn: 'span 2' }}><label style={{ color: '#fff', fontSize: '0.9rem' }}>Chủ tài khoản</label><input className="cosmic-input" type="text" id="benB_nguoiThuHuong" value={contractData.benB_nguoiThuHuong} onChange={handleContractFormChange} required /></div>
                            </div>
                        </fieldset>

                        {/* Chi tiết công việc */}
                        <fieldset style={{ border: '1px solid rgba(0, 212, 255, 0.3)', padding: '1.5rem', borderRadius: '12px', backgroundColor: 'rgba(15, 37, 68, 0.5)' }}>
                            <legend style={{ padding: '0 10px', fontWeight: '700', fontSize: '1.1rem', color: '#00D4FF', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Công việc</legend>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem', marginTop: '0.5rem' }}>
                                <div className="form-group"><label style={{ color: '#fff', fontSize: '0.9rem' }}>Số HĐ</label><input className="cosmic-input" type="text" id="soHopDong" value={contractData.soHopDong} onChange={handleContractFormChange} required /></div>
                                <div className="form-group"><label style={{ color: '#fff', fontSize: '0.9rem' }}>Ngày ký</label><input className="cosmic-input" type="date" id="ngayKy" value={contractData.ngayKy} onChange={handleContractFormChange} required /></div>
                                <div className="form-group"><label style={{ color: '#fff', fontSize: '0.9rem' }}>Ngày đăng</label><input className="cosmic-input" type="date" id="ngayThucHien" value={contractData.ngayThucHien} onChange={handleContractFormChange} required /></div>
                                <div className="form-group"><label style={{ color: '#fff', fontSize: '0.9rem' }}>Sản phẩm</label><input className="cosmic-input" type="text" id="sanPham" value={contractData.sanPham} onChange={handleContractFormChange} required /></div>
                                <div className="form-group" style={{ gridColumn: 'span 2' }}><label style={{ color: '#fff', fontSize: '0.9rem' }}>Link SP</label><input className="cosmic-input" type="text" id="linkSanPham" value={contractData.linkSanPham} onChange={handleContractFormChange} required /></div>
                                <div className="form-group" style={{ gridColumn: 'span 2' }}><label style={{ color: '#fff', fontSize: '0.9rem' }}>Link Kênh</label><input className="cosmic-input" type="text" id="linkKenh" value={contractData.linkKenh} onChange={handleContractFormChange} required /></div>
                                <div className="form-group"><label style={{ color: '#fff', fontSize: '0.9rem' }}>Số lượng</label><input className="cosmic-input" type="number" id="soLuong" value={contractData.soLuong} onChange={handleContractFormChange} required /></div>
                                <div className="form-group"><label style={{ color: '#fff', fontSize: '0.9rem' }}>Đơn giá</label><input className="cosmic-input" type="number" id="donGia" value={contractData.donGia} onChange={handleContractFormChange} required /></div>
                            </div>
                        </fieldset>

                        <button type="submit" className="cosmic-button-glow" style={{ marginTop: '20px', padding: '15px' }}>⭐ Tạo Hợp Đồng ⭐</button>
                    </form>
                </div>

                {/* KẾT QUẢ HỢP ĐỒNG */}
                <div id="outputContainer" className="mirinda-card" style={{ display: isOutputVisible ? 'block' : 'none', border: '1px solid rgba(0, 212, 255, 0.4)', boxShadow: '0 0 30px rgba(0, 212, 255, 0.15)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                        <h2 style={{ fontSize: '1.5rem', color: '#00D4FF', margin: 0, fontFamily: "'Space Grotesk', sans-serif" }}>Nội dung hợp đồng</h2>
                        <div>
                            <button onClick={handleCopyToClipboard} className="btn-secondary" style={{ marginRight: '10px' }}>Sao chép</button>
                            <button onClick={() => window.print()} className="btn-secondary">In / PDF</button>
                        </div>
                    </div>
                    <div style={{ backgroundColor: '#fff', color: '#000', padding: '1rem', borderRadius: '8px', maxHeight: '80vh', overflow: 'auto', border: '1px dashed #ccc' }}>
                        <div id="contractContent" dangerouslySetInnerHTML={{ __html: contractHTML }} />
                    </div>
                    {copyMessage.text && <p style={{ color: copyMessage.type === 'success' ? '#00D4FF' : '#FF6600', marginTop: '10px', textAlign: 'center', fontWeight: 'bold' }}>{copyMessage.text}</p>}
                </div>
            </main>

            {/* KHO LƯU TRỮ LINK HỢP ĐỒNG */}
            <div className="mirinda-card" style={{ backdropFilter: 'blur(10px)', border: '1px solid rgba(0, 212, 255, 0.2)' }}>
                <h2 style={{ textAlign: 'center', background: 'linear-gradient(135deg, #00D4FF 0%, #A855F7 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', marginBottom: '1.5rem', fontSize: '1.8rem', fontWeight: '800' }}>📁 KHO LƯU TRỮ LINK HỢP ĐỒNG</h2>

                {/* FORM THÊM LINK MỚI */}
                <div style={{ backgroundColor: 'rgba(15, 37, 68, 0.5)', padding: '1.5rem', borderRadius: '12px', border: '1px dashed rgba(0, 212, 255, 0.3)', marginBottom: '2rem' }}>
                    <h3 style={{ marginTop: 0, color: '#00D4FF', marginBottom: '15px' }}>+ Lưu Link Mới</h3>
                    <form onSubmit={handleAddLinkSubmit} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 150px', gap: '1rem', alignItems: 'end' }}>
                        <div>
                            <label style={{ color: '#fff', fontSize: '0.9rem', marginBottom: '5px', display: 'block' }}>ID Kênh / Tên KOC</label>
                            <input
                                type="text"
                                value={newLinkData.id_kenh}
                                onChange={e => setNewLinkData({ ...newLinkData, id_kenh: e.target.value })}
                                placeholder="VD: hongocha..."
                                required
                            />
                        </div>
                        <div>
                            <label style={{ color: '#fff', fontSize: '0.9rem', marginBottom: '5px', display: 'block' }}>Link Hợp Đồng (Drive/PDF)</label>
                            <input
                                className="cosmic-input"
                                type="text"
                                value={newLinkData.link_hop_dong}
                                onChange={e => setNewLinkData({ ...newLinkData, link_hop_dong: e.target.value })}
                                placeholder="Dán link vào đây..."
                                required
                            />
                        </div>
                        <div>
                            <label style={{ color: '#fff', fontSize: '0.9rem', marginBottom: '5px', display: 'block' }}>CAST (Giá)</label>
                            <input
                                type="text"
                                value={newLinkData.cast_value}
                                onChange={e => setNewLinkData({ ...newLinkData, cast_value: e.target.value })}
                                placeholder="VD: 5.000.000"
                            />
                        </div>
                        <button type="submit" className="cosmic-button" style={{ height: '46px', marginBottom: '2px', background: 'linear-gradient(135deg, #00D4FF 0%, #3B82F6 100%)' }}>LƯU NGAY</button>
                    </form>
                </div>

                {/* BẢNG DANH SÁCH */}
                <div style={{ overflowX: 'auto', borderRadius: '12px', border: '1px solid rgba(0, 212, 255, 0.2)' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead style={{ background: 'linear-gradient(135deg, rgba(0, 212, 255, 0.15) 0%, rgba(168, 85, 247, 0.1) 100%)' }}>
                            <tr style={{ color: '#00D4FF', textTransform: 'uppercase', fontSize: '0.85rem' }}>
                                <th style={{ width: '50px', padding: '12px' }}>STT</th>
                                <th style={{ padding: '12px' }}>ID Kênh / KOC</th>
                                <th style={{ padding: '12px' }}>Link Hợp Đồng</th>
                                <th style={{ padding: '12px' }}>CAST</th>
                                <th style={{ padding: '12px' }}>Ngày Tạo</th>
                                <th style={{ padding: '12px' }}>Hành Động</th>
                            </tr>
                        </thead>
                        <tbody style={{ color: '#fff' }}>
                            {isLoadingContracts ? (
                                <tr><td colSpan="6" style={{ textAlign: 'center', padding: '20px', color: 'rgba(255,255,255,0.7)' }}>Đang tải dữ liệu...</td></tr>
                            ) : savedContracts.length === 0 ? (
                                <tr><td colSpan="6" style={{ textAlign: 'center', padding: '20px', color: 'rgba(255,255,255,0.5)', fontStyle: 'italic' }}>Chưa có link nào được lưu.</td></tr>
                            ) : (
                                savedContracts.map((item, index) => (
                                    <tr key={item.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                        <td style={{ textAlign: 'center', padding: '10px' }}>{index + 1}</td>
                                        <td style={{ fontWeight: 'bold', color: '#00D4FF', padding: '10px' }}>{item.id_kenh}</td>
                                        <td style={{ padding: '10px' }}>
                                            <a href={item.link_hop_dong} target="_blank" rel="noopener noreferrer" style={{ color: '#A855F7', textDecoration: 'underline' }}>
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