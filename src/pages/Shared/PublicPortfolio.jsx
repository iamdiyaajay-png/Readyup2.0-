import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Mail, Phone, MapPin, Globe, Code, ArrowLeft, Trophy } from 'lucide-react';
import { Github } from '../../components/common/Icons';
import { db } from '../../firebase';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { ROUTES } from '../../router/routes';

export default function PublicPortfolio() {
  const { studentId } = useParams();
  
  const [student, setStudent] = useState(null);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!studentId) {
      Promise.resolve().then(() => {
        setLoading(false);
      });
      return;
    }

    const fetchStudentAndProjects = async () => {
      setLoading(true);
      try {
        const studentDoc = await getDoc(doc(db, 'users', studentId));
        if (studentDoc.exists()) {
          const data = studentDoc.data();
          setStudent({
            name: data.name || 'Student Candidate',
            email: data.email || '',
            photoURL: data.photoURL || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80',
            role: data.role || 'student',
            title: data.portfolioTitle || data.branch || 'Junior Software Engineer',
            phone: data.portfolioPhone || 'Contact details private',
            location: data.portfolioLocation || 'Location not specified',
            bio: data.portfolioBio || 'No summary bio entered yet.',
            skills: data.skills || []
          });
        }
        
        // Fetch projects from Firestore
        const q = query(
          collection(db, 'projects'),
          where('studentId', '==', studentId)
        );
        const projectsSnap = await getDocs(q);
        const projectsList = [];
        projectsSnap.forEach((docSnap) => {
          const p = docSnap.data();
          projectsList.push({
            title: p.title || 'Project Title',
            description: p.description || 'Project Description',
            tech: p.techStack || [],
            github: p.githubUrl || '#',
            live: p.liveUrl || '#'
          });
        });
        setProjects(projectsList);
      } catch (err) {
        console.error('Failed to load public portfolio details:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchStudentAndProjects();
  }, [studentId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-brand-bg flex flex-col items-center justify-center">
        <div className="w-10 h-10 rounded-full border-4 border-brand-accent/25 border-t-brand-accent animate-spin mb-3"></div>
        <p className="text-brand-text-secondary text-xs">Opening Portfolio page...</p>
      </div>
    );
  }

  if (!student) {
    return (
      <div className="min-h-screen bg-brand-bg flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 rounded-full bg-red-950/20 border border-red-900/30 flex items-center justify-center text-red-500 mb-6">
          <Trophy size={28} />
        </div>
        <h2 className="text-xl font-bold text-brand-text-primary">Portfolio Not Found</h2>
        <p className="text-xs text-brand-text-secondary mt-2 max-w-sm">
          The requested placement profile link is invalid or the student has not generated their public portfolio.
        </p>
        <Link
          to="/"
          className="mt-6 px-4 py-2 bg-brand-accent text-brand-bg font-bold rounded-xl text-xs hover:bg-brand-accent-hover transition-colors"
        >
          Go Back Home
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-brand-bg text-brand-text-primary p-6 md:p-12 relative overflow-hidden flex flex-col justify-between">
      {/* Background blur */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-brand-accent/5 blur-[150px] pointer-events-none"></div>

      <div className="max-w-4xl mx-auto w-full space-y-10 relative z-10">
        
        {/* Back link */}
        <Link
          to={ROUTES.STUDENT_DASHBOARD}
          className="inline-flex items-center gap-1.5 text-xs text-brand-text-secondary hover:text-brand-accent transition-colors"
        >
          <ArrowLeft size={14} />
          <span>Back to Dashboard</span>
        </Link>

        {/* Profile Card Header */}
        <div className="glass-card p-8 rounded-3xl flex flex-col md:flex-row items-center md:items-start gap-6">
          <img
            src={student.photoURL}
            alt={student.name}
            className="w-24 h-24 rounded-full object-cover border-4 border-brand-accent/20"
          />
          <div className="flex-1 text-center md:text-left space-y-3">
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight">{student.name}</h1>
              <p className="text-sm font-semibold text-brand-accent mt-1">{student.title}</p>
            </div>

            <p className="text-xs text-brand-text-secondary leading-relaxed max-w-xl">
              {student.bio}
            </p>

            {/* Contacts details row */}
            <div className="flex flex-wrap items-center justify-center md:justify-start gap-4 pt-2 text-[11px] text-brand-text-muted">
              {student.email && (
                <span className="flex items-center gap-1">
                  <Mail size={12} className="text-brand-accent" />
                  {student.email}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Phone size={12} className="text-brand-accent" />
                {student.phone}
              </span>
              <span className="flex items-center gap-1">
                <MapPin size={12} className="text-brand-accent" />
                {student.location}
              </span>
            </div>
          </div>
        </div>

        {/* Skills section */}
        {student.skills.length > 0 && (
          <div className="glass-card p-8 rounded-3xl space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-brand-text-muted">Core Skills & Competencies</h3>
            <div className="flex flex-wrap gap-2">
              {student.skills.map((skill) => (
                <span
                  key={skill}
                  className="px-3 py-1 rounded-lg text-xs font-semibold bg-brand-bg/50 border border-brand-border text-brand-text-secondary"
                >
                  {skill}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Projects section */}
        <div className="space-y-4">
          <h3 className="text-sm font-bold uppercase tracking-wider text-brand-text-muted px-4">Featured Work & Projects</h3>
          {projects.length === 0 ? (
            <div className="glass-card p-8 rounded-3xl text-center text-xs text-brand-text-muted">
              No projects added to this placement portfolio yet.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {projects.map((proj, idx) => (
                <div key={idx} className="glass-card p-6 rounded-3xl flex flex-col justify-between space-y-6">
                  <div>
                    <div className="flex items-center justify-between">
                      <div className="w-10 h-10 rounded-xl bg-brand-accent-light border border-brand-accent/20 flex items-center justify-center text-brand-accent">
                        <Code size={18} />
                      </div>
                      <div className="flex items-center gap-1.5">
                        <a
                          href={proj.github}
                          target="_blank"
                          rel="noreferrer"
                          className="p-1.5 rounded-lg border border-brand-border text-brand-text-secondary hover:text-brand-text-primary hover:bg-brand-bg transition-colors"
                        >
                          <Github size={14} />
                        </a>
                        <a
                          href={proj.live}
                          target="_blank"
                          rel="noreferrer"
                          className="p-1.5 rounded-lg border border-brand-border text-brand-text-secondary hover:text-brand-text-primary hover:bg-brand-bg transition-colors"
                        >
                          <Globe size={14} />
                        </a>
                      </div>
                    </div>
                    <h4 className="font-bold text-base text-brand-text-primary mt-4">{proj.title}</h4>
                    <p className="text-xs text-brand-text-secondary leading-relaxed mt-2">
                      {proj.description}
                    </p>
                  </div>
                  {proj.tech.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {proj.tech.map((t) => (
                        <span
                          key={t}
                          className="px-2 py-0.5 rounded bg-brand-bg text-[10px] border border-brand-border/60 text-brand-text-muted"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

      </div>

      <footer className="py-8 text-center text-[10px] text-brand-text-muted border-t border-brand-border/40 mt-12">
        <span>Public Portfolio powered by ReadyUp 2.0 Placement Tracker</span>
      </footer>
    </div>
  );
}
