import { useState, useEffect } from 'react';
import { Code, ExternalLink, Plus, X } from 'lucide-react';
import { Github } from '../../components/common/Icons';
import { db } from '../../firebase';
import { collection, query, where, onSnapshot, addDoc } from 'firebase/firestore';
import { useAuth } from '../../context/AuthContext';
import { logProjectAdded } from '../../services/activityLog';

export default function Projects() {
  const { user } = useAuth();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);

  const [showAddModal, setShowAddModal] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [githubUrl, setGithubUrl] = useState('');
  const [liveUrl, setLiveUrl] = useState('');
  const [techStackInput, setTechStackInput] = useState('');

  // Fetch projects from Firestore in real-time
  useEffect(() => {
    if (!user?.uid) {
      setProjects([]);
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, 'projects'),
      where('studentId', '==', user.uid)
    );

    const unsubscribe = onSnapshot(q,
      (snapshot) => {
        const list = [];
        snapshot.forEach((doc) => {
          list.push({ id: doc.id, ...doc.data() });
        });
        setProjects(list);
        setLoading(false);
      },
      (err) => {
        console.error('Failed to sync projects from Firestore:', err);
        setProjects([]);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user?.uid]);

  const handleAddProject = async (e) => {
    e.preventDefault();
    if (!title || !description) return;

    const newProject = {
      title: title.trim(),
      description: description.trim(),
      techStack: techStackInput.split(',').map((tag) => tag.trim()).filter(Boolean),
      githubUrl: githubUrl.trim() || '#',
      liveUrl: liveUrl.trim() || '#',
    };

    if (user?.uid) {
      try {
        const docRef = await addDoc(collection(db, 'projects'), {
          ...newProject,
          studentId: user.uid,
          createdAt: new Date().toISOString()
        });
        await logProjectAdded(user.uid, title.trim(), docRef.id);
      } catch (err) {
        console.error('Failed to add project to Firestore:', err);
      }
    }

    setShowAddModal(false);
    
    // Reset Form
    setTitle('');
    setDescription('');
    setGithubUrl('');
    setLiveUrl('');
    setTechStackInput('');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Portfolio Projects</h1>
          <p className="text-sm text-brand-text-secondary mt-1">
            Display your coding projects. Mentors can view this portfolio to evaluate placement readiness.
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand-accent text-brand-bg font-bold text-sm hover:bg-brand-accent-hover transition-all cursor-pointer shadow-lg shadow-brand-accent/20"
        >
          <Plus size={16} />
          <span>Add Project</span>
        </button>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="min-h-[30vh] flex flex-col items-center justify-center">
          <div className="w-10 h-10 rounded-full border-4 border-brand-accent/20 border-t-brand-accent animate-spin mb-3"></div>
          <p className="text-brand-text-secondary text-xs">Syncing Projects...</p>
        </div>
      ) : projects.length === 0 ? (
        <div className="text-center py-12 glass-card rounded-3xl border border-brand-border/60">
          <p className="text-sm text-brand-text-secondary">No projects added yet. Click 'Add Project' to showcase your work!</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {projects.map((project) => (
            <div
              key={project.id}
              className="glass-card p-6 rounded-3xl flex flex-col justify-between hover:border-brand-border/90 hover:bg-brand-card/90 transition-all duration-300 group"
            >
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="w-10 h-10 rounded-xl bg-brand-accent-light border border-brand-accent/20 flex items-center justify-center text-brand-accent">
                    <Code size={20} />
                  </div>
                  <div className="flex items-center gap-2">
                    <a
                      href={project.githubUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="p-2 text-brand-text-secondary hover:text-brand-text-primary hover:bg-brand-bg rounded-lg border border-transparent hover:border-brand-border transition-all"
                    >
                      <Github size={16} />
                    </a>
                    <a
                      href={project.liveUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="p-2 text-brand-text-secondary hover:text-brand-text-primary hover:bg-brand-bg rounded-lg border border-transparent hover:border-brand-border transition-all"
                    >
                      <ExternalLink size={16} />
                    </a>
                  </div>
                </div>

                <h3 className="text-lg font-bold text-brand-text-primary group-hover:text-brand-accent transition-colors">
                  {project.title}
                </h3>
                <p className="text-sm text-brand-text-secondary mt-3 leading-relaxed">
                  {project.description}
                </p>
              </div>

              <div className="flex flex-wrap gap-1.5 mt-6">
                {project.techStack.map((tech) => (
                  <span
                    key={tech}
                    className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-brand-bg text-brand-text-secondary border border-brand-border"
                  >
                    {tech}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Project Modal Overlay */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="w-full max-w-lg bg-brand-card border border-brand-border p-8 rounded-3xl relative">
            <button
              onClick={() => setShowAddModal(false)}
              className="absolute top-4 right-4 text-brand-text-secondary hover:text-brand-text-primary"
            >
              <X size={20} />
            </button>
            <h3 className="text-xl font-bold text-brand-text-primary mb-6">Add New Project</h3>

            <form onSubmit={handleAddProject} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-brand-text-secondary uppercase">Project Title</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-4 py-2.5 bg-brand-bg/50 border border-brand-border rounded-xl text-sm focus:outline-none focus:border-brand-accent transition-colors"
                  placeholder="e.g. Portfolio Builder"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-brand-text-secondary uppercase">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-4 py-2.5 bg-brand-bg/50 border border-brand-border rounded-xl text-sm focus:outline-none focus:border-brand-accent transition-colors h-24"
                  placeholder="Describe your project, main architecture and problem solved..."
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-brand-text-secondary uppercase">GitHub URL</label>
                  <input
                    type="url"
                    value={githubUrl}
                    onChange={(e) => setGithubUrl(e.target.value)}
                    className="w-full px-4 py-2.5 bg-brand-bg/50 border border-brand-border rounded-xl text-sm focus:outline-none focus:border-brand-accent transition-colors"
                    placeholder="https://github.com/..."
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-brand-text-secondary uppercase">Live URL</label>
                  <input
                    type="url"
                    value={liveUrl}
                    onChange={(e) => setLiveUrl(e.target.value)}
                    className="w-full px-4 py-2.5 bg-brand-bg/50 border border-brand-border rounded-xl text-sm focus:outline-none focus:border-brand-accent transition-colors"
                    placeholder="https://..."
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-brand-text-secondary uppercase">Tech Stack (comma separated)</label>
                <input
                  type="text"
                  value={techStackInput}
                  onChange={(e) => setTechStackInput(e.target.value)}
                  className="w-full px-4 py-2.5 bg-brand-bg/50 border border-brand-border rounded-xl text-sm focus:outline-none focus:border-brand-accent transition-colors"
                  placeholder="React, Firebase, Tailwind"
                />
              </div>

              <button
                type="submit"
                className="w-full py-3 rounded-xl bg-brand-accent text-brand-bg font-bold text-sm hover:bg-brand-accent-hover transition-all mt-4 cursor-pointer"
              >
                Save Project
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
