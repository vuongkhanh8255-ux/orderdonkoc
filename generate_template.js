import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';

const headers = [
    ["Link Air (URL)", "Brand (Tên)", "Sản Phẩm", "Nhân Sự (Tên)", "Ngày Air (YYYY-MM-DD)", "Ngày Booking (YYYY-MM-DD)", "Cast (VND)", "CMS (%)", "Kênh (ID - Optional)", "Video (ID - Optional)"]
];

const exampleData = [
    ["https://www.tiktok.com/@kenh_demo/video/123456789", "Cocoon", "Toner hoa cúc", "Nguyễn Văn A", "2024-10-20", "2024-10-15", "500000", "10%", "", ""]
];

const wb = XLSX.utils.book_new();
const ws = XLSX.utils.aoa_to_sheet([...headers, ...exampleData]);

// Set column widths
ws['!cols'] = [
    { wch: 50 }, // Link
    { wch: 20 }, // Brand
    { wch: 20 }, // SP
    { wch: 20 }, // NhanSu
    { wch: 15 }, // Date
    { wch: 15 }, // Date
    { wch: 15 }, // Cast
    { wch: 10 }, // CMS
    { wch: 20 }, // KenhID
    { wch: 20 }  // VideoID
];

XLSX.utils.book_append_sheet(wb, ws, "Template");

const outputPath = path.resolve('public', 'Mau_Nhap_Link_Air.xlsx');
XLSX.writeFile(wb, outputPath);
console.log(`Template created at: ${outputPath}`);
