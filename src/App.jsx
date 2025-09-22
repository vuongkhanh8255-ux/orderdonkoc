import { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { CSVLink } from "react-csv";

function App() {
  // State cho form
  const [isLoading, setIsLoading] = useState(false);
  const [hoTen, setHoTen] = useState('');
  const [idKenh, setIdKenh] = useState('');
  const [sdt, setSdt] = useState('');
  const [diaChi, setDiaChi] = useState('');
  const [cccd, setCccd] = useState('');
  const [brands, setBrands] = useState([]);
  const [nhanSus, setNhanSus] = useState([]);
  const [sanPhams, setSanPhams] = useState([]);
  const [selectedBrand, setSelectedBrand] = useState('');
  const [selectedSanPhams, setSelectedSanPhams] = useState([]); 
  const [selectedNhanSu, setSelectedNhanSu] = useState('');
  const [loaiShip, setLoaiShip] = useState('Ship thường');
  
  // State cho bảng
  const [donHangs, setDonHangs] = useState([]);

  // State cho các ô lọc
  const [filterIdKenh, setFilterIdKenh] = useState('');
  const [filterSdt, setFilterSdt] = useState('');
  const [filterBrand, setFilterBrand] = useState('');
  const [filterSanPham, setFilterSanPham] = useState('');
  const [filterNhanSu, setFilterNhanSu] = useState('');
  const [filterNgay, setFilterNgay] = useState('');
  const [filterSanPhams, setFilterSanPhams] = useState([]);
  
  // State cho tính năng tổng hợp
  const [summaryDate, setSummaryDate] = useState(new Date().toISOString().split('T')[0]);
  const [productSummary, setProductSummary] = useState([]);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [productSearchTerm, setProductSearchTerm] = useState('');

  const fetchDonHangs = async (filters = {}) => {
    let query = supabase
      .from('donguis')
      .select(`
        id, ngay_gui, loai_ship,
        kocs ( ho_ten, id_kenh, sdt, dia_chi, cccd ), 
        nhansu ( ten_nhansu ),
        chitiettonguis ( sanphams ( id, ten_sanpham, barcode, brands ( ten_brand ) ) )
      `);

    if (filters.nhanSuId) { query = query.eq('nhansu_id', filters.nhanSuId); }
    if (filters.idKenh) { query = query.ilike('kocs.id_kenh', `%${filters.idKenh}%`); }
    if (filters.sdt) { query = query.ilike('kocs.sdt', `%${filters.sdt}%`); }
    if (filters.brandId) { query = query.eq('chitiettonguis.sanphams.brand_id', filters.brandId); }
    if (filters.sanPhamId) { query = query.eq('chitiettonguis.sanpham_id', filters.sanPhamId); }
    if (filters.ngay) {
      const startDate = new Date(filters.ngay);
      const endDate = new Date(filters.ngay);
      endDate.setDate(endDate.getDate() + 1);
      query = query.gte('ngay_gui', startDate.toISOString()).lt('ngay_gui', endDate.toISOString());
    }

    const { data, error } = await query.order('ngay_gui', { ascending: false });

    if (error) {
      alert('Lỗi khi lọc dữ liệu: ' + error.message);
    } else {
      setDonHangs(data);
    }
  };

  useEffect(() => {
    async function getInitialData() {
      const { data: brandsData } = await supabase.from('brands').select();
      if (brandsData) setBrands(brandsData);
      const { data: nhanSusData } = await supabase.from('nhansu').select();
      if (nhanSusData) setNhanSus(nhanSusData);
      fetchDonHangs();
    }
    getInitialData();
  }, []);

  useEffect(() => {
    if (!selectedBrand) { setSanPhams([]); setSelectedSanPhams([]); return; }
    async function getSanPhams() {
      const { data } = await supabase.from('sanphams').select().eq('brand_id', selectedBrand);
      if (data) setSanPhams(data);
    }
    getSanPhams();
  }, [selectedBrand]);

  useEffect(() => {
    if (!filterBrand) { setFilterSanPhams([]); setFilterSanPham(''); return; }
    async function getFilterSanPhams() {
      const { data } = await supabase.from('sanphams').select().eq('brand_id', filterBrand);
      if (data) setFilterSanPhams(data);
    }
    getFilterSanPhams();
  }, [filterBrand]);

  const handleSanPhamChange = (sanPhamId) => {
    setSelectedSanPhams(prevSelected => {
      if (prevSelected.includes(sanPhamId)) {
        return prevSelected.filter(id => id !== sanPhamId);
      } else {
        return [...prevSelected, sanPhamId];
      }
    });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    // THÊM ĐIỀU KIỆN KIỂM TRA CCCD
    if (cccd.length !== 12 || !/^\d{12}$/.test(cccd)) {
      alert('Vui lòng nhập CCCD đủ 12 chữ số.');
      return;
    }
    if (selectedSanPhams.length === 0) { alert('Vui lòng chọn ít nhất một sản phẩm!'); return; }

    setIsLoading(true);
    try {
      const { data: kocData } = await supabase.from('kocs').upsert({ ho_ten: hoTen, id_kenh: idKenh, sdt: sdt, dia_chi: diaChi, cccd: cccd }, { onConflict: 'cccd' }).select().single();
      const { data: donGuiData } = await supabase.from('donguis').insert({ koc_id: kocData.id, nhansu_id: selectedNhanSu, loai_ship: loaiShip }).select().single();
      const chiTietData = selectedSanPhams.map(sanPhamId => ({ don_gui_id: donGuiData.id, sanpham_id: sanPhamId, so_luong: 1 }));
      await supabase.from('chitiettonguis').insert(chiTietData);
      alert('Tạo đơn gửi thành công!');
      setHoTen(''); setIdKenh(''); setSdt(''); setDiaChi(''); setCccd('');
      setSelectedBrand(''); setSelectedSanPhams([]); setSelectedNhanSu(''); setLoaiShip('Ship thường');
      fetchDonHangs();
    } catch (error) {
      alert('Đã có lỗi xảy ra: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleIdKenhBlur = async () => {
    if (!idKenh) return;
    const { data } = await supabase.from('kocs').select().eq('id_kenh', idKenh).single();
    if (data) {
      setHoTen(data.ho_ten);
      setSdt(data.sdt);
      setDiaChi(data.dia_chi);
      setCccd(data.cccd);
    }
  };

  const handleFilter = () => {
    fetchDonHangs({ idKenh: filterIdKenh, sdt: filterSdt, brandId: filterBrand, sanPhamId: filterSanPham, nhanSuId: filterNhanSu, ngay: filterNgay, });
  };

  const clearFilters = () => {
    setFilterIdKenh(''); setFilterSdt(''); setFilterBrand(''); setFilterSanPham('');
    setFilterNhanSu(''); setFilterNgay('');
    fetchDonHangs();
  };
  
  const handleGetSummary = async () => {
    if (!summaryDate) { alert('Vui lòng chọn ngày để tổng hợp!'); return; }
    setIsSummarizing(true);
    setProductSummary([]);
    const { data, error } = await supabase.rpc('get_product_summary_by_day', { target_day: summaryDate });
    if (error) { alert('Lỗi khi lấy tổng hợp: ' + error.message); } else { setProductSummary(data); }
    setIsSummarizing(false);
  };

  // ĐÃ SẮP XẾP LẠI CSV HEADERS
  const csvHeaders = [
    { label: "Ngày Gửi", key: "ngayGui" }, { label: "Tên KOC", key: "tenKOC" }, { label: "ID Kênh", key: "idKenh" }, { label: "SĐT", key: "sdt" },
    { label: "Địa chỉ", key: "diaChi" }, { label: "CCCD", key: "cccd" }, { label: "Sản Phẩm", key: "sanPham" },
    { label: "Brand", key: "brand" }, { label: "Nhân Sự Gửi", key: "nhanSu" }, { label: "Loại Ship", key: "loaiShip" }, { label: "Barcode", key: "barcode" }
  ];

  const csvData = donHangs.map(donHang => ({
    ngayGui: new Date(donHang.ngay_gui).toLocaleString('vi-VN'),
    tenKOC: donHang.kocs?.ho_ten, idKenh: donHang.kocs?.id_kenh, sdt: donHang.kocs?.sdt, diaChi: donHang.kocs?.dia_chi, cccd: donHang.kocs?.cccd,
    sanPham: donHang.chitiettonguis.map(ct => ct.sanphams?.ten_sanpham).join('\n'),
    brand: [...new Set(donHang.chitiettonguis.map(ct => ct.sanphams?.brands?.ten_brand))].join('\n'),
    nhanSu: donHang.nhansu?.ten_nhansu,
    loaiShip: donHang.loai_ship,
    barcode: donHang.chitiettonguis.map(ct => ct.sanphams?.barcode).join('\n'),
  }));

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-start', gap: '2rem', padding: '2rem' }}>
      
      <div style={{ flex: '0 0 500px', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        <div style={{ padding: '2rem', border: '1px solid #ddd', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
          <h1 style={{ textAlign: 'center', color: '#333', marginBottom: '1.5rem' }}>Tạo Đơn Gửi KOC</h1>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label>ID Kênh</label>
              <input type="text" value={idKenh} onChange={e => setIdKenh(e.target.value)} onBlur={handleIdKenhBlur} style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }} required />
            </div>
            <div><label>Họ tên KOC</label><input type="text" value={hoTen} onChange={e => setHoTen(e.target.value)} style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }} required /></div>
            <div><label>Số điện thoại</label><input type="text" value={sdt} onChange={e => setSdt(e.target.value)} style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }} required /></div>
            <div><label>Địa chỉ</label><input type="text" value={diaChi} onChange={e => setDiaChi(e.target.value)} style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }} required /></div>
            
            {/* THÊM THUỘC TÍNH VÀO Ô CCCD */}
            <div>
              <label>CCCD</label>
              <input 
                type="text" 
                value={cccd} 
                onChange={e => setCccd(e.target.value)} 
                style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }} 
                required 
                maxLength="12" 
                minLength="12" 
                pattern="[0-9]*"
                title="Vui lòng nhập đủ 12 chữ số."
              />
            </div>

            <div><label>Brand</label><select value={selectedBrand} onChange={e => setSelectedBrand(e.target.value)} style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }} required><option value="">-- Chọn Brand --</option>{brands.map(brand => (<option key={brand.id} value={brand.id}>{brand.ten_brand}</option>))}</select></div>
            <div>
              <label>Sản phẩm</label>
              <input type="text" placeholder="Tìm sản phẩm..." value={productSearchTerm} onChange={e => setProductSearchTerm(e.target.value)} style={{ width: '100%', padding: '8px', boxSizing: 'border-box', marginBottom: '10px' }} disabled={!selectedBrand} />
              <div style={{ border: '1px solid #ccc', borderRadius: '4px', padding: '10px', maxHeight: '150px', overflowY: 'auto' }}>
                {sanPhams.length > 0 ? sanPhams.filter(sp => sp.ten_sanpham.toLowerCase().includes(productSearchTerm.toLowerCase())).map(sp => (
                    <div key={sp.id}>
                      <input type="checkbox" id={sp.id} value={sp.id} checked={selectedSanPhams.includes(sp.id)} onChange={() => handleSanPhamChange(sp.id)} />
                      <label htmlFor={sp.id} style={{ marginLeft: '8px' }}>{sp.ten_sanpham}</label>
                    </div>
                  )) : <p style={{ margin: 0, color: '#888' }}>Vui lòng chọn Brand để xem sản phẩm</p>}
              </div>
            </div>
            <div><label>Nhân sự gửi</label><select value={selectedNhanSu} onChange={e => setSelectedNhanSu(e.target.value)} style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }} required><option value="">-- Chọn nhân sự --</option>{nhanSus.map(nhansu => (<option key={nhansu.id} value={nhansu.id}>{nhansu.ten_nhansu}</option>))}</select></div>
            <div>
              <label>Loại hình vận chuyển</label>
              <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
                <label style={{ display: 'flex', alignItems: 'center' }}><input type="radio" value="Ship thường" checked={loaiShip === 'Ship thường'} onChange={e => setLoaiShip(e.target.value)} style={{ marginRight: '5px' }} />Ship thường</label>
                <label style={{ display: 'flex', alignItems: 'center' }}><input type="radio" value="Hỏa tốc" checked={loaiShip === 'Hỏa tốc'} onChange={e => setLoaiShip(e.target.value)} style={{ marginRight: '5px' }} />Hỏa tốc</label>
              </div>
            </div>
            <button type="submit" disabled={isLoading} style={{ width: '100%', padding: '10px', backgroundColor: isLoading ? '#ccc' : '#007bff', color: 'white', border: 'none', borderRadius: '4px', fontSize: '16px', cursor: 'pointer', marginTop: '1rem' }}>{isLoading ? 'Đang xử lý...' : 'Gửi Đơn'}</button>
          </form>
        </div>
        <div style={{ padding: '2rem', border: '1px solid #ddd', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
            <h2 style={{ textAlign: 'center', color: '#333', marginBottom: '1.5rem' }}>Tổng Hợp Sản Phẩm</h2>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}><input type="date" value={summaryDate} onChange={e => setSummaryDate(e.target.value)} style={{ padding: '7px', flex: 1 }} /><button onClick={handleGetSummary} disabled={isSummarizing} style={{ padding: '8px 16px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>{isSummarizing ? 'Đang xử lý...' : 'Tổng hợp'}</button></div>
            <div style={{ marginTop: '1rem' }}>{productSummary.length > 0 ? (<table style={{ width: '100%', borderCollapse: 'collapse' }}><thead style={{textAlign: 'left'}}><tr><th style={{padding: '8px', borderBottom: '1px solid #ddd'}}>Sản phẩm</th><th style={{padding: '8px', borderBottom: '1px solid #ddd'}}>Barcode</th><th style={{padding: '8px', borderBottom: '1px solid #ddd'}}>Brand</th><th style={{padding: '8px', borderBottom: '1px solid #ddd'}}>Số lượng</th></tr></thead><tbody>{productSummary.map(item => (<tr key={item.ten_san_pham}><td style={{padding: '8px', borderBottom: '1px solid #eee'}}>{item.ten_san_pham}</td><td style={{padding: '8px', borderBottom: '1px solid #eee'}}>{item.barcode}</td><td style={{padding: '8px', borderBottom: '1px solid #eee'}}>{item.ten_brand}</td><td style={{padding: '8px', borderBottom: '1px solid #eee', textAlign: 'center'}}><strong>{item.total_quantity}</strong></td></tr>))}</tbody></table>) : (<p style={{ textAlign: 'center', color: '#888' }}>Chưa có dữ liệu cho ngày đã chọn.</p>)}</div>
        </div>
      </div>

      <div style={{ flex: '1', minWidth: '800px' }}>
        <h2 style={{ textAlign: 'center' }}>Danh Sách Đơn Hàng Đã Gửi</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem', alignItems: 'end', marginBottom: '1rem', padding: '1rem', backgroundColor: '#f9f9f9', borderRadius: '8px' }}>
          <input type="text" placeholder="ID kênh..." value={filterIdKenh} onChange={e => setFilterIdKenh(e.target.value)} style={{ padding: '8px' }} />
          <input type="text" placeholder="SĐT..." value={filterSdt} onChange={e => setFilterSdt(e.target.value)} style={{ padding: '8px' }} />
          <select value={filterBrand} onChange={e => setFilterBrand(e.target.value)} style={{ padding: '8px' }}><option value="">Tất cả Brand</option>{brands.map(b => <option key={b.id} value={b.id}>{b.ten_brand}</option>)}</select>
          <select value={filterSanPham} onChange={e => setFilterSanPham(e.target.value)} style={{ padding: '8px' }} disabled={!filterBrand}><option value="">Tất cả Sản phẩm</option>{filterSanPhams.map(sp => <option key={sp.id} value={sp.id}>{sp.ten_sanpham}</option>)}</select>
          <select value={filterNhanSu} onChange={e => setFilterNhanSu(e.target.value)} style={{ padding: '8px' }}><option value="">Tất cả nhân sự</option>{nhanSus.map(ns => <option key={ns.id} value={ns.id}>{ns.ten_nhansu}</option>)}</select>
          <input type="date" value={filterNgay} onChange={e => setFilterNgay(e.target.value)} style={{ padding: '7px' }} />
          <div style={{display: 'flex', gap: '0.5rem'}}>
            <button onClick={handleFilter} style={{ flex: 1, padding: '8px 16px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Lọc</button>
            <button onClick={clearFilters} style={{ flex: 1, padding: '8px 16px', backgroundColor: '#6c757d', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Xóa Lọc</button>
          </div>
          <CSVLink 
            data={csvData} 
            headers={csvHeaders}
            filename={"danh-sach-don-hang.csv"}
            style={{ padding: '8px 16px', backgroundColor: '#17a2b8', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', textDecoration: 'none', textAlign: 'center' }}
          >
            Xuất File
          </CSVLink>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '1rem', tableLayout: 'fixed' }}>
          <thead style={{ backgroundColor: '#f2f2f2' }}>
            <tr>
              <th style={{ padding: '12px', border: '1px solid #ddd', textAlign: 'left' }}>Ngày Gửi</th>
              <th style={{ padding: '12px', border: '1px solid #ddd', textAlign: 'left' }}>Họ Tên KOC</th>
              <th style={{ padding: '12px', border: '1px solid #ddd', textAlign: 'left' }}>ID Kênh</th>
              <th style={{ padding: '12px', border: '1px solid #ddd', textAlign: 'left' }}>SĐT</th>
              <th style={{ padding: '12px', border: '1px solid #ddd', textAlign: 'left' }}>Địa chỉ</th>
              <th style={{ padding: '12px', border: '1px solid #ddd', textAlign: 'left' }}>CCCD</th>
              <th style={{ padding: '12px', border: '1px solid #ddd', textAlign: 'left' }}>Brand</th>
              <th style={{ padding: '12px', border: '1px solid #ddd', textAlign: 'left' }}>Sản Phẩm</th>
              <th style={{ padding: '12px', border: '1px solid #ddd', textAlign: 'left' }}>Nhân Sự Gửi</th>
              <th style={{ padding: '12px', border: '1px solid #ddd', textAlign: 'left' }}>Loại Ship</th>
              <th style={{ padding: '12px', border: '1px solid #ddd', textAlign: 'left' }}>Barcode</th>
            </tr>
          </thead>
          <tbody>
            {donHangs.map(donHang => (
              <tr key={donHang.id}>
                <td style={{ padding: '12px', border: '1px solid #ddd', wordWrap: 'break-word' }}>{new Date(donHang.ngay_gui).toLocaleString('vi-VN')}</td>
                <td style={{ padding: '12px', border: '1px solid #ddd', wordWrap: 'break-word' }}>{donHang.kocs?.ho_ten}</td>
                <td style={{ padding: '12px', border: '1px solid #ddd', wordWrap: 'break-word' }}>{donHang.kocs?.id_kenh}</td>
                <td style={{ padding: '12px', border: '1px solid #ddd', wordWrap: 'break-word' }}>{donHang.kocs?.sdt}</td>
                <td style={{ padding: '12px', border: '1px solid #ddd', wordWrap: 'break-word' }}>{donHang.kocs?.dia_chi}</td>
                <td style={{ padding: '12px', border: '1px solid #ddd', wordWrap: 'break-word' }}>{donHang.kocs?.cccd}</td>
                <td style={{ padding: '12px', border: '1px solid #ddd', wordWrap: 'break-word' }}>
                  {[...new Set(donHang.chitiettonguis.map(ct => ct.sanphams?.brands?.ten_brand))].map(tenBrand => ( <div key={tenBrand}>{tenBrand}</div> ))}
                </td>
                <td style={{ padding: '12px', border: '1px solid #ddd', wordWrap: 'break-word' }}>
                  {donHang.chitiettonguis.map(ct => ( <div key={ct.sanphams?.id}>{ct.sanphams?.ten_sanpham}</div> ))}
                </td>
                <td style={{ padding: '12px', border: '1px solid #ddd', wordWrap: 'break-word' }}>{donHang.nhansu?.ten_nhansu}</td>
                <td style={{ padding: '12px', border: '1px solid #ddd', wordWrap: 'break-word' }}>{donHang.loai_ship}</td>
                <td style={{ padding: '12px', border: '1px solid #ddd', wordWrap: 'break-word' }}>
                  {donHang.chitiettonguis.map(ct => ( <div key={ct.sanphams?.id}>{ct.sanphams?.barcode}</div> ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
    </div>
  );
}

export default App;