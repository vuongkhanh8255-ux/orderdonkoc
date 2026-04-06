// add_landing_tab.js
// Chạy lệnh này trong thư mục C:\Users\ASUS\koc-tool:
//   node add_landing_tab.js
//
// Script này sẽ tự động:
// 1. Copy LandingOrders.jsx vào src/tabs/
// 2. Thêm import + tab vào App.jsx
// 3. Báo kết quả

const fs = require('fs');
const path = require('path');

const SRC_DIR = path.join(__dirname, 'src');
const APP_JSX = path.join(SRC_DIR, 'App.jsx');
const TABS_DIR = path.join(SRC_DIR, 'tabs');
const COMPONENT_SRC = path.join(__dirname, 'LandingOrders.jsx');

// ── Kiểm tra file tồn tại ──
if (!fs.existsSync(APP_JSX)) {
  console.error('❌ Không tìm thấy src/App.jsx. Đang ở đúng thư mục chưa?');
  process.exit(1);
}
if (!fs.existsSync(COMPONENT_SRC)) {
  console.error('❌ Không tìm thấy LandingOrders.jsx cạnh script này.');
  process.exit(1);
}

// ── Copy component vào đúng thư mục ──
const tabsDirs = [
  path.join(SRC_DIR, 'tabs'),
  path.join(SRC_DIR, 'components'),
  path.join(SRC_DIR, 'pages'),
  SRC_DIR
];
let destDir = SRC_DIR;
for (const d of tabsDirs) {
  if (fs.existsSync(d)) { destDir = d; break; }
}

const COMPONENT_DEST = path.join(destDir, 'LandingOrders.jsx');
fs.copyFileSync(COMPONENT_SRC, COMPONENT_DEST);
console.log(`✅ Đã copy LandingOrders.jsx → ${path.relative(__dirname, COMPONENT_DEST)}`);

// ── Đọc App.jsx ──
let appContent = fs.readFileSync(APP_JSX, 'utf8');

// Tính import path tương đối từ App.jsx tới LandingOrders.jsx
const appDir = path.dirname(APP_JSX);
let importPath = './' + path.relative(appDir, COMPONENT_DEST).replace(/\\/g, '/').replace(/\.jsx$/, '');
const IMPORT_LINE = `import LandingOrders from '${importPath}';`;

// Kiểm tra đã có import chưa
if (appContent.includes('LandingOrders')) {
  console.log('⚠️  LandingOrders đã có trong App.jsx rồi, bỏ qua.');
  process.exit(0);
}

// ── Thêm import sau dòng import cuối cùng ──
// Tìm dòng import cuối cùng
const importRegex = /^import .+$/gm;
let lastImportMatch = null;
let match;
while ((match = importRegex.exec(appContent)) !== null) {
  lastImportMatch = match;
}

if (lastImportMatch) {
  const insertPos = lastImportMatch.index + lastImportMatch[0].length;
  appContent = appContent.slice(0, insertPos) + '\n' + IMPORT_LINE + appContent.slice(insertPos);
  console.log('✅ Đã thêm import LandingOrders');
} else {
  // Thêm vào đầu file
  appContent = IMPORT_LINE + '\n' + appContent;
  console.log('✅ Đã thêm import LandingOrders (đầu file)');
}

// ── Tìm và thêm tab vào TAB_CONFIG / tabs array ──
// Các pattern phổ biến trong App.jsx kiểu koc-tool
const TAB_ENTRY = `{ key: 'landing', label: '🛒 Đơn hàng Landing Page', component: <LandingOrders /> }`;

// Pattern 1: const TABS = [...] hoặc const tabs = [...]
const tabsArrayPattern = /(const\s+(?:TABS|tabs|NAV_ITEMS|navItems|MENU|menuItems)\s*=\s*\[)([\s\S]*?)(\])/;
const tabsMatch = appContent.match(tabsArrayPattern);

if (tabsMatch) {
  // Thêm vào cuối array, trước dấu ]
  const beforeClose = tabsMatch[2].trimEnd();
  const hasTrailingComma = beforeClose.endsWith(',');
  const separator = hasTrailingComma ? '\n  ' : ',\n  ';
  appContent = appContent.replace(
    tabsArrayPattern,
    `$1$2${separator}${TAB_ENTRY}\n$3`
  );
  console.log('✅ Đã thêm tab vào mảng tabs');
} else {
  // Pattern 2: Tìm chỗ render tab theo key, thêm case mới
  const switchPattern = /(case\s+['"](?:ecom|booking|luu-tru|livestream|overview|stella)['"]\s*:)/i;
  if (switchPattern.test(appContent)) {
    appContent = appContent.replace(
      switchPattern,
      `case 'landing': return <LandingOrders />;\n      $1`
    );
    console.log('✅ Đã thêm case landing vào switch');
  } else {
    // Pattern 3: Dùng object map { key: component }
    const objPattern = /(\{\s*)(ecom|booking|overview)\s*:/i;
    if (objPattern.test(appContent)) {
      appContent = appContent.replace(
        objPattern,
        `$1landing: <LandingOrders />,\n  $2:`
      );
      console.log('✅ Đã thêm landing vào component map');
    } else {
      console.log('⚠️  Không tìm được vị trí thêm tab tự động.');
      console.log('    Mày cần thêm thủ công vào App.jsx:');
      console.log('    ' + TAB_ENTRY);
    }
  }
}

// ── Ghi file ──
// Backup trước
fs.writeFileSync(APP_JSX + '.bak', fs.readFileSync(APP_JSX));
fs.writeFileSync(APP_JSX, appContent, 'utf8');
console.log('✅ Đã ghi App.jsx (backup: App.jsx.bak)');

console.log('\n🚀 Xong! Chạy tiếp:');
console.log('   git add -A');
console.log('   git commit -m "feat: add landing page orders tab"');
console.log('   git push');
console.log('\nVercel sẽ tự deploy sau ~30 giây!');
