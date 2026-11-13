import { create } from 'zustand';
import { MMKV } from 'react-native-mmkv';
import { nanoid } from 'nanoid';
import { syncApi } from '@/services/api';
import type { OfflineQueueItem, SyncCollection } from '@/types';

const storage = new MMKV({ id: 'offline-queue' });
const QUEUE_KEY = 'queue';
const BOUNDARY_DRAFTS_KEY = 'boundary-drafts';

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
 * A client id the server will accept.
 *
 * `nanoid()` alone produced 21 URL-safe characters, and the sync endpoint
 * declared `clientId` as a UUID — so every batch was refused with a 400
 * before it reached a handler, and this queue has never successfully
 * synced anything. The server no longer insists on the format, because
 * the id is only an idempotency key; this emits a v4-shaped id anyway so
 * a phone built today works against a server not yet updated.
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
 * Only for a 4xx. A 5xx or a connection failure means the server is not
 * answering, and splitting one dead request into fifty would drain a
 * field phone to learn the same thing.
 */
async function sendWithPerItemFallback(queue: OfflineQueueItem[]): Promise<BatchOutcome> {
  try {
    return (await syncApi.batch(queue)) as BatchOutcome;
  } catch (err) {
    const status = (err as { response?: { status?: number } })?.response?.status;

    if (queue.length < 2 || status === undefined || status < 400 || status >= 500) {
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
  const hex = nanoid(32).replace(/[^0-9a-f]/gi, '') + Math.random().toString(16).slice(2);
  const h = (hex + '0'.repeat(32)).slice(0, 32).toLowerCase();

  return [
    h.slice(0, 8),
    h.slice(8, 12),
    /* Version 4 and the variant bits, so it is a well-formed v4. */
    '4' + h.slice(13, 16),
    (['8', '9', 'a', 'b'][Math.floor(Math.random() * 4)] as string) + h.slice(17, 20),
    h.slice(20, 32)
  ].join('-');
}

function loadQueue(): OfflineQueueItem[] {
  try {
    const raw = storage.getString(QUEUE_KEY);
    return raw ? (JSON.parse(raw) as OfflineQueueItem[]) : [];
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

interface OfflineState {
  queue: OfflineQueueItem[];
  boundaryDrafts: Record<string, BoundaryWalkDraft>;
  isSyncing: boolean;
  lastSyncAt: number | null;
  enqueue: (
    collection: SyncCollection,
    appId: string,
    payload: Record<string, unknown>
  ) => void;
  saveBoundaryDraft: (
    appId: string,
    points: Array<Omit<BoundaryDraftPoint, 'timestamp'> & { timestamp: Date | string }>
  ) => void;
  /** Declare the walking finished. The upload may still be outstanding. */
  endBoundaryDraft: (appId: string) => void;
  clearBoundaryDraft: (appId: string) => void;
  sync: () => Promise<{ synced: number; conflicts: number; errors: number }>;
  clearQueue: () => void;
}

export const useOfflineStore = create<OfflineState>((set, get) => ({
  queue: loadQueue(),
  boundaryDrafts: loadBoundaryDrafts(),
  isSyncing: false,
  lastSyncAt: null,

  enqueue: (collection, appId, payload) => {
    const item: OfflineQueueItem = {
      clientId: generateId(),
      collection,
      appId,
      payload,
      clientTimestamp: new Date().toISOString(),
      createdAt: Date.now(),
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
    const latestWins: SyncCollection[] = ['boundaryWalks', 'gpsCenters'];
    /*
      Superseded per UNIT, not per farm. A farm can have many ponds or
      plots, each with its own boundary, and matching on the farm alone
      would have let one unit's queued walk evict another's — the same
      collision the stored draft had.
    */
    const unitOf = (p: Record<string, unknown> | undefined) => (p?.unitId as string | null | undefined) ?? '';
    const kept = latestWins.includes(collection)
      ? get().queue.filter(
          (q) =>
            !(q.collection === collection && q.appId === appId && unitOf(q.payload) === unitOf(payload))
        )
      : get().queue;

    const updated = [...kept, item];
    saveQueue(updated);
    set({ queue: updated });
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

  sync: async () => {
    const { queue, isSyncing } = get();
    if (isSyncing || queue.length === 0) {
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

        So a 4xx — something about what WE sent — is retried one item at a
        time, and only the items the server genuinely cannot take are left
        behind. A 5xx or a dead connection is not retried that way: the
        server is simply not there, and sending fifty requests to find
        that out again every ten seconds would be rude to a phone running
        on a field battery.
      */
      const { data } = await sendWithPerItemFallback(queue);
      const summary = data.data.summary as {
        synced: number;
        conflicts: number;
        errors: number;
        duplicates: number;
      };
      const results = data.data.results as Array<{
        clientId: string;
        status: string;
      }>;

      const status = new Map(results.map((r) => [r.clientId, r.status]));
      const remaining: OfflineQueueItem[] = [];

      for (const item of queue) {
        const outcome = status.get(item.clientId);

        /* Landed, or landed on an earlier attempt. Done with it. */
        if (outcome === 'synced' || outcome === 'duplicate') {
          continue;
        }

        /*
          NOTHING IS EVER DISCARDED FOR FAILING.

          This counted attempts and dropped an item at five, to stop a
          hopeless entry costing battery forever. That reasoning does not
          survive contact with the situation this app is actually in: the
          server it talks to cannot be updated until a bill is paid, so
          every queued walk is currently an item the server rejects — and
          a retry counter would have quietly deleted a coordinator's
          morning in under a minute.

          A boundary walk is an hour on foot in a field. It is not
          replayable, it is not cheap, and no automatic rule gets to throw
          it away. The count is kept so the Sync Centre can show that
          something is not getting through; acting on it is a person's
          decision.
        */
        if (outcome === 'error') {
          remaining.push({ ...item, attempts: (item.attempts ?? 0) + 1 });
          continue;
        }

        remaining.push(item);
      }

      saveQueue(remaining);
      set({ queue: remaining, lastSyncAt: Date.now() });
      return { synced: summary.synced, conflicts: summary.conflicts, errors: summary.errors };
    } catch {
      /*
        Swallowed on purpose. This runs on a timer that nobody asked for,
        so a transport failure is not news — the queue is untouched and
        the next tick tries again. It used to throw out of here into an
        unhandled rejection every ten seconds.
      */
      return { synced: 0, conflicts: 0, errors: 0 };
    } finally {
      set({ isSyncing: false });
    }
  },

  clearQueue: () => {
    storage.delete(QUEUE_KEY);
    set({ queue: [] });
  },
}));
