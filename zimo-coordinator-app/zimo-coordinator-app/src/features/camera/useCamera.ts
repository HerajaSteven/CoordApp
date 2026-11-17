import { useState, useCallback } from 'react';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { Alert } from 'react-native';
import { MMKV } from 'react-native-mmkv';
import { useOfflineStore } from '@/store/offline.store';

export interface CapturedPhoto {
  localUri: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  remoteUrl?: string;
  /** Set once the photo is stored on the platform. */
  fileId?: string;
  slotKey?: string;
  capturedAt: string;
}

const photoStorage = new MMKV({ id: 'captured-field-photos' });

function photosStorageKey(appId: string, siteId?: string): string {
  return siteId ? `captured-photos:${appId}:site:${siteId}` : `captured-photos:${appId}`;
}

function loadPhotos(appId: string, siteId?: string): CapturedPhoto[] {
  const raw = photoStorage.getString(photosStorageKey(appId, siteId));
  if (!raw) return [];

  const value: unknown = JSON.parse(raw);
  if (!Array.isArray(value)) throw new Error(`Saved photos for ${appId} have an invalid shape.`);
  return value as CapturedPhoto[];
}

function savePhotos(appId: string, photos: CapturedPhoto[], siteId?: string): void {
  photoStorage.set(photosStorageKey(appId, siteId), JSON.stringify(photos));
}

async function persistPhoto(uri: string, filename: string): Promise<string> {
  const directory = FileSystem.documentDirectory;
  if (!directory) throw new Error('Persistent photo storage is unavailable on this device.');

  const photoDirectory = `${directory}field-photos/`;
  await FileSystem.makeDirectoryAsync(photoDirectory, { intermediates: true });
  const destination = `${photoDirectory}${filename}`;
  await FileSystem.copyAsync({ from: uri, to: destination });
  return destination;
}

async function getFileSize(uri: string): Promise<number> {
  const info = await FileSystem.getInfoAsync(uri, { size: true });
  return (info as { size?: number }).size ?? 0;
}

export function useCamera(appId: string, siteId?: string) {
  const enqueue = useOfflineStore((state) => state.enqueue);
  const [photos, setPhotos] = useState<CapturedPhoto[]>(() => loadPhotos(appId, siteId));

  const requestPermission = async (): Promise<boolean> => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Camera Permission',
        'Camera access is required to capture verification photos. Please enable it in Settings.'
      );
      return false;
    }
    return true;
  };

  const takePhoto = useCallback(async (slotKey?: string): Promise<CapturedPhoto | null> => {
    const ok = await requestPermission();
    if (!ok) return null;

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: 'images',
      quality: 0.75,  // balance quality vs upload speed
      exif: false,    // skip EXIF to reduce file size
    });

    if (result.canceled || !result.assets[0]) return null;

    const asset = result.assets[0];
    const sizeBytes = await getFileSize(asset.uri);
    const filename = `${Date.now()}-${slotKey ?? 'photo'}.jpg`;

    let localUri: string;
    try {
      localUri = await persistPhoto(asset.uri, filename);
    } catch (error) {
      console.error('Captured photo could not be saved locally.', error);
      Alert.alert('Photo not saved', 'The photo could not be stored on this device. Please take it again.');
      return null;
    }
    const photo: CapturedPhoto = {
      localUri,
      filename,
      mimeType: 'image/jpeg',
      sizeBytes,
      slotKey,
      capturedAt: new Date().toISOString(),
    };

    setPhotos((prev) => {
      if (slotKey) {
        const next = [...prev.filter((p) => p.slotKey !== slotKey), photo];
        savePhotos(appId, next, siteId);
        return next;
      }
      const next = [...prev, photo];
      savePhotos(appId, next, siteId);
      return next;
    });
    return photo;
  }, [appId, siteId]);

  const pickFromGallery = useCallback(async (slotKey?: string): Promise<CapturedPhoto | null> => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      quality: 0.75,
    });

    if (result.canceled || !result.assets[0]) return null;

    const asset = result.assets[0];
    const sizeBytes = await getFileSize(asset.uri);
    const filename = `${Date.now()}-${slotKey ?? 'gallery'}.jpg`;

    let localUri: string;
    try {
      localUri = await persistPhoto(asset.uri, filename);
    } catch (error) {
      console.error('Selected photo could not be saved locally.', error);
      Alert.alert('Photo not saved', 'The photo could not be stored on this device. Please select it again.');
      return null;
    }
    const photo: CapturedPhoto = {
      localUri,
      filename,
      mimeType: 'image/jpeg',
      sizeBytes,
      slotKey,
      capturedAt: new Date().toISOString(),
    };

    setPhotos((prev) => {
      const next = slotKey ? [...prev.filter((p) => p.slotKey !== slotKey), photo] : [...prev, photo];
      savePhotos(appId, next, siteId);
      return next;
    });
    return photo;
  }, [appId, siteId]);

  const uploadPhoto = useCallback(async (
    photo: CapturedPhoto,
    relatedTo: string,
    gpsLat?: number,
    gpsLng?: number
  ): Promise<string | null> => {
    try {
      const clientId = enqueue('photos', appId, {
        localUri: photo.localUri,
        filename: photo.filename,
        mimeType: photo.mimeType,
        relatedTo,
        slotKey: photo.slotKey,
        capturedAt: photo.capturedAt,
        gpsTagLat: gpsLat,
        gpsTagLng: gpsLng,
        siteId,
      });

      setPhotos((prev) =>
        prev.map((p) => (p.localUri === photo.localUri ? { ...p, fileId: `local:${clientId}` } : p))
      );
      setPhotos((next) => {
        savePhotos(appId, next, siteId);
        return next;
      });

      return `local:${clientId}`;
    } catch (err) {
      console.error('Could not queue field photo:', err);
      Alert.alert('Could not save photo', 'The photo could not be stored on this device. Please try again.');
      return null;
    }
  }, [appId, enqueue, siteId]);

  const removePhoto = useCallback((localUri: string) => {
    setPhotos((prev) => {
      const next = prev.filter((p) => p.localUri !== localUri);
      savePhotos(appId, next, siteId);
      return next;
    });
  }, [appId, siteId]);

  return { photos, uploading: false, takePhoto, pickFromGallery, uploadPhoto, removePhoto };
}
