import { create } from 'zustand';
import { MMKV } from 'react-native-mmkv';

const storage = new MMKV({ id: 'app-settings' });
const SUPERADMIN_MANUAL_COORD_KEY = 'superadmin_manual_coordinates_enabled';
const SUPERADMIN_GALLERY_EVIDENCE_KEY = 'superadmin_gallery_evidence_enabled';

function loadSuperAdminManualCoordinatesEnabled(): boolean {
  try {
    return storage.getBoolean(SUPERADMIN_MANUAL_COORD_KEY) ?? false;
  } catch {
    return false;
  }
}

function saveSuperAdminManualCoordinatesEnabled(value: boolean) {
  storage.set(SUPERADMIN_MANUAL_COORD_KEY, value);
}

function loadSuperAdminGalleryEvidenceEnabled(): boolean {
  try {
    return storage.getBoolean(SUPERADMIN_GALLERY_EVIDENCE_KEY) ?? false;
  } catch {
    return false;
  }
}

function saveSuperAdminGalleryEvidenceEnabled(value: boolean) {
  storage.set(SUPERADMIN_GALLERY_EVIDENCE_KEY, value);
}

interface SettingsState {
  superAdminManualCoordinatesEnabled: boolean;
  setSuperAdminManualCoordinatesEnabled: (value: boolean) => void;
  superAdminGalleryEvidenceEnabled: boolean;
  setSuperAdminGalleryEvidenceEnabled: (value: boolean) => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  superAdminManualCoordinatesEnabled: loadSuperAdminManualCoordinatesEnabled(),
  superAdminGalleryEvidenceEnabled: loadSuperAdminGalleryEvidenceEnabled(),

  setSuperAdminManualCoordinatesEnabled: (value: boolean) => {
    saveSuperAdminManualCoordinatesEnabled(value);
    set({ superAdminManualCoordinatesEnabled: value });
  },

  setSuperAdminGalleryEvidenceEnabled: (value: boolean) => {
    saveSuperAdminGalleryEvidenceEnabled(value);
    set({ superAdminGalleryEvidenceEnabled: value });
  }
}));
