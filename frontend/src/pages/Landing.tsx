import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './Landing.css';

const STATS = [
  { icon: '👥', value: '12.0K+', label: 'Patients monitored' },
  { icon: '📊', value: '98.6%', label: 'Prediction accuracy' },
  { icon: '⏱', value: '2.5 hrs', label: 'Earlier detection' },
  { icon: '🛡', value: '24/7', label: 'Continuous monitoring' },
];

const MODULES = [
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#0A7C6A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
      </svg>
    ),
    title: 'Triage Dashboard',
    desc: 'Live intervention windows for every deteriorating patient, ranked by seconds that matter. Cohort telemetry streams in real time.',
    link: 'Open dashboard →',
  },
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
    ),
    title: 'Alert Center',
    desc: 'Critical flags triaged before therapeutic windows close — sepsis, AKI, respiratory decline — each one routed to the right clinician.',
    link: 'Open alert center →',
  },
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#0A7C6A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3" /><circle cx="12" cy="5" r="1.5" /><circle cx="18.5" cy="8.5" r="1.5" /><circle cx="18.5" cy="15.5" r="1.5" /><circle cx="12" cy="19" r="1.5" /><circle cx="5.5" cy="15.5" r="1.5" /><circle cx="5.5" cy="8.5" r="1.5" />
        <line x1="12" y1="6.5" x2="12" y2="9" /><line x1="17.2" y1="9.2" x2="14.6" y2="10.8" /><line x1="17.2" y1="14.8" x2="14.6" y2="13.2" /><line x1="12" y1="17.5" x2="12" y2="15" /><line x1="6.8" y1="14.8" x2="9.4" y2="13.2" /><line x1="6.8" y1="9.2" x2="9.4" y2="10.8" />
      </svg>
    ),
    title: 'Medical Ontology Graph',
    desc: 'Conditions, mechanisms and interventions as one explorable knowledge graph — see why the model raised a score, node by node.',
    link: 'Explore the graph →',
  },
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#0A7C6A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2a3 3 0 0 0-3 3v1a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" /><path d="M19 10H5a2 2 0 0 0-2 2v2a10 10 0 0 0 20 0v-2a2 2 0 0 0-2-2z" /><path d="M12 14v4" /><path d="M8 14v2" /><path d="M16 14v2" />
      </svg>
    ),
    title: 'Imaging Intelligence',
    desc: 'Longitudinal volumetric MRI comparison with progression forecasting — neurodegeneration tracked visit over visit.',
    link: 'Open workstation →',
  },
];

const STEPS = [
  {
    num: '01',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 18l2-2v-8l-2-2" /><path d="M8 18l-2-2V8l2-2" /></svg>
    ),
    title: 'Connect',
    desc: 'HL7 / FHIR feeds ingest vitals, labs, meds and notes from existing monitors, EHRs and LIS — streaming within minutes.',
  },
  {
    num: '02',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 17 9 11 13 15 21 7" /><polyline points="14 7 21 7 21 14" /></svg>
    ),
    title: 'Predict',
    desc: 'Risk engines score sepsis, cardiac, renal and respiratory trajectories continuously — with SHAP-grade explanations attached to every number.',
  },
  {
    num: '03',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="2" /><path d="M12 2v4" /><path d="M12 18v4" /><path d="M4.93 4.93l2.83 2.83" /><path d="M16.24 16.24l2.83 2.83" /><path d="M2 12h4" /><path d="M18 12h4" /><path d="M4.93 19.07l2.83-2.83" /><path d="M16.24 7.76l2.83-2.83" /></svg>
    ),
    title: 'Act',
    desc: 'Every prediction becomes an intervention window with a countdown, an owner and one-click escalation to the on-call specialist.',
  },
];

const SECURITY = [
  {
    icon: '',
    title: 'Encrypted end-to-end',
    desc: 'TLS 1.3 in transit, AES-256 at rest. PHI never leaves the hospital network in on-prem mode.',
  },
  {
    icon: '',
    title: 'Immutable audit logs',
    desc: 'Who saw what, who acknowledged which alert, which model version made which prediction — forever queryable.',
  },
  {
    icon: '',
    title: 'Explainable by default',
    desc: 'Feature-level attribution ships with every risk score, so clinicians can challenge the model — not obey it.',
  },
  {
    icon: '',
    title: 'Deploy anywhere',
    desc: 'Runs on hospital-owned Kubernetes or air-gapped appliances. Cloud is optional, never required.',
  },
];

