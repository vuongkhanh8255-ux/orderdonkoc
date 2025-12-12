import React, { useState, useEffect, useMemo } from 'react';
import { useAppData } from '../context/AppDataContext';
import { supabase } from '../supabaseClient';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#AF19FF', '#FF4560', '#775DD0', '#00E396'];
const CHART_HEIGHT = 400;   
const PIE_CY = 170;
const PIE_CX = "50%";       
const INNER_R = 75;         
const OUTER_R = 120;

// --- HÀM HELPER ---
const formatCurrency = (value) => {
  if (!value && value !== 0) return '';
  const number = String(value).replace(/\D/g, '');
  return number.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
};

const formatCompactNumber = (number) => {
  if (!number) return '0';
  if (number >= 1000000000) return (number / 1000000000).toFixed(1).replace('.0', '') + ' tỷ';
  if (number >= 1000000) return (number / 1000000).toFixed(1).replace('.0', '') + 'tr';
  return formatCurrency(number);
};

const parseMoney = (str) => {
    if (!str) return 0;
    return parseFloat(String(str).replace(/[^\d]/g, '')) || 0;
};

// --- COMPONENT TEXT Ở GIỮA ---
const HardcodedCenterText = ({ value, isMoney = false }) => {
  return (
    <text 
      x="50%"       
      y={PIE_CY}    
      textAnchor="middle" 
      dominantBaseline="central" 
      style={{ 
        fontSize: isMoney ? '28px' : '40px', 
        fontWeight: '900', 
        fill: '#333',
        stroke: '#fff', 
        strokeWidth: '4px', 
        paintOrder: 'stroke',
        filter: 'drop-shadow(2px 2px 2px rgba(0,0,0,0.2))',
        fontFamily: 'Arial, sans-serif',
        pointerEvents: 'none'
      }}
    >
      {value}
    </text>
  );
};

const renderCustomLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent, index, name, value, unit = "" }) => {
  const RADIAN = Math.PI / 180;
  const radius = outerRadius * 1.4; 
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);

  if (percent === 0) return null;
  return (
    <text 
      x={x} 
      y={y} 
      fill="#555" 
      textAnchor={x > cx ? 'start' : 'end'} 
      dominantBaseline="central" 
      fontSize="12px" 
      fontWeight="600"
    >
      {`${name}: ${unit === 'đ' ? formatCurrency(value) + 'đ' : value + unit} (${(percent * 100).toFixed(0)}%)`}
    </text>
  );
};

const PRODUCT_OPTIONS = [
  "Bodymist", "Bodymist nhũ", "Nước hoa sáp", "Nước hoa Bodymiss",
  "Toner hoa cúc (new)", "Toner hoa cúc (cũ)", "Tẩy trang hoa cúc", "Sữa rửa mặt hoa cúc",
  "gel nha đam", "Mask tràm trà", "Dầu dừa", "Dầu olive",
  "Serum dưỡng mi", "Scrub AHA", "Serum bưởi", "Scrub sữa gạo hạnh nhân",
  "Muối hồng", "Body oil", "Nước hoa sunkiss", "Bột moaw", "Bột Milaganics", "Sachi"
];

