// src/components/DashboardTab.jsx

import React, { useMemo, useState, useEffect } from 'react';
import { useAppData } from '../context/AppDataContext';
import { supabase } from '../supabaseClient';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, LabelList } from 'recharts';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d', '#ffc658', '#d0ed57', '#a4de6c', '#d0ed57'];

const DashboardTab = () => {
  const { brands, nhanSus, airReportMonth, setAirReportMonth, airReportYear, setAirReportYear } = useAppData();

  // STATE DỮ LIỆU
  const [rawBookings, setRawBookings] = useState([]);
  const [rawAirLinks, setRawAirLinks] = useState([]);
  const [loading, setLoading] = useState(false);
  
  // BỘ LỌC CHUNG
  const [filterBrand, setFilterBrand] = useState('');
  const [filterNhanSu, setFilterNhanSu] = useState(''); 

  // TẢI DỮ LIỆU
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
  const formatMoneyShort = (value) => {
    if (value >= 1000000000) return (value / 1000000000).toFixed(1).replace('.', ',') + ' tỷ';
    if (value >= 1000000) return (value / 1000000).toFixed(1).replace('.', ',') + 'tr';
    return new Intl.NumberFormat('vi-VN').format(value);
  };

  // --- LỌC DỮ LIỆU ---
  const filterData = (data, dateField) => {
      return data.filter(item => {
          const dateStr = item[dateField] || item.created_at;
          if (!dateStr) return false;
          
          const y = parseInt(dateStr.substring(0, 4));
          const m = parseInt(dateStr.substring(5, 7));
          
          if (m !== parseInt(airReportMonth) || y !== parseInt(airReportYear)) return false;
          if (filterBrand && String(item.brand_id) !== String(filterBrand)) return false;
          if (filterNhanSu && String(item.nhansu_id) !== String(filterNhanSu)) return false;
          return true;
      });
  };

  const filteredBookings = useMemo(() => filterData(rawBookings, 'ngay_gui_don'), [rawBookings, airReportMonth, airReportYear, filterBrand, filterNhanSu]);
  const filteredAirLinks = useMemo(() => filterData(rawAirLinks, 'ngay_air'), [rawAirLinks, airReportMonth, airReportYear, filterBrand, filterNhanSu]);

  // --- TÍNH TOÁN DATA ---

  // 1. Link Air -> Sản phẩm
  const chart1Data = useMemo(() => {
      const map = {};
      filteredAirLinks.forEach(i => { const k = i.san_pham || 'SP Khác'; map[k] = (map[k] || 0) + 1; });
      return Object.keys(map).map(k => ({ name: k, value: map[k] })).sort((a,b) => b.value - a.value);
  }, [filteredAirLinks]);

  // 2. Booking -> Brand
  const chart2Data = useMemo(() => {
      const map = {};
      filteredBookings.forEach(i => { const k = getBrandName(i.brand_id); map[k] = (map[k] || 0) + 1; });
      return Object.keys(map).map(k => ({ name: k, value: map[k] })).sort((a,b) => b.value - a.value);
  }, [filteredBookings, brands]);

  // 3. Năng suất -> Nhân sự
  const chart3Data = useMemo(() => {
      const map = {};
      filteredAirLinks.forEach(i => { const k = getNhanSuName(i.nhansu_id); map[k] = (map[k] || 0) + 1; });
      return Object.keys(map).map(k => ({ name: k, value: map[k] })).sort((a,b) => b.value - a.value);
  }, [filteredAirLinks, nhanSus]);

  // 5. Ngân sách -> Brand
  const chart5Data = useMemo(() => {
      const map = {};
      filteredAirLinks.forEach(i => { const k = getBrandName(i.brand_id); map[k] = (map[k] || 0) + parseFloat(i.cast || 0); });
      return Object.keys(map).map(k => ({ name: k, value: map[k] })).filter(i => i.value > 0).sort((a,b) => b.value - a.value);
  }, [filteredAirLinks, brands]);

  // 6. Chi phí TB
  const chart6Data = useMemo(() => {
      let tCast = 0;
      let tVid = filteredAirLinks.length;
      filteredAirLinks.forEach(i => tCast += parseFloat(i.cast || 0));
      const avg = tVid > 0 ? tCast / tVid : 0;
      return [{ name: 'DỰ KIẾN', value: 200000, fill: '#FFDDC1' }, { name: 'THỰC TẾ', value: avg, fill: '#FF6B6B' }];
  }, [filteredAirLinks]);


  // --- CHART BOX (Nhánh chỉa ra + Chữ to + Số giữa tâm) ---
  const ChartBox = ({ data, title, unit, isMoney }) => {
    const total = data.reduce((s, i) => s + i.value, 0);
    const displayTotal = isMoney ? formatMoneyShort(total) : formatNumber(total);

    return (
        <div className="christmas-card" style={{ height: '420px', backgroundColor: '#fff', borderRadius: '12px', padding: '15px', boxShadow: '0 4px 10px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column' }}>
            <h4 style={{ textAlign: 'center', color: '#165B33', marginBottom: '10px', fontSize: '16px', fontWeight: '800', textTransform: 'uppercase' }}>{title}</h4>
            
            <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
                {/* SỐ TỔNG CĂN GIỮA TUYỆT ĐỐI */}
                <div style={{ 
                    position: 'absolute', 
                    inset: 0, 
                    display: 'flex', 
                    flexDirection: 'column', 
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    pointerEvents: 'none', 
                    zIndex: 0 
                }}>
                    <span style={{ fontSize: '28px', fontWeight: '800', color: '#333', lineHeight: 1 }}>{displayTotal}</span>
                    <span style={{ fontSize: '13px', color: '#888' }}>{unit}</span>
                </div>

                <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                        <Pie 
                            data={data} 
                            cx="50%" 
                            cy="50%" 
                            innerRadius={70} 
                            outerRadius={90} 
                            paddingAngle={2} 
                            dataKey="value"
                            // HIỆN NHÁNH CHỈA RA (Label Line)
                            label={({ name, value, percent }) => `${name}: ${formatNumber(value)} (${(percent * 100).toFixed(0)}%)`}
                            labelLine={true}
                        >
                            {data.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                        </Pie>
                        <Tooltip formatter={(val) => isMoney ? formatMoney(val) : formatNumber(val)} />
                    </PieChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
  };

  return (
    <div style={{ padding: '10px' }}>
      
      {/* --- FILTER BAR (ĐÃ SỬA CĂN CHỈNH THẲNG HÀNG) --- */}
      <div style={{ 
          marginBottom: '20px', 
          padding: '15px', 
          background: '#fff', 
          borderRadius: '12px', 
          display: 'flex', 
          alignItems: 'center', 
          gap: '20px', // Khoảng cách giữa các nhóm
          borderLeft: '5px solid #165B33',
          overflowX: 'auto', // Cuộn ngang nếu màn hình quá nhỏ
          whiteSpace: 'nowrap' // Bắt buộc không xuống dòng
      }}>
          {/* Nhóm Thời gian */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontWeight: 'bold' }}>📅 Thời gian:</span>
              <select value={airReportMonth} onChange={e => setAirReportMonth(e.target.value)} style={{ padding: '6px', borderRadius: '4px', border: '1px solid #ccc', cursor: 'pointer' }}>
                  {Array.from({length: 12}, (_, i) => <option key={i+1} value={i+1}>Tháng {i+1}</option>)}
              </select>
              <input type="number" value={airReportYear} onChange={e => setAirReportYear(e.target.value)} style={{ width: '70px', padding: '6px', borderRadius: '4px', border: '1px solid #ccc' }} />
          </div>
          
          {/* Nhóm Lọc Chung */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontWeight: 'bold' }}>🔍 Lọc Chung:</span>
              <select value={filterBrand} onChange={e => setFilterBrand(e.target.value)} style={{ padding: '6px', borderRadius: '4px', border: '1px solid #ccc', minWidth: '180px', cursor: 'pointer' }}>
                  <option value="">-- Tất cả Brand --</option>
                  {brands.map(b => <option key={b.id} value={b.id}>{b.ten_brand}</option>)}
              </select>
              <select value={filterNhanSu} onChange={e => setFilterNhanSu(e.target.value)} style={{ padding: '6px', borderRadius: '4px', border: '1px solid #ccc', minWidth: '180px', cursor: 'pointer' }}>
                  <option value="">-- Tất cả Nhân sự --</option>
                  {nhanSus.map(n => <option key={n.id} value={n.id}>{n.ten_nhansu}</option>)}
              </select>
          </div>

          {loading && <span style={{color:'green', fontWeight:'bold', marginLeft:'auto'}}>⏳ Đang tải...</span>}
      </div>


      <h2 style={{ textAlign: 'center', color: '#fff', marginBottom: '20px', textTransform: 'uppercase', textShadow: '0 2px 4px rgba(0,0,0,0.3)' }}>
          TỔNG QUAN HIỆU SUẤT (Tháng {airReportMonth}/{airReportYear})
      </h2>

      {/* HÀNG 1 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '15px', marginBottom: '15px' }}>
          <ChartBox data={chart1Data} title="📦 Tỷ Trọng Sản Phẩm (Link Air)" unit="Links" />
          <ChartBox data={chart2Data} title="🔥 Tỷ Trọng Booking (Đơn hàng)" unit="Booking" />
          <ChartBox data={chart3Data} title="👷 Năng Suất Nhân Sự (Link Air)" unit="Links" />
      </div>

      {/* HÀNG 2: 5 & 6 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '15px' }}>
          
          {/* Chart 5: Ngân sách */}
          <ChartBox data={chart5Data} title="💸 Ngân Sách Đã Chi (Theo Brand)" unit="VNĐ" isMoney={true} />

          {/* Chart 6: Chi phí TB */}
          <div className="christmas-card" style={{ height: '420px', backgroundColor: '#fff', borderRadius: '12px', padding: '15px', boxShadow: '0 4px 10px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column' }}>
              <h4 style={{ textAlign: 'center', color: '#165B33', marginBottom: '10px', fontSize: '16px', fontWeight: '800', textTransform: 'uppercase' }}>
                  💰 Chi Phí Trung Bình / 1 Video
              </h4>
              <div style={{ flex: 1 }}>
                  <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chart6Data} barCategoryGap="30%" margin={{ top: 30, right: 10, left: 10, bottom: 0 }}>
                          <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 11, fontWeight: 'bold', dy: 10}} />
                          <Tooltip formatter={(value) => formatMoney(value)} cursor={{fill: 'transparent'}} />
                          <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                              {chart6Data.map((entry, index) => (
                                  <Cell key={`cell-${index}`} fill={entry.fill} />
                              ))}
                              <LabelList 
                                  dataKey="value" 
                                  position="top" 
                                  formatter={(val) => formatMoney(val)} 
                                  style={{ fontWeight: 'bold', fontSize: '12px', fill: '#333' }} 
                              />
                          </Bar>
                      </BarChart>
                  </ResponsiveContainer>
              </div>
              {/* Spacer */}
              <div style={{ height: '30px' }}></div>
          </div>

          {/* Ô TRỐNG */}
          <div></div> 
      </div>
    </div>
  );
};

export default DashboardTab;