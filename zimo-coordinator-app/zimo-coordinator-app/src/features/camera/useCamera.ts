import { useState, useCallback } from 'react';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { Alert } from 'react-native';
import { uploadsApi } from '@/services/api';
import { uploadCapturedFile } from './platformFile';

export interface CapturedPhoto {
  localUri: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  remoteUrl?: string;
  /** Set once the photo is stored on the platform. */
  fileId?: string;
  slotKey?: string;
}

async function getFileSize(uri: string): Promise<number> {
  const info = await FileSystem.getInfoAsync(uri, { size: true });
  return (info as { size?: number }).size ?? 0;
}

export function useCamera(appId: string) {
  const [photos, setPhotos] = useState<CapturedPhoto[]>([]);
  const [uploading, setUploading] = useState(false);

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

    const photo: CapturedPhoto = {
      localUri: asset.uri,
      filename,
      mimeType: 'image/jpeg',
      sizeBytes,
      slotKey,
    };

    setPhotos((prev) => {
      if (slotKey) {
        return [...prev.filter((p) => p.slotKey !== slotKey), photo];
      }
      return [...prev, photo];
    });
    return photo;
  }, []);

  const pickFromGallery = useCallback(async (slotKey?: string): Promise<CapturedPhoto | null> => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      quality: 0.75,
    });

    if (result.canceled || !result.assets[0]) return null;

    const asset = result.assets[0];
    const sizeBytes = await getFileSize(asset.uri);
    const filename = `${Date.now()}-${slotKey ?? 'gallery'}.jpg`;

    const photo: CapturedPhoto = {
      localUri: asset.uri,
      filename,
      mimeType: 'image/jpeg',
      sizeBytes,
      slotKey,
    };

    setPhotos((prev) => {
      if (slotKey) return [...prev.filter((p) => p.slotKey !== slotKey), photo];
      return [...prev, photo];
    });
    return photo;
  }, []);

  const uploadPhoto = useCallback(async (
    photo: CapturedPhoto,
    relatedTo: string,
    gpsLat?: number,
    gpsLng?: number
  ): Promise<string | null> => {
    setUploading(true);
    try {
      /* Stored through the field service, in this coordinator's name. See platformFile.ts. */
      const fileId = await uploadCapturedFile(photo);

      await uploadsApi.confirmPhoto(appId, {
        relatedTo,
        slotKey: photo.slotKey ?? undefined,
        fileId,
        capturedAt: new Date().toISOString(),
        gpsTagLat: gpsLat,
        gpsTagLng: gpsLng,
      });

      setPhotos((prev) =>
        prev.map((p) => (p.localUri === photo.localUri ? { ...p, fileId } : p))
      );

      return fileId;
    } catch (err) {
      console.error('Upload error:', err);
      const message =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ??
        'Photo could not be uploaded. Please check your connection and try again.';
      Alert.alert('Upload Failed', message);
      return null;
    } finally {
      setUploading(false);
    }
  }, [appId]);

  const removePhoto = useCallback((localUri: string) => {
    setPhotos((prev) => prev.filter((p) => p.localUri !== localUri));
  }, []);

  return { photos, uploading, takePhoto, pickFromGallery, uploadPhoto, removePhoto };
}
