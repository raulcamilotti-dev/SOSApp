/**
 * GuidedTourContext — State management for the in-app guided tour.
 *
 * Controls tour activation, current step, navigation between steps,
 * and read-only mode (prevents data modification during the tour).
 *
 * Usage:
 *   const { isActive, currentStep, next, prev, stop } = useGuidedTour();
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import {
    createContext,
    useCallback,
    useContext,
    useMemo,
    useState,
    type ReactNode,
} from "react";

import { TOUR_STEPS, type TourStep } from "@/core/tour/tour-steps";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface GuidedTourState {
  /** Whether the tour is currently running */
  isActive: boolean;
  /** Whether the app is in read-only demo mode (prevents writes) */
  isReadOnly: boolean;
  /** Current step index (0-based) */
  stepIndex: number;
  /** Current step definition */
  currentStep: TourStep | null;
  /** Total number of steps */
  totalSteps: number;
  /** Progress ratio (0..1) */
  progress: number;
  /** Start the guided tour */
  start: () => void;
  /** Stop the tour and return to normal mode */
  stop: () => void;
  /** Advance to next step (auto-navigates) */
  next: () => void;
  /** Go back to previous step (auto-navigates) */
  prev: () => void;
  /** Jump to a specific step */
  goToStep: (index: number) => void;
  /** Whether tour has been completed at least once (persisted) */
  hasCompleted: boolean;
  /** Mark tour as completed */
  markCompleted: () => void;
}

const STORAGE_KEY = "@sos_guided_tour_completed";

/* ------------------------------------------------------------------ */
/*  Context                                                            */
/* ------------------------------------------------------------------ */

const GuidedTourContext = createContext<GuidedTourState | null>(null);

/* ------------------------------------------------------------------ */
/*  Provider                                                           */
/* ------------------------------------------------------------------ */

export function GuidedTourProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [isActive, setIsActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [hasCompleted, setHasCompleted] = useState(false);

  const totalSteps = TOUR_STEPS.length;
  const currentStep = isActive ? (TOUR_STEPS[stepIndex] ?? null) : null;
  const progress = totalSteps > 0 ? (stepIndex + 1) / totalSteps : 0;

  const navigateToStep = useCallback(
    (index: number) => {
      const step = TOUR_STEPS[index];
      if (!step) return;
      try {
        router.push(step.route as any);
      } catch {
        // Fallback — some routes may not be available
      }
    },
    [router],
  );

  const start = useCallback(() => {
    setStepIndex(0);
    setIsActive(true);
    // Navigate to first step
    const first = TOUR_STEPS[0];
    if (first) {
      try {
        router.push(first.route as any);
      } catch {
        // ignore
      }
    }
  }, [router]);

  const stop = useCallback(() => {
    setIsActive(false);
    setStepIndex(0);
  }, []);

  const next = useCallback(() => {
    if (stepIndex >= totalSteps - 1) {
      // Tour completed
      stop();
      return;
    }
    const nextIndex = stepIndex + 1;
    setStepIndex(nextIndex);
    navigateToStep(nextIndex);
  }, [stepIndex, totalSteps, stop, navigateToStep]);

  const prev = useCallback(() => {
    if (stepIndex <= 0) return;
    const prevIndex = stepIndex - 1;
    setStepIndex(prevIndex);
    navigateToStep(prevIndex);
  }, [stepIndex, navigateToStep]);

  const goToStep = useCallback(
    (index: number) => {
      if (index < 0 || index >= totalSteps) return;
      setStepIndex(index);
      navigateToStep(index);
    },
    [totalSteps, navigateToStep],
  );

  const markCompleted = useCallback(async () => {
    setHasCompleted(true);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, "true");
    } catch {
      // ignore storage errors
    }
  }, []);

  const value = useMemo<GuidedTourState>(
    () => ({
      isActive,
      isReadOnly: isActive, // While tour is active, app is read-only
      stepIndex,
      currentStep,
      totalSteps,
      progress,
      start,
      stop,
      next,
      prev,
      goToStep,
      hasCompleted,
      markCompleted,
    }),
    [
      isActive,
      stepIndex,
      currentStep,
      totalSteps,
      progress,
      start,
      stop,
      next,
      prev,
      goToStep,
      hasCompleted,
      markCompleted,
    ],
  );

  return (
    <GuidedTourContext.Provider value={value}>
      {children}
    </GuidedTourContext.Provider>
  );
}

/* ------------------------------------------------------------------ */
/*  Hook                                                               */
/* ------------------------------------------------------------------ */

export function useGuidedTour(): GuidedTourState {
  const ctx = useContext(GuidedTourContext);
  if (!ctx) {
    // Return a safe no-op default so components outside the provider don't crash
    return {
      isActive: false,
      isReadOnly: false,
      stepIndex: 0,
      currentStep: null,
      totalSteps: 0,
      progress: 0,
      start: () => {},
      stop: () => {},
      next: () => {},
      prev: () => {},
      goToStep: () => {},
      hasCompleted: false,
      markCompleted: () => {},
    };
  }
  return ctx;
}
