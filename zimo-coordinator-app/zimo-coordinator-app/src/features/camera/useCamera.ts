import { useState, useCallback } from 'react';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { Alert } from 'react-native';
import { uploadsApi } from '@/services/api';

export interface CapturedPhoto {
  localUri: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  remoteUrl?: string;
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
      // Step 1: Get Cloudinary signed upload params from our backend
      const { data: presignData } = await uploadsApi.presign(photo.filename, photo.mimeType);
      const { uploadUrl, fileUrl, signature, apiKey, timestamp, folder, publicId } = presignData.data;

      // Step 2: Build multipart form and POST directly to Cloudinary
      // Cloudinary expects multipart/form-data, not a raw PUT body like S3
      const formData = new FormData();
      formData.append('file', {
        uri: photo.localUri,
        type: photo.mimeType,
        name: photo.filename,
      } as unknown as Blob);
      formData.append('api_key', apiKey);
      formData.append('timestamp', String(timestamp));
      formData.append('signature', signature);
      formData.append('folder', folder);
      formData.append('public_id', publicId);

      const uploadResponse = await fetch(uploadUrl, {
        method: 'POST',
        body: formData,
      });

      if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text();
        throw new Error(`Cloudinary upload failed: ${errorText}`);
      }

      const cloudinaryResult = await uploadResponse.json() as { secure_url: string };
      const confirmedUrl = cloudinaryResult.secure_url;

      // Step 3: Confirm the upload with our backend (saves metadata to MongoDB)
      await uploadsApi.confirmPhoto(appId, {
        relatedTo,
        slotKey: photo.slotKey ?? undefined,
        filename: photo.filename,
        url: confirmedUrl,
        mimeType: photo.mimeType,
        sizeBytes: photo.sizeBytes,
        capturedAt: new Date().toISOString(),
        gpsTagLat: gpsLat,
        gpsTagLng: gpsLng,
      });

      // Update local state with remote URL
      setPhotos((prev) =>
        prev.map((p) =>
          p.localUri === photo.localUri ? { ...p, remoteUrl: confirmedUrl } : p
        )
      );

      return confirmedUrl;
    } catch (err) {
      console.error('Upload error:', err);
      Alert.alert(
        'Upload Failed',
        'Photo could not be uploaded. Please check your connection and try again.'
      );
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
