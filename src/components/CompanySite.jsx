// src/components/CompanySite.jsx
//
// Trang web CÔNG TY công khai cho domain appcash.app (APPCASH CO., LTD).
// Mục đích: làm "Company Website" hợp lệ để nộp đơn TikTok Business API
// (đơn trước bị reject vì domain .space — giờ dùng appcash.app + web doanh nghiệp đàng hoàng).
// Tách hẳn với tool nội bộ (stellakinetics.space) — chỉ render khi hostname = appcash.app.
//
// ⚠️ CẦN CẬP NHẬT (thay cho khớp thực tế công ty): email liên hệ, địa chỉ đăng ký KD,
//    số điện thoại. Tìm "UPDATE:" trong file.

import React from 'react';

const ORANGE = '#ea580c';
const COMPANY = 'APPCASH CO., LTD';
const BRAND = 'Stella Kinetics';
const EMAIL = 'contact@appcash.app';        // UPDATE: email công ty (nên set forwarding cho appcash.app)
const ADDRESS = 'Ho Chi Minh City, Vietnam'; // UPDATE: địa chỉ đăng ký kinh doanh đầy đủ
const UPDATED = 'June 2026';

const wrap = { fontFamily: "'Outfit', system-ui, sans-serif", color: '#0f172a', background: '#fff', minHeight: '100vh' };
const container = { maxWidth: 960, margin: '0 auto', padding: '0 22px' };
const h2 = { fontSize: '1.5rem', fontWeight: 900, margin: '0 0 14px', color: '#0f172a' };
const p = { fontSize: '0.98rem', lineHeight: 1.7, color: '#334155', margin: '0 0 14px' };

