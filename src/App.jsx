import { useState, useEffect, useMemo } from 'react';
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
        <Resizable width={width} height={0} onResize={onResize} draggableOpts={{ enableUserSelectHack: false }} axis="x">
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
  const [selectedSanPhams, setSelectedSanPhams] = useState({});
  const [selectedNhanSu, setSelectedNhanSu] = useState('');
  const [loaiShip, setLoaiShip] = useState('Ship thường');
  // State cho bảng
  const [donHangs, setDonHangs] = useState([]);
  const [selectedOrders, setSelectedOrders] = useState(new Set());
  // State cho các ô lọc
  const [filterIdKenh, setFilterIdKenh] = useState('');
  const [filterSdt, setFilterSdt] = useState('');
  const [filterBrand, setFilterBrand] = useState('');
  const [filterSanPham, setFilterSanPham] = useState('');
  const [filterNhanSu, setFilterNhanSu] = useState('');
  const [filterNgay, setFilterNgay] = useState('');
  const [filterLoaiShip, setFilterLoaiShip] = useState('');
  const [filterEditedStatus, setFilterEditedStatus] = useState('all');
  const [filterSanPhams, setFilterSanPhams] = useState([]);
  const [productSearchTerm, setProductSearchTerm] = useState('');
  // State cho tính năng tổng hợp
  const [summaryDate, setSummaryDate] = useState(new Date().toISOString().split('T')[0]);
  const [productSummary, setProductSummary] = useState([]);
  const [isSummarizing, setIsSummarizing] = useState(false);
  
  // State cho tính năng sửa
  const [editingDonHang, setEditingDonHang] = useState(null);
  const [isPastDeadlineForNewOrders] = useState(() => {
    const now = new Date();
    const hours = now.getHours();
    const minutes = now.getMinutes();
    return hours > 16 || (hours === 16 && minutes >= 30);
  });
  const [columnWidths, setColumnWidths] = useState({ select: 40, stt: 50, ngayGui: 160, hoTenKOC: 150, idKenh: 120, sdt: 120, diaChi: 250, cccd: 120, brand: 120, sanPham: 200, nhanSu: 120, loaiShip: 120, trangThai: 120, hanhDong: 100 });

  const handleResize = (key) => (e, { size }) => { setColumnWidths(prev => ({ ...prev, [key]: size.width })); };

  const loadInitialData = async () => {
    const { data, error } = await supabase.from('donguis').select(`
      id, ngay_gui, da_sua,
      loai_ship, original_loai_ship, trang_thai, original_trang_thai,
      koc_ho_ten, original_koc_ho_ten, koc_id_kenh, original_koc_id_kenh, 
      koc_sdt, original_koc_sdt, koc_dia_chi, original_koc_dia_chi, 
      koc_cccd, original_koc_cccd,
      nhansu ( ten_nhansu ),
      chitiettonguis ( id, so_luong, sanphams ( id, ten_sanpham, barcode, brands ( ten_brand ) ) )
    `).order('ngay_gui', { ascending: false });

    if(error) { alert("Lỗi tải dữ liệu: " + error.message) } 
    else if (data) {
      const totalOrders = data.length;
      const dataWithStt = data.map((item, index) => ({ ...item, originalStt: totalOrders - index }));
      setDonHangs(dataWithStt);
    }
  };

  useEffect(() => {
    async function getDropdownData() {
      const { data: brandsData } = await supabase.from('brands').select();
      if (brandsData) setBrands(brandsData);
      const { data: nhanSusData } = await supabase.from('nhansu').select();
      if (nhanSusData) setNhanSus(nhanSusData);
    }
    getDropdownData();
    loadInitialData();
  }, []);

  const displayedDonHangs = useMemo(() => {
    return donHangs.filter(donHang => {
        if (filterIdKenh && !donHang.koc_id_kenh?.toLowerCase().includes(filterIdKenh.toLowerCase())) return false;
        if (filterSdt && !donHang.koc_sdt?.includes(filterSdt)) return false;
        if (filterNhanSu && donHang.nhansu?.id !== filterNhanSu) return false;
        if (filterLoaiShip && donHang.loai_ship !== filterLoaiShip) return false;
        if (filterBrand && !donHang.chitiettonguis.some(ct => ct.sanphams?.brands?.id === parseInt(filterBrand, 10))) return false;
        if (filterSanPham && !donHang.chitiettonguis.some(ct => ct.sanphams?.id === filterSanPham)) return false;
        if (filterNgay && !donHang.ngay_gui.startsWith(filterNgay)) return false;
        if (filterEditedStatus !== 'all') {
            const hasBeenEdited = donHang.da_sua;
            if (filterEditedStatus === 'edited' && !hasBeenEdited) return false;
            if (filterEditedStatus === 'unedited' && hasBeenEdited) return false;
        }
        return true;
    });
  }, [donHangs, filterIdKenh, filterSdt, filterBrand, filterSanPham, filterNhanSu, filterNgay, filterLoaiShip, filterEditedStatus]);

  useEffect(() => {
    if (!selectedBrand) { setSanPhams([]); setSelectedSanPhams({}); return; }
    async function getSanPhams() { const { data } = await supabase.from('sanphams').select().eq('brand_id', selectedBrand); if (data) setSanPhams(data); }
    getSanPhams();
  }, [selectedBrand]);

  useEffect(() => {
    if (!filterBrand) { setFilterSanPhams([]); setFilterSanPham(''); return; }
    async function getFilterSanPhams() { const { data } = await supabase.from('sanphams').select().eq('brand_id', filterBrand); if (data) setFilterSanPhams(data); }
    getFilterSanPhams();
  }, [filterBrand]);
  
  const handleQuantityChange = (productId, newQuantity) => {
    const quantity = parseInt(newQuantity, 10);
    setSelectedSanPhams(prevSelected => { const newSelected = { ...prevSelected }; if (isNaN(quantity) || quantity <= 0) { delete newSelected[productId]; } else { newSelected[productId] = quantity; } return newSelected; });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (cccd.length !== 12 || !/^\d{12}$/.test(cccd)) { alert('Vui lòng nhập CCCD đủ 12 chữ số.'); return; }
    if (Object.keys(selectedSanPhams).length === 0) { alert('Vui lòng chọn ít nhất một sản phẩm với số lượng lớn hơn 0!'); return; }
    setIsLoading(true);
    try {
      const donGuiPayload = {
        koc_ho_ten: hoTen, original_koc_ho_ten: hoTen,
        koc_id_kenh: idKenh, original_koc_id_kenh: idKenh,
        koc_sdt: sdt, original_koc_sdt: sdt,
        koc_dia_chi: diaChi, original_koc_dia_chi: diaChi,
        koc_cccd: cccd, original_koc_cccd: cccd,
        nhansu_id: selectedNhanSu,
        loai_ship: loaiShip, original_loai_ship: loaiShip,
        trang_thai: 'Chưa đóng đơn', original_trang_thai: 'Chưa đóng đơn',
      };
      const { data: donGuiData, error: donGuiError } = await supabase.from('donguis').insert(donGuiPayload).select().single();
      if (donGuiError) throw donGuiError;

      const chiTietData = Object.entries(selectedSanPhams).map(([sanPhamId, soLuong]) => ({
        don_gui_id: donGuiData.id,
        sanpham_id: sanPhamId,
        so_luong: soLuong
      }));
      const { error: chiTietError } = await supabase.from('chitiettonguis').insert(chiTietData);
      if (chiTietError) throw chiTietError;

      alert('Tạo đơn gửi thành công!');
      setHoTen(''); setIdKenh(''); setSdt(''); setDiaChi(''); setCccd('');
      setSelectedBrand(''); setSelectedSanPhams({}); setSelectedNhanSu(''); setLoaiShip('Ship thường');
      await loadInitialData();
    } catch (error) {
      alert('Đã có lỗi xảy ra: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleIdKenhBlur = async () => { if (!idKenh) return; const { data } = await supabase.from('kocs').select().eq('id_kenh', idKenh).single(); if (data) { setHoTen(data.ho_ten); setSdt(data.sdt); setDiaChi(data.dia_chi); setCccd(data.cccd); } };
  const clearFilters = () => { setFilterIdKenh(''); setFilterSdt(''); setFilterBrand(''); setFilterSanPham(''); setFilterNhanSu(''); setFilterNgay(''); setFilterLoaiShip(''); setFilterEditedStatus('all'); };
  const handleGetSummary = async () => { if (!summaryDate) { alert('Vui lòng chọn ngày để tổng hợp!'); return; } setIsSummarizing(true); setProductSummary([]); const { data, error } = await supabase.rpc('get_product_summary_by_day', { target_day: summaryDate }); if (error) { alert('Lỗi khi lấy tổng hợp: ' + error.message); } else { setProductSummary(data); } setIsSummarizing(false); };
  const handleEdit = (donHang) => { setEditingDonHang({ ...donHang }); };
  const handleCancelEdit = () => { setEditingDonHang(null); };

  const handleUpdate = async () => {
    if (!editingDonHang) return;
    if (!editingDonHang.koc_cccd || editingDonHang.koc_cccd.length !== 12 || !/^\d{12}$/.test(editingDonHang.koc_cccd)) { alert('Vui lòng nhập CCCD đủ 12 chữ số.'); return; }
    
    const updatePayload = {
      koc_ho_ten: editingDonHang.koc_ho_ten,
      koc_id_kenh: editingDonHang.koc_id_kenh,
      koc_sdt: editingDonHang.koc_sdt,
      koc_dia_chi: editingDonHang.koc_dia_chi,
      koc_cccd: editingDonHang.koc_cccd,
      loai_ship: editingDonHang.loai_ship,
      trang_thai: editingDonHang.trang_thai,
      da_sua: true,
    };
    const { error } = await supabase.from('donguis').update(updatePayload).eq('id', editingDonHang.id);
    if (error) { alert('Lỗi cập nhật đơn gửi: ' + error.message); return; }

    await loadInitialData();
    setEditingDonHang(null);
  };

  const handleSelect = (orderId) => { setSelectedOrders(prevSelected => { const newSelected = new Set(prevSelected); if (newSelected.has(orderId)) { newSelected.delete(orderId); } else { newSelected.add(orderId); } return newSelected; }); };
  const handleSelectAll = (e) => { if (e.target.checked) { const allDisplayedIds = new Set(displayedDonHangs.map(dh => dh.id)); setSelectedOrders(allDisplayedIds); } else { setSelectedOrders(new Set()); } };
  const handleBulkUpdateStatus = async () => { if (selectedOrders.size === 0) { alert("Vui lòng chọn ít nhất một đơn hàng."); return; } const idsToUpdate = Array.from(selectedOrders); const { error } = await supabase.from('donguis').update({ trang_thai: 'Đã đóng đơn' }).in('id', idsToUpdate); if (error) { alert("Lỗi khi cập nhật hàng loạt: " + error.message); } else { setDonHangs(prevState => prevState.map(donHang => idsToUpdate.includes(donHang.id) ? { ...donHang, trang_thai: 'Đã đóng đơn' } : donHang )); setSelectedOrders(new Set()); alert(`Đã cập nhật trạng thái cho ${idsToUpdate.length} đơn hàng.`); } };
  
  // =================================================================
  // SỬA LỖI XUẤT FILE TẠI ĐÂY
  // =================================================================
  const handleExport = ({ data, headers, filename }) => {
    const orderedData = data.map(row => {
      const newRow = {};
      headers.forEach(header => {
        if (header.key) {
          newRow[header.label] = row[header.key];
        }
      });
      return newRow;
    });
    const worksheet = XLSX.utils.json_to_sheet(orderedData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1");
    XLSX.writeFile(workbook, filename);
  };

  const mainExportData = donHangs.flatMap((donHang) => {
    const baseData = {
      stt: donHang.originalStt,
      ngayGui: new Date(donHang.ngay_gui).toLocaleString('vi-VN'),
      tenKOC: donHang.koc_ho_ten,
      idKenh: donHang.koc_id_kenh,
      sdt: donHang.koc_sdt,
      diaChi: donHang.koc_dia_chi,
      cccd: donHang.koc_cccd,
      nhanSu: donHang.nhansu?.ten_nhansu,
      loaiShip: donHang.loai_ship,
      trangThai: donHang.trang_thai,
    };
    if (donHang.chitiettonguis.length === 0) { 
        return [{ ...baseData, sanPham: 'N/A', soLuong: 0, brand: 'N/A', barcode: 'N/A' }]; 
    }
    return donHang.chitiettonguis.map(ct => ({ 
        ...baseData,
        sanPham: ct.sanphams?.ten_sanpham, 
        soLuong: ct.so_luong, 
        brand: ct.sanphams?.brands?.ten_brand, 
        barcode: ct.sanphams?.barcode, 
    }));
  });
  
  const mainExportHeaders = [
    { label: "STT", key: "stt"},
    { label: "Ngày Gửi", key: "ngayGui" },
    { label: "Tên KOC", key: "tenKOC" },
    { label: "ID Kênh", key: "idKenh" },
    { label: "SĐT", key: "sdt" },
    { label: "Địa chỉ", key: "diaChi" },
    { label: "CCCD", key: "cccd" },
    { label: "Sản Phẩm", key: "sanPham" },
    { label: "Số Lượng", key: "soLuong"},
    { label: "Brand", key: "brand" },
    { label: "Barcode", key: "barcode" },
    { label: "Nhân Sự Gửi", key: "nhanSu" },
    { label: "Loại Ship", key: "loaiShip" },
    { label: "Trạng Thái", key: "trangThai" },
  ];

  const summaryExportHeaders = [ { label: "Sản Phẩm", key: "ten_san_pham" }, { label: "Barcode", key: "barcode" }, { label: "Brand", key: "ten_brand" }, { label: "Tổng Số Lượng", key: "total_quantity" } ];
  const headers = [ { key: 'select', label: <input type="checkbox" onChange={handleSelectAll} checked={selectedOrders.size > 0 && displayedDonHangs.length > 0 && selectedOrders.size === displayedDonHangs.length} /> }, { key: 'stt', label: 'STT' }, { key: 'ngayGui', label: 'Ngày Gửi' }, { key: 'hoTenKOC', label: 'Họ Tên KOC' }, { key: 'idKenh', label: 'ID Kênh' }, { key: 'sdt', label: 'SĐT' }, { key: 'diaChi', label: 'Địa chỉ' }, { key: 'cccd', label: 'CCCD' }, { key: 'brand', label: 'Brand' }, { key: 'sanPham', label: 'Sản Phẩm (SL)' }, { key: 'nhanSu', label: 'Nhân Sự Gửi' }, { key: 'loaiShip', label: 'Loại Ship' }, { key: 'trangThai', label: 'Trạng Thái' }, { key: 'hanhDong', label: 'Hành Động' }, ];

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
                {sanPhams.length > 0 ? sanPhams.filter(sp => sp.ten_sanpham.toLowerCase().includes(productSearchTerm.toLowerCase())).map(sp => (
                    <div key={sp.id} style={{ display: 'flex', alignItems: 'center', marginBottom: '5px' }}>
                      <label htmlFor={sp.id} style={{ flex: 1 }}>{sp.ten_sanpham}</label>
                      <input type="number" min="0" id={sp.id} value={selectedSanPhams[sp.id] || ''} onChange={(e) => handleQuantityChange(sp.id, e.target.value)} style={{ width: '60px', padding: '4px', textAlign: 'center' }} placeholder="0" />
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
            <button type="submit" disabled={isLoading || isPastDeadlineForNewOrders} style={{ width: '100%', padding: '10px', backgroundColor: (isLoading || isPastDeadlineForNewOrders) ? '#ccc' : '#007bff', color: 'white', border: 'none', borderRadius: '4px', fontSize: '16px', cursor: 'pointer', marginTop: '1rem' }}>{isLoading ? 'Đang xử lý...' : 'Gửi Đơn'}</button>
            {isPastDeadlineForNewOrders && (<p style={{ color: 'red', textAlign: 'center', marginTop: '0.5rem', fontWeight: 'bold' }}>Đã quá 16h30, không thể tạo đơn hàng mới.</p>)}
           </form>
        </div>
        <div style={{ flex: 1, padding: '2rem', border: '1px solid #ddd', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
            <h2 style={{ textAlign: 'center', color: '#333', marginBottom: '1.5rem' }}>Tổng Hợp Sản Phẩm</h2>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}><input type="date" value={summaryDate} onChange={e => setSummaryDate(e.target.value)} style={{ padding: '7px', flex: 1 }} /><button onClick={handleGetSummary} disabled={isSummarizing} style={{ padding: '8px 16px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>{isSummarizing ? 'Đang xử lý...' : 'Tổng hợp'}</button></div>
            <div style={{ marginTop: '1rem' }}>{productSummary.length > 0 ? (<><table style={{ width: '100%', borderCollapse: 'collapse' }}><thead style={{textAlign: 'left'}}><tr><th style={{padding: '8px', borderBottom: '1px solid #ddd'}}>Sản phẩm</th><th style={{padding: '8px', borderBottom: '1px solid #ddd'}}>Barcode</th><th style={{padding: '8px', borderBottom: '1px solid #ddd'}}>Brand</th><th style={{padding: '8px', borderBottom: '1px solid #ddd'}}>Số lượng</th></tr></thead><tbody>{productSummary.map(item => (<tr key={item.ten_san_pham}><td style={{padding: '8px', borderBottom: '1px solid #eee'}}>{item.ten_san_pham}</td><td style={{padding: '8px', borderBottom: '1px solid #eee'}}>{item.barcode}</td><td style={{padding: '8px', borderBottom: '1px solid #eee'}}>{item.ten_brand}</td><td style={{padding: '8px', borderBottom: '1px solid #eee', textAlign: 'center'}}><strong>{item.total_quantity}</strong></td></tr>))}</tbody></table><div style={{ marginTop: '1rem', textAlign: 'right' }}><button onClick={() => handleExport({ data: productSummary, headers: summaryExportHeaders, filename: `tong-hop-san-pham-${summaryDate}.xlsx`})} style={{ padding: '8px 16px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Xuất File Tổng Hợp</button></div></>) : (<p style={{ textAlign: 'center', color: '#888' }}>Chưa có dữ liệu cho ngày đã chọn.</p>)}</div>
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
          <select value={filterEditedStatus} onChange={e => setFilterEditedStatus(e.target.value)} style={{ padding: '8px' }}>
            <option value="all">Tất cả</option>
            <option value="edited">Đơn đã sửa</option>
            <option value="unedited">Đơn chưa sửa</option>
          </select>
          <input type="date" value={filterNgay} onChange={e => setFilterNgay(e.target.value)} style={{ padding: '7px' }} />
          <div style={{display: 'flex', gap: '0.5rem'}}>
            <button onClick={clearFilters} style={{ flex: 1, padding: '8px 16px', backgroundColor: '#6c757d', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Xóa Lọc</button>
            <button onClick={handleBulkUpdateStatus} disabled={selectedOrders.size === 0} style={{ flex: 1, padding: '8px 16px', backgroundColor: selectedOrders.size > 0 ? '#007bff' : '#ccc', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                Đóng ({selectedOrders.size}) đơn
            </button>
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
                  <ResizableHeader key={header.key} width={columnWidths[header.key]} onResize={handleResize(header.key)}>
                    {header.label}
                  </ResizableHeader>
                 ))}
              </tr>
            </thead>
            <tbody>
              {displayedDonHangs.map((donHang) => {
                const getCellStyle = (currentValue, originalValue) => {
                    return (originalValue !== null && currentValue !== originalValue) ? { backgroundColor: 'red', color: 'white' } : {};
                };
                
                const sanPhamDisplay = donHang.chitiettonguis.map(ct => (
                  <div key={ct.sanphams?.id}>
                    {ct.sanphams?.ten_sanpham} (SL: {ct.so_luong})
                  </div>
                ));

                return (
                <tr key={donHang.id}>
                  {editingDonHang?.id === donHang.id ?
                  ( // Chế độ Sửa
                    <>
                      <td style={{ width: `${columnWidths.select}px`, padding: '12px', border: '1px solid #ddd' }}></td>
                      <td style={{ width: `${columnWidths.stt}px`, padding: '12px', border: '1px solid #ddd' }}>{donHang.originalStt}</td>
                      <td style={{ width: `${columnWidths.ngayGui}px`, padding: '12px', border: '1px solid #ddd' }}>{new Date(donHang.ngay_gui).toLocaleString('vi-VN')}</td>
                      <td style={{ width: `${columnWidths.hoTenKOC}px`, padding: '12px', border: '1px solid #ddd' }}><input style={{width: '90%'}} value={editingDonHang.koc_ho_ten} onChange={e => setEditingDonHang({...editingDonHang, koc_ho_ten: e.target.value})} /></td>
                      <td style={{ width: `${columnWidths.idKenh}px`, padding: '12px', border: '1px solid #ddd' }}><input style={{width: '90%'}} value={editingDonHang.koc_id_kenh} onChange={e => setEditingDonHang({...editingDonHang, koc_id_kenh: e.target.value})} /></td>
                      <td style={{ width: `${columnWidths.sdt}px`, padding: '12px', border: '1px solid #ddd' }}><input style={{width: '90%'}} value={editingDonHang.koc_sdt} onChange={e => setEditingDonHang({...editingDonHang, koc_sdt: e.target.value})} /></td>
                      <td style={{ width: `${columnWidths.diaChi}px`, padding: '12px', border: '1px solid #ddd' }}><input style={{width: '90%'}} value={editingDonHang.koc_dia_chi} onChange={e => setEditingDonHang({...editingDonHang, koc_dia_chi: e.target.value})} /></td>
                      <td style={{ width: `${columnWidths.cccd}px`, padding: '12px', border: '1px solid #ddd' }}><input style={{width: '90%'}} value={editingDonHang.koc_cccd} onChange={e => setEditingDonHang({...editingDonHang, koc_cccd: e.target.value})} /></td>
                      <td style={{ width: `${columnWidths.brand}px`, padding: '12px', border: '1px solid #ddd' }}>{[...new Set(donHang.chitiettonguis.map(ct => ct.sanphams?.brands?.ten_brand))].map(b => <div key={b}>{b}</div>)}</td>
                      <td style={{ width: `${columnWidths.sanPham}px`, padding: '12px', border: '1px solid #ddd' }}>{sanPhamDisplay}</td>
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
                      <td style={{ width: `${columnWidths.select}px`, padding: '12px', border: '1px solid #ddd' }}>
                        <input type="checkbox" checked={selectedOrders.has(donHang.id)} onChange={() => handleSelect(donHang.id)} />
                      </td>
                      <td style={{ width: `${columnWidths.stt}px`, padding: '12px', border: '1px solid #ddd' }}>{donHang.originalStt}</td>
                      <td style={{ width: `${columnWidths.ngayGui}px`, padding: '12px', border: '1px solid #ddd' }}>{new Date(donHang.ngay_gui).toLocaleString('vi-VN')}</td>
                      <td style={{ width: `${columnWidths.hoTenKOC}px`, padding: '12px', border: '1px solid #ddd', ...getCellStyle(donHang.koc_ho_ten, donHang.original_koc_ho_ten) }}>{donHang.koc_ho_ten}</td>
                      <td style={{ width: `${columnWidths.idKenh}px`, padding: '12px', border: '1px solid #ddd', ...getCellStyle(donHang.koc_id_kenh, donHang.original_koc_id_kenh) }}>{donHang.koc_id_kenh}</td>
                      <td style={{ width: `${columnWidths.sdt}px`, padding: '12px', border: '1px solid #ddd', ...getCellStyle(donHang.koc_sdt, donHang.original_koc_sdt) }}>{donHang.koc_sdt}</td>
                      <td style={{ width: `${columnWidths.diaChi}px`, padding: '12px', border: '1px solid #ddd', ...getCellStyle(donHang.koc_dia_chi, donHang.original_koc_dia_chi) }}>{donHang.koc_dia_chi}</td>
                      <td style={{ width: `${columnWidths.cccd}px`, padding: '12px', border: '1px solid #ddd', ...getCellStyle(donHang.koc_cccd, donHang.original_koc_cccd) }}>{donHang.koc_cccd}</td>
                      <td style={{ width: `${columnWidths.brand}px`, padding: '12px', border: '1px solid #ddd' }}>{[...new Set(donHang.chitiettonguis.map(ct => ct.sanphams?.brands?.ten_brand))].map(tenBrand => ( <div key={tenBrand}>{tenBrand}</div> ))}</td>
                      <td style={{ width: `${columnWidths.sanPham}px`, padding: '12px', border: '1px solid #ddd' }}>{sanPhamDisplay}</td>
                      <td style={{ width: `${columnWidths.nhanSu}px`, padding: '12px', border: '1px solid #ddd' }}>{donHang.nhansu?.ten_nhansu}</td>
                      <td style={{ width: `${columnWidths.loaiShip}px`, padding: '12px', border: '1px solid #ddd', ...getCellStyle(donHang.loai_ship, donHang.original_loai_ship) }}>{donHang.loai_ship}</td>
                      <td style={{ width: `${columnWidths.trangThai}px`, padding: '12px', border: '1px solid #ddd', ...getCellStyle(donHang.trang_thai, donHang.original_trang_thai) }}>{donHang.trang_thai}</td>
                      <td style={{ width: `${columnWidths.hanhDong}px`, padding: '12px', border: '1px solid #ddd' }}>
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