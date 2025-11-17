// src/components/AirLinksTab.jsx

import React, { useEffect } from 'react';
import { useAppData } from '../context/AppDataContext';

const AirLinksTab = () => {
  // 1. LẤY TẤT CẢ STATE MỚI
  const {
    brands, nhanSus,
    airLinks, isLoadingAirLinks,
    filterAlKenh, setFilterAlKenh,
    filterAlBrand, setFilterAlBrand,
    filterAlNhanSu, setFilterAlNhanSu,
    filterAlDate, setFilterAlDate,
    handleDeleteAirLink,
    clearAirLinkFilters,
    
    // State phân trang 
    airLinksCurrentPage, setAirLinksCurrentPage,
    airLinksTotalCount,
    totalPagesAirLinks,

    // State báo cáo MỚI
    airReportMonth, setAirReportMonth,
    airReportYear, setAirReportYear,
    airReportData,
    isAirReportLoading,
    airSortConfig,
    handleGenerateAirLinksReport,
    requestAirSort,
    sortedAirReportRows,
    totalsRowAirReport
  } = useAppData();

  // Tự động chạy khi tháng/năm thay đổi
  useEffect(() => {
    handleGenerateAirLinksReport();
  }, [airReportMonth, airReportYear]);


  // 2. LOGIC TÍNH TOÁN SỐ TRANG
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

  return (
    <div style={{ maxWidth: '1600px', margin: '0 auto', padding: '1rem' }}>
        <h1 style={{ textAlign: 'center', color: '#C0392B', marginBottom: '2rem' }}>
            <span style={{color: '#27AE60'}}>🎄🎅</span> Quản lý Link Air KOC (Từ Google Sheet) <span style={{color: '#C0392B'}}>🎅🎄</span>
        </h1>

        {/* ============================================= */}
        {/* === KHỐI BÁO CÁO MỚI (COPY TỪ ORDER TAB) === */}
        {/* ============================================= */}
        <div style={{ padding: '2rem', border: '1px solid #ddd', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', marginBottom: '2rem' }}>
          <h2 style={{ textAlign: 'center', color: '#C0392B', marginBottom: '1.5rem', borderBottom: '2px solid #C0392B', paddingBottom: '10px' }}>
            Báo Cáo Hiệu Suất Air Links (Theo Ngày Booking)
          </h2>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', justifyContent: 'center', marginBottom: '1.5rem' }}>
              <select value={airReportMonth} onChange={e => setAirReportMonth(e.target.value)} style={{ padding: '7px', border: '1px solid #27AE60', borderRadius: '4px' }}>
                {Array.from({ length: 12 }, (_, i) => <option key={i+1} value={i+1}>Tháng {i+1}</option>)}
              </select>
              <input type="number" value={airReportYear} onChange={e => setAirReportYear(e.target.value)} style={{ padding: '7px', width: '80px', border: '1px solid #27AE60', borderRadius: '4px' }} />
              <button onClick={handleGenerateAirLinksReport} disabled={isAirReportLoading} style={{ padding: '8px 16px', backgroundColor: '#C0392B', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
                  {isAirReportLoading ? 'Đang xử lý...' : 'Tạo Báo Cáo'}
              </button>
          </div>
          {airReportData.reportRows.length > 0 ? (
            <div style={{width: '100%', overflowX: 'auto'}}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead style={{ backgroundColor: '#27AE60', color: 'white' }}>
                  <tr>
                    <th style={{ padding: '12px', border: '1px solid white', textAlign: 'left', cursor: 'pointer' }} onClick={() => requestAirSort('ten_nhansu')}>
                      Nhân Sự {airSortConfig.key === 'ten_nhansu' ? (airSortConfig.direction === 'asc' ? '▲' : '▼') : ''}
                    </th>
                    <th style={{ padding: '12px', border: '1px solid white', textAlign: 'center', cursor: 'pointer' }} onClick={() => requestAirSort('sl_video_air')}>
                      SL Video Air {airSortConfig.key === 'sl_video_air' ? (airSortConfig.direction === 'asc' ? '▲' : '▼') : ''}
                    </th>
                    <th style={{ padding: '12px', border: '1px solid white', textAlign: 'center', cursor: 'pointer' }} onClick={() => requestAirSort('chi_phi_cast')}>
                      Chi Phí Cast {airSortConfig.key === 'chi_phi_cast' ? (airSortConfig.direction === 'asc' ? '▲' : '▼') : ''}
                    </th>
                    {airReportData.brandHeaders.map(brand => (
                        <th key={brand} style={{ padding: '12px', border: '1px solid white', textAlign: 'center', cursor: 'pointer' }} onClick={() => requestAirSort(brand)}>
                          {brand} {airSortConfig.key === brand ? (airSortConfig.direction === 'asc' ? '▲' : '▼') : ''}
                        </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedAirReportRows.map((item) => (
                    <tr key={item.nhansu_id}>
                        <td style={{ padding: '12px', border: '1px solid #ddd', fontWeight: 'bold', color: '#C0392B' }}>{item.ten_nhansu}</td>
                        <td style={{ padding: '12px', border: '1px solid #ddd', textAlign: 'center' }}>{item.sl_video_air}</td>
                        <td style={{ padding: '12px', border: '1px solid #ddd', textAlign: 'center' }}>{Math.round(item.chi_phi_cast).toLocaleString('vi-VN')} đ</td>
                        {airReportData.brandHeaders.map(brand => (
                            <td key={brand} style={{ padding: '12px', border: '1px solid #ddd', textAlign: 'center' }}>
                              {item.brand_counts_air[brand] || 0}
                            </td>
                        ))}
                      </tr>
                  ))}
                </tbody>
                <tfoot>
                {totalsRowAirReport && (
                    <tr style={{backgroundColor: '#f8d7da', fontWeight: 'bold', color: '#C0392B'}}>
                      <td style={{ padding: '12px', border: '1px solid #ddd' }}>TỔNG CỘNG</td>
                      <td style={{ padding: '12px', border: '1px solid #ddd', textAlign: 'center' }}>{totalsRowAirReport.sl_video_air}</td>
                      <td style={{ padding: '12px', border: '1px solid #ddd', textAlign: 'center' }}>{Math.round(totalsRowAirReport.chi_phi_cast).toLocaleString('vi-VN')} đ</td>
                      {airReportData.brandHeaders.map(brand => (
                        <td key={brand} style={{ padding: '12px', border: '1px solid #ddd', textAlign: 'center' }}>
                          {totalsRowAirReport.brand_counts_air[brand] || 0}
                        </td>
                      ))}
                    </tr>
                  )}
                </tfoot>
              </table>
            </div>
          ) : (
            <p style={{ textAlign: 'center', color: '#C0392B' }}>
                {isAirReportLoading ? 'Đang tải dữ liệu...' : 'Chưa có dữ liệu cho tháng đã chọn.'}
            </p>
          )}
        </div>
        
        {/* ============================================= */}
        {/* === DANH SÁCH LINK (PHẦN CŨ) === */}
        {/* ============================================= */}

        {/* KHỐI LỌC */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', alignItems: 'end', marginBottom: '1rem', padding: '1rem', backgroundColor: '#f9f9f9', borderRadius: '8px', border: '1px solid #C0392B' }}>
          <input type="text" placeholder="Lọc theo ID Kênh..." value={filterAlKenh} onChange={e => setFilterAlKenh(e.target.value)} style={{ padding: '8px', boxSizing: 'border-box', border: '1px solid #27AE60', borderRadius: '4px' }} />
          <select value={filterAlBrand} onChange={e => setFilterAlBrand(e.target.value)} style={{ padding: '8px', boxSizing: 'border-box', border: '1px solid #27AE60', borderRadius: '4px' }}>
            <option value="">Tất cả Brand</option>
            {brands.map(b => <option key={b.id} value={b.id}>{b.ten_brand}</option>)}
          </select>
          <select value={filterAlNhanSu} onChange={e => setFilterAlNhanSu(e.target.value)} style={{ padding: '8px', boxSizing: 'border-box', border: '1px solid #27AE60', borderRadius: '4px' }}>
            <option value="">Tất cả nhân sự</option>
            {nhanSus.map(ns => <option key={ns.id} value={ns.id}>{ns.ten_nhansu}</option>)}
          </select>
          <input type="date" value={filterAlDate} onChange={e => setFilterAlDate(e.target.value)} style={{ padding: '7px', boxSizing: 'border-box', border: '1px solid #27AE60', borderRadius: '4px' }} />
          <button onClick={clearAirLinkFilters} style={{ padding: '8px 16px', backgroundColor: '#95A5A6', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>Xóa Lọc</button>
        </div>
        
        {/* KHỐI PHÂN TRANG */}
        <div style={{ textAlign: 'center', marginTop: '1.5rem', marginBottom: '1.5rem' }}>
            <p style={{marginBottom: '10px', color: '#C0392B'}}>
              Tổng cộng: **{airLinksTotalCount}** links ({AIRLINKS_PER_PAGE} links/trang) - Đang ở Trang {airLinksCurrentPage}/{totalPagesAirLinks}
            </p>
            <button
                onClick={() => setAirLinksCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={airLinksCurrentPage === 1 || isLoadingAirLinks}
                style={{ padding: '8px 12px', margin: '0 5px', border: '1px solid #C0392B', cursor: 'pointer', backgroundColor: '#f8f9fa', color: '#C0392B', borderRadius: '4px' }}
            >
                Trang Trước
            </button>
            {pageNumbers.map(number => (
                <button
                    key={number}
                    onClick={() => setAirLinksCurrentPage(number)}
                    disabled={isLoadingAirLinks}
                    style={{
                        padding: '8px 12px', margin: '0 5px',
                        backgroundColor: airLinksCurrentPage === number ? '#C0392B' : '#f8f9fa',
                        color: airLinksCurrentPage === number ? 'white' : '#C0392B',
                        border: '1px solid #C0392B', cursor: 'pointer', borderRadius: '4px'
                    }}
                >
                    {number}
                </button>
            ))}
            <button
                onClick={() => setAirLinksCurrentPage(prev => Math.min(totalPagesAirLinks, prev + 1))}
                disabled={airLinksCurrentPage === totalPagesAirLinks || isLoadingAirLinks}
                style={{ padding: '8px 12px', margin: '0 5px', border: '1px solid #C0392B', cursor: 'pointer', backgroundColor: '#f8f9fa', color: '#C0392B', borderRadius: '4px' }}
            >
                Trang Sau
            </button>
        </div>
        
        {/* BẢNG DỮ LIỆU */}
        {isLoadingAirLinks ? (
          <p style={{ textAlign: 'center', fontSize: '1.2rem', color: '#C0392B' }}>Đang tải dữ liệu links...</p>
        ) : (
          <div style={{ width: '100%', overflow: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
              <thead style={{ backgroundColor: '#27AE60', color: 'white' }}>
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
                        <td style={{ padding: '12px', border: '1px solid #ddd' }}>
                          {airLinksTotalCount - ((airLinksCurrentPage - 1) * AIRLINKS_PER_PAGE + index)}
                        </td>
                        <td style={{ padding: '12px', border: '1px solid #ddd', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          <a href={link.link_air_koc} target="_blank" rel="noopener noreferrer">{link.link_air_koc}</a>
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
                            style={{padding: '5px', backgroundColor: '#C0392B', color: 'white', border: 'none', borderRadius: '4px'}}
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
  );
};

export default AirLinksTab;