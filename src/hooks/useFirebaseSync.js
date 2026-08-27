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
      (docSnap) => {
        if (docSnap.exists()) {
          const remoteData = docSnap.data();
          // If update came from server (another device), hydrate local state
          if (!isLocalUpdateRef.current) {
            dispatch({ type: 'SET_FULL_STATE', payload: remoteData });
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

    // Debounce save by 800ms
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(performSave, 800);

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
