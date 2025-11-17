// src/components/ContractTab.jsx

import React from 'react';
import { useAppData } from '../context/AppDataContext';

const ContractTab = () => {
  // Gọi state và logic CHỈ DÙNG CHO tab này
  const {
    contractData,
    isOutputVisible,
    copyMessage,
    handleContractFormChange,
    handleGenerateContract,
    handleCopyToClipboard,
    contractHTML
  } = useAppData();

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '1rem', fontFamily: 'Inter, sans-serif' }}>
        <header style={{ textAlign: 'center', marginBottom: '2rem', position: 'relative' }}>
            <h1 style={{ fontSize: '2.25rem', fontWeight: '700', color: '#C0392B', textShadow: '1px 1px 2px #27AE60' }}>
               <span style={{color: '#27AE60'}}>🎄🎅</span> Công Cụ Tạo Hợp Đồng Dịch Vụ Quảng Cáo <span style={{color: '#C0392B'}}>🎅🎄</span>
            </h1>
            <p style={{ marginTop: '0.5rem', color: '#27AE60' }}>Điền thông tin vào biểu mẫu bên dưới để tạo hợp đồng ngay lập tức.</p>
            <p style={{ position: 'absolute', top: '0', left: '0', fontSize: '1rem', fontWeight: 'bold', color: '#C0392B', backgroundColor: '#FFEBEE', padding: '5px 10px', borderRadius: '5px', border: '1px solid #C0392B' }}>
                Made by Khánh đẹp trai vkl
            </p>
        </header>

        <main style={{ display: 'grid', gridTemplateColumns: isOutputVisible ? '1fr 1fr' : '1fr', gap: '2rem', transition: 'grid-template-columns 0.3s ease-in-out' }}>
            {/* CỘT ĐIỀN THÔNG TIN */}
            <div style={{ backgroundColor: 'white', padding: '1.5rem', borderRadius: '0.75rem', boxShadow: '0 4px 10px rgba(192, 57, 43, 0.5)', border: '2px solid #C0392B' }}>
                <h2 style={{ fontSize: '1.5rem', fontWeight: '600', marginBottom: '1.5rem', paddingBottom: '0.75rem', borderBottom: '2px dashed #C0392B', color: '#27AE60' }}>Thông tin hợp đồng</h2>
                <form onSubmit={handleGenerateContract} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    
                    {/* Thông tin Bên A */}
                    <fieldset style={{ border: '1px solid #27AE60', padding: '1rem', borderRadius: '0.5rem', backgroundColor: '#f0fff0' }}>
                        <legend style={{ padding: '0 0.5rem', fontWeight: '700', fontSize: '1.125rem', color: '#C0392B' }}>Bên A (Công ty)</legend>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(1, 1fr)', '@media (min-width: 640px)': { gridTemplateColumns: 'repeat(2, 1fr)' }, gap: '1rem', marginTop: '0.5rem' }}>
                           <div style={{ gridColumn: 'span 2' }}><label htmlFor="benA_ten" style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#374151' }}>Tên công ty</label><input type="text" id="benA_ten" onChange={handleContractFormChange} style={{ marginTop: '0.25rem', display: 'block', width: '100%', borderRadius: '0.375rem', border: '1px solid #d1d5db', padding: '0.5rem', fontSize: '0.875rem', backgroundColor: '#f9fafb' }} value={contractData.benA_ten} readOnly /></div>
                           <div style={{ gridColumn: 'span 2' }}><label htmlFor="benA_diaChi" style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#374151' }}>Địa chỉ</label><input type="text" id="benA_diaChi" onChange={handleContractFormChange} style={{ marginTop: '0.25rem', display: 'block', width: '100%', borderRadius: '0.375rem', border: '1px solid #d1d5db', padding: '0.5rem', fontSize: '0.875rem', backgroundColor: '#f9fafb' }} value={contractData.benA_diaChi} readOnly /></div>
                           <div><label htmlFor="benA_mst" style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#374151' }}>Mã số thuế</label><input type="text" id="benA_mst" onChange={handleContractFormChange} style={{ marginTop: '0.25rem', display: 'block', width: '100%', borderRadius: '0.375rem', border: '1px solid #d1d5db', padding: '0.5rem', fontSize: '0.875rem', backgroundColor: '#f9fafb' }} value={contractData.benA_mst} readOnly /></div>
                           <div><label htmlFor="benA_nguoiDaiDien" style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#374151' }}>Người đại diện</label><input type="text" id="benA_nguoiDaiDien" onChange={handleContractFormChange} style={{ marginTop: '0.25rem', display: 'block', width: '100%', borderRadius: '0.375rem', border: '1px solid #d1d5db', padding: '0.5rem', fontSize: '0.875rem', backgroundColor: '#f9fafb' }} value={contractData.benA_nguoiDaiDien} readOnly /></div>
                           <div><label htmlFor="benA_chucVu" style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#374151' }}>Chức vụ</label><input type="text" id="benA_chucVu" onChange={handleContractFormChange} style={{ marginTop: '0.25rem', display: 'block', width: '100%', borderRadius: '0.375rem', border: '1px solid #d1d5db', padding: '0.5rem', fontSize: '0.875rem', backgroundColor: '#f9fafb' }} value={contractData.benA_chucVu} readOnly /></div>
                        </div>
                    </fieldset>

                    {/* Thông tin Bên B */}
                    <fieldset style={{ border: '1px solid #C0392B', padding: '1rem', borderRadius: '0.5rem', backgroundColor: '#fff5f5' }}>
                        <legend style={{ padding: '0 0.5rem', fontWeight: '700', fontSize: '1.125rem', color: '#27AE60' }}>Bên B (Người cung cấp dịch vụ)</legend>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(1, 1fr)', '@media (min-width: 640px)': { gridTemplateColumns: 'repeat(2, 1fr)' }, gap: '1rem', marginTop: '0.5rem' }}>
                            <div><label htmlFor="benB_ten" style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#374151' }}>Họ và Tên</label><input type="text" id="benB_ten" value={contractData.benB_ten} onChange={handleContractFormChange} style={{ marginTop: '0.25rem', display: 'block', width: '100%', borderRadius: '0.375rem', border: '1px solid #C0392B', padding: '0.5rem', fontSize: '0.875rem' }} placeholder="VD: MAI TIẾN LÂM" required /></div>
                            <div><label htmlFor="benB_sdt" style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#374151' }}>Số điện thoại</label><input type="text" id="benB_sdt" value={contractData.benB_sdt} onChange={handleContractFormChange} style={{ marginTop: '0.25rem', display: 'block', width: '100%', borderRadius: '0.375rem', border: '1px solid #C0392B', padding: '0.5rem', fontSize: '0.875rem' }} placeholder="VD: 0337972676" required /></div>
                            <div style={{ gridColumn: 'span 2' }}><label htmlFor="benB_diaChi" style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#374151' }}>Địa chỉ</label><input type="text" id="benB_diaChi" value={contractData.benB_diaChi} onChange={handleContractFormChange} style={{ marginTop: '0.25rem', display: 'block', width: '100%', borderRadius: '0.375rem', border: '1px solid #C0392B', padding: '0.5rem', fontSize: '0.875rem' }} placeholder="VD: Hải Vân, Hải Hậu, Nam Định" required /></div>
                            <div><label htmlFor="benB_cccd" style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#374151' }}>Số CCCD</label><input type="text" id="benB_cccd" value={contractData.benB_cccd} onChange={handleContractFormChange} style={{ marginTop: '0.25rem', display: 'block', width: '100%', borderRadius: '0.375rem', border: '1px solid #C0392B', padding: '0.5rem', fontSize: '0.875rem' }} placeholder="VD: 040202012030" required /></div>
                            <div><label htmlFor="benB_mst" style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#374151' }}>Mã số thuế cá nhân</label><input type="text" id="benB_mst" value={contractData.benB_mst} onChange={handleContractFormChange} style={{ marginTop: '0.25rem', display: 'block', width: '100%', borderRadius: '0.375rem', border: '1px solid #C0392B', padding: '0.5rem', fontSize: '0.875rem' }} placeholder="VD: 040202012030 (Optional)" /></div>
                            <div><label htmlFor="benB_stk" style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#374151' }}>Số tài khoản</label><input type="text" id="benB_stk" value={contractData.benB_stk} onChange={handleContractFormChange} style={{ marginTop: '0.25rem', display: 'block', width: '100%', borderRadius: '0.375rem', border: '1px solid #C0392B', padding: '0.5rem', fontSize: '0.875rem' }} placeholder="VD: 3720021903" required /></div>
                            <div><label htmlFor="benB_nganHang" style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#374151' }}>Ngân hàng thụ hưởng</label><input type="text" id="benB_nganHang" value={contractData.benB_nganHang} onChange={handleContractFormChange} style={{ marginTop: '0.25rem', display: 'block', width: '100%', borderRadius: '0.375rem', border: '1px solid #C0392B', padding: '0.5rem', fontSize: '0.875rem' }} placeholder="VD: VIETCOMBANK" required /></div>
                            <div style={{ gridColumn: 'span 2' }}><label htmlFor="benB_nguoiThuHuong" style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#374151' }}>Người thụ hưởng (Viết HOA không dấu)</label><input type="text" id="benB_nguoiThuHuong" value={contractData.benB_nguoiThuHuong} onChange={handleContractFormChange} style={{ marginTop: '0.25rem', display: 'block', width: '100%', borderRadius: '0.375rem', border: '1px solid #C0392B', padding: '0.5rem', fontSize: '0.875rem' }} placeholder="VD: MAI TIEN LAM" required /></div>
                        </div>
                    </fieldset>

                    {/* Chi tiết hợp đồng */}
                    <fieldset style={{ border: '1px solid #27AE60', padding: '1rem', borderRadius: '0.5rem', backgroundColor: '#f0fff0' }}>
                        <legend style={{ padding: '0 0.5rem', fontWeight: '700', fontSize: '1.125rem', color: '#C0392B' }}>Nội dung công việc</legend>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(1, 1fr)', '@media (min-width: 640px)': { gridTemplateColumns: 'repeat(2, 1fr)' }, gap: '1rem', marginTop: '0.5rem' }}>
                            <div><label htmlFor="soHopDong" style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#374151' }}>Số hợp đồng</label><input type="text" id="soHopDong" value={contractData.soHopDong} onChange={handleContractFormChange} style={{ marginTop: '0.25rem', display: 'block', width: '100%', borderRadius: '0.375rem', border: '1px solid #27AE60', padding: '0.5rem', fontSize: '0.875rem' }} placeholder="VD: 260725/HĐQC/ten-STELLA" required /></div>
                            <div><label htmlFor="ngayKy" style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#374151' }}>Ngày ký hợp đồng</label><input type="date" id="ngayKy" value={contractData.ngayKy} onChange={handleContractFormChange} style={{ marginTop: '0.25rem', display: 'block', width: '100%', borderRadius: '0.375rem', border: '1px solid #27AE60', padding: '0.5rem', fontSize: '0.875rem' }} required /></div>
                            <div><label htmlFor="ngayThucHien" style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#374151' }}>Ngày đăng video</label><input type="date" id="ngayThucHien" value={contractData.ngayThucHien} onChange={handleContractFormChange} style={{ marginTop: '0.25rem', display: 'block', width: '100%', borderRadius: '0.375rem', border: '1px solid #27AE60', padding: '0.5rem', fontSize: '0.875rem' }} required /></div>
                            <div><label htmlFor="sanPham" style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#374151' }}>Sản phẩm</label><input type="text" id="sanPham" value={contractData.sanPham} onChange={handleContractFormChange} style={{ marginTop: '0.25rem', display: 'block', width: '100%', borderRadius: '0.375rem', border: '1px solid #27AE60', padding: '0.5rem', fontSize: '0.875rem' }} placeholder="VD: Bodymist - Brand BODYMISS" required /></div>
                            <div style={{ gridColumn: 'span 2' }}><label htmlFor="linkSanPham" style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#374151' }}>Link sản phẩm</label><input type="text" id="linkSanPham" value={contractData.linkSanPham} onChange={handleContractFormChange} style={{ marginTop: '0.25rem', display: 'block', width: '100%', borderRadius: '0.375rem', border: '1px solid #27AE60', padding: '0.5rem', fontSize: '0.875rem' }} placeholder="Dán link sản phẩm ở đây" required /></div>
                            <div style={{ gridColumn: 'span 2' }}><label htmlFor="linkKenh" style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#374151' }}>Link kênh Tiktok</label><input type="text" id="linkKenh" value={contractData.linkKenh} onChange={handleContractFormChange} style={{ marginTop: '0.25rem', display: 'block', width: '100%', borderRadius: '0.375rem', border: '1px solid #27AE60', padding: '0.5rem', fontSize: '0.875rem' }} placeholder="Dán link kênh Tiktok ở đây" required /></div>
                            <div><label htmlFor="soLuong" style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#374151' }}>Số lượng video</label><input type="number" id="soLuong" value={contractData.soLuong} onChange={handleContractFormChange} style={{ marginTop: '0.25rem', display: 'block', width: '100%', borderRadius: '0.375rem', border: '1px solid #27AE60', padding: '0.5rem', fontSize: '0.875rem' }} min="1" required /></div>
                            <div><label htmlFor="donGia" style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#374151' }}>Đơn giá (VNĐ)</label><input type="number" id="donGia" value={contractData.donGia} onChange={handleContractFormChange} style={{ marginTop: '0.25rem', display: 'block', width: '100%', borderRadius: '0.375rem', border: '1px solid #27AE60', padding: '0.5rem', fontSize: '0.875rem' }} placeholder="VD: 2000000" required /></div>
                        </div>
                    </fieldset>
                    <div style={{ paddingTop: '1rem', textAlign: 'right' }}>
                        <button type="submit" style={{ display: 'inline-flex', justifyContent: 'center', alignItems: 'center', padding: '0.5rem 1.5rem', border: '1px solid transparent', boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)', fontSize: '0.875rem', fontWeight: 'bold', borderRadius: '0.375rem', color: 'white', backgroundColor: '#C0392B', cursor: 'pointer', transition: 'background-color 0.15s ease-in-out' }} onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#A93226'} onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#C0392B'}>
                            Tạo Hợp Đồng
                        </button>
                    </div>
                </form>
            </div>

            {/* CỘT HIỂN THỊ KẾT QUẢ */}
            <div id="outputContainer" style={{ backgroundColor: 'white', padding: '1.5rem', borderRadius: '0.75rem', boxShadow: '0 4px 10px rgba(43, 168, 86, 0.5)', border: '2px solid #27AE60', display: isOutputVisible ? 'block' : 'none' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px dashed #C0392B', paddingBottom: '0.75rem', marginBottom: '1rem' }}>
                    <h2 style={{ fontSize: '1.5rem', fontWeight: '700', fontFamily: 'Inter, sans-serif', color: '#C0392B' }}>Nội dung hợp đồng</h2>
                    <div>
                        <button onClick={handleCopyToClipboard} style={{ padding: '0.5rem 1rem', fontSize: '0.875rem', fontWeight: 'bold', borderRadius: '0.375rem', color: 'white', backgroundColor: '#27AE60', border: 'none', cursor: 'pointer', transition: 'background-color 0.15s ease-in-out' }} onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#1F8C4B'} onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#27AE60'}>
                            Sao chép
                        </button>
                        <button onClick={() => window.print()} style={{ marginLeft: '0.5rem', padding: '0.5rem 1rem', fontSize: '0.875rem', fontWeight: 'bold', borderRadius: '0.375rem', color: '#374151', backgroundColor: '#F1C40F', border: 'none', cursor: 'pointer', transition: 'background-color 0.15s ease-in-out' }} onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#D4AC0D'} onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#F1C40F'}>
                            In / PDF
                        </button>
                    </div>
                </div>
                <div style={{ backgroundColor: '#f9fafb', padding: '1rem', borderRadius: '0.375rem', overflow: 'auto', maxHeight: '80vh', border: '1px dashed #C0392B' }}>
                    <div id="contractContent" dangerouslySetInnerHTML={{ __html: contractHTML }} />
                </div>
                <div style={{ marginTop: '0.5rem', fontSize: '0.875rem', fontWeight: '500', color: copyMessage.type === 'success' ? '#27AE60' : copyMessage.type === 'error' ? '#C0392B' : 'transparent', opacity: copyMessage.type === 'hidden' ? 0 : 1, transition: 'opacity 0.3s ease-in-out' }}>
                    {copyMessage.text}
                </div>
            </div>
        </main>
    </div>
  );
};

export default ContractTab;