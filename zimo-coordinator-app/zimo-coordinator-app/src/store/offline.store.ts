import { create } from 'zustand';
import { MMKV } from 'react-native-mmkv';
import { randomUUID } from 'expo-crypto';
import { syncApi, uploadsApi } from '@/services/api';
import { uploadCapturedFile } from '@/features/camera/platformFile';
import type { OfflineQueueItem, SyncCollection } from '@/types';

const storage = new MMKV({ id: 'offline-queue' });
const QUEUE_KEY = 'queue';
const BOUNDARY_DRAFTS_KEY = 'boundary-drafts';
const LAST_SYNC_KEY = 'last-sync-at';

export interface BoundaryDraftPoint {
  lat: number;
  lng: number;
  accuracyMeters: number;
  timestamp: string;
  /** The edge from the previous fix to this one could not be walked. */
  bridged?: boolean;
  bridgeReason?: string;
}

export interface BoundaryWalkDraft {
  points: BoundaryDraftPoint[];
  updatedAt: number;
  /**
   * When the coordinator declared the walk finished, if they have.
   *
   * STOPPING AND FINISHING ARE NOT THE SAME THING, and the screen used to
   * treat them as one. "Stop & Save" halted the recording and attempted
   * an upload, and if the upload failed the walk went back to offering
   * "Resume" — so a completed perimeter sat there inviting more points to
   * be appended to it, which is how a trace turns into two separate
   * traverses joined by a straight line.
   *
   * Set, it means the walking is over and only the upload is outstanding.
   * Resume is not offered, and the size is worked out and shown.
   */
  endedAt?: number;
}

/**
 * Use Expo's native UUID generator instead of relying on the global Web
 * Crypto API, which is not available in every React Native runtime.
 */
interface BatchOutcome {
  data: {
    data: {
      summary: { synced: number; conflicts: number; errors: number; duplicates: number };
      results: Array<{ clientId: string; status: string; message?: string }>;
    };
  };
}

/**
 * Send the queue, and if the server refuses the shape of it, send one at
 * a time instead.
 *
 * The batch endpoint validates every item before it runs any of them, so
 * on an older server a collection it has never heard of makes the whole
 * request a 400 and nothing in the queue moves. Sending the items singly
 * isolates that: the unknown one fails alone and waits for a server that
 * understands it, and everything else goes up today.
 *
 * Only for a batch-wide 400. A 429 is a throttle, not a schema mismatch;
 * splitting it into one request per item would amplify the overload.
 * A 5xx or connection failure likewise must not fan out into more requests.
 */
async function sendWithPerItemFallback(queue: OfflineQueueItem[]): Promise<BatchOutcome> {
  try {
    return (await syncApi.batch(queue)) as BatchOutcome;
  } catch (err) {
    const status = (err as { response?: { status?: number } })?.response?.status;

    if (queue.length < 2 || status !== 400) {
      throw err;
    }

    const results: Array<{ clientId: string; status: string; message?: string }> = [];

    for (const item of queue) {
      try {
        const single = (await syncApi.batch([item])) as BatchOutcome;
        results.push(...single.data.data.results);
      } catch (singleErr) {
        const singleStatus = (singleErr as { response?: { status?: number } })?.response?.status;

        /*
          The server went away mid-walk through the queue. Stop, and leave
          the remaining items untouched rather than marking them failed —
          they have not been offered yet.
        */
        if (singleStatus === undefined || singleStatus >= 500) {
          break;
        }

        results.push({
          clientId: item.clientId,
          status: 'error',
          message: `This server does not accept "${item.collection}" items yet.`,
        });
      }
    }

    return {
      data: {
        data: {
          summary: {
            synced: results.filter((r) => r.status === 'synced').length,
            duplicates: results.filter((r) => r.status === 'duplicate').length,
            conflicts: results.filter((r) => r.status === 'conflict').length,
            errors: results.filter((r) => r.status === 'error').length,
          },
          results,
        },
      },
    };
  }
}

function generateId(): string {
  return randomUUID();
}

function loadQueue(): OfflineQueueItem[] {
  try {
    const raw = storage.getString(QUEUE_KEY);
    const parsed = raw ? JSON.parse(raw) as OfflineQueueItem[] : [];
    return parsed.map((item) => ({ ...item, status: item.status ?? 'pending' }));
  } catch {
    return [];
  }
}

function saveQueue(items: OfflineQueueItem[]) {
  storage.set(QUEUE_KEY, JSON.stringify(items));
}

function loadBoundaryDrafts(): Record<string, BoundaryWalkDraft> {
  try {
    const raw = storage.getString(BOUNDARY_DRAFTS_KEY);
    return raw ? (JSON.parse(raw) as Record<string, BoundaryWalkDraft>) : {};
  } catch {
    return {};
  }
}

function saveBoundaryDrafts(drafts: Record<string, BoundaryWalkDraft>) {
  storage.set(BOUNDARY_DRAFTS_KEY, JSON.stringify(drafts));
}

export function boundaryDraftKey(appId: string, unitId: unknown, siteId?: unknown): string {
  const scope = typeof siteId === 'string'
    ? `site:${siteId}`
    : typeof unitId === 'string' ? unitId : '';
  return `${appId}::${scope}`;
}

export function boundaryDraftMatchesQueuedWalk(
  draft: BoundaryWalkDraft | undefined,
  payload: Record<string, unknown>
): boolean {
  const queuedPoints = payload.points;
  if (!draft || !Array.isArray(queuedPoints) || queuedPoints.length !== draft.points.length) {
    return false;
  }

  return draft.points.every((point, index) => {
    const queued = queuedPoints[index];
    if (!queued || typeof queued !== 'object') return false;

    const queuedPoint = queued as Record<string, unknown>;
    const capturedAt = typeof queuedPoint.capturedAt === 'string'
      ? Date.parse(queuedPoint.capturedAt)
      : Number.NaN;

    return point.lat === queuedPoint.lat
      && point.lng === queuedPoint.lng
      && point.accuracyMeters === queuedPoint.accuracyMeters
      && Date.parse(point.timestamp) === capturedAt;
  });
}

function parseBoundaryDraftKey(key: string): { appId: string; unitId: string | null; siteId: string | null } {
  const separator = key.lastIndexOf('::');
  if (separator < 0) return { appId: key, unitId: null, siteId: null };

  const appId = key.slice(0, separator);
  const scope = key.slice(separator + 2);
  if (scope.startsWith('site:')) {
    return { appId, unitId: null, siteId: scope.slice('site:'.length) || null };
  }

  return { appId, unitId: scope || null, siteId: null };
}

function boundaryWalkPayload(draft: BoundaryWalkDraft, unitId: string | null, siteId: string | null) {
  return {
    points: draft.points.map((point) => ({
      lat: point.lat,
      lng: point.lng,
      accuracyMeters: point.accuracyMeters,
      capturedAt: point.timestamp,
      bridged: point.bridged,
      bridgeReason: point.bridgeReason,
    })),
    unitId,
    siteId,
  };
}

interface OfflineState {
  queue: OfflineQueueItem[];
  boundaryDrafts: Record<string, BoundaryWalkDraft>;
  isSyncing: boolean;
  lastSyncAt: number | null;
  enqueue: (
    collection: SyncCollection,
    appId: string,
    payload: Record<string, unknown>
  ) => string;
  saveBoundaryDraft: (
    appId: string,
    points: Array<Omit<BoundaryDraftPoint, 'timestamp'> & { timestamp: Date | string }>
  ) => void;
  /** Declare the walking finished. The upload may still be outstanding. */
  endBoundaryDraft: (appId: string) => void;
  clearBoundaryDraft: (appId: string) => void;
  queueBoundaryDraft: (draftKey: string, markCompleted?: boolean) => string;
  sync: (force?: boolean) => Promise<{ synced: number; conflicts: number; errors: number }>;
  markSyncCompleted: () => void;
  clearQueue: () => void;
}