// ── Header / Footer dùng chung ────────────────────────────────────────────────
const Header = () => (
  <header style={{ borderBottom: '1px solid #f1f5f9', position: 'sticky', top: 0, background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(8px)', zIndex: 10 }}>
    <div style={{ ...container, display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 64 }}>
      <a href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
        <span style={{ width: 34, height: 34, borderRadius: 8, background: ORANGE, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: '1.2rem' }}>✦</span>
        <span style={{ fontWeight: 900, color: '#0f172a', letterSpacing: 0.3 }}>{COMPANY}</span>
      </a>
      <nav style={{ display: 'flex', gap: 22, fontSize: '0.9rem', fontWeight: 600 }}>
        <a href="/#about" style={{ color: '#475569', textDecoration: 'none' }}>Giới thiệu</a>
        <a href="/#what" style={{ color: '#475569', textDecoration: 'none' }}>Lĩnh vực</a>
        <a href="/#contact" style={{ color: '#475569', textDecoration: 'none' }}>Liên hệ</a>
      </nav>
    </div>
  </header>
);

const Footer = () => (
  <footer style={{ borderTop: '1px solid #f1f5f9', marginTop: 60, background: '#fafafa' }}>
    <div style={{ ...container, padding: '28px 22px', display: 'flex', flexWrap: 'wrap', gap: 16, justifyContent: 'space-between', alignItems: 'center' }}>
      <div style={{ fontSize: '0.84rem', color: '#64748b' }}>
        © {new Date().getFullYear()} {COMPANY}. All rights reserved.
      </div>
      <div style={{ display: 'flex', gap: 20, fontSize: '0.84rem', fontWeight: 600 }}>
        <a href="/privacy" style={{ color: ORANGE, textDecoration: 'none' }}>Privacy Policy</a>
        <a href="/terms" style={{ color: ORANGE, textDecoration: 'none' }}>Terms of Service</a>
        <a href={`mailto:${EMAIL}`} style={{ color: '#475569', textDecoration: 'none' }}>{EMAIL}</a>
      </div>
    </div>
  </footer>
);

// ── Trang chủ ──────────────────────────────────────────────────────────────────
const Landing = () => (
  <div style={wrap}>
    <Header />

    {/* Hero */}
    <section style={{ background: 'linear-gradient(180deg,#fff7ed 0%,#fff 100%)', padding: '72px 0 56px' }}>
      <div style={container}>
        <span style={{ display: 'inline-block', background: '#ffedd5', color: '#9a3412', fontWeight: 700, fontSize: '0.78rem', padding: '5px 12px', borderRadius: 20, marginBottom: 18 }}>
          E-commerce · Vietnam
        </span>
        <h1 style={{ fontSize: '2.6rem', fontWeight: 900, lineHeight: 1.15, margin: '0 0 16px', maxWidth: 720 }}>
          {COMPANY} — nhà vận hành thương hiệu <span style={{ color: ORANGE }}>{BRAND}</span>
        </h1>
        <p style={{ ...p, fontSize: '1.1rem', maxWidth: 680 }}>
          Chúng tôi là doanh nghiệp thương mại điện tử tại Việt Nam, vận hành nhiều gian hàng bán lẻ
          trên TikTok Shop và Shopee — chuyên về <b>mỹ phẩm, chăm sóc cá nhân và sản phẩm phong cách sống</b>.
        </p>
        <div style={{ display: 'flex', gap: 12, marginTop: 26, flexWrap: 'wrap' }}>
          <a href="/#contact" style={{ background: ORANGE, color: '#fff', fontWeight: 700, padding: '12px 24px', borderRadius: 10, textDecoration: 'none', fontSize: '0.95rem' }}>Liên hệ hợp tác</a>
          <a href="/#about" style={{ background: '#fff', color: '#0f172a', fontWeight: 700, padding: '12px 24px', borderRadius: 10, textDecoration: 'none', border: '1px solid #e5e7eb', fontSize: '0.95rem' }}>Tìm hiểu thêm</a>
        </div>
      </div>
    </section>

    {/* Stats */}
    <section style={{ ...container, padding: '8px 22px 8px', marginTop: -28 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 16 }}>
        {[
          { n: '6+', l: 'Gian hàng bán lẻ' },
          { n: '2', l: 'Sàn TMĐT (TikTok Shop, Shopee)' },
          { n: '100K+', l: 'Đơn hàng đã xử lý' },
          { l: 'Thị trường', n: 'Việt Nam' },
        ].map((s, i) => (
          <div key={i} style={{ background: '#fff', border: '1px solid #f1f5f9', borderRadius: 14, padding: '18px 20px', boxShadow: '0 1px 4px rgba(15,23,42,0.05)' }}>
            <div style={{ fontSize: '1.6rem', fontWeight: 900, color: ORANGE }}>{s.n}</div>
            <div style={{ fontSize: '0.82rem', color: '#64748b', marginTop: 2 }}>{s.l}</div>
          </div>
        ))}
      </div>
    </section>

    {/* About */}
    <section id="about" style={{ ...container, padding: '56px 22px' }}>
      <h2 style={h2}>Về {COMPANY}</h2>
      <p style={p}>
        {COMPANY} là công ty thương mại điện tử được thành lập và đăng ký hợp pháp tại Việt Nam.
        Chúng tôi xây dựng và vận hành thương hiệu <b>{BRAND}</b> cùng nhiều gian hàng bán lẻ trực tuyến,
        mang các sản phẩm mỹ phẩm và phong cách sống chất lượng đến người tiêu dùng Việt Nam.
      </p>
      <p style={p}>
        Hoạt động kinh doanh của chúng tôi trải rộng trên các nền tảng thương mại điện tử lớn gồm
        <b> TikTok Shop</b> và <b>Shopee</b>. Chúng tôi đầu tư vào công nghệ vận hành, phân tích dữ liệu
        và marketing hiệu suất để phục vụ khách hàng tốt hơn và phát triển bền vững.
      </p>
    </section>

    {/* What we do */}
    <section id="what" style={{ background: '#fafafa', padding: '56px 0', borderTop: '1px solid #f1f5f9', borderBottom: '1px solid #f1f5f9' }}>
      <div style={container}>
        <h2 style={h2}>Lĩnh vực hoạt động</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 18, marginTop: 8 }}>
          {[
            { icon: '🛍️', t: 'Bán lẻ TMĐT', d: 'Vận hành gian hàng chính hãng trên TikTok Shop và Shopee, phục vụ khách hàng toàn quốc.' },
            { icon: '💄', t: 'Mỹ phẩm & chăm sóc cá nhân', d: 'Nước hoa, xịt thơm body, sản phẩm làm đẹp và chăm sóc cá nhân.' },
            { icon: '📊', t: 'Marketing hiệu suất', d: 'Quản lý và tối ưu chiến dịch quảng cáo dựa trên dữ liệu hiệu suất theo thời gian thực.' },
            { icon: '🤝', t: 'Hợp tác KOC/Affiliate', d: 'Hợp tác với nhà sáng tạo nội dung để quảng bá sản phẩm minh bạch, hiệu quả.' },
          ].map((c, i) => (
            <div key={i} style={{ background: '#fff', border: '1px solid #f1f5f9', borderRadius: 14, padding: '20px 22px' }}>
              <div style={{ fontSize: '1.6rem', marginBottom: 10 }}>{c.icon}</div>
              <div style={{ fontWeight: 800, fontSize: '1rem', marginBottom: 6 }}>{c.t}</div>
              <div style={{ fontSize: '0.88rem', color: '#64748b', lineHeight: 1.6 }}>{c.d}</div>
            </div>
          ))}
        </div>
      </div>
    </section>

    {/* Contact */}
    <section id="contact" style={{ ...container, padding: '56px 22px' }}>
      <h2 style={h2}>Liên hệ</h2>
      <p style={p}>Mọi nhu cầu hợp tác, đối tác hoặc thắc mắc, vui lòng liên hệ:</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 16, marginTop: 8 }}>
        <div style={{ border: '1px solid #f1f5f9', borderRadius: 14, padding: '18px 20px' }}>
          <div style={{ fontSize: '0.74rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>Công ty</div>
          <div style={{ fontWeight: 700, marginTop: 4 }}>{COMPANY}</div>
        </div>
        <div style={{ border: '1px solid #f1f5f9', borderRadius: 14, padding: '18px 20px' }}>
          <div style={{ fontSize: '0.74rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>Email</div>
          <a href={`mailto:${EMAIL}`} style={{ fontWeight: 700, marginTop: 4, color: ORANGE, textDecoration: 'none', display: 'block' }}>{EMAIL}</a>
        </div>
        <div style={{ border: '1px solid #f1f5f9', borderRadius: 14, padding: '18px 20px' }}>
          <div style={{ fontSize: '0.74rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>Địa chỉ</div>
          <div style={{ fontWeight: 700, marginTop: 4 }}>{ADDRESS}</div>
        </div>
      </div>
    </section>

    <Footer />
  </div>
);

// ── Privacy Policy ──────────────────────────────────────────────────────────────
const Privacy = () => (
  <div style={wrap}>
    <Header />
    <article style={{ ...container, padding: '48px 22px 0' }}>
      <h1 style={{ fontSize: '2rem', fontWeight: 900, margin: '0 0 6px' }}>Privacy Policy</h1>
      <p style={{ color: '#94a3b8', fontSize: '0.86rem', margin: '0 0 28px' }}>Last updated: {UPDATED}</p>

      <p style={p}>This Privacy Policy explains how {COMPANY} (“we”, “us”, “our”), operator of the {BRAND} brand, collects, uses, and protects information in connection with our e-commerce operations and our internal analytics tools.</p>

      <h2 style={h2}>1. Information we collect</h2>
      <p style={p}>We collect and process business and advertising performance data from e-commerce and advertising platforms where we operate our <b>own</b> stores and ad accounts, including order metrics, product performance, and advertising metrics (impressions, clicks, conversions, cost, and ROAS). We access this data through official platform APIs (including the TikTok Shop API and TikTok Business/Marketing API) using authorized credentials for accounts that we own and operate.</p>

      <h2 style={h2}>2. How we use information</h2>
      <p style={p}>The data is used solely for our internal business purposes: monitoring sales and advertising performance, generating reports for our marketing team, optimizing advertising budgets, and improving operational efficiency. The tools are for internal company use only.</p>

      <h2 style={h2}>3. Data sharing</h2>
      <p style={p}>We do <b>not</b> sell, rent, or trade your data. We do not share platform data with third parties for their own marketing purposes. Data may be processed by trusted infrastructure providers (e.g. hosting and database services) strictly to operate our internal tools, under appropriate confidentiality obligations.</p>

      <h2 style={h2}>4. TikTok platform data</h2>
      <p style={p}>When using TikTok APIs, we comply with TikTok’s developer terms and policies. We only access data for accounts we own and are authorized to manage, use it strictly for the internal purposes described above, and retain it only as long as necessary for those purposes.</p>

      <h2 style={h2}>5. Data security</h2>
      <p style={p}>We apply reasonable technical and organizational measures to protect data, including encrypted connections (HTTPS), restricted access controls, and secure storage. Access to internal tools is limited to authorized personnel.</p>

      <h2 style={h2}>6. Data retention</h2>
      <p style={p}>We retain business data only for as long as needed for reporting and operational purposes, after which it is deleted or anonymized.</p>

      <h2 style={h2}>7. Your rights & contact</h2>
      <p style={p}>For any questions about this Privacy Policy or to request information regarding data we hold, contact us at <a href={`mailto:${EMAIL}`} style={{ color: ORANGE }}>{EMAIL}</a>.</p>

      <h2 style={h2}>8. Changes</h2>
      <p style={p}>We may update this Privacy Policy from time to time. The latest version will always be available on this page.</p>
    </article>
    <Footer />
  </div>
);

// ── Terms of Service ─────────────────────────────────────────────────────────────
const Terms = () => (
  <div style={wrap}>
    <Header />
    <article style={{ ...container, padding: '48px 22px 0' }}>
      <h1 style={{ fontSize: '2rem', fontWeight: 900, margin: '0 0 6px' }}>Terms of Service</h1>
      <p style={{ color: '#94a3b8', fontSize: '0.86rem', margin: '0 0 28px' }}>Last updated: {UPDATED}</p>

      <p style={p}>These Terms of Service govern your use of the website and services provided by {COMPANY} (“we”, “us”, “our”). By accessing this website, you agree to these terms.</p>

      <h2 style={h2}>1. About us</h2>
      <p style={p}>{COMPANY} is an e-commerce company registered in Vietnam, operating the {BRAND} brand and multiple online retail stores on platforms including TikTok Shop and Shopee.</p>

      <h2 style={h2}>2. Use of this website</h2>
      <p style={p}>This website provides public information about our company and business. You agree not to misuse the website, attempt unauthorized access, or use it for any unlawful purpose.</p>

      <h2 style={h2}>3. Internal tools</h2>
      <p style={p}>Certain tools and dashboards operated by us are for internal company use only and require authorized credentials. Access by unauthorized parties is prohibited.</p>

      <h2 style={h2}>4. Intellectual property</h2>
      <p style={p}>All content on this website, including text, logos, and brand names, is the property of {COMPANY} or its licensors and may not be used without permission. Third-party trademarks (such as TikTok and Shopee) belong to their respective owners.</p>

      <h2 style={h2}>5. Disclaimer</h2>
      <p style={p}>This website is provided “as is” without warranties of any kind. We are not liable for any damages arising from the use of this website to the extent permitted by law.</p>

      <h2 style={h2}>6. Contact</h2>
      <p style={p}>Questions about these Terms can be sent to <a href={`mailto:${EMAIL}`} style={{ color: ORANGE }}>{EMAIL}</a>.</p>
    </article>
    <Footer />
  </div>
);

// ── Router đơn giản theo pathname ───────────────────────────────────────────────
export default function CompanySite() {
  const path = window.location.pathname.replace(/\/+$/, '');
  if (path === '/privacy') return <Privacy />;
  if (path === '/terms') return <Terms />;
  return <Landing />;
}
