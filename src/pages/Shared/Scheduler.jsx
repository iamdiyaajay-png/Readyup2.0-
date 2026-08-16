import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../firebase';
import {
  collection,
  query,
  where,
  addDoc,
  onSnapshot,
  doc,
  getDoc,
  updateDoc
} from 'firebase/firestore';
import { Calendar as CalendarIcon, Clock, User, AlertCircle, ExternalLink } from 'lucide-react';

export default function Scheduler() {
  const { user } = useAuth();
  
  const [interviews, setInterviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [mentorName, setMentorName] = useState('Guide Mentor');

  const [date, setDate] = useState('2026-06-25');
  const [timeSlot, setTimeSlot] = useState('10:00 - 11:00');
  const [type, setType] = useState('Frontend Architecture Mock');
  const [customType, setCustomType] = useState('');
  const [customTimeSlot, setCustomTimeSlot] = useState('');
  const [success, setSuccess] = useState(false);
  const [approvingId, setApprovingId] = useState(null);
  const [customMeetLink, setCustomMeetLink] = useState('');

  // 1. Fetch Student's mentor name dynamically
  useEffect(() => {
    if (user?.role === 'student' && user.mentorId) {
      const fetchMentor = async () => {
        try {
          const docSnap = await getDoc(doc(db, 'users', user.mentorId));
          if (docSnap.exists()) {
            setMentorName(docSnap.data().name || 'Guide Mentor');
          }
        } catch (err) {
          console.error('Error fetching mentor name for scheduler:', err);
        }
      };
      fetchMentor();
    }
  }, [user]);

  // 2. Real-time subscription to interviews based on role
  useEffect(() => {
    if (!user?.uid) {
      Promise.resolve().then(() => {
        setLoading(false);
      });
      return;
    }

    let q = query(
      collection(db, 'mockInterviews'),
      where('studentId', '==', user.uid)
    );

    if (user.role === 'mentor') {
      q = query(
        collection(db, 'mockInterviews'),
        where('mentorId', '==', user.uid)
      );
    } else if (user.role === 'admin') {
      q = collection(db, 'mockInterviews');
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = [];
      snapshot.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...docSnap.data() });
      });
      // Sort chronologically by date
      list.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      setInterviews(list);
      setLoading(false);
    }, (err) => {
      console.error('Failed to sync mock interviews:', err);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!user?.mentorId) {
      alert("You must be assigned a mentor to request mock interviews.");
      return;
    }

    const resolvedType = type === 'Other' ? (customType.trim() || 'Other') : type;
    const resolvedTimeSlot = timeSlot === 'Other' ? (customTimeSlot.trim() || 'Other') : timeSlot;

    const newInt = {
      studentId: user.uid,
      studentName: user.name || user.displayName || 'Student Candidate',
      mentorId: user.mentorId,
      mentorName: mentorName,
      type: resolvedType,
      date,
      timeSlot: resolvedTimeSlot,
      status: 'requested',
      meetLink: '',
      createdAt: new Date().toISOString()
    };

    try {
      await addDoc(collection(db, 'mockInterviews'), newInt);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      console.error('Failed to save mock interview request:', err);
    }
  };

  const handleAction = async (id, newStatus, providedLink = null) => {
    try {
      const interviewRef = doc(db, 'mockInterviews', id);
      const updateData = { status: newStatus };
      
      if (newStatus === 'scheduled') {
        updateData.meetLink = providedLink || '';
      } else {
        updateData.meetLink = '';
      }
      
      await updateDoc(interviewRef, updateData);
      setApprovingId(null);
      setCustomMeetLink('');
    } catch (err) {
      console.error('Failed to update interview status:', err);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center">
        <div className="w-10 h-10 rounded-full border-4 border-brand-accent/25 border-t-brand-accent animate-spin mb-3"></div>
        <p className="text-brand-text-secondary text-xs">Syncing Interview Scheduler...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Mock Interview Scheduler</h1>
        <p className="text-sm text-brand-text-secondary mt-1">
          Coordinate and schedule mock evaluations. Students request interview slots; mentors manage bookings.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Booking Form (Only show for students) */}
        {user?.role === 'student' && (
          <div className="glass-card p-6 rounded-3xl h-fit">
            <h3 className="text-sm font-bold text-brand-text-primary mb-4 flex items-center gap-2">
              <CalendarIcon size={16} className="text-brand-accent" />
              <span>Book Mock Interview</span>
            </h3>

            {success && (
              <div className="mb-4 p-3 rounded-xl bg-brand-accent-light border border-brand-accent/20 text-brand-accent text-xs font-semibold">
                Request sent to your mentor {mentorName}!
              </div>
            )}

            {!user.mentorId ? (
              <p className="text-xs text-brand-text-secondary leading-relaxed bg-brand-bg/50 p-4 rounded-xl border border-brand-border/60">
                You must be assigned a mentor before requesting mock interviews.
              </p>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-semibold text-brand-text-secondary uppercase">Interview Type</label>
                  <select
                    value={type}
                    onChange={(e) => { setType(e.target.value); setCustomType(''); }}
                    className="w-full px-3 py-2.5 bg-brand-bg/50 border border-brand-border rounded-xl text-xs text-brand-text-primary focus:outline-none"
                  >
                    <option value="Frontend Architecture Mock">Frontend Architecture Mock</option>
                    <option value="System Design Mock">System Design Mock</option>
                    <option value="Behavioral & HR Mock">Behavioral & HR Mock</option>
                    <option value="DSA & Algorithms Mock">DSA & Algorithms Mock</option>
                    <option value="Other">Other (Specify Below)</option>
                  </select>

                  {/* Custom type input shown only when 'Other' is selected */}
                  {type === 'Other' && (
                    <div className="mt-3">
                      <label className="text-[10px] font-semibold text-brand-text-secondary uppercase block mb-1">
                        Describe your interview type
                      </label>
                      <textarea
                        value={customType}
                        onChange={(e) => setCustomType(e.target.value)}
                        placeholder="e.g. Full-Stack Project Review, ML System Design, Portfolio Walkthrough…"
                        rows={3}
                        className="w-full px-3 py-2 bg-brand-bg/50 border border-brand-accent/40 rounded-xl text-xs text-brand-text-primary focus:outline-none focus:border-brand-accent transition-colors resize-none"
                        required
                      />
                    </div>
                  )}
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-semibold text-brand-text-secondary uppercase">Date</label>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full px-3 py-2.5 bg-brand-bg/50 border border-brand-border rounded-xl text-xs text-brand-text-primary focus:outline-none focus:border-brand-accent"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-semibold text-brand-text-secondary uppercase">Time Slot</label>
                  <select
                    value={timeSlot}
                    onChange={(e) => { setTimeSlot(e.target.value); setCustomTimeSlot(''); }}
                    className="w-full px-3 py-2.5 bg-brand-bg/50 border border-brand-border rounded-xl text-xs text-brand-text-primary focus:outline-none"
                  >
                    <option value="10:00 - 11:00">10:00 - 11:00 AM</option>
                    <option value="11:30 - 12:30">11:30 AM - 12:30 PM</option>
                    <option value="14:00 - 15:00">02:00 - 03:00 PM</option>
                    <option value="16:00 - 17:00">04:00 - 05:00 PM</option>
                    <option value="Other">Other (Specify Below)</option>
                  </select>

                  {timeSlot === 'Other' && (
                    <div className="mt-3">
                      <label className="text-[10px] font-semibold text-brand-text-secondary uppercase block mb-1">
                        Preferred Time Slot
                      </label>
                      <input
                        type="text"
                        value={customTimeSlot}
                        onChange={(e) => setCustomTimeSlot(e.target.value)}
                        placeholder="e.g. 06:00 PM - 07:00 PM"
                        className="w-full px-3 py-2 bg-brand-bg/50 border border-brand-accent/40 rounded-xl text-xs text-brand-text-primary focus:outline-none focus:border-brand-accent transition-colors"
                        required
                      />
                    </div>
                  )}
                </div>

                <button
                  type="submit"
                  className="w-full py-2.5 rounded-xl bg-brand-accent text-brand-bg font-bold text-xs hover:bg-brand-accent-hover transition-all cursor-pointer shadow-md shadow-brand-accent/15"
                >
                  Request Slot
                </button>
              </form>
            )}
          </div>
        )}

        {/* Schedule List (Spans 2 cols if student, 3 cols if mentor/admin) */}
        <div className={`glass-card p-6 rounded-3xl ${user?.role === 'student' ? 'lg:col-span-2' : 'lg:col-span-3'}`}>
          <h3 className="text-sm font-bold text-brand-text-primary mb-4 flex items-center gap-2">
            <Clock size={16} className="text-brand-accent" />
            <span>Interview Schedule Logs</span>
          </h3>

          <div className="space-y-3">
            {interviews.length === 0 ? (
              <p className="text-xs text-brand-text-muted py-8 text-center">No interviews scheduled yet.</p>
            ) : (
              interviews.map((item) => (
                <div
                  key={item.id}
                  className="p-4 rounded-2xl bg-brand-bg/40 border border-brand-border/60 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h4 className="text-xs font-bold text-brand-text-primary">{item.type}</h4>
                      {item.meetLink && (
                        <a
                          href={item.meetLink}
                          target="_blank"
                          rel="noreferrer"
                          className="px-2 py-0.5 rounded bg-brand-accent-light border border-brand-accent/20 text-brand-accent text-[9px] font-bold flex items-center gap-0.5"
                        >
                          <span>Join Meet</span>
                          <ExternalLink size={8} />
                        </a>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-[10px] text-brand-text-muted">
                      <span>Date: {item.date}</span>
                      <span>Slot: {item.timeSlot}</span>
                      <span className="flex items-center gap-1">
                        <User size={10} />
                        {user?.role === 'student' ? `Mentor: ${item.mentorName}` : `Student: ${item.studentName}`}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Status Display */}
                    {item.status === 'scheduled' && (
                      <span className="px-2.5 py-1 rounded-lg bg-brand-accent-light text-brand-accent text-[10px] font-bold border border-brand-accent/20">
                        Scheduled
                      </span>
                    )}

                    {item.status === 'declined' && (
                      <span className="px-2.5 py-1 rounded-lg bg-red-950/20 text-red-400 text-[10px] font-bold border border-red-900/30">
                        Declined
                      </span>
                    )}

                    {item.status === 'requested' && (
                      <>
                        {user?.role === 'mentor' || user?.role === 'admin' ? (
                          approvingId === item.id ? (
                            <div className="flex items-center gap-2">
                              <input 
                                type="text"
                                placeholder="Meeting link or ID..."
                                value={customMeetLink}
                                onChange={(e) => setCustomMeetLink(e.target.value)}
                                className="px-2 py-1 text-[10px] bg-brand-bg/50 border border-brand-border rounded focus:outline-none focus:border-brand-accent w-48 text-brand-text-primary placeholder:text-brand-text-muted"
                              />
                              <button
                                onClick={() => handleAction(item.id, 'scheduled', customMeetLink.trim())}
                                className="px-2.5 py-1 rounded-lg bg-brand-accent text-brand-bg text-[10px] font-bold hover:bg-brand-accent-hover transition-colors cursor-pointer"
                              >
                                Confirm
                              </button>
                              <button
                                onClick={() => { setApprovingId(null); setCustomMeetLink(''); }}
                                className="px-2.5 py-1 rounded-lg border border-brand-border text-brand-text-secondary text-[10px] font-bold hover:bg-brand-border/40 transition-colors cursor-pointer"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() => { setApprovingId(item.id); setCustomMeetLink(''); }}
                                className="px-2.5 py-1 rounded-lg bg-brand-accent text-brand-bg text-[10px] font-bold hover:bg-brand-accent-hover transition-colors cursor-pointer"
                              >
                                Approve
                              </button>
                              <button
                                onClick={() => handleAction(item.id, 'declined')}
                                className="px-2.5 py-1 rounded-lg border border-brand-border text-brand-text-secondary text-[10px] font-bold hover:bg-red-950/20 hover:text-red-400 transition-all cursor-pointer"
                              >
                                Decline
                              </button>
                            </div>
                          )
                        ) : (
                          <span className="px-2.5 py-1 rounded-lg bg-brand-border/40 text-brand-text-secondary text-[10px] font-bold flex items-center gap-1 border border-brand-border">
                            <AlertCircle size={10} />
                            Requested
                          </span>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
