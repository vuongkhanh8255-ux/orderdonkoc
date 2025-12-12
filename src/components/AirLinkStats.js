import React, { useState, useMemo } from 'react';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#AF19FF', '#FF4560', '#775DD0', '#00E396'];

const renderCustomLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }) => {
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + radius * Math.cos(-midAngle * Math.PI / 180);
  const y = cy + radius * Math.sin(-midAngle * Math.PI / 180);
  return (
    <text x={x} y={y} fill="white" textAnchor={x > cx ? 'start' : 'end'} dominantBaseline="central">
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
};

const AirLinkStats = ({ data, brands, nhanSus }) => {
  // State cho bộ lọc
  const [filterBrand1, setFilterBrand1] = useState('All'); // Cho biểu đồ 1
  const [filterBrand2, setFilterBrand2] = useState('All'); // Cho biểu đồ 2
  const [filterStaff3, setFilterStaff3] = useState(nhanSus[0]?.ten_nhansu || ''); // Cho biểu đồ 3
  const [filterBrand4, setFilterBrand4] = useState('All'); // Cho biểu đồ 4

  // --- LOGIC TÍNH TOÁN DỮ LIỆU ---

  // 1. Biểu đồ Sản phẩm (Lọc theo Brand)
  const dataChart1 = useMemo(() => {
    let filtered = filterBrand1 === 'All' ? data : data.filter(d => d.brand === filterBrand1);
    const counts = {};
    filtered.forEach(item => {
      const key = item.san_pham || 'Khác';
      counts[key] = (counts[key] || 0) + 1;
    });
    return Object.keys(counts).map(key => ({ name: key, value: counts[key] }));
  }, [data, filterBrand1]);

  // 2. Biểu đồ Nhân sự (Lọc theo Brand)
  const dataChart2 = useMemo(() => {
    let filtered = filterBrand2 === 'All' ? data : data.filter(d => d.brand === filterBrand2);
    const counts = {};
    filtered.forEach(item => {
      const key = item.nhan_su || 'Ẩn danh';
      counts[key] = (counts[key] || 0) + 1;
    });
    return Object.keys(counts).map(key => ({ name: key, value: counts[key] }));
  }, [data, filterBrand2]);

  // 3. Biểu đồ Chi tiết Nhân sự (Lọc theo Tên Nhân sự)
  const dataChart3 = useMemo(() => {
    if (!filterStaff3) return [];
    let filtered = data.filter(d => d.nhan_su === filterStaff3);
    const counts = {};
    filtered.forEach(item => {
      const key = item.san_pham || 'Khác';
      counts[key] = (counts[key] || 0) + 1;
    });
    return Object.keys(counts).map(key => ({ name: key, value: counts[key] }));
  }, [data, filterStaff3]);

  // 4. Biểu đồ Chi phí Cast (Lọc theo Brand)
  const dataChart4 = useMemo(() => {
    let filtered = filterBrand4 === 'All' ? data : data.filter(d => d.brand === filterBrand4);
    const costMap = {};
    filtered.forEach(item => {
      const key = item.san_pham || 'Khác';
      // Xử lý chuyển đổi tiền tệ nếu cần (giả sử cast lưu dạng số)
      const cost = Number(item.cast) || 0; 
      costMap[key] = (costMap[key] || 0) + cost;
    });
    return Object.keys(costMap).map(key => ({ name: key, value: costMap[key] }));
  }, [data, filterBrand4]);

  // Component biểu đồ chung để tái sử dụng
  const CustomPieChart = ({ data, unit = "" }) => (
    <ResponsiveContainer width="100%" height={300}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          labelLine={false}
          label={renderCustomLabel}
          outerRadius={100}
          fill="#8884d8"
          dataKey="value"
        >
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip formatter={(value) => unit === 'đ' ? value.toLocaleString() + ' đ' : value + ' ' + unit} />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  );

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '20px', marginBottom: '30px' }}>
      
      {/* --- CHART 1: Tỷ trọng Sản phẩm --- */}
      <div className="christmas-card" style={{ padding: '20px' }}>
        <h3 style={{ textAlign: 'center', color: '#165B33', marginBottom: '10px' }}>🍰 Tỷ Trọng Sản Phẩm</h3>
        <div style={{ textAlign: 'center', marginBottom: '10px' }}>
          <select value={filterBrand1} onChange={e => setFilterBrand1(e.target.value)} style={{ padding: '5px' }}>
            <option value="All">Toàn bộ Brand</option>
            {brands.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>
        {dataChart1.length > 0 ? <CustomPieChart data={dataChart1} unit="lần" /> : <p style={{textAlign: 'center'}}>Không có dữ liệu</p>}
      </div>

      {/* --- CHART 2: Tỷ trọng Nhân sự --- */}
      <div className="christmas-card" style={{ padding: '20px' }}>
        <h3 style={{ textAlign: 'center', color: '#D42426', marginBottom: '10px' }}>🎅 Năng Suất Nhân Sự</h3>
        <div style={{ textAlign: 'center', marginBottom: '10px' }}>
          <select value={filterBrand2} onChange={e => setFilterBrand2(e.target.value)} style={{ padding: '5px' }}>
            <option value="All">Theo toàn bộ Brand</option>
            {brands.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>
        {dataChart2.length > 0 ? <CustomPieChart data={dataChart2} unit="link" /> : <p style={{textAlign: 'center'}}>Không có dữ liệu</p>}
      </div>

      {/* --- CHART 3: Chi tiết từng bạn --- */}
      <div className="christmas-card" style={{ padding: '20px' }}>
        <h3 style={{ textAlign: 'center', color: '#F8B229', marginBottom: '10px' }}>👤 Soi Chi Tiết Nhân Sự</h3>
        <div style={{ textAlign: 'center', marginBottom: '10px' }}>
          <select value={filterStaff3} onChange={e => setFilterStaff3(e.target.value)} style={{ padding: '5px' }}>
             <option value="">-- Chọn nhân sự --</option>
            {nhanSus.map(ns => <option key={ns.id} value={ns.ten_nhansu}>{ns.ten_nhansu}</option>)}
          </select>
        </div>
        {dataChart3.length > 0 ? <CustomPieChart data={dataChart3} unit="lần" /> : <p style={{textAlign: 'center'}}>Chưa chọn nhân sự hoặc không có dữ liệu</p>}
      </div>

      {/* --- CHART 4: Chi phí Cast --- */}
      <div className="christmas-card" style={{ padding: '20px' }}>
        <h3 style={{ textAlign: 'center', color: '#165B33', marginBottom: '10px' }}>💸 Ngân Sách Cast (VND)</h3>
        <div style={{ textAlign: 'center', marginBottom: '10px' }}>
          <select value={filterBrand4} onChange={e => setFilterBrand4(e.target.value)} style={{ padding: '5px' }}>
            <option value="All">Toàn bộ Brand</option>
            {brands.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>
        {dataChart4.length > 0 ? <CustomPieChart data={dataChart4} unit="đ" /> : <p style={{textAlign: 'center'}}>Không có dữ liệu chi phí</p>}
      </div>

    </div>
  );
};

export default AirLinkStats;