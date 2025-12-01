// src/components/AirLinksTab.jsx

import React, { useState, useEffect } from 'react';
import { useAppData } from '../context/AppDataContext';
import { supabase } from '../supabaseClient';
import ResizableHeader from './ResizableHeader';

// --- DANH SÁCH SẢN PHẨM CỐ ĐỊNH ---
const PRODUCT_OPTIONS = [
  "Bodymist", "Bodymist nhũ", "Nước hoa sáp", "Nước hoa Bodymiss",
  "Toner hoa cúc (new)", "Toner hoa cúc (cũ)", "Tẩy trang hoa cúc", "Sữa rửa mặt hoa cúc",
  "gel nha đam", "Mask tràm trà", "Dầu dừa", "Dầu olive",
  "Serum dưỡng mi", "Scrub AHA", "Serum bưởi", "Scrub sữa gạo hạnh nhân",
  "Muối hồng", "Body oil", "Nước hoa sunkiss", "Bột moaw",
  "Bột Milaganics", "Sachi"
];

const AirLinksTab = () => {
  const {
    brands, nhanSus,
    airLinks, isLoadingAirLinks, loadAirLinks,
    filterAlKenh, setFilterAlKenh,
    filterAlBrand, setFilterAlBrand,
    filterAlNhanSu, setFilterAlNhanSu,
    filterAlDate, setFilterAlDate,
    handleDeleteAirLink,
    clearAirLinkFilters,
    airLinksCurrentPage, setAirLinksCurrentPage,
    airLinksTotalCount, totalPagesAirLinks,
    airReportMonth, setAirReportMonth, airReportYear, setAirReportYear,
    airReportData, isAirReportLoading, handleGenerateAirLinksReport, requestAirSort,
    sortedAirReportRows, totalsRowAirReport, airSortConfig
  } = useAppData();

  const [newLink, setNewLink] = useState({
    link_air_koc: '', id_kenh: '', id_video: '', brand_id: '', san_pham: '', nhansu_id: '',
    ngay_air: '', // Để trống, sau này tool tự điền
    ngay_booking: new Date().toISOString().split('T')[0], 
    cast: '', cms_brand: '', view_count: 0
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // --- LOGIC TÁCH ID VÀ AUTO-FILL ---
  const handleLinkChange = async (e) => {
    const url = e.target.value;
    let extractedKenh = '';
    let extractedVideo = '';
    try {
      if (url.includes('tiktok.com')) {
        const urlObj = new URL(url);
        const pathParts = urlObj.pathname.split('/').filter(p => p);
        const kenhPart = pathParts.find(p => p.startsWith('@'));
        if (kenhPart) extractedKenh = kenhPart.replace('@', '');
        const videoIndex = pathParts.indexOf('video');
        if (videoIndex !== -1 && pathParts[videoIndex + 1]) {
          extractedVideo = pathParts[videoIndex + 1];
        }
      }
    } catch (error) { }

    setNewLink(prev => ({
      ...prev, link_air_koc: url, id_kenh: extractedKenh, id_video: extractedVideo
    }));

    // AUTO-FILL TỪ DATABASE
    if (extractedKenh) {
        try {
            const { data, error } = await supabase
                .from('air_links')
                .select('brand_id, nhansu_id, "cast", cms_brand')
                .eq('id_kenh', extractedKenh)
                .order('created_at', { ascending: false })
                .limit(1)
                .single();

            if (data && !error) {
                setNewLink(prev => ({
                    ...prev,
                    brand_id: data.brand_id || '',
                    nhansu_id: data.nhansu_id || '',
                    cast: data.cast || '',
                    cms_brand: data.cms_brand || ''
                }));
            }
        } catch (err) { console.error("Lỗi auto-fill:", err); }
    }
  };

  const handleAddLink = async (e) => {
    e.preventDefault();
    if (!newLink.link_air_koc || !newLink.brand_id || !newLink.nhansu_id || !newLink.san_pham) {
      alert("Vui lòng điền Link, Brand, Sản phẩm và Nhân sự!");
      return;
    }
    setIsSubmitting(true);
    try {
      const dataToInsert = {
        ...newLink,
        ngay_air: newLink.ngay_air ? newLink.ngay_air : null 
      };
      const { error } = await supabase.from('air_links').insert([dataToInsert]);
      if (error) throw error;
      alert("Đã thêm link thành công! 🎉");
      setNewLink({
        link_air_koc: '', id_kenh: '', id_video: '', brand_id: '', san_pham: '', nhansu_id: '',
        ngay_air: '', ngay_booking: new Date().toISOString().split('T')[0], 
        cast: '', cms_brand: '', view_count: 0
      });
      loadAirLinks();
      handleGenerateAirLinksReport(); 
    } catch (error) {
      alert("Lỗi khi lưu: " + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const AIRLINKS_PER_PAGE = 500;
  const pageNumbers = [];
  const maxButtons = 5;
  let startPage = Math.max(1, airLinksCurrentPage - Math.floor(maxButtons / 2));
  let endPage = Math.min(totalPagesAirLinks, startPage + maxButtons - 1);
  if (endPage - startPage + 1 < maxButtons) { startPage = Math.max(1, endPage - maxButtons + 1); }
  for (let i = startPage; i <= endPage; i++) { pageNumbers.push(i); }

  useEffect(() => { handleGenerateAirLinksReport(); }, [airReportMonth, airReportYear]);

  return (
    <div style={{ maxWidth: '1600px', margin: '0 auto', padding: '1rem' }}>
        <div style={{ position: 'relative', textAlign: 'center', marginBottom: '2rem' }}>
            <h1 style={{ fontSize: '2.5rem', fontWeight: '800', color: '#ffffff', textShadow: '2px 2px 4px rgba(0,0,0,0.5)' }}>
                <span style={{color: '#165B33'}}>🎄</span> QUẢN LÝ LINK AIR KOC <span style={{color: '#165B33'}}>🎄</span>
            </h1>
        </div>

        {/* FORM NHẬP LIỆU */}
        <div className="christmas-card">
          <h2 style={{ textAlign: 'center', color: '#D42426', marginBottom: '1.5rem' }}>Thêm Link Air Mới</h2>
          <form onSubmit={handleAddLink}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label>Link Video TikTok (*)</label>
                <input type="text" placeholder="Dán link vào đây..." value={newLink.link_air_koc} onChange={handleLinkChange} required />
                <div style={{ display: 'flex', gap: '1rem' }}>
                   <div style={{flex: 1}}>
                      <label style={{fontSize: '0.8rem', color: '#666'}}>ID Kênh (Tự động)</label>
                      <input type="text" value={newLink.id_kenh} readOnly style={{backgroundColor: '#eee', color: '#555'}} />
                   </div>
                   <div style={{flex: 1}}>
                      <label style={{fontSize: '0.8rem', color: '#666'}}>ID Video (Tự động)</label>
                      <input type="text" value={newLink.id_video} readOnly style={{backgroundColor: '#eee', color: '#555'}} />
                   </div>
                </div>
                <label>Sản Phẩm (*)</label>
                <select value={newLink.san_pham} onChange={e => setNewLink({...newLink, san_pham: e.target.value})} required>
                    <option value="">-- Chọn Sản Phẩm --</option>
                    {PRODUCT_OPTIONS.map(prod => (<option key={prod} value={prod}>{prod}</option>))}
                </select>
              </div>

              <div>
                <label>Brand (*)</label>
                <select value={newLink.brand_id} onChange={e => setNewLink({...newLink, brand_id: e.target.value})} required>
                   <option value="">-- Chọn Brand --</option>
                   {brands.map(b => <option key={b.id} value={b.id}>{b.ten_brand}</option>)}
                </select>
                <label>Nhân sự Booking (*)</label>
                <select value={newLink.nhansu_id} onChange={e => setNewLink({...newLink, nhansu_id: e.target.value})} required>
                   <option value="">-- Chọn Nhân sự --</option>
                   {nhanSus.map(ns => <option key={ns.id} value={ns.id}>{ns.ten_nhansu}</option>)}
                </select>
                
                <div style={{ display: 'flex', gap: '1rem' }}>
                    <div style={{flex: 1}}>
                        <label>CAST (VND)</label>
                        <input type="text" value={newLink.cast} onChange={e => setNewLink({...newLink, cast: e.target.value})} placeholder="500.000" />
                    </div>
                    <div style={{flex: 1}}>
                        <label>CMS (%)</label>
                        <input type="text" value={newLink.cms_brand} onChange={e => setNewLink({...newLink, cms_brand: e.target.value})} placeholder="10%" />
                    </div>
                </div>
                {/* Đã xóa Ngày Air */}
              </div>
            </div>
            <div style={{ textAlign: 'center', marginTop: '1rem' }}>
               <button type="submit" disabled={isSubmitting} style={{ backgroundColor: '#D42426', padding: '12px 40px', fontSize: '1.1rem' }}>
                 {isSubmitting ? 'Đang lưu...' : '➕ THÊM LINK MỚI'}
               </button>
            </div>
          </form>
        </div>

        {/* BÁO CÁO HIỆU SUẤT */}
        <div className="christmas-card" style={{ marginBottom: '2rem', background: 'rgba(255,255,255,0.1)', backdropFilter: 'blur(5px)', border: '1px solid rgba(255,255,255,0.3)' }}>
          <h2 style={{ textAlign: 'center', color: '#ffffff', background: 'none', WebkitTextFillColor: '#ffffff', textShadow: '0 2px 5px rgba(0,0,0,0.5)', marginBottom: '1.5rem' }}>BÁO CÁO HIỆU SUẤT AIR LINKS</h2>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', justifyContent: 'center', marginBottom: '1.5rem' }}>
              <select value={airReportMonth} onChange={e => setAirReportMonth(e.target.value)} style={{ width: 'auto' }}>
                {Array.from({ length: 12 }, (_, i) => <option key={i+1} value={i+1}>Tháng {i+1}</option>)}
              </select>
              <input type="number" value={airReportYear} onChange={e => setAirReportYear(e.target.value)} style={{ width: '100px' }} />
              <button onClick={handleGenerateAirLinksReport} disabled={isAirReportLoading} style={{ backgroundColor: '#D42426' }}>{isAirReportLoading ? '...' : 'Xem Báo Cáo'}</button>
          </div>
          {airReportData.reportRows.length > 0 ? (
            <div style={{width: '100%', overflowX: 'auto'}}>
              <table style={{ width: '100%', backgroundColor: '#ffffff' }}>
                <thead>
                  <tr>
                    <th onClick={() => requestAirSort('ten_nhansu')} style={{cursor:'pointer'}}>Nhân Sự</th>
                    <th onClick={() => requestAirSort('sl_video_air')} style={{cursor:'pointer', textAlign: 'center'}}>SL Video</th>
                    <th onClick={() => requestAirSort('chi_phi_cast')} style={{cursor:'pointer', textAlign: 'center'}}>Chi Phí Cast</th>
                    {airReportData.brandHeaders.map(brand => (<th key={brand} style={{textAlign: 'center'}}>{brand}</th>))}
                  </tr>
                </thead>
                <tbody>
                  {sortedAirReportRows.map((item) => (
                    <tr key={item.nhansu_id}>
                        <td style={{ fontWeight: 'bold', color: '#165B33' }}>{item.ten_nhansu}</td>
                        <td style={{ textAlign: 'center' }}>{item.sl_video_air}</td>
                        <td style={{ textAlign: 'center' }}>{Math.round(item.chi_phi_cast).toLocaleString('vi-VN')} đ</td>
                        {airReportData.brandHeaders.map(brand => (<td key={brand} style={{ textAlign: 'center' }}>{item.brand_counts_air[brand] || 0}</td>))}
                      </tr>
                  ))}
                </tbody>
                <tfoot>
                {totalsRowAirReport && (
                    <tr style={{backgroundColor: '#FDE2E2', fontWeight: 'bold', color: '#D42426'}}>
                      <td>TỔNG CỘNG</td>
                      <td style={{ textAlign: 'center' }}>{totalsRowAirReport.sl_video_air}</td>
                      <td style={{ textAlign: 'center' }}>{Math.round(totalsRowAirReport.chi_phi_cast).toLocaleString('vi-VN')} đ</td>
                      {airReportData.brandHeaders.map(brand => (<td key={brand} style={{ textAlign: 'center' }}>{totalsRowAirReport.brand_counts_air[brand] || 0}</td>))}
                    </tr>
                  )}
                </tfoot>
              </table>
            </div>
          ) : <p style={{textAlign: 'center', color: '#fff'}}>Chưa có dữ liệu báo cáo.</p>}
        </div>
        
        {/* DANH SÁCH LINK */}
        <div className="christmas-card">
          <h2 style={{ textAlign: 'center', color: '#D42426', marginBottom: '1rem' }}>DANH SÁCH LINK ĐÃ NHẬP</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
             <input type="text" placeholder="Lọc ID Kênh..." value={filterAlKenh} onChange={e => setFilterAlKenh(e.target.value)} />
             <select value={filterAlBrand} onChange={e => setFilterAlBrand(e.target.value)}><option value="">Tất cả Brand</option>{brands.map(b => <option key={b.id} value={b.id}>{b.ten_brand}</option>)}</select>
             <select value={filterAlNhanSu} onChange={e => setFilterAlNhanSu(e.target.value)}><option value="">Tất cả Nhân sự</option>{nhanSus.map(ns => <option key={ns.id} value={ns.id}>{ns.ten_nhansu}</option>)}</select>
             <button onClick={clearAirLinkFilters} style={{backgroundColor: '#999'}}>Xóa Lọc</button>
          </div>

          <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
             <button onClick={() => setAirLinksCurrentPage(prev => Math.max(1, prev - 1))} disabled={airLinksCurrentPage===1}>Trước</button>
             <span style={{margin: '0 10px', fontWeight: 'bold'}}>Trang {airLinksCurrentPage} / {totalPagesAirLinks} (Tổng: {airLinksTotalCount})</span>
             <button onClick={() => setAirLinksCurrentPage(prev => Math.min(totalPagesAirLinks, prev + 1))} disabled={airLinksCurrentPage===totalPagesAirLinks}>Sau</button>
          </div>

          {isLoadingAirLinks ? <p>Đang tải...</p> : (
            <div style={{ width: '100%', overflow: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th>STT</th>
                    <th>Link Air</th>
                    <th>ID Kênh</th>
                    <th>ID Video</th>
                    <th>Ngày Air</th>
                    <th>Brand</th>
                    <th>Sản Phẩm</th>
                    <th>CAST</th>
                    <th>CMS</th>
                    <th>Nhân Sự</th>
                    <th>Hành Động</th>
                  </tr>
                </thead>
                <tbody>
                  {airLinks.map((link, index) => (
                        <tr key={link.id}>
                          <td style={{ textAlign: 'center' }}>{airLinksTotalCount - ((airLinksCurrentPage - 1) * AIRLINKS_PER_PAGE + index)}</td>
                          <td style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            <a href={link.link_air_koc} target="_blank" rel="noopener noreferrer" style={{color: '#D42426'}}>{link.link_air_koc}</a>
                          </td>
                          <td>{link.id_kenh}</td>
                          <td>{link.id_video}</td>
                          <td>{link.ngay_air ? new Date(link.ngay_air).toLocaleDateString('vi-VN') : ''}</td>
                          <td>{link.brands?.ten_brand}</td>
                          <td>{link.san_pham}</td>
                          <td>{link.cast}</td>
                          <td>{link.cms_brand}</td>
                          <td>{link.nhansu?.ten_nhansu}</td>
                          <td style={{ textAlign: 'center' }}>
                            <button onClick={() => handleDeleteAirLink(link.id, link.link_air_koc)} style={{padding: '5px 10px', backgroundColor: '#D42426', fontSize: '12px'}}>Xóa</button>
                          </td>
                        </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
    </div>
  );
};

export default AirLinksTab;