import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getAnalytics, isSupported } from 'firebase/analytics';
import { env } from './env';

const firebaseConfig = {
  apiKey: env.firebase.apiKey || 'AIzaSyByjWIGx6KvOUQHbW5w3jxkwL9sMP1B9_0',
  authDomain: env.firebase.authDomain || 'arca-budgeting.firebaseapp.com',
  projectId: env.firebase.projectId || 'arca-budgeting',
  storageBucket: env.firebase.storageBucket || 'arca-budgeting.firebasestorage.app',
  messagingSenderId: env.firebase.messagingSenderId || '127464127687',
  appId: env.firebase.appId || '1:127464127687:web:99d6d733675c3d410f92e2',
  measurementId: env.firebase.measurementId || 'G-1KDBCK65VF'
};

console.log("Firebase config loaded:", firebaseConfig);

// Initialize Firebase
let app = null;
let auth = null;
let db = null;
let analytics = null;

if (firebaseConfig.apiKey) {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);

  if (typeof window !== 'undefined') {
    isSupported().then((supported) => {
      if (supported) {
        analytics = getAnalytics(app);
      }
    }).catch((err) => console.warn('Firebase Analytics check error:', err));
  }
}

export { app, auth, db, analytics };
