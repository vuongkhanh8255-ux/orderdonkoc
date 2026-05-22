// src/components/PublicLandingPage.jsx
// Public landing page — orange/white theme with mock visuals

const PublicLandingPage = ({ onGoLogin }) => {
  const section = { maxWidth: 1140, margin: '0 auto', padding: '0 24px' };

  // ── Mock Dashboard SVG ─────────────────────────────────────────────
  const MockDashboard = () => (
    <div style={{
      background: '#fff', borderRadius: 16, padding: 0, overflow: 'hidden',
      boxShadow: '0 25px 60px rgba(234,88,12,0.15), 0 4px 20px rgba(0,0,0,0.08)',
      border: '1px solid rgba(234,88,12,0.1)', maxWidth: 800, margin: '0 auto',
      transform: 'perspective(1200px) rotateX(2deg)', transition: 'transform 0.3s',
    }}>
      {/* Title bar */}
      <div style={{ background: '#1e293b', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#ef4444' }} />
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#eab308' }} />
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#22c55e' }} />
        <div style={{ flex: 1, textAlign: 'center', fontSize: '0.7rem', color: '#64748b' }}>stellakinetics.space</div>
      </div>
      {/* Sidebar + Content */}
      <div style={{ display: 'flex', minHeight: 320 }}>
        {/* Sidebar */}
        <div style={{ width: 180, background: '#0f172a', padding: '16px 0', flexShrink: 0 }}>
          <div style={{ padding: '0 14px 16px', borderBottom: '1px solid #1e293b', marginBottom: 12 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg, #ea580c, #f97316)', margin: '0 auto 6px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '0.7rem', fontWeight: 900 }}>SK</div>
            <div style={{ textAlign: 'center', fontSize: '0.6rem', color: '#94a3b8', fontWeight: 700 }}>STELLA KINETICS</div>
          </div>
          {['Dashboard Ecom', 'Ads Analytics', 'CRM', 'CSKH', 'Livestream', 'Booking'].map((item, i) => (
            <div key={i} style={{
              padding: '7px 14px', fontSize: '0.65rem', color: i === 0 ? '#fff' : '#64748b',
              background: i === 0 ? 'rgba(234,88,12,0.2)' : 'transparent', fontWeight: i === 0 ? 700 : 500,
              borderLeft: i === 0 ? '3px solid #ea580c' : '3px solid transparent',
            }}>{item}</div>
          ))}
        </div>
        {/* Main */}
        <div style={{ flex: 1, padding: 16, background: '#f8fafc' }}>
          {/* Stat cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 12 }}>
            {[
              { label: 'GMV', value: '2.8 ty', color: '#ea580c', change: '+12.5%' },
              { label: 'Don hang', value: '1,284', color: '#3b82f6', change: '+8.2%' },
              { label: 'Traffic', value: '45.2K', color: '#8b5cf6', change: '+15.3%' },
              { label: 'CVR', value: '6.82%', color: '#16a34a', change: '+2.1%' },
            ].map((s, i) => (
              <div key={i} style={{ background: '#fff', borderRadius: 8, padding: '8px 10px', borderLeft: `3px solid ${s.color}` }}>
                <div style={{ fontSize: '0.5rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>{s.label}</div>
                <div style={{ fontSize: '0.85rem', fontWeight: 900, color: '#0f172a', margin: '2px 0' }}>{s.value}</div>
                <div style={{ fontSize: '0.5rem', color: '#16a34a', fontWeight: 700 }}>{s.change}</div>
              </div>
            ))}
          </div>
          {/* Chart mock */}
          <div style={{ background: '#fff', borderRadius: 8, padding: '10px 12px', marginBottom: 10 }}>
            <div style={{ fontSize: '0.6rem', fontWeight: 800, color: '#374151', marginBottom: 8 }}>Doanh so theo ngay</div>
            <svg viewBox="0 0 500 120" style={{ width: '100%', height: 100 }}>
              <defs>
                <linearGradient id="mockGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#ea580c" stopOpacity="0.3"/>
                  <stop offset="100%" stopColor="#ea580c" stopOpacity="0"/>
                </linearGradient>
              </defs>
              <path d="M0,90 Q30,85 60,70 T120,50 T180,60 T240,35 T300,45 T360,20 T420,30 T480,15 L500,15 L500,120 L0,120 Z" fill="url(#mockGrad)" />
              <path d="M0,90 Q30,85 60,70 T120,50 T180,60 T240,35 T300,45 T360,20 T420,30 T480,15" fill="none" stroke="#ea580c" strokeWidth="2.5" strokeLinecap="round" />
              {[{x:60,y:70},{x:120,y:50},{x:180,y:60},{x:240,y:35},{x:300,y:45},{x:360,y:20},{x:420,y:30},{x:480,y:15}].map((p,i) => (
                <circle key={i} cx={p.x} cy={p.y} r="3" fill="#ea580c" />
              ))}
            </svg>
          </div>
          {/* Table mock */}
          <div style={{ background: '#fff', borderRadius: 8, padding: '8px 10px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 0.8fr 0.8fr 0.8fr', gap: 4, fontSize: '0.5rem' }}>
              {['Shop', 'GMV', 'Don', 'CVR', 'AOV'].map(h => (
                <div key={h} style={{ fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', padding: '3px 0', borderBottom: '1px solid #f1f5f9' }}>{h}</div>
              ))}
              {[
                ['Bodymiss', '890M', '412', '7.2%', '215K'],
                ['Milaganics', '650M', '298', '6.5%', '198K'],
                ['Real Steel', '420M', '185', '5.8%', '310K'],
              ].map((row, i) => row.map((cell, j) => (
                <div key={`${i}-${j}`} style={{ padding: '3px 0', fontWeight: j === 0 ? 700 : 500, color: j === 1 ? '#ea580c' : '#475569', fontSize: '0.5rem' }}>{cell}</div>
              )))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  // ── Stats Counter ──────────────────────────────────────────────────
  const StatCounter = ({ value, label, suffix = '' }) => (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: '2.4rem', fontWeight: 900, color: '#ea580c', lineHeight: 1 }}>
        {value}<span style={{ fontSize: '1.4rem' }}>{suffix}</span>
      </div>
      <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600, marginTop: 6 }}>{label}</div>
    </div>
  );

  // ── Feature Icon (SVG circle with gradient) ────────────────────────
  const FeatureIcon = ({ children, color = '#ea580c' }) => (
    <div style={{
      width: 56, height: 56, borderRadius: 14,
      background: `linear-gradient(135deg, ${color}15, ${color}08)`,
      border: `1.5px solid ${color}20`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: '1.5rem', marginBottom: 14,
    }}>{children}</div>
  );

  return (
    <div style={{ fontFamily: "'Outfit', sans-serif", color: '#0f172a', background: '#fff', minHeight: '100vh' }}>

      {/* ── Navbar ──────────────────────────────────────────────────────── */}
      <nav style={{
        background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(234,88,12,0.1)', padding: '0 32px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 68,
        position: 'sticky', top: 0, zIndex: 100,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 12,
            background: 'linear-gradient(135deg, #ea580c, #f97316)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontWeight: 900, fontSize: '1.1rem',
            boxShadow: '0 4px 12px rgba(234,88,12,0.3)',
          }}>SK</div>
          <div>
            <div style={{ fontWeight: 900, fontSize: '1.05rem', lineHeight: 1.2, color: '#0f172a' }}>STELLA KINETICS</div>
            <div style={{ fontSize: '0.6rem', color: '#ea580c', fontWeight: 700, letterSpacing: '1px' }}>APPCASH CO., LTD</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <a href="#features" style={{ fontSize: '0.82rem', color: '#475569', fontWeight: 600, textDecoration: 'none' }}>Features</a>
          <a href="#about" style={{ fontSize: '0.82rem', color: '#475569', fontWeight: 600, textDecoration: 'none' }}>About</a>
          <a href="#stores" style={{ fontSize: '0.82rem', color: '#475569', fontWeight: 600, textDecoration: 'none' }}>Stores</a>
          <button onClick={onGoLogin} style={{
            padding: '9px 28px', borderRadius: 10, border: 'none',
            background: 'linear-gradient(135deg, #ea580c, #f97316)', color: '#fff',
            fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer', fontFamily: 'inherit',
            boxShadow: '0 4px 14px rgba(234,88,12,0.3)', transition: 'all 0.2s',
          }}>
            Login
          </button>
        </div>
      </nav>

      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <div style={{
        background: 'linear-gradient(180deg, #fff 0%, #fff7ed 50%, #fff 100%)',
        padding: '80px 24px 60px', position: 'relative', overflow: 'hidden',
      }}>
        {/* Background decorations */}
        <div style={{ position: 'absolute', top: -100, right: -100, width: 400, height: 400, borderRadius: '50%', background: 'radial-gradient(circle, rgba(234,88,12,0.06) 0%, transparent 70%)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: -50, left: -80, width: 300, height: 300, borderRadius: '50%', background: 'radial-gradient(circle, rgba(249,115,22,0.05) 0%, transparent 70%)', pointerEvents: 'none' }} />

        <div style={{ ...section, position: 'relative', zIndex: 1 }}>
          <div style={{ textAlign: 'center', marginBottom: 56 }}>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '6px 18px', borderRadius: 20, background: '#fff',
              border: '1px solid rgba(234,88,12,0.15)', marginBottom: 24,
              boxShadow: '0 2px 8px rgba(234,88,12,0.06)',
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#ea580c', animation: 'pulse 2s infinite' }} />
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#ea580c', letterSpacing: '0.5px' }}>ECOMMERCE MANAGEMENT PLATFORM</span>
            </div>

            <h1 style={{ fontSize: '3.2rem', fontWeight: 900, margin: '0 0 18px', lineHeight: 1.15, color: '#0f172a' }}>
              Manage Your Ecommerce<br/>
              <span style={{ background: 'linear-gradient(135deg, #ea580c, #f97316)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                All In One Place
              </span>
            </h1>
            <p style={{ fontSize: '1.1rem', color: '#64748b', maxWidth: 580, margin: '0 auto 36px', lineHeight: 1.7 }}>
              Unified analytics dashboard for multi-channel ecommerce operations.
              Track sales, ads, traffic and customer service across TikTok Shop & Shopee.
            </p>
            <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button onClick={onGoLogin} style={{
                padding: '14px 36px', borderRadius: 12, border: 'none',
                background: 'linear-gradient(135deg, #ea580c, #f97316)', color: '#fff',
                fontWeight: 800, fontSize: '0.92rem', cursor: 'pointer', fontFamily: 'inherit',
                boxShadow: '0 8px 24px rgba(234,88,12,0.3)', transition: 'all 0.2s',
              }}>
                Get Started
              </button>
              <a href="#features" style={{
                padding: '14px 36px', borderRadius: 12, border: '2px solid #ea580c',
                background: '#fff', color: '#ea580c', fontWeight: 800, fontSize: '0.92rem',
                textDecoration: 'none', display: 'inline-block', fontFamily: 'inherit',
              }}>
                Explore Features
              </a>
            </div>
          </div>

          {/* ── Mock Dashboard ──────────────────────────────────────────── */}
          <MockDashboard />
        </div>
      </div>

      {/* ── Stats Bar ──────────────────────────────────────────────────── */}
      <div style={{
        background: '#fff', padding: '48px 24px', borderTop: '1px solid #f1f5f9', borderBottom: '1px solid #f1f5f9',
      }}>
        <div style={{ ...section, display: 'flex', justifyContent: 'space-around', flexWrap: 'wrap', gap: 32 }}>
          <StatCounter value="5" suffix="+" label="Ecommerce Stores" />
          <StatCounter value="50" suffix="B" label="Annual Revenue (VND)" />
          <StatCounter value="2" label="Sales Platforms" />
          <StatCounter value="24/7" label="Real-time Monitoring" />
        </div>
      </div>

      {/* ── Features ───────────────────────────────────────────────────── */}
      <div id="features" style={{ padding: '80px 24px', background: '#fff' }}>
        <div style={section}>
          <div style={{ textAlign: 'center', marginBottom: 56 }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#ea580c', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: 8 }}>PLATFORM FEATURES</div>
            <h2 style={{ fontSize: '2rem', fontWeight: 900, margin: '0 0 10px' }}>Everything You Need to Scale</h2>
            <p style={{ color: '#64748b', fontSize: '0.92rem', maxWidth: 500, margin: '0 auto' }}>Our internal dashboard centralizes all ecommerce operations into one powerful platform</p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 24 }}>
            {[
              { icon: '📊', title: 'Dashboard Ecom', desc: 'Real-time GMV, orders, traffic and conversion rate analytics across all stores with daily trend charts and shop comparison.', color: '#ea580c' },
              { icon: '📈', title: 'Ads Performance', desc: 'Monitor advertising spend, ROAS, CPC, impressions and campaign performance across TikTok Ads and Shopee Ads.', color: '#f97316' },
              { icon: '💬', title: 'Customer Service Hub', desc: 'Unified chat inbox combining messages from all shops. Manage customer inquiries, reviews and after-sales support.', color: '#0891b2' },
              { icon: '🎬', title: 'Livestream Analytics', desc: 'Track livestream sessions, viewer count, engagement rate and live sales performance in real-time.', color: '#8b5cf6' },
              { icon: '📋', title: 'KOC/KOL Booking', desc: 'Manage influencer partnerships, track KOC orders, commission rates and campaign ROI from one place.', color: '#16a34a' },
              { icon: '💰', title: 'Financial Management', desc: 'Cost tracking, product costing, pricing management and expense reporting with profit margin analysis.', color: '#d97706' },
            ].map((f, i) => (
              <div key={i} style={{
                background: '#fff', borderRadius: 20, padding: '32px 28px',
                border: '1px solid #f1f5f9', transition: 'all 0.3s',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
              }}>
                <FeatureIcon color={f.color}>{f.icon}</FeatureIcon>
                <h4 style={{ margin: '0 0 8px', fontSize: '1.05rem', fontWeight: 800 }}>{f.title}</h4>
                <p style={{ margin: 0, fontSize: '0.82rem', color: '#64748b', lineHeight: 1.6 }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── How It Works ───────────────────────────────────────────────── */}
      <div style={{ padding: '80px 24px', background: 'linear-gradient(180deg, #fff7ed 0%, #fff 100%)' }}>
        <div style={section}>
          <div style={{ textAlign: 'center', marginBottom: 56 }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#ea580c', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: 8 }}>HOW IT WORKS</div>
            <h2 style={{ fontSize: '2rem', fontWeight: 900, margin: 0 }}>Seamless Data Integration</h2>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 32 }}>
            {[
              { step: '01', title: 'Connect Stores', desc: 'Link your TikTok Shop and Shopee stores via secure OAuth API integration', icon: '🔗' },
              { step: '02', title: 'Sync Data', desc: 'Automated daily sync pulls sales, orders, traffic and ad metrics from all platforms', icon: '🔄' },
              { step: '03', title: 'Analyze', desc: 'View unified dashboard with real-time charts, comparisons and trend analysis', icon: '📊' },
              { step: '04', title: 'Optimize', desc: 'Make data-driven decisions to boost revenue, reduce costs and scale operations', icon: '🚀' },
            ].map((s, i) => (
              <div key={i} style={{ textAlign: 'center', position: 'relative' }}>
                <div style={{
                  width: 72, height: 72, borderRadius: '50%', margin: '0 auto 16px',
                  background: 'linear-gradient(135deg, #ea580c, #f97316)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '1.8rem', boxShadow: '0 8px 24px rgba(234,88,12,0.25)',
                }}>{s.icon}</div>
                <div style={{ fontSize: '0.7rem', fontWeight: 900, color: '#ea580c', letterSpacing: '1px', marginBottom: 6 }}>STEP {s.step}</div>
                <h4 style={{ margin: '0 0 6px', fontSize: '1rem', fontWeight: 800 }}>{s.title}</h4>
                <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b', lineHeight: 1.5 }}>{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── About Company ──────────────────────────────────────────────── */}
      <div id="about" style={{ padding: '80px 24px', background: '#fff' }}>
        <div style={section}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: 48, alignItems: 'center' }}>
            {/* Info */}
            <div>
              <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#ea580c', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: 8 }}>ABOUT US</div>
              <h2 style={{ fontSize: '1.8rem', fontWeight: 900, margin: '0 0 16px' }}>APPCASH CO., LTD</h2>
              <p style={{ fontSize: '0.88rem', color: '#64748b', lineHeight: 1.8, marginBottom: 24 }}>
                APPCASH Electronic Commercial Technology Company Limited is a Vietnamese ecommerce company
                headquartered in Ho Chi Minh City. We operate multiple online stores across major platforms
                including TikTok Shop and Shopee, selling consumer electronics, beauty and lifestyle products
                under the brand Stella Kinetics.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                {[
                  { label: 'Registration', value: '0316883915' },
                  { label: 'Founded', value: 'May 2021' },
                  { label: 'Headquarters', value: 'HCM City, Vietnam' },
                  { label: 'Brand', value: 'Stella Kinetics' },
                ].map((item, i) => (
                  <div key={i} style={{ padding: '12px 16px', background: '#fff7ed', borderRadius: 10, border: '1px solid rgba(234,88,12,0.1)' }}>
                    <div style={{ fontSize: '0.65rem', fontWeight: 700, color: '#ea580c', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{item.label}</div>
                    <div style={{ fontSize: '0.88rem', fontWeight: 800, color: '#0f172a', marginTop: 2 }}>{item.value}</div>
                  </div>
                ))}
              </div>
            </div>
            {/* Visual */}
            <div style={{
              background: 'linear-gradient(135deg, #ea580c, #f97316)', borderRadius: 24, padding: 40,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              color: '#fff', minHeight: 380, position: 'relative', overflow: 'hidden',
            }}>
              <div style={{ position: 'absolute', top: -40, right: -40, width: 200, height: 200, borderRadius: '50%', background: 'rgba(255,255,255,0.1)' }} />
              <div style={{ position: 'absolute', bottom: -60, left: -30, width: 250, height: 250, borderRadius: '50%', background: 'rgba(255,255,255,0.05)' }} />
              <div style={{ position: 'relative', zIndex: 1, textAlign: 'center' }}>
                <div style={{ fontSize: '4rem', marginBottom: 16 }}>🏢</div>
                <div style={{ fontSize: '1.6rem', fontWeight: 900, marginBottom: 8 }}>APPCASH</div>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, opacity: 0.9, marginBottom: 24 }}>Electronic Commercial Technology</div>
                <div style={{ display: 'flex', gap: 24, justifyContent: 'center' }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '1.8rem', fontWeight: 900 }}>5+</div>
                    <div style={{ fontSize: '0.7rem', opacity: 0.8 }}>Stores</div>
                  </div>
                  <div style={{ width: 1, background: 'rgba(255,255,255,0.3)' }} />
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '1.8rem', fontWeight: 900 }}>2</div>
                    <div style={{ fontSize: '0.7rem', opacity: 0.8 }}>Platforms</div>
                  </div>
                  <div style={{ width: 1, background: 'rgba(255,255,255,0.3)' }} />
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '1.8rem', fontWeight: 900 }}>50B+</div>
                    <div style={{ fontSize: '0.7rem', opacity: 0.8 }}>VND/Year</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Stores ──────────────────────────────────────────────────────── */}
      <div id="stores" style={{ padding: '80px 24px', background: '#fafafa' }}>
        <div style={section}>
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#ea580c', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: 8 }}>OUR STORES</div>
            <h2 style={{ fontSize: '2rem', fontWeight: 900, margin: '0 0 10px' }}>Multi-Platform Presence</h2>
            <p style={{ color: '#64748b', fontSize: '0.88rem' }}>Operating across major ecommerce platforms in Vietnam</p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 20, maxWidth: 800, margin: '0 auto' }}>
            {[
              { name: 'Bodymiss', cat: 'Beauty & Skincare', platforms: ['TikTok', 'Shopee'] },
              { name: 'Milaganics', cat: 'Natural Beauty', platforms: ['TikTok', 'Shopee'] },
              { name: 'Moaw Moaws', cat: 'Lifestyle', platforms: ['TikTok'] },
              { name: 'eHerb', cat: 'Health & Wellness', platforms: ['TikTok', 'Shopee'] },
              { name: 'Real Steel', cat: 'Electronics', platforms: ['TikTok'] },
            ].map((shop, i) => (
              <div key={i} style={{
                background: '#fff', borderRadius: 16, padding: '24px 20px', textAlign: 'center',
                border: '1px solid #f1f5f9', boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                transition: 'all 0.2s',
              }}>
                <div style={{
                  width: 48, height: 48, borderRadius: 12, margin: '0 auto 12px',
                  background: `linear-gradient(135deg, ${['#ea580c','#f97316','#fb923c','#0891b2','#3b82f6'][i]}, ${['#f97316','#fb923c','#fdba74','#06b6d4','#60a5fa'][i]})`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#fff', fontSize: '1.2rem', fontWeight: 900,
                }}>{shop.name[0]}</div>
                <div style={{ fontWeight: 800, fontSize: '0.92rem', marginBottom: 2 }}>{shop.name}</div>
                <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginBottom: 10 }}>{shop.cat}</div>
                <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                  {shop.platforms.map(p => (
                    <span key={p} style={{
                      padding: '2px 8px', borderRadius: 4, fontSize: '0.6rem', fontWeight: 700,
                      background: p === 'TikTok' ? '#0f172a' : '#ea580c', color: '#fff',
                    }}>{p}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── CTA ─────────────────────────────────────────────────────────── */}
      <div style={{
        padding: '80px 24px', textAlign: 'center',
        background: 'linear-gradient(135deg, #ea580c, #f97316)', color: '#fff',
      }}>
        <div style={section}>
          <h2 style={{ fontSize: '2.2rem', fontWeight: 900, margin: '0 0 12px' }}>Ready to Take Control?</h2>
          <p style={{ fontSize: '1rem', opacity: 0.9, maxWidth: 500, margin: '0 auto 32px', lineHeight: 1.6 }}>
            Log in to access your ecommerce dashboard and start optimizing your operations today.
          </p>
          <button onClick={onGoLogin} style={{
            padding: '16px 48px', borderRadius: 14, border: '2px solid #fff',
            background: '#fff', color: '#ea580c', fontWeight: 900, fontSize: '1rem',
            cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
            transition: 'all 0.2s',
          }}>
            Login to Dashboard
          </button>
        </div>
      </div>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <footer style={{
        background: '#0f172a', color: '#94a3b8', padding: '48px 24px 32px',
        fontSize: '0.8rem',
      }}>
        <div style={{ ...section, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 32, marginBottom: 32 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg, #ea580c, #f97316)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 900, fontSize: '0.9rem',
              }}>SK</div>
              <div style={{ fontWeight: 800, color: '#fff', fontSize: '0.9rem' }}>STELLA KINETICS</div>
            </div>
            <p style={{ lineHeight: 1.7, fontSize: '0.78rem' }}>
              Internal ecommerce management platform by APPCASH CO., LTD.
              Streamlining multi-channel operations in Vietnam.
            </p>
          </div>
          <div>
            <div style={{ fontWeight: 800, color: '#fff', marginBottom: 12, fontSize: '0.82rem' }}>Company</div>
            <div style={{ lineHeight: 2.2, fontSize: '0.78rem' }}>
              <div>APPCASH CO., LTD</div>
              <div>Reg: 0316883915</div>
              <div>Founded: May 2021</div>
            </div>
          </div>
          <div>
            <div style={{ fontWeight: 800, color: '#fff', marginBottom: 12, fontSize: '0.82rem' }}>Address</div>
            <div style={{ lineHeight: 1.7, fontSize: '0.78rem' }}>
              Viet My IPC Building<br/>
              01 Phan Van Truong, Cau Ong Lanh Ward<br/>
              District 1, Ho Chi Minh City<br/>
              Vietnam
            </div>
          </div>
          <div>
            <div style={{ fontWeight: 800, color: '#fff', marginBottom: 12, fontSize: '0.82rem' }}>Contact</div>
            <div style={{ lineHeight: 2.2, fontSize: '0.78rem' }}>
              <div>ads@stellakinetics.space</div>
              <div>stellakinetics.space</div>
            </div>
          </div>
        </div>
        <div style={{ borderTop: '1px solid #1e293b', paddingTop: 20, textAlign: 'center', fontSize: '0.72rem', color: '#475569' }}>
          &copy; 2021 - {new Date().getFullYear()} APPCASH CO., LTD. All rights reserved.
        </div>
      </footer>
    </div>
  );
};

export default PublicLandingPage;
