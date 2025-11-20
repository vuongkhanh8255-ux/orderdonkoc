// src/components/OrderTab.jsx

import React from 'react';
import { useAppData } from '../context/AppDataContext';
import ResizableHeader from './ResizableHeader';

const OrderTab = () => {
  // Gọi tất cả state và logic từ "bộ não"
  const {
    brands, nhanSus, sanPhams, filterSanPhams,
    isLoading, hoTen, setHoTen, idKenh, setIdKenh, sdt, setSdt,
    diaChi, setDiaChi, cccd, setCccd, selectedBrand, setSelectedBrand,
    selectedSanPhams, setSelectedSanPhams, selectedNhanSu, setSelectedNhanSu,
    loaiShip, setLoaiShip, donHangs, selectedOrders, currentPage, setCurrentPage,
    totalOrderCount, filterIdKenh, setFilterIdKenh, filterSdt, setFilterSdt,
    filterBrand, setFilterBrand, filterSanPham, setFilterSanPham, filterNhanSu, setFilterNhanSu,
    filterNgay, setFilterNgay, filterLoaiShip, setFilterLoaiShip, filterEditedStatus, setFilterEditedStatus,
    productSearchTerm, setProductSearchTerm, summaryDate, setSummaryDate, productSummary,
    rawSummaryData, isSummarizing, reportMonth, setReportMonth, reportYear, setReportYear,
    reportData, isReportLoading, sortConfig, editingDonHang, setEditingDonHang, isPastDeadlineForNewOrders,
    columnWidths, handleResize, handleQuantityChange, handleSubmit, handleIdKenhBlur,
    clearFilters, handleGetSummary, handleGenerateReport, requestSort, handleEdit,
    handleCancelEdit, handleUpdate, handleSelect, handleSelectAll, handleBulkUpdateStatus,
    handleExport, handleExportAll, sortedReportRows, totalsRow, totalPages
  } = useAppData();

  // Logic phân trang
  const ORDERS_PER_PAGE = 50; 
  const pageNumbers = [];
  const maxButtons = 5;
  let startPage = Math.max(1, currentPage - Math.floor(maxButtons / 2));
  let endPage = Math.min(totalPages, startPage + maxButtons - 1);
  if (endPage - startPage + 1 < maxButtons) {
      startPage = Math.max(1, endPage - maxButtons + 1);
  }
  for (let i = startPage; i <= endPage; i++) {
    pageNumbers.push(i);
  }

  // Headers cho bảng
  const headers = [ { key: 'select', label: <input type="checkbox" onChange={handleSelectAll} /> }, { key: 'stt', label: 'STT' }, { key: 'ngayGui', label: 'Ngày Gửi' }, { key: 'hoTenKOC', label: 'Họ Tên KOC' }, { key: 'cccd', label: 'CCCD' }, { key: 'idKenh', label: 'ID Kênh' }, { key: 'sdt', label: 'SĐT' }, { key: 'diaChi', label: 'Địa chỉ' }, { key: 'brand', label: 'Brand' }, { key: 'sanPham', label: 'Sản Phẩm (SL)' }, { key: 'nhanSu', label: 'Nhân Sự Gửi' }, { key: 'loaiShip', label: 'Loại Ship' }, { key: 'trangThai', label: 'Trạng Thái' }, { key: 'hanhDong', label: 'Hành Động' }, ];
  const summaryExportHeaders = [ { label: "Loại Ship", key: "loai_ship"}, { label: "Sản Phẩm", key: "ten_san_pham" }, { label: "Barcode", key: "barcode" }, { label: "Brand", key: "ten_brand" }, { label: "Tổng Số Lượng", key: "total_quantity" } ];


  return (
    <> 
      {/* Tiêu đề riêng cho Tab Order */}
      <div style={{ position: 'relative', textAlign: 'center', marginBottom: '2rem' }}>
          <h1 style={{ fontSize: '2.5rem', fontWeight: '800', color: '#ffffff', textShadow: '2px 2px 4px rgba(0,0,0,0.5)' }}>
              <span style={{color: '#165B33'}}>🎄</span> QUẢN LÝ ĐƠN HÀNG KOC <span style={{color: '#165B33'}}>🎄</span>
          </h1>
        
          <p style={{ position: 'absolute', top: '0', left: '0', fontSize: '1rem', fontWeight: 'bold', color: '#D42426', backgroundColor: '#fff', padding: '5px 15px', borderRadius: '20px', border: '2px solid #D42426', boxShadow: '0 2px 5px rgba(0,0,0,0.1)' }}>
              🎅 Made by Khánh đẹp trai vkl
          </p>
      </div>

      <div style={{ display: 'flex', gap: '2rem', marginBottom: '2rem' }}>
        
        {/* --- CỘT 1: FORM TẠO ĐƠN --- */}
        <div className="christmas-card" style={{ flex: 1 }}>
          <h2 style={{ textAlign: 'center', color: '#D42426', marginBottom: '1.5rem' }}>Tạo Đơn Gửi KOC</h2>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            
            <div><label>ID Kênh</label><input type="text" value={idKenh} onChange={e => setIdKenh(e.target.value)} onBlur={handleIdKenhBlur} required placeholder="Nhập ID kênh..." /></div>
            <div><label>Họ tên KOC</label><input type="text" value={hoTen} onChange={e => setHoTen(e.target.value)} required placeholder="Họ và tên..." /></div>
            <div><label>Số điện thoại</label><input type="text" value={sdt} onChange={e => setSdt(e.target.value)} required placeholder="SĐT..." /></div>
            <div><label>Địa chỉ</label><input type="text" value={diaChi} onChange={e => setDiaChi(e.target.value)} required placeholder="Địa chỉ..." /></div>
            <div><label>CCCD</label><input type="text" value={cccd} onChange={e => setCccd(e.target.value)} required maxLength="12" minLength="12" pattern="[0-9]*" title="Vui lòng nhập đủ 12 chữ số." placeholder="CCCD..." /></div>
            <div><label>Brand</label><select value={selectedBrand} onChange={e => setSelectedBrand(e.target.value)} required><option value="">-- Chọn Brand --</option>{brands.map(brand => (<option key={brand.id} value={brand.id}>{brand.ten_brand}</option>))}</select></div>
            <div>
              <label>Sản phẩm</label>
              <input type="text" placeholder="Tìm sản phẩm..." value={productSearchTerm} onChange={e => setProductSearchTerm(e.target.value)} disabled={!selectedBrand} />
              <div style={{ border: '1px solid #eee', borderRadius: '8px', padding: '10px', maxHeight: '150px', overflowY: 'auto', backgroundColor: '#f9f9f9' }}>
                {sanPhams.length > 0 ?
                  sanPhams.filter(sp => sp.ten_sanpham.toLowerCase().includes(productSearchTerm.toLowerCase())).map(sp => (
                    <div key={sp.id} style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                      <label htmlFor={sp.id} style={{ flex: 1, fontWeight: 'normal !important', fontSize: '0.9rem' }}>{sp.ten_sanpham}</label>
                      <input type="number" min="0" id={sp.id} value={selectedSanPhams[sp.id] || ''} onChange={(e) => handleQuantityChange(sp.id, e.target.value)} style={{ width: '70px', padding: '5px', textAlign: 'center' }} placeholder="0" />
                    </div>
                  )) : <p style={{ margin: 0, color: '#D42426', textAlign: 'center' }}>Vui lòng chọn Brand để xem sản phẩm</p>}
              </div>
            </div>
            <div><label>Nhân sự gửi</label><select value={selectedNhanSu} onChange={e => setSelectedNhanSu(e.target.value)} required><option value="">-- Chọn nhân sự --</option>{nhanSus.map(nhansu => (<option key={nhansu.id} value={nhansu.id}>{nhansu.ten_nhansu}</option>))}</select></div>
            <div>
              <label>Loại hình vận chuyển</label>
              <div style={{ display: 'flex', gap: '1.5rem', marginTop: '0.5rem', padding: '10px', backgroundColor: '#f9f9f9', borderRadius: '8px' }}>
                <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}><input type="radio" value="Ship thường" checked={loaiShip === 'Ship thường'} onChange={e => setLoaiShip(e.target.value)} style={{ marginRight: '8px' }} />Ship thường</label>
                <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}><input type="radio" value="Hỏa tốc" checked={loaiShip === 'Hỏa tốc'} onChange={e => setLoaiShip(e.target.value)} style={{ marginRight: '8px' }} />Hỏa tốc 🚀</label>
              </div>
            </div>
            <button type="submit" disabled={isLoading || isPastDeadlineForNewOrders} style={{ marginTop: '1rem', backgroundColor: '#D42426' }}>{isLoading ? 'Đang xử lý...' : '🎁 GỬI ĐƠN NGAY'}</button>
            {isPastDeadlineForNewOrders && (<p style={{ color: '#D42426', textAlign: 'center', marginTop: '0.5rem', fontWeight: 'bold' }}>⚠️ Đã quá 16h30, không thể tạo đơn hàng mới.</p>)}
           </form>
        </div>

        {/* --- CỘT 2: TỔNG HỢP SẢN PHẨM --- */}
        <div className="christmas-card" style={{ flex: 1 }}>
            <h2 style={{ textAlign: 'center', marginBottom: '1.5rem', color: '#165B33' }}>Tổng Hợp Sản Phẩm</h2>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1rem' }}>
                <input type="date" value={summaryDate} onChange={e => setSummaryDate(e.target.value)} style={{ flex: 1 }} />
                <button onClick={handleGetSummary} disabled={isSummarizing} style={{ backgroundColor: '#165B33' }}>{isSummarizing ? '...' : 'Tổng hợp'}</button>
            </div>
            <div style={{ marginTop: '1rem', maxHeight: '500px', overflowY: 'auto' }}>
                {rawSummaryData.length === 0 && !isSummarizing && <p style={{ textAlign: 'center', color: '#999' }}>Chưa có dữ liệu cho ngày đã chọn.</p>}
                {productSummary['Ship thường'].length > 0 && (
                    <div style={{marginBottom: '1.5rem'}}>
                        <h3 style={{color: '#165B33', borderBottom: '1px solid #eee', paddingBottom: '5px', fontWeight: 'bold'}}>📦 Ship Thường</h3>
                        <table style={{ width: '100%' }}><thead><tr><th>Sản phẩm</th><th>SL</th></tr></thead>
                        <tbody>{productSummary['Ship thường'].map(item => (<tr key={`${item.ten_san_pham}-thuong`}><td>{item.ten_san_pham}<br/><small style={{color: '#777'}}>{item.ten_brand} - {item.barcode}</small></td><td style={{textAlign: 'center'}}><strong>{item.total_quantity}</strong></td></tr>))}</tbody></table>
                    </div>
                )}
                {productSummary['Hỏa tốc'].length > 0 && (
                   <div>
                        <h3 style={{color: '#D42426', borderBottom: '1px solid #eee', paddingBottom: '5px', fontWeight: 'bold'}}>🚀 Hỏa Tốc</h3>
                        <table style={{ width: '100%' }}><thead><tr><th>Sản phẩm</th><th>SL</th></tr></thead>
                        <tbody>{productSummary['Hỏa tốc'].map(item => (<tr key={`${item.ten_san_pham}-toc`}><td>{item.ten_san_pham}<br/><small style={{color: '#777'}}>{item.ten_brand} - {item.barcode}</small></td><td style={{textAlign: 'center'}}><strong>{item.total_quantity}</strong></td></tr>))}</tbody></table>
                    </div>
                )}
                {rawSummaryData.length > 0 && 
                    <div style={{ marginTop: '1rem', textAlign: 'right' }}>
                        <button onClick={() => handleExport({ data: rawSummaryData, headers: summaryExportHeaders, filename: `tong-hop-san-pham-${summaryDate}.xlsx`})} style={{ backgroundColor: '#F8B229', color: '#333' }}>Xuất File Tổng Hợp</button>
                    </div>
                }
            </div>
        </div>
      </div>

      {/* --- CỘT 3: BÁO CÁO (MÀU TRẮNG & BÓNG ĐẸP) --- */}
      <div className="christmas-card" style={{ marginBottom: '2rem' }}>
        <h2 style={{ textAlign: 'center', color: '#D42426' }}>Báo Cáo Hiệu Suất Nhân Sự</h2>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', justifyContent: 'center', marginBottom: '1.5rem' }}>
            <select value={reportMonth} onChange={e => setReportMonth(e.target.value)} style={{ width: 'auto' }}>
               {Array.from({ length: 12 }, (_, i) => <option key={i+1} value={i+1}>Tháng {i+1}</option>)}
            </select>
            <input type="number" value={reportYear} onChange={e => setReportYear(e.target.value)} style={{ width: '100px' }} />
            <button onClick={handleGenerateReport} disabled={isReportLoading} style={{ backgroundColor: '#D42426' }}>
                {isReportLoading ? 'Đang tính toán...' : '📊 Xem Báo Cáo'}
            </button>
        </div>
        {reportData.reportRows.length > 0 ? (
          <div style={{width: '100%', overflowX: 'auto'}}>
            <table style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ cursor: 'pointer' }} onClick={() => requestSort('ten_nhansu')}>Nhân Sự {sortConfig.key === 'ten_nhansu' ? (sortConfig.direction === 'asc' ? '▲' : '▼') : ''}</th>
                  <th style={{ cursor: 'pointer', textAlign: 'center' }} onClick={() => requestSort('sl_order')}>SL Order {sortConfig.key === 'sl_order' ? (sortConfig.direction === 'asc' ? '▲' : '▼') : ''}</th>
                  <th style={{ textAlign: 'center' }} >AOV Đơn Order</th>
                  <th style={{ cursor: 'pointer', textAlign: 'center' }} onClick={() => requestSort('chi_phi_tong')}>Chi Phí Tổng {sortConfig.key === 'chi_phi_tong' ? (sortConfig.direction === 'asc' ? '▲' : '▼') : ''}</th>
                  {reportData.brandHeaders.map(brand => (
                      <th key={brand} style={{ cursor: 'pointer', textAlign: 'center' }} onClick={() => requestSort(brand)}>{brand} {sortConfig.key === brand ? (sortConfig.direction === 'asc' ? '▲' : '▼') : ''}</th>
                  ))}
                </tr>
               </thead>
              <tbody>
                {sortedReportRows.map((item) => (
                   <tr key={item.nhansu_id}>
                      <td style={{ fontWeight: 'bold', color: '#165B33' }}>{item.ten_nhansu}</td>
                      <td style={{ textAlign: 'center' }}>{item.sl_order}</td>
                      <td style={{ textAlign: 'center' }}>{Math.round(item.aov_don_order).toLocaleString('vi-VN')} đ</td>
                      <td style={{ textAlign: 'center' }}>{Math.round(item.chi_phi_tong).toLocaleString('vi-VN')} đ</td>
                      {reportData.brandHeaders.map(brand => (
                           <td key={brand} style={{ textAlign: 'center' }}>{item.brand_counts[brand] || 0}</td>
                      ))}
                    </tr>
                ))}
              </tbody>
              <tfoot>
               {totalsRow && (
                  <tr style={{backgroundColor: '#FDE2E2', fontWeight: 'bold', color: '#D42426'}}>
                    <td>TỔNG CỘNG</td>
                    <td style={{ textAlign: 'center' }}>{totalsRow.sl_order}</td>
                    <td style={{ textAlign: 'center' }}>{Math.round(totalsRow.aov_don_order).toLocaleString('vi-VN')} đ</td>
                    <td style={{ textAlign: 'center' }}>{Math.round(totalsRow.chi_phi_tong).toLocaleString('vi-VN')} đ</td>
                    {reportData.brandHeaders.map(brand => (
                      <td key={brand} style={{ textAlign: 'center' }}>{totalsRow.brand_counts[brand] || 0}</td>
                    ))}
                  </tr>
                 )}
              </tfoot>
            </table>
          </div>
        ) : (
          <p style={{ textAlign: 'center', color: '#999', padding: '20px' }}>
              {isReportLoading ? 'Đang tải...' : 'Chưa có dữ liệu báo cáo.'}
          </p>
         )}
      </div>

      {/* --- CỘT 4: DANH SÁCH ĐƠN (ĐÃ SỬA LẠI LAYOUT LỌC & PHÂN TRANG) --- */}
      
      {/* KHỐI LỌC (Dùng christmas-card riêng) */}
      <div className="christmas-card" style={{ marginBottom: '1.5rem', padding: '1.5rem' }}>
        <h2 style={{ textAlign: 'center', color: '#D42426', marginBottom: '1rem' }}>Danh Sách Đơn Hàng</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem', alignItems: 'end' }}>
            <input type="text" placeholder="ID kênh..." value={filterIdKenh} onChange={e => setFilterIdKenh(e.target.value)} />
            <input type="text" placeholder="SĐT..." value={filterSdt} onChange={e => setFilterSdt(e.target.value)} />
            <select value={filterBrand} onChange={e => setFilterBrand(e.target.value)}><option value="">Tất cả Brand</option>{brands.map(b => <option key={b.id} value={b.id}>{b.ten_brand}</option>)}</select>
            <select value={filterSanPham} onChange={e => setFilterSanPham(e.target.value)} disabled={!filterBrand}><option value="">Tất cả Sản phẩm</option>{filterSanPhams.map(sp => <option key={sp.id} value={sp.id}>{sp.ten_sanpham}</option>)}</select>
            <select value={filterNhanSu} onChange={e => setFilterNhanSu(e.target.value)}><option value="">Tất cả nhân sự</option>{nhanSus.map(ns => <option key={ns.id} value={ns.id}>{ns.ten_nhansu}</option>)}</select>
            <select value={filterLoaiShip} onChange={e => setFilterLoaiShip(e.target.value)}>
              <option value="">Tất cả loại ship</option>
              <option value="Ship thường">Ship thường</option>
              <option value="Hỏa tốc">Hỏa tốc</option>
            </select>
            <select value={filterEditedStatus} onChange={e => setFilterEditedStatus(e.target.value)}>
                <option value="all">Tất cả</option>
                <option value="edited">Đơn đã sửa</option>
                <option value="unedited">Đơn chưa sửa</option>
            </select>
            <input type="date" value={filterNgay} onChange={e => setFilterNgay(e.target.value)} />
            <div style={{display: 'flex', gap: '0.5rem'}}>
              <button onClick={clearFilters} style={{ flex: 1, backgroundColor: '#95A5A6' }}>Xóa Lọc</button>
              <button onClick={handleBulkUpdateStatus} disabled={selectedOrders.size === 0} style={{ flex: 1, backgroundColor: selectedOrders.size > 0 ? '#D42426' : '#ccc' }}>
                  Đóng ({selectedOrders.size})
              </button>
            </div>
            <button onClick={handleExportAll} disabled={isLoading} style={{ backgroundColor: '#165B33' }}>
                {isLoading ? '...' : 'Xuất Excel'}
            </button>
        </div>
      </div>
      
      {/* PHÂN TRANG (Giống bên Air Links) */}
      <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
            <p style={{marginBottom: '10px', color: '#ffffff', fontWeight: 'bold', textShadow: '0 2px 4px rgba(0,0,0,0.5)'}}>
              Tổng cộng: {totalOrderCount} đơn hàng ({ORDERS_PER_PAGE} đơn/trang) - Trang {currentPage}/{totalPages}
            </p>
            <button onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))} disabled={currentPage === 1 || isLoading} style={{ margin: '0 5px', backgroundColor: '#f8f9fa', color: '#333', border: '1px solid #ccc' }}>
                Trang Trước
            </button>
            {pageNumbers.map(number => (
                <button
                    key={number}
                    onClick={() => setCurrentPage(number)}
                    disabled={isLoading}
                    style={{ margin: '0 5px', backgroundColor: currentPage === number ? '#D42426' : '#f8f9fa', color: currentPage === number ? 'white' : '#333', border: '1px solid #ccc' }}
                >
                    {number}
                </button>
            ))}
            <button onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))} disabled={currentPage === totalPages || isLoading} style={{ margin: '0 5px', backgroundColor: '#f8f9fa', color: '#333', border: '1px solid #ccc' }}>
                Trang Sau
            </button>
      </div>

      {/* BẢNG DỮ LIỆU (Trong Card, padding 0) */}
      <div className="christmas-card" style={{ padding: '0', overflow: 'hidden' }}>
        <div style={{ width: '100%', overflowX: 'auto' }}>
            <table style={{ width: '100%' }}>
            <thead>
              <tr>
               {headers.map((header) => (
                  <ResizableHeader key={header.key} width={columnWidths[header.key]} onResize={handleResize(header.key)}>
                     {header.label}
                  </ResizableHeader>
              ))}
            </tr>
            </thead>
            <tbody>
              {donHangs.map((donHang) => {
                const getCellStyle = (currentValue, originalValue) => (originalValue !== null && currentValue !== originalValue) ? { backgroundColor: '#D42426', color: 'white' } : {};
                const sanPhamDisplay = donHang.chitiettonguis.map(ct => (<div key={ct.sanphams?.id}>{ct.sanphams?.ten_sanpham} (SL: {ct.so_luong})</div>));
                return (
                <tr key={donHang.id}>
                  {editingDonHang?.id === donHang.id ? ( 
                  <>
                      <td style={{ width: `${columnWidths.select}px`, padding: '12px', border: '1px solid #ddd' }}></td>
                      <td style={{ width: `${columnWidths.stt}px`, padding: '12px', border: '1px solid #ddd' }}>{donHang.originalStt}</td>
                      <td style={{ width: `${columnWidths.ngayGui}px`, padding: '12px', border: '1px solid #ddd' }}>{new Date(donHang.ngay_gui).toLocaleString('vi-VN')}</td>
                      <td style={{ width: `${columnWidths.hoTenKOC}px`, padding: '12px', border: '1px solid #ddd' }}><input style={{width: '90%'}} value={editingDonHang.koc_ho_ten} onChange={e => setEditingDonHang({...editingDonHang, koc_ho_ten: e.target.value})} /></td>
                      <td style={{ width: `${columnWidths.cccd}px`, padding: '12px', border: '1px solid #ddd' }}><input style={{width: '90%'}} value={editingDonHang.koc_cccd} onChange={e => setEditingDonHang({...editingDonHang, koc_cccd: e.target.value})} /></td>
                      <td style={{ width: `${columnWidths.idKenh}px`, padding: '12px', border: '1px solid #ddd' }}><input style={{width: '90%'}} value={editingDonHang.koc_id_kenh} onChange={e => setEditingDonHang({...editingDonHang, koc_id_kenh: e.target.value})} /></td>
                      <td style={{ width: `${columnWidths.sdt}px`, padding: '12px', border: '1px solid #ddd' }}><input style={{width: '90%'}} value={editingDonHang.koc_sdt} onChange={e => setEditingDonHang({...editingDonHang, koc_sdt: e.target.value})} /></td>
                      <td style={{ width: `${columnWidths.diaChi}px`, padding: '12px', border: '1px solid #ddd' }}><input style={{width: '90%'}} value={editingDonHang.koc_dia_chi} onChange={e => setEditingDonHang({...editingDonHang, koc_dia_chi: e.target.value})} /></td>
                      <td style={{ width: `${columnWidths.brand}px`, padding: '12px', border: '1px solid #ddd' }}>{[...new Set(donHang.chitiettonguis.map(ct => ct.sanphams?.brands?.ten_brand))].map(b => <div key={b}>{b}</div>)}</td>
                      <td style={{ width: `${columnWidths.sanPham}px`, padding: '12px', border: '1px solid #ddd' }}>{sanPhamDisplay}</td>
                      <td style={{ width: `${columnWidths.nhanSu}px`, padding: '12px', border: '1px solid #ddd' }}>{donHang.nhansu?.ten_nhansu}</td>
                      <td style={{ width: `${columnWidths.loaiShip}px`, padding: '12px', border: '1px solid #ddd' }}><select style={{width: '100%'}} value={editingDonHang.loai_ship} onChange={e => setEditingDonHang({...editingDonHang, loai_ship: e.target.value})}><option>Ship thường</option><option>Hỏa tốc</option></select></td>
                      <td style={{ width: `${columnWidths.trangThai}px`, padding: '12px', border: '1px solid #ddd' }}><select style={{width: '100%'}} value={editingDonHang.trang_thai} onChange={(e) => setEditingDonHang({...editingDonHang, trang_thai: e.target.value})}><option>Chưa đóng đơn</option><option>Đã đóng đơn</option></select></td>
                      <td style={{ width: `${columnWidths.hanhDong}px`, padding: '12px', border: '1px solid #ddd' }}><button onClick={handleUpdate} style={{padding: '5px', backgroundColor: '#27AE60', color: 'white', border: 'none', borderRadius: '4px', margin: '2px'}}>Lưu</button><button onClick={handleCancelEdit} style={{padding: '5px', backgroundColor: '#95A5A6', color: 'white', border: 'none', borderRadius: '4px', margin: '2px'}}>Hủy</button></td>
                  </>
                  ) : ( 
                  <>
                      <td style={{ width: `${columnWidths.select}px`, padding: '12px', border: '1px solid #ddd' }}><input type="checkbox" checked={selectedOrders.has(donHang.id)} onChange={() => handleSelect(donHang.id)} /></td>
                      <td style={{ width: `${columnWidths.stt}px`, padding: '12px', border: '1px solid #ddd' }}>{donHang.originalStt}</td>
                      <td style={{ width: `${columnWidths.ngayGui}px`, padding: '12px', border: '1px solid #ddd' }}>{new Date(donHang.ngay_gui).toLocaleString('vi-VN')}</td>
                      <td style={{ width: `${columnWidths.hoTenKOC}px`, padding: '12px', border: '1px solid #ddd', ...getCellStyle(donHang.koc_ho_ten, donHang.original_koc_ho_ten) }}>{donHang.koc_ho_ten}</td>
                      <td style={{ width: `${columnWidths.cccd}px`, padding: '12px', border: '1px solid #ddd', ...getCellStyle(donHang.koc_cccd, donHang.original_koc_cccd) }}>{donHang.koc_cccd}</td>
                      <td style={{ width: `${columnWidths.idKenh}px`, padding: '12px', border: '1px solid #ddd', ...getCellStyle(donHang.koc_id_kenh, donHang.original_koc_id_kenh) }}>{donHang.koc_id_kenh}</td>
                      <td style={{ width: `${columnWidths.sdt}px`, padding: '12px', border: '1px solid #ddd', ...getCellStyle(donHang.koc_sdt, donHang.original_koc_sdt) }}>{donHang.koc_sdt}</td>
                      <td style={{ width: `${columnWidths.diaChi}px`, padding: '12px', border: '1px solid #ddd', ...getCellStyle(donHang.koc_dia_chi, donHang.original_koc_dia_chi) }}>{donHang.koc_dia_chi}</td>
                      <td style={{ width: `${columnWidths.brand}px`, padding: '12px', border: '1px solid #ddd' }}>{[...new Set(donHang.chitiettonguis.map(ct => ct.sanphams?.brands?.ten_brand))].map(tenBrand => ( <div key={tenBrand}>{tenBrand}</div> ))}</td>
                      <td style={{ width: `${columnWidths.sanPham}px`, padding: '12px', border: '1px solid #ddd' }}>{sanPhamDisplay}</td>
                      <td style={{ width: `${columnWidths.nhanSu}px`, padding: '12px', border: '1px solid #ddd' }}>{donHang.nhansu?.ten_nhansu}</td>
                      <td style={{ width: `${columnWidths.loaiShip}px`, padding: '12px', border: '1px solid #ddd', ...getCellStyle(donHang.loai_ship, donHang.original_loai_ship) }}>{donHang.loai_ship}</td>
                      <td style={{ width: `${columnWidths.trangThai}px`, padding: '12px', border: '1px solid #ddd', ...getCellStyle(donHang.trang_thai, donHang.original_trang_thai) }}>{donHang.trang_thai}</td>
                      <td style={{ width: `${columnWidths.hanhDong}px`, padding: '12px', border: '1px solid #ddd' }}><button onClick={() => handleEdit(donHang)} style={{padding: '5px', backgroundColor: '#F8B229', color: '#333', border: 'none', borderRadius: '4px'}}>Sửa</button></td>
                  </>
                  )}
                </tr>
                );
              })}
            </tbody>
            </table>
        </div>
      </div>
    </>
  );
};

export default OrderTab;