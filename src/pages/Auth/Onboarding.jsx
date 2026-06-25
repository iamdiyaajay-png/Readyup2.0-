import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { GraduationCap, Briefcase, Sparkles, Send, LogOut } from 'lucide-react';
import { encryptData } from '../../services/encryption';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '../../router/routes';


export default function Onboarding() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  // Auto-select role from user's Firestore intendedRole, then sessionStorage fallback
  const savedIntendedRole = user?.intendedRole || sessionStorage.getItem('intendedRole') || 'student';
  const [role, setRole] = useState(savedIntendedRole === 'mentor' ? 'mentor' : 'student');

  // URL validator
  const isValidUrl = (url) => {
    if (!url) return true; // optional field — skip empty
    try { new URL(url); return true; } catch { return false; }
  };

  // Common Fields
  const [name, setName] = useState(user?.name || '');
  const [linkedIn, setLinkedIn] = useState('');

  // Student Fields
  const [college, setCollege] = useState('');
  const [branch, setBranch] = useState('');
  const [year, setYear] = useState('3rd Year');
  const [skills, setSkills] = useState('');
  const [gitHub, setGitHub] = useState('');
  const [resumeUrl, setResumeUrl] = useState('');

  // Mentor Fields
  const [organization, setOrganization] = useState('');
  const [designation, setDesignation] = useState('');
  const [experience, setExperience] = useState('');
  const [expertiseAreas, setExpertiseAreas] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Name is required.');
      return;
    }

    // URL validation
    if (role === 'student') {
      if (gitHub && !isValidUrl(gitHub)) {
        setError('GitHub URL is not valid. It must start with https://');
        return;
      }
      if (resumeUrl && !isValidUrl(resumeUrl)) {
        setError('Resume URL is not valid. Use a full URL starting with https://');
        return;
      }
    }
    if (linkedIn && !isValidUrl(linkedIn)) {
      setError('LinkedIn URL is not valid. It must start with https://');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const userRef = doc(db, 'users', user.uid);
      const isStudent = role === 'student';

      // Sensitive form data — will be AES-encrypted before writing to Firestore
      const sensitiveDetails = isStudent
        ? {
            college: college.trim(),
            branch: branch.trim(),
            year,
            skills: skills.split(',').map((s) => s.trim()).filter(Boolean),
            linkedIn: linkedIn.trim(),
            gitHub: gitHub.trim(),
            resumeUrl: resumeUrl.trim(),
          }
        : {
            organization: organization.trim(),
            designation: designation.trim(),
            experience: parseInt(experience, 10) || 0,
            linkedIn: linkedIn.trim(),
            expertiseAreas: expertiseAreas.split(',').map((s) => s.trim()).filter(Boolean),
          };

      // Encrypt sensitive data before writing
      const encryptedDetails = encryptData(sensitiveDetails);

      // Non-sensitive fields remain in plaintext for querying/routing
      // NOTE: `role` is intentionally NOT set here — the user doc starts as role:'pending'
      // and the admin sets the final role (student/mentor) when approving the request.
      // Writing `role` here would be blocked by Firestore security rules.
      const payload = {
        intendedRole: isStudent ? 'student' : 'mentor', // admin reads this to know what role to grant
        status: 'pending',
        name: name.trim(),
        encryptedDetails, // ciphertext of sensitive form fields
        profileCompletion: 100,
        readinessScore: 0,
        mentorAssigned: false,
        lastActivity: new Date().toISOString(),
      };

      await updateDoc(userRef, payload);
      // Clean up sessionStorage once profile is saved
      sessionStorage.removeItem('intendedRole');
    } catch (err) {
      console.error('Error during onboarding submission:', err);
      setError('Failed to save profile. Please check your network and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-brand-bg flex items-center justify-center p-6 relative overflow-y-auto">
      {/* Background glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-brand-accent/5 blur-[120px] pointer-events-none"></div>

      <div className="w-full max-w-2xl glass-card p-8 sm:p-10 rounded-3xl relative z-10 border border-brand-border my-8">
        <div className="flex justify-between items-center mb-6">
          <div className="inline-flex items-center gap-2 bg-brand-accent-light px-3 py-1 rounded-full border border-brand-accent/20">
            <Sparkles size={14} className="text-brand-accent" />
            <span className="text-xs font-semibold text-brand-accent tracking-wider uppercase">Onboarding</span>
          </div>
          <button
            onClick={async () => { await logout(); navigate(ROUTES.LANDING); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-brand-border text-xs font-semibold text-red-400 hover:bg-red-950/20 hover:text-red-300 transition-all cursor-pointer"
          >
            <LogOut size={12} />
            <span>Sign Out</span>
          </button>
        </div>

        <div className="text-center mb-8">
          <h2 className="text-3xl font-extrabold text-brand-text-primary tracking-tight">Complete Your Profile</h2>
          <p className="text-xs text-brand-text-secondary mt-2">
            Select your account path to finalize your registration for ReadyUp 2.0.
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-xl bg-red-950/20 border border-red-900/30 text-red-400 text-xs font-medium text-center">
            {error}
          </div>
        )}

        {/* Role Selector Cards */}
        <div className="grid grid-cols-2 gap-4 mb-8">
          <button
            type="button"
            onClick={() => setRole('student')}
            className={`p-6 rounded-2xl border flex flex-col items-center justify-center gap-3 transition-all cursor-pointer ${
              role === 'student'
                ? 'bg-brand-accent-light/10 border-brand-accent text-brand-text-primary'
                : 'bg-brand-card/40 border-brand-border hover:border-brand-text-muted text-brand-text-secondary'
            }`}
          >
            <div className={`p-3 rounded-xl ${role === 'student' ? 'bg-brand-accent/20 text-brand-accent' : 'bg-brand-bg text-brand-text-muted'}`}>
              <GraduationCap size={24} />
            </div>
            <div className="text-center">
              <span className="font-bold text-sm block">Student</span>
              <span className="text-[10px] opacity-75 mt-0.5 block">Join as candidate</span>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setRole('mentor')}
            className={`p-6 rounded-2xl border flex flex-col items-center justify-center gap-3 transition-all cursor-pointer ${
              role === 'mentor'
                ? 'bg-indigo-500/10 border-indigo-500 text-brand-text-primary'
                : 'bg-brand-card/40 border-brand-border hover:border-brand-text-muted text-brand-text-secondary'
            }`}
          >
            <div className={`p-3 rounded-xl ${role === 'mentor' ? 'bg-indigo-500/20 text-indigo-400' : 'bg-brand-bg text-brand-text-muted'}`}>
              <Briefcase size={24} />
            </div>
            <div className="text-center">
              <span className="font-bold text-sm block">Mentor</span>
              <span className="text-[10px] opacity-75 mt-0.5 block">Join as industry guide</span>
            </div>
          </button>
        </div>

        {/* Dynamic Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {/* Full Name */}
            <div className="space-y-1.5 sm:col-span-2">
              <label className="text-[10px] font-bold text-brand-text-secondary uppercase tracking-wider block">
                Full Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-4 py-3 bg-brand-bg/50 border border-brand-border rounded-xl text-sm focus:outline-none focus:border-brand-accent text-brand-text-primary"
                placeholder="e.g. John Doe"
                required
              />
            </div>

            {role === 'student' ? (
              <>
                {/* Student specific fields */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-brand-text-secondary uppercase tracking-wider block">
                    College / University <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={college}
                    onChange={(e) => setCollege(e.target.value)}
                    className="w-full px-4 py-3 bg-brand-bg/50 border border-brand-border rounded-xl text-sm focus:outline-none focus:border-brand-accent text-brand-text-primary"
                    placeholder="e.g. Stanford University"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-brand-text-secondary uppercase tracking-wider block">
                    Branch / Specialization <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={branch}
                    onChange={(e) => setBranch(e.target.value)}
                    className="w-full px-4 py-3 bg-brand-bg/50 border border-brand-border rounded-xl text-sm focus:outline-none focus:border-brand-accent text-brand-text-primary"
                    placeholder="e.g. Computer Science"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-brand-text-secondary uppercase tracking-wider block">
                    Academic Year
                  </label>
                  <select
                    value={year}
                    onChange={(e) => setYear(e.target.value)}
                    className="w-full px-4 py-3 bg-brand-bg/50 border border-brand-border rounded-xl text-sm focus:outline-none focus:border-brand-accent text-brand-text-primary"
                  >
                    <option value="1st Year">1st Year</option>
                    <option value="2nd Year">2nd Year</option>
                    <option value="3rd Year">3rd Year</option>
                    <option value="4th Year">4th Year</option>
                    <option value="Postgraduate">Postgraduate</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-brand-text-secondary uppercase tracking-wider block">
                    GitHub Profile Link
                    <span className="ml-1 text-brand-text-muted font-normal normal-case">(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={gitHub}
                    onChange={(e) => setGitHub(e.target.value)}
                    className={`w-full px-4 py-3 bg-brand-bg/50 border rounded-xl text-sm focus:outline-none text-brand-text-primary ${
                      gitHub && !isValidUrl(gitHub) ? 'border-red-500 focus:border-red-500' : 'border-brand-border focus:border-brand-accent'
                    }`}
                    placeholder="https://github.com/username"
                  />
                  {gitHub && !isValidUrl(gitHub) && (
                    <p className="text-red-400 text-[10px] mt-0.5">⚠ Must be a valid URL starting with https://</p>
                  )}
                </div>

                <div className="space-y-1.5 sm:col-span-2">
                  <label className="text-[10px] font-bold text-brand-text-secondary uppercase tracking-wider block">
                    Skills (Comma Separated) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={skills}
                    onChange={(e) => setSkills(e.target.value)}
                    className="w-full px-4 py-3 bg-brand-bg/50 border border-brand-border rounded-xl text-sm focus:outline-none focus:border-brand-accent text-brand-text-primary"
                    placeholder="e.g. React, Node.js, Python, CSS"
                    required
                  />
                </div>

                <div className="space-y-1.5 sm:col-span-2">
                  <label className="text-[10px] font-bold text-brand-text-secondary uppercase tracking-wider block">
                    Resume Link (Google Drive, Dropbox, etc.) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={resumeUrl}
                    onChange={(e) => setResumeUrl(e.target.value)}
                    className={`w-full px-4 py-3 bg-brand-bg/50 border rounded-xl text-sm focus:outline-none text-brand-text-primary ${
                      resumeUrl && !isValidUrl(resumeUrl) ? 'border-red-500 focus:border-red-500' : 'border-brand-border focus:border-brand-accent'
                    }`}
                    placeholder="https://drive.google.com/..."
                    required
                  />
                  {resumeUrl && !isValidUrl(resumeUrl) && (
                    <p className="text-red-400 text-[10px] mt-0.5">⚠ Must be a valid URL starting with https://</p>
                  )}
                </div>
              </>
            ) : (
              <>
                {/* Mentor specific fields */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-brand-text-secondary uppercase tracking-wider block">
                    Current Organization <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={organization}
                    onChange={(e) => setOrganization(e.target.value)}
                    className="w-full px-4 py-3 bg-brand-bg/50 border border-brand-border rounded-xl text-sm focus:outline-none focus:border-brand-accent text-brand-text-primary"
                    placeholder="e.g. Google, Meta"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-brand-text-secondary uppercase tracking-wider block">
                    Job Designation <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={designation}
                    onChange={(e) => setDesignation(e.target.value)}
                    className="w-full px-4 py-3 bg-brand-bg/50 border border-brand-border rounded-xl text-sm focus:outline-none focus:border-brand-accent text-brand-text-primary"
                    placeholder="e.g. Senior Software Engineer"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-brand-text-secondary uppercase tracking-wider block">
                    Years of Experience <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={experience}
                    onChange={(e) => setExperience(e.target.value)}
                    className="w-full px-4 py-3 bg-brand-bg/50 border border-brand-border rounded-xl text-sm focus:outline-none focus:border-brand-accent text-brand-text-primary"
                    placeholder="e.g. 5"
                    required
                  />
                </div>

                <div className="space-y-1.5 sm:col-span-2">
                  <label className="text-[10px] font-bold text-brand-text-secondary uppercase tracking-wider block">
                    Areas of Expertise (Comma Separated) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={expertiseAreas}
                    onChange={(e) => setExpertiseAreas(e.target.value)}
                    className="w-full px-4 py-3 bg-brand-bg/50 border border-brand-border rounded-xl text-sm focus:outline-none focus:border-brand-accent text-brand-text-primary"
                    placeholder="e.g. System Design, Web Dev, Mobile apps"
                    required
                  />
                </div>
              </>
            )}

            {/* LinkedIn Profile URL */}
            <div className="space-y-1.5 sm:col-span-2">
              <label className="text-[10px] font-bold text-brand-text-secondary uppercase tracking-wider block">
                LinkedIn Profile URL <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={linkedIn}
                onChange={(e) => setLinkedIn(e.target.value)}
                className={`w-full px-4 py-3 bg-brand-bg/50 border rounded-xl text-sm focus:outline-none text-brand-text-primary ${
                  linkedIn && !isValidUrl(linkedIn) ? 'border-red-500 focus:border-red-500' : 'border-brand-border focus:border-brand-accent'
                }`}
                placeholder="https://linkedin.com/in/username"
                required
              />
              {linkedIn && !isValidUrl(linkedIn) && (
                <p className="text-red-400 text-[10px] mt-0.5">⚠ Must be a valid URL starting with https://</p>
              )}
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-brand-accent text-brand-bg font-extrabold text-sm hover:bg-brand-accent-hover transition-all shadow-lg shadow-brand-accent/20 cursor-pointer disabled:opacity-50 mt-6"
          >
            {loading ? (
              <div className="w-5 h-5 rounded-full border-2 border-brand-bg/25 border-t-brand-bg animate-spin"></div>
            ) : (
              <>
                <Send size={16} />
                <span>Submit Profile for Verification</span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