// --- MAIN CONTENT ---
const AirLinksTab = () => {
  const {
    brands, nhanSus,
    airLinks, isLoadingAirLinks, loadAirLinks,
    filterAlKenh, setFilterAlKenh,
    filterAlBrand, setFilterAlBrand,
    filterAlNhanSu, setFilterAlNhanSu,
    handleDeleteAirLink,
    clearAirLinkFilters,
    airLinksCurrentPage, setAirLinksCurrentPage,
    airLinksTotalCount, totalPagesAirLinks,
    airReportMonth, setAirReportMonth, airReportYear, setAirReportYear,
    airReportData, isAirReportLoading, handleGenerateAirLinksReport, requestAirSort,
    sortedAirReportRows, totalsRowAirReport
  } = useAppData();

  const [newLink, setNewLink] = useState({
    link_air_koc: '', id_kenh: '', id_video: '', brand_id: '', san_pham: '', nhansu_id: '',
    ngay_air: '', 
    ngay_booking: new Date().toISOString().split('T')[0], 
    cast: '', cms_brand: '', view_count: 0
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // --- STATE CHO INLINE EDITING (SỬA TRỰC TIẾP) ---
  const [editingRowId, setEditingRowId] = useState(null); 
  const [editFormData, setEditFormData] = useState({}); 

  // State bộ lọc biểu đồ
  const [chart1Brand, setChart1Brand] = useState('All');
  const [chart2Brand, setChart2Brand] = useState('All');
  const [chart3StaffId, setChart3StaffId] = useState(''); 
  const [chart4Brand, setChart4Brand] = useState('All');

  // --- LOGIC TÍNH TOÁN DỮ LIỆU ---
  const dataChart1 = useMemo(() => {
    let filtered = chart1Brand === 'All' ? airLinks : airLinks.filter(d => d.brands?.ten_brand === chart1Brand);
    const counts = {};
    filtered.forEach(item => { const key = item.san_pham || 'Khác'; counts[key] = (counts[key] || 0) + 1; });
    return Object.keys(counts).map(key => ({ name: key, value: counts[key] }));
  }, [airLinks, chart1Brand]);

  const dataChart2 = useMemo(() => {
    let filtered = chart2Brand === 'All' ? airLinks : airLinks.filter(d => d.brands?.ten_brand === chart2Brand);
    const counts = {};
    filtered.forEach(item => { const key = item.nhansu?.ten_nhansu || 'Ẩn danh'; counts[key] = (counts[key] || 0) + 1; });
    return Object.keys(counts).map(key => ({ name: key, value: counts[key] }));
  }, [airLinks, chart2Brand]);

  const dataChart3 = useMemo(() => {
    if (!chart3StaffId) return [];
    const selectedStaffObj = nhanSus.find(ns => String(ns.id) === String(chart3StaffId));
    if (!selectedStaffObj) return [];
    const staffName = selectedStaffObj.ten_nhansu;
    let filtered = airLinks.filter(d => (d.nhansu?.ten_nhansu === staffName) || String(d.nhansu_id) === String(chart3StaffId));
    const counts = {};
    filtered.forEach(item => { const key = item.san_pham || 'Khác'; counts[key] = (counts[key] || 0) + 1; });
    return Object.keys(counts).map(key => ({ name: key, value: counts[key] }));
  }, [airLinks, chart3StaffId, nhanSus]);

  const dataChart4 = useMemo(() => {
    let filtered = chart4Brand === 'All' ? airLinks : airLinks.filter(d => d.brands?.ten_brand === chart4Brand);
    const costMap = {};
    filtered.forEach(item => { const key = item.san_pham || 'Khác'; const cost = parseMoney(item.cast); costMap[key] = (costMap[key] || 0) + cost; });
    return Object.keys(costMap).map(key => ({ name: key, value: costMap[key] }));
  }, [airLinks, chart4Brand]);

  const totalChart1 = useMemo(() => dataChart1.reduce((a, b) => a + b.value, 0), [dataChart1]);
  const totalChart2 = useMemo(() => dataChart2.reduce((a, b) => a + b.value, 0), [dataChart2]);
  const totalChart3 = useMemo(() => dataChart3.reduce((a, b) => a + b.value, 0), [dataChart3]);
  const totalChart4 = useMemo(() => dataChart4.reduce((a, b) => a + b.value, 0), [dataChart4]);

  // --- HANDLERS CHO FORM THÊM MỚI ---
  const handleLinkChange = async (e) => {
    const url = e.target.value;
    let extractedKenh = ''; let extractedVideo = '';
    try {
      if (url.includes('tiktok.com')) {
        const urlObj = new URL(url);
        const pathParts = urlObj.pathname.split('/').filter(p => p);
        const kenhPart = pathParts.find(p => p.startsWith('@'));
        if (kenhPart) extractedKenh = kenhPart.replace('@', '');
        const videoIndex = pathParts.indexOf('video');
        if (videoIndex !== -1 && pathParts[videoIndex + 1]) { extractedVideo = pathParts[videoIndex + 1];
        }
      }
    } catch (error) { }
    setNewLink(prev => ({ ...prev, link_air_koc: url, id_kenh: extractedKenh, id_video: extractedVideo }));
    if (extractedKenh) {
        try {
            const { data, error } = await supabase.from('air_links').select('brand_id, nhansu_id, "cast", cms_brand').eq('id_kenh', extractedKenh).order('created_at', { ascending: false }).limit(1).single();
            if (data && !error) { setNewLink(prev => ({ ...prev, brand_id: data.brand_id || '', nhansu_id: data.nhansu_id || '', cast: formatCurrency(data.cast) || '', cms_brand: data.cms_brand || '' }));
            }
        } catch (err) { console.error("Lỗi auto-fill:", err);
        }
    }
  };

  const handleCastChange = (e) => { setNewLink({ ...newLink, cast: formatCurrency(e.target.value) }); };
  
  const handleAddLink = async (e) => {
    e.preventDefault();
    if (!newLink.link_air_koc || !newLink.brand_id || !newLink.nhansu_id || !newLink.san_pham) { alert("Vui lòng điền đủ thông tin!"); return;
    }
    setIsSubmitting(true);
    try {
      // Logic CMS: Mặc định 10%
      let finalCMS = newLink.cms_brand;
      if (!finalCMS || finalCMS.trim() === '') finalCMS = '10%';

      // Logic Cast: Parse về số, nếu rỗng thì là 0
      const finalCast = parseMoney(newLink.cast);

      const dataToInsert = { 
          ...newLink, 
          cms_brand: finalCMS, 
          cast: finalCast, // Đảm bảo lưu số 0 nếu không điền
          ngay_air: newLink.ngay_air ? newLink.ngay_air : null 
      };

      const { error } = await supabase.from('air_links').insert([dataToInsert]);
      if (error) throw error;
      alert("Đã thêm link thành công! 🎉");
      setNewLink({ link_air_koc: '', id_kenh: '', id_video: '', brand_id: '', san_pham: '', nhansu_id: '', ngay_air: '', ngay_booking: new Date().toISOString().split('T')[0], cast: '', cms_brand: '', view_count: 0 });
      loadAirLinks(); handleGenerateAirLinksReport(); 
    } catch (error) { alert("Lỗi khi lưu: " + error.message); } finally { setIsSubmitting(false); }
  };
  
  useEffect(() => { handleGenerateAirLinksReport(); }, [airReportMonth, airReportYear]);

  // --- LOGIC HIỂN THỊ VÀ EDIT TRỰC TIẾP ---

  // 1. Render text CMS (Logic cũ)
  const renderCMS = (val) => {
      let str = val ? String(val).trim() : '';
      if (str === '' || str === '0') str = '10%';
      if (!str.includes('%')) str = str + '%';
      const isStandard = str === '10%';
      return (
          <span style={{ color: isStandard ? 'inherit' : '#D42426', fontWeight: isStandard ? 'normal' : 'bold' }}>
              {str}
          </span>
      );
  };

  // 2. Render CAST (Logic MỚI: Highlight đỏ nếu > 0, mặc định 0)
  const renderCast = (val) => {
      const numVal = parseMoney(val);
      if (numVal > 0) {
          // Có tiền -> Highlight ĐỎ
          return <span style={{ color: '#D42426', fontWeight: 'bold' }}>{formatCurrency(numVal)}</span>;
      } else {
          // Không có tiền (0 hoặc rỗng) -> Hiện số 0 màu thường
          return <span>0</span>;
      }
  };

  // START EDIT
  const handleEditClick = (link) => {
    setEditingRowId(link.id);
    setEditFormData({
        id: link.id,
        link_air_koc: link.link_air_koc,
        id_kenh: link.id_kenh,
        id_video: link.id_video,
        brand_id: link.brand_id,
        san_pham: link.san_pham,
        nhansu_id: link.nhansu_id,
        cast: formatCurrency(link.cast),
        cms_brand: link.cms_brand
    });
  };

  // CHANGE INPUT
  const handleEditFormChange = (e, field) => {
      let value = e.target.value;
      if (field === 'cast') value = formatCurrency(value);
      setEditFormData({ ...editFormData, [field]: value });
  };

  // CANCEL
  const handleCancelClick = () => {
      setEditingRowId(null);
      setEditFormData({});
  };

  // SAVE
  const handleSaveClick = async () => {
      try {
        let finalCMS = editFormData.cms_brand;
        if (!finalCMS || String(finalCMS).trim() === '') finalCMS = '10%'; 

        // Xử lý Cast khi lưu: Parse về số để lưu DB
        const finalCast = parseMoney(editFormData.cast);

        const { error } = await supabase
            .from('air_links')
            .update({
                link_air_koc: editFormData.link_air_koc,
                id_kenh: editFormData.id_kenh,
                id_video: editFormData.id_video,
                brand_id: editFormData.brand_id,
                san_pham: editFormData.san_pham,
                cast: finalCast, 
                cms_brand: finalCMS,
                nhansu_id: editFormData.nhansu_id
            })
            .eq('id', editFormData.id);

        if (error) throw error;
        
        alert("Đã cập nhật thành công! ✅");
        setEditingRowId(null);
        loadAirLinks(); 
        handleGenerateAirLinksReport(); 
      } catch (err) {
          alert("Lỗi khi cập nhật: " + err.message);
      }
  };

  // STYLES
  const cardStyle = { backgroundColor: '#ffffff', borderRadius: '12px', padding: '25px', boxShadow: '0 4px 20px rgba(0,0,0,0.05)', marginBottom: '2rem', border: '1px solid rgba(0,0,0,0.02)' };
  const inputStyle = { width:'100%', padding:'12px', borderRadius:'6px', border:'1px solid #ddd', outline:'none', fontSize: '1rem' };
  const labelStyle = { display:'block', marginBottom:'8px', fontWeight:'600', fontSize:'0.95rem', color: '#333' };
  const tableInputStyle = { width: '100%', padding: '6px', border: '1px solid #ccc', borderRadius: '4px', boxSizing: 'border-box' };

  return (
    <>
        {/* Header Page */}
        <div style={{ marginBottom: '30px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
                <h1 style={{ fontSize: '2.5rem', fontWeight: '800', color: '#ffffff', margin: 0, textTransform: 'uppercase', letterSpacing: '1px', textShadow: '2px 2px 4px rgba(0,0,0,0.3)' }}>
                   🎄 QUẢN LÝ LINK AIR KOC
                </h1>
                <p style={{ color: '#ffffff', marginTop: '8px', fontSize: '1.1rem', fontWeight: '500' }}>
                    Theo dõi hiệu suất và nhập liệu link air hàng ngày.
                </p>
            </div>
            <div style={{ backgroundColor: '#fff', padding: '12px 25px', borderRadius: '30px', boxShadow: '0 4px 10px rgba(0,0,0,0.2)', color: '#D42426', fontWeight: 'bold', fontSize: '1.1rem' }}>
                📅 Hôm nay: {new Date().toLocaleDateString('vi-VN')}
            </div>
        </div>

        {/* FORM THÊM MỚI */}
        <div style={cardStyle}>
            <h3 style={{ borderBottom: '2px solid #f0f0f0', paddingBottom: '15px', marginBottom: '25px', color: '#D42426', fontSize: '1.6rem', fontWeight: '800', textTransform: 'uppercase' }}>
                ✏️ THÊM LINK AIR MỚI
            </h3>
            <form onSubmit={handleAddLink}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '25px' }}>
                    <div>
                        <label style={labelStyle}>Link Video TikTok (*)</label><input type="text" placeholder="Dán link vào đây..." value={newLink.link_air_koc} onChange={handleLinkChange} required style={inputStyle} />
                        <div style={{ display: 'flex', gap: '15px', marginTop:'20px' }}>
                        <div style={{flex: 1}}><label style={{...labelStyle, color:'#666'}}>ID Kênh</label><input type="text" value={newLink.id_kenh} readOnly style={{...inputStyle, backgroundColor:'#f9f9f9', color:'#555'}} /></div>
                        <div style={{flex: 1}}><label style={{...labelStyle, color:'#666'}}>ID Video</label><input type="text" value={newLink.id_video} readOnly style={{...inputStyle, backgroundColor:'#f9f9f9', color:'#555'}} /></div>
                        </div>
                        <label style={{...labelStyle, marginTop:'20px'}}>Sản Phẩm (*)</label>
                        <select value={newLink.san_pham} onChange={e => setNewLink({...newLink, san_pham: e.target.value})} required style={inputStyle}><option value="">-- Chọn Sản Phẩm --</option>{PRODUCT_OPTIONS.map(prod => (<option key={prod} value={prod}>{prod}</option>))}</select>
                    </div>
                    <div>
                        <label style={labelStyle}>Brand (*)</label><select value={newLink.brand_id} onChange={e => setNewLink({...newLink, brand_id: e.target.value})} required style={{...inputStyle, marginBottom:'20px'}}><option value="">-- Chọn Brand --</option>{brands.map(b => <option key={b.id} value={b.id}>{b.ten_brand}</option>)}</select>
                        <label style={labelStyle}>Nhân sự Booking (*)</label><select value={newLink.nhansu_id} onChange={e => setNewLink({...newLink, nhansu_id: e.target.value})} required style={inputStyle}><option value="">-- Chọn Nhân sự --</option>{nhanSus.map(ns => <option key={ns.id} value={ns.id}>{ns.ten_nhansu}</option>)}</select>
                        <div style={{ display: 'flex', gap: '15px', marginTop:'20px' }}>
                            <div style={{flex: 1}}><label style={labelStyle}>CAST (VND)</label><input type="text" value={newLink.cast} onChange={handleCastChange} placeholder="Ví dụ: 500.000 (Để trống = 0)" style={inputStyle}/></div>
                            <div style={{flex: 1}}><label style={labelStyle}>CMS (%)</label><input type="text" value={newLink.cms_brand} onChange={e => setNewLink({...newLink, cms_brand: e.target.value})} placeholder="10%" style={inputStyle}/></div>
                        </div>
                    </div>
                </div>
                <div style={{ textAlign: 'center', marginTop: '30px' }}>
                <button type="submit" disabled={isSubmitting} style={{ backgroundColor: '#D42426', color:'white', padding: '14px 60px', fontSize: '1.1rem', fontWeight:'bold', border:'none', borderRadius:'30px', cursor:'pointer', boxShadow:'0 4px 12px rgba(212, 36, 38, 0.3)' }}>{isSubmitting ? 'Đang lưu...' : '➕ THÊM LINK MỚI'}</button>
                </div>
            </form>
        </div>

        {/* CHARTS */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '30px', marginBottom: '30px' }}>
            <div style={cardStyle}>
                <h3 style={{ textAlign: 'center', color: '#165B33', fontSize: '1.3rem', marginBottom: '15px', fontWeight: '700' }}>📦 Tỷ Trọng (Link Air) - Sản phẩm</h3>
                <div style={{textAlign: 'center', marginBottom: '10px'}}><select value={chart1Brand} onChange={e => setChart1Brand(e.target.value)} style={{padding: '8px', fontSize: '0.95rem', borderRadius:'6px', border:'1px solid #ddd'}}><option value="All">Tất cả Brand</option>{brands.map(b => <option key={b.id} value={b.ten_brand}>{b.ten_brand}</option>)}</select></div>
                <div style={{ height: CHART_HEIGHT, position: 'relative' }}>
                    {dataChart1.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={dataChart1} cx={PIE_CX} cy={PIE_CY} labelLine={true} label={(props) => renderCustomLabel({...props, unit: ''})} outerRadius={OUTER_R} innerRadius={INNER_R} fill="#8884d8" dataKey="value">{dataChart1.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}</Pie><HardcodedCenterText value={totalChart1} /><Tooltip formatter={(value) => `${value} link`} /><Legend layout="horizontal" verticalAlign="bottom" align="center" wrapperStyle={{paddingTop: "20px"}} /></PieChart></ResponsiveContainer>
                    ) : <p style={{textAlign: 'center', color: '#999', marginTop:'150px'}}>Không có dữ liệu</p>}
                </div>
            </div>
            <div style={cardStyle}>
                <h3 style={{ textAlign: 'center', color: '#D42426', fontSize: '1.3rem', marginBottom: '15px', fontWeight: '700' }}>🎅 Năng Suất Nhân Sự - Tổng Link</h3>
                <div style={{textAlign: 'center', marginBottom: '10px'}}><select value={chart2Brand} onChange={e => setChart2Brand(e.target.value)} style={{padding: '8px', fontSize: '0.95rem', borderRadius:'6px', border:'1px solid #ddd'}}><option value="All">Theo tất cả Brand</option>{brands.map(b => <option key={b.id} value={b.ten_brand}>{b.ten_brand}</option>)}</select></div>
                <div style={{ height: CHART_HEIGHT, position: 'relative' }}>
                    {dataChart2.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={dataChart2} cx={PIE_CX} cy={PIE_CY} labelLine={true} label={(props) => renderCustomLabel({...props, unit: ''})} outerRadius={OUTER_R} innerRadius={INNER_R} fill="#8884d8" dataKey="value">{dataChart2.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}</Pie><HardcodedCenterText value={totalChart2} /><Tooltip formatter={(value) => `${value} link`} /><Legend layout="horizontal" verticalAlign="bottom" align="center" wrapperStyle={{paddingTop: "20px"}} /></PieChart></ResponsiveContainer>
                    ) : <p style={{textAlign: 'center', color: '#999', marginTop:'150px'}}>Không có dữ liệu</p>}
                </div>
            </div>
            <div style={cardStyle}>
                <h3 style={{ textAlign: 'center', color: '#F8B229', fontSize: '1.3rem', marginBottom: '15px', fontWeight: '700' }}>👤 Chi Tiết Nhân Sự - Sản phẩm</h3>
                <div style={{textAlign: 'center', marginBottom: '10px'}}><select value={chart3StaffId} onChange={e => setChart3StaffId(e.target.value)} style={{padding: '8px', fontSize: '0.95rem', borderRadius:'6px', border:'1px solid #ddd'}}><option value="">-- Chọn Nhân Sự Để Xem --</option>{nhanSus.map(ns => <option key={ns.id} value={ns.id}>{ns.ten_nhansu}</option>)}</select></div>
                <div style={{ height: CHART_HEIGHT, position: 'relative' }}>
                    {dataChart3.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={dataChart3} cx={PIE_CX} cy={PIE_CY} labelLine={true} label={(props) => renderCustomLabel({...props, unit: ''})} outerRadius={OUTER_R} innerRadius={INNER_R} fill="#8884d8" dataKey="value">{dataChart3.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}</Pie><HardcodedCenterText value={totalChart3} /><Tooltip formatter={(value) => `${value} link`} /><Legend layout="horizontal" verticalAlign="bottom" align="center" wrapperStyle={{paddingTop: "20px"}} /></PieChart></ResponsiveContainer>
                    ) : <div style={{textAlign: 'center', color: '#999', marginTop:'150px', fontSize:'1rem'}}>👈 Vui lòng chọn nhân sự</div>}
                </div>
            </div>
            <div style={cardStyle}>
                <h3 style={{ textAlign: 'center', color: '#165B33', fontSize: '1.3rem', marginBottom: '15px', fontWeight: '700' }}>💸 Ngân Sách Cast (VNĐ) - Tổng Chi</h3>
                <div style={{textAlign: 'center', marginBottom: '10px'}}><select value={chart4Brand} onChange={e => setChart4Brand(e.target.value)} style={{padding: '8px', fontSize: '0.95rem', borderRadius:'6px', border:'1px solid #ddd'}}><option value="All">Theo tất cả Brand</option>{brands.map(b => <option key={b.id} value={b.ten_brand}>{b.ten_brand}</option>)}</select></div>
                <div style={{ height: CHART_HEIGHT, position: 'relative' }}>
                    {dataChart4.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={dataChart4} cx={PIE_CX} cy={PIE_CY} labelLine={true} label={(props) => renderCustomLabel({...props, unit: 'đ'})} outerRadius={OUTER_R} innerRadius={INNER_R} fill="#8884d8" dataKey="value">{dataChart4.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}</Pie><HardcodedCenterText value={formatCompactNumber(totalChart4)} isMoney={true} /><Tooltip formatter={(value) => formatCurrency(value) + ' đ'} /><Legend layout="horizontal" verticalAlign="bottom" align="center" wrapperStyle={{paddingTop: "20px"}} /></PieChart></ResponsiveContainer>
                    ) : <p style={{textAlign: 'center', color: '#999', marginTop:'150px'}}>Không có dữ liệu</p>}
                </div>
            </div>
        </div>

        {/* BÁO CÁO HIỆU SUẤT */}
        <div style={cardStyle}>
            <h2 style={{ textAlign: 'center', color: '#333', fontSize:'1.4rem', marginBottom: '1.5rem', fontWeight:'800' }}>BÁO CÁO HIỆU SUẤT AIR LINKS</h2>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', justifyContent: 'center', marginBottom: '1.5rem' }}>
                <select value={airReportMonth} onChange={e => setAirReportMonth(e.target.value)} style={{ padding: '10px', border:'1px solid #ddd', borderRadius:'4px', fontSize:'1rem' }}>{Array.from({ length: 12 }, (_, i) => <option key={i+1} value={i+1}>Tháng {i+1}</option>)}</select>
                <input type="number" value={airReportYear} onChange={e => setAirReportYear(e.target.value)} style={{ width: '90px', padding: '10px', border:'1px solid #ddd', borderRadius:'4px', fontSize:'1rem' }} />
                <button onClick={handleGenerateAirLinksReport} disabled={isAirReportLoading} style={{ backgroundColor: '#165B33', color:'white', padding:'10px 25px', border:'none', borderRadius:'4px', cursor:'pointer', fontSize:'1rem', fontWeight:'bold' }}>{isAirReportLoading ? '...' : 'Xem Báo Cáo'}</button>
            </div>
            {airReportData.reportRows.length > 0 ? (
                <div style={{width: '100%', overflowX: 'auto'}}>
                <table style={{ width: '100%', borderCollapse:'collapse', fontSize:'0.95rem' }}>
                    <thead style={{backgroundColor:'#f9f9f9', borderBottom:'2px solid #eee'}}>
                    <tr><th onClick={() => requestAirSort('ten_nhansu')} style={{cursor:'pointer', padding:'14px', textAlign:'left'}}>Nhân Sự</th><th onClick={() => requestAirSort('sl_video_air')} style={{cursor:'pointer', textAlign: 'center', padding:'14px'}}>SL Video</th><th onClick={() => requestAirSort('chi_phi_cast')} style={{cursor:'pointer', textAlign: 'center', padding:'14px'}}>Chi Phí Cast</th>{airReportData.brandHeaders.map(brand => (<th key={brand} style={{textAlign: 'center', padding:'14px'}}>{brand}</th>))}</tr>
                    </thead>
                    <tbody>{sortedAirReportRows.map((item) => (<tr key={item.nhansu_id} style={{borderBottom:'1px solid #f0f0f0'}}><td style={{ fontWeight: 'bold', color: '#165B33', padding:'14px' }}>{item.ten_nhansu}</td><td style={{ textAlign: 'center', padding:'14px' }}>{item.sl_video_air}</td><td style={{ textAlign: 'center', padding:'14px' }}>{Math.round(item.chi_phi_cast).toLocaleString('vi-VN')} đ</td>{airReportData.brandHeaders.map(brand => (<td key={brand} style={{ textAlign: 'center', padding:'14px' }}>{item.brand_counts_air[brand] || 0}</td>))}</tr>))}</tbody>
                    <tfoot>{totalsRowAirReport && (<tr style={{backgroundColor: '#fff5f5', fontWeight: 'bold', color: '#D42426'}}><td style={{padding:'14px'}}>TỔNG CỘNG</td><td style={{ textAlign: 'center', padding:'14px' }}>{totalsRowAirReport.sl_video_air}</td><td style={{ textAlign: 'center', padding:'14px' }}>{Math.round(totalsRowAirReport.chi_phi_cast).toLocaleString('vi-VN')} đ</td>{airReportData.brandHeaders.map(brand => (<td key={brand} style={{ textAlign: 'center', padding:'14px' }}>{totalsRowAirReport.brand_counts_air[brand] || 0}</td>))}</tr>)}</tfoot>
                </table>
                </div>
            ) : <p style={{textAlign: 'center', color: '#999'}}>Chưa có dữ liệu báo cáo.</p>}
        </div>

        {/* DANH SÁCH LINK - TABLE ĐÃ UPDATE INLINE EDIT */}
        <div style={cardStyle}>
            <h2 style={{ textAlign: 'center', color: '#333', fontSize:'1.4rem', marginBottom: '1rem', fontWeight:'800' }}>DANH SÁCH LINK ĐÃ NHẬP</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                <input type="text" placeholder="Lọc ID Kênh..." value={filterAlKenh} onChange={e => setFilterAlKenh(e.target.value)} style={{padding:'10px', border:'1px solid #ddd', borderRadius:'4px'}} />
                <select value={filterAlBrand} onChange={e => setFilterAlBrand(e.target.value)} style={{padding:'10px', border:'1px solid #ddd', borderRadius:'4px'}}><option value="">Tất cả Brand</option>{brands.map(b => <option key={b.id} value={b.id}>{b.ten_brand}</option>)}</select>
                <select value={filterAlNhanSu} onChange={e => setFilterAlNhanSu(e.target.value)} style={{padding:'10px', border:'1px solid #ddd', borderRadius:'4px'}}><option value="">Tất cả Nhân sự</option>{nhanSus.map(ns => <option key={ns.id} value={ns.id}>{ns.ten_nhansu}</option>)}</select>
                <button onClick={clearAirLinkFilters} style={{backgroundColor: '#eee', border:'none', borderRadius:'4px', cursor:'pointer', fontWeight:'bold'}}>Xóa Lọc</button>
            </div>
            {isLoadingAirLinks ? <p>Đang tải...</p> : (
                <div style={{ width: '100%', overflow: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize:'0.95rem' }}>
                    <thead style={{backgroundColor:'#f0f0f0'}}>
                    <tr>
                        <th style={{padding:'12px', textAlign: 'center'}}>STT</th>
                        <th style={{padding:'12px', textAlign: 'left'}}>Link Air</th>
                        <th style={{padding:'12px', textAlign: 'center'}}>ID Kênh</th>
                        <th style={{padding:'12px', textAlign: 'center'}}>ID Video</th>
                        <th style={{padding:'12px', textAlign: 'center'}}>Brand</th>
                        <th style={{padding:'12px', textAlign: 'center'}}>Sản Phẩm</th>
                        <th style={{padding:'12px', textAlign: 'center'}}>CAST</th>
                        <th style={{padding:'12px', textAlign: 'center'}}>CMS</th>
                        <th style={{padding:'12px', textAlign: 'center'}}>Nhân Sự</th>
                        <th style={{padding:'12px', textAlign: 'center'}}>Hành Động</th>
                    </tr>
                    </thead>
                    <tbody>
                    {airLinks.map((link, index) => {
                        const isEditing = editingRowId === link.id; 

                        return (
                        <tr key={link.id} style={{borderBottom:'1px solid #eee', backgroundColor: isEditing ? '#fefce8' : 'transparent'}}>
                            <td style={{ textAlign: 'center', padding:'12px' }}>{airLinksTotalCount - ((airLinksCurrentPage - 1) * 500 + index)}</td>
                            
                            {/* LINK */}
                            <td style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding:'12px' }}>
                                {isEditing ? (
                                    <input type="text" value={editFormData.link_air_koc} onChange={(e) => handleEditFormChange(e, 'link_air_koc')} style={tableInputStyle} />
                                ) : (
                                    <a href={link.link_air_koc} target="_blank" rel="noopener noreferrer" style={{color: '#D42426'}}>{link.link_air_koc}</a>
                                )}
                            </td>
                            
                            {/* ID KÊNH */}
                            <td style={{textAlign: 'center', padding:'12px'}}>
                                {isEditing ? <input type="text" value={editFormData.id_kenh} onChange={(e) => handleEditFormChange(e, 'id_kenh')} style={tableInputStyle} /> : link.id_kenh}
                            </td>

                            {/* ID VIDEO */}
                            <td style={{textAlign: 'center', padding:'12px'}}>
                                {isEditing ? <input type="text" value={editFormData.id_video} onChange={(e) => handleEditFormChange(e, 'id_video')} style={tableInputStyle} /> : link.id_video}
                            </td>

                            {/* BRAND */}
                            <td style={{textAlign: 'center', padding:'12px'}}>
                                {isEditing ? (
                                    <select value={editFormData.brand_id} onChange={(e) => handleEditFormChange(e, 'brand_id')} style={tableInputStyle}>
                                        <option value="">--Brand--</option>
                                        {brands.map(b => <option key={b.id} value={b.id}>{b.ten_brand}</option>)}
                                    </select>
                                ) : link.brands?.ten_brand}
                            </td>

                            {/* SẢN PHẨM */}
                            <td style={{textAlign: 'center', padding:'12px'}}>
                                {isEditing ? (
                                    <select value={editFormData.san_pham} onChange={(e) => handleEditFormChange(e, 'san_pham')} style={tableInputStyle}>
                                        <option value="">--SP--</option>
                                        {PRODUCT_OPTIONS.map(prod => (<option key={prod} value={prod}>{prod}</option>))}
                                    </select>
                                ) : link.san_pham}
                            </td>

                            {/* CAST (Đã áp dụng Highlight đỏ nếu có tiền) */}
                            <td style={{textAlign: 'center', padding:'12px'}}>
                                {isEditing ? <input type="text" value={editFormData.cast} onChange={(e) => handleEditFormChange(e, 'cast')} style={tableInputStyle} /> : renderCast(link.cast)}
                            </td>
                            
                            {/* CMS */}
                            <td style={{textAlign: 'center', padding:'12px'}}>
                                {isEditing ? (
                                    <input type="text" value={editFormData.cms_brand} onChange={(e) => handleEditFormChange(e, 'cms_brand')} style={tableInputStyle} placeholder="10%" />
                                ) : (
                                    renderCMS(link.cms_brand)
                                )}
                            </td>

                            {/* NHÂN SỰ */}
                            <td style={{textAlign: 'center', padding:'12px'}}>
                                {isEditing ? (
                                    <select value={editFormData.nhansu_id} onChange={(e) => handleEditFormChange(e, 'nhansu_id')} style={tableInputStyle}>
                                        <option value="">--Nhân sự--</option>
                                        {nhanSus.map(ns => <option key={ns.id} value={ns.id}>{ns.ten_nhansu}</option>)}
                                    </select>
                                ) : link.nhansu?.ten_nhansu}
                            </td>

                            {/* HÀNH ĐỘNG */}
                            <td style={{ textAlign: 'center', padding:'12px' }}>
                                <div style={{display: 'flex', justifyContent: 'center', gap: '5px'}}>
                                    {isEditing ? (
                                        <>
                                            <button onClick={handleSaveClick} style={{padding: '6px 12px', backgroundColor: '#165B33', border:'none', color:'white', fontSize: '12px', borderRadius:'4px', cursor:'pointer', fontWeight:'bold'}}>Lưu</button>
                                            <button onClick={handleCancelClick} style={{padding: '6px 12px', backgroundColor: '#777', border:'none', color:'white', fontSize: '12px', borderRadius:'4px', cursor:'pointer', fontWeight:'bold'}}>Hủy</button>
                                        </>
                                    ) : (
                                        <>
                                            <button onClick={() => handleEditClick(link)} style={{padding: '6px 12px', backgroundColor: '#fff', border:'1px solid #1976D2', color:'#1976D2', fontSize: '12px', borderRadius:'4px', cursor:'pointer', fontWeight:'bold'}}>Sửa</button>
                                            <button onClick={() => handleDeleteAirLink(link.id, link.link_air_koc)} style={{padding: '6px 12px', backgroundColor: '#fff', border:'1px solid #D42426', color:'#D42426', fontSize: '12px', borderRadius:'4px', cursor:'pointer', fontWeight:'bold'}}>Xóa</button>
                                        </>
                                    )}
                                </div>
                            </td>
                        </tr>
                    )})}
                    </tbody>
                </table>
                </div>
            )}
            <div style={{ textAlign: 'center', marginTop: '25px' }}>
                <button onClick={() => setAirLinksCurrentPage(prev => Math.max(1, prev - 1))} disabled={airLinksCurrentPage===1} style={{padding:'8px 20px', cursor:'pointer', marginRight:'10px'}}>Trước</button><span style={{margin: '0 15px', fontWeight: 'bold'}}>Trang {airLinksCurrentPage} / {totalPagesAirLinks}</span><button onClick={() => setAirLinksCurrentPage(prev => Math.min(totalPagesAirLinks, prev + 1))} disabled={airLinksCurrentPage===totalPagesAirLinks} style={{padding:'8px 20px', cursor:'pointer', marginLeft:'10px'}}>Sau</button>
            </div>
        </div>
    </>
  );
};

export default AirLinksTab;