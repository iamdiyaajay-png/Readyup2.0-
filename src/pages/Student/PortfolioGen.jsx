import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../firebase';
import { doc, updateDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { ArrowRight, ArrowLeft, FileDown, Sparkles, Save, ExternalLink } from 'lucide-react';

export default function PortfolioGen() {
  const { user } = useAuth();
  const printRef = useRef(null);

  const [step, setStep] = useState(1);
  const [title, setTitle] = useState('');
  const [bio, setBio] = useState('');
  const [phone, setPhone] = useState('');
  const [location, setLocation] = useState('');
  const [projects, setProjects] = useState([]);
  const [approvedCerts, setApprovedCerts] = useState([]);
  const [saving, setSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(false);

  // Pre-fill from user profile
  useEffect(() => {
    if (user) {
      if (user.portfolioTitle) setTitle(user.portfolioTitle);
      else if (user.branch) setTitle(`${user.branch} Engineer`);
      if (user.portfolioBio) setBio(user.portfolioBio);
      if (user.portfolioPhone) setPhone(user.portfolioPhone);
      if (user.portfolioLocation) setLocation(user.portfolioLocation);
    }
  }, [user]);

  // Fetch submitted projects
  useEffect(() => {
    if (!user?.uid) return;
    const fetchProjects = async () => {
      try {
        const q = query(collection(db, 'projects'), where('studentId', '==', user.uid));
        const snap = await getDocs(q);
        const list = [];
        snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
        setProjects(list);
      } catch (err) {
        console.error('Error fetching projects:', err);
      }
    };
    fetchProjects();
  }, [user?.uid]);

  // Fetch ONLY mentor-approved certificates
  useEffect(() => {
    if (!user?.uid) return;
    const fetchCerts = async () => {
      try {
        const q = query(
          collection(db, 'certPending'),
          where('studentId', '==', user.uid),
          where('status', '==', 'approved')
        );
        const snap = await getDocs(q);
        const list = [];
        snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
        setApprovedCerts(list);
      } catch (err) {
        console.error('Error fetching approved certs:', err);
      }
    };
    fetchCerts();
  }, [user?.uid]);

  const handleSave = async () => {
    if (!user?.uid) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        portfolioTitle: title.trim(),
        portfolioBio: bio.trim(),
        portfolioPhone: phone.trim(),
        portfolioLocation: location.trim(),
        lastActivity: new Date().toISOString(),
      });
      setSavedOk(true);
      setTimeout(() => setSavedOk(false), 2500);
    } catch (err) {
      console.error('Save failed:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleNext = async () => {
    if (step === 2) await handleSave();
    setStep((prev) => Math.min(prev + 1, 3));
  };
  const handlePrev = () => setStep((prev) => Math.max(prev - 1, 1));

  // PDF via browser print — a hidden print-only div is rendered and window.print() is called
  const handleDownloadPDF = () => {
    window.print();
  };

  // Only show mentor-approved skills (stored in user.approvedSkills by mentor)
  const approvedSkills = Array.isArray(user?.approvedSkills)
    ? user.approvedSkills
    : [];
  const displayName = user?.name || 'Your Name';
  const displayEmail = user?.email || '';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Portfolio Generator</h1>
        <p className="text-sm text-brand-text-secondary mt-1">
          Build your placement portfolio and export it as a <strong className="text-brand-accent">PDF</strong> to share with recruiters.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Wizard Form */}
        <div className="glass-card p-8 rounded-3xl lg:col-span-2 space-y-6">
          {/* Steps */}
          <div className="flex items-center justify-between border-b border-brand-border/60 pb-6">
            {[1, 2, 3].map((s) => (
              <div key={s} className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                  step >= s ? 'bg-brand-accent text-brand-bg' : 'bg-brand-bg border border-brand-border text-brand-text-secondary'
                }`}>
                  {s}
                </div>
                <span className={`text-xs font-semibold hidden sm:inline ${step === s ? 'text-brand-text-primary' : 'text-brand-text-muted'}`}>
                  {s === 1 ? 'Bio & Contacts' : s === 2 ? 'Skills & Title' : 'Download PDF'}
                </span>
                {s < 3 && <div className="w-8 sm:w-16 h-[1px] bg-brand-border mx-2" />}
              </div>
            ))}
          </div>

          {/* Form Content */}
          <div className="min-h-56">
            {step === 1 && (
              <div className="space-y-4">
                <h3 className="text-base font-bold text-brand-text-primary">Personal Summary</h3>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-brand-text-secondary uppercase">Professional Bio</label>
                  <textarea
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    className="w-full px-4 py-2.5 bg-brand-bg/50 border border-brand-border rounded-xl text-sm focus:outline-none focus:border-brand-accent transition-colors h-24 text-brand-text-primary"
                    placeholder="Describe your goals and developer background..."
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-brand-text-secondary uppercase">Phone Number</label>
                    <input type="text" value={phone} onChange={(e) => setPhone(e.target.value)}
                      className="w-full px-4 py-2.5 bg-brand-bg/50 border border-brand-border rounded-xl text-sm focus:outline-none focus:border-brand-accent transition-colors text-brand-text-primary"
                      placeholder="+91 98xxx xxxxx"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-brand-text-secondary uppercase">Location / City</label>
                    <input type="text" value={location} onChange={(e) => setLocation(e.target.value)}
                      className="w-full px-4 py-2.5 bg-brand-bg/50 border border-brand-border rounded-xl text-sm focus:outline-none focus:border-brand-accent transition-colors text-brand-text-primary"
                      placeholder="e.g. Mumbai, India"
                    />
                  </div>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4">
                <h3 className="text-base font-bold text-brand-text-primary">Skills &amp; Highlights</h3>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-brand-text-secondary uppercase">Professional Title</label>
                  <input type="text" value={title} onChange={(e) => setTitle(e.target.value)}
                    className="w-full px-4 py-2.5 bg-brand-bg/50 border border-brand-border rounded-xl text-sm focus:outline-none focus:border-brand-accent transition-colors text-brand-text-primary"
                    placeholder="e.g. Junior Frontend Developer"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-brand-text-secondary uppercase">Skills (comma separated)</label>
                  <input type="text" value={skills} onChange={(e) => setSkills(e.target.value)}
                    className="w-full px-4 py-2.5 bg-brand-bg/50 border border-brand-border rounded-xl text-sm focus:outline-none focus:border-brand-accent transition-colors text-brand-text-primary"
                    placeholder="React, Node.js, Python, Git"
                  />
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-6 flex flex-col items-center justify-center text-center py-6">
                <div className="w-12 h-12 rounded-2xl bg-brand-accent-light border border-brand-accent/20 flex items-center justify-center text-brand-accent mb-2 animate-bounce">
                  <Sparkles size={24} />
                </div>
                <div className="space-y-2">
                  <h3 className="text-lg font-bold text-brand-text-primary">Your Portfolio is Ready!</h3>
                  <p className="text-sm text-brand-text-secondary max-w-sm">
                    Click <strong>Download as PDF</strong> to save or print your portfolio. In the print dialog, choose <em>"Save as PDF"</em>.
                  </p>
                </div>
                <button
                  onClick={handleDownloadPDF}
                  className="flex items-center gap-2 px-6 py-3 rounded-xl bg-brand-accent text-brand-bg font-bold text-sm hover:bg-brand-accent-hover transition-all shadow-lg shadow-brand-accent/20 cursor-pointer"
                >
                  <FileDown size={18} />
                  Download as PDF
                </button>
                {user?.linkedIn && (
                  <a href={user.linkedIn} target="_blank" rel="noreferrer"
                    className="flex items-center gap-1.5 text-xs text-indigo-400 hover:underline font-semibold">
                    <ExternalLink size={13} /> Also add your LinkedIn URL to your resume
                  </a>
                )}
                {savedOk && (
                  <p className="text-xs text-emerald-400 font-semibold">✓ Profile saved to Firestore</p>
                )}
              </div>
            )}
          </div>

          {/* Nav Controls */}
          <div className="flex items-center justify-between border-t border-brand-border/60 pt-6">
            <button onClick={handlePrev} disabled={step === 1}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-brand-border hover:bg-brand-card-hover text-sm font-semibold transition-colors disabled:opacity-50 disabled:pointer-events-none cursor-pointer">
              <ArrowLeft size={16} />
              <span>Back</span>
            </button>

            {step < 3 ? (
              <button onClick={handleNext}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand-accent text-brand-bg font-bold text-sm hover:bg-brand-accent-hover transition-all cursor-pointer">
                <span>Next Step</span>
                <ArrowRight size={16} />
              </button>
            ) : (
              <button onClick={handleSave} disabled={saving}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-brand-border text-sm font-semibold text-brand-text-secondary hover:text-brand-accent transition-all cursor-pointer disabled:opacity-50">
                <Save size={15} />
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            )}
          </div>
        </div>

        {/* Live Preview (sidebar) */}
        <div className="glass-card p-6 rounded-3xl flex flex-col h-fit sticky top-24 border border-brand-border">
          <span className="text-[10px] text-brand-accent uppercase font-bold tracking-wider mb-4 block">Live Preview</span>
          <div className="bg-brand-bg/50 border border-brand-border/60 rounded-2xl p-6 space-y-4">
            <div className="flex items-center gap-3">
              <img
                src={user?.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=10b981&color=fff`}
                alt="profile"
                className="w-12 h-12 rounded-full object-cover border-2 border-brand-accent/30"
              />
              <div>
                <h4 className="text-sm font-bold text-brand-text-primary">{displayName}</h4>
                <p className="text-xs text-brand-text-muted">{title || 'Your Title'}</p>
                <p className="text-[10px] text-brand-text-muted mt-0.5">{location || 'City, India'}</p>
              </div>
            </div>

            <p className="text-xs text-brand-text-secondary leading-relaxed border-t border-brand-border/40 pt-3 italic">
              &ldquo;{bio || 'No bio entered yet...'}&rdquo;
            </p>

            {approvedSkills.length > 0 ? (
              <div className="space-y-1.5 border-t border-brand-border/40 pt-3">
                <span className="text-[10px] text-brand-accent font-bold block uppercase">✓ Mentor-Verified Skills</span>
                <div className="flex flex-wrap gap-1">
                  {approvedSkills.map((s) => (
                    <span key={s} className="px-2 py-0.5 rounded-md text-[10px] bg-brand-accent-light text-brand-accent border border-brand-accent/20">{s}</span>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-1.5 border-t border-brand-border/40 pt-3">
                <span className="text-[10px] text-brand-text-muted font-bold block uppercase">Skills</span>
                <span className="text-[10px] text-brand-text-muted italic">No mentor-verified skills yet.</span>
              </div>
            )}

            <div className="space-y-1.5 border-t border-brand-border/40 pt-3">
              <span className="text-[10px] text-brand-text-muted font-bold block uppercase">Projects ({projects.length})</span>
              {projects.length === 0 ? (
                <span className="text-[10px] text-brand-text-muted italic">No projects submitted yet.</span>
              ) : (
                <div className="space-y-1 text-xs text-brand-text-secondary">
                  {projects.map((p) => (
                    <div key={p.id} className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-brand-accent shrink-0" />
                      <span className="truncate">{p.title}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── PRINT-ONLY PORTFOLIO (hidden on screen, visible only when printing) ── */}
      <div ref={printRef} className="print-portfolio" aria-hidden="true">
        <style>{`
          @media print {
            body > *:not(.print-portfolio-root) { display: none !important; }
            .print-portfolio { display: block !important; }
            @page { margin: 20mm; }
          }
          @media screen {
            .print-portfolio { display: none; }
          }
        `}</style>

        <div style={{ fontFamily: 'Georgia, serif', color: '#111', lineHeight: 1.6 }}>
          {/* Header */}
          <div style={{ borderBottom: '2px solid #10b981', paddingBottom: 16, marginBottom: 20 }}>
            <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700 }}>{displayName}</h1>
            <p style={{ margin: '4px 0 0', fontSize: 14, color: '#555' }}>{title}</p>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: '#777' }}>
              {displayEmail}{phone ? ` · ${phone}` : ''}{location ? ` · ${location}` : ''}
            </p>
            {user?.linkedIn && (
              <p style={{ margin: '4px 0 0', fontSize: 12, color: '#10b981' }}>{user.linkedIn}</p>
            )}
          </div>

          {/* Bio */}
          {bio && (
            <div style={{ marginBottom: 20 }}>
              <h2 style={{ fontSize: 14, fontWeight: 700, color: '#10b981', textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 6px' }}>About</h2>
              <p style={{ fontSize: 13, color: '#333' }}>{bio}</p>
            </div>
          )}

          {/* Academic */}
          {(user?.college || user?.branch) && (
            <div style={{ marginBottom: 20 }}>
              <h2 style={{ fontSize: 14, fontWeight: 700, color: '#10b981', textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 6px' }}>Education</h2>
              <p style={{ fontSize: 13, color: '#333' }}>
                <strong>{user.branch}</strong>{user.year ? ` · ${user.year}` : ''}{user.college ? ` · ${user.college}` : ''}
              </p>
            </div>
          )}

          {/* Skills — Mentor Verified Only */}
          {approvedSkills.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <h2 style={{ fontSize: 14, fontWeight: 700, color: '#10b981', textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 6px' }}>Skills (Mentor-Verified)</h2>
              <p style={{ fontSize: 13, color: '#333' }}>{approvedSkills.join(' · ')}</p>
            </div>
          )}

          {/* Projects */}
          {projects.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <h2 style={{ fontSize: 14, fontWeight: 700, color: '#10b981', textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 6px' }}>Projects</h2>
              {projects.map((p) => (
                <div key={p.id} style={{ marginBottom: 10 }}>
                  <p style={{ margin: 0, fontWeight: 600, fontSize: 13 }}>{p.title}</p>
                  {p.description && <p style={{ margin: '2px 0 0', fontSize: 12, color: '#555' }}>{p.description}</p>}
                  {p.repoUrl && <p style={{ margin: '2px 0 0', fontSize: 11, color: '#10b981' }}>{p.repoUrl}</p>}
                </div>
              ))}
            </div>
          )}

          {/* Mentor-Approved Certifications */}
          {approvedCerts.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <h2 style={{ fontSize: 14, fontWeight: 700, color: '#10b981', textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 6px' }}>Certifications (Mentor-Approved)</h2>
              {approvedCerts.map((c) => (
                <div key={c.id} style={{ marginBottom: 8 }}>
                  <p style={{ margin: 0, fontWeight: 600, fontSize: 13 }}>{c.ocrFields?.courseTitle || c.title || 'Certificate'}</p>
                  {c.ocrFields?.issuer && <p style={{ margin: '2px 0 0', fontSize: 12, color: '#555' }}>{c.ocrFields.issuer}</p>}
                  {c.ocrFields?.completionDate && <p style={{ margin: '2px 0 0', fontSize: 11, color: '#999' }}>{c.ocrFields.completionDate}</p>}
                </div>
              ))}
            </div>
          )}

          {/* GitHub */}
          {user?.gitHub && (
            <div style={{ marginBottom: 20 }}>
              <h2 style={{ fontSize: 14, fontWeight: 700, color: '#10b981', textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 6px' }}>GitHub</h2>
              <p style={{ fontSize: 13, color: '#10b981' }}>{user.gitHub}</p>
            </div>
          )}

          <div style={{ borderTop: '1px solid #ddd', paddingTop: 10, marginTop: 20, fontSize: 11, color: '#aaa', textAlign: 'center' }}>
            Generated by ReadyUp 2.0 · Placement Portfolio
          </div>
        </div>
      </div>
    </div>
  );
}
