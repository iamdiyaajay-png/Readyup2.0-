import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../firebase';
import { doc, updateDoc } from 'firebase/firestore';
import {
  User, Mail, Briefcase, Building, Code2,
  Save, Pencil, CheckCircle2, Award
} from 'lucide-react';
import { Linkedin } from '../../components/common/Icons';
import { logProfileUpdated } from '../../services/activityLog';

function Field({ icon: Icon, label, value, editing, name, onChange, type = 'text', required, placeholder }) {
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
          placeholder={placeholder}
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

export default function MentorProfile() {
  const { user } = useAuth();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    name: '',
    organization: '',
    designation: '',
    experience: '',
    expertiseAreas: '',
    linkedIn: '',
    bio: '',
  });

  // Pre-fill from Firestore user document (decrypted values come via AuthContext)
  useEffect(() => {
    if (user) {
      setForm({
        name: user.name || '',
        organization: user.organization || '',
        designation: user.designation || '',
        experience: user.experience !== undefined ? String(user.experience) : '',
        expertiseAreas: Array.isArray(user.expertiseAreas)
          ? user.expertiseAreas.join(', ')
          : (user.expertiseAreas || ''),
        linkedIn: user.linkedIn || '',
        bio: user.bio || '',
      });
    }
  }, [user]);

  const handleChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const isValidUrl = (url) => {
    if (!url) return true;
    try { new URL(url); return true; } catch { return false; }
  };

  const handleSave = async () => {
    setError('');
    if (!form.name.trim()) { setError('Name is required.'); return; }
    if (form.linkedIn && !isValidUrl(form.linkedIn)) { setError('LinkedIn must be a valid URL.'); return; }

    setSaving(true);
    try {
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, {
        name: form.name.trim(),
        organization: form.organization.trim(),
        designation: form.designation.trim(),
        experience: parseInt(form.experience, 10) || 0,
        expertiseAreas: form.expertiseAreas.split(',').map((s) => s.trim()).filter(Boolean),
        linkedIn: form.linkedIn.trim(),
        bio: form.bio.trim(),
        lastActivity: new Date().toISOString(),
      });
      await logProfileUpdated(user.uid, 'mentor');
      setEditing(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error('Mentor profile save failed:', err);
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
          <h1 className="text-2xl font-bold tracking-tight">Mentor Profile</h1>
          <p className="text-sm text-brand-text-secondary mt-1">
            Keep your professional details updated. Students see this information when they are assigned to you.
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
            src={user?.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(user?.name || 'Mentor')}&background=6366f1&color=fff`}
            alt="avatar"
            className="w-16 h-16 rounded-2xl object-cover border-2 border-indigo-500/30"
          />
          <div>
            <p className="font-bold text-brand-text-primary">{user?.name}</p>
            <p className="text-xs text-brand-text-muted">{user?.email}</p>
            <span className="inline-flex items-center gap-1 mt-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-950/40 text-indigo-400 border border-indigo-500/20">
              <Briefcase size={10} />
              Mentor
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <Field icon={User}  label="Full Name"   name="name"  value={form.name}  editing={editing} onChange={handleChange} required placeholder="Your full name" />
          <Field icon={Mail}  label="Email"        name="email" value={user?.email} editing={false}   onChange={() => {}} />
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
              placeholder="Write a short professional bio..."
            />
          ) : (
            <p className="text-sm text-brand-text-secondary leading-relaxed min-h-[3rem]">
              {form.bio || <span className="text-brand-text-muted italic">Not set</span>}
            </p>
          )}
        </div>
      </div>

      {/* Professional Details */}
      <div className="glass-card p-6 rounded-3xl border border-brand-border/60 space-y-5">
        <h3 className="text-sm font-bold text-brand-text-primary flex items-center gap-2">
          <Building size={15} className="text-indigo-400" />
          Professional Details
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <Field icon={Building}  label="Current Organization" name="organization" value={form.organization} editing={editing} onChange={handleChange} placeholder="e.g. Google, Meta" />
          <Field icon={Briefcase} label="Job Designation"       name="designation"  value={form.designation}  editing={editing} onChange={handleChange} placeholder="e.g. Senior Software Engineer" />
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-brand-text-secondary uppercase tracking-wider block flex items-center gap-1">
              <Award size={11} className="text-brand-text-muted" /> Years of Experience
            </label>
            {editing ? (
              <input
                type="number"
                name="experience"
                min="0"
                value={form.experience}
                onChange={handleChange}
                placeholder="e.g. 5"
                className="w-full px-4 py-2.5 bg-brand-bg border border-brand-border rounded-xl text-sm text-brand-text-primary focus:outline-none focus:border-brand-accent transition-colors"
              />
            ) : (
              <p className="text-sm text-brand-text-primary px-1 py-1 min-h-[2rem] flex items-center">
                {form.experience ? `${form.experience} years` : <span className="text-brand-text-muted italic">Not set</span>}
              </p>
            )}
          </div>
          <Field icon={Code2} label="Expertise Areas (comma-separated)" name="expertiseAreas" value={form.expertiseAreas} editing={editing} onChange={handleChange} placeholder="e.g. System Design, React, ML" />
        </div>
      </div>

      {/* Social */}
      <div className="glass-card p-6 rounded-3xl border border-brand-border/60 space-y-5">
        <h3 className="text-sm font-bold text-brand-text-primary flex items-center gap-2">
          <Linkedin size={15} className="text-indigo-400" />
          Professional Links
        </h3>
        <Field icon={Linkedin} label="LinkedIn Profile URL" name="linkedIn" value={form.linkedIn} editing={editing} onChange={handleChange} placeholder="https://linkedin.com/in/username" />
        {!editing && form.linkedIn && (
          <a href={form.linkedIn} target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-indigo-400 hover:underline font-semibold">
            <Linkedin size={13} /> Visit LinkedIn Profile
          </a>
        )}
      </div>

      {/* Stats (read-only) */}
      <div className="glass-card p-6 rounded-3xl border border-brand-border/60">
        <h3 className="text-sm font-bold text-brand-text-primary mb-4">Mentor Stats</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <div className="text-center p-4 bg-brand-bg/40 rounded-2xl border border-brand-border/40">
            <p className="text-2xl font-extrabold text-indigo-400">{user?.profileCompletion || 0}%</p>
            <p className="text-[10px] text-brand-text-muted mt-1 uppercase tracking-wider">Profile</p>
          </div>
          <div className="text-center p-4 bg-brand-bg/40 rounded-2xl border border-brand-border/40">
            <p className="text-2xl font-extrabold text-brand-accent">{user?.experience || 0}</p>
            <p className="text-[10px] text-brand-text-muted mt-1 uppercase tracking-wider">Years Exp.</p>
          </div>
          <div className="text-center p-4 bg-brand-bg/40 rounded-2xl border border-brand-border/40">
            <p className="text-2xl font-extrabold text-brand-text-primary capitalize">{user?.status || '—'}</p>
            <p className="text-[10px] text-brand-text-muted mt-1 uppercase tracking-wider">Status</p>
          </div>
        </div>
      </div>
    </div>
  );
}
