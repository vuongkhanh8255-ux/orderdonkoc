import { useState, useEffect, useMemo } from 'react'; // <-- Thêm useMemo
import { supabase } from './supabaseClient';
import * as XLSX from 'xlsx';
import { Resizable } from 'react-resizable';
import 'react-resizable/css/styles.css';

// Component Header có thể kéo thả
const ResizableHeader = ({ onResize, width, children }) => {
    if (!width) {
        return <th style={{ padding: '12px', border: '1px solid #ddd', textAlign: 'left' }}>{children}</th>;
    }

    return (
        <Resizable
            width={width}
            height={0}
            onResize={onResize}
            draggableOpts={{ enableUserSelectHack: false }}
            axis="x"
        >
            <th style={{ width: `${width}px`, padding: '12px', border: '1px solid #ddd', textAlign: 'left', position: 'relative', backgroundClip: 'padding-box' }}>
                {children}
            </th>
        </Resizable>
    );
};


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
  const [initialDonHangs, setInitialDonHangs] = useState([]);

  // State cho các ô lọc
  const [filterIdKenh, setFilterIdKenh] = useState('');
  const [filterSdt, setFilterSdt] = useState('');
  const [filterBrand, setFilterBrand] = useState('');
  const [filterSanPham, setFilterSanPham] = useState('');
  const [filterNhanSu, setFilterNhanSu] = useState('');
  const [filterNgay, setFilterNgay] = useState('');
  const [filterLoaiShip, setFilterLoaiShip] = useState('');
  const [filterEditedStatus, setFilterEditedStatus] = useState('all'); // <-- THÊM MỚI
  const [filterSanPhams, setFilterSanPhams] = useState([]);
  const [productSearchTerm, setProductSearchTerm] = useState('');
  // State cho tính năng tổng hợp
  const [summaryDate, setSummaryDate] = useState(new Date().toISOString().split('T')[0]);
  const [productSummary, setProductSummary] = useState([]);
  const [isSummarizing, setIsSummarizing] = useState(false);
  
  // State cho tính năng sửa
  const [editingDonHang, setEditingDonHang] = useState(null);

  // STATE MỚI: Lưu trữ độ rộng của các cột
  const [columnWidths, setColumnWidths] = useState({
    stt: 50,
    ngayGui: 160,
    hoTenKOC: 150,
    idKenh: 120,
    sdt: 120,
    diaChi: 250,
    cccd: 120,
    brand: 120,
    sanPham: 200,
    nhanSu: 120,
    loaiShip: 120,
    trangThai: 120,
    hanhDong: 100,
  });
  // HÀM MỚI: Xử lý khi kéo thả để thay đổi độ rộng cột
  const handleResize = (key) => (e, { size }) => {
    setColumnWidths(prev => ({
      ...prev,
      [key]: size.width
    }));
  };

  const fetchDonHangs = async (filters = {}) => {
    let query = supabase.from('donguis').select(`id, ngay_gui, loai_ship, trang_thai, kocs ( id, ho_ten, id_kenh, sdt, dia_chi, cccd ), nhansu ( ten_nhansu ),chitiettonguis ( id, sanphams ( id, ten_sanpham, barcode, brands ( ten_brand ) ) )`);
    if (filters.nhanSuId) { query = query.eq('nhansu_id', filters.nhanSuId); }
    if (filters.idKenh) { query = query.ilike('kocs.id_kenh', `%${filters.idKenh}%`);
    }
    if (filters.sdt) { query = query.ilike('kocs.sdt', `%${filters.sdt}%`);
    }
    if (filters.brandId) { query = query.eq('chitiettonguis.sanphams.brand_id', filters.brandId);
    }
    if (filters.sanPhamId) { query = query.eq('chitiettonguis.sanpham_id', filters.sanPhamId);
    }
    if (filters.loaiShip) {
      query = query.eq('loai_ship', filters.loaiShip);
    }
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
      
      let { data, error } = await supabase.from('donguis').select(`id, ngay_gui, loai_ship, trang_thai, kocs ( id, ho_ten, id_kenh, sdt, dia_chi, cccd ), nhansu ( ten_nhansu ),chitiettonguis ( id, sanphams ( id, ten_sanpham, barcode, brands ( ten_brand ) ) )`).order('ngay_gui', { ascending: false });
      
      if(error) {
        alert("Lỗi tải dữ liệu: " + error.message)
      } else if (data) {
        setDonHangs(data);
        setInitialDonHangs(data);
      }
    }
    getInitialData();
  }, []);

  // --- LOGIC MỚI: TẠO DANH SÁCH HIỂN THỊ DỰA TRÊN BỘ LỌC SỬA ---
  const displayedDonHangs = useMemo(() => {
    if (filterEditedStatus === 'all') {
      return donHangs;
    }

    const hasBeenEdited = (currentOrder, initialOrder) => {
      if (!initialOrder) return false;
      const fieldsToCompare = ['ho_ten', 'id_kenh', 'sdt', 'dia_chi', 'cccd'];
      for (const field of fieldsToCompare) {
        if (currentOrder.kocs?.[field] !== initialOrder.kocs?.[field]) return true;
      }
      if (currentOrder.loai_ship !== initialOrder.loai_ship) return true;
      if (currentOrder.trang_thai !== initialOrder.trang_thai) return true;
      return false;
    };
    
    return donHangs.filter(donHang => {
      const initialOrder = initialDonHangs.find(d => d.id === donHang.id);
      const isEdited = hasBeenEdited(donHang, initialOrder);

      if (filterEditedStatus === 'edited') return isEdited;
      if (filterEditedStatus === 'unedited') return !isEdited;
      return true;
    });
  }, [donHangs, initialDonHangs, filterEditedStatus]);


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
    if (cccd.length !== 12 || !/^\d{12}$/.test(cccd)) { alert('Vui lòng nhập CCCD đủ 12 chữ số.'); return;
    }
    if (selectedSanPhams.length === 0) { alert('Vui lòng chọn ít nhất một sản phẩm!'); return;
    }
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
      setHoTen(data.ho_ten); setSdt(data.sdt); setDiaChi(data.dia_chi); setCccd(data.cccd);
    }
  };
  const handleFilter = () => { 
    fetchDonHangs({ 
        idKenh: filterIdKenh, 
        sdt: filterSdt, 
        brandId: filterBrand, 
        sanPhamId: filterSanPham, 
        nhanSuId: filterNhanSu, 
        ngay: filterNgay, 
        loaiShip: filterLoaiShip
    });
  };
  const clearFilters = () => { 
    setFilterIdKenh(''); 
    setFilterSdt(''); 
    setFilterBrand(''); 
    setFilterSanPham(''); 
    setFilterNhanSu(''); 
    setFilterNgay(''); 
    setFilterLoaiShip('');
    setFilterEditedStatus('all'); // <-- CẬP NHẬT
    setDonHangs(initialDonHangs);
  };
  const handleGetSummary = async () => {
    if (!summaryDate) { alert('Vui lòng chọn ngày để tổng hợp!');
    return; }
    setIsSummarizing(true);
    setProductSummary([]);
    const { data, error } = await supabase.rpc('get_product_summary_by_day', { target_day: summaryDate });
    if (error) { alert('Lỗi khi lấy tổng hợp: ' + error.message); } else { setProductSummary(data); }
    setIsSummarizing(false);
  };
  
  const handleEdit = (donHang) => { 
    setEditingDonHang({ ...donHang });
  };
  const handleCancelEdit = () => { 
    setEditingDonHang(null); 
  };

  const handleUpdate = async () => {
    if (!editingDonHang) return;
    
    const { error: kocError } = await supabase.from('kocs').update({ ho_ten: editingDonHang.kocs.ho_ten, id_kenh: editingDonHang.kocs.id_kenh, sdt: editingDonHang.kocs.sdt, dia_chi: editingDonHang.kocs.dia_chi, cccd: editingDonHang.kocs.cccd }).eq('id', editingDonHang.kocs.id);
    if (kocError) { alert('Lỗi cập nhật thông tin KOC: ' + kocError.message); return;
    }
    const { error: donGuiError } = await supabase.from('donguis').update({ loai_ship: editingDonHang.loai_ship, trang_thai: editingDonHang.trang_thai }).eq('id', editingDonHang.id);
    if (donGuiError) { alert('Lỗi cập nhật đơn gửi: ' + donGuiError.message); return; }

    setDonHangs(currentDonHangs => {
      return currentDonHangs.map(donHang => {
        if (donHang.id === editingDonHang.id) {
          return editingDonHang;
        }
        return donHang;
      });
    });
    
    setEditingDonHang(null);
  };

  const handleExport = ({ data, headers, filename }) => {
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1");
    XLSX.utils.sheet_add_aoa(worksheet, [headers.map(h => h.label)], { origin: "A1" });
    XLSX.writeFile(workbook, filename);
  };
  const mainExportData = donHangs.flatMap((donHang, index) => {
    if (donHang.chitiettonguis.length === 0) { return [{ stt: index + 1, ngayGui: new Date(donHang.ngay_gui).toLocaleString('vi-VN'), tenKOC: donHang.kocs?.ho_ten, idKenh: donHang.kocs?.id_kenh, sdt: donHang.kocs?.sdt, diaChi: donHang.kocs?.dia_chi, cccd: donHang.kocs?.cccd, sanPham: 'N/A', brand: 'N/A', barcode: 'N/A', nhanSu: donHang.nhansu?.ten_nhansu, loaiShip: donHang.loai_ship, }]; }
    return donHang.chitiettonguis.map(ct => ({ stt: index + 1, ngayGui: new Date(donHang.ngay_gui).toLocaleString('vi-VN'), tenKOC: donHang.kocs?.ho_ten, idKenh: donHang.kocs?.id_kenh, sdt: donHang.kocs?.sdt, diaChi: donHang.kocs?.dia_chi, cccd: donHang.kocs?.cccd, sanPham: ct.sanphams?.ten_sanpham, brand: ct.sanphams?.brands?.ten_brand, barcode: ct.sanphams?.barcode, nhanSu: donHang.nhansu?.ten_nhansu, loaiShip: donHang.loai_ship, }));
  });
  const mainExportHeaders = [ { label: "STT", key: "stt"}, { label: "Ngày Gửi", key: "ngayGui" }, { label: "Tên KOC", key: "tenKOC" }, { label: "ID Kênh", key: "idKenh" }, { label: "SĐT", key: "sdt" }, { label: "Địa chỉ", key: "diaChi" }, { label: "CCCD", key: "cccd" }, { label: "Sản Phẩm", key: "sanPham" }, { label: "Brand", key: "brand" }, { label: "Barcode", key: "barcode" }, { label: "Nhân Sự Gửi", key: "nhanSu" }, { label: "Loại Ship", key: "loaiShip" } ];
  const summaryExportHeaders = [ { label: "Sản Phẩm", key: "ten_san_pham" }, { label: "Barcode", key: "barcode" }, { label: "Brand", key: "ten_brand" }, { label: "Tổng Số Lượng", key: "total_quantity" } ];
  
  const headers = [
    { key: 'stt', label: 'STT' }, { key: 'ngayGui', label: 'Ngày Gửi' }, { key: 'hoTenKOC', label: 'Họ Tên KOC' }, { key: 'idKenh', label: 'ID Kênh' },
    { key: 'sdt', label: 'SĐT' }, { key: 'diaChi', label: 'Địa chỉ' }, { key: 'cccd', label: 'CCCD' }, { key: 'brand', label: 'Brand' },
    { key: 'sanPham', label: 'Sản Phẩm' }, { key: 'nhanSu', label: 'Nhân Sự Gửi' }, { key: 'loaiShip', label: 'Loại Ship' }, 
    { key: 'trangThai', label: 'Trạng Thái' }, { key: 'hanhDong', label: 'Hành Động' },
  ];
  return (
    <div style={{ padding: '2rem' }}>
      
      <div style={{ maxWidth: '800px', margin: '0 auto 2rem auto', display: 'flex', gap: '2rem' }}>
        <div style={{ flex: 1, padding: '2rem', border: '1px solid #ddd', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
          <h1 style={{ textAlign: 'center', color: '#333', marginBottom: '1.5rem' }}>Tạo Đơn Gửi KOC</h1>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
 
           <div><label>ID Kênh</label><input type="text" value={idKenh} onChange={e => setIdKenh(e.target.value)} onBlur={handleIdKenhBlur} style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }} required /></div>
            <div><label>Họ tên KOC</label><input type="text" value={hoTen} onChange={e => setHoTen(e.target.value)} style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }} required /></div>
            <div><label>Số điện thoại</label><input type="text" value={sdt} onChange={e => setSdt(e.target.value)} style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }} required /></div>
            <div><label>Địa chỉ</label><input type="text" value={diaChi} onChange={e => setDiaChi(e.target.value)} style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }} required /></div>
            <div><label>CCCD</label><input type="text" value={cccd} onChange={e => setCccd(e.target.value)} style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }} required maxLength="12" minLength="12" pattern="[0-9]*" title="Vui lòng nhập đủ 12 chữ số." /></div>
            <div><label>Brand</label><select value={selectedBrand} onChange={e => setSelectedBrand(e.target.value)} style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }} required><option value="">-- Chọn Brand --</option>{brands.map(brand => (<option key={brand.id} value={brand.id}>{brand.ten_brand}</option>))}</select></div>
            <div>
    
              <label>Sản phẩm</label>
              <input type="text" placeholder="Tìm sản phẩm..." value={productSearchTerm} onChange={e => setProductSearchTerm(e.target.value)} style={{ width: '100%', padding: '8px', boxSizing: 'border-box', marginBottom: '10px' }} disabled={!selectedBrand} />
              <div style={{ border: '1px solid #ccc', borderRadius: '4px', padding: '10px', maxHeight: '150px', overflowY: 'auto' }}>
                {sanPhams.length > 0 ?
                  sanPhams.filter(sp => sp.ten_sanpham.toLowerCase().includes(productSearchTerm.toLowerCase())).map(sp => (
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
        <div style={{ flex: 1, padding: '2rem', border: '1px solid #ddd', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
            <h2 style={{ textAlign: 'center', color: '#333', marginBottom: '1.5rem' }}>Tổng Hợp Sản Phẩm</h2>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}><input type="date" value={summaryDate} onChange={e => setSummaryDate(e.target.value)} style={{ padding: '7px', flex: 1 }} /><button onClick={handleGetSummary} disabled={isSummarizing} style={{ padding: '8px 16px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>{isSummarizing ? 'Đang xử lý...' : 'Tổng hợp'}</button></div>
            <div style={{ marginTop: '1rem' }}>{productSummary.length > 0 ?
              (<><table style={{ width: '100%', borderCollapse: 'collapse' }}><thead style={{textAlign: 'left'}}><tr><th style={{padding: '8px', borderBottom: '1px solid #ddd'}}>Sản phẩm</th><th style={{padding: '8px', borderBottom: '1px solid #ddd'}}>Barcode</th><th style={{padding: '8px', borderBottom: '1px solid #ddd'}}>Brand</th><th style={{padding: '8px', borderBottom: '1px solid #ddd'}}>Số lượng</th></tr></thead><tbody>{productSummary.map(item => (<tr key={item.ten_san_pham}><td style={{padding: '8px', borderBottom: '1px solid #eee'}}>{item.ten_san_pham}</td><td style={{padding: '8px', borderBottom: '1px solid #eee'}}>{item.barcode}</td><td style={{padding: '8px', borderBottom: '1px solid #eee'}}>{item.ten_brand}</td><td style={{padding: '8px', borderBottom: '1px solid #eee', textAlign: 'center'}}><strong>{item.total_quantity}</strong></td></tr>))}</tbody></table><div style={{ marginTop: '1rem', textAlign: 'right' }}><button onClick={() => handleExport({ data: productSummary, headers: summaryExportHeaders, filename: `tong-hop-san-pham-${summaryDate}.xlsx`})} style={{ padding: '8px 16px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Xuất File Tổng Hợp</button></div></>) : (<p style={{ textAlign: 'center', color: '#888' }}>Chưa có dữ liệu cho ngày đã chọn.</p>)}</div>
        </div>
      </div>

      <div style={{ width: '100%', overflowX: 'auto' }}>
        <h2 style={{ textAlign: 'center' }}>Danh Sách Đơn Hàng Đã Gửi</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem', alignItems: 'end', marginBottom: '1rem', padding: '1rem', backgroundColor: '#f9f9f9', borderRadius: '8px' }}>
          <input type="text" placeholder="ID kênh..." value={filterIdKenh} onChange={e => setFilterIdKenh(e.target.value)} style={{ padding: '8px' }} />
          <input type="text" placeholder="SĐT..." value={filterSdt} onChange={e => setFilterSdt(e.target.value)} style={{ padding: '8px' }} />
          <select value={filterBrand} onChange={e => setFilterBrand(e.target.value)} style={{ padding: '8px' }}><option value="">Tất cả Brand</option>{brands.map(b => <option key={b.id} value={b.id}>{b.ten_brand}</option>)}</select>
          <select value={filterSanPham} onChange={e => setFilterSanPham(e.target.value)} style={{ padding: '8px' }} disabled={!filterBrand}><option value="">Tất cả Sản phẩm</option>{filterSanPhams.map(sp => <option key={sp.id} value={sp.id}>{sp.ten_sanpham}</option>)}</select>
          <select value={filterNhanSu} onChange={e => setFilterNhanSu(e.target.value)} style={{ padding: '8px' }}><option value="">Tất cả nhân sự</option>{nhanSus.map(ns => <option key={ns.id} value={ns.id}>{ns.ten_nhansu}</option>)}</select>
          <select value={filterLoaiShip} onChange={e => setFilterLoaiShip(e.target.value)} style={{ padding: '8px' }}>
            <option value="">Tất cả loại ship</option>
            <option value="Ship thường">Ship thường</option>
            <option value="Hỏa tốc">Hỏa tốc</option>
          </select>
          {/* THÊM MỚI: BỘ LỌC TRẠNG THÁI SỬA */}
          <select value={filterEditedStatus} onChange={e => setFilterEditedStatus(e.target.value)} style={{ padding: '8px' }}>
            <option value="all">Tất cả trạng thái sửa</option>
            <option value="edited">Đơn đã sửa</option>
            <option value="unedited">Đơn chưa sửa</option>
          </select>
          <input type="date" value={filterNgay} onChange={e => setFilterNgay(e.target.value)} style={{ padding: '7px' }} />
          <div style={{display: 'flex', gap: '0.5rem'}}>
            <button onClick={handleFilter} style={{ flex: 1, padding: '8px 16px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Lọc</button>
            <button onClick={clearFilters} style={{ flex: 1, padding: '8px 16px', backgroundColor: '#6c757d', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Xóa Lọc</button>
  
          </div>
          <button onClick={() => handleExport({ data: mainExportData, headers: mainExportHeaders, filename: 'danh-sach-don-hang.xlsx' })} style={{ padding: '8px 16px', backgroundColor: '#17a2b8', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', textAlign: 'center' }}>
            Xuất File
          </button>
        </div>

        <div style={{ width: '100%', overflow: 'auto' }}>
          
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead style={{ backgroundColor: '#f2f2f2' }}>
              <tr>
                {headers.map((header) => (
                  <ResizableHeader
                    key={header.key}
                    width={columnWidths[header.key]}
                    onResize={handleResize(header.key)}
                  >
                    {header.label}
                  </ResizableHeader>
           
                 ))}
              </tr>
            </thead>
            <tbody>
              {/* CẬP NHẬT: Dùng displayedDonHangs thay vì donHangs */}
              {displayedDonHangs.map((donHang, index) => {
                const initialOrder = initialDonHangs.find(d => d.id === donHang.id);
                
                const getCellStyle = (currentValue, initialValue) => {
                    return initialOrder && currentValue !== initialValue
                        ? { backgroundColor: 'red', color: 'white' }
                        : {};
                };

                return (
                <tr key={donHang.id}>
                  {editingDonHang?.id === donHang.id ?
                  ( // Chế độ Sửa
                    <>
                      <td style={{ width: `${columnWidths.stt}px`, padding: '12px', border: '1px solid #ddd' }}>{index + 1}</td>
                      <td style={{ width: `${columnWidths.ngayGui}px`, padding: '12px', border: '1px solid #ddd' }}>{new Date(donHang.ngay_gui).toLocaleString('vi-VN')}</td>
                      <td style={{ width: `${columnWidths.hoTenKOC}px`, padding: '12px', border: '1px solid #ddd' }}><input style={{width: '90%'}} value={editingDonHang.kocs.ho_ten} onChange={e => setEditingDonHang({...editingDonHang, kocs: {...editingDonHang.kocs, ho_ten: e.target.value}})} /></td>
                      <td style={{ width: `${columnWidths.idKenh}px`, padding: '12px', border: '1px solid #ddd' }}><input style={{width: '90%'}} value={editingDonHang.kocs.id_kenh} onChange={e => setEditingDonHang({...editingDonHang, kocs: {...editingDonHang.kocs, id_kenh: e.target.value}})} /></td>
                      <td style={{ width: `${columnWidths.sdt}px`, padding: '12px', border: '1px solid #ddd' }}><input style={{width: '90%'}} value={editingDonHang.kocs.sdt} onChange={e => setEditingDonHang({...editingDonHang, kocs: {...editingDonHang.kocs, sdt: e.target.value}})} /></td>
                      <td style={{ width: `${columnWidths.diaChi}px`, padding: '12px', border: '1px solid #ddd' }}><input style={{width: '90%'}} value={editingDonHang.kocs.dia_chi} onChange={e => setEditingDonHang({...editingDonHang, kocs: {...editingDonHang.kocs, dia_chi: e.target.value}})} /></td>
                      <td style={{ width: `${columnWidths.cccd}px`, padding: '12px', border: '1px solid #ddd' }}><input style={{width: '90%'}} value={editingDonHang.kocs.cccd} onChange={e => setEditingDonHang({...editingDonHang, kocs: {...editingDonHang.kocs, cccd: e.target.value}})} /></td>
                      <td style={{ width: `${columnWidths.brand}px`, padding: '12px', border: '1px solid #ddd' }}>{[...new Set(donHang.chitiettonguis.map(ct => ct.sanphams?.brands?.ten_brand))].map(b => <div key={b}>{b}</div>)}</td>
                      <td style={{ width: `${columnWidths.sanPham}px`, padding: '12px', border: '1px solid #ddd' }}>{donHang.chitiettonguis.map(ct => <div key={ct.sanphams?.id}>{ct.sanphams?.ten_sanpham}</div>)}</td>
                      <td style={{ width: `${columnWidths.nhanSu}px`, padding: '12px', border: '1px solid #ddd' }}>{donHang.nhansu?.ten_nhansu}</td>
                      <td style={{ width: `${columnWidths.loaiShip}px`, padding: '12px', border: '1px solid #ddd' }}>
                        <select style={{width: '100%'}} value={editingDonHang.loai_ship} onChange={e => setEditingDonHang({...editingDonHang, loai_ship: e.target.value})}>
                          <option>Ship thường</option><option>Hỏa tốc</option>
                        </select>
                      </td>
                      <td style={{ width: `${columnWidths.trangThai}px`, padding: '12px', border: '1px solid #ddd' }}>
                        <select style={{width: '100%'}} value={editingDonHang.trang_thai} onChange={e => setEditingDonHang({...editingDonHang, trang_thai: e.target.value})}>
                          <option>Chưa đóng đơn</option><option>Đã đóng đơn</option>
                        </select>
                      </td>
                      <td style={{ width: `${columnWidths.hanhDong}px`, padding: '12px', border: '1px solid #ddd' }}>
                        <button onClick={handleUpdate} style={{padding: '5px'}}>Lưu</button>
                        <button onClick={handleCancelEdit} style={{padding: '5px'}}>Hủy</button>
                      </td>
                    </>
                  ) : ( // Chế độ Xem
                    <>
                      <td style={{ width: `${columnWidths.stt}px`, padding: '12px', border: '1px solid #ddd' }}>{index + 1}</td>
                      <td style={{ width: `${columnWidths.ngayGui}px`, padding: '12px', border: '1px solid #ddd' }}>{new Date(donHang.ngay_gui).toLocaleString('vi-VN')}</td>
                      <td style={{ width: `${columnWidths.hoTenKOC}px`, padding: '12px', border: '1px solid #ddd', ...getCellStyle(donHang.kocs?.ho_ten, initialOrder?.kocs?.ho_ten) }}>{donHang.kocs?.ho_ten}</td>
                      <td style={{ width: `${columnWidths.idKenh}px`, padding: '12px', border: '1px solid #ddd', ...getCellStyle(donHang.kocs?.id_kenh, initialOrder?.kocs?.id_kenh) }}>{donHang.kocs?.id_kenh}</td>
                      <td style={{ width: `${columnWidths.sdt}px`, padding: '12px', border: '1px solid #ddd', ...getCellStyle(donHang.kocs?.sdt, initialOrder?.kocs?.sdt) }}>{donHang.kocs?.sdt}</td>
                      <td style={{ width: `${columnWidths.diaChi}px`, padding: '12px', border: '1px solid #ddd', ...getCellStyle(donHang.kocs?.dia_chi, initialOrder?.kocs?.dia_chi) }}>{donHang.kocs?.dia_chi}</td>
                      <td style={{ width: `${columnWidths.cccd}px`, padding: '12px', border: '1px solid #ddd', ...getCellStyle(donHang.kocs?.cccd, initialOrder?.kocs?.cccd) }}>{donHang.kocs?.cccd}</td>
                      <td style={{ width: `${columnWidths.brand}px`, padding: '12px', border: '1px solid #ddd' }}>{[...new Set(donHang.chitiettonguis.map(ct => ct.sanphams?.brands?.ten_brand))].map(tenBrand => ( <div key={tenBrand}>{tenBrand}</div> ))}</td>
                      <td style={{ width: `${columnWidths.sanPham}px`, padding: '12px', border: '1px solid #ddd' }}>{donHang.chitiettonguis.map(ct => ( <div key={ct.sanphams?.id}>{ct.sanphams?.ten_sanpham}</div> ))}</td>
                      <td style={{ width: `${columnWidths.nhanSu}px`, padding: '12px', border: '1px solid #ddd' }}>{donHang.nhansu?.ten_nhansu}</td>
                      <td style={{ width: `${columnWidths.loaiShip}px`, padding: '12px', border: '1px solid #ddd', ...getCellStyle(donHang.loai_ship, initialOrder?.loai_ship) }}>{donHang.loai_ship}</td>
                      <td style={{ width: `${columnWidths.trangThai}px`, padding: '12px', border: '1px solid #ddd', ...getCellStyle(donHang.trang_thai, initialOrder?.trang_thai) }}>{donHang.trang_thai}</td>
                      <td style={{ width: `${columnWidths.hanhDong}px`, padding: '1px solid #ddd' }}>
                        <button onClick={() => handleEdit(donHang)} style={{padding: '5px'}}>Sửa</button>
                      </td>
                    </>
                  )}
                </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default App;