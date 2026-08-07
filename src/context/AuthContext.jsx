/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useEffect } from 'react';
import { auth, db, googleProvider } from '../firebase';
import { signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, onSnapshot } from 'firebase/firestore';
import { encryptData, decryptData } from '../services/encryption';
import { initPresence } from '../services/presenceService';

const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

/**
 * Merges a Firestore user document with its decrypted profile fields.
 * Fields stored in plain text (role, status, uid, etc.) are preserved as-is.
 * Fields in encryptedDetails (college, skills, etc.) are decrypted and merged in.
 * Fields in encryptedProfile (name, email, photoURL) are also decrypted and merged.
 */
function mergeDecryptedUser(docData) {
  if (!docData) return docData;

  // Start with an empty base — we'll build priority bottom-up
  let merged = {};

  // 1. Decrypt the PII envelope (name, email, photoURL from initial Google sign-in)
  //    This is the lowest priority — it's just the fallback if nothing else is set.
  if (docData.encryptedProfile) {
    const profileData = decryptData(docData.encryptedProfile);
    if (profileData) {
      merged = { ...merged, ...profileData };
    }
  }

  // 2. Decrypt the onboarding details (college, branch, skills, etc.)
  if (docData.encryptedDetails) {
    const details = decryptData(docData.encryptedDetails);
    if (details) {
      merged = { ...merged, ...details };
    }
  }

  // 3. Plain-text Firestore fields take HIGHEST priority.
  //    This ensures that when the user edits their name (or any other field)
  //    in the Profile page and saves it as plain text, it is never overwritten
  //    by the encrypted Google account name from encryptedProfile.
  merged = { ...merged, ...docData };

  return merged;
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubscribeSnapshot = null;

    const unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      // Clean up previous snapshot listener if it exists
      if (unsubscribeSnapshot) {
        unsubscribeSnapshot();
        unsubscribeSnapshot = null;
      }

      if (firebaseUser) {
        setLoading(true);
        const userRef = doc(db, 'users', firebaseUser.uid);

        try {
          // Fetch system/settings document to check for admin emails
          const settingsRef = doc(db, 'system', 'settings');
          let adminEmails = [];

          try {
            let settingsSnap = await getDoc(settingsRef);
            if (settingsSnap.exists()) {
              adminEmails = settingsSnap.data().adminEmails || [];
            } else {
              // Bootstrap: use env-defined admin email on first run
              const defaultAdmin = import.meta.env.VITE_ADMIN_EMAIL || 'iamdiyaajay@gmail.com';
              adminEmails = [defaultAdmin];
              await setDoc(settingsRef, { adminEmails });
            }
          } catch (settingsErr) {
            console.warn('Failed to read/write system settings, using fallback admin check:', settingsErr);
            adminEmails = [import.meta.env.VITE_ADMIN_EMAIL || 'iamdiyaajay@gmail.com'];
          }

          const isAdmin = adminEmails.includes(firebaseUser.email);
          let userSnap = null;
          try {
            userSnap = await getDoc(userRef);
          } catch (readDocErr) {
            console.warn('Failed to read user doc from Firestore. It may not exist yet or permissions are restricted.', readDocErr);
          }

          if (isAdmin) {
            if (!userSnap || !userSnap.exists()) {
              // Encrypt PII fields for admin too
              const encryptedProfile = encryptData({
                name: firebaseUser.displayName || 'Admin User',
                email: firebaseUser.email,
                photoURL: firebaseUser.photoURL || '',
              });
              await setDoc(userRef, {
                uid: firebaseUser.uid,
                encryptedProfile,            // encrypted PII
                role: 'admin',
                status: 'approved',
                createdAt: new Date().toISOString(),
                lastActivity: new Date().toISOString(),
                profileCompletion: 100,
                readinessScore: 0,
                mentorAssigned: false
              });
            } else if (userSnap.data().role !== 'admin') {
              await updateDoc(userRef, { role: 'admin', status: 'approved' });
            }
          } else {
            // If user doc doesn't exist, create it with pending role
            if (!userSnap || !userSnap.exists()) {
              // Read intendedRole from sessionStorage (set by Login.jsx / SignUp.jsx before OAuth)
              const intendedRole = sessionStorage.getItem('intendedRole') || 'student';

              // Encrypt PII before storing in Firestore
              const encryptedProfile = encryptData({
                name: firebaseUser.displayName || 'Anonymous',
                email: firebaseUser.email,
                photoURL: firebaseUser.photoURL || '',
              });

              await setDoc(userRef, {
                uid: firebaseUser.uid,
                encryptedProfile,            // encrypted PII — name/email/photo
                role: 'pending',
                status: 'pending',
                intendedRole,                // stored so Onboarding can pre-select the tab
                createdAt: new Date().toISOString(),
                profileCompletion: 0,
                readinessScore: 0,
                mentorAssigned: false,
                lastActivity: new Date().toISOString()
              });
            }
          }
        } catch (err) {
          console.error('Error handling Firestore user initialization:', err);
        }

        // Start listening to the Firestore user document in real-time
        const fallbackUser = {
          uid: firebaseUser.uid,
          name: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'Google User',
          email: firebaseUser.email,
          photoURL: firebaseUser.photoURL || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80',
          role: (firebaseUser.email === 'admin@readyup.com' || firebaseUser.email?.includes('admin')) ? 'admin' : 'student',
          status: 'approved', // auto-approve in fallback mode so they can view dashboards
          isFallback: true
        };

        unsubscribeSnapshot = onSnapshot(
          userRef,
          (docSnap) => {
            if (docSnap.exists()) {
              // Decrypt encrypted fields and merge into the user object
              const merged = mergeDecryptedUser(docSnap.data());
              setUser(merged);
              // Initialise RTDB presence — marks user online and registers onDisconnect
              initPresence(firebaseUser.uid, merged.photoURL || firebaseUser.photoURL || '');
            } else {
              console.warn('User document does not exist on Firestore. Providing local fallback session.');
              setUser(fallbackUser);
              initPresence(firebaseUser.uid, firebaseUser.photoURL || '');
            }
            setLoading(false);
          },
          (error) => {
            console.error('User snapshot listener error (restricted permissions). Providing local fallback session:', error);
            setUser(fallbackUser);
            initPresence(firebaseUser.uid, firebaseUser.photoURL || '');
            setLoading(false);
          }
        );
      } else {
        setUser(null);
        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeSnapshot) unsubscribeSnapshot();
    };
  }, []);

  const loginWithGoogle = async (intendedRole = 'student') => {
    setLoading(true);
    // Persist the role so onAuthStateChanged can read it after the OAuth redirect
    if (intendedRole && intendedRole !== 'returning') {
      sessionStorage.setItem('intendedRole', intendedRole);
    }
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      console.error('Google Sign-In failed:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    setLoading(true);
    try {
      await signOut(auth);
      setUser(null);
    } catch (err) {
      console.error('Sign out failed:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, loginWithGoogle, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
