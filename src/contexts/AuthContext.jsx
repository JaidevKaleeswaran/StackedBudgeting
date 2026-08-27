import { createContext, useContext, useState, useEffect } from 'react';
import { auth } from '../config/firebase';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  sendEmailVerification,
  updateProfile
} from 'firebase/auth';

const AuthContext = createContext();

const STORAGE_KEY = 'arca_user_session';
const LEGACY_STORAGE_KEY = 'stacked_user_session';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY);
      if (saved) return JSON.parse(saved);
      const defaultUser = {
        uid: 'usr_arca_guest',
        email: 'guest@arca.app',
        displayName: 'Guest User',
        photoURL: null,
        emailVerified: true,
        isGuest: true,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(defaultUser));
      return defaultUser;
    } catch (e) {
      return {
        uid: 'usr_arca_guest',
        email: 'guest@arca.app',
        displayName: 'Guest User',
        photoURL: null,
        emailVerified: true,
        isGuest: true,
      };
    }
  });

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (auth) {
      const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
        if (firebaseUser) {
          const userData = {
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            displayName: firebaseUser.displayName || firebaseUser.email.split('@')[0],
            photoURL: firebaseUser.photoURL || null,
            emailVerified: firebaseUser.emailVerified,
            isGuest: false,
          };
          setUser(userData);
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(userData));
          } catch (e) { }
        } else {
          setUser(null);
          try {
            localStorage.removeItem(STORAGE_KEY);
          } catch (e) { }
        }
      });
      return () => unsubscribe();
    }
  }, []);

  const loginWithEmail = async (email, password) => {
    if (auth) {
      const cred = await signInWithEmailAndPassword(auth, email, password);

      // Strict Activation Check: Block user if email is not verified
      if (!cred.user.emailVerified) {
        // Attempt to resend activation link if unverified
        try {
          const actionCodeSettings = {
            url: window.location.origin,
            handleCodeInApp: true,
          };
          await sendEmailVerification(cred.user, actionCodeSettings);
        } catch (e) {
          console.error('Could not auto-resend verification email', e);
        }

        await firebaseSignOut(auth);
        setUser(null);
        localStorage.removeItem(STORAGE_KEY);

        const unverifiedError = new Error('Your account is not activated yet! We have sent an activation link to your email. Please click the link in your email to activate your account before logging in.');
        unverifiedError.code = 'auth/email-not-verified';
        throw unverifiedError;
      }

      const userData = {
        uid: cred.user.uid,
        email: cred.user.email,
        displayName: cred.user.displayName || cred.user.email.split('@')[0],
        photoURL: cred.user.photoURL || null,
        emailVerified: true,
        isGuest: false,
      };
      setUser(userData);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(userData));
      return userData;
    } else {
      const userData = {
        uid: 'user_' + Date.now(),
        email: email,
        displayName: email.split('@')[0],
        photoURL: null,
        emailVerified: true,
        isGuest: false,
      };
      setUser(userData);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(userData));
      return userData;
    }
  };

  const signupWithEmail = async (email, password, name) => {
    if (auth) {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      if (name) {
        try {
          await updateProfile(cred.user, { displayName: name });
        } catch (e) {
          console.error('Failed to update profile name', e);
        }
      }

      // Send verification/activation email to user with ActionCodeSettings
      const actionCodeSettings = {
        url: window.location.origin,
        handleCodeInApp: true,
      };

      try {
        await sendEmailVerification(cred.user, actionCodeSettings);
      } catch (e) {
        console.error('Failed to send verification email:', e);
        throw new Error(`Account created, but activation email failed to send: ${e.message}`);
      }

      // Immediately sign out so user cannot access until email activation link is clicked
      await firebaseSignOut(auth);
      setUser(null);
      localStorage.removeItem(STORAGE_KEY);

      return { email, requiresActivation: true };
    } else {
      const userData = {
        uid: 'user_' + Date.now(),
        email: email,
        displayName: name || email.split('@')[0],
        photoURL: null,
        emailVerified: true,
        isGuest: false,
      };
      setUser(userData);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(userData));
      return userData;
    }
  };

  const loginWithGoogle = async () => {
    if (auth) {
      const provider = new GoogleAuthProvider();
      const cred = await signInWithPopup(auth, provider);
      const userData = {
        uid: cred.user.uid,
        email: cred.user.email,
        displayName: cred.user.displayName,
        photoURL: cred.user.photoURL,
        emailVerified: cred.user.emailVerified,
        isGuest: false,
      };
      setUser(userData);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(userData));
      return userData;
    } else {
      const userData = {
        uid: 'google_user_' + Date.now(),
        email: 'john.doe@example.com',
        displayName: 'John Doe (Google)',
        photoURL: 'https://api.dicebear.com/7.x/avataaars/svg?seed=John',
        emailVerified: true,
        isGuest: false,
      };
      setUser(userData);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(userData));
      return userData;
    }
  };

  const loginAsGuest = () => {
    const guestUser = {
      uid: 'guest_' + Date.now(),
      email: 'guest@myvault.app',
      displayName: 'Guest User',
      photoURL: null,
      emailVerified: true,
      isGuest: true,
    };
    setUser(guestUser);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(guestUser));
    return guestUser;
  };

  const resendVerificationEmail = async () => {
    if (auth && auth.currentUser) {
      const actionCodeSettings = {
        url: window.location.origin,
        handleCodeInApp: true,
      };
      await sendEmailVerification(auth.currentUser, actionCodeSettings);
    }
  };


  const refreshUserStatus = async () => {
    if (auth && auth.currentUser) {
      await auth.currentUser.reload();
      const updatedUser = auth.currentUser;
      const userData = {
        uid: updatedUser.uid,
        email: updatedUser.email,
        displayName: updatedUser.displayName || updatedUser.email.split('@')[0],
        photoURL: updatedUser.photoURL || null,
        emailVerified: updatedUser.emailVerified,
        isGuest: false,
      };
      setUser(userData);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(userData));
      return updatedUser.emailVerified;
    }
    return false;
  };

  const logout = async () => {
    if (auth) {
      try {
        await firebaseSignOut(auth);
      } catch (e) {
        console.error('Firebase signout error', e);
      }
    }
    setUser(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.clear();
    } catch (e) { }
  };

  const resetSession = async () => {
    await logout();
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        loginWithEmail,
        signupWithEmail,
        loginWithGoogle,
        loginAsGuest,
        resendVerificationEmail,
        refreshUserStatus,
        logout,
        resetSession,
        isAuthenticated: !!user,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
