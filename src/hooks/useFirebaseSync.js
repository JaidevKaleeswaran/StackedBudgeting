import { useEffect, useState, useRef } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../contexts/AuthContext';
import { useBudget } from '../contexts/BudgetContext';

export function useFirebaseSync() {
  const { user } = useAuth();
  const {
    transactions,
    categories,
    incomeSources,
    cycleStartDate,
    cycleFrequency,
    voiceLogs,
    chatMessages,
    dispatch
  } = useBudget();

  const [isHydrated, setIsHydrated] = useState(false);
  const isLocalUpdateRef = useRef(false);
  const saveTimeoutRef = useRef(null);

  // Store current active user id in localStorage for session restoration
  useEffect(() => {
    if (user && user.uid) {
      try {
        localStorage.setItem('arca_last_active_user', user.uid);
      } catch (e) { }
    } else {
      try {
        localStorage.removeItem('arca_last_active_user');
      } catch (e) { }
    }
  }, [user?.uid]);

  // 1. Realtime Firestore listener: Sync data from Firestore to local state across all devices
  useEffect(() => {
    if (!user || user.isGuest || !db) {
      setIsHydrated(true);
      return;
    }

    setIsHydrated(false);
    const docRef = doc(db, 'users', user.uid, 'budgetData', 'main');

    // Subscribe to realtime updates from Firestore
    const unsubscribe = onSnapshot(
      docRef,
      async (docSnap) => {
        if (docSnap.exists()) {
          const remoteData = docSnap.data();
          // If update came from server (another device or remote update), hydrate local state
          if (!isLocalUpdateRef.current) {
            dispatch({ type: 'SET_FULL_STATE', payload: remoteData });
          }
        } else {
          // If no document exists in Firestore yet for this logged in user, initialize Firestore doc from current state
          try {
            const initialState = {
              transactions: transactions || [],
              categories: categories || [],
              incomeSources: incomeSources || [],
              cycleStartDate: cycleStartDate || null,
              cycleFrequency: cycleFrequency || 'monthly',
              voiceLogs: voiceLogs || [],
              chatMessages: chatMessages || [],
              updatedAt: new Date().toISOString(),
            };
            isLocalUpdateRef.current = true;
            await setDoc(docRef, initialState, { merge: true });
            console.log("Initialized new Firestore budget document for user:", user.uid);
          } catch (e) {
            console.error("Error creating initial Firestore budget document:", e);
          }
        }
        setIsHydrated(true);
        isLocalUpdateRef.current = false;
      },
      (error) => {
        console.error("Error listening to Firestore budget data:", error);
        setIsHydrated(true);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [user?.uid, dispatch]);

  // Reset state on signout
  useEffect(() => {
    if (!user) {
      dispatch({ type: 'RESET_STATE' });
    }
  }, [user, dispatch]);

  // 2. Sync local changes back to Firestore (debounced + immediate flush on unmount)
  useEffect(() => {
    if (!isHydrated || !user || user.isGuest || !db) return;

    const stateToSave = {
      transactions,
      categories,
      incomeSources,
      cycleStartDate,
      cycleFrequency,
      voiceLogs: voiceLogs || [],
      chatMessages: chatMessages || [],
      updatedAt: new Date().toISOString(),
    };

    // Helper to perform the save to Firestore
    const performSave = async () => {
      try {
        isLocalUpdateRef.current = true;
        const docRef = doc(db, 'users', user.uid, 'budgetData', 'main');
        await setDoc(docRef, stateToSave, { merge: true });
        console.log("Budget data synced to Firestore across devices.");
      } catch (error) {
        console.error("Error syncing budget data to Firestore:", error);
      }
    };

    // Debounce save by 500ms
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(performSave, 500);

    // Flush pending save immediately on unmount or before user logs out
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        performSave();
      }
    };
  }, [
    transactions,
    categories,
    incomeSources,
    cycleStartDate,
    cycleFrequency,
    voiceLogs,
    chatMessages,
    user,
    isHydrated
  ]);
}
