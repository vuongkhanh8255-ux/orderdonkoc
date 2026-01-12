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
        <div style={{ padding: '30px', maxWidth: '1400px', margin: '0 auto', fontFamily: 'Inter, sans-serif' }}>
            <h1 className="page-header" style={{ color: '#000', textShadow: 'none' }}>QUẢN LÝ HỢP ĐỒNG & ĐỐI SOÁT</h1>

            <main style={{ display: 'grid', gridTemplateColumns: isOutputVisible ? '1fr 1fr' : '1fr', gap: '2rem', transition: 'grid-template-columns 0.3s ease-in-out', marginBottom: '3rem' }}>

                {/* FORM ĐIỀN THÔNG TIN */}
                <div className="mirinda-card">
                    <h2 style={{ textAlign: 'center', color: '#D42426', marginBottom: '1.5rem' }}>Thông tin hợp đồng</h2>
                    <form onSubmit={handleGenerateContract} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

                        {/* Thông tin Bên A */}
                        <fieldset style={{ border: '1px solid #27AE60', padding: '1rem', borderRadius: '0.5rem', backgroundColor: '#f0fff0' }}>
                            <legend style={{ padding: '0 0.5rem', fontWeight: '700', fontSize: '1.125rem', color: '#C0392B' }}>Bên A (Công ty)</legend>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1.5rem', marginTop: '0.5rem' }}>
                                <div><label>Tên công ty</label><input type="text" id="benA_ten" value={contractData.benA_ten} readOnly style={{ backgroundColor: '#f9fafb' }} /></div>
                                <div><label>Địa chỉ</label><input type="text" id="benA_diaChi" value={contractData.benA_diaChi} readOnly style={{ backgroundColor: '#f9fafb' }} /></div>
                                <div style={{ display: 'flex', gap: '10px' }}>
                                    <div style={{ flex: 1 }}><label>MST</label><input type="text" id="benA_mst" value={contractData.benA_mst} readOnly style={{ backgroundColor: '#f9fafb' }} /></div>
                                    <div style={{ flex: 1 }}><label>Đại diện</label><input type="text" id="benA_nguoiDaiDien" value={contractData.benA_nguoiDaiDien} readOnly style={{ backgroundColor: '#f9fafb' }} /></div>
                                </div>
                            </div>
                        </fieldset>

                        {/* Thông tin Bên B */}
                        <fieldset style={{ border: '1px solid #C0392B', padding: '1rem', borderRadius: '0.5rem', backgroundColor: '#fff5f5' }}>
                            <legend style={{ padding: '0 0.5rem', fontWeight: '700', fontSize: '1.125rem', color: '#27AE60' }}>Bên B (KOC)</legend>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1.5rem', marginTop: '0.5rem' }}>
                                <div><label>Họ Tên</label><input type="text" id="benB_ten" value={contractData.benB_ten} onChange={handleContractFormChange} required /></div>
                                <div><label>SĐT</label><input type="text" id="benB_sdt" value={contractData.benB_sdt} onChange={handleContractFormChange} required /></div>
                                <div style={{ gridColumn: 'span 2' }}><label>Địa chỉ</label><input type="text" id="benB_diaChi" value={contractData.benB_diaChi} onChange={handleContractFormChange} required /></div>
                                <div><label>CCCD</label><input type="text" id="benB_cccd" value={contractData.benB_cccd} onChange={handleContractFormChange} required /></div>
                                <div><label>MST Cá nhân</label><input type="text" id="benB_mst" value={contractData.benB_mst} onChange={handleContractFormChange} /></div>
                                <div><label>STK</label><input type="text" id="benB_stk" value={contractData.benB_stk} onChange={handleContractFormChange} required /></div>
                                <div><label>Ngân hàng</label><input type="text" id="benB_nganHang" value={contractData.nganHang} onChange={handleContractFormChange} required /></div>
                                <div style={{ gridColumn: 'span 2' }}><label>Chủ tài khoản</label><input type="text" id="benB_nguoiThuHuong" value={contractData.benB_nguoiThuHuong} onChange={handleContractFormChange} required /></div>
                            </div>
                        </fieldset>

                        {/* Chi tiết công việc */}
                        <fieldset style={{ border: '1px solid #27AE60', padding: '1rem', borderRadius: '0.5rem', backgroundColor: '#f0fff0' }}>
                            <legend style={{ padding: '0 0.5rem', fontWeight: '700', fontSize: '1.125rem', color: '#C0392B' }}>Công việc</legend>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem', marginTop: '0.5rem' }}>
                                <div><label>Số HĐ</label><input type="text" id="soHopDong" value={contractData.soHopDong} onChange={handleContractFormChange} required /></div>
                                <div><label>Ngày ký</label><input type="date" id="ngayKy" value={contractData.ngayKy} onChange={handleContractFormChange} required /></div>
                                <div><label>Ngày đăng</label><input type="date" id="ngayThucHien" value={contractData.ngayThucHien} onChange={handleContractFormChange} required /></div>
                                <div><label>Sản phẩm</label><input type="text" id="sanPham" value={contractData.sanPham} onChange={handleContractFormChange} required /></div>
                                <div style={{ gridColumn: 'span 2' }}><label>Link SP</label><input type="text" id="linkSanPham" value={contractData.linkSanPham} onChange={handleContractFormChange} required /></div>
                                <div style={{ gridColumn: 'span 2' }}><label>Link Kênh</label><input type="text" id="linkKenh" value={contractData.linkKenh} onChange={handleContractFormChange} required /></div>
                                <div><label>Số lượng</label><input type="number" id="soLuong" value={contractData.soLuong} onChange={handleContractFormChange} required /></div>
                                <div><label>Đơn giá</label><input type="number" id="donGia" value={contractData.donGia} onChange={handleContractFormChange} required /></div>
                            </div>
                        </fieldset>

                        <button type="submit" style={{ backgroundColor: '#D42426', padding: '12px', width: '100%' }}>Tạo Hợp Đồng</button>
                    </form>
                </div>

                {/* KẾT QUẢ HỢP ĐỒNG */}
                <div id="outputContainer" className="mirinda-card" style={{ display: isOutputVisible ? 'block' : 'none', border: '2px solid #27AE60' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                        <h2 style={{ fontSize: '1.5rem', color: '#C0392B', margin: 0 }}>Nội dung hợp đồng</h2>
                        <div>
                            <button onClick={handleCopyToClipboard} style={{ backgroundColor: '#27AE60', marginRight: '5px' }}>Sao chép</button>
                            <button onClick={() => window.print()} style={{ backgroundColor: '#F8B229', color: '#333' }}>In / PDF</button>
                        </div>
                    </div>
                    <div style={{ backgroundColor: '#f9fafb', padding: '1rem', borderRadius: '8px', maxHeight: '80vh', overflow: 'auto', border: '1px dashed #C0392B' }}>
                        <div id="contractContent" dangerouslySetInnerHTML={{ __html: contractHTML }} />
                    </div>
                    {copyMessage.text && <p style={{ color: copyMessage.type === 'success' ? 'green' : 'red', marginTop: '10px' }}>{copyMessage.text}</p>}
                </div>
            </main>

            {/* KHO LƯU TRỮ LINK HỢP ĐỒNG */}
            <div className="mirinda-card">
                <h2 style={{ textAlign: 'center', color: '#D42426', marginBottom: '1.5rem', fontSize: '1.8rem' }}>📁 KHO LƯU TRỮ LINK HỢP ĐỒNG</h2>

                {/* FORM THÊM LINK MỚI */}
                <div style={{ backgroundColor: '#f0fdf4', padding: '1.5rem', borderRadius: '12px', border: '1px dashed #165B33', marginBottom: '2rem' }}>
                    <h3 style={{ marginTop: 0, color: '#165B33', marginBottom: '15px' }}>+ Lưu Link Mới</h3>
                    <form onSubmit={handleAddLinkSubmit} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 150px', gap: '1rem', alignItems: 'end' }}>
                        <div>
                            <label>ID Kênh / Tên KOC</label>
                            <input
                                type="text"
                                value={newLinkData.id_kenh}
                                onChange={e => setNewLinkData({ ...newLinkData, id_kenh: e.target.value })}
                                placeholder="VD: hongocha..."
                                required
                            />
                        </div>
                        <div>
                            <label>Link Hợp Đồng (Drive/PDF)</label>
                            <input
                                type="text"
                                value={newLinkData.link_hop_dong}
                                onChange={e => setNewLinkData({ ...newLinkData, link_hop_dong: e.target.value })}
                                placeholder="Dán link vào đây..."
                                required
                            />
                        </div>
                        <div>
                            <label>CAST (Giá)</label>
                            <input
                                type="text"
                                value={newLinkData.cast_value}
                                onChange={e => setNewLinkData({ ...newLinkData, cast_value: e.target.value })}
                                placeholder="VD: 5.000.000"
                            />
                        </div>
                        <button type="submit" style={{ backgroundColor: '#165B33', height: '46px', marginBottom: '15px' }}>LƯU NGAY</button>
                    </form>
                </div>

                {/* BẢNG DANH SÁCH */}
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr>
                                <th style={{ width: '50px' }}>STT</th>
                                <th>ID Kênh / KOC</th>
                                <th>Link Hợp Đồng</th>
                                <th>CAST</th>
                                <th>Ngày Tạo</th>
                                <th>Hành Động</th>
                            </tr>
                        </thead>
                        <tbody>
                            {isLoadingContracts ? (
                                <tr><td colSpan="6" style={{ textAlign: 'center', padding: '20px' }}>Đang tải dữ liệu...</td></tr>
                            ) : savedContracts.length === 0 ? (
                                <tr><td colSpan="6" style={{ textAlign: 'center', padding: '20px', color: '#999' }}>Chưa có link nào được lưu.</td></tr>
                            ) : (
                                savedContracts.map((item, index) => (
                                    <tr key={item.id}>
                                        <td style={{ textAlign: 'center' }}>{index + 1}</td>
                                        <td style={{ fontWeight: 'bold', color: '#165B33' }}>{item.id_kenh}</td>
                                        <td>
                                            <a href={item.link_hop_dong} target="_blank" rel="noopener noreferrer" style={{ color: '#D42426', textDecoration: 'underline' }}>
                                                {item.link_hop_dong}
                                            </a>
                                        </td>
                                        <td>{item.cast_value}</td>
                                        <td>{new Date(item.ngay_tao).toLocaleDateString('vi-VN')}</td>
                                        <td style={{ textAlign: 'center' }}>
                                            <button
                                                className="btn-primary" onClick={() => deleteContractLink(item.id)} style={{ padding: '10px 20px', fontSize: '1rem', whiteSpace: 'nowrap' }}>
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