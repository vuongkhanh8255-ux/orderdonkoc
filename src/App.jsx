// Thay thế toàn bộ nội dung file này (ví dụ: App.jsx/App.js)

import { useState, useEffect, useMemo } from 'react';
import { supabase } from './supabaseClient';
import * as XLSX from 'xlsx';
import { Resizable } from 'react-resizable';
import 'react-resizable/css/styles.css';

// Cấu hình Phân trang
const ORDERS_PER_PAGE = 50; 

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

// --- HÀM CHUYỂN SỐ THÀNH CHỮ (Giữ nguyên logic của bạn) ---
const mangso = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];
function dochangchuc(so, daydu) {
    let chuoi = "";
    let chuc = Math.floor(so / 10);
    let donvi = so % 10;
    if (chuc > 1) {
        chuoi = " " + mangso[chuc] + " mươi";
        if (donvi == 1) {
            chuoi += " mốt";
        }
    } else if (chuc == 1) {
        chuoi = " mười";
        if (donvi == 5) {
            chuoi += " lăm";
        }
    } else if (daydu && donvi > 0) {
        chuoi = " lẻ";
    }
    if (donvi == 5 && chuc > 1) {
        chuoi += " lăm";
    } else if (donvi > 0 && donvi != 1 && donvi != 5) {
        chuoi += " " + mangso[donvi];
    } else if (donvi == 1 && chuc < 1) {
        chuoi += " " + mangso[donvi];
    }
    return chuoi;
}

function dochangtram(so, daydu) {
    let chuoi = "";
    let tram = Math.floor(so / 100);
    so = so % 100;
    if (daydu || tram > 0) {
        chuoi = " " + mangso[tram] + " trăm";
        chuoi += dochangchuc(so, true);
    } else {
        chuoi = dochangchuc(so, false);
    }
    return chuoi;
}

function dochangtrieu(so, daydu) {
    let chuoi = "";
    let trieu = Math.floor(so / 1000000);
    so = so % 1000000;
    if (trieu > 0) {
        chuoi = dochangtram(trieu, daydu) + " triệu";
        daydu = true;
    }
    let nghin = Math.floor(so / 1000);
    so = so % 1000;
    if (nghin > 0) {
        chuoi += dochangtram(nghin, daydu) + " nghìn";
        daydu = true;
    }
    if (so > 0) {
        chuoi += dochangtram(so, daydu);
    }
    return chuoi;
}

function to_vietnamese_string(so) {
    if (so == 0) return mangso[0].charAt(0).toUpperCase() + mangso[0].slice(1);
    let chuoi = "", hauto = "";
    do {
        let ty = so % 1000000000;
        so = Math.floor(so / 1000000000);
        if (so > 0) {
            chuoi = dochangtram(ty, true) + hauto + chuoi;
        } else {
            chuoi = dochangtram(ty, false) + hauto + chuoi;
        }
        hauto = " tỷ";
    } while (so > 0);
    let finalString = chuoi.trim();
    return finalString.charAt(0).toUpperCase() + finalString.slice(1);
}
// --- KẾT THÚC HÀM CHUYỂN SỐ THÀNH CHỮ ---


