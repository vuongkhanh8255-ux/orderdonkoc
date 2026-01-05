// src/components/DashboardTab.jsx

import React, { useMemo, useState, useEffect } from 'react';
import { useAppData } from '../context/AppDataContext';
import { supabase } from '../supabaseClient';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, LabelList, Legend } from 'recharts';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d', '#ffc658', '#d0ed57', '#a4de6c', '#d0ed57'];

const DashboardTab = () => {
  const { brands, nhanSus, airReportMonth, setAirReportMonth, airReportYear, setAirReportYear } = useAppData();

  // STATE
  const [rawBookings, setRawBookings] = useState([]);
  const [rawAirLinks, setRawAirLinks] = useState([]);
  const [loading, setLoading] = useState(false);
  
  // FILTER
  const [filterBrand, setFilterBrand] = useState('');
  const [filterNhanSu, setFilterNhanSu] = useState(''); 

  // LOAD DATA
  useEffect(() => {
    const fetchData = async () => {
        setLoading(true);
        const { data: bookingData } = await supabase.from('bookings').select('*');
        if (bookingData) setRawBookings(bookingData);

        const { data: airData } = await supabase.from('air_links').select('*');
        if (airData) setRawAirLinks(airData);
        setLoading(false);
    };
    fetchData();
  }, []);

  // --- HELPER FORMAT ---
  const getBrandName = (id) => brands.find(b => String(b.id) === String(id))?.ten_brand || 'Khác';
  const getNhanSuName = (id) => nhanSus.find(n => String(n.id) === String(id))?.ten_nhansu || 'Khác';
  const formatMoney = (val) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(val);
  const formatNumber = (val) => new Intl.NumberFormat('vi-VN').format(val);
  
  // Format tiền rút gọn (10.2tr)
  const formatMoneyShort = (val) => {
    if (!val) return '0';
    if (val >= 1000000000) return (val / 1000000000).toFixed(1).replace('.', ',') + ' tỷ';
    if (val >= 1000000) return (val / 1000000).toFixed(1).replace('.', ',') + 'tr';
    return new Intl.NumberFormat('vi-VN').format(val);
  };

  // --- HÀM LỌC "NỒI ĐỒNG CỐI ĐÁ" (FIX LỆCH 500K) ---
  // Không dùng new Date() nữa vì dễ lệch múi giờ.
  // Dùng so sánh chuỗi (String) để khớp 100% với dữ liệu gốc.
  const filterData = (data, dateField) => {
      return data.filter(item => {
          // Lấy chuỗi ngày, ví dụ: "2025-12-05T..." hoặc "2025-12-05"
          const dateStr = item[dateField] || item.created_at; 
          if (!dateStr) return false;

          // Tạo chuỗi "YYYY-MM" cần tìm. Ví dụ: "2025-12"
          // padStart(2, '0') để đảm bảo tháng 1 là "01"
          const targetString = `${airReportYear}-${String(airReportMonth).padStart(2, '0')}`;

          // Kiểm tra xem ngày của item có BẮT ĐẦU bằng chuỗi đó không
          // Ví dụ: "2025-12-05" bắt đầu bằng "2025-12" -> ĐÚNG
          if (!dateStr.startsWith(targetString)) return false;

          // Các bộ lọc khác (Brand, Nhân sự)
          if (filterBrand && String(item.brand_id) !== String(filterBrand)) return false;
          if (filterNhanSu && String(item.nhansu_id) !== String(filterNhanSu)) return false;
          
          return true;
      });
  };

  const filteredBookings = useMemo(() => filterData(rawBookings, 'ngay_gui_don'), [rawBookings, airReportMonth, airReportYear, filterBrand, filterNhanSu]);
  const filteredAirLinks = useMemo(() => filterData(rawAirLinks, 'ngay_air'), [rawAirLinks, airReportMonth, airReportYear, filterBrand, filterNhanSu]);

  // --- CHART DATA ---
  const chart1Data = useMemo(() => {
      const map = {};
      filteredAirLinks.forEach(i => { const k = i.san_pham || 'SP Khác'; map[k] = (map[k] || 0) + 1; });
      return Object.keys(map).map(k => ({ name: k, value: map[k] })).sort((a,b) => b.value - a.value);
  }, [filteredAirLinks]);

  const chart2Data = useMemo(() => {
      const map = {};
      filteredBookings.forEach(i => { const k = getBrandName(i.brand_id); map[k] = (map[k] || 0) + 1; });
      return Object.keys(map).map(k => ({ name: k, value: map[k] })).sort((a,b) => b.value - a.value);
  }, [filteredBookings, brands]);

  const chart3Data = useMemo(() => {
      const map = {};
      filteredAirLinks.forEach(i => { const k = getNhanSuName(i.nhansu_id); map[k] = (map[k] || 0) + 1; });
      return Object.keys(map).map(k => ({ name: k, value: map[k] })).sort((a,b) => b.value - a.value);
  }, [filteredAirLinks, nhanSus]);

  const chart5Data = useMemo(() => {
      const map = {};
      filteredAirLinks.forEach(i => { const k = getBrandName(i.brand_id); map[k] = (map[k] || 0) + parseFloat(i.cast || 0); });
      return Object.keys(map).map(k => ({ name: k, value: map[k] })).filter(i => i.value > 0).sort((a,b) => b.value - a.value);
  }, [filteredAirLinks, brands]);

  const chart6Data = useMemo(() => {
      let tCast = 0;
      let tVid = filteredAirLinks.length;
      filteredAirLinks.forEach(i => tCast += parseFloat(i.cast || 0));
      const avg = tVid > 0 ? tCast / tVid : 0;
      return [{ name: 'DỰ KIẾN', value: 200000, fill: '#FFDDC1' }, { name: 'THỰC TẾ', value: avg, fill: '#FF6B6B' }];
  }, [filteredAirLinks]);


  // --- CHART BOX (ĐÃ CĂN TÂM + VIỀN BÌNH THƯỜNG + CÓ CHÚ THÍCH) ---
  const ChartBox = ({ data, title, unit, isMoney }) => {
    const total = data.reduce((s, i) => s + i.value, 0);
    const displayTotal = isMoney ? formatMoneyShort(total) : formatNumber(total);

    return (
        <div className="christmas-card" style={{ height: '450px', backgroundColor: '#fff', borderRadius: '16px', padding: '20px', boxShadow: '0 8px 25px rgba(0,0,0,0.1)', display: 'flex', flexDirection: 'column' }}>
            <h4 style={{ textAlign: 'center', color: '#165B33', marginBottom: '15px', fontSize: '15px', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{title}</h4>
            
            <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
                {/* SỐ TỔNG CĂN GIỮA TUYỆT ĐỐI */}
                {/* top: 45% để khớp với tâm biểu đồ Pie */}
                <div style={{ 
                    position: 'absolute', 
                    top: '45%', 
                    left: '50%', 
                    transform: 'translate(-50%, -50%)', 
                    display: 'flex', 
                    flexDirection: 'column', 
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    pointerEvents: 'none', 
                    zIndex: 0 
                }}>
                    <span style={{ fontSize: '28px', fontWeight: '800', color: '#333', lineHeight: 1 }}>{displayTotal}</span>
                    <span style={{ fontSize: '13px', color: '#888', marginTop: '5px' }}>{unit}</span>
                </div>

                <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                        {/* innerRadius=70: Viền mỏng vừa phải, đẹp */}
                        {/* cy="45%": Đẩy biểu đồ lên để nhường chỗ cho Legend ở dưới */}
                        <Pie 
                            data={data} 
                            cx="50%" 
                            cy="45%" 
                            innerRadius={70} 
                            outerRadius={90} 
                            paddingAngle={3} 
                            dataKey="value"
                            label={({ name, value, percent }) => `${name}: ${formatNumber(value)} (${(percent * 100).toFixed(0)}%)`}
                            labelLine={true}
                        >
                            {data.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                        </Pie>
                        <Tooltip formatter={(val) => isMoney ? formatMoney(val) : formatNumber(val)} contentStyle={{borderRadius:'8px', border:'none', boxShadow:'0 4px 12px rgba(0,0,0,0.15)'}} />
                        
                        {/* CHÚ THÍCH (LEGEND) NẰM DƯỚI */}
                        <Legend iconType="circle" layout="horizontal" verticalAlign="bottom" align="center" wrapperStyle={{ fontSize: '11px', paddingTop: '0px' }} />
                    </PieChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
  };

  // --- STYLE ---
  const filterContainerStyle = {
      marginBottom: '30px',
      padding: '15px 25px',
      background: '#fff',
      borderRadius: '16px',
      display: 'flex',
      alignItems: 'center',
      gap: '30px',
      boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)',
      flexWrap: 'wrap',
      zIndex: 20,
      position: 'relative'
  };

  const inputStyle = {
      height: '42px',
      padding: '0 15px',
      borderRadius: '10px',
      border: '1px solid #d1d5db',
      backgroundColor: '#fff',
      color: '#1f2937',
      fontSize: '14px',
      fontWeight: '600',
      outline: 'none',
      cursor: 'pointer'
  };

  const labelStyle = { fontWeight: '800', color: '#165B33', fontSize: '13px', textTransform: 'uppercase', whiteSpace: 'nowrap' };

  return (
    <div style={{ padding: '20px', position: 'relative', zIndex: 1 }}>
      
      {/* FILTER BAR */}
      <div style={filterContainerStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={labelStyle}>📅 Thời gian:</span>
              <select value={airReportMonth} onChange={e => setAirReportMonth(e.target.value)} style={{ ...inputStyle, width: '130px' }}>
                  {Array.from({length: 12}, (_, i) => <option key={i+1} value={i+1}>Tháng {i+1}</option>)}
              </select>
              <input type="number" value={airReportYear} onChange={e => setAirReportYear(e.target.value)} style={{ ...inputStyle, width: '80px', textAlign: 'center' }} />
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, borderLeft: '2px solid #eee', paddingLeft: '30px' }}>
              <span style={labelStyle}>🔍 Lọc:</span>
              <select value={filterBrand} onChange={e => setFilterBrand(e.target.value)} style={{ ...inputStyle, flex: 1, minWidth: '160px' }}>
                  <option value="">-- Tất cả Brand --</option>
                  {brands.map(b => <option key={b.id} value={b.id}>{b.ten_brand}</option>)}
              </select>
              <select value={filterNhanSu} onChange={e => setFilterNhanSu(e.target.value)} style={{ ...inputStyle, flex: 1, minWidth: '160px' }}>
                  <option value="">-- Tất cả Nhân sự --</option>
                  {nhanSus.map(n => <option key={n.id} value={n.id}>{n.ten_nhansu}</option>)}
              </select>
          </div>
          {loading && <span style={{color:'#165B33', fontWeight:'bold', fontSize:'13px', marginLeft: 'auto'}}>⏳ Đang tải...</span>}
      </div>

      {/* TIÊU ĐỀ TRẮNG ĐẬM */}
      <div style={{ textAlign: 'center', marginBottom: '35px' }}>
          <div style={{ 
              color: '#FFFFFF',
              fontSize: '32px', 
              fontWeight: '900',
              textTransform: 'uppercase', 
              letterSpacing: '1px',
              fontFamily: 'Arial, sans-serif'
          }}>
              TỔNG QUAN HIỆU SUẤT (Tháng {airReportMonth}/{airReportYear})
          </div>
      </div>

      {/* HÀNG 1 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '25px', marginBottom: '25px' }}>
          <ChartBox data={chart1Data} title="📦 Tỷ Trọng Sản Phẩm (Link Air)" unit="Links" />
          <ChartBox data={chart2Data} title="🔥 Tỷ Trọng Booking (Đơn hàng)" unit="Booking" />
          <ChartBox data={chart3Data} title="👷 Năng Suất Nhân Sự (Link Air)" unit="Links" />
      </div>

      {/* HÀNG 2 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '25px' }}>
          
          <ChartBox data={chart5Data} title="💸 Ngân Sách Đã Chi (Theo Brand)" unit="VNĐ" isMoney={true} />

          {/* Biểu đồ Cột */}
          <div className="christmas-card" style={{ height: '450px', backgroundColor: '#fff', borderRadius: '16px', padding: '20px', boxShadow: '0 8px 25px rgba(0,0,0,0.1)', display: 'flex', flexDirection: 'column' }}>
              <h4 style={{ textAlign: 'center', color: '#165B33', marginBottom: '15px', fontSize: '15px', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  💰 Chi Phí Trung Bình / 1 Video
              </h4>
              <div style={{ flex: 1 }}>
                  <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chart6Data} barCategoryGap="30%" margin={{ top: 30, right: 10, left: 10, bottom: 0 }}>
                          <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 11, fontWeight: 'bold', dy: 10}} />
                          <Tooltip formatter={(value) => formatMoney(value)} cursor={{fill: 'transparent', opacity: 0.1}} contentStyle={{borderRadius:'8px', border:'none', boxShadow:'0 4px 12px rgba(0,0,0,0.15)'}} />
                          <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                              {chart6Data.map((entry, index) => (
                                  <Cell key={`cell-${index}`} fill={entry.fill} />
                              ))}
                              <LabelList dataKey="value" position="top" formatter={(val) => formatMoney(val)} style={{ fontWeight: 'bold', fontSize: '12px', fill: '#333' }} />
                          </Bar>
                      </BarChart>
                  </ResponsiveContainer>
              </div>
          </div>

          <div></div>
      </div>
    </div>
  );
};

export default DashboardTab;