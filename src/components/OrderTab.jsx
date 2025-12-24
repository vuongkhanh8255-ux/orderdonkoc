// src/components/OrderTab.jsx

import React, { useState, useMemo } from 'react';
import { useAppData } from '../context/AppDataContext';
import ResizableHeader from './ResizableHeader';
import { supabase } from '../supabaseClient';
// Import thư viện biểu đồ
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Label, LabelList } from 'recharts';

const OrderTab = () => {
  const {
    brands, nhanSus, sanPhams, 
    isLoading, hoTen, setHoTen, idKenh, setIdKenh, sdt, setSdt,
    diaChi, setDiaChi, cccd, setCccd, selectedBrand, setSelectedBrand,
    selectedSanPhams, setSelectedSanPhams, selectedNhanSu, setSelectedNhanSu,
    loaiShip, setLoaiShip, donHangs, selectedOrders, currentPage, setCurrentPage,
    totalOrderCount, filterIdKenh, setFilterIdKenh, filterSdt, setFilterSdt,
    filterBrand, setFilterBrand, filterSanPham, setFilterSanPham, filterNhanSu, setFilterNhanSu,
    filterNgay, setFilterNgay, filterLoaiShip, setFilterLoaiShip, filterEditedStatus, setFilterEditedStatus,
    productSearchTerm, setProductSearchTerm, summaryDate, setSummaryDate, productSummary,
    rawSummaryData, isSummarizing, 
    reportMonth, setReportMonth, reportYear, setReportYear,
    reportData, isReportLoading, sortConfig, editingDonHang, setEditingDonHang, isPastDeadlineForNewOrders,
    columnWidths, handleResize, handleQuantityChange, 
    filterSanPhams, handleIdKenhBlur, 
    clearFilters, handleGetSummary, handleGenerateReport, requestSort, handleEdit,
    handleCancelEdit, handleUpdate, handleSelect, handleSelectAll, handleBulkUpdateStatus,
    handleExport, handleExportAll, sortedReportRows, totalsRow, totalPages,
    handleDeleteOrder, loadInitialData,
    
    // Dữ liệu Chart
    chartNhanSu, setChartNhanSu, chartData, isChartLoading
  } = useAppData();

  // State cục bộ
  const [cast, setCast] = useState('0');
  const [cms, setCms] = useState('10%');
  const [videoCounts, setVideoCounts] = useState({});
  const [productCache, setProductCache] = useState({}); 

  // --- CUSTOM AXIS TICK (HIGHLIGHT T7, CN) ---
  const CustomizedAxisTick = (props) => {
    const { x, y, payload } = props;
    const dayNum = parseInt(payload.value.replace('Ngày ', ''), 10);
    const dateObj = new Date(reportYear, reportMonth - 1, dayNum);
    const dayOfWeek = dateObj.getDay(); // 0 là CN, 6 là T7
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    return (
      <g transform={`translate(${x},${y})`}>
        <text 
            x={0} y={0} dy={16} 
            textAnchor="middle" 
            fill={isWeekend ? "#D42426" : "#666"} 
            fontWeight={isWeekend ? "bold" : "normal"}
            fontSize={12}
        >
          {dayNum}
        </text>
      </g>
    );
  };

  const handleVideoCountChange = (productId, val) => {
      setVideoCounts(prev => ({ ...prev, [productId]: val }));
  };

  const handleLocalQuantityChange = (productId, val) => {
      handleQuantityChange(productId, val);
      const sp = sanPhams.find(s => String(s.id) === String(productId));
      if (sp) {
          let brandName = sp?.brands?.ten_brand;
          if (!brandName && sp?.brand_id) {
             const b = brands.find(br => String(br.id) === String(sp.brand_id));
             if(b) brandName = b.ten_brand;
          }
          if (!brandName && selectedBrand) {
             const b = brands.find(br => String(br.id) === String(selectedBrand));
             if(b) brandName = b.ten_brand;
          }

          setProductCache(prev => ({
              ...prev,
              [productId]: {
                  ten_sanpham: sp.ten_sanpham,
                  ten_brand: brandName || 'Unknown',
                  brand_id: sp.brand_id || selectedBrand
              }
          }));
      }
  };

  const formatCurrency = (val) => {
      if(!val) return '';
      return String(val).replace(/\D/g, '').replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  };
  const parseMoney = (str) => parseFloat(String(str).replace(/[^\d]/g, '')) || 0;

  const previewList = useMemo(() => {
      return Object.keys(selectedSanPhams)
        .filter(id => selectedSanPhams[id] > 0)
        .map(id => {
            let info = productCache[id];
            if (!info) {
                const sp = sanPhams.find(s => String(s.id) === String(id));
                if (sp) {
                     let bName = sp.brands?.ten_brand;
                     if (!bName && sp.brand_id) {
                         const b = brands.find(br => String(br.id) === String(sp.brand_id));
                         if(b) bName = b.ten_brand;
                     }
                     if (!bName && selectedBrand) {
                         const b = brands.find(br => String(br.id) === String(selectedBrand));
                         if(b) bName = b.ten_brand;
                     }
                     info = { ten_sanpham: sp.ten_sanpham, ten_brand: bName || 'Unknown', brand_id: sp.brand_id };
                }
            }
            const slVideoRaw = videoCounts[id] !== undefined ? videoCounts[id] : 1;
            return {
                id,
                ten_brand: info?.ten_brand || 'Unknown',
                ten_sanpham: info?.ten_sanpham || 'Unknown',
                so_luong: selectedSanPhams[id],
                sl_video: parseInt(slVideoRaw), 
                brand_id: info?.brand_id || selectedBrand
            };
        });
  }, [selectedSanPhams, videoCounts, productCache, sanPhams, brands, selectedBrand]);

  const ORDERS_PER_PAGE = 50; 
  const pageNumbers = [];
  const maxButtons = 5;
  let startPage = Math.max(1, currentPage - Math.floor(maxButtons / 2));
  let endPage = Math.min(totalPages, startPage + maxButtons - 1);
  if (endPage - startPage + 1 < maxButtons) { startPage = Math.max(1, endPage - maxButtons + 1); }
  for (let i = startPage; i <= endPage; i++) { pageNumbers.push(i); }

  const isDonDaDong = (status) => {
    if (!status) return false;
    return String(status).toLowerCase().includes("đã đóng");
  };

  const handleSafeDelete = (donHang) => {
    if (isDonDaDong(donHang.trang_thai)) { 
        alert("❌ KHÔNG THỂ XÓA: Đơn hàng này ĐÃ ĐÓNG!");
        return; 
    }
    handleDeleteOrder(donHang); 
  };

  const handleBulkDelete = async () => {
    if (selectedOrders.size === 0) return;
    const ordersToDelete = donHangs.filter(order => selectedOrders.has(order.id));
    if (ordersToDelete.some(order => isDonDaDong(order.trang_thai))) {
        alert("❌ LỖI: Có đơn hàng ĐÃ ĐÓNG trong danh sách chọn.");
        return;
    }
    
    // Logic cũ: Có thể giữ lại hoặc bỏ tùy ý (để giữ nguyên như file cũ của bạn)
    const homNay = new Date();
    const invalidOrders = ordersToDelete.filter(order => {
        const ngayTao = new Date(order.ngay_gui);
        const diffTime = Math.abs(homNay - ngayTao);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return diffDays > 3;
    });
    // if (invalidOrders.length > 0) { ... } 

    if (window.confirm(`⚠️ CẢNH BÁO: Xóa vĩnh viễn ${selectedOrders.size} đơn hàng hợp lệ?`)) {
        try {
            for (const order of ordersToDelete) {
                await handleDeleteOrder(order); 
            }
            setSelectedOrders(new Set()); 
        } catch (error) { 
            alert("❌ Lỗi xóa: " + error.message);
        }
    }
  };

  const handleCustomSubmit = async (e) => {
      e.preventDefault();
      if (!idKenh || !hoTen || !selectedNhanSu) { alert("Vui lòng điền đủ thông tin bắt buộc!"); return; }
      if (previewList.length === 0) { alert("Vui lòng chọn ít nhất 1 sản phẩm!"); return; }

      try {
          const summaryString = previewList.map(item => `${item.ten_sanpham} (SL: ${item.so_luong})`).join(', ');
          const orderData = {
              koc_id_kenh: idKenh, koc_ho_ten: hoTen, koc_sdt: sdt, koc_dia_chi: diaChi, koc_cccd: cccd,
              nhansu_id: selectedNhanSu, loai_ship: loaiShip, san_pham_chi_tiet: summaryString, trang_thai: 'Chưa đóng đơn'
          };
          const { data: orderResult, error: orderError } = await supabase.from('donguis').insert([orderData]).select();
          if (orderError) throw orderError;
          const newOrderId = orderResult[0].id;

          const detailInserts = previewList.map(item => ({ dongui_id: newOrderId, sanpham_id: item.id, so_luong: item.so_luong }));
          const { error: detailError } = await supabase.from('chitiettonguis').insert(detailInserts);
          if (detailError) throw detailError;
          
          const bookingPromises = [];
          previewList.forEach(item => {
              const correctBrandId = item.brand_id || selectedBrand;
              for (let i = 0; i < item.sl_video; i++) {
                  bookingPromises.push(
                      supabase.from('bookings').insert({
                          ngay_gui_don: new Date().toISOString().split('T')[0],
                          id_kenh: idKenh, ho_ten: hoTen, sdt: sdt, dia_chi: diaChi,
                          cast_amount: parseMoney(cast), cms: cms,                      
                          brand_id: correctBrandId, san_pham: item.ten_sanpham, nhansu_id: selectedNhanSu,
                          status: 'pending', link_air: '',
                          ghi_chu: `Video ${i+1}/${item.sl_video} - Đơn hàng #${newOrderId}` 
                      })
                  );
              }
          });
          if (bookingPromises.length > 0) {
              await Promise.all(bookingPromises);
              alert("✅ Lên đơn thành công! Đã tự động tạo Booking chờ video.");
          } else {
              alert("✅ Lên đơn thành công! (Không tạo Booking do số clip = 0)");
          }
          
          setHoTen(''); setIdKenh(''); setSdt(''); setDiaChi(''); setCccd('');
          setSelectedSanPhams({}); setVideoCounts({}); setProductCache({});
          setCast('0'); setCms('10%');
          if(loadInitialData) loadInitialData();
      } catch (err) {
          console.error(err); alert("Lỗi khi tạo đơn: " + err.message);
      }
  };

  const headers = [ 
    { key: 'select', label: <input type="checkbox" onChange={handleSelectAll} /> }, 
    { key: 'stt', label: 'STT' }, 
    { key: 'ngayGui', label: 'Ngày Gửi' }, 
    { key: 'hoTenKOC', label: 'Họ Tên KOC' }, 
    { key: 'cccd', label: 'CCCD' }, 
    { key: 'idKenh', label: 'ID Kênh' }, 
    { key: 'sdt', label: 'SĐT' }, 
    { key: 'diaChi', label: 'Địa chỉ' }, 
    { key: 'brand', label: 'Brand' }, 
    { key: 'sanPham', label: 'Sản Phẩm (SL)' }, 
    { key: 'nhanSu', label: 'Nhân Sự Gửi' }, 
    { key: 'loaiShip', label: 'Loại Ship' }, 
    { key: 'trangThai', label: 'Trạng Thái' }, 
    { key: 'hanhDong', label: 'Hành Động' }, 
  ];
  const summaryExportHeaders = [ { label: "Loại Ship", key: "loai_ship"}, { label: "Sản Phẩm", key: "ten_san_pham" }, { label: "Barcode", key: "barcode" }, { label: "Brand", key: "ten_brand" }, { label: "Tổng Số Lượng", key: "total_quantity" } ];

  const runRecoveryData = async () => {
    alert("Tính năng cứu hộ hiện đang tắt. (Code vẫn ở đây nếu cần bật lại)");
  };

  return (
    <> 
      {/* NÚT CỨU HỘ */}
      <button 
          onClick={runRecoveryData}
          style={{
              position: 'fixed', top: 10, left: 10, zIndex: 9999,
              padding: '10px 20px', backgroundColor: '#e74c3c', color: 'white', 
              fontWeight: 'bold', fontSize: '14px', border: '3px solid white', 
              borderRadius: '8px', boxShadow: '0 4px 10px rgba(0,0,0,0.3)', cursor: 'pointer', opacity: 0.7
          }}
      >
          🚑 CỨU HỘ
      </button>

      <div style={{ position: 'relative', textAlign: 'center', marginBottom: '2rem' }}>
          <h1 style={{ fontSize: '2.5rem', fontWeight: '800', color: '#ffffff', textShadow: '2px 2px 4px rgba(0,0,0,0.5)' }}>
              <span style={{color: '#165B33'}}>🎄</span> QUẢN LÝ ĐƠN HÀNG KOC <span style={{color: '#165B33'}}>🎄</span>
          </h1>
          <p style={{ position: 'absolute', top: '0', left: '0', fontSize: '1rem', fontWeight: 'bold', color: '#D42426', backgroundColor: '#fff', padding: '5px 15px', borderRadius: '20px', border: '2px solid #D42426', boxShadow: '0 2px 5px rgba(0,0,0,0.1)' }}>🎅 Made by Khánh đẹp trai vkl</p>
      </div>

      <div style={{ display: 'flex', gap: '2rem', marginBottom: '2rem', alignItems: 'flex-start' }}>
         <div className="christmas-card" style={{ flex: 1 }}>
          <h2 style={{ textAlign: 'center', color: '#D42426', marginBottom: '1.5rem' }}>Tạo Đơn Gửi KOC</h2>
          <form onSubmit={handleCustomSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <div><label>ID Kênh (*)</label><input type="text" value={idKenh} onChange={e => setIdKenh(e.target.value)} onBlur={handleIdKenhBlur} required placeholder="Nhập ID kênh..." /></div>
            <div><label>Họ tên KOC (*)</label><input type="text" value={hoTen} onChange={e => setHoTen(e.target.value)} required placeholder="Họ và tên..." /></div>
            <div><label>CCCD</label><input type="text" value={cccd} onChange={e => setCccd(e.target.value)} required maxLength="12" minLength="12" pattern="[0-9]*" title="Vui lòng nhập đủ 12 chữ số." placeholder="CCCD..." /></div>
            <div><label>Số điện thoại</label><input type="text" value={sdt} onChange={e => setSdt(e.target.value)} required placeholder="SĐT..." /></div>
            <div><label>Địa chỉ</label><input type="text" value={diaChi} onChange={e => setDiaChi(e.target.value)} required placeholder="Địa chỉ..." /></div>
            <div style={{display:'flex', gap:'10px'}}>
                <div style={{flex:1}}><label style={{color:'#D42426', fontWeight:'bold'}}>Cast (VNĐ)</label><input type="text" value={cast} onChange={e => setCast(formatCurrency(e.target.value))} style={{fontWeight:'bold', color:'#D42426'}} /></div>
                <div style={{flex:1}}><label style={{color:'#165B33', fontWeight:'bold'}}>CMS (%)</label><input type="text" value={cms} onChange={e => setCms(e.target.value)} style={{fontWeight:'bold'}} /></div>
            </div>
            <div><label>Brand (*)</label><select value={selectedBrand} onChange={e => setSelectedBrand(e.target.value)} required><option value="">-- Chọn Brand --</option>{brands.map(brand => (<option key={brand.id} value={brand.id}>{brand.ten_brand}</option>))}</select></div>
            <div>
              <label>Sản phẩm & Số clip</label>
              <input type="text" placeholder="Tìm sản phẩm..." value={productSearchTerm} onChange={e => setProductSearchTerm(e.target.value)} disabled={!selectedBrand} />
              <div style={{ border: '1px solid #eee', borderRadius: '8px', padding: '10px', maxHeight: '200px', overflowY: 'auto', backgroundColor: '#f9f9f9' }}>
               {sanPhams.length > 0 ? sanPhams.filter(sp => sp.ten_sanpham.toLowerCase().includes(productSearchTerm.toLowerCase())).map(sp => (
                    <div key={sp.id} style={{ display: 'flex', alignItems: 'center', marginBottom: '8px', borderBottom:'1px dashed #eee', paddingBottom:'5px' }}>
                      <label htmlFor={sp.id} style={{ flex: 2, fontWeight: 'normal !important', fontSize: '0.9rem' }}>{sp.ten_sanpham}</label>
                      <div style={{display:'flex', flexDirection:'column', alignItems:'center', marginRight:'10px'}}>
                          <span style={{fontSize:'0.7rem', color:'#666'}}>SL Hàng</span>
                          <input type="number" min="0" id={sp.id} value={selectedSanPhams[sp.id] || ''} onChange={(e) => handleLocalQuantityChange(sp.id, e.target.value)} style={{ width: '60px', padding: '5px', textAlign: 'center', border: '1px solid #ccc', borderRadius: '4px' }} placeholder="0" />
                      </div>
                      {selectedSanPhams[sp.id] > 0 && (
                          <div style={{display:'flex', flexDirection:'column', alignItems:'center', animation:'fadeIn 0.3s'}}>
                               <span style={{fontSize:'0.7rem', color:'#D42426', fontWeight:'bold'}}>Số Clip</span>
                               <input type="number" min="0" value={videoCounts[sp.id] !== undefined ? videoCounts[sp.id] : 1} onChange={(e) => handleVideoCountChange(sp.id, e.target.value)} style={{ width: '60px', padding: '5px', textAlign: 'center', border: '2px solid #D42426', borderRadius: '4px', fontWeight:'bold', color:'#D42426' }} />
                          </div>
                      )}
                    </div>
                )) : <p style={{ margin: 0, color: '#D42426', textAlign: 'center' }}>Vui lòng chọn Brand để xem sản phẩm</p>}
              </div>
            </div>
            <div><label>Nhân sự gửi (*)</label><select value={selectedNhanSu} onChange={e => setSelectedNhanSu(e.target.value)} required><option value="">-- Chọn nhân sự --</option>{nhanSus.map(nhansu => (<option key={nhansu.id} value={nhansu.id}>{nhansu.ten_nhansu}</option>))}</select></div>
            <div>
              <label>Loại hình vận chuyển</label>
              <div style={{ display: 'flex', gap: '1.5rem', marginTop: '0.5rem', padding: '10px', backgroundColor: '#f9f9f9', borderRadius: '8px' }}>
                <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}><input type="radio" value="Ship thường" checked={loaiShip === 'Ship thường'} onChange={e => setLoaiShip(e.target.value)} style={{ marginRight: '8px' }} />Ship thường</label>
                <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}><input type="radio" value="Hỏa tốc" checked={loaiShip === 'Hỏa tốc'} onChange={e => setLoaiShip(e.target.value)} style={{ marginRight: '8px' }} />Hỏa tốc 🚀</label>
              </div>
            </div>
            <button type="submit" disabled={isLoading || isPastDeadlineForNewOrders} style={{ marginTop: '1rem', backgroundColor: '#D42426', fontSize:'1.1rem', fontWeight:'bold' }}>{isLoading ? 'Đang xử lý...' : '🎁 GỬI ĐƠN & TẠO BOOKING'}</button>
            {isPastDeadlineForNewOrders && (<p style={{ color: '#D42426', textAlign: 'center', marginTop: '0.5rem', fontWeight: 'bold' }}>⚠️ Đã quá 16h30, không thể tạo đơn hàng mới.</p>)}
           </form>
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {previewList.length > 0 && (
                <div className="christmas-card" style={{border: '2px solid #F8B229', animation: 'fadeIn 0.5s'}}>
                    <h3 style={{marginTop:0, color:'#F8B229', textAlign:'center', borderBottom:'1px solid #eee', paddingBottom:'10px'}}>🛒 REVIEW ĐƠN HÀNG ĐANG TẠO</h3>
                    <div style={{maxHeight: '300px', overflowY: 'auto'}}>
                        <table style={{width: '100%', fontSize: '0.9rem', borderCollapse:'collapse'}}>
                            <thead style={{backgroundColor: '#fff3e0'}}><tr><th style={{padding:'8px', textAlign:'left'}}>Brand</th><th style={{padding:'8px', textAlign:'left'}}>Sản phẩm</th><th style={{padding:'8px', textAlign:'center'}}>SL</th><th style={{padding:'8px', textAlign:'center'}}>Clip</th></tr></thead>
                            <tbody>{previewList.map((item, idx) => (<tr key={idx} style={{borderBottom: '1px solid #eee'}}><td style={{padding:'8px', fontWeight:'bold', color:'#333'}}>{item.ten_brand}</td><td style={{padding:'8px'}}>{item.ten_sanpham}</td><td style={{padding:'8px', textAlign:'center', fontWeight:'bold'}}>{item.so_luong}</td><td style={{padding:'8px', textAlign:'center', color:'#D42426', fontWeight:'bold'}}>{item.sl_video}</td></tr>))}</tbody>
                        </table>
                    </div>
                    <div style={{marginTop: '10px', textAlign: 'right', fontSize: '0.9rem', color: '#666', fontStyle: 'italic'}}>* Kiểm tra kỹ trước khi bấm Gửi Đơn (Clip = 0 sẽ không tạo Booking)</div>
                </div>
            )}
           <div className="christmas-card">
                <h2 style={{ textAlign: 'center', marginBottom: '1.5rem', color: '#165B33' }}>Tổng Hợp Sản Phẩm (Ngày)</h2>
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1rem' }}>
                    <input type="date" value={summaryDate} onChange={e => setSummaryDate(e.target.value)} style={{ flex: 1 }} />
                    <button onClick={handleGetSummary} disabled={isSummarizing} style={{ backgroundColor: '#165B33' }}>{isSummarizing ? '...' : 'Tổng hợp'}</button>
                </div>
                <div style={{ marginTop: '1rem', maxHeight: '500px', overflowY: 'auto' }}>
                    {rawSummaryData.length === 0 && !isSummarizing && <p style={{ textAlign: 'center', color: '#999' }}>Chưa có dữ liệu cho ngày đã chọn.</p>}
                    {productSummary['Ship thường'].length > 0 && (
                    <div style={{marginBottom: '1.5rem'}}>
                            <h3 style={{color: '#165B33', borderBottom: '1px solid #eee', paddingBottom: '5px', fontWeight: 'bold'}}>📦 Ship Thường</h3>
                            <table style={{ width: '100%' }}><thead><tr><th>Sản phẩm</th><th>SL</th></tr></thead><tbody>{productSummary['Ship thường'].map(item => (<tr key={`${item.ten_san_pham}-thuong`}><td>{item.ten_san_pham}<br/><small style={{color: '#777'}}>{item.ten_brand} - {item.barcode}</small></td><td style={{textAlign: 'center'}}><strong>{item.total_quantity}</strong></td></tr>))}</tbody></table>
                        </div>
                    )}
                    {productSummary['Hỏa tốc'].length > 0 && (
                    <div>
                        <h3 style={{color: '#D42426', borderBottom: '1px solid #eee', paddingBottom: '5px', fontWeight: 'bold'}}>🚀 Hỏa Tốc</h3>
                            <table style={{ width: '100%' }}><thead><tr><th>Sản phẩm</th><th>SL</th></tr></thead><tbody>{productSummary['Hỏa tốc'].map(item => (<tr key={`${item.ten_san_pham}-toc`}><td>{item.ten_san_pham}<br/><small style={{color: '#777'}}>{item.ten_brand} - {item.barcode}</small></td><td style={{textAlign: 'center'}}><strong>{item.total_quantity}</strong></td></tr>))}</tbody></table>
                        </div>
                    )}
                    {rawSummaryData.length > 0 && <div style={{ marginTop: '1rem', textAlign: 'right' }}><button onClick={() => handleExport({ data: rawSummaryData, headers: summaryExportHeaders, filename: `tong-hop-san-pham-${summaryDate}.xlsx`})} style={{ backgroundColor: '#F8B229', color: '#333' }}>Xuất File Tổng Hợp</button></div>}
                </div>
            </div>
        </div>
      </div>

      <div className="christmas-card" style={{ marginBottom: '2rem' }}>
        <h2 style={{ textAlign: 'center', color: '#D42426' }}>Báo Cáo Hiệu Suất Nhân Sự</h2>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', justifyContent: 'center', marginBottom: '1.5rem' }}>
            <select value={reportMonth} onChange={e => setReportMonth(e.target.value)} style={{ width: 'auto' }}>{Array.from({ length: 12 }, (_, i) => <option key={i+1} value={i+1}>Tháng {i+1}</option>)}</select>
            <input type="number" value={reportYear} onChange={e => setReportYear(e.target.value)} style={{ width: '100px' }} />
            <button onClick={handleGenerateReport} disabled={isReportLoading} style={{ backgroundColor: '#D42426' }}>{isReportLoading ? 'Đang tính toán...' : '📊 Xem Báo Cáo'}</button>
        </div>
        
        {/* BẢNG SỐ LIỆU */}
        {reportData.reportRows.length > 0 ? (
          <div style={{width: '100%', overflowX: 'auto'}}>
            <table style={{ width: '100%' }}>
              <thead><tr><th style={{ cursor: 'pointer' }} onClick={() => requestSort('ten_nhansu')}>Nhân Sự {sortConfig.key === 'ten_nhansu' ? (sortConfig.direction === 'asc' ? '▲' : '▼') : ''}</th><th style={{ cursor: 'pointer', textAlign: 'center' }} onClick={() => requestSort('sl_order')}>SL Order {sortConfig.key === 'sl_order' ? (sortConfig.direction === 'asc' ? '▲' : '▼') : ''}</th><th style={{ textAlign: 'center' }} >AOV Đơn Order</th><th style={{ cursor: 'pointer', textAlign: 'center' }} onClick={() => requestSort('chi_phi_tong')}>Chi Phí Tổng {sortConfig.key === 'chi_phi_tong' ? (sortConfig.direction === 'asc' ? '▲' : '▼') : ''}</th>{reportData.brandHeaders.map(brand => (<th key={brand} style={{ cursor: 'pointer', textAlign: 'center' }} onClick={() => requestSort(brand)}>{brand} {sortConfig.key === brand ? (sortConfig.direction === 'asc' ? '▲' : '▼') : ''}</th>))}</tr></thead>
              <tbody>
                {sortedReportRows.map((item) => (
                   <tr key={item.nhansu_id}>
                      <td style={{ fontWeight: 'bold', color: '#165B33' }}>{item.ten_nhansu}</td><td style={{ textAlign: 'center' }}>{item.sl_order}</td><td style={{ textAlign: 'center' }}>{Math.round(item.aov_don_order).toLocaleString('vi-VN')} đ</td><td style={{ textAlign: 'center' }}>{Math.round(item.chi_phi_tong).toLocaleString('vi-VN')} đ</td>
                      {reportData.brandHeaders.map(brand => (<td key={brand} style={{ textAlign: 'center' }}>{item.brand_counts[brand] || 0}</td>))}
                    </tr>
                ))}
              </tbody>
              <tfoot>
               {totalsRow && (
                  <tr style={{backgroundColor: '#FDE2E2', fontWeight: 'bold', color: '#D42426'}}><td>TỔNG CỘNG</td><td style={{ textAlign: 'center' }}>{totalsRow.sl_order}</td><td style={{ textAlign: 'center' }}>{Math.round(totalsRow.aov_don_order).toLocaleString('vi-VN')} đ</td><td style={{ textAlign: 'center' }}>{Math.round(totalsRow.chi_phi_tong).toLocaleString('vi-VN')} đ</td>{reportData.brandHeaders.map(brand => (<td key={brand} style={{ textAlign: 'center' }}>{totalsRow.brand_counts[brand] || 0}</td>))}</tr>
                 )}
              </tfoot>
            </table>
          </div>
        ) : (<p style={{ textAlign: 'center', color: '#999', padding: '20px' }}>{isReportLoading ? 'Đang tải...' : 'Chưa có dữ liệu báo cáo.'}</p>)}

        {/* --- [MỚI] KHU VỰC BIỂU ĐỒ (CHART SECTION) --- */}
        <div style={{ marginTop: '30px', padding: '20px', backgroundColor: '#fff', borderRadius: '10px', border: '1px solid #ddd', boxShadow: '0 4px 10px rgba(0,0,0,0.05)' }}>
            <h3 style={{ textAlign: 'center', color: '#165B33', marginBottom: '15px' }}>📈 Biểu Đồ Hiệu Suất Theo Ngày (Tháng {reportMonth}/{reportYear})</h3>
            
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px' }}>
                <select 
                    value={chartNhanSu} 
                    onChange={e => setChartNhanSu(e.target.value)} 
                    style={{ padding: '10px 15px', borderRadius: '6px', border: '1px solid #ccc', fontSize: '1rem', minWidth: '250px' }}
                >
                    <option value="">-- Chọn nhân sự để xem biểu đồ --</option>
                    {nhanSus.map(ns => (
                        <option key={ns.id} value={ns.id}>{ns.ten_nhansu}</option>
                    ))}
                </select>
            </div>

            {isChartLoading ? (
                <p style={{ textAlign: 'center' }}>Đang tải biểu đồ...</p>
            ) : chartData.length > 0 ? (
                <div style={{ width: '100%', height: 350 }}>
                    <ResponsiveContainer>
                        <AreaChart data={chartData} margin={{ top: 20, right: 30, left: 10, bottom: 20 }}>
                            <defs>
                                <linearGradient id="colorOrders" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#165B33" stopOpacity={0.8}/>
                                    <stop offset="95%" stopColor="#165B33" stopOpacity={0}/>
                                </linearGradient>
                            </defs>
                            
                            {/* [YÊU CẦU 1 + 3] Trục X: Highlight cuối tuần + Label Ngày */}
                            <XAxis 
                                dataKey="day" 
                                tick={<CustomizedAxisTick />}
                                interval={0} 
                                height={60}
                            >
                                <Label value="Ngày trong tháng" offset={0} position="insideBottom" />
                            </XAxis>

                            {/* [YÊU CẦU 1] Trục Y: Label Số đơn */}
                            <YAxis allowDecimals={false}>
                                <Label value="Số lượng đơn" angle={-90} position="insideLeft" style={{ textAnchor: 'middle' }} />
                            </YAxis>

                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                            <Tooltip formatter={(value) => [`${value} đơn`, 'Số lượng']} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 2px 10px rgba(0,0,0,0.1)' }} />
                            
                            {/* [YÊU CẦU 2] Thêm chấm tròn (dot) VÀ Label số lượng trên đỉnh */}
                            <Area 
                                type="monotone" 
                                dataKey="orders" 
                                stroke="#165B33" 
                                strokeWidth={3} 
                                fillOpacity={1} 
                                fill="url(#colorOrders)" 
                                dot={{ stroke: '#165B33', strokeWidth: 2, r: 4, fill: 'white' }}
                                activeDot={{ r: 6, fill: '#D42426' }} 
                                label={{ position: 'top', fill: '#165B33', fontSize: 12, fontWeight: 'bold', dy: -5 }} // [ĐÃ THÊM LABEL SỐ]
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            ) : (
                <div style={{ textAlign: 'center', color: '#999', padding: '30px', border: '2px dashed #ccc', borderRadius: '8px' }}>
                    {chartNhanSu ? "Không có dữ liệu đơn hàng trong tháng này." : "Vui lòng chọn nhân sự ở trên để xem biểu đồ."}
                </div>
            )}
        </div>
      </div>

      <div className="christmas-card" style={{ marginBottom: '1.5rem', padding: '1.5rem' }}>
        <h2 style={{ textAlign: 'center', color: '#D42426', marginBottom: '1rem' }}>Danh Sách Đơn Hàng</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
            <input type="text" placeholder="ID kênh..." value={filterIdKenh} onChange={e => setFilterIdKenh(e.target.value)} />
            <input type="text" placeholder="SĐT..." value={filterSdt} onChange={e => setFilterSdt(e.target.value)} />
            <select value={filterBrand} onChange={e => setFilterBrand(e.target.value)}><option value="">Tất cả Brand</option>{brands.map(b => <option key={b.id} value={b.id}>{b.ten_brand}</option>)}</select>
            <select value={filterSanPham} onChange={e => setFilterSanPham(e.target.value)} disabled={!filterBrand}><option value="">Tất cả Sản phẩm</option>{filterSanPhams.map(sp => <option key={sp.id} value={sp.id}>{sp.ten_sanpham}</option>)}</select>
            <select value={filterNhanSu} onChange={e => setFilterNhanSu(e.target.value)}><option value="">Tất cả nhân sự</option>{nhanSus.map(ns => <option key={ns.id} value={ns.id}>{ns.ten_nhansu}</option>)}</select>
            <select value={filterLoaiShip} onChange={e => setFilterLoaiShip(e.target.value)}><option value="">Tất cả loại ship</option><option value="Ship thường">Ship thường</option><option value="Hỏa tốc">Hỏa tốc</option></select>
            <select value={filterEditedStatus} onChange={e => setFilterEditedStatus(e.target.value)}><option value="all">Tất cả</option><option value="edited">Đơn đã sửa</option><option value="unedited">Đơn chưa sửa</option></select>
            <input type="date" value={filterNgay} onChange={e => setFilterNgay(e.target.value)} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', borderTop: '1px solid #eee', paddingTop: '15px', flexWrap: 'wrap' }}>
             <button onClick={clearFilters} style={{ backgroundColor: '#95A5A6', color: 'white', padding: '8px 15px', display: 'flex', alignItems: 'center', gap: '5px', border: 'none', borderRadius: '4px', cursor: 'pointer' }}><i className="fa fa-filter"></i> Xóa Lọc</button>
             <button onClick={handleBulkUpdateStatus} disabled={selectedOrders.size === 0} style={{ backgroundColor: selectedOrders.size > 0 ? '#F39C12' : '#ecf0f1', color: selectedOrders.size > 0 ? 'white' : '#bdc3c7', fontWeight: 'bold', padding: '8px 15px', cursor: selectedOrders.size > 0 ? 'pointer' : 'not-allowed', border: 'none', borderRadius: '4px' }}>📦 Đóng Đơn ({selectedOrders.size})</button>
              <button onClick={handleBulkDelete} disabled={selectedOrders.size === 0} style={{ backgroundColor: selectedOrders.size > 0 ? '#c0392b' : '#ecf0f1', color: selectedOrders.size > 0 ? 'white' : '#bdc3c7', fontWeight: 'bold', padding: '8px 15px', cursor: selectedOrders.size > 0 ? 'pointer' : 'not-allowed', border: 'none', borderRadius: '4px' }}>🗑️ XÓA ({selectedOrders.size})</button>
            <button onClick={handleExportAll} disabled={isLoading} style={{ backgroundColor: '#165B33', color: 'white', padding: '8px 20px', marginLeft: '10px', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>{isLoading ? '...' : '📊 Xuất Excel'}</button>
        </div>
      </div>
      
      <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
            <p style={{marginBottom: '10px', color: '#ffffff', fontWeight: 'bold', textShadow: '0 2px 4px rgba(0,0,0,0.5)'}}>Tổng cộng: {totalOrderCount} đơn hàng ({ORDERS_PER_PAGE} đơn/trang) - Trang {currentPage}/{totalPages}</p>
            <button onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))} disabled={currentPage === 1 || isLoading} style={{ margin: '0 5px', backgroundColor: '#f8f9fa', color: '#333', border: '1px solid #ccc' }}>Trang Trước</button>
            {pageNumbers.map(number => (<button key={number} onClick={() => setCurrentPage(number)} disabled={isLoading} style={{ margin: '0 5px', backgroundColor: currentPage === number ? '#D42426' : '#f8f9fa', color: currentPage === number ? 'white' : '#333', border: '1px solid #ccc' }}>{number}</button>))}
            <button onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))} disabled={currentPage === totalPages || isLoading} style={{ margin: '0 5px', backgroundColor: '#f8f9fa', color: '#333', border: '1px solid #ccc' }}>Trang Sau</button>
      </div>

      <div className="christmas-card" style={{ padding: '0', overflow: 'hidden' }}>
        <div style={{ width: '100%', overflowX: 'auto' }}>
            <table style={{ width: '100%' }}>
            <thead><tr>{headers.map((header) => (<ResizableHeader key={header.key} width={columnWidths[header.key]} onResize={handleResize(header.key)}>{header.label}</ResizableHeader>))}</tr></thead>
            <tbody>
              {donHangs.map((donHang) => {
                const getCellStyle = (currentValue, originalValue) => (originalValue !== null && currentValue !== originalValue) ? { backgroundColor: '#D42426', color: 'white' } : {};
                const sanPhamDisplay = donHang.chitiettonguis && donHang.chitiettonguis.map(ct => (<div key={ct.sanphams?.id}>{ct.sanphams?.ten_sanpham} (SL: {ct.so_luong})</div>));
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
                      <td style={{ width: `${columnWidths.brand}px`, padding: '12px', border: '1px solid #ddd' }}>{[...new Set(donHang.chitiettonguis?.map(ct => ct.sanphams?.brands?.ten_brand))].map(b => <div key={b}>{b}</div>)}</td>
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
                      <td style={{ width: `${columnWidths.brand}px`, padding: '12px', border: '1px solid #ddd' }}>{[...new Set(donHang.chitiettonguis?.map(ct => ct.sanphams?.brands?.ten_brand))].map(tenBrand => ( <div key={tenBrand}>{tenBrand}</div> ))}</td>
                      <td style={{ width: `${columnWidths.sanPham}px`, padding: '12px', border: '1px solid #ddd' }}>{sanPhamDisplay}</td>
                      <td style={{ width: `${columnWidths.nhanSu}px`, padding: '12px', border: '1px solid #ddd' }}>{donHang.nhansu?.ten_nhansu}</td>
                      <td style={{ width: `${columnWidths.loaiShip}px`, padding: '12px', border: '1px solid #ddd', ...getCellStyle(donHang.loai_ship, donHang.original_loai_ship) }}>{donHang.loai_ship}</td>
                      <td style={{ width: `${columnWidths.trangThai}px`, padding: '12px', border: '1px solid #ddd', ...getCellStyle(donHang.trang_thai, donHang.original_trang_thai) }}>{donHang.trang_thai}</td>
                      <td style={{ width: `${columnWidths.hanhDong}px`, padding: '12px', border: '1px solid #ddd', whiteSpace: 'nowrap' }}>
                          <button onClick={() => handleEdit(donHang)} style={{padding: '5px 10px', backgroundColor: '#F8B229', color: '#333', border: 'none', borderRadius: '4px', marginRight: '5px'}}>Sửa</button>
                          {isDonDaDong(donHang.trang_thai) ? (
                             <button disabled style={{padding: '5px 10px', backgroundColor: '#bdc3c7', color: 'white', border: 'none', borderRadius: '4px', cursor: 'not-allowed', opacity: 0.6}} title="Đơn đã đóng không thể xóa">Xóa</button>
                          ) : (
                             <button onClick={() => handleSafeDelete(donHang)} style={{padding: '5px 10px', backgroundColor: '#D42426', color: 'white', border: 'none', borderRadius: '4px'}}>Xóa</button>
                          )}
                      </td>
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