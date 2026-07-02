// buildSpxExcel.js
// Xuất file Excel ĐÚNG mẫu "Tạo đơn (địa chỉ mới)" của Shopee Express (spx.vn)
// để upload hàng loạt lên hệ thống SPX. Gói tách rời từ CVI Ecom Hub — chỉ cần
// mảng đơn hàng đã chuẩn hoá theo shape bên dưới + thư viện `xlsx`.
//
// Shape 1 đơn hàng (tất cả field optional trừ ghi chú "*bắt buộc"):
// {
//   ho_ten, sdt, tinh, phuong, dia_chi_chi_tiet, dia_chi_day_du,
//   items: [ { ten_san_pham, so_luong, gia_tien } ],
// }
// Nếu thiếu tinh/phuong → truyền dia_chi_day_du, hàm tự tách qua splitDiaChi().

import * as XLSX from 'xlsx';

export const SPX_HEADERS = [
  '*Mã đơn hàng', '*Tên người nhận', '*Số điện thoại', '*Tỉnh/Thành Phố', '*Xã/Phường',
  '*Địa chỉ chi tiết', 'Lưu ý về địa chỉ', 'Mã bưu chính', '*Tên sản phẩm',
  'Số lượng (Thông tin bắt buộc khi chọn Giao hàng một phần & Thu COD)',
  'Giá tiền (Thông tin bắt buộc khi chọn Giao hàng một phần & Thu COD)',
  '*Tổng cân nặng bưu gửi (KG)', 'Chiều dài (CM)', 'Chiều rộng (CM)', 'Chiều cao (CM)',
  'Mã khách hàng', '*Giá trị đơn hàng', '*Giao hàng một phần (Y/N)', '*Cho phép thử hàng (Y/N)',
  '*Cho xem hàng, không cho thử (Y/N)', 'Thu phí từ chối nhận hàng (Y/N)', 'Phí từ chối nhận hàng cần thu',
  '*Thu COD (Y/N)', 'Số tiền COD', 'bưu gửi giá trị cao (Y/N)', '*Hình thức thanh Toán',
  'Lưu ý giao hàng', 'Nhắc nhở điền đúng số tiền COD', 'Đơn chỉ hoàn thành nếu ở dưới hiện "Đủ điều kiện"',
];

// Tách 1 chuỗi địa chỉ viết liền/có dấu phẩy thành { tinh, quan, phuong, soNha }.
export function splitDiaChi(raw) {
  let s = String(raw || '').replace(/\s+/g, ' ').trim();
  s = s.replace(/\s+(phường|xã|thị trấn|quận|huyện|thị xã|tỉnh|thành phố|tp)\b/gi, ', $1');
  const parts = s.split(',').map(x => x.trim()).filter(Boolean);
  if (parts.length < 2) return { tinh: '', quan: '', phuong: '', soNha: raw || '' };
  const tinh = parts[parts.length - 1];
  const middle = parts.slice(0, -1);
  const phuongRe = /^(phường|xã|thị trấn|p\.|x\.)\s/i;
  const quanRe = /^(quận|huyện|thị xã|q\.|h\.)\s/i;
  let phuong = '', quan = '';
  const soNhaParts = [];
  middle.forEach(p => {
    if (!phuong && phuongRe.test(p)) phuong = p;
    else if (!quan && quanRe.test(p)) quan = p;
    else soNhaParts.push(p);
  });
  if (!phuong && soNhaParts.length > 1) phuong = soNhaParts.pop();
  return { tinh, quan, phuong, soNha: soNhaParts.join(', ') };
}

// Trả về { headers, rows } dạng mảng 2 chiều (chưa ghi file).
export function buildSpxRows(orders, { canNang = 0.5 } = {}) {
  const rows = [];
  (orders || []).forEach((d, i) => {
    const ma = i + 1;
    const dc = splitDiaChi(d.dia_chi_day_du || '');
    const items = (d.items && d.items.length) ? d.items : [{ so_luong: 1, ten_san_pham: '' }];
    // d.gia_tri (nếu truyền) GHI ĐÈ giá trị đơn hàng — dùng khi gộp nhiều SP vào 1 dòng (gia_tien đã là TỔNG,
    // không nhân lại với so_luong). Không truyền thì tự cộng Σ(SL × giá) như cũ.
    const giaTri = (Number(d.gia_tri) > 0)
      ? Number(d.gia_tri)
      : (items.reduce((s, it) => s + (Number(it.so_luong) || 0) * (Number(it.gia_tien) || 0), 0) || 10000);
    // Nhiều SP = nhiều DÒNG, THÔNG TIN LẶP LẠI Y CHANG mỗi dòng (tên/SĐT/địa chỉ/lựa chọn giao hàng/giá trị
    // đơn hàng) — CHỈ đổi "Tên sản phẩm" + "Giá tiền" theo từng SP (Khánh chốt 2/7, khác chuẩn official
    // vốn chỉ điền info ở dòng đầu — nhưng đây là cách Khánh muốn dùng nội bộ).
    items.forEach((it) => {
      rows.push([
        ma,
        d.ho_ten || '',
        d.sdt || '',
        d.tinh || dc.tinh || '',
        d.phuong || dc.phuong || '',
        d.dia_chi_chi_tiet || d.dia_chi_day_du || '',
        '', '',
        it.ten_san_pham || '',
        it.so_luong || 1,
        it.gia_tien || '',
        canNang,
        '', '', '', '',
        giaTri,
        'N', // *Giao hàng một phần
        'N', // *Cho phép thử hàng
        'Y', // *Cho xem hàng, không cho thử
        'N', // Thu phí từ chối nhận hàng
        '',
        'N', // *Thu COD — đơn KOC/tặng mẫu mặc định KHÔNG thu COD
        '',
        'N', // bưu gửi giá trị cao
        'Người gửi trả', // *Hình thức thanh Toán — người gửi trả ship
        '', '', '',
      ]);
    });
  });
  return { headers: SPX_HEADERS, rows };
}

// Tạo workbook + tải file .xlsx về máy ngay (dùng trong browser).
export function buildAndDownloadSpxExcel(orders, opts = {}) {
  const { headers, rows } = buildSpxRows(orders, opts);
  if (!rows.length) throw new Error('Không có đơn nào để xuất.');
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Tạo đơn (địa chỉ mới)');
  const filename = opts.filename || `shopee-express-don-${orders.length}-don.xlsx`;
  XLSX.writeFile(wb, filename);
}
