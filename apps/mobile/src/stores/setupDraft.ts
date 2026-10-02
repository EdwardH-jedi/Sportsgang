import { create } from 'zustand';
import type { PreferredTime } from '@protin/shared-types';

import {
  emptyGolfForm,
  emptyRunForm,
  type GolfFormState,
  type RunFormState,
} from '../components/preferences/formState';

/**
 * In-progress answers for the multi-step v2 sport setup
 * (SetupSports → SetupSportDetails × n → SetupAvailability).
 *
 * Nothing is written to the API until the last step, so abandoning the
 * flow never leaves a half-configured sport profile. SetupSports resets the
 * draft whenever a new flow starts, and SetupAvailability resets it after a
 * successful save.
 */
interface SetupDraftState {
  golf: GolfFormState;
  run: RunFormState;
  times: PreferredTime[];
  setGolf: (golf: GolfFormState) => void;
  setRun: (run: RunFormState) => void;
  setTimes: (times: PreferredTime[]) => void;
  reset: () => void;
}

export const useSetupDraft = create<SetupDraftState>((set) => ({
  golf: emptyGolfForm(),
  run: emptyRunForm(),
  times: [],
  setGolf: (golf) => set({ golf }),
  setRun: (run) => set({ run }),
  setTimes: (times) => set({ times }),
  reset: () => set({ golf: emptyGolfForm(), run: emptyRunForm(), times: [] }),
}));
