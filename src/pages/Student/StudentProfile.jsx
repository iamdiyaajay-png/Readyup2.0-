import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../firebase';
import { doc, updateDoc } from 'firebase/firestore';
import {
  User, Mail, Phone, MapPin, BookOpen, Code2,
  Save, Pencil, CheckCircle2, GraduationCap
} from 'lucide-react';
import { Github, Linkedin } from '../../components/common/Icons';
import { logProfileUpdated } from '../../services/activityLog';


function Field({ icon: Icon, label, value, editing, name, onChange, type = 'text', required }) {
  return (
    <div className="space-y-1.5">
      <label className="text-[10px] font-bold text-brand-text-secondary uppercase tracking-wider flex items-center gap-1">
        {Icon && <Icon size={11} className="text-brand-text-muted" />}
        {label}
        {required && <span className="text-red-500">*</span>}
      </label>
      {editing ? (
        <input
          type={type}
          name={name}
          value={value}
          onChange={onChange}
          className="w-full px-4 py-2.5 bg-brand-bg border border-brand-border rounded-xl text-sm text-brand-text-primary focus:outline-none focus:border-brand-accent transition-colors"
        />
      ) : (
        <p className="text-sm text-brand-text-primary px-1 py-1 min-h-[2rem] flex items-center">
          {value || <span className="text-brand-text-muted italic">Not set</span>}
        </p>
      )}
    </div>
  );
}

