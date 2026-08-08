import { useState } from 'react';
import { Search, Sparkles, BookOpen, ExternalLink, AlertCircle } from 'lucide-react';
import { getSkillResourcesFromGemini } from '../../services/gemini';

export default function GeminiAssistant() {
  const [skill, setSkill] = useState('');
  const [loading, setLoading] = useState(false);
  const [resources, setResources] = useState([]);
  const [error, setError] = useState('');

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!skill.trim()) return;

    setLoading(true);
    setError('');
    setResources([]);

    try {
      const data = await getSkillResourcesFromGemini(skill.trim());
      setResources(data.resources || []);
    } catch (err) {
      console.error('Skill assistant search error:', err);
      setError('Failed to fetch skill resources. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Banner */}
      <div className="relative overflow-hidden p-8 rounded-3xl bg-gradient-to-r from-emerald-950/20 to-brand-card/50 border border-brand-border/60">
        <div className="absolute top-0 right-0 w-80 h-full bg-brand-accent/10 blur-3xl rounded-full pointer-events-none"></div>
        <div className="space-y-2">
          <div className="inline-flex items-center gap-1.5 bg-brand-accent-light px-3 py-1 rounded-full border border-brand-accent/20">
            <Sparkles size={14} className="text-brand-accent" />
            <span className="text-xs font-bold text-brand-accent uppercase tracking-wider">AI Skill Guide</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Gemini Skill Assistant</h1>
          <p className="text-sm text-brand-text-secondary max-w-xl">
            Enter any programming language, framework, or skill name. Gemini will fetch a curated list of entirely free, high-quality resources to learn it.
          </p>
        </div>
      </div>

      {/* Search Input Card */}
      <div className="glass-card p-6 rounded-3xl">
        <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-brand-text-muted" size={18} />
            <input
              type="text"
              value={skill}
              onChange={(e) => setSkill(e.target.value)}
              placeholder="e.g. Docker, TypeScript, React Query, System Design..."
              className="w-full pl-11 pr-4 py-3.5 bg-brand-bg/50 border border-brand-border rounded-2xl text-sm focus:outline-none focus:border-brand-accent transition-colors text-brand-text-primary"
              required
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-3.5 rounded-2xl bg-brand-accent text-brand-bg font-bold text-sm hover:bg-brand-accent-hover transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-brand-accent/10 disabled:opacity-50"
          >
            {loading ? (
              <div className="w-5 h-5 rounded-full border-2 border-brand-bg/20 border-t-brand-bg animate-spin"></div>
            ) : (
              <>
                <Sparkles size={16} />
                <span>Search Resources</span>
              </>
            )}
          </button>
        </form>
      </div>

      {error && (
        <div className="flex items-center gap-3 bg-red-950/20 text-red-400 border border-red-900/50 p-4 rounded-2xl text-xs">
          <AlertCircle size={16} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Loading Skeleton */}
      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="glass-card p-6 rounded-3xl space-y-4">
              <div className="w-10 h-10 rounded-xl skeleton"></div>
              <div className="h-4 w-3/4 rounded skeleton"></div>
              <div className="space-y-2">
                <div className="h-3 w-full rounded skeleton"></div>
                <div className="h-3 w-5/6 rounded skeleton"></div>
              </div>
              <div className="h-8 w-1/3 rounded-lg skeleton"></div>
            </div>
          ))}
        </div>
      )}

      {/* Results */}
      {!loading && resources.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-fade-in">
          {resources.map((res, index) => (
            <div
              key={index}
              className="glass-card p-6 rounded-3xl flex flex-col justify-between hover:border-brand-border/90 hover:bg-brand-card/90 transition-all duration-300"
            >
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="w-10 h-10 rounded-xl bg-brand-accent-light border border-brand-accent/20 flex items-center justify-center text-brand-accent">
                    <BookOpen size={20} />
                  </div>
                  <span className="text-[10px] uppercase font-bold text-brand-text-muted bg-brand-bg px-2 py-0.5 rounded-md border border-brand-border">
                    {res.type}
                  </span>
                </div>

                <h3 className="text-base font-bold text-brand-text-primary">{res.title}</h3>
                <p className="text-xs text-brand-text-secondary mt-3 leading-relaxed">
                  {res.description}
                </p>
              </div>

              <a
                href={res.url}
                target="_blank"
                rel="noreferrer"
                className="mt-6 inline-flex items-center gap-1.5 text-xs font-bold text-brand-accent hover:underline w-fit"
              >
                <span>Visit Resource</span>
                <ExternalLink size={12} />
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