const FAQS = [
  {
    q: 'Does this replace clinical judgement?',
    a: 'No. MedIQ is a decision-support tool that surfaces risk signals earlier. Every prediction is paired with SHAP explanations so clinicians retain full autonomy.',
  },
  {
    q: 'How does it connect to our existing EHR?',
    a: 'MedIQ ingests data via HL7 v2, FHIR R4, or direct database connectors. No rip-and-replace — it sits alongside your existing infrastructure.',
  },
  {
    q: 'What happens when the model is wrong?',
    a: 'Every alert includes confidence intervals and feature attribution. Clinicians can dismiss, acknowledge, or escalate — all actions are audit-logged for continuous model improvement.',
  },
  {
    q: 'Is real patient data used in this demo?',
    a: 'No. This demo uses synthetic data generated from PhysioNet\'s open-source sepsis challenge dataset. No PHI is present.',
  },
];

const COMPLIANCE_BADGES = [
  'HL7 / FHIR NATIVE',
  'HIPAA-READY ARCHITECTURE',
  'ISO 27001 ALIGNED',
  'ON-PREM DEPLOYMENT',
  'FULL AUDIT TRAILS',
];

export default function Landing() {
  const navigate = useNavigate();
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <div className="landing">
      {/* ─── Navbar ─── */}
      <nav className="landing-nav">
        <div className="landing-nav-inner">
          <div className="landing-brand" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            <img src="/logo-icon.svg" alt="MedIQ" className="landing-brand-icon" />
            <div>
              <span className="landing-brand-name">MedIQ</span>
              <span className="landing-brand-sub">MEDICAL TECHNOLOGY</span>
            </div>
          </div>
          <div className="landing-nav-links">
            <a href="#modules">Platform</a>
            <a href="#how-it-works">How it works</a>
            <a href="#security">Security</a>
            <a href="#faq">FAQ</a>
          </div>
          <button className="landing-cta-btn" onClick={() => navigate('/login')}>
            Launch Console →
          </button>
        </div>
      </nav>

      {/* ─── Hero ─── */}
      <section className="landing-hero">
        <video className="landing-hero-video" autoPlay loop muted playsInline>
          <source src="/hero-video.mp4" type="video/mp4" />
        </video>
        <div className="landing-hero-overlay" />
        <div className="landing-hero-content">
          <div className="landing-hero-badge">
            <img src="/logo-icon.svg" alt="" style={{ width: 20, height: 20, filter: 'brightness(10)' }} />
            MEDIQ MEDICAL TECHNOLOGY · LIVE DEMO INSIDE
          </div>
          <h1>
            Clinical intelligence<br />
            <span className="text-accent">that saves lives.</span>
          </h1>
          <p className="landing-hero-subtitle">
            MedIQ connects real-time patient data, AI risk predictions
            and clinical workflows — so care teams act hours earlier, not
            minutes too late.
          </p>
          <div className="landing-hero-actions">
            <button className="landing-cta-btn-lg" onClick={() => navigate('/login')}>
              Explore the live console →
            </button>
            <button className="landing-ghost-btn" onClick={() => {
              document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' });
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polygon points="10 8 16 12 10 16 10 8" /></svg>
              See how it works
            </button>
          </div>
        </div>
      </section>

      {/* ─── Stats bar ─── */}
      <section className="landing-stats">
        {STATS.map((s) => (
          <div key={s.label} className="landing-stat">
            <span className="landing-stat-value">{s.value}</span>
            <span className="landing-stat-label">{s.label}</span>
          </div>
        ))}
      </section>

      {/* ─── Compliance badges ─── */}
      <section className="landing-badges">
        {COMPLIANCE_BADGES.map((b, i) => (
          <span key={b}>
            {b}
            {i < COMPLIANCE_BADGES.length - 1 && <span className="badge-dot">·</span>}
          </span>
        ))}
      </section>

      {/* ─── Modules ─── */}
      <section className="landing-section" id="modules">
        <span className="landing-section-label">ONE PLATFORM · FOUR INTELLIGENCE MODULES</span>
        <h2 className="landing-section-heading">
          Every module points at the<br />same thing — <span className="text-accent">time to act.</span>
        </h2>
        <p className="landing-section-desc">
          Each card below links straight into a live module of the demo console. No
          mock screenshots — click through and use the real product.
        </p>
        <div className="landing-modules-grid">
          {MODULES.map((m) => (
            <div key={m.title} className="landing-module-card" onClick={() => navigate('/login')}>
              <div className="module-icon">{m.icon}</div>
              <h3>{m.title}</h3>
              <p>{m.desc}</p>
              <span className="module-link">{m.link}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ─── How it works ─── */}
      <section className="landing-section landing-how" id="how-it-works">
        <span className="landing-section-label">HOW IT WORKS</span>
        <h2 className="landing-section-heading">
          From hospital signals to saved<br />hours
        </h2>
        <p className="landing-section-desc">
          MedIQ sits inside your existing systems — no rip-and-replace, no new
          hardware at the bedside.
        </p>
        <div className="landing-steps-grid">
          {STEPS.map((s) => (
            <div key={s.num} className="landing-step-card">
              <span className="step-num">{s.num}</span>
              <div className="step-icon">{s.icon}</div>
              <h3>{s.title}</h3>
              <p>{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ─── Security ─── */}
      <section className="landing-section" id="security">
        <div className="landing-security-layout">
          <div className="landing-security-text">
            <span className="landing-section-label">SECURITY & GOVERNANCE</span>
            <h2 className="landing-section-heading">
              Built for hospitals,<br />not just demos
            </h2>
            <p className="landing-section-desc">
              Clinical AI is only useful if governance teams sign off.
              MedIQ was designed around the questions every hospital IT and ethics board will ask.
            </p>
            <button className="landing-cta-btn-outline" onClick={() => navigate('/login')}>
              Inspect the audit trail ✓
            </button>
          </div>
          <div className="landing-security-grid">
            {SECURITY.map((s) => (
              <div key={s.title} className="landing-security-card">
                <span className="security-icon">{s.icon}</span>
                <h4>{s.title}</h4>
                <p>{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Testimonial ─── */}
      <section className="landing-testimonial">
        <div className="landing-testimonial-inner">
          <div className="testimonial-quote">
            <p>
              "The sepsis window opened <span className="text-accent">six
                hours before</span> the lab would have flagged her. That's the difference
              between a routine night and a code blue."
            </p>
            <div className="testimonial-author">
              <div className="testimonial-avatar">SV</div>
              <div>
                <strong>Dr. S. Vance</strong>
                <span>Intensivist · Pilot ICU deployment</span>
              </div>
            </div>
          </div>
          <div className="testimonial-metrics">
            <div className="metric-card">
              <span className="metric-value">31%</span>
              <span className="metric-label">reduction in sepsis mortality in retrospective validation*</span>
            </div>
            <div className="metric-card">
              <span className="metric-value">4.2 min</span>
              <span className="metric-label">median acknowledgement time for critical alerts</span>
            </div>
            <div className="metric-note">
              *Retrospective cohort simulation on synthetic ICU data — pilot results, pending prospective trial.
            </div>
          </div>
        </div>
      </section>

      {/* ─── FAQ ─── */}
      <section className="landing-section" id="faq">
        <span className="landing-section-label">FAQ</span>
        <h2 className="landing-section-heading">Questions clinical teams ask us</h2>
        <div className="landing-faq-list">
          {FAQS.map((f, i) => (
            <div key={i} className={`faq-item ${openFaq === i ? 'open' : ''}`}>
              <button className="faq-question" onClick={() => setOpenFaq(openFaq === i ? null : i)}>
                {f.q}
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points={openFaq === i ? '18 15 12 9 6 15' : '6 9 12 15 18 9'} />
                </svg>
              </button>
              {openFaq === i && <div className="faq-answer">{f.a}</div>}
            </div>
          ))}
        </div>
      </section>

      {/* ─── CTA footer ─── */}
      <section className="landing-cta-footer">
        <h2>Step into the intervention<br />window.</h2>
        <p>
          The full console is one click away — no install, no account. Walk the exact
          screens clinicians use on shift.
        </p>
        <div className="landing-cta-footer-actions">
          <button className="landing-cta-btn-lg" onClick={() => navigate('/login')}>
            Launch the console →
          </button>
          <button className="landing-ghost-btn-dark" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            Request a guided demo
          </button>
        </div>
      </section>

      {/* ─── Footer ─── */}
      <footer className="landing-footer">
        <div className="landing-footer-inner">
          <div className="landing-brand" style={{ opacity: 0.7 }}>
            <img src="/logo-icon.svg" alt="MedIQ" className="landing-brand-icon" style={{ filter: 'brightness(10)' }} />
            <div>
              <span className="landing-brand-name" style={{ color: '#fff' }}>MedIQ</span>
              <span className="landing-brand-sub" style={{ color: '#94A3B8' }}>MEDICAL TECHNOLOGY</span>
            </div>
          </div>
          <span style={{ color: '#64748B', fontSize: 13 }}>
            © {new Date().getFullYear()} MedIQ Medical Technology. All rights reserved.
          </span>
        </div>
      </footer>
    </div>
  );
}