function App() {
  // =================================================================
  // STATE CHUNG
  // =================================================================
  const [brands, setBrands] = useState([]);
  const [nhanSus, setNhanSus] = useState([]);
  const [sanPhams, setSanPhams] = useState([]);
  // Chỉ còn 2 chế độ: 'orders' hoặc 'contract'
  const [currentView, setCurrentView] = useState('orders');
  // =================================================================
  // STATE CHO TAB ORDER & PHÂN TRANG (PAGINATION)
  // =================================================================
  const [isLoading, setIsLoading] = useState(false);
  const [hoTen, setHoTen] = useState('');
  const [idKenh, setIdKenh] = useState('');
  const [sdt, setSdt] = useState('');
  const [diaChi, setDiaChi] = useState('');
  const [cccd, setCccd] = useState('');
  const [selectedBrand, setSelectedBrand] = useState('');
  const [selectedSanPhams, setSelectedSanPhams] = useState({});
  const [selectedNhanSu, setSelectedNhanSu] = useState('');
  const [loaiShip, setLoaiShip] = useState('Ship thường');
  const [donHangs, setDonHangs] = useState([]);
  const [selectedOrders, setSelectedOrders] = new useState(new Set());
  // State Phân Trang
  const [currentPage, setCurrentPage] = useState(1);
  const [totalOrderCount, setTotalOrderCount] = useState(0);
  // State Bộ Lọc
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
  // State Báo cáo/Tổng hợp
  const [summaryDate, setSummaryDate] = useState(new Date().toISOString().split('T')[0]);
  const [productSummary, setProductSummary] = useState({ 'Ship thường': [], 'Hỏa tốc': [] });
  const [rawSummaryData, setRawSummaryData] = useState([]);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [reportMonth, setReportMonth] = useState(new Date().getMonth() + 1);
  const [reportYear, setReportYear] = useState(new Date().getFullYear());
  const [reportData, setReportData] = useState({ reportRows: [], brandHeaders: [] });
  const [isReportLoading, setIsReportLoading] = useState(false);
  const [sortConfig, setSortConfig] = useState({ key: 'chi_phi_tong', direction: 'desc' });
  const [editingDonHang, setEditingDonHang] = useState(null);
  const [isPastDeadlineForNewOrders] = useState(() => {
    const now = new Date();
    const hours = now.getHours();
    const minutes = now.getMinutes();
    return hours > 16 || (hours === 16 && minutes >= 30);
  });
  const [columnWidths, setColumnWidths] = useState({ select: 40, stt: 50, ngayGui: 160, hoTenKOC: 150, cccd: 120, idKenh: 120, sdt: 120, diaChi: 250, brand: 120, sanPham: 200, nhanSu: 120, loaiShip: 120, trangThai: 120, hanhDong: 100 });
  // =================================================================
  // STATE CHO FORM TẠO HỢP ĐỒNG (Contract)
  // =================================================================
  const [contractData, setContractData] = useState({
        benB_ten: '', benB_sdt: '', benB_diaChi: '', benB_cccd: '', benB_mst: '', benB_stk: '', benB_nganHang: '', benB_nguoiThuHuong: '',
        soHopDong: '', ngayKy: new Date().toISOString().split('T')[0], ngayThucHien: new Date().toISOString().split('T')[0],
        sanPham: '', linkSanPham: '', linkKenh: '', soLuong: 1, donGia: 0,
        // Bên A là hằng số
        benA_ten: "CÔNG TY TNHH ĐỘNG \nHỌC STELLA",
        benA_diaChi: "9/11 Nguyễn Huy Tưởng, Phường Gia Định, Thành phố Hồ Chí Minh",
        benA_mst: "0314421133",
        benA_nguoiDaiDien: "VÕ HUÂN",
        benA_chucVu: "Giám đốc",
  });
  const [contractHTML, setContractHTML] = useState('');
  const [isOutputVisible, setIsOutputVisible] = useState(false);
  const [copyMessage, setCopyMessage] = useState({ text: '', type: 'hidden' });
  const handleResize = (key) => (e, { size }) => { setColumnWidths(prev => ({ ...prev, [key]: size.width }));
  };
  // =================================================================
  // HÀM TẢI DỮ LIỆU ĐÃ SỬA VỚI PHÂN TRANG (SERVER-SIDE FILTERING)
  // =================================================================

  const loadInitialData = async () => { 
    setIsLoading(true);
    const startIndex = (currentPage - 1) * ORDERS_PER_PAGE;
    const endIndex = startIndex + ORDERS_PER_PAGE - 1;
    let query = supabase.from('donguis').select(`
      id, ngay_gui, da_sua,
      loai_ship, original_loai_ship, trang_thai, original_trang_thai,
      koc_ho_ten, original_koc_ho_ten, koc_id_kenh, original_koc_id_kenh, 
      koc_sdt, original_koc_sdt, koc_dia_chi, original_koc_dia_chi, 
      koc_cccd, original_koc_cccd,
      nhansu ( id, ten_nhansu ),
      chitiettonguis ( id, so_luong, 
      sanphams ( id, ten_sanpham, barcode, gia_tien, brands ( id, ten_brand ) ) )
    `, { count: 'exact' });
    // --- ÁP DỤNG CÁC BỘ LỌC ĐƠN GIẢN (SERVER-SIDE) ---
    if (filterIdKenh) {
        query = query.ilike('koc_id_kenh', `%${filterIdKenh}%`);
    }
    if (filterSdt) {
        query = query.ilike('koc_sdt', `%${filterSdt}%`);
    }
    if (filterNhanSu) {
        query = query.eq('nhansu_id', filterNhanSu);
    }
    if (filterLoaiShip) {
        query = query.eq('loai_ship', filterLoaiShip);
    }
    
    // KHẮC PHỤC LỖI LỌC THEO NGÀY: SỬ DỤNG RANGE (Server-side)
    if (filterNgay) {
        // filterNgay: VD '2025-11-04'
        const startDate = `${filterNgay}T00:00:00.000Z`;
        // Bắt đầu ngày
        const endDate = `${filterNgay}T23:59:59.999Z`;
        // Kết thúc ngày

        // Áp dụng bộ lọc cho phạm vi ngày
        query = query
            .gte('ngay_gui', startDate) // Greater Than or Equal (Lớn hơn hoặc bằng)
            .lte('ngay_gui', endDate);
        // Less Than or Equal (Nhỏ hơn hoặc bằng)
    }
    
    if (filterEditedStatus !== 'all') {
        const isEdited = filterEditedStatus === 'edited';
        query = query.eq('da_sua', isEdited);
    }

    // 1. Lấy tổng số đơn hàng (với bộ lọc)
    const { count, error: countError } = await query.order('ngay_gui', { ascending: false }).range(0, 0);
    // Lấy count trước

    if (countError) {
        alert("Lỗi tải tổng số đơn hàng: " + countError.message);
        setIsLoading(false);
        return;
    }
    setTotalOrderCount(count || 0); 
    
    // 2. Tải dữ liệu cho trang hiện tại
    const { data, error } = await query
        .order('ngay_gui', { ascending: false })
        .range(startIndex, endIndex);
    if(error) { 
        alert("Lỗi tải dữ liệu Order: " + error.message) 
    } 
    else if (data) {
      
      // Tính STT DỰ TRÊN TỔNG SỐ VÀ VỊ TRÍ TRONG TRANG
      const dataWithStt = data.map((item, index) => ({ 
          ...item, 
          originalStt: (count || 0) - (startIndex + index) 
     
      }));
      
      // --- ÁP DỤNG CÁC BỘ LỌC PHỨC TẠP (CLIENT-SIDE) ---
      // Áp dụng lọc Brand và Sản phẩm trên 50 đơn hàng đã tải về
      const filteredData = dataWithStt.filter(donHang => {
          if (filterBrand && !donHang.chitiettonguis.some(ct => String(ct.sanphams?.brands?.id) === filterBrand)) return false;
          if (filterSanPham && !donHang.chitiettonguis.some(ct => ct.sanphams?.id === filterSanPham)) return false;
          return true;
   
      });
      setDonHangs(filteredData);
    }
    setIsLoading(false); 
  };
  // KHÔNG CẦN HÀM loadBookings NỮA VÌ CHÚNG TA ĐÃ LOẠI BỎ CHỨC NĂNG QUẢN LÝ BOOKING CŨ

  // =================================================================
  // HÀM TẢI SẢN PHẨM THEO BRAND (ĐÃ THÊM)
  // =================================================================
  const loadSanPhamsByBrand = async (brandId) => {
      if (!brandId) {
          setSanPhams([]); // Reset nếu không có Brand nào được chọn
          setFilterSanPhams([]); // Reset lọc
          return;
      }
      // Tải sản phẩm theo Brand ID
      const { data: sanPhamsData, error } = await supabase
          .from('sanphams')
          .select(`id, ten_sanpham, barcode, gia_tien`) // Lấy cả gia_tien cho đầy đủ (nếu cần)
          .eq('brand_id', brandId); // Lọc theo brand_id
          
      if (error) {
          console.error("Lỗi tải sản phẩm theo Brand:", error.message);
      } else {
          setSanPhams(sanPhamsData || []);
          setFilterSanPhams(sanPhamsData || []); // Cập nhật luôn cho bộ lọc
      }
  };


  // =================================================================
  // USE EFFECT CHUNG & LỌC
  // =================================================================

  useEffect(() => {
    async function getAllInitialData() {
      // Tải dữ liệu chung
      const { data: brandsData } = await supabase.from('brands').select();
      if (brandsData) setBrands(brandsData);
      const { data: nhanSusData } = await supabase.from('nhansu').select();
      if (nhanSusData) 
      setNhanSus(nhanSusData);
 
      
      // Chỉ gọi loadInitialData
      loadInitialData();
    }
    getAllInitialData();
  }, []);
  
  // Effect theo dõi PAGE và FILTERS để tải lại dữ liệu
  useEffect(() => {
    // Tải lại dữ liệu khi trang thay đổi, HOẶC bất kỳ bộ lọc nào thay đổi
    loadInitialData();
  }, [currentPage, filterIdKenh, filterSdt, filterNhanSu, filterNgay, filterLoaiShip, filterEditedStatus, filterBrand, filterSanPham]);
  
  // Effect để reset trang về 1 khi các filter thay đổi 
  useEffect(() => {
    // Khi bất kỳ filter nào thay đổi, nếu trang KHÔNG phải là 1, set về 1
    if (currentPage !== 1) {
        setCurrentPage(1);
    }
    // Nếu currentPage đã là 1, useEffect trên sẽ tự động gọi loadInitialData với filter mới.
  }, [filterIdKenh, filterSdt, filterNhanSu, filterNgay, filterLoaiShip, filterEditedStatus, filterBrand, filterSanPham]);

  // =================================================================
  // EFFECT TẢI SẢN PHẨM THEO BRAND (ĐÃ SỬA LỖI MULTI-BRAND)
  // =================================================================
  useEffect(() => {
      // Gọi hàm loadSanPhamsByBrand mỗi khi selectedBrand thay đổi
      loadSanPhamsByBrand(selectedBrand);
      // GIỮ LẠI: Chỉ reset thanh tìm kiếm để người dùng dễ dàng tìm kiếm trong Brand mới
      setProductSearchTerm(''); 
      // ĐÃ BỎ: setSelectedSanPhams({}) để giữ các sản phẩm đã chọn của Brand cũ.
  }, [selectedBrand]);
  
  // =================================================================
  // LOGIC HỢP ĐỒNG MỚC
  // =================================================================

  const handleContractFormChange = (e) => {
    // Xử lý cả input type="number"
    const value = (e.target.type === 'number') ?
    parseFloat(e.target.value) || 0 : e.target.value;
    setContractData({ ...contractData, [e.target.id]: value });
  };
  const handleGenerateContract = (event) => {
    event.preventDefault();
    
    const data = contractData;
    const formatCurrency = (num) => num.toLocaleString('vi-VN');
    // Tính toán Giá trị
    const tongGiaTri = data.soLuong * data.donGia;
    const tongCong = Math.round(tongGiaTri / 0.9);
    const thueTNCN = tongCong - tongGiaTri;
    const thucTeThanhToan = tongGiaTri;

    const tongCongChu = to_vietnamese_string(tongCong) + ' đồng';
    const thueTNCNChu = to_vietnamese_string(thueTNCN) + ' đồng';
    const thucTeThanhToanChu = to_vietnamese_string(thucTeThanhToan) + ' đồng chẵn';
    const formatDate = (dateString) => {
        const dateObj = new Date(dateString);
        const ngay = String(dateObj.getDate()).padStart(2, '0');
        const thang = String(dateObj.getMonth() + 1).padStart(2, '0');
        const nam = dateObj.getFullYear();
        return { ngay, thang, nam, full: `ngày ${ngay} tháng ${thang} năm ${nam}` };
    };
    const ngayKy = formatDate(data.ngayKy);
    const ngayThucHien = formatDate(data.ngayThucHien);
    
    // --- MẪU HỢP ĐỒNG DẠNG HTML ---
    const contractTemplate = `
        <style>
            /* CSS Tích hợp từ file Hợp Đồng */
            #contractContent {
                background-color: white;
                line-height: 1.6;
                font-family: 'Times New Roman', Times, serif;
                font-size: 13pt;
            }
            #contractContent table {
                width: 100%;
                border-collapse: collapse;
                border: 1px solid black;
            }
            #contractContent th, #contractContent td {
                border: 1px solid black;
                padding: 8px;
                vertical-align: top;
            }
            #contractContent .no-border-table, #contractContent .no-border-table td {
                 border: none !important;
                padding: 2px 0;
            }
            #contractContent h1, h2 {
                text-align: center;
                font-weight: bold;
            }
            #contractContent .center-text {
                text-align: center;
            }
            #contractContent .bold-text {
                font-weight: bold;
            }
            @media print {
                body * { visibility: hidden;
            }
                #outputContainer, #outputContainer * { visibility: visible;
            }
                #outputContainer { position: absolute;
            left: 0; top: 0; width: 100%; height: auto; box-shadow: none; border: none;
            }
                #contractContent { max-height: none;
            overflow: visible; }
            }
        </style>
        <div id="contractContent">
            <div class="center-text">
                <p class="bold-text">CỘNG HOÀ XÃ HỘI CHỦ NGHĨA VIỆT NAM</p>
                <p class="bold-text">Độc lập - Tự do - Hạnh phúc</p>
        
                <p>---- o0o ----</p>
            </div>
            <br>
            <h2>HỢP ĐỒNG DỊCH VỤ</h2>
            <p class="center-text">Số: ${data.soHopDong}</p>
            <br>
            <p>Căn cứ Bộ luật Dân 
sự 2015 số 91/2015/QH13 ngày 24/11/2015;</p>
   
            <p>Căn cứ Luật Thương Mại số 36/2005/QH11 ngày 14/06/2005;</p>
            <p>Căn cứ Luật Quảng Cáo số 16/2012/QH13 ngày 21/06/2012 và các văn bản hướng dẫn liên quan;</p>
            <p>Căn cứ nhu cầu và khả năng của các bên</p>
            <br>
           
            <p>Hôm nay, ${ngayKy.full}, chúng tôi gồm:</p>
     
        
            <table class="no-border-table" style="width: 100%;">
                <tr>
                    <td style="width: 20%;"
class="bold-text">BÊN A</td>
                    <td style="width: 80%;"
class="bold-text">: ${data.benA_ten.toUpperCase()}</td>
                </tr>
                <tr>
                    <td>Địa chỉ</td>
                    <td>: ${data.benA_diaChi}</td>
                </tr>
         
                <tr>
                    <td>Mã số thuế</td>
                    <td>: ${data.benA_mst}</td>
                </tr>
                 <tr>
        
                 <td>Người đại diện</td>
                    <td>: <span class="bold-text">${data.benA_nguoiDaiDien.toUpperCase()}</span> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
Chức vụ: ${data.benA_chucVu}</td>
                </tr>
            </table>
            <p>Và</p>
            <table class="no-border-table" style="width: 100%;">
                <tr>
                    <td style="width: 20%;"
class="bold-text">BÊN B</td>
                    <td style="width: 80%;"
class="bold-text">: ${data.benB_ten.toUpperCase()}</td>
                </tr>
                <tr>
                    <td>Địa chỉ</td>
                    <td>: ${data.benB_diaChi}</td>
                </tr>
         
                 <tr>
                    <td>SĐT</td>
                    <td>: ${data.benB_sdt}</td>
                </tr>
                 <tr>
         
                <td>CCCD</td>
                    <td>: ${data.benB_cccd}</td>
                </tr>
                 <tr>
                    <td>MST</td>
 
                    <td>: ${data.benB_mst}</td>
   
                 </tr>
                <tr>
                    <td>Số tài khoản</td>
                    <td>: ${data.benB_stk}</td>
 
                </tr>
            
                 <tr>
                    <td>Ngân hàng</td>
                    <td>: ${data.benB_nganHang.toUpperCase()}</td>
              
   </tr>
                 <tr>
                    <td>Người 
                thụ hưởng</td>
                    <td>: ${data.benB_nguoiThuHuong.toUpperCase()}</td>
                </tr>
      
       </table>
            <br>
            <p>Hai Bên thống nhất ký kết hợp đồng với các điều khoản và điều kiện sau đây:</p>
          
            <p class="bold-text">ĐIỀU 1: NỘI DUNG HỢP ĐỒNG</p>
            <p>1.1.
Bên A mời Bên B đồng ý nhận cung cấp dịch vụ quảng cáo và Bên A đồng ý sử dụng dịch vụ quảng cáo trên kênh của B, cụ thể như sau:</p>
            <p style="padding-left: 20px;">a.
Thời gian: ${ngayThucHien.ngay}/${ngayThucHien.thang}/${ngayThucHien.nam}</p>
            <p style="padding-left: 20px;">b.
Sản phẩm: ${data.sanPham}</p>
            <p style="padding-left: 20px;">c.
Link sản phẩm: ${data.linkSanPham}</p>
            <p style="padding-left: 20px;">d.
Nội dung công việc cụ thể:</p>
            
            <table>
                <thead>
                    <tr>
                        <th class="center-text">STT</th>
          
                        <th class="center-text">Link kênh Tiktok</th>
                        <th class="center-text">Hạng mục</th>
                        <th class="center-text">Số lượng</th>
                     
                    <th class="center-text">Đơn giá</th>
     
                    </tr>
                </thead>
                <tbody>
                    <tr>
                  
                    <td class="center-text">1</td>
        
                        <td>${data.linkKenh}</td>
                        <td class="center-text">video</td>
                        <td class="center-text">${String(data.soLuong).padStart(2, '0')}</td>
          
                        <td style="text-align: right;">${formatCurrency(data.donGia)}</td>
       
                    </tr>
                    <tr>
                        <td colspan="4" class="bold-text">Tổng giá trị hợp đồng</td>
       
                        <td style="text-align: right;"
class="bold-text">${formatCurrency(tongGiaTri)}</td>
                    </tr>
                    <tr>
                        <td colspan="4">Thuế TNCN 10%</td>
                        <td style="text-align: right;">${formatCurrency(thueTNCN)}</td>
       
                    </tr>
                    <tr>
                        <td colspan="4" class="bold-text">TỔNG CỘNG</td>
                        <td style="text-align: right;"
class="bold-text">${formatCurrency(tongCong)}</td>
                    </tr>
                </tbody>
            </table>
            <p><i>(Bằng chữ: ${tongCongChu}.)</i></p>

            <p>1.2.
Nội dung nghiệm thu công việc:</p>
             <table>
                <thead>
                    <tr>
                        <th class="center-text">STT</th>
                     
                    <th class="center-text">Hạng mục</th>
                        <th class="center-text">Nội dung nghiệm thu</th>
                    </tr>
                </thead>
              
                <tbody>
               
                <tr>
                        <td class="center-text">1</td>
                        <td>Demo (video)</td>
                 
                        <td>Gửi Demo trước từ 3-5 ngày kể từ ngày đăng video</td>
           
                    </tr>
                     <tr>
                        <td class="center-text">2</td>
      
                        <td>Link Post (Url)</td>
                   
                        <td>Check video đã gắn đúng link sản phẩm</td>
                    </tr>
          
                    <tr>
                        <td class="center-text">3</td>
                       
                    <td>Cung cấp mã quảng cáo</td>
                  
                        <td>Code ads 365 ngày hoặc uỷ quyền kênh</td>
                    </tr>
                </tbody>
            </table>
       
         
            <p class="bold-text">ĐIỀU 2: GIÁ TRỊ HỢP ĐỒNG VÀ THANH TOÁN</p>
  
            <p>2.1.
Giá trị và thời gian thanh toán:</p>
            <p style="padding-left: 20px;">a.
Tổng chi phí cho công việc mà Bên B thực hiện là <b>${formatCurrency(tongCong)} VNĐ</b> <i>(Bằng chữ: ${tongCongChu}.)</i> - Đã bao gồm thuế TNCN (10%)</p>
            <p style="padding-left: 20px;">b.
Nghĩa vụ thuế TNCN của Bên B là: <b>${formatCurrency(thueTNCN)} VNĐ</b> <i>(Bằng chữ: ${thueTNCNChu}.)</i> Bên A có trách nhiệm khấu trừ tiền thuế tại nguồn để nộp thuế TNCN cho bên B.</p>
            <p style="padding-left: 20px;">c.
Giá trị Hợp đồng Bên A thực tế thanh toán cho Bên B sau khi đã khấu trừ thuế TNCN cho Bên B là: <b>${formatCurrency(thucTeThanhToan)} VNĐ</b> <i>(Bằng chữ: ${thucTeThanhToanChu}).</i></p>
            <p style="padding-left: 20px;">d.
Trong quá trình thực hiện Hợp đồng, nếu có phát sinh bất kỳ khoản chi phí nào ngoài giá trị Hợp đồng nêu trên, Bên B phải thông báo ngay lập tức cho Bên A và chỉ thực hiện phần công việc phát sinh chi phí đó khi nhận được sự đồng ý bằng văn bản của Bên A. Bên A không có trách nhiệm thanh toán cho Bên B bất kỳ khoản chi phí nào được triển khai khi chưa nhận được sự chấp thuận của Bên A.</p>
            
            
            <p>2.2.
Thanh toán:</p>
            <p style="padding-left: 20px;">a.
Hình thức thanh toán: Chuyển khoản theo số tài khoản quy định tại trang đầu tiên của hợp đồng.</p>
            <p style="padding-left: 20px;">b.
Loại tiền thanh toán: Việt Nam đồng (VNĐ).</p>
            <p style="padding-left: 20px;">c.
Thời hạn thanh toán: Bên A thanh toán 100% giá trị Hợp đồng quy định tại điểm c Điều 2.1 nêu trên cho Bên B trong thời hạn 15 (mười lăm) ngày làm việc kể từ thời điểm các Bên hoàn tất nghiệm thu tất cả các hạng mục theo quy định tại Điều 1.2 Hợp đồng.</p>
            
            <p class="bold-text">ĐIỀU 3: TRÁCH NHIỆM CỦA BÊN A</p>
            <p>3.1.
Tạo điều kiện thuận lợi để bên B hoàn thành công việc.</p>
            <p>3.2.
Bên A có trách nhiệm thanh toán đầy đủ và đúng hạn theo quy định tại Điều 2 của Hợp đồng.
Việc thanh toán không được chậm hơn thời gian được quy định tại Điều 2 của Hợp đồng.
Nếu bên A thanh toán chậm hơn thời gian được quy định tại điểm này, Bên A phải chịu tiền lãi suất tiền gửi không kỳ hạn của ngân hàng BIDV quy định tại thời điểm thanh toán.</p>
            <p>3.3.
Bên A có trách nhiệm cung cấp đầy đủ, nhanh chóng, kịp thời thông tin, tài liệu để bên B thực hiện công việc.</p>
            <p>3.4.
Thông báo bằng văn bản và nêu rõ lý do cho Bên B trong trường hợp Bên A có nhu cầu chấm dứt Hợp đồng ít nhất 03 (ba) ngày trước ngày dự định chấm dứt.</p>
            <p>3.5.
Bên A được quyền kiểm tra, theo dõi, đánh giá, thẩm định chất lượng công việc do Bên B thực hiện.</p>
            <p>3.6.
Các quyền và nghĩa vụ khác theo quy định của Hợp đồng và pháp luật hiện hành.</p>

            <p class="bold-text">ĐIỀU 4: TRÁCH NHIỆM CỦA BÊN B</p>
            <p>4.1.
Thực hiện công việc theo đúng thỏa thuận giữa hai bên và theo quy định tại Điều 1 Hợp đồng, bao gồm nhưng không giới hạn cam kết đảm bảo chất lượng và thời hạn theo quy định của Hợp đồng.</p>
            <p>4.2.
Tuân thủ các quy định làm việc và quy định nội bộ khác của Bên A trong thời gian thực hiện Hợp đồng.</p>
            <p>4.3.
Trong trường hợp phát sinh bất kỳ khiếm khuyết nào đối với công việc, thì Bên B, bằng chi phí của mình, có nghĩa vụ khắc phục và/hoặc thực hiện lại đáp ứng các tiêu chuẩn, điều kiện của Bên A trong thời hạn do Bên A ấn định.
Nếu Bên B vi phạm điều khoản này, Bên A có quyền thuê Bên Thứ Ba thực hiện công việc và mọi chi phí phát sinh sẽ do Bên B chịu trách nhiệm thanh toán.</p>
            <p>4.4.
Trong quá trình thực hiện Hợp đồng, Bên B phải bảo mật tuyệt đối các thông tin nhận được từ Bên A. Trong trường hợp, Bên B vô ý hoặc cố ý tiết lộ các thông tin của Bên A mà chưa được Bên A chấp thuận trước bằng văn bản và/hoặc gây thiệt hại cho Bên A, Bên B sẽ phải chịu mọi trách nhiệm giải quyết cũng như bồi thường cho Bên A toàn bộ thiệt hại thực tế phát sinh.</p>
            <p>4.5.
Phối hợp với bên A trong quá trình nghiệm thu kết quả thực hiện công việc/cung cấp dịch vụ theo quy định tại hợp đồng này.</p>
            <p>4.6.
Các quyền và nghĩa vụ khác theo quy định tại Hợp đồng này và quy định của pháp luật.</p>

            <p class="bold-text">ĐIỀU 5. BẢO MẬT THÔNG TIN</p>
            <p>5.1.
“Thông tin bảo mật” là tất cả các thông tin mà một trong hai Bên đã được cung cấp và/hoặc có được trong quá trình thực hiện Hợp đồng này, bao gồm nhưng không giới hạn các thông tin về Hợp đồng, chủ thể Hợp đồng, Dịch vụ, giá cả, bản chào thầu, công thức và/hoặc thông tin liên quan đến quy trình sản xuất, bản vẽ, mẫu thiết kế, danh sách khách hàng, kế hoạch, chiến lược kinh doanh, và toàn bộ các thông tin có liên quan khác.</p>
           
            <p>5.2.
Tất cả các tài sản, phương tiện, thông tin, hồ sơ, tài liệu mà Bên B được giao, sử dụng hoặc nắm được trong quá trình thực hiện hợp đồng là tài sản của Bên A, Bên B không được quyền sao chép, tiết lộ, chuyển giao và cho người khác sử dụng hoặc sử dụng vì mục đích nào ngoài thực hiện Hợp đồng này trên cơ sở lợi ích của Bên A nếu không được sự chấp thuận trước bằng văn bản của Bên A. Mọi vi phạm sẽ dẫn đến việc chấm dứt Hợp đồng 
  
            trước thời hạn, khi đó Bên A không phải chịu bất kỳ trách nhiệm nào vì chấm dứt Hợp đồng này trước thời hạn.</p>
            <p>5.3.
Trong trường hợp những Thông tin bảo mật được yêu cầu cung cấp cho các cơ quan chính quyền theo luật định thì hai Bên phải thông báo cho nhau biết trong thời hạn 01 (một) ngày ngay sau khi nhận được yêu cầu từ cơ quan có thẩm quyền.
Đồng thời các Bên cam kết chỉ tiết lộ các thông tin trong phạm vi được yêu cầu.</p>
            <p>5.4.
Nếu Bên B vi phạm điều khoản này, dù gây thiệt hại/ảnh hưởng đến công việc kinh doanh của Bên A hay không, Bên B sẽ bị xử lý theo quy định của pháp luật hiện hành và phải bồi thường toàn bộ thiệt hại phát sinh cho Bên A. Để tránh hiểu nhầm, Bên A không có nghĩa vụ chứng minh các thiệt hại phát sinh trong trường hợp này.</p>

            <p class="bold-text">ĐIỀU 6: TẠM NGỪNG, CHẤM DỨT HỢP ĐỒNG</p>
          
            <p>6.1.
Hợp đồng này có giá trị kể từ ngày ký kết và tự động thanh lý khi hai bên đã hoàn thành các nghĩa vụ quy định tại Hợp đồng này.</p>
            <p>6.2.
Trong thời gian hợp đồng có hiệu lực, các bên có trách nhiệm thực hiện đúng nghĩa vụ của mình cho tới khi hợp đồng hết hiệu lực.
Bên nào đơn phương chấm dứt hợp đồng trái các quy định tại Hợp đồng này và trái pháp luật sẽ phải chịu phạt một khoản tiền tương đương với 8% giá trị hợp đồng và có nghĩa vụ bồi thường cho bên còn lại toàn bộ các thiệt hại thực tế phát sinh do hành vi vi phạm theo quy định của pháp luật.</p>
            <p>6.3.
Trường hợp bất khả kháng theo quy định của pháp luật dẫn đến việc một trong hai bên không có khả năng tiếp tục thực hiện Hợp đồng này thì phải báo cho bên kia biết trong vòng 15 (mười lăm) ngày kể từ ngày phát sinh sự kiện bất khả kháng.</p>
            <p>6.4.
Bên A có quyền chấm dứt hợp đồng với bên B mà không bị phạt trong các trường hợp:</p>
            <p style="padding-left: 20px;">a.
Bên B quá 03 (ba) lần cung cấp thông tin chậm so với thời gian được nêu ở Điều 1 hoặc cung cấp thông tin không chính xác, không đầy đủ theo yêu cầu của Bên A</p>
            <p style="padding-left: 20px;">b.
Bên B thực hiện công việc không đảm bảo chất lượng, hoặc vi phạm quy định của Bên A, hoặc</p>
            <p style="padding-left: 20px;">c.
Bên B gây thất thoát tài sản.</p>

            <p class="bold-text">ĐIỀU 7: ĐIỀU KHOẢN CHUNG</p>
            <p>7.1.
Hai bên cam kết thực hiện đúng các điều khoản được ghi trong hợp đồng, bên nào vi phạm sẽ phải chịu trách nhiệm theo quy định của pháp luật và quy định trong Hợp đồng này.</p>
            <p>7.2.
Hợp đồng này được điều chỉnh, diễn giải và thực hiện phù hợp với pháp luật Việt Nam.
Trường hợp có tranh chấp xảy ra, Hai Bên sẽ cùng nhau bàn bạc tìm biện pháp giải quyết trên tinh thần thương lượng trong thời hạn 30 (ba mươi) ngày kể từ thời điểm phát sinh.
Nếu Hai Bên không tự giải quyết được sau thời hạn này thì tranh chấp sẽ được đưa ra giải quyết tại Tòa án nhân dân có thẩm quyền.
Phán quyết của Tòa án là chung thẩm buộc các Bên thực hiện và mọi chi phí giải quyết tranh chấp, bao gồm chi phí thuê luật sư của các Bên, sẽ do Bên thua kiện chi trả.</p>
            <p>7.3.
Hợp đồng này được làm thành 02 (hai) bản bên A giữ 01 (một) bản, Bên B giữ 01 (một) bản có nội dung và giá trị pháp lý như nhau.</p>
            <br><br>
            <table class="no-border-table" style="position: relative; overflow: visible;">
                <tr>
                    <td class="center-text bold-text" style="width: 50%;">ĐẠI 
DIỆN BÊN A</td>
                    <td class="center-text bold-text" style="width: 50%;">ĐẠI DIỆN BÊN B</td>
                </tr>
                <tr>
                    <td class="center-text">(${data.benA_chucVu})</td>
                  
                    <td class="center-text"></td>
                </tr>
                <tr><td style="height: 80px;"></td><td style="height: 80px;"></td></tr>
                <tr>
                    <td class="center-text bold-text">${data.benA_nguoiDaiDien.toUpperCase()}</td>
                    <td class="center-text bold-text">${data.benB_ten.toUpperCase()}</td>
 
                </tr>
            </table>
        </div>
    `;
    setContractHTML(contractTemplate);
    setIsOutputVisible(true);
    setCopyMessage({ text: '', type: 'hidden' });
  };
  
  const handleCopyToClipboard = () => {
    // Tạm thời tạo một div để giữ HTML và copy
    const tempElement = document.createElement('div');
    tempElement.innerHTML = contractHTML;
    document.body.appendChild(tempElement);

    const range = document.createRange();
    range.selectNode(tempElement);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);
    try {
        const success = document.execCommand('copy');
        if (success) {
            setCopyMessage({ text: 'Đã sao chép vào clipboard!', type: 'success' });
        } else {
            setCopyMessage({ text: 'Lỗi! Trình duyệt chặn sao chép.', type: 'error' });
        }
    } catch (err) {
        setCopyMessage({ text: 'Lỗi! Không thể sao chép.', type: 'error' });
    }
    
    window.getSelection().removeAllRanges();
    document.body.removeChild(tempElement);
    setTimeout(() => {
        setCopyMessage({ text: '', type: 'hidden' });
    }, 3000);
  };
  
  // =================================================================
  // LOGIC KHÁC (GIỮ NGUYÊN)
  // =================================================================

  const handleQuantityChange = (productId, newQuantity) => {
    const quantity = parseInt(newQuantity, 10);
    setSelectedSanPhams(prevSelected => { const newSelected = { ...prevSelected }; if (isNaN(quantity) || quantity <= 0) { delete newSelected[productId]; } else { newSelected[productId] = quantity; } return newSelected; });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (cccd.length !== 12 || !/^\d{12}$/.test(cccd)) { alert('Vui lòng nhập CCCD đủ 12 chữ số.'); return;
    }
    if (Object.keys(selectedSanPhams).length === 0) { alert('Vui lòng chọn ít nhất một sản phẩm với số lượng lớn hơn 0!');
    return; }
    setIsLoading(true);
    try {
      const donGuiPayload = {
        koc_ho_ten: hoTen, original_koc_ho_ten: hoTen, koc_id_kenh: idKenh, original_koc_id_kenh: idKenh,
        koc_sdt: sdt, original_koc_sdt: sdt, koc_dia_chi: diaChi, original_koc_dia_chi: diaChi,
        koc_cccd: cccd, original_koc_cccd: cccd, nhansu_id: selectedNhanSu,
        loai_ship: loaiShip, original_loai_ship: loaiShip,
        trang_thai: 'Chưa đóng đơn', original_trang_thai: 'Chưa đóng đơn',
      };
      const { data: donGuiData, error: donGuiError } = await supabase.from('donguis').insert(donGuiPayload).select().single();
      if (donGuiError) throw donGuiError;
      const chiTietData = Object.entries(selectedSanPhams).map(([sanPhamId, soLuong]) => ({ don_gui_id: donGuiData.id, sanpham_id: sanPhamId, so_luong: soLuong }));
      if (chiTietData.length > 0) {
        const { error: chiTietError } = await supabase.from('chitiettonguis').insert(chiTietData);
        if (chiTietError) throw chiTietError;
      }

      alert('Tạo đơn gửi thành công!');
      setHoTen(''); setIdKenh(''); setSdt('');
      setDiaChi(''); setCccd('');
      setSelectedBrand(''); setSelectedSanPhams({}); setSelectedNhanSu(''); setLoaiShip('Ship thường');
      
      // Tải lại data (sẽ tự động về trang 1 nhờ useEffect)
      loadInitialData();
      const newOrderDate = new Date();
      const newOrderMonth = newOrderDate.getMonth() + 1;
      const newOrderYear = newOrderDate.getFullYear();
      if (newOrderMonth === parseInt(reportMonth, 10) && newOrderYear === parseInt(reportYear, 10)) {
          console.log("Đơn hàng mới trong tháng báo cáo, đang cập nhật lại báo cáo...");
          await handleGenerateReport();
      }

    } catch (error) {
      alert('Đã có lỗi xảy ra: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleIdKenhBlur = async () => { if (!idKenh) return;
    const { data } = await supabase.from('kocs').select().eq('id_kenh', idKenh).single();
  if (data) { setHoTen(data.ho_ten); setSdt(data.sdt); setDiaChi(data.dia_chi); setCccd(data.cccd); } };
  const clearFilters = () => { setFilterIdKenh(''); setFilterSdt(''); setFilterBrand(''); setFilterSanPham(''); setFilterNhanSu('');
  setFilterNgay(''); setFilterLoaiShip(''); setFilterEditedStatus('all'); };
  const handleGetSummary = async () => {
    if (!summaryDate) { alert('Vui lòng chọn ngày để tổng hợp!');
    return; }
    setIsSummarizing(true);
    setProductSummary({ 'Ship thường': [], 'Hỏa tốc': [] });
    setRawSummaryData([]);
    const { data, error } = await supabase.rpc('get_product_summary_by_day_grouped', { target_day: summaryDate });
    if (error) {
      alert('Lỗi khi lấy tổng hợp: ' + error.message);
    } else if (data) {
      setRawSummaryData(data);
      const summaryData = {
        'Ship thường': data.filter(item => item.loai_ship === 'Ship thường'),
        'Hỏa tốc': data.filter(item => item.loai_ship === 'Hỏa tốc'),
      };
      setProductSummary(summaryData);
    }
    setIsSummarizing(false);
  };

  const handleGenerateReport = async () => {
    setIsReportLoading(true);
    setReportData({ reportRows: [], brandHeaders: [] });
    const { data, error } = await supabase.rpc('generate_performance_report', { target_month: reportMonth, target_year: reportYear });
    if (error) {
      alert("Lỗi tải báo cáo: " + error.message);
      setIsReportLoading(false);
      return;
    }
    const brandSet = new Set();
    const reportRows = data.map(row => {
      const brandCounts = row.brand_counts || {};
      Object.keys(brandCounts).forEach(brand => brandSet.add(brand));
      return {
        ...row,
        brand_counts: brandCounts,
        sl_order: parseInt(row.sl_order, 10) || 0,
        chi_phi_tong: parseFloat(row.chi_phi_tong) || 0,
        aov_don_order: parseFloat(row.aov_don_order) || 0,
      };
   
    });
    const brandHeaders = Array.from(brandSet).sort();
    setReportData({ reportRows, brandHeaders });
    setIsReportLoading(false);
  };
  const requestSort = (key) => {
    let direction = 'desc';
    if (sortConfig.key === key && sortConfig.direction === 'desc') {
      direction = 'asc';
    }
    setSortConfig({ key, direction });
  };
  
  const sortedReportRows = useMemo(() => {
    if (reportData.reportRows.length === 0) return [];
    const sortableItems = [...reportData.reportRows];
    if (sortConfig.key) {
      sortableItems.sort((a, b) => {
        let aValue = a[sortConfig.key];
        let bValue = b[sortConfig.key];
        if (reportData.brandHeaders.includes(sortConfig.key)) {
          aValue = a.brand_counts[sortConfig.key] || 0;
         
          bValue = b.brand_counts[sortConfig.key] || 0;
        }
        aValue = Number(aValue) || 0;
        bValue = Number(bValue) || 0;
        if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
 
    }
    return sortableItems;
 
  }, [reportData.reportRows, sortConfig, reportData.brandHeaders]);
  const totalsRow = useMemo(() => {
    if (reportData.reportRows.length === 0) return null;
    const initialTotals = { sl_order: 0, chi_phi_tong: 0, brand_counts: {} };
    reportData.brandHeaders.forEach(brand => { initialTotals.brand_counts[brand] = 0; });
    const totals = reportData.reportRows.reduce((acc, row) => {
      acc.sl_order += Number(row.sl_order) || 0;
      acc.chi_phi_tong += Number(row.chi_phi_tong) || 0;
      reportData.brandHeaders.forEach(brand => {
        acc.brand_counts[brand] += (Number(row.brand_counts[brand]) || 0);
      });
 
     
      return acc;
    }, initialTotals);
    totals.aov_don_order = totals.sl_order > 0 ? (totals.chi_phi_tong / totals.sl_order) : 0;
    return totals;
  }, [reportData]);
  const handleEdit = (donHang) => { setEditingDonHang({ ...donHang }); };
  const handleCancelEdit = () => { setEditingDonHang(null); };
  const handleUpdate = async () => {
    if (!editingDonHang) return;
    if (!editingDonHang.koc_cccd || editingDonHang.koc_cccd.length !== 12 || !/^\d{12}$/.test(editingDonHang.koc_cccd)) { alert('Vui lòng nhập CCCD đủ 12 chữ số.'); return;
    }
    const updatePayload = { koc_ho_ten: editingDonHang.koc_ho_ten, koc_id_kenh: editingDonHang.koc_id_kenh, koc_sdt: editingDonHang.koc_sdt, koc_dia_chi: editingDonHang.koc_dia_chi, koc_cccd: editingDonHang.koc_cccd, loai_ship: editingDonHang.loai_ship, trang_thai: editingDonHang.trang_thai, da_sua: true, };
    const { error } = await supabase.from('donguis').update(updatePayload).eq('id', editingDonHang.id);
    if (error) { alert('Lỗi cập nhật đơn gửi: ' + error.message); return;
    }
    await loadInitialData(); 
    
    const editedOrderDate = new Date(editingDonHang.ngay_gui); 
    const editedOrderMonth = editedOrderDate.getMonth() + 1;
    const editedOrderYear = editedOrderDate.getFullYear();
    if (editedOrderMonth === parseInt(reportMonth, 10) && editedOrderYear === parseInt(reportYear, 10)) {
        await handleGenerateReport();
    }
    
    setEditingDonHang(null);
  };
  const handleSelect = (orderId) => { setSelectedOrders(prevSelected => { const newSelected = new Set(prevSelected); if (newSelected.has(orderId)) { newSelected.delete(orderId); } else { newSelected.add(orderId); } return newSelected; });
  };
  const handleSelectAll = (e) => { if (e.target.checked) { const allDisplayedIds = new Set(donHangs.map(dh => dh.id)); setSelectedOrders(allDisplayedIds);
  } else { setSelectedOrders(new Set()); } };
  const handleBulkUpdateStatus = async () => { if (selectedOrders.size === 0) { alert("Vui lòng chọn ít nhất một đơn hàng.");
    return; } const idsToUpdate = Array.from(selectedOrders); const { error } = await supabase.from('donguis').update({ trang_thai: 'Đã đóng đơn' }).in('id', idsToUpdate);
    if (error) { alert("Lỗi khi cập nhật hàng loạt: " + error.message);
    } else { setDonHangs(prevState => prevState.map(donHang => idsToUpdate.includes(donHang.id) ? { ...donHang, trang_thai: 'Đã đóng đơn' } : donHang ));
    setSelectedOrders(new Set()); alert(`Đã cập nhật trạng thái cho ${idsToUpdate.length} đơn hàng.`); } };
  const handleExport = ({ data, headers, filename }) => { const orderedData = data.map(row => { const newRow = {}; headers.forEach(header => { if (header.key) { newRow[header.label] = row[header.key]; } }); return newRow; });
    const worksheet = XLSX.utils.json_to_sheet(orderedData); const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1"); XLSX.writeFile(workbook, filename); };
  // --- HÀM XUẤT FILE TOÀN BỘ DỮ LIỆU ĐÃ LỌC (KHẮC PHỤC LỖI #3) ---
  const handleExportAll = async () => {
    setIsLoading(true);
    let query = supabase.from('donguis').select(`
      id, ngay_gui, da_sua,
      loai_ship, original_loai_ship, trang_thai, original_trang_thai,
      koc_ho_ten, original_koc_ho_ten, koc_id_kenh, original_koc_id_kenh, 
      koc_sdt, original_koc_sdt, koc_dia_chi, original_koc_dia_chi, 
      koc_cccd, original_koc_cccd,
      nhansu ( id, ten_nhansu ),
      chitiettonguis ( id, so_luong, 
      sanphams ( id, ten_sanpham, barcode, gia_tien, brands ( id, ten_brand ) ) )
    `).order('ngay_gui', { ascending: false });
    // Áp dụng bộ lọc Server-Side
    if (filterIdKenh) { query = query.ilike('koc_id_kenh', `%${filterIdKenh}%`);
    }
    if (filterSdt) { query = query.ilike('koc_sdt', `%${filterSdt}%`);
    }
    if (filterNhanSu) { query = query.eq('nhansu_id', filterNhanSu);
    }
    if (filterLoaiShip) { query = query.eq('loai_ship', filterLoaiShip);
    }
    if (filterNgay) {
        const startDate = `${filterNgay}T00:00:00.000Z`;
        const endDate = `${filterNgay}T23:59:59.999Z`; 
        query = query
            .gte('ngay_gui', startDate) 
            .lte('ngay_gui', endDate);
    }
    if (filterEditedStatus !== 'all') {
        const isEdited = filterEditedStatus === 'edited';
        query = query.eq('da_sua', isEdited);
    }
    
    // Tải TẤT CẢ dữ liệu (Không dùng range/limit)
    const { data, error } = await query;
    if (error) {
        alert("Lỗi tải dữ liệu để xuất file: " + error.message);
        setIsLoading(false);
        return;
    }

    // Áp dụng bộ lọc Client-Side cho Brand/Sản phẩm (nếu có)
    let exportData = data ||
    [];
    exportData = exportData.filter(donHang => {
        if (filterBrand && !donHang.chitiettonguis.some(ct => String(ct.sanphams?.brands?.id) === filterBrand)) return false;
        if (filterSanPham && !donHang.chitiettonguis.some(ct => ct.sanphams?.id === filterSanPham)) return false;
        return true;
    });
    // Chuyển đổi dữ liệu sang định dạng Export
    const finalExportData = exportData.flatMap((donHang, index) => {
        const baseData = { 
            stt: index + 1, // STT cho file export
            ngayGui: new Date(donHang.ngay_gui).toLocaleString('vi-VN'), 
            tenKOC: donHang.koc_ho_ten, 
            cccd: donHang.koc_cccd, 
       
            idKenh: donHang.koc_id_kenh, 
            sdt: donHang.koc_sdt, 
            diaChi: donHang.koc_dia_chi, 
            nhanSu: donHang.nhansu?.ten_nhansu, 
            loaiShip: donHang.loai_ship, 
            trangThai: donHang.trang_thai 
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

    handleExport({ data: finalExportData, headers: mainExportHeaders, filename: 'danh-sach-don-hang-FULL.xlsx' });
    setIsLoading(false);
  };
  const mainExportHeaders = [ { label: "STT", key: "stt"}, { label: "Ngày Gửi", key: "ngayGui" }, { label: "Tên KOC", key: "tenKOC" }, { label: "CCCD", key: "cccd" }, { label: "ID Kênh", key: "idKenh" }, { label: "SĐT", key: "sdt" }, { label: "Địa chỉ", key: "diaChi" }, { label: "Sản Phẩm", key: "sanPham" }, { label: "Số Lượng", key: "soLuong"}, { label: "Brand", key: "brand" }, { label: "Barcode", key: "barcode" }, { label: "Nhân Sự Gửi", key: "nhanSu" }, { label: "Loại Ship", key: "loaiShip" }, { label: "Trạng Thái", key: "trangThai" }, ];
  const summaryExportHeaders = [ { label: "Loại Ship", key: "loai_ship"}, { label: "Sản Phẩm", key: "ten_san_pham" }, { label: "Barcode", key: "barcode" }, { label: "Brand", key: "ten_brand" }, { label: "Tổng Số Lượng", key: "total_quantity" } ];
  const staffSummaryExportHeaders = [ { label: "Nhân Sự", key: "ten_nhansu"}, { label: "Brand", key: "ten_brand" }, { label: "Sản Phẩm", key: "ten_san_pham" }, { label: "Tổng Số Lượng", key: "total_quantity" } ];
  const headers = [ { key: 'select', label: <input type="checkbox" onChange={handleSelectAll} /> }, { key: 'stt', label: 'STT' }, { key: 'ngayGui', label: 'Ngày Gửi' }, { key: 'hoTenKOC', label: 'Họ Tên KOC' }, { key: 'cccd', label: 'CCCD' }, { key: 'idKenh', label: 'ID Kênh' }, { key: 'sdt', label: 'SĐT' }, { key: 'diaChi', label: 'Địa chỉ' }, { key: 'brand', label: 'Brand' }, { key: 'sanPham', label: 'Sản Phẩm (SL)' }, { key: 'nhanSu', label: 'Nhân Sự Gửi' }, { key: 'loaiShip', label: 'Loại Ship' }, { key: 'trangThai', label: 'Trạng Thái' }, { key: 'hanhDong', label: 
  
  'Hành Động' }, ];
  
  // Logic phân trang
  const totalPages = Math.ceil(totalOrderCount / ORDERS_PER_PAGE);
  const pageNumbers = [];
  // Hiển thị tối đa 5 nút trang (trang hiện tại, 2 trang trước, 2 trang sau)
  const maxButtons = 5;
  let startPage = Math.max(1, currentPage - Math.floor(maxButtons / 2));
  let endPage = Math.min(totalPages, startPage + maxButtons - 1);
  if (endPage - startPage + 1 < maxButtons) {
      startPage = Math.max(1, endPage - maxButtons + 1);
  }
  
  for (let i = startPage; i <= endPage; i++) {
    pageNumbers.push(i);
  }


  return (
    <div style={{ padding: '2rem' }}>
      
      {/* --- NÚT CHUYỂN TAB --- */}
      <div style={{ marginBottom: '2rem', textAlign: 'center' }}>
          <button 
              onClick={() => setCurrentView('orders')} 
              style={{ 
              
  
              padding: '10px 20px', 
                  marginRight: '10px', 
                  fontSize: '16px', 
                  cursor: 'pointer',
                  // Màu Noel
    
                  backgroundColor: currentView === 'orders' ? '#C0392B' : '#f8f9fa', 
              
                  color: currentView === 'orders' ? 'white' : '#C0392B',
                  border: '1px solid #C0392B',
                  
                  borderRadius: '5px',
                  fontWeight: 'bold',
              }}
          >
   
              Quản Lý Order
    
          </button>
          <button 
            
            onClick={() => setCurrentView('contract')} // Đổi tên chế độ xem thành 'contract'
              style={{ 
                  padding: '10px 20px', 
  
                  fontSize: '16px', 
          
                  cursor: 'pointer',
 
                  // Màu Noel
                  backgroundColor: currentView === 'contract' ?
                  '#C0392B' : '#f8f9fa',
                  color: currentView === 'contract' ?
                  'white' : '#C0392B',
                  border: '1px solid #C0392B',
                  borderRadius: '5px',
                  fontWeight: 'bold',
              }}
          >
              Tạo 
            Hợp 
            Đồng
          </button>
      </div>

  
      {/* --- GIAO DIỆN TAB ORDER --- */}
      {currentView === 'orders' && (
          <> 
              {/* Tiêu đề riêng cho Tab Order */}
              
              <div style={{ position: 'relative', textAlign: 'center', marginBottom: '2rem' }}>
                  <h1 style={{ fontSize: '2.25rem', fontWeight: '700', color: '#C0392B' }}>
                      <span style={{color: '#27AE60'}}>🎄🎅</span> QUẢN LÝ ĐƠN HÀNG KOC <span style={{color: '#C0392B'}}>🎅🎄</span>
                  </h1>
                
                  <p style={{ 
                      position: 'absolute', 
                      top: '0', 
                      left: '0', 
                      fontSize: '1rem', 
 
                      fontWeight: 'bold', 
                      color: '#C0392B',
                      backgroundColor: '#FFEBEE', 
                      padding: '5px 10px', 
    
                      borderRadius: '5px',
                      border: '1px solid #C0392B'
                  }}>
                      Made by Khánh đẹp trai vkl
           
                  </p>
              </div>

              <div style={{ display: 'flex', gap: '2rem', marginBottom: '2rem' }}>
                <div style={{ flex: 1, padding: '2rem', border: '1px solid #ddd', 
                borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
        
             
                <h1 style={{ textAlign: 'center', color: '#C0392B', marginBottom: '1.5rem', borderBottom: '2px solid #C0392B', paddingBottom: '10px' }}>Tạo Đơn Gửi KOC</h1>
                  <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div><label style={{fontWeight: 'bold', color: '#27AE60'}}>ID Kênh</label><input type="text" value={idKenh} onChange={e => 
     
                       setIdKenh(e.target.value)} onBlur={handleIdKenhBlur} style={{ width: '100%', padding: '8px', boxSizing: 'border-box', border: '1px solid #27AE60', borderRadius: '4px' }} required /></div>
                    
                    <div><label style={{fontWeight: 'bold', color: '#27AE60'}}>Họ tên KOC</label><input type="text" value={hoTen} onChange={e => setHoTen(e.target.value)} style={{ width: '100%', padding: '8px', boxSizing: 'border-box', border: '1px solid #27AE60', borderRadius: '4px' }} required /></div>
 
                    <div><label style={{fontWeight: 'bold', color: '#27AE60'}}>Số điện thoại</label><input type="text" value={sdt} onChange={e => setSdt(e.target.value)} style={{ width: '100%', padding: 
                    '8px', boxSizing: 'border-box', border: '1px solid #27AE60', borderRadius: '4px' }} required /></div>
                    <div><label style={{fontWeight: 'bold', color: '#27AE60'}}>Địa chỉ</label><input type="text" value={diaChi} onChange={e => setDiaChi(e.target.value)} style={{ width: '100%', 
                    padding: '8px', boxSizing: 'border-box', border: '1px solid #27AE60', borderRadius: '4px' }} required /></div>
          
                    <div><label style={{fontWeight: 'bold', color: '#27AE60'}}>CCCD</label><input type="text" value={cccd} onChange={e => setCccd(e.target.value)} style={{ width: '100%', padding: '8px', boxSizing: 'border-box', border: '1px solid #27AE60', borderRadius: '4px' }} required maxLength="12" minLength="12" pattern="[0-9]*" title="Vui lòng nhập đủ 12 chữ số." /></div>
    
                   
                    <div><label style={{fontWeight: 'bold', color: '#27AE60'}}>Brand</label><select value={selectedBrand} onChange={e => setSelectedBrand(e.target.value)} style={{ width: '100%', padding: '8px', boxSizing: 'border-box', border: '1px solid #27AE60', borderRadius: '4px' }} required><option value="">-- Chọn Brand --</option>{brands.map(brand => (<option key={brand.id} value={brand.id}>{brand.ten_brand}</option>))}</select></div>
                    <div>
    
                      <label style={{fontWeight: 'bold', color: '#27AE60'}}>Sản phẩm</label>
                
 
                      <input type="text" placeholder="Tìm sản phẩm..." value={productSearchTerm} onChange={e => setProductSearchTerm(e.target.value)} style={{ width: '100%', padding: '8px', boxSizing: 'border-box', marginBottom: '10px', border: '1px solid #27AE60', borderRadius: '4px' }} disabled={!selectedBrand} />
                      <div style={{ border: '1px solid #C0392B', borderRadius: '4px', padding: '10px', maxHeight: '150px', overflowY: 'auto' }}>
   
              
                        {sanPhams.length > 0 ?
                        sanPhams.filter(sp => sp.ten_sanpham.toLowerCase().includes(productSearchTerm.toLowerCase())).map(sp => (
                            <div key={sp.id} style={{ display: 'flex', alignItems: 'center', marginBottom: '5px' }}>
                              <label htmlFor={sp.id} style={{ flex: 1 }}>{sp.ten_sanpham}</label>
                        
 
                            
                              <input type="number" min="0" id={sp.id} value={selectedSanPhams[sp.id] || ''} onChange={(e) => handleQuantityChange(sp.id, e.target.value)} style={{ width: '60px', padding: '4px', textAlign: 'center', border: '1px solid #27AE60', borderRadius: '4px' }} placeholder="0" />
                
                            </div>
                      
                          )) : <p style={{ margin: 0, color: '#C0392B' }}>Vui lòng chọn Brand để xem sản phẩm</p>}
     
                    
                    </div>
                    </div>
                    <div><label style={{fontWeight: 'bold', color: '#27AE60'}}>Nhân sự gửi</label><select value={selectedNhanSu} onChange={e => setSelectedNhanSu(e.target.value)} style={{ width: '100%', padding: '8px', boxSizing: 'border-box', border: '1px solid #27AE60', borderRadius: '4px' 
                    }} required><option value="">-- Chọn nhân sự --</option>{nhanSus.map(nhansu => (<option key={nhansu.id} value={nhansu.id}>{nhansu.ten_nhansu}</option>))}</select></div>
    
                                
                    <div>
                      <label style={{fontWeight: 'bold', color: '#27AE60'}}>Loại hình vận chuyển</label>
                      <div style={{ display: 'flex', 
          
                      gap: '1rem', marginTop: '0.5rem' }}>
                        <label style={{ display: 'flex', alignItems: 'center' }}><input type="radio" value="Ship thường" checked={loaiShip === 'Ship thường'} onChange={e => setLoaiShip(e.target.value)} style={{ marginRight: '5px' 
                      }} />Ship thường</label>
                  
                        <label style={{ display: 'flex', alignItems: 'center' }}><input type="radio" value="Hỏa tốc" checked={loaiShip === 
                    'Hỏa tốc'} onChange={e => setLoaiShip(e.target.value)} style={{ marginRight: '5px' }} />Hỏa tốc</label>
                      </div>
                    </div>
          
 
                    <button type="submit" disabled={isLoading ||
                    isPastDeadlineForNewOrders} style={{ width: '100%', padding: '10px', backgroundColor: (isLoading || isPastDeadlineForNewOrders) ?
                    '#ccc' : '#C0392B', color: 'white', border: 'none', borderRadius: '4px', fontSize: '16px', cursor: 'pointer', marginTop: '1rem', fontWeight: 'bold' }}>{isLoading ?
                    'Đang xử lý...' : 'Gửi Đơn'}</button>
                    {isPastDeadlineForNewOrders && (<p style={{ color: '#C0392B', textAlign: 'center', marginTop: '0.5rem', fontWeight: 'bold' }}>Đã quá 16h30, không thể tạo đơn hàng mới.</p>)}
                   </form>
                </div>
                <div style={{ flex: 1, 
 
                
              padding: '2rem', border: '1px solid #ddd', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
                    <h2 style={{ textAlign: 'center', color: '#C0392B', marginBottom: '1.5rem', borderBottom: '2px solid #C0392B', paddingBottom: '10px' }}>Tổng Hợp Sản Phẩm (Theo Ship)</h2>
                  
                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}><input type="date" value={summaryDate} onChange={e => setSummaryDate(e.target.value)} style={{ padding: '7px', boxSizing: 'border-box', flex: 1, border: '1px solid #27AE60', borderRadius: '4px' }} 
                    /><button onClick={handleGetSummary} disabled={isSummarizing} style={{ padding: '8px 16px', backgroundColor: '#C0392B', color: 'white', border: 'none', borderRadius: 
              '4px', cursor: 'pointer', fontWeight: 'bold' }}>{isSummarizing ?
                    'Đang xử lý...' : 'Tổng hợp'}</button></div>
                    <div style={{ marginTop: '1rem', maxHeight: '300px', overflowY: 'auto' }}>
                        {rawSummaryData.length === 0 && !isSummarizing && <p style={{ textAlign: 'center', color: '#C0392B' }}>Chưa có dữ liệu cho ngày đã chọn.</p>}
                   
     
                        {productSummary['Ship thường'].length > 0 && (
                            <div style={{marginBottom: '1.5rem'}}>
                                <h3 style={{color: '#27AE60', borderBottom: '1px solid #ddd', paddingBottom: '5px', 
                                fontWeight: 'bold'}}>Tổng hợp Ship Thường</h3>
   
              
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}><thead style={{textAlign: 'left'}}><tr><th style={{padding: '8px', borderBottom: '1px solid #ddd'}}>Sản phẩm</th><th style={{padding: '8px', borderBottom: '1px solid #ddd'}}>Số lượng</th></tr></thead>
                             
                            <tbody>{productSummary['Ship thường'].map(item => (<tr 
                    key={`${item.ten_san_pham}-thuong`}><td style={{padding: '8px', borderBottom: '1px solid #eee'}}>{item.ten_san_pham}<br/><small style={{color: '#777'}}>{item.ten_brand} - {item.barcode}</small></td><td style={{padding: '8px', borderBottom: '1px solid #eee', textAlign: 'center'}}><strong>{item.total_quantity}</strong></td></tr>))}</tbody></table>
         
                        </div>
                      
                        )}
                        {/* Đã sửa lỗi: productSummary['Hỏa tốc'] */}
                        {productSummary['Hỏa tốc'].length > 0 && (
                            
           
                            <div>
                                <h3 style={{color: '#C0392B', borderBottom: '1px solid #ddd', paddingBottom: '5px', fontWeight: 'bold'}}>Tổng hợp Hỏa Tốc</h3>
           
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}><thead style={{textAlign: 'left'}}><tr><th style={{padding: '8px', borderBottom: '1px solid #ddd'}}>Sản phẩm</th><th style={{padding: '8px', borderBottom: '1px solid #ddd'}}>Số lượng</th></tr></thead>
   
                              <tbody>{productSummary['Hỏa tốc'].map(item => (<tr key={`${item.ten_san_pham}-toc`}><td style={{padding: '8px', borderBottom: '1px solid #eee'}}>{item.ten_san_pham}<br/><small style={{color: '#777'}}>{item.ten_brand} - {item.barcode}</small></td><td style={{padding: '8px', borderBottom: '1px solid #eee', textAlign: 'center'}}><strong>{item.total_quantity}</strong></td></tr>))}</tbody></table>
  
                            </div>
      
                        )}
                        {rawSummaryData.length > 0 && 
 
                            <div style={{ marginTop: '1rem', 
                    textAlign: 'right' }}>
                                <button onClick={() => 
              handleExport({ data: rawSummaryData, headers: summaryExportHeaders, filename: `tong-hop-san-pham-${summaryDate}.xlsx`})} style={{ padding: '8px 16px', backgroundColor: '#27AE60', color: 'white', border: 'none', borderRadius: 
                    '4px', cursor: 'pointer', fontWeight: 'bold' }}>Xuất File Tổng Hợp (Ship)</button>
  
                            </div>
                        }
                    </div>
   
              </div>
    
         
              </div>

              <div style={{ padding: '2rem', border: '1px solid #ddd', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', marginBottom: '2rem' }}>
                <h2 style={{ textAlign: 'center', color: '#C0392B', marginBottom: '1.5rem', borderBottom: '2px solid #C0392B', paddingBottom: '10px' }}>Báo Cáo Hiệu Suất Nhân Sự</h2>
             
                <div 
 
                style={{ display: 'flex', gap: '1rem', alignItems: 'center', justifyContent: 'center', marginBottom: '1.5rem' }}>
                    <select value={reportMonth} onChange={e => setReportMonth(e.target.value)} style={{ padding: '7px', border: '1px solid #27AE60', borderRadius: '4px' }}>
                        {Array.from({ length: 12 }, (_, i) => <option key={i+1} value={i+1}>Tháng {i+1}</option>)}
      
                    </select>
   
    
                    <input type="number" value={reportYear} onChange={e => setReportYear(e.target.value)} style={{ padding: '7px', width: '80px', border: '1px solid #27AE60', borderRadius: '4px' }} />
                    <button onClick={handleGenerateReport} disabled={isReportLoading} style={{ padding: '8px 16px', backgroundColor: '#C0392B', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
  
                        {isReportLoading ?
                    'Đang xử lý...' : 'Tạo Báo Cáo'}
                    </button>
                </div>
                {reportData.reportRows.length > 0 ?
                (
                  <div style={{width: '100%', overflowX: 'auto'}}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead style={{ backgroundColor: '#27AE60', color: 'white' }}>
                        
                        <tr>
  
                          
                          <th style={{ padding: '12px', border: '1px solid white', textAlign: 'left', cursor: 'pointer' }} onClick={() => requestSort('ten_nhansu')}>
                            Nhân Sự {sortConfig.key 
                    === 'ten_nhansu' ? (sortConfig.direction === 'asc' ? '▲' : '▼') : ''}
                 
                              
                          </th>
                
                          <th style={{ padding: '12px', border: '1px solid white', textAlign: 'center', cursor: 'pointer' }} onClick={() => requestSort('sl_order')}>
                            SL Order {sortConfig.key 
                    === 'sl_order' ? (sortConfig.direction === 'asc' ? '▲' : '▼') : ''}
          
   
                        </th>
                          <th style={{ padding: '12px', border: '1px solid white', textAlign: 'center' }} >AOV Đơn Order</th>
              
                        
                          <th style={{ padding: '12px', border: '1px solid white', textAlign: 'center', cursor: 'pointer' }} onClick={() => requestSort('chi_phi_tong')}>
                            Chi Phí Tổng {sortConfig.key === 'chi_phi_tong' ?
                    (sortConfig.direction === 'asc' ? '▲' : '▼') : ''}
                          </th>
                          {reportData.brandHeaders.map(brand => (
                              // ĐÃ SỬA LỖI UNTERMINATED STRING CONSTANT Ở ĐÂY
                              <th key={brand} style={{ padding: '12px', border: '1px solid white', textAlign: 'center', cursor: 'pointer' }} onClick={() => requestSort(brand)}>
                                {brand} {sortConfig.key === brand ? (sortConfig.direction === 'asc' ? '▲' : '▼') : ''}
                              </th>
                 
 
                          ))}
                        </tr>
                      </thead>
                      <tbody>
     
  
                       
                        {sortedReportRows.map((item) => (
                          <tr key={item.nhansu_id}>
                       
                              <td style={{ 
                            padding: '12px', border: '1px solid #ddd', fontWeight: 'bold', color: '#C0392B' }}>{item.ten_nhansu}</td>
                            <td style={{ padding: '12px', 
              border: '1px solid #ddd', textAlign: 'center' }}>{item.sl_order}</td>
   
                          <td style={{ padding: '12px', border: '1px solid #ddd', textAlign: 'center' }}>{Math.round(item.aov_don_order).toLocaleString('vi-VN')} đ</td>
 
                            <td style={{ padding: '12px', border: '1px solid #ddd', textAlign: 'center' }}>{Math.round(item.chi_phi_tong).toLocaleString('vi-VN')} đ</td>
                
        
                            {reportData.brandHeaders.map(brand => (
                
                              <td key={brand} style={{ padding: '12px', border: '1px solid #ddd', textAlign: 'center' }}>
                     
                                {item.brand_counts[brand] ||
                            0}
                              </td>
                            ))}
                          </tr>
                
 
                          ))}
                      </tbody>
                      <tfoot>
                        {totalsRow && (
   
                            
                          <tr style={{backgroundColor: '#f8d7da', fontWeight: 'bold', color: '#C0392B'}}>
                            <td style={{ padding: '12px', border: '1px solid #ddd' }}>TỔNG CỘNG</td>
                
                            <td style={{ padding: '12px', border: '1px solid #ddd', textAlign: 'center' }}>{totalsRow.sl_order}</td>
                 
                            <td style={{ padding: '12px', border: '1px solid #ddd', textAlign: 'center' }}>{Math.round(totalsRow.aov_don_order).toLocaleString('vi-VN')} đ</td>
                            <td style={{ padding: '12px', border: 
                            '1px solid #ddd', textAlign: 'center' }}>{Math.round(totalsRow.chi_phi_tong).toLocaleString('vi-VN')} đ</td>
                            
                            {reportData.brandHeaders.map(brand => (
         
                              <td key={brand} style={{ padding: '12px', border: '1px solid #ddd', textAlign: 'center' }}>
              
                                  
                                {totalsRow.brand_counts[brand] ||
                            0}
                              </td>
                            ))}
                          </tr>
              
 
              )}
                      </tfoot>
                    </table>
                  </div>
                ) : (
     
    
                      
                <p style={{ textAlign: 'center', color: '#C0392B' }}>
                    {isReportLoading ? 'Đang tải dữ liệu...' : 'Chưa có dữ liệu cho tháng đã chọn.'}
                  </p>
 
                )}
    
            </div>

        
              <div style={{ width: '100%', overflowX: 'auto', marginTop: '2rem' }}>
                <h2 style={{ textAlign: 'center', color: '#C0392B', borderBottom: '2px solid #C0392B', paddingBottom: '10px' }}>Danh Sách Đơn Hàng Đã Gửi</h2>
      
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem', alignItems: 'end', marginBottom: '1rem', padding: '1rem', backgroundColor: '#f9f9f9', borderRadius: 
                '8px', border: '1px solid #C0392B' }}>
                  <input type="text" placeholder="ID kênh..." value={filterIdKenh} onChange={e => 
              setFilterIdKenh(e.target.value)} style={{ padding: '8px', boxSizing: 'border-box', border: '1px solid #27AE60', borderRadius: '4px' }} 
/>
                  <input type="text" placeholder="SĐT..." value={filterSdt} onChange={e => setFilterSdt(e.target.value)} style={{ padding: '8px', boxSizing: 'border-box', border: '1px solid #27AE60', borderRadius: '4px' }} />
                  <select value={filterBrand} onChange={e => setFilterBrand(e.target.value)} style={{ padding: '8px', boxSizing: 'border-box', border: '1px solid #27AE60', borderRadius: '4px' 
                    }}><option value="">Tất cả Brand</option>{brands.map(b => <option key={b.id} value={b.id}>{b.ten_brand}</option>)}</select>
      
                  <select value={filterSanPham} onChange={e => setFilterSanPham(e.target.value)} style={{ padding: '8px', boxSizing: 'border-box', border: '1px solid #27AE60', borderRadius: '4px' }} disabled={!filterBrand}><option value="">Tất cả Sản phẩm</option>{filterSanPhams.map(sp => 
              <option key={sp.id} value={sp.id}>{sp.ten_sanpham}</option>)}</select>
                  <select value={filterNhanSu} onChange={e => setFilterNhanSu(e.target.value)} style={{ padding: '8px', boxSizing: 'border-box', border: '1px solid #27AE60', borderRadius: '4px' }}><option value="">Tất cả nhân sự</option>{nhanSus.map(ns => <option key={ns.id} value={ns.id}>{ns.ten_nhansu}</option>)}</select>
          
 
                    <select value={filterLoaiShip} onChange={e => setFilterLoaiShip(e.target.value)} style={{ padding: '8px', boxSizing: 'border-box', border: '1px solid #27AE60', borderRadius: '4px' }}>
                    <option value="">Tất cả loại ship</option>
              
                    <option value="Ship thường">Ship thường</option>
      
                  <option value="Hỏa tốc">Hỏa 
                    tốc</option>
                  </select>
                  <select value={filterEditedStatus} onChange={e => setFilterEditedStatus(e.target.value)} style={{ padding: '8px', boxSizing: 'border-box', border: '1px solid #27AE60', borderRadius: '4px' }}>
             
                        <option value="all">Tất cả</option>
  
                    <option value="edited">Đơn đã sửa</option>
         
                    <option value="unedited">Đơn chưa sửa</option>
                  </select>
                
                    <input type="date" value={filterNgay} onChange={e => setFilterNgay(e.target.value)} style={{ padding: '7px', boxSizing: 'border-box', border: '1px solid #27AE60', borderRadius: '4px' }} />
          
                  <div style={{display: 'flex', gap: '0.5rem'}}>
        
                    <button onClick={clearFilters} style={{ flex: 1, padding: '8px 16px', backgroundColor: '#95A5A6', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>Xóa Lọc</button>
 
                    <button onClick={handleBulkUpdateStatus} disabled={selectedOrders.size === 0} style={{ flex: 1, padding: '8px 16px', backgroundColor: selectedOrders.size > 0 ?
                    '#C0392B' : '#ccc', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
                        Đóng ({selectedOrders.size}) đơn
                    </button>
                  </div>
                  {/* SỬA: Đã đổi sang 
                    hàm handleExportAll 
                    mới để xuất toàn bộ */}
                  <button onClick={handleExportAll} disabled={isLoading} style={{ padding: '8px 16px', backgroundColor: '#27AE60', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', textAlign: 'center', fontWeight: 'bold' }}>
                    {isLoading ?
                    'Đang chuẩn bị...' : 'Xuất File'}
                  </button>
                </div>
                
                {/* --- KHỐI PHÂN TRANG (PAGINATION) --- */}
                <div style={{ textAlign: 'center', marginTop: '1.5rem', 
 
                marginBottom: '1.5rem' }}>
                    <p style={{marginBottom: '10px', color: '#C0392B'}}>Tổng cộng: **{totalOrderCount}** đơn hàng ({ORDERS_PER_PAGE} đơn/trang) - Đang ở Trang {currentPage}/{totalPages}</p>
                    <button
                        onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                        disabled={currentPage === 1 ||
                    isLoading}
                        style={{ padding: '8px 12px', margin: '0 5px', border: '1px solid #C0392B', cursor: 'pointer', backgroundColor: '#f8f9fa', color: '#C0392B', borderRadius: '4px' }}
                    >
                        Trang Trước
            
                  
                      </button>
                    {pageNumbers.map(number => (
                        <button
                          
                            key={number}
                        
                            onClick={() => setCurrentPage(number)}
                            disabled={isLoading}
                
                            style={{
                                padding: '8px 12px',
    
                                margin: '0 5px',
                
                                backgroundColor: currentPage === number ? '#C0392B' : '#f8f9fa',
                               
                            color: currentPage === number ? 'white' : '#C0392B',
           
                                border: '1px solid #C0392B',
                                cursor: 'pointer',
                                borderRadius: '4px'
          
               
                            }}
                        >
                            {number}
      
                        </button>
                    
                    ))}
                    <button
                      
                        onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                        disabled={currentPage === totalPages ||
                    isLoading}
                        style={{ padding: '8px 12px', margin: '0 5px', border: '1px solid #C0392B', cursor: 'pointer', backgroundColor: '#f8f9fa', color: '#C0392B', borderRadius: '4px' }}
                    >
                        Trang Sau
            
                  
                      </button>
                </div>
                {/* --- KẾT THÚC KHỐI PHÂN TRANG --- */}

                <div style={{ width: '100%', overflow: 'auto' }}>
   
       
                    <table style={{ borderCollapse: 'collapse', width: '100%' }}>
           
                    <thead style={{ backgroundColor: '#27AE60', color: 'white' }}>
                      <tr>
                        {headers.map((header) => 
                        (
       
                          <ResizableHeader key={header.key} width={columnWidths[header.key]} onResize={handleResize(header.key)}>
   
                            {header.label}
                          </ResizableHeader>
       
                             
                      ))}
           
                    </tr>
                    </thead>
          
                    <tbody>
                      {/* Đã đổi từ displayedDonHangs sang donHangs */}
                      {donHangs.map((donHang) => {
             
    
                        const getCellStyle = (currentValue, originalValue) => {
                            return (originalValue !== null && currentValue !== originalValue) ?
                            { backgroundColor: '#C0392B', color: 'white' } : {};
                        };
                        const sanPhamDisplay = donHang.chitiettonguis.map(ct => (<div key={ct.sanphams?.id}>{ct.sanphams?.ten_sanpham} (SL: {ct.so_luong})</div>));
                        return (
                        <tr key={donHang.id}>
                          {editingDonHang?.id === donHang.id ?
                          ( // Chế độ Sửa
               
 
              <>
                              <td style={{ width: `${columnWidths.select}px`, padding: '12px', border: '1px solid #ddd' }}></td>
                              <td style={{ width: `${columnWidths.stt}px`, padding: '12px', border: '1px solid #ddd' }}>{donHang.originalStt}</td>
     
                              <td style={{ width: `${columnWidths.ngayGui}px`, padding: '12px', border: '1px solid #ddd' }}>{new Date(donHang.ngay_gui).toLocaleString('vi-VN')}</td>
                              
                              <td style={{ width: `${columnWidths.hoTenKOC}px`, padding: '12px', border: '1px solid #ddd' }}><input style={{width: '90%'}} value={editingDonHang.koc_ho_ten} onChange={e => setEditingDonHang({...editingDonHang, koc_ho_ten: e.target.value})} /></td>
         
                          
                              <td style={{ width: `${columnWidths.cccd}px`, padding: '12px', border: '1px solid #ddd' }}><input style={{width: '90%'}} value={editingDonHang.koc_cccd} onChange={e => 
                    setEditingDonHang({...editingDonHang, koc_cccd: e.target.value})} /></td>
                              <td style={{ width: `${columnWidths.idKenh}px`, padding: 
                            '12px', border: '1px solid #ddd' }}><input style={{width: '90%'}} 
                          
                            value={editingDonHang.koc_id_kenh} onChange={e => setEditingDonHang({...editingDonHang, koc_id_kenh: e.target.value})} /></td>
                   
                              <td style={{ width: `${columnWidths.sdt}px`, padding: '12px', border: '1px solid #ddd' }}><input style={{width: '90%'}} value={editingDonHang.koc_sdt} onChange={e => setEditingDonHang({...editingDonHang, koc_sdt: e.target.value})} /></td>
                        
                              <td style={{ width: `${columnWidths.diaChi}px`, padding: '12px', border: '1px solid #ddd' }}><input style={{width: '90%'}} value={editingDonHang.koc_dia_chi} onChange={e => setEditingDonHang({...editingDonHang, koc_dia_chi: e.target.value})} /></td>
                     
                            
                              <td style={{ width: `${columnWidths.brand}px`, padding: '12px', border: '1px solid #ddd' }}>{[...new Set(donHang.chitiettonguis.map(ct => ct.sanphams?.brands?.ten_brand))].map(b => <div key={b}>{b}</div>)}</td>
                          
                            <td style={{ width: `${columnWidths.sanPham}px`, padding: '12px', border: '1px solid #ddd' }}>{sanPhamDisplay}</td>
                              <td style={{ width: `${columnWidths.nhanSu}px`, 
                    padding: 
              '12px', border: '1px solid #ddd' }}>{donHang.nhansu?.ten_nhansu}</td>
                
                            <td style={{ width: `${columnWidths.loaiShip}px`, padding: '12px', border: '1px solid #ddd' }}><select style={{width: '100%'}} value={editingDonHang.loai_ship} onChange={e => setEditingDonHang({...editingDonHang, loai_ship: e.target.value})}><option>Ship thường</option><option>Hỏa tốc</option></select></td>
                
                              <td style={{ width: `${columnWidths.trangThai}px`, padding: '12px', border: '1px solid #ddd' }}><select style={{width: '100%'}} value={editingDonHang.trang_thai} onChange={(e) => setEditingDonHang({...editingDonHang, trang_thai: e.target.value})}><option>Chưa đóng đơn</option><option>Đã đóng đơn</option></select></td>
              
                            <td style={{ width: `${columnWidths.hanhDong}px`, padding: '12px', border: '1px solid #ddd' }}><button onClick={handleUpdate} style={{padding: '5px', backgroundColor: '#27AE60', color: 'white', border: 'none', borderRadius: '4px', 
                    margin: '2px'}}>Lưu</button><button onClick={handleCancelEdit} style={{padding: '5px', backgroundColor: '#95A5A6', color: 'white', border: 'none', borderRadius: '4px', margin: '2px'}}>Hủy</button></td>
                            </>
                   
              ) : ( // Chế độ Xem
 
                  
              <>
                              <td style={{ width: `${columnWidths.select}px`, padding: '12px', border: '1px solid #ddd' }}><input type="checkbox" checked={selectedOrders.has(donHang.id)} onChange={() => handleSelect(donHang.id)} /></td>
             
              
                 
                              <td style={{ width: `${columnWidths.stt}px`, padding: '12px', border: '1px solid #ddd' }}>{donHang.originalStt}</td>
                              <td style={{ width: `${columnWidths.ngayGui}px`, padding: '12px', border: '1px solid #ddd' }}>{new Date(donHang.ngay_gui).toLocaleString('vi-VN')}</td>
                              <td style={{ 
 
     
                                width: `${columnWidths.hoTenKOC}px`, padding: '12px', border: '1px solid #ddd', ...getCellStyle(donHang.koc_ho_ten, donHang.original_koc_ho_ten) }}>{donHang.koc_ho_ten}</td>
                              <td style={{ width: `${columnWidths.cccd}px`, padding: '12px', border: '1px solid #ddd', ...getCellStyle(donHang.koc_cccd, donHang.original_koc_cccd) }}>{donHang.koc_cccd}</td>
                         
                              <td style={{ width: `${columnWidths.idKenh}px`, padding: 
                            '12px', border: '1px solid #ddd', ...getCellStyle(donHang.koc_id_kenh, donHang.original_koc_id_kenh) }}>{donHang.koc_id_kenh}</td>
      
                              <td style={{ width: `${columnWidths.sdt}px`, padding: '12px', border: '1px solid #ddd', ...getCellStyle(donHang.koc_sdt, donHang.original_koc_sdt) }}>{donHang.koc_sdt}</td>
       
                              <td style={{ width: `${columnWidths.diaChi}px`, padding: '12px', border: '1px solid #ddd', ...getCellStyle(donHang.koc_dia_chi, donHang.original_koc_dia_chi) }}>{donHang.koc_dia_chi}</td>
   
                            
                              <td style={{ width: `${columnWidths.brand}px`, 
                    padding: '12px', border: '1px solid #ddd' }}>{[...new Set(donHang.chitiettonguis.map(ct => ct.sanphams?.brands?.ten_brand))].map(tenBrand => ( <div key={tenBrand}>{tenBrand}</div> ))}</td>
                              <td style={{ width: 
                            `${columnWidths.sanPham}px`, padding: '12px', border: '1px solid #ddd' }}>{sanPhamDisplay}</td>
                  
                              <td style={{ width: `${columnWidths.nhanSu}px`, 
              padding: '12px', border: '1px solid #ddd' }}>{donHang.nhansu?.ten_nhansu}</td>
                              <td style={{ width: `${columnWidths.loaiShip}px`, padding: '12px', border: '1px solid #ddd', ...getCellStyle(donHang.loai_ship, donHang.original_loai_ship) }}>{donHang.loai_ship}</td>
                      
                              <td style={{ width: `${columnWidths.trangThai}px`, padding: '12px', border: '1px solid #ddd', ...getCellStyle(donHang.trang_thai, donHang.original_trang_thai) }}>{donHang.trang_thai}</td>
          
                              <td style={{ width: `${columnWidths.hanhDong}px`, padding: '12px', border: '1px solid #ddd' }}><button onClick={() => handleEdit(donHang)} style={{padding: 
                         
                            '5px', backgroundColor: '#C0392B', color: 'white', border: 'none', borderRadius: '4px'}}>Sửa</button></td>
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
      )}

      {/* --- GIAO DIỆN TAB TẠO HỢP ĐỒNG (CẬP NHẬT) --- */}
      {currentView === 'contract' && (
          <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '1rem', fontFamily: 'Inter, sans-serif' }}>
 
              <header style={{ textAlign: 'center', marginBottom: '2rem', position: 'relative' }}>
                  <h1 style={{ fontSize: '2.25rem', fontWeight: '700', color: '#C0392B', textShadow: '1px 1px 2px #27AE60' }}>
                      <span style={{color: '#27AE60'}}>🎄🎅</span> Công Cụ Tạo Hợp Đồng Dịch Vụ Quảng Cáo <span style={{color: '#C0392B'}}>🎅🎄</span>
            
                  </h1>
                  <p style={{ marginTop: '0.5rem', color: '#27AE60' }}>Điền thông tin vào biểu mẫu bên dưới để tạo hợp đồng ngay lập tức.</p>
                  <p style={{ 
                      position: 'absolute', 
            
                      top: '0', 
                      left: '0', 
                      fontSize: '1rem', 
                      fontWeight: 'bold', 
                
                      color: '#C0392B',
                      backgroundColor: '#FFEBEE', 
                      padding: '5px 10px', 
                      borderRadius: '5px',
                     
                      border: '1px solid #C0392B'
                  }}>
                      Made by Khánh đẹp trai vkl
                  </p>
              </header>

              <main style={{ display: 'grid', gridTemplateColumns: 
              isOutputVisible ? '1fr 1fr' : '1fr', gap: '2rem', transition: 'grid-template-columns 0.3s ease-in-out' }}>
                  {/* CỘT ĐIỀN THÔNG TIN */}
           
                  <div style={{ backgroundColor: 'white', padding: '1.5rem', borderRadius: '0.75rem', boxShadow: '0 4px 10px rgba(192, 57, 43, 0.5)', border: '2px solid #C0392B' }}>
                
                      <h2 style={{ fontSize: '1.5rem', fontWeight: '600', marginBottom: '1.5rem', paddingBottom: '0.75rem', borderBottom: '2px dashed #C0392B', color: '#27AE60' }}>Thông tin hợp đồng</h2>
                      <form onSubmit={handleGenerateContract} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                          
       
           
                          {/* Thông tin Bên A */}
                          <fieldset style={{ border: '1px solid #27AE60', padding: '1rem', borderRadius: '0.5rem', backgroundColor: '#f0fff0' }}>
                              <legend style={{ padding: '0 0.5rem', fontWeight: '700', fontSize: '1.125rem', color: '#C0392B' }}>Bên 
                    A (Công ty)</legend>
           
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(1, 1fr)', '@media (min-width: 640px)': { gridTemplateColumns: 'repeat(2, 1fr)' }, gap: '1rem', marginTop: '0.5rem' }}>
                                 <div style={{ gridColumn: 'span 2' }}>
  
                                     <label htmlFor="benA_ten" style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#374151' }}>Tên công ty</label>
                                      <input type="text" id="benA_ten" onChange={handleContractFormChange} style={{ marginTop: '0.25rem', display: 'block', width: '100%', borderRadius: '0.375rem', 
                    border: '1px solid #d1d5db', padding: '0.5rem', fontSize: '0.875rem', backgroundColor: '#f9fafb' }} value={contractData.benA_ten} readOnly />
                                  </div>
          
                                <div style={{ gridColumn: 'span 2' }}>
      
                                     <label htmlFor="benA_diaChi" style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#374151' }}>Địa chỉ</label>
                               
                         
                                  <input type="text" id="benA_diaChi" onChange={handleContractFormChange} style={{ marginTop: '0.25rem', display: 'block', width: '100%', borderRadius: '0.375rem', border: '1px solid #d1d5db', padding: '0.5rem', fontSize: '0.875rem', backgroundColor: '#f9fafb' }} value={contractData.benA_diaChi} readOnly />
                                  </div>
                           
                                <div>
          
                                      <label htmlFor="benA_mst" style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#374151' }}>Mã số thuế</label>
                                
                                      <input type="text" id="benA_mst" onChange={handleContractFormChange} style={{ marginTop: '0.25rem', display: 'block', width: '100%', borderRadius: '0.375rem', border: '1px solid #d1d5db', padding: '0.5rem', fontSize: '0.875rem', backgroundColor: '#f9fafb' }} value={contractData.benA_mst} readOnly />
            
                                  </div>
                      
                                <div>
                                      <label htmlFor="benA_nguoiDaiDien" style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#374151' }}>Người đại diện</label>
                                     
                                      <input type="text" id="benA_nguoiDaiDien" onChange={handleContractFormChange} style={{ marginTop: '0.25rem', display: 'block', width: '100%', borderRadius: '0.375rem', border: '1px solid #d1d5db', padding: '0.5rem', fontSize: '0.875rem', backgroundColor: '#f9fafb' }} value={contractData.benA_nguoiDaiDien} readOnly />
                                  </div>
            
                           
                                <div>
                                      <label htmlFor="benA_chucVu" style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#374151' }}>Chức vụ</label>
                                  
         
                                      <input type="text" id="benA_chucVu" onChange={handleContractFormChange} style={{ marginTop: '0.25rem', display: 'block', width: '100%', borderRadius: '0.375rem', border: '1px solid #d1d5db', padding: '0.5rem', fontSize: '0.875rem', backgroundColor: '#f9fafb' }} value={contractData.benA_chucVu} readOnly />
                                  </div>
           
                            </div>
                 
                          </fieldset>

                          {/* Thông tin Bên B */}
       
                          <fieldset style={{ border: '1px solid #C0392B', padding: '1rem', borderRadius: '0.5rem', backgroundColor: '#fff5f5' }}>
                              <legend 
                            style={{ padding: '0 0.5rem', fontWeight: '700', fontSize: '1.125rem', color: '#27AE60' 
                    }}>Bên B (Người cung cấp dịch vụ)</legend>
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(1, 1fr)', '@media (min-width: 640px)': { gridTemplateColumns: 'repeat(2, 1fr)' }, gap: '1rem', marginTop: '0.5rem' }}>
                                  <div>
           
             
                                      <label htmlFor="benB_ten" style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#374151' }}>Họ và Tên</label>
                                     
                                      <input type="text" id="benB_ten" value={contractData.benB_ten} onChange={handleContractFormChange} style={{ marginTop: '0.25rem', display: 'block', width: '100%', borderRadius: '0.375rem', border: '1px solid #C0392B', padding: '0.5rem', fontSize: '0.875rem' }} placeholder="VD: MAI TIẾN LÂM" required />
                     
                            </div>
                      
                                <div>
                                      <label htmlFor="benB_sdt" style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#374151' }}>Số điện thoại</label>
        
                             
                                  <input type="text" id="benB_sdt" value={contractData.benB_sdt} onChange={handleContractFormChange} style={{ marginTop: '0.25rem', display: 'block', width: '100%', borderRadius: '0.375rem', border: '1px solid #C0392B', padding: '0.5rem', fontSize: '0.875rem' }} placeholder="VD: 0337972676" required />
                                  </div>
                   
            
                                <div style={{ gridColumn: 'span 2' }}>
                                      <label htmlFor="benB_diaChi" style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#374151' }}>Địa chỉ</label>
                         
                                      <input type="text" 
                                    id="benB_diaChi" value={contractData.benB_diaChi} onChange={handleContractFormChange} style={{ marginTop: '0.25rem', display: 'block', width: '100%', borderRadius: '0.375rem', border: '1px solid #C0392B', padding: '0.5rem', fontSize: '0.875rem' }} placeholder="VD: Hải Vân, Hải Hậu, Nam Định" required />
                    
                                </div>
                                  <div>
            
                                      <label htmlFor="benB_cccd" 
                    style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#374151' }}>Số CCCD</label>
                                      <input type="text" id="benB_cccd" value={contractData.benB_cccd} onChange={handleContractFormChange} style={{ marginTop: '0.25rem', display: 'block', width: '100%', borderRadius: '0.375rem', border: '1px solid #C0392B', padding: '0.5rem', fontSize: '0.875rem' }} placeholder="VD: 040202012030" required />
             
             
                                </div>
                                  <div>
                                      <label htmlFor="benB_mst" style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#374151' }}>Mã số 
                    thuế cá nhân</label>
                                      <input type="text" id="benB_mst" value={contractData.benB_mst} onChange={handleContractFormChange} style={{ marginTop: '0.25rem', display: 'block', width: '100%', borderRadius: '0.375rem', border: '1px solid #C0392B', padding: '0.5rem', fontSize: '0.875rem' }} placeholder="VD: 040202012030 (Optional)" />
                                  
                                </div>
          
                                  <div>
                                      <label htmlFor="benB_stk" style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#374151' }}>Số tài khoản</label>
     
                                      <input type="text" id="benB_stk" value={contractData.benB_stk} onChange={handleContractFormChange} style={{ marginTop: '0.25rem', display: 'block', width: '100%', borderRadius: '0.375rem', border: '1px solid #C0392B', padding: '0.5rem', fontSize: '0.875rem' }} placeholder="VD: 3720021903" required />
          
                                </div>
                                  <div>
        
                                  
                                      <label htmlFor="benB_nganHang" style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#374151' }}>Ngân hàng thụ hưởng</label>
                                      <input type="text" id="benB_nganHang" value={contractData.benB_nganHang} onChange={handleContractFormChange} style={{ marginTop: '0.25rem', display: 'block', width: '100%', borderRadius: '0.375rem', border: '1px solid #C0392B', padding: '0.5rem', fontSize: '0.875rem' }} placeholder="VD: VIETCOMBANK" required />
       
           
                                </div>
                                  <div style={{ gridColumn: 'span 2' }}>
                                      
      
                                      <label htmlFor="benB_nguoiThuHuong" style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#374151' }}>Người thụ hưởng (Viết HOA không dấu)</label>
                                      <input type="text" id="benB_nguoiThuHuong" value={contractData.benB_nguoiThuHuong} onChange={handleContractFormChange} style={{ marginTop: '0.25rem', display: 'block', width: '100%', borderRadius: '0.375rem', border: 
                    '1px solid #C0392B', padding: '0.5rem', fontSize: '0.875rem' }} placeholder="VD: MAI TIEN LAM" required />
                                  </div>
  
                              </div>
                     
                          </fieldset>

                          {/* Chi tiết hợp đồng */}
               
                            <fieldset style={{ border: '1px solid #27AE60', padding: '1rem', borderRadius: '0.5rem', backgroundColor: '#f0fff0' }}>
         
                              <legend style={{ padding: '0 0.5rem', fontWeight: '700', fontSize: '1.125rem', color: '#C0392B' }}>Nội dung công việc</legend>
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(1, 1fr)', '@media (min-width: 640px)': { gridTemplateColumns: 'repeat(2, 1fr)' }, gap: '1rem', marginTop: '0.5rem' }}>
               
 
                                <div>
                                      <label htmlFor="soHopDong" style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#374151' }}>Số hợp đồng</label>
                  
                                      <input type="text" id="soHopDong" value={contractData.soHopDong} onChange={handleContractFormChange} style={{ marginTop: '0.25rem', display: 'block', width: '100%', borderRadius: '0.375rem', border: '1px solid #27AE60', padding: '0.5rem', fontSize: '0.875rem' }} placeholder="VD: 260725/HĐQC/ten-STELLA" required />
                  
                                </div>
                                  <div>
             
                                     
                                      <label htmlFor="ngayKy" style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#374151' }}>Ngày ký hợp đồng</label>
                                      <input type="date" id="ngayKy" value={contractData.ngayKy} onChange={handleContractFormChange} style={{ marginTop: '0.25rem', display: 'block', width: '100%', borderRadius: '0.375rem', border: '1px solid #27AE60', padding: '0.5rem', fontSize: '0.875rem' }} required />
              
         
                                </div>
                                  <div>
                                      <label htmlFor="ngayThucHien" style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', 
                    color: '#374151' }}>Ngày đăng video</label>
 
                                      <input type="date" id="ngayThucHien" value={contractData.ngayThucHien} onChange={handleContractFormChange} style={{ marginTop: '0.25rem', display: 'block', width: '100%', borderRadius: '0.375rem', border: '1px solid #27AE60', padding: '0.5rem', fontSize: '0.875rem' }} required />
                                 
                                </div>
              
                                <div>
                                      <label htmlFor="sanPham" style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#374151' }}>Sản phẩm</label>
   
                                      <input type="text" id="sanPham" value={contractData.sanPham} onChange={handleContractFormChange} style={{ marginTop: '0.25rem', display: 'block', width: '100%', borderRadius: '0.375rem', border: '1px solid #27AE60', padding: '0.5rem', fontSize: '0.875rem' }} placeholder="VD: Bodymist - Brand BODYMISS" required 
                    />
                                  </div>
                                  <div style={{ gridColumn: 'span 2' }}>
         
                  
                                      <label htmlFor="linkSanPham" style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#374151' }}>Link sản phẩm</label>
                                      <input type="text" id="linkSanPham" value={contractData.linkSanPham} onChange={handleContractFormChange} style={{ marginTop: '0.25rem', display: 'block', width: '100%', borderRadius: '0.375rem', border: '1px solid #27AE60', padding: '0.5rem', fontSize: '0.875rem' }} placeholder="Dán link sản phẩm ở đây" 
                    required />
     
                                  </div>
                                  <div style={{ gridColumn: 'span 2' }}>
                     
                                      <label htmlFor="linkKenh" style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#374151' }}>Link kênh Tiktok</label>
                                  
                                      <input type="text" id="linkKenh" value={contractData.linkKenh} onChange={handleContractFormChange} style={{ marginTop: '0.25rem', display: 'block', width: '100%', borderRadius: '0.375rem', border: '1px solid #27AE60', padding: '0.5rem', fontSize: '0.875rem' }} placeholder="Dán link kênh Tiktok ở đây" required />
                                
                                  
                                </div>
                                  <div>
                                      <label htmlFor="soLuong" style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#374151' }}>Số lượng video</label>
               
                                      <input type="number" id="soLuong" value={contractData.soLuong} onChange={handleContractFormChange} style={{ marginTop: '0.25rem', display: 'block', width: '100%', borderRadius: '0.375rem', border: '1px solid #27AE60', padding: '0.5rem', fontSize: '0.875rem' }} min="1" required />
                                 
                                </div>
                               
                                <div>
                                    
                                      <label htmlFor="donGia" style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#374151' }}>Đơn giá (VNĐ)</label>
                                      <input type="number" id="donGia" value={contractData.donGia} onChange={handleContractFormChange} style={{ marginTop: '0.25rem', display: 'block', width: '100%', borderRadius: '0.375rem', border: '1px solid #27AE60', padding: '0.5rem', fontSize: '0.875rem' }} 
                        
                                    placeholder="VD: 2000000" required />
                                  </div>
                              </div>
                          </fieldset>

   
     
                          <div style={{ paddingTop: '1rem', textAlign: 'right' }}>
                              <button type="submit" style={{ display: 'inline-flex', justifyContent: 'center', alignItems: 'center', padding: '0.5rem 1.5rem', border: '1px solid transparent', boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)', fontSize: '0.875rem', fontWeight: 'bold', borderRadius: '0.375rem', color: 'white', backgroundColor: 
                    '#C0392B', cursor: 'pointer', transition: 'background-color 0.15s ease-in-out' }} onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#A93226'} onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#C0392B'}>
                               
                                Tạo Hợp Đồng
                  
                            </button>
                          </div>
                      </form>
                 
                  </div>

     
                  {/* CỘT HIỂN THỊ KẾT QUẢ */}
                  <div id="outputContainer" style={{ backgroundColor: 'white', padding: '1.5rem', borderRadius: '0.75rem', boxShadow: '0 4px 10px rgba(43, 168, 86, 0.5)', border: '2px solid #27AE60', display: isOutputVisible ?
                    'block' : 'none' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px dashed #C0392B', paddingBottom: '0.75rem', marginBottom: '1rem' }}>
                          <h2 style={{ fontSize: '1.5rem', fontWeight: '700', fontFamily: 'Inter, sans-serif', color: '#C0392B' }}>Nội dung hợp đồng</h2>
                   
                          <div>
        
                              <button onClick={handleCopyToClipboard} style={{ padding: '0.5rem 1rem', fontSize: '0.875rem', fontWeight: 'bold', borderRadius: '0.375rem', color: 'white', backgroundColor: '#27AE60', border: 'none', cursor: 'pointer', transition: 'background-color 0.15s ease-in-out' }} onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#1F8C4B'} onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#27AE60'}>
                     
                                  Sao chép
                              
                            </button>
                            
                              <button onClick={() => window.print()} style={{ marginLeft: '0.5rem', padding: '0.5rem 1rem', fontSize: '0.875rem', fontWeight: 'bold', borderRadius: '0.375rem', color: '#374151', backgroundColor: '#F1C40F', border: 'none', cursor: 'pointer', transition: 'background-color 0.15s ease-in-out' }} onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#D4AC0D'} onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#F1C40F'}>
                                  In / PDF
                 
      
                              </button>
                          </div>
                      </div>
                      <div style={{ backgroundColor: '#f9fafb', padding: '1rem', borderRadius: '0.375rem', 
                    overflow: 'auto', maxHeight: '80vh', border: '1px dashed #C0392B' }}>
         
                          {/* SỬ DỤNG dangerouslySetInnerHTML để render HTML từ chuỗi contractHTML */}
                          <div id="contractContent" dangerouslySetInnerHTML={{ __html: contractHTML }} />
               
                        </div>
                   
                        <div style={{ marginTop: '0.5rem', fontSize: '0.875rem', fontWeight: '500', color: copyMessage.type === 'success' ?
                    '#27AE60' : copyMessage.type === 'error' ? '#C0392B' : 'transparent', opacity: copyMessage.type === 'hidden' ?
                    0 : 1, transition: 'opacity 0.3s ease-in-out' }}>
                          {copyMessage.text}
                      </div>
                  </div>
              </main>
          </div>
 
    )}
  
    </div>
  );
 }

export default App;