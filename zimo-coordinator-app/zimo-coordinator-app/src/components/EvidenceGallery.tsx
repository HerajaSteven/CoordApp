import React, { useState } from 'react';
import { View, Image, TouchableOpacity, Modal, ScrollView, Linking } from 'react-native';
import { Text } from '@/components/ui/typography';
import { Card, Divider } from '@/components/ui';
import type { UploadedPhoto, UploadedDocument } from '@/types';

/*
  ── WHAT A COORDINATOR COULD NOT SEE ─────────────────────────────────────

  `GET /farms/:appId/profile` has always returned `photos[]` and
  `documents[]` — every capture, with its slot, its filename, the moment
  the shutter fired and a URL to fetch it. The farm screen rendered none of
  them. A coordinator arriving at a farm somebody else had already verified
  could read that the step was complete and could not look at a single
  thing that made it complete.

  That matters twice over. A coordinator sent to re-verify needs to see
  what was captured before, or they photograph it all again. And a
  coordinator who suspects a farm was signed off without a visit has no way
  to check — which is the whole point of holding evidence.

  ── CAPTURED-AT IS SHOWN, ALWAYS ─────────────────────────────────────────

  The one fact that distinguishes evidence of a visit from evidence of an
  upload. A photograph taken three weeks before the verification was
  submitted is a question worth asking, and it can only be asked if the
  date is on the screen next to the picture.
*/

const SLOT_LABELS: Record<string, string> = {
  'ev-entrance': 'Entrance',
  'ev-water': 'Water source',
  'ev-crop-overview': 'Crop overview',
  'ev-storage': 'Storage',
  'ev-pen-cage': 'Pen / cage',
  'ev-stock-visible': 'Stock visible',
  'ev-farmer-selfie': 'Farmer',
};

const label = (slot: string | null, relatedTo: string): string =>
  (slot ? SLOT_LABELS[slot] : undefined) ?? slot ?? relatedTo;

const when = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleString() : 'No capture time recorded';

export function EvidenceGallery({
  photos,
  documents,
}: {
  readonly photos: readonly UploadedPhoto[];
  readonly documents: readonly UploadedDocument[];
}) {
  const [viewing, setViewing] = useState<UploadedPhoto | null>(null);

  if (photos.length === 0 && documents.length === 0) {
    return (
      <Card className="mb-4">
        <Text className="font-bold text-text mb-1">Evidence</Text>
        {/*
          Said rather than left blank. An empty gallery and a farm nobody
          photographed look identical otherwise, and only one of them is a
          reason to go back out there.
        */}
        <Text className="text-text-3 text-sm">
          Nothing has been captured against this farm yet.
        </Text>
      </Card>
    );
  }

  return (
    <>
      {photos.length > 0 && (
        <Card className="mb-4">
          <Text className="font-bold text-text mb-1">
            Photographs <Text className="text-text-3 font-normal">({photos.length})</Text>
          </Text>
          <Text className="text-xs text-text-3 mb-3">Tap to view full size.</Text>
          <View className="flex-row flex-wrap -mx-1">
            {photos.map((photo) => (
              <TouchableOpacity
                key={`${photo.relatedTo}-${photo.filename}`}
                className="w-1/3 px-1 mb-3"
                onPress={() => setViewing(photo)}
                activeOpacity={0.85}
              >
                <Image
                  source={{ uri: photo.url }}
                  style={{ width: '100%', aspectRatio: 1, borderRadius: 8, backgroundColor: '#E8EDF3' }}
                  resizeMode="cover"
                  accessibilityRole="image"
                  accessibilityLabel={label(photo.slotKey, photo.relatedTo)}
                />
                <Text className="text-[10px] text-text-2 mt-1" numberOfLines={1}>
                  {label(photo.slotKey, photo.relatedTo)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </Card>
      )}

      {documents.length > 0 && (
        <Card className="mb-4">
          <Text className="font-bold text-text mb-2">
            Documents <Text className="text-text-3 font-normal">({documents.length})</Text>
          </Text>
          <Divider className="mb-2" />
          {documents.map((doc, index) => (
            <TouchableOpacity
              key={`${doc.relatedTo}-${doc.filename}`}
              onPress={() => void Linking.openURL(doc.url)}
              activeOpacity={0.7}
              className={index > 0 ? 'mt-3' : ''}
            >
              <Text className="text-green-500 font-semibold text-sm" numberOfLines={1}>
                📄 {doc.filename}
              </Text>
              <Text className="text-[11px] text-text-3 mt-0.5">
                {doc.relatedTo} · {when(doc.capturedAt)}
              </Text>
            </TouchableOpacity>
          ))}
        </Card>
      )}

      {/* Full size, with the facts that make it evidence rather than a picture. */}
      <Modal visible={viewing !== null} transparent animationType="fade" onRequestClose={() => setViewing(null)}>
        <View className="flex-1 bg-black/90">
          <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}>
            {viewing && (
              <>
                <Image
                  source={{ uri: viewing.url }}
                  style={{ width: '100%', aspectRatio: 1 }}
                  resizeMode="contain"
                  accessibilityRole="image"
                  accessibilityLabel={label(viewing.slotKey, viewing.relatedTo)}
                />
                <View className="px-5 mt-4">
                  <Text className="text-white font-bold text-base">
                    {label(viewing.slotKey, viewing.relatedTo)}
                  </Text>
                  <Text className="text-white/70 text-xs mt-1">{viewing.filename}</Text>
                  {/* When the shutter fired, not when it uploaded. */}
                  <Text className="text-white/70 text-xs mt-1">Captured {when(viewing.capturedAt)}</Text>
                </View>
              </>
            )}
          </ScrollView>
          <TouchableOpacity
            onPress={() => setViewing(null)}
            className="absolute top-12 right-5 w-10 h-10 rounded-full bg-white/20 items-center justify-center"
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <Text className="text-white text-lg">✕</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </>
  );
}
