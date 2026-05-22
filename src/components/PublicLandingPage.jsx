// src/components/PublicLandingPage.jsx
// Public landing page — accessible without login for API review purposes

const PublicLandingPage = ({ onGoLogin }) => {
  const section = { maxWidth: 1100, margin: '0 auto', padding: '0 24px' };
  const card = {
    background: '#fff', borderRadius: 16, padding: '32px 28px',
    boxShadow: '0 1px 4px rgba(15,23,42,0.06)', border: '1px solid #f1f5f9',
  };

  return (
    <div style={{ fontFamily: "'Outfit', sans-serif", color: '#0f172a', background: '#f8fafc', minHeight: '100vh' }}>

      {/* ── Navbar ──────────────────────────────────────────────────────── */}
      <nav style={{
        background: '#fff', borderBottom: '1px solid #e5e7eb', padding: '0 32px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 64,
        position: 'sticky', top: 0, zIndex: 100,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 38, height: 38, borderRadius: 10, background: 'linear-gradient(135deg, #ea580c, #f97316)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontWeight: 900, fontSize: '1.1rem',
          }}>SK</div>
          <div>
            <div style={{ fontWeight: 800, fontSize: '1rem', lineHeight: 1.2 }}>STELLA KINETICS</div>
            <div style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 600, letterSpacing: '0.5px' }}>POWERED BY APPCASH CO., LTD</div>
          </div>
        </div>
        <button onClick={onGoLogin} style={{
          padding: '8px 24px', borderRadius: 8, border: 'none',
          background: '#ea580c', color: '#fff', fontWeight: 700, fontSize: '0.82rem',
          cursor: 'pointer', fontFamily: 'inherit',
        }}>
          Đăng nhập
        </button>
      </nav>

      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <div style={{
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
        padding: '80px 24px', textAlign: 'center', color: '#fff',
      }}>
        <div style={section}>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#fb923c', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: 16 }}>
            ECOMMERCE MANAGEMENT PLATFORM
          </div>
          <h1 style={{ fontSize: '2.8rem', fontWeight: 900, margin: '0 0 16px', lineHeight: 1.2 }}>
            Stella Kinetics Dashboard
          </h1>
          <p style={{ fontSize: '1.1rem', color: '#94a3b8', maxWidth: 650, margin: '0 auto 32px', lineHeight: 1.7 }}>
            Internal analytics and operations platform for managing multi-channel ecommerce business
            across TikTok Shop and Shopee in Vietnam.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            {['TikTok Shop', 'Shopee', 'Analytics', 'Ads Management', 'CRM', 'Livestream'].map(tag => (
              <span key={tag} style={{
                padding: '6px 16px', borderRadius: 20, background: 'rgba(234,88,12,0.15)',
                color: '#fb923c', fontSize: '0.78rem', fontWeight: 600,
              }}>{tag}</span>
            ))}
          </div>
        </div>
      </div>

      {/* ── About Company ───────────────────────────────────────────────── */}
      <div style={{ padding: '64px 24px' }}>
        <div style={section}>
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <h2 style={{ fontSize: '1.6rem', fontWeight: 900, margin: '0 0 8px' }}>About Our Company</h2>
            <p style={{ color: '#64748b', fontSize: '0.9rem' }}>Building technology solutions for ecommerce operations</p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 24, marginBottom: 48 }}>
            <div style={card}>
              <div style={{ fontSize: '1.5rem', marginBottom: 12 }}>🏢</div>
              <h3 style={{ margin: '0 0 8px', fontSize: '1rem', fontWeight: 800 }}>Company Information</h3>
              <table style={{ fontSize: '0.84rem', color: '#475569', lineHeight: 2 }}>
                <tbody>
                  <tr><td style={{ fontWeight: 700, paddingRight: 16, whiteSpace: 'nowrap' }}>Legal Name</td><td>APPCASH CO., LTD</td></tr>
                  <tr><td style={{ fontWeight: 700, paddingRight: 16 }}>Full Name</td><td>APPCASH Electronic Commercial Technology Company Limited</td></tr>
                  <tr><td style={{ fontWeight: 700, paddingRight: 16 }}>Registration</td><td>0316883915</td></tr>
                  <tr><td style={{ fontWeight: 700, paddingRight: 16 }}>Founded</td><td>May 2021</td></tr>
                  <tr><td style={{ fontWeight: 700, paddingRight: 16 }}>Location</td><td>Ho Chi Minh City, Vietnam</td></tr>
                  <tr><td style={{ fontWeight: 700, paddingRight: 16 }}>Brand</td><td>Stella Kinetics</td></tr>
                </tbody>
              </table>
            </div>

            <div style={card}>
              <div style={{ fontSize: '1.5rem', marginBottom: 12 }}>🎯</div>
              <h3 style={{ margin: '0 0 8px', fontSize: '1rem', fontWeight: 800 }}>What We Do</h3>
              <ul style={{ fontSize: '0.84rem', color: '#475569', lineHeight: 2, paddingLeft: 18, margin: 0 }}>
                <li>Operate multiple TikTok Shop and Shopee stores in Vietnam</li>
                <li>Sell consumer electronics, beauty and lifestyle products</li>
                <li>Manage digital advertising campaigns across platforms</li>
                <li>Build internal tools for ecommerce analytics and operations</li>
                <li>KOC/KOL booking and influencer campaign management</li>
              </ul>
            </div>
          </div>

          {/* ── Platform Features ──────────────────────────────────────── */}
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <h2 style={{ fontSize: '1.4rem', fontWeight: 900, margin: '0 0 8px' }}>Platform Features</h2>
            <p style={{ color: '#64748b', fontSize: '0.85rem' }}>Our internal dashboard centralizes ecommerce operations</p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 20 }}>
            {[
              { icon: '📊', title: 'Dashboard Ecom', desc: 'Real-time GMV, orders, traffic and conversion analytics across all stores' },
              { icon: '📈', title: 'Ads Performance', desc: 'Monitor advertising spend, ROAS, CPC and campaign metrics' },
              { icon: '💬', title: 'Customer Service', desc: 'Unified chat inbox for customer support across platforms' },
              { icon: '🎬', title: 'Livestream Management', desc: 'Track livestream sessions, viewers and sales performance' },
              { icon: '📋', title: 'KOC Booking', desc: 'Manage KOC/KOL partnerships, orders and campaign tracking' },
              { icon: '💰', title: 'Financial Tracking', desc: 'Cost management, pricing tools and expense reporting' },
            ].map((f, i) => (
              <div key={i} style={{ ...card, textAlign: 'center', padding: '28px 20px' }}>
                <div style={{ fontSize: '2rem', marginBottom: 10 }}>{f.icon}</div>
                <h4 style={{ margin: '0 0 6px', fontSize: '0.9rem', fontWeight: 800 }}>{f.title}</h4>
                <p style={{ margin: 0, fontSize: '0.78rem', color: '#64748b', lineHeight: 1.5 }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Stores ──────────────────────────────────────────────────────── */}
      <div style={{ background: '#fff', padding: '56px 24px', borderTop: '1px solid #f1f5f9' }}>
        <div style={section}>
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <h2 style={{ fontSize: '1.4rem', fontWeight: 900, margin: '0 0 8px' }}>Our Ecommerce Stores</h2>
            <p style={{ color: '#64748b', fontSize: '0.85rem' }}>Operating across major platforms in Vietnam</p>
          </div>
          <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
            {['Bodymiss', 'Milaganics', 'Moaw Moaws', 'eHerb', 'Real Steel'].map(shop => (
              <div key={shop} style={{
                padding: '14px 28px', borderRadius: 12, background: '#f8fafc',
                border: '1px solid #e5e7eb', fontWeight: 700, fontSize: '0.88rem', color: '#374151',
              }}>{shop}</div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 24, justifyContent: 'center', marginTop: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.82rem', color: '#64748b' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#0f172a', display: 'inline-block' }} />
              TikTok Shop
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.82rem', color: '#64748b' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ea580c', display: 'inline-block' }} />
              Shopee
            </div>
          </div>
        </div>
      </div>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <footer style={{
        background: '#0f172a', color: '#94a3b8', padding: '40px 24px',
        textAlign: 'center', fontSize: '0.8rem', lineHeight: 1.8,
      }}>
        <div style={section}>
          <div style={{ fontWeight: 800, color: '#fff', fontSize: '1rem', marginBottom: 8 }}>APPCASH CO., LTD</div>
          <div>APPCASH Electronic Commercial Technology Company Limited</div>
          <div>Business Registration: 0316883915</div>
          <div style={{ marginTop: 8 }}>
            Viet My IPC Building, 01 Phan Van Truong, Cau Ong Lanh Ward, District 1, Ho Chi Minh City, Vietnam
          </div>
          <div style={{ marginTop: 16, color: '#475569', fontSize: '0.72rem' }}>
            &copy; 2021 - {new Date().getFullYear()} APPCASH CO., LTD. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
};

export default PublicLandingPage;