export const useOfflineStore = create<OfflineState>((set, get) => ({
  queue: loadQueue(),
  boundaryDrafts: loadBoundaryDrafts(),
  isSyncing: false,
  lastSyncAt: storage.getNumber(LAST_SYNC_KEY) ?? null,

  enqueue: (collection, appId, payload) => {
    const item: OfflineQueueItem = {
      clientId: generateId(),
      collection,
      appId,
      payload,
      clientTimestamp: new Date().toISOString(),
      createdAt: Date.now(),
      status: 'pending',
    };

    /*
      SOME THINGS DESCRIBE A STATE, NOT AN EVENT.

      A boundary walk and a farm's centre point are each the whole answer
      for that farm — a second one supersedes the first rather than adding
      to it. Appending them would queue the same walk again on every press
      of a failing save button, and the server would then apply several
      copies in whatever order they arrived, the last one winning by luck.

      Points on a live walk are the opposite: each is its own event and
      every one of them counts, so `boundaryPoints` is never collapsed.
    */
    const latestWins: SyncCollection[] = ['boundaryWalks', 'gpsCenters', 'fieldActions', 'photos'];
    /*
      Superseded per UNIT, not per farm. A farm can have many ponds or
      plots, each with its own boundary, and matching on the farm alone
      would have let one unit's queued walk evict another's — the same
      collision the stored draft had.
    */
    const unitOf = (p: Record<string, unknown> | undefined) => {
      if (p?.action === 'verifySite') return typeof p.siteId === 'string' ? p.siteId : '';
      if (typeof p?.siteId === 'string') return `site:${p.siteId}`;
      return typeof p?.unitId === 'string' ? p.unitId : '';
    };
    const kept = latestWins.includes(collection)
      ? get().queue.filter(
          (q) =>
            !(
              q.collection === collection
              && q.appId === appId
              && unitOf(q.payload) === unitOf(payload)
              && (collection !== 'fieldActions' || q.payload?.action === payload.action)
              && (collection !== 'photos' || q.payload?.slotKey === payload.slotKey)
            )
        )
      : get().queue;

    const updated = [...kept, item];
    saveQueue(updated);
    set({ queue: updated });
    return item.clientId;
  },

  saveBoundaryDraft: (appId, points) => {
    const boundaryDrafts = {
      ...get().boundaryDrafts,
      [appId]: {
        points: points.map((point) => ({
          lat: point.lat,
          lng: point.lng,
          accuracyMeters: point.accuracyMeters,
          timestamp: point.timestamp instanceof Date ? point.timestamp.toISOString() : point.timestamp,
          /* Carried, or an unwalkable edge becomes an unexplained shortcut. */
          bridged: point.bridged,
          bridgeReason: point.bridgeReason,
        })),
        updatedAt: Date.now(),
        /*
          Recording more points un-ends a walk. If somebody resumed a
          finished one, it is being walked again and the declaration no
          longer holds.
        */
        endedAt: undefined,
      },
    };
    saveBoundaryDrafts(boundaryDrafts);
    set({ boundaryDrafts });
  },

  endBoundaryDraft: (appId) => {
    const existing = get().boundaryDrafts[appId];

    if (!existing) {
      return;
    }

    const boundaryDrafts = {
      ...get().boundaryDrafts,
      [appId]: { ...existing, endedAt: Date.now() },
    };
    saveBoundaryDrafts(boundaryDrafts);
    set({ boundaryDrafts });
  },

  clearBoundaryDraft: (appId) => {
    const boundaryDrafts = { ...get().boundaryDrafts };
    delete boundaryDrafts[appId];
    saveBoundaryDrafts(boundaryDrafts);
    set({ boundaryDrafts });
  },

  queueBoundaryDraft: (draftKey, markCompleted = false) => {
    let draft = get().boundaryDrafts[draftKey];
    if (!draft) throw new Error('The saved boundary walk could not be found on this device.');

    if (draft.endedAt == null) {
      if (!markCompleted) throw new Error('Confirm that the saved boundary walk is complete before queuing it.');
      get().endBoundaryDraft(draftKey);
      draft = get().boundaryDrafts[draftKey];
    }

    if (draft.points.length < 3) {
      throw new Error('A boundary walk needs at least 3 GPS points before it can be queued.');
    }

    const { appId, unitId, siteId } = parseBoundaryDraftKey(draftKey);
    if (!appId) throw new Error('The saved boundary walk has no farm or cluster id.');

    const payload = boundaryWalkPayload(draft, unitId, siteId);
    const existing = get().queue.find((item) =>
      item.collection === 'boundaryWalks'
      && item.appId === appId
      && boundaryDraftKey(item.appId, item.payload?.unitId, item.payload?.siteId) === draftKey
      && boundaryDraftMatchesQueuedWalk(draft, item.payload)
    );

    return existing?.clientId ?? get().enqueue('boundaryWalks', appId, payload);
  },

  sync: async (force = false) => {
    recoverEndedBoundaryDrafts();
    const { queue, isSyncing } = get();
    const now = Date.now();
    const work = queue.filter((item) => {
      if (item.status === 'synced') return false;
      if (item.status !== 'failed' || force || item.lastAttemptAt === undefined) return true;
      const delay = Math.min(5 * 60 * 1000, 1000 * 2 ** Math.min(item.attempts ?? 1, 8));
      return now - item.lastAttemptAt >= delay;
    });
    if (isSyncing || work.length === 0) {
      return { synced: 0, conflicts: 0, errors: 0 };
    }
    set({ isSyncing: true });
    try {
      /*
        ONE ITEM THE SERVER DOES NOT RECOGNISE MUST NOT STOP THE REST.

        A server that predates a collection rejects the batch as a whole,
        with a 400, before it processes anything — so a single queued
        boundary walk would hold back every visit and incident behind it
        for as long as that server stays in place. Which, right now, is
        until a hosting bill is paid.

        A batch-wide 400 — a collection this server does not recognise —
        is retried one item at a time so that one unsupported item cannot
        block the rest. A 429 is a throttle, not a schema mismatch, and
        must not fan out into one request per queued item. A 5xx or dead
        connection likewise means the server is not answering.
      */
      let completed = 0;
      let conflicts = 0;
      let errors = 0;

      const current = new Map(get().queue.map((item) => [item.clientId, item]));
      const siteCreations = work.filter((item) => item.collection === 'sites');
      for (let offset = 0; offset < siteCreations.length; offset += 200) {
        const batch = siteCreations.slice(offset, offset + 200);
        try {
          const { data } = await sendWithPerItemFallback(batch);
          const results = data.data.results as Array<{ clientId: string; status: string; message?: string }>;
          const resultById = new Map(results.map((result) => [result.clientId, result]));
          for (const item of batch) {
            const result = resultById.get(item.clientId);
            if (result?.status === 'synced' || result?.status === 'duplicate') {
              current.set(item.clientId, { ...item, status: 'synced', lastError: undefined });
              completed += 1;
            } else {
              current.set(item.clientId, {
                ...item,
                status: 'failed',
                attempts: (item.attempts ?? 0) + 1,
                lastAttemptAt: Date.now(),
                lastError: result?.message ?? 'The server did not confirm this site.',
              });
              errors += 1;
            }
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Site sync request failed.';
          for (const item of batch) {
            current.set(item.clientId, {
              ...item,
              status: 'failed',
              attempts: (item.attempts ?? 0) + 1,
              lastAttemptAt: Date.now(),
              lastError: message,
            });
            errors += 1;
          }
        }
      }

      const photos = work.filter((item) => item.collection === 'photos');
      for (const item of photos) {
        try {
          const fileId = await uploadCapturedFile({
            localUri: String(item.payload.localUri),
            filename: String(item.payload.filename),
            mimeType: String(item.payload.mimeType),
            clientId: item.clientId,
          });
          await uploadsApi.confirmPhoto(item.appId, {
            relatedTo: String(item.payload.relatedTo),
            slotKey: typeof item.payload.slotKey === 'string' ? item.payload.slotKey : undefined,
            fileId,
            capturedAt: String(item.payload.capturedAt),
            gpsTagLat: typeof item.payload.gpsTagLat === 'number' ? item.payload.gpsTagLat : undefined,
            gpsTagLng: typeof item.payload.gpsTagLng === 'number' ? item.payload.gpsTagLng : undefined,
            unitId: typeof item.payload.unitId === 'string' ? item.payload.unitId : undefined,
            siteId: typeof item.payload.siteId === 'string' ? item.payload.siteId : undefined,
          }, item.clientId);
          current.set(item.clientId, { ...item, status: 'synced', fileId, lastError: undefined });
          completed += 1;
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Photo upload failed.';
          current.set(item.clientId, {
            ...item,
            status: 'failed',
            attempts: (item.attempts ?? 0) + 1,
            lastAttemptAt: Date.now(),
            lastError: message,
          });
          errors += 1;
        }
      }

      const jsonWork = work.filter((item) =>
        item.collection !== 'photos' && item.collection !== 'sites'
      );
      const blockedProofActions = new Set(
        [...current.values()]
          .filter((photo) => photo.collection === 'photos' && photo.status !== 'synced')
          .map((photo) => {
            const scope = typeof photo.payload.siteId === 'string'
              ? `site:${photo.payload.siteId}`
              : typeof photo.payload.unitId === 'string' ? photo.payload.unitId : '';
            return `${photo.appId}::${scope}`;
          })
      );
      const sendable = jsonWork.filter((item) => !(
        item.collection === 'fieldActions'
        && item.payload.action === 'evidenceComplete'
        && blockedProofActions.has(`${item.appId}::${(
          typeof item.payload.siteId === 'string'
            ? `site:${item.payload.siteId}`
            : typeof item.payload.unitId === 'string' ? item.payload.unitId : ''
        )}`)
      ));

      for (let offset = 0; offset < sendable.length; offset += 200) {
        const batch = sendable.slice(offset, offset + 200);
        try {
          const { data } = await sendWithPerItemFallback(batch);
          const results = data.data.results as Array<{ clientId: string; status: string; message?: string }>;
          const resultById = new Map(results.map((result) => [result.clientId, result]));

          for (const item of batch) {
            const result = resultById.get(item.clientId);
            if (result?.status === 'synced' || result?.status === 'duplicate') {
              current.set(item.clientId, { ...item, status: 'synced', lastError: undefined });
              completed += 1;
              if (item.collection === 'boundaryWalks') {
                const draftKey = boundaryDraftKey(item.appId, item.payload?.unitId, item.payload?.siteId);
                const draft = get().boundaryDrafts[draftKey];
                if (boundaryDraftMatchesQueuedWalk(draft, item.payload)) {
                  get().clearBoundaryDraft(draftKey);
                }
              }
            } else {
              const isConflict = result?.status === 'conflict';
              current.set(item.clientId, {
                ...item,
                status: 'failed',
                attempts: (item.attempts ?? 0) + 1,
                lastAttemptAt: Date.now(),
                lastError: result?.message ?? 'The server did not confirm this item.',
              });
              if (isConflict) conflicts += 1;
              else errors += 1;
            }
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Sync request failed.';
          for (const item of batch) {
            current.set(item.clientId, {
              ...item,
              status: 'failed',
              attempts: (item.attempts ?? 0) + 1,
              lastAttemptAt: Date.now(),
              lastError: message,
            });
            errors += 1;
          }
        }
      }

      const blocked = new Set(sendable.map((item) => item.clientId));
      for (const item of jsonWork) {
        if (!blocked.has(item.clientId)) {
          current.set(item.clientId, {
            ...item,
            status: 'failed',
            lastError: 'Upload the required local evidence before submitting this step.',
          });
        }
      }

      const updated = [...current.values()]
        .sort((a, b) => a.createdAt - b.createdAt)
        .slice(-500);
      saveQueue(updated);
      set({ queue: updated });
      return { synced: completed, conflicts, errors };
    } catch (error) {
      console.error('Offline sync could not complete.', error);
      return { synced: 0, conflicts: 0, errors: work.length };
    } finally {
      set({ isSyncing: false });
    }
  },

  markSyncCompleted: () => {
    const lastSyncAt = Date.now();
    storage.set(LAST_SYNC_KEY, lastSyncAt);
    set({ lastSyncAt });
  },

  clearQueue: () => {
    const synced = get().queue.filter((item) => item.status === 'synced');
    saveQueue(synced);
    set({ queue: synced });
  },
}));

function recoverEndedBoundaryDrafts(): void {
  const { boundaryDrafts, queueBoundaryDraft } = useOfflineStore.getState();
  for (const [draftKey, draft] of Object.entries(boundaryDrafts)) {
    if (draft.endedAt != null && draft.points.length >= 3) {
      queueBoundaryDraft(draftKey);
    }
  }
}

recoverEndedBoundaryDrafts();