export default function StudentProfile() {
  const { user } = useAuth();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    name: '',
    phone: '',
    location: '',
    bio: '',
    college: '',
    branch: '',
    year: '',
    skills: '',
    linkedIn: '',
    gitHub: '',
  });

  // Pre-fill from Firestore user document
  useEffect(() => {
    if (user) {
      setForm({
        name: user.name || '',
        phone: user.portfolioPhone || '',
        location: user.portfolioLocation || '',
        bio: user.portfolioBio || '',
        college: user.college || '',
        branch: user.branch || '',
        year: user.year || '',
        skills: Array.isArray(user.skills) ? user.skills.join(', ') : (user.skills || ''),
        linkedIn: user.linkedIn || '',
        gitHub: user.gitHub || '',
      });
    }
  }, [user]);

  const handleChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  // ── URL Validators ─────────────────────────────────────
  const GITHUB_RE  = /^https?:\/\/(www\.)?github\.com\/[a-zA-Z0-9_-]+(\/?|(\/[^\s]*)?)$/;
  const LINKEDIN_RE = /^https?:\/\/(www\.)?linkedin\.com\/in\/[a-zA-Z0-9_-]+(\/?|(\/[^\s]*)?)$/;

  const githubError = form.gitHub && !GITHUB_RE.test(form.gitHub.trim())
    ? 'Must be a valid GitHub profile URL: github.com/your-username'
    : '';
  const linkedinError = form.linkedIn && !LINKEDIN_RE.test(form.linkedIn.trim())
    ? 'Must be a valid LinkedIn profile URL: linkedin.com/in/your-username'
    : '';

  const handleSave = async () => {
    setError('');
    if (!form.name.trim()) { setError('Name is required.'); return; }
    if (githubError)  { setError(githubError);  return; }
    if (linkedinError) { setError(linkedinError); return; }

    setSaving(true);
    try {
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, {
        name: form.name.trim(),
        portfolioPhone: form.phone.trim(),
        portfolioLocation: form.location.trim(),
        portfolioBio: form.bio.trim(),
        college: form.college.trim(),
        branch: form.branch.trim(),
        year: form.year,
        skills: [], // skills are set by mentor only — not saved from profile editor
        linkedIn: form.linkedIn.trim(),
        gitHub: form.gitHub.trim(),
        lastActivity: new Date().toISOString(),
      });
      await logProfileUpdated(user.uid, 'student');
      setEditing(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error('Profile save failed:', err);
      setError('Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">My Profile</h1>
          <p className="text-sm text-brand-text-secondary mt-1">
            Keep your details up to date. This information is used in your portfolio.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {saved && (
            <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
              <CheckCircle2 size={14} />
              Saved!
            </span>
          )}
          {editing ? (
            <>
              <button
                onClick={() => { setEditing(false); setError(''); }}
                className="px-4 py-2 rounded-xl border border-brand-border text-xs font-semibold text-brand-text-secondary hover:text-brand-text-primary transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-brand-accent text-brand-bg text-xs font-bold hover:bg-brand-accent-hover transition-all disabled:opacity-50 cursor-pointer"
              >
                {saving ? (
                  <div className="w-3.5 h-3.5 rounded-full border-2 border-brand-bg/20 border-t-brand-bg animate-spin" />
                ) : (
                  <Save size={13} />
                )}
                Save Changes
              </button>
            </>
          ) : (
            <button
              onClick={() => setEditing(true)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-brand-border text-xs font-semibold text-brand-text-secondary hover:text-brand-accent hover:border-brand-accent/40 transition-all cursor-pointer"
            >
              <Pencil size={13} />
              Edit Profile
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-950/20 border border-red-900/30 text-red-400 text-xs font-medium">
          {error}
        </div>
      )}

      {/* Avatar & Basic */}
      <div className="glass-card p-6 rounded-3xl border border-brand-border/60 space-y-5">
        <div className="flex items-center gap-4">
          <img
            src={user?.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(user?.name || 'Student')}&background=10b981&color=fff`}
            alt="avatar"
            className="w-16 h-16 rounded-2xl object-cover border-2 border-brand-border"
          />
          <div>
            <p className="font-bold text-brand-text-primary">{user?.name}</p>
            <p className="text-xs text-brand-text-muted">{user?.email}</p>
            <span className="inline-flex items-center gap-1 mt-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-brand-accent-light text-brand-accent border border-brand-accent/20">
              <GraduationCap size={10} />
              Student
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <Field icon={User} label="Full Name" name="name" value={form.name} editing={editing} onChange={handleChange} required />
          <Field icon={Mail} label="Email" name="email" value={user?.email} editing={false} onChange={() => {}} />
          <Field icon={Phone} label="Phone" name="phone" value={form.phone} editing={editing} onChange={handleChange} />
          <Field icon={MapPin} label="Location / City" name="location" value={form.location} editing={editing} onChange={handleChange} />
        </div>

        {/* Bio */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold text-brand-text-secondary uppercase tracking-wider block">
            Bio / About
          </label>
          {editing ? (
            <textarea
              name="bio"
              value={form.bio}
              onChange={handleChange}
              rows={3}
              className="w-full px-4 py-2.5 bg-brand-bg border border-brand-border rounded-xl text-sm text-brand-text-primary focus:outline-none focus:border-brand-accent transition-colors resize-none"
              placeholder="Write a short bio..."
            />
          ) : (
            <p className="text-sm text-brand-text-secondary leading-relaxed min-h-[3rem]">
              {form.bio || <span className="text-brand-text-muted italic">Not set</span>}
            </p>
          )}
        </div>
      </div>

      {/* Academic Details */}
      <div className="glass-card p-6 rounded-3xl border border-brand-border/60 space-y-5">
        <h3 className="text-sm font-bold text-brand-text-primary flex items-center gap-2">
          <GraduationCap size={15} className="text-brand-accent" />
          Academic Details
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <Field icon={BookOpen} label="College / University" name="college" value={form.college} editing={editing} onChange={handleChange} />
          <Field icon={BookOpen} label="Branch / Specialization" name="branch" value={form.branch} editing={editing} onChange={handleChange} />
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-brand-text-secondary uppercase tracking-wider block">Academic Year</label>
            {editing ? (
              <select
                name="year"
                value={form.year}
                onChange={handleChange}
                className="w-full px-4 py-2.5 bg-brand-bg border border-brand-border rounded-xl text-sm text-brand-text-primary focus:outline-none focus:border-brand-accent"
              >
                <option value="">Select year</option>
                <option>1st Year</option>
                <option>2nd Year</option>
                <option>3rd Year</option>
                <option>4th Year</option>
                <option>Postgraduate</option>
              </select>
            ) : (
              <p className="text-sm text-brand-text-primary px-1 py-1">
                {form.year || <span className="text-brand-text-muted italic">Not set</span>}
              </p>
            )}
          </div>
          {/* Skills — Read-Only, set by Mentor */}
          <div className="space-y-1.5 lg:col-span-2">
            <label className="text-[10px] font-bold text-brand-text-secondary uppercase tracking-wider flex items-center gap-1">
              <Code2 size={11} className="text-brand-text-muted" /> Skills
            </label>
            {Array.isArray(user?.approvedSkills) && user.approvedSkills.length > 0 ? (
              <div className="flex flex-wrap gap-1.5 px-1 py-1">
                {user.approvedSkills.map((s) => (
                  <span key={s} className="px-2.5 py-1 rounded-full bg-brand-accent-light border border-brand-accent/20 text-[10px] font-semibold text-brand-accent">{s}</span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-brand-text-muted px-1 py-1 italic">No mentor-approved skills yet.</p>
            )}
            <p className="text-[10px] text-brand-text-muted">
              Skills are validated and approved by your assigned mentor. Contact them via Chat to add new skills.
            </p>
          </div>
        </div>
      </div>

      {/* Social Links */}
      <div className="glass-card p-6 rounded-3xl border border-brand-border/60 space-y-5">
        <h3 className="text-sm font-bold text-brand-text-primary flex items-center gap-2">
          <Linkedin size={15} className="text-indigo-400" />
          Social &amp; Portfolio Links
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {/* LinkedIn with inline validation */}
          <div className="space-y-1">
            <Field icon={Linkedin} label="LinkedIn URL" name="linkedIn" value={form.linkedIn} editing={editing} onChange={handleChange} />
            {editing && form.linkedIn && (
              <p className={`text-[10px] font-semibold flex items-center gap-1 ${linkedinError ? 'text-red-400' : 'text-brand-accent'}`}>
                {linkedinError ? `⚠ ${linkedinError}` : '✓ Valid LinkedIn URL'}
              </p>
            )}
            {editing && !form.linkedIn && (
              <p className="text-[10px] text-brand-text-muted">Format: https://linkedin.com/in/your-username</p>
            )}
          </div>

          {/* GitHub with inline validation */}
          <div className="space-y-1">
            <Field icon={Github} label="GitHub URL" name="gitHub" value={form.gitHub} editing={editing} onChange={handleChange} />
            {editing && form.gitHub && (
              <p className={`text-[10px] font-semibold flex items-center gap-1 ${githubError ? 'text-red-400' : 'text-brand-accent'}`}>
                {githubError ? `⚠ ${githubError}` : '✓ Valid GitHub URL'}
              </p>
            )}
            {editing && !form.gitHub && (
              <p className="text-[10px] text-brand-text-muted">Format: https://github.com/your-username</p>
            )}
          </div>
        </div>
        {!editing && (form.linkedIn || form.gitHub) && (
          <div className="flex gap-3 flex-wrap">
            {form.linkedIn && (
              <a href={form.linkedIn} target="_blank" rel="noreferrer"
                className="flex items-center gap-1.5 text-xs text-indigo-400 hover:underline font-semibold">
                <Linkedin size={13} /> LinkedIn Profile
              </a>
            )}
            {form.gitHub && (
              <a href={form.gitHub} target="_blank" rel="noreferrer"
                className="flex items-center gap-1.5 text-xs text-brand-text-secondary hover:underline font-semibold">
                <Github size={13} /> GitHub Profile
              </a>
            )}
          </div>
        )}
      </div>

      {/* Stats (read-only) */}
      <div className="glass-card p-6 rounded-3xl border border-brand-border/60">
        <h3 className="text-sm font-bold text-brand-text-primary mb-4">Readiness Stats</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <div className="text-center p-4 bg-brand-bg/40 rounded-2xl border border-brand-border/40">
            <p className="text-2xl font-extrabold text-brand-accent">{user?.readinessScore || 0}%</p>
            <p className="text-[10px] text-brand-text-muted mt-1 uppercase tracking-wider">Readiness</p>
          </div>
          <div className="text-center p-4 bg-brand-bg/40 rounded-2xl border border-brand-border/40">
            <p className="text-2xl font-extrabold text-brand-text-primary">{user?.profileCompletion || 0}%</p>
            <p className="text-[10px] text-brand-text-muted mt-1 uppercase tracking-wider">Profile</p>
          </div>
          <div className="text-center p-4 bg-brand-bg/40 rounded-2xl border border-brand-border/40">
            <p className="text-2xl font-extrabold text-indigo-400">
              {user?.mentorAssigned ? '✓' : '—'}
            </p>
            <p className="text-[10px] text-brand-text-muted mt-1 uppercase tracking-wider">Mentor</p>
          </div>
        </div>
      </div>
    </div>
  );
}
