// src/components/AirLinksTab.jsx

import React, { useEffect } from 'react';
import { useAppData } from '../context/AppDataContext';
import ResizableHeader from './ResizableHeader';

const AirLinksTab = () => {
  // 1. LẤY TẤT CẢ STATE TỪ "NÃO"
  const {
    brands, nhanSus,
    airLinks, isLoadingAirLinks,
    filterAlKenh, setFilterAlKenh,
    filterAlBrand, setFilterAlBrand,
    filterAlNhanSu, setFilterAlNhanSu,
    filterAlDate, setFilterAlDate,
    handleDeleteAirLink,
    clearAirLinkFilters,
    
    // State phân trang danh sách link
    airLinksCurrentPage, setAirLinksCurrentPage,
    airLinksTotalCount,
    totalPagesAirLinks,

    // State báo cáo hiệu suất
    airReportMonth, setAirReportMonth,
    airReportYear, setAirReportYear,
    airReportData,
    isAirReportLoading,
    airSortConfig,
    handleGenerateAirLinksReport,
    requestAirSort,
    sortedAirReportRows,
    totalsRowAirReport,
    handleExportAirLinksReport // Nếu mày có hàm này trong context
  } = useAppData();

  // Tự động tải báo cáo khi thay đổi tháng/năm
  useEffect(() => {
    handleGenerateAirLinksReport();
  }, [airReportMonth, airReportYear]);

  // 2. LOGIC TÍNH TOÁN SỐ TRANG CHO DANH SÁCH LINK
  const AIRLINKS_PER_PAGE = 500;
  const pageNumbers = [];
  const maxButtons = 5;
  let startPage = Math.max(1, airLinksCurrentPage - Math.floor(maxButtons / 2));
  let endPage = Math.min(totalPagesAirLinks, startPage + maxButtons - 1);
  if (endPage - startPage + 1 < maxButtons) {
      startPage = Math.max(1, endPage - maxButtons + 1);
  }
  for (let i = startPage; i <= endPage; i++) {
    pageNumbers.push(i);
  }

  // 3. HEADERS CHO BẢNG BÁO CÁO
  // (Cái này để dùng ResizableHeader cho đẹp nếu muốn, hoặc để table thường cũng được)
  // Ở đây tao giữ table thường cho phần Báo cáo để code gọn, 
  // còn phần Danh sách Link ở dưới mới dùng ResizableHeader nếu cần.

  return (
    <div style={{ maxWidth: '1600px', margin: '0 auto', padding: '1rem' }}>
        
        {/* --- TIÊU ĐỀ CHÍNH --- */}
        <div style={{ position: 'relative', textAlign: 'center', marginBottom: '2rem' }}>
            <h1 style={{ fontSize: '2.5rem', fontWeight: '800', color: '#ffffff', textShadow: '2px 2px 4px rgba(0,0,0,0.5)' }}>
                <span style={{color: '#165B33'}}>🎄</span> QUẢN LÝ LINK AIR KOC (TỪ GOOGLE SHEET) <span style={{color: '#165B33'}}>🎄</span>
            </h1>
        </div>

        {/* ============================================= */}
        {/* === KHỐI BÁO CÁO (ĐÃ SỬA MÀU CHỮ H2) === */}
        {/* ============================================= */}
        <div className="christmas-card" style={{ marginBottom: '2rem', background: 'rgba(255,255,255,0.1)', backdropFilter: 'blur(5px)', border: '1px solid rgba(255,255,255,0.3)' }}>
          
          {/* --- SỬA Ở ĐÂY: ÉP MÀU TRẮNG CHO TIÊU ĐỀ --- */}
          <h2 style={{ 
              textAlign: 'center', 
              color: '#ffffff',                // Màu trắng
              background: 'none',              // Bỏ nền gradient cũ
              WebkitTextFillColor: '#ffffff',  // Quan trọng: Để chữ không bị trong suốt
              textShadow: '0 2px 5px rgba(0,0,0,0.5)', // Thêm bóng đen cho nổi
              marginBottom: '1.5rem'
          }}>
            BÁO CÁO HIỆU SUẤT AIR LINKS (THEO NGÀY BOOKING)
          </h2>

          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', justifyContent: 'center', marginBottom: '1.5rem' }}>
              <select value={airReportMonth} onChange={e => setAirReportMonth(e.target.value)} style={{ width: 'auto' }}>
                {Array.from({ length: 12 }, (_, i) => <option key={i+1} value={i+1}>Tháng {i+1}</option>)}
              </select>
              <input type="number" value={airReportYear} onChange={e => setAirReportYear(e.target.value)} style={{ width: '100px' }} />
              <button onClick={handleGenerateAirLinksReport} disabled={isAirReportLoading} style={{ backgroundColor: '#D42426' }}>
                  {isAirReportLoading ? 'Đang tính toán...' : '📊 Xem Báo Cáo'}
              </button>
          </div>

          {airReportData.reportRows.length > 0 ? (
            <div style={{width: '100%', overflowX: 'auto'}}>
              {/* Bảng này tao để nền trắng cho dễ đọc số liệu */}
              <table style={{ width: '100%', backgroundColor: '#ffffff' }}>
                <thead>
                  <tr>
                    <th style={{ cursor: 'pointer' }} onClick={() => requestAirSort('ten_nhansu')}>
                      Nhân Sự {airSortConfig.key === 'ten_nhansu' ? (airSortConfig.direction === 'asc' ? '▲' : '▼') : ''}
                    </th>
                    <th style={{ cursor: 'pointer', textAlign: 'center' }} onClick={() => requestAirSort('sl_video_air')}>
                      SL Video Air {airSortConfig.key === 'sl_video_air' ? (airSortConfig.direction === 'asc' ? '▲' : '▼') : ''}
                    </th>
                    <th style={{ cursor: 'pointer', textAlign: 'center' }} onClick={() => requestAirSort('chi_phi_cast')}>
                      Chi Phí Cast {airSortConfig.key === 'chi_phi_cast' ? (airSortConfig.direction === 'asc' ? '▲' : '▼') : ''}
                    </th>
                    {airReportData.brandHeaders.map(brand => (
                        <th key={brand} style={{ cursor: 'pointer', textAlign: 'center' }} onClick={() => requestAirSort(brand)}>
                          {brand} {airSortConfig.key === brand ? (airSortConfig.direction === 'asc' ? '▲' : '▼') : ''}
                        </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedAirReportRows.map((item) => (
                    <tr key={item.nhansu_id}>
                        <td style={{ fontWeight: 'bold', color: '#165B33' }}>{item.ten_nhansu}</td>
                        <td style={{ textAlign: 'center' }}>{item.sl_video_air}</td>
                        <td style={{ textAlign: 'center' }}>{Math.round(item.chi_phi_cast).toLocaleString('vi-VN')} đ</td>
                        {airReportData.brandHeaders.map(brand => (
                            <td key={brand} style={{ textAlign: 'center' }}>
                              {item.brand_counts_air[brand] || 0}
                            </td>
                        ))}
                      </tr>
                  ))}
                </tbody>
                <tfoot>
                {totalsRowAirReport && (
                    <tr style={{backgroundColor: '#FDE2E2', fontWeight: 'bold', color: '#D42426'}}>
                      <td>TỔNG CỘNG</td>
                      <td style={{ textAlign: 'center' }}>{totalsRowAirReport.sl_video_air}</td>
                      <td style={{ textAlign: 'center' }}>{Math.round(totalsRowAirReport.chi_phi_cast).toLocaleString('vi-VN')} đ</td>
                      {airReportData.brandHeaders.map(brand => (
                        <td key={brand} style={{ textAlign: 'center' }}>
                          {totalsRowAirReport.brand_counts_air[brand] || 0}
                        </td>
                      ))}
                    </tr>
                  )}
                </tfoot>
              </table>
            </div>
          ) : (
            <p style={{ textAlign: 'center', color: '#ffffff', padding: '20px', fontWeight: 'bold', textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>
                {isAirReportLoading ? 'Đang tải...' : 'Chưa có dữ liệu báo cáo cho tháng này.'}
            </p>
          )}
        </div>
        
        {/* ============================================= */}
        {/* === DANH SÁCH LINK (KHỐI DƯỚI) === */}
        {/* ============================================= */}

        {/* KHỐI LỌC */}
        <div className="christmas-card" style={{ padding: '1.5rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', alignItems: 'end' }}>
            <input type="text" placeholder="Lọc theo ID Kênh..." value={filterAlKenh} onChange={e => setFilterAlKenh(e.target.value)} />
            <select value={filterAlBrand} onChange={e => setFilterAlBrand(e.target.value)}>
              <option value="">Tất cả Brand</option>
              {brands.map(b => <option key={b.id} value={b.id}>{b.ten_brand}</option>)}
            </select>
            <select value={filterAlNhanSu} onChange={e => setFilterAlNhanSu(e.target.value)}>
              <option value="">Tất cả nhân sự</option>
              {nhanSus.map(ns => <option key={ns.id} value={ns.id}>{ns.ten_nhansu}</option>)}
            </select>
            <input type="date" value={filterAlDate} onChange={e => setFilterAlDate(e.target.value)} />
            <button onClick={clearAirLinkFilters} style={{ backgroundColor: '#95A5A6' }}>Xóa Lọc</button>
          </div>
        </div>
        
        {/* KHỐI PHÂN TRANG */}
        <div style={{ textAlign: 'center', marginTop: '1.5rem', marginBottom: '1.5rem' }}>
            <p style={{marginBottom: '10px', color: '#ffffff', fontWeight: 'bold', textShadow: '0 2px 4px rgba(0,0,0,0.5)'}}>
              Tổng cộng: {airLinksTotalCount} links ({AIRLINKS_PER_PAGE} links/trang) - Đang ở Trang {airLinksCurrentPage}/{totalPagesAirLinks}
            </p>
            <button
                onClick={() => setAirLinksCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={airLinksCurrentPage === 1 || isLoadingAirLinks}
                style={{ margin: '0 5px', backgroundColor: '#f8f9fa', color: '#333', border: '1px solid #ccc' }}
            >
                Trang Trước
            </button>
            {pageNumbers.map(number => (
                <button
                    key={number}
                    onClick={() => setAirLinksCurrentPage(number)}
                    disabled={isLoadingAirLinks}
                    style={{
                        margin: '0 5px',
                        backgroundColor: airLinksCurrentPage === number ? '#D42426' : '#f8f9fa',
                        color: airLinksCurrentPage === number ? 'white' : '#333',
                        border: '1px solid #ccc'
                    }}
                >
                    {number}
                </button>
            ))}
            <button
                onClick={() => setAirLinksCurrentPage(prev => Math.min(totalPagesAirLinks, prev + 1))}
                disabled={airLinksCurrentPage === totalPagesAirLinks || isLoadingAirLinks}
                style={{ margin: '0 5px', backgroundColor: '#f8f9fa', color: '#333', border: '1px solid #ccc' }}
            >
                Trang Sau
            </button>
        </div>
        
        {/* BẢNG DỮ LIỆU */}
        <div className="christmas-card" style={{ padding: '0', overflow: 'hidden' }}>
          {isLoadingAirLinks ? (
            <p style={{ textAlign: 'center', padding: '2rem', color: '#D42426', fontWeight: 'bold' }}>Đang tải dữ liệu links...</p>
          ) : (
            <div style={{ width: '100%', overflow: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ padding: '12px', border: '1px solid #ddd', textAlign: 'left' }}>STT</th>
                    <th style={{ padding: '12px', border: '1px solid #ddd', textAlign: 'left' }}>Link Air</th>
                    <th style={{ padding: '12px', border: '1px solid #ddd', textAlign: 'left' }}>ID Kênh</th>
                    <th style={{ padding: '12px', border: '1px solid #ddd', textAlign: 'left' }}>Ngày Air</th>
                    <th style={{ padding: '12px', border: '1px solid #ddd', textAlign: 'left' }}>Sản Phẩm</th>
                    <th style={{ padding: '12px', border: '1px solid #ddd', textAlign: 'left' }}>Brand</th>
                    <th style={{ padding: '12px', border: '1px solid #ddd', textAlign: 'left' }}>CAST</th>
                    <th style={{ padding: '12px', border: '1px solid #ddd', textAlign: 'left' }}>CMS BRAND</th>
                    <th style={{ padding: '12px', border: '1px solid #ddd', textAlign: 'left' }}>Nhân Sự Booking</th>
                    <th style={{ padding: '12px', border: '1px solid #ddd', textAlign: 'left' }}>Ngày Booking</th>
                    <th style={{ padding: '12px', border: '1px solid #ddd', textAlign: 'left' }}>Hành Động</th>
                  </tr>
                </thead>
                <tbody>
                  {airLinks.length === 0 ? (
                      <tr><td colSpan="11" style={{ padding: '20px', textAlign: 'center', color: '#C0392B' }}>Không tìm thấy dữ liệu nào.</td></tr>
                  ) : (
                      airLinks.map((link, index) => (
                        <tr key={link.id}>
                          {/* STT đếm ngược */}
                          <td style={{ padding: '12px', border: '1px solid #ddd' }}>
                            {airLinksTotalCount - ((airLinksCurrentPage - 1) * AIRLINKS_PER_PAGE + index)}
                          </td>
                          <td style={{ padding: '12px', border: '1px solid #ddd', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            <a href={link.link_air_koc} target="_blank" rel="noopener noreferrer" style={{color: '#D42426', textDecoration: 'none'}}>{link.link_air_koc}</a>
                          </td>
                          <td style={{ padding: '12px', border: '1px solid #ddd' }}>{link.id_kenh}</td>
                          <td style={{ padding: '12px', border: '1px solid #ddd' }}>{link.ngay_air ? new Date(link.ngay_air).toLocaleDateString('vi-VN') : 'N/A'}</td>
                          <td style={{ padding: '12px', border: '1px solid #ddd' }}>{link.san_pham}</td>
                          <td style={{ padding: '12px', border: '1px solid #ddd' }}>{link.brands?.ten_brand}</td>
                          <td style={{ padding: '12px', border: '1px solid #ddd' }}>{link.cast}</td>
                          <td style={{ padding: '12px', border: '1px solid #ddd' }}>{link.cms_brand}</td>
                          <td style={{ padding: '12px', border: '1px solid #ddd' }}>{link.nhansu?.ten_nhansu}</td>
                          <td style={{ padding: '12px', border: '1px solid #ddd' }}>{link.ngay_booking ? new Date(link.ngay_booking).toLocaleDateString('vi-VN') : 'N/A'}</td>
                          <td style={{ padding: '12px', border: '1px solid #ddd' }}>
                            <button 
                              onClick={() => handleDeleteAirLink(link.id, link.link_air_koc)}
                              style={{padding: '5px 10px', backgroundColor: '#D42426', color: 'white', border: 'none', borderRadius: '4px', fontSize: '12px'}}
                            >
                              Xóa
                            </button>
                          </td>
                        </tr>
                      ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
    </div>
  );
};

export default AirLinksTab;