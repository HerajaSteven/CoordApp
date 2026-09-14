import { useEffect, useState } from 'react';
import type { ImageSourcePropType } from 'react-native';
import { api, API_BASE_URL, tokenStorage } from '@/services/api/client';

/*
  ── HOW A PHOTO GETS STORED ────────────────────────────────────────────

  This app used to post photos to Cloudinary with a signature. Evidence
  moved to the platform's own storage, and the app was never updated: it
  kept posting the old signed form, with no sign-in, to an address that
  needs one. Every evidence photo failed with "Upload Failed", and no farm
  could get past the evidence step.

  The app's sign-in is with the field service, not the platform, so the
  photo goes to the field service. It stores the photo on the platform in
  this coordinator's name and answers with the file's id, which is what
  every confirm call takes.
*/
export async function uploadCapturedFile(file: { localUri: string; filename: string; mimeType: string }): Promise<string> {
  const form = new FormData();
  form.append('file', { uri: file.localUri, type: file.mimeType, name: file.filename } as unknown as Blob);

  const { data } = await api.post<{ data: { fileId: string } }>('/uploads/file', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    /* A photo on a field connection takes longer than a JSON call. */
    timeout: 120000,
  });

  return data.data.fileId;
}

/** The address a stored file is shown from. Absolute, because some records keep it as a link. */
export function storedFileUrl(fileId: string, appId?: string): string {
  return `${API_BASE_URL}/uploads/file/${encodeURIComponent(fileId)}${appId ? `?appId=${encodeURIComponent(appId)}` : ''}`;
}

/*
  A stored photo, ready for <Image>. The address needs this coordinator's
  sign-in, so the token is sent as a header. A plain link would be refused,
  which is why photos that had uploaded still showed as blank squares.
*/
export function useStoredFileSource(fileId: string | null | undefined, appId?: string): ImageSourcePropType | null {
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void tokenStorage.getAccess().then((value) => {
      if (alive) setToken(value);
    });
    return () => {
      alive = false;
    };
  }, [fileId]);

  if (!fileId || !token) return null;

  return { uri: storedFileUrl(fileId, appId), headers: { Authorization: `Bearer ${token}` } };
}
