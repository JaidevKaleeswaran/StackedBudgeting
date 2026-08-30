import { createContext, useContext, useState, useEffect } from 'react';
import { auth } from '../config/firebase';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  GoogleAuthProvider,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  sendEmailVerification,
  updateProfile
} from 'firebase/auth';

const AuthContext = createContext();

const STORAGE_KEY = 'arca_user_session';
const LEGACY_STORAGE_KEY = 'stacked_user_session';

function formatAuthError(error) {
  if (!error) return new Error('Authentication failed. Please try again.');
  
  switch (error.code) {
    case 'auth/unauthorized-continue-uri':
      return new Error(`The domain (${window.location.origin}) is not allowlisted as a return URL in Firebase Console. Please add it to Firebase Console -> Authentication -> Settings -> Authorized domains.`);
    case 'auth/operation-not-allowed':
      return new Error('Google Sign-in is not enabled in your Firebase Console project. Please enable Google Auth under Firebase Console -> Authentication -> Sign-in method.');
    case 'auth/unauthorized-domain':
      return new Error(`This domain (${window.location.hostname}) is not authorized for Google Sign-in. Please add it to Firebase Console -> Authentication -> Settings -> Authorized domains.`);
    case 'auth/popup-blocked':
      return new Error('Sign-in popup was blocked by your browser. Please allow popups or try again.');
    case 'auth/popup-closed-by-user':
      return new Error('Sign-in window was closed before completing authentication.');
    case 'auth/cancelled-popup-request':
      return new Error('Sign-in request was cancelled. Please try again.');
    case 'auth/network-request-failed':
      return new Error('Network error during Google Sign-in. Please check your internet connection.');
    case 'auth/too-many-requests':
      return new Error('Too many requests. Please wait a moment before trying again.');
    case 'auth/invalid-api-key':
    case 'auth/api-key-not-valid-please-pass-a-valid-api-key':
      return new Error('Invalid Firebase API Key. Please check your .env.local configuration.');
    default:
      return new Error(error.message || 'Authentication failed. Please try again.');
  }
}

const safeSendEmailVerification = async (firebaseUser) => {
  if (!firebaseUser) return;
  try {
    const actionCodeSettings = {
      url: window.location.origin,
      handleCodeInApp: true,
    };
    await sendEmailVerification(firebaseUser, actionCodeSettings);
  } catch (err) {
    if (
      err.code === 'auth/unauthorized-continue-uri' ||
      err.code === 'auth/invalid-continue-uri' ||
      err.message?.includes('unauthorized-continue-uri')
    ) {
      console.warn(`Custom continue URI (${window.location.origin}) not allowlisted in Firebase Console. Falling back to default Firebase verification URL...`);
      await sendEmailVerification(firebaseUser);
    } else {
      throw err;
    }
  }
};

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
      // Check for Google redirect result on page load
      getRedirectResult(auth)
        .then((result) => {
          if (result && result.user) {
            const userData = {
              uid: result.user.uid,
              email: result.user.email,
              displayName: result.user.displayName || (result.user.email ? result.user.email.split('@')[0] : 'Google User'),
              photoURL: result.user.photoURL || null,
              emailVerified: result.user.emailVerified,
              isGuest: false,
            };
            setUser(userData);
            try {
              localStorage.setItem(STORAGE_KEY, JSON.stringify(userData));
            } catch (e) { }
          }
        })
        .catch((err) => {
          console.error('Firebase getRedirectResult error:', err);
        });

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
          await safeSendEmailVerification(cred.user);
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

      // Send verification/activation email to user safely
      try {
        await safeSendEmailVerification(cred.user);
      } catch (e) {
        console.error('Failed to send verification email:', e);
        throw formatAuthError(e);
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
      try {
        const cred = await signInWithPopup(auth, provider);
        const userData = {
          uid: cred.user.uid,
          email: cred.user.email,
          displayName: cred.user.displayName || (cred.user.email ? cred.user.email.split('@')[0] : 'Google User'),
          photoURL: cred.user.photoURL || null,
          emailVerified: cred.user.emailVerified,
          isGuest: false,
        };
        setUser(userData);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(userData));
        return userData;
      } catch (popupError) {
        console.warn('Google Popup auth failed/blocked, checking fallback:', popupError.code, popupError.message);
        
        // If popup was blocked or closed by popup policy, fall back to redirect sign-in
        if (
          popupError.code === 'auth/popup-blocked' ||
          popupError.code === 'auth/popup-closed-by-user' ||
          popupError.code === 'auth/cancelled-popup-request'
        ) {
          try {
            await signInWithRedirect(auth, provider);
            return { redirecting: true };
          } catch (redirectError) {
            console.error('Google Redirect auth error:', redirectError);
            throw formatAuthError(redirectError);
          }
        }
        
        throw formatAuthError(popupError);
      }
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
      try {
        await safeSendEmailVerification(auth.currentUser);
      } catch (e) {
        console.error('Failed to resend verification email:', e);
        throw formatAuthError(e);
      }
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
