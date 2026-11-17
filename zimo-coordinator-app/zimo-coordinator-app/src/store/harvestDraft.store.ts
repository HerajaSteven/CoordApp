import { create } from 'zustand';
import { MMKV } from 'react-native-mmkv';
import { z } from 'zod';
import type { CollectableBatch, CollectableFarm } from '@/types';

export interface HarvestPhotoDraft {
  localUri: string;
  filename: string;
  mimeType: string;
  clientId: string;
}

export interface HarvestPickupDraft {
  id: string;
  farm: CollectableFarm;
  batch: CollectableBatch;
  headcount: string;
  avgWeightKg: string;
  driverId: number | null;
  photos: HarvestPhotoDraft[];
  savedAt: number;
}

const storage = new MMKV({ id: 'harvest-pickup-drafts' });
const STORAGE_KEY = 'drafts';
const batchSchema = z.object({
  id: z.string(),
  category: z.string(),
  breed: z.string().nullable(),
  remaining_quantity: z.number(),
  placed_at: z.string().nullable(),
});
const draftSchema = z.object({
  id: z.string(),
  farm: z.object({
    farm_profile_id: z.string(),
    farm_name: z.string(),
    farm_identity_id: z.string(),
    batches: z.array(batchSchema),
  }),
  batch: batchSchema,
  headcount: z.string(),
  avgWeightKg: z.string(),
  driverId: z.number().nullable(),
  photos: z.array(z.object({
    localUri: z.string(),
    filename: z.string(),
    mimeType: z.string(),
    clientId: z.string(),
  })),
  savedAt: z.number(),
});

function loadDrafts(): HarvestPickupDraft[] {
  const raw = storage.getString(STORAGE_KEY);
  if (!raw) return [];

  try {
    const value: unknown = JSON.parse(raw);
    const result = z.array(draftSchema).safeParse(value);
    if (!result.success) throw result.error;
    return result.data;
  } catch (error) {
    console.error('Saved harvest drafts could not be read.', error);
    return [];
  }
}

function persist(drafts: HarvestPickupDraft[]): void {
  storage.set(STORAGE_KEY, JSON.stringify(drafts));
}

interface HarvestDraftState {
  drafts: HarvestPickupDraft[];
  saveDraft: (draft: HarvestPickupDraft) => void;
  removeDraft: (id: string) => void;
}

export const useHarvestDraftStore = create<HarvestDraftState>((set, get) => ({
  drafts: loadDrafts(),
  saveDraft: (draft) => {
    const drafts = [...get().drafts.filter((item) => item.id !== draft.id), draft];
    persist(drafts);
    set({ drafts });
  },
  removeDraft: (id) => {
    const drafts = get().drafts.filter((item) => item.id !== id);
    persist(drafts);
    set({ drafts });
  },
}));
