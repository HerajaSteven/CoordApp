import { api } from './client';
import type {
  ApiResponse,
  AuthTokens,
  ClosedWalk,
  ClusterFarm,
  ClusterListResponse,
  CollectableFarm,
  Coordinator,
  FarmProfile,
  FarmRegistration,
  FarmTypeCategory,
  FarmVisit,
  HarvestThresholds,
  Incident,
  LoginInput,
  MapConfig,
  OfflineQueueItem,
  PaginatedResponse,
  TimelineEvent,
  VerificationRecord,
} from '@/types';

// ─── Auth ─────────────────────────────────────────────────────────────────────
export const authApi = {
  login: (input: LoginInput) =>
    api.post<ApiResponse<AuthTokens & { coordinator: Coordinator }>>('/auth/login', input),
  refresh: (refreshToken: string) =>
    api.post<ApiResponse<AuthTokens>>('/auth/refresh', { refreshToken }),
  logout: () => api.post('/auth/logout'),
  /** Sends a reset code to the email. How a newly approved coordinator sets a first password. */
  forgotPassword: (email: string) =>
    api.post<ApiResponse<{ message: string }>>('/auth/forgot-password', { email }),
  resetPassword: (input: { email: string; code: string; password: string }) =>
    api.post<ApiResponse<{ message: string }>>('/auth/reset-password', input),
};

// ─── Coordinator ──────────────────────────────────────────────────────────────
export const coordinatorApi = {
  me: () => api.get<ApiResponse<Coordinator>>('/coordinators/me'),
};

// ─── Farms ────────────────────────────────────────────────────────────────────
export interface FarmListParams {
  search?: string;
  status?: string;
  page?: number;
  limit?: number;
}

async function fetchAllFarms(params: FarmListParams = {}) {
  const limit = params.limit ?? 100;
  let page = params.page ?? 1;

  const first = await api.get<ApiResponse<PaginatedResponse<FarmRegistration>>>('/farms', {
    params: { ...params, page, limit }
  });

  const firstData = first.data.data;
  const items = [...firstData.items];

  while (page < firstData.totalPages) {
    page += 1;
    const next = await api.get<ApiResponse<PaginatedResponse<FarmRegistration>>>('/farms', {
      params: { ...params, page, limit }
    });
    items.push(...next.data.data.items);
  }

  return {
    ...first,
    data: {
      ...first.data,
      data: {
        ...firstData,
        items,
        page: 1,
        limit,
        totalPages: Math.ceil(firstData.total / limit) || 1
      }
    }
  };
}

export const farmsApi = {
  assigned: (params: FarmListParams = {}) =>
    api.get<ApiResponse<PaginatedResponse<FarmRegistration>>>('/farms', { params }),
  all: (params: FarmListParams = {}) =>
    api.get<ApiResponse<PaginatedResponse<FarmRegistration>>>('/farms', { params }),
  allPages: (params: FarmListParams = {}) => fetchAllFarms(params),
  profile: (appId: string) =>
    api.get<ApiResponse<FarmProfile>>(`/farms/${appId}/profile`),
};

// ─── Categories ───────────────────────────────────────────────────────────────
export const categoriesApi = {
  list: (kind?: 'crop' | 'livestock') =>
    api.get<ApiResponse<FarmTypeCategory[]>>('/categories', { params: { kind, status: 'active' } }),
};

// ─── Harvest ──────────────────────────────────────────────────────────────────
/*
  Collection is the platform’s, carried under this agent’s own name — the
  service names them, so a pickup is recorded against whoever stood on the
  farm rather than against the backend that carried it.
*/
export const harvestApi = {
  collectableFarms: () => api.get<ApiResponse<CollectableFarm[]>>('/harvest/collectable-farms'),
  thresholds: () => api.get<ApiResponse<HarvestThresholds>>('/harvest/thresholds'),
  collections: () => api.get<ApiResponse<unknown[]>>('/harvest/collections'),
  drivers: () => api.get<ApiResponse<Array<{ id: number; fullName: string; phone: string | null }>>>('/harvest/drivers'),
  confirm: (body: {
    livestock_batch_id: string;
    farm_identity_id: string;
    category: string;
    headcount_collected: number;
    avg_weight_kg: string;
    region?: string;
    driver_id?: number;
    /** Photos of the weighing, from uploadCapturedFile(). At least one. */
    evidence_file_ids: string[];
  }, clientId?: string) => api.post('/harvest/collections', body, {
    headers: clientId ? { 'Idempotency-Key': clientId } : undefined,
  }),
};

// ─── Map ──────────────────────────────────────────────────────────────────────
export const mapApi = {
  config: () => api.get<ApiResponse<MapConfig>>('/map/config'),
};

// ─── Verification Steps ───────────────────────────────────────────────────────
export const verificationApi = {
  get: (appId: string, unitId?: string, siteId?: string) =>
    api.get<ApiResponse<VerificationRecord>>(`/verifications/${appId}`, { params: { unitId, siteId } }),
  identity: (appId: string, body: {
    confirmed: boolean;
    confidence?: number;
    mismatchReason?: string;
    mismatchNotes?: string;
  }, unitId?: string, siteId?: string) => api.post(`/verifications/${appId}/identity`, body, { params: { unitId, siteId } }),
  /* `categories` is WHICH crops and which livestock — "livestock farm" does
     not say whether to ask about birds or about catfish. */
  farmType: (appId: string, farmType: 'crop' | 'livestock' | 'mixed', categories: string[], unitId?: string, siteId?: string) =>
    api.post(`/verifications/${appId}/farm-type`, { farmType, categories }, { params: { unitId, siteId } }),
  gps: (appId: string, body: { centerLat: number; centerLng: number; accuracyMeters: number }, unitId?: string, siteId?: string) =>
    api.put(`/verifications/${appId}/gps`, body, { params: { unitId, siteId } }),
  landOwnership: (appId: string, body: {
    ownershipType: string;
    docRef: string;
    docIssueDate: string;
    activeDispute: boolean;
    encumbrance: boolean;
    notes?: string;
  }, unitId?: string, siteId?: string) => api.put(`/verifications/${appId}/land-ownership`, body, { params: { unitId, siteId } }),
  infrastructure: (appId: string, body: {
    waterSource: string;
    irrigationStatus: string;
    roadCondition: string;
    distanceToRoadValue: number;
    distanceToRoadUnit: string;
    storageType: string;
    storageCapacityTonnes?: number;
  }, unitId?: string, siteId?: string) => api.put(`/verifications/${appId}/infrastructure`, body, { params: { unitId, siteId } }),
  capacity: (appId: string, body: {
    measurementMethod: string;
    crops: Array<{ categoryKey: string; fields: Record<string, unknown> }>;
    livestock: Array<{ categoryKey: string; fields: Record<string, unknown> }>;
  }, unitId?: string, siteId?: string) => api.put(`/verifications/${appId}/capacity`, body, { params: { unitId, siteId } }),
  evidenceComplete: (appId: string, unitId?: string, siteId?: string) =>
    api.post(`/verifications/${appId}/evidence/complete`, {}, { params: { unitId, siteId } }),
  certify: (appId: string, unitId?: string, siteId?: string) =>
    api.post(`/verifications/${appId}/certify`, { statementConfirmed: true }, { params: { unitId, siteId } }),
  submit: (appId: string, unitId?: string, siteId?: string) =>
    api.post(`/verifications/${appId}/submit`, {}, { params: { unitId, siteId } }),
  approve: (appId: string, unitId?: string, siteId?: string) =>
    api.post(`/verifications/${appId}/approve`, {}, { params: { unitId, siteId } }),
};

// ─── Boundaries ───────────────────────────────────────────────────────────────
/**
 * Which unit a boundary call is about.
 *
 * EVERY CALL HERE USED TO OMIT IT, and the server reads it off the query
 * string on all five routes. So a walk recorded against a pond or a plot
 * went to the farm's own boundary instead: walking the second unit
 * overwrote the first, and every unit's screen showed the farm's walk as
 * though it were its own.
 *
 * Three states, which the platform relies on. A named unit is that unit.
 * An empty string is the farm taken as a whole — and it must be sent as
 * `?unitId=`, present and empty, because a farm walked whole stores an
 * empty unit id rather than null. Omitted entirely means "whichever walk
 * this farm has", which is the right question only when nobody has said
 * which unit they mean.
 */
function unitQuery(unitId?: string, siteId?: string): string {
  if (siteId !== undefined) return `?siteId=${encodeURIComponent(siteId)}`;
  return unitId === undefined ? '' : `?unitId=${encodeURIComponent(unitId)}`;
}

export const boundaryApi = {
  get: (appId: string, unitId?: string, siteId?: string) => api.get(`/boundaries/${appId}${unitQuery(unitId, siteId)}`),
  startWalk: (appId: string, unitId?: string, siteId?: string) =>
    api.post(`/boundaries/${appId}/start${unitQuery(unitId, siteId)}`),
  pauseWalk: (appId: string, unitId?: string, siteId?: string) => api.post<ApiResponse<{ pointCount: number; isWalkActive: boolean; hasPolygon: boolean }>>(
    `/boundaries/${appId}/pause${unitQuery(unitId, siteId)}`
  ),
  /*
    `capturedAt` is when the receiver took the fix, and leaving it out was
    a real loss of data. `useGPS` has always recorded it — the GPS gives
    it with every reading — and this body dropped it, so the server
    stamped each point when the request landed. The walk duration then
    measured the upload: one boundary stored 4 km of ground covered in
    34 seconds, and the anti-fraud rule passed it.
  */
  addPoint: (
    appId: string,
    body: { lat: number; lng: number; accuracyMeters: number; capturedAt?: string },
    unitId?: string,
    siteId?: string
  ) => api.post(`/boundaries/${appId}/points${unitQuery(unitId, siteId)}`, body),
  closeWalk: (appId: string, forceReset = false, unitId?: string, siteId?: string) =>
    api.post<ApiResponse<ClosedWalk>>(`/boundaries/${appId}/close${unitQuery(unitId, siteId)}`, { forceReset }),

  /**
   * THE WHOLE WALK, IN ONE REQUEST. Use this, not the three calls above.
   *
   * `startWalk` + one `addPoint` per fix + `closeWalk` is 502 sequential
   * requests for a 500-point walk, and they go over the worst connection
   * in the system. A 500-point walk of Ogun-osun 65 put 52 points on the
   * server in 37 seconds and then stopped — request 53 hit the client's
   * 15-second timeout and some 450 points were never sent. At the 710 ms
   * per request that link managed, the full walk needed six uninterrupted
   * minutes.
   *
   * It also leaves no lock behind, because there is no `start`.
   */
  saveWalk: (
    appId: string,
    points: Array<{ lat: number; lng: number; accuracyMeters: number; capturedAt: string ; bridged?: boolean; bridgeReason?: string }>,
    unitId?: string,
    siteId?: string
  ) => api.post<ApiResponse<ClosedWalk>>(`/boundaries/${appId}/walk${unitQuery(unitId, siteId)}`, { points }),
};

// ─── Uploads ──────────────────────────────────────────────────────────────────
export const uploadsApi = {
  presign: (filename: string, contentType: string) =>
    api.get<ApiResponse<{ uploadUrl: string; fileUrl: string; signature: string; apiKey: string; timestamp: number; folder: string; publicId: string }>>(
      '/uploads/presign',
      { params: { filename, contentType } }
    ),
  /* `fileId` comes from uploadCapturedFile(). The service reads the rest from the stored file. */
  confirmPhoto: (appId: string, body: {
    relatedTo: string;
    slotKey?: string;
    fileId: string;
    capturedAt: string;
    gpsTagLat?: number;
    gpsTagLng?: number;
    unitId?: string;
    siteId?: string;
  }, clientId?: string) => api.post(`/uploads/photos/${appId}`, body, {
    headers: clientId ? { 'Idempotency-Key': clientId } : undefined,
  }),
  confirmDocument: (appId: string, body: {
    relatedTo: 'identity' | 'landOwnership';
    fileId: string;
    capturedAt: string;
  }) => api.post(`/uploads/documents/${appId}`, body),
  photos: (appId: string, relatedTo?: string, unitId?: string, siteId?: string) =>
    api.get(`/uploads/photos/${appId}`, { params: { relatedTo, unitId, siteId } }),
};

// ─── Visits ───────────────────────────────────────────────────────────────────
export const visitsApi = {
  list: (appId: string, params: { page?: number; limit?: number } = {}) =>
    api.get<ApiResponse<PaginatedResponse<FarmVisit>>>(`/visits/${appId}`, { params }),
  /*
    The whole schema the service validates. Three of these fields could not
    be sent before — nutrient deficiency, water supply and fertiliser status
    were accepted by the backend and absent here, so an inspection could
    never record them.
  */
  create: (appId: string, body: {
    visitType: 'verification' | 'inspection';
    visitedAt: string;
    cropHealth?: 'excellent' | 'good' | 'fair' | 'poor';
    pestSigns?: boolean;
    diseaseSigns?: boolean;
    nutrientDeficiencySigns?: boolean;
    waterSupplyStatus?: string;
    fertilizerApplicationStatus?: string;
    notes?: string;
  }) => api.post(`/visits/${appId}`, body),
};

// ─── Incidents ────────────────────────────────────────────────────────────────
export const incidentsApi = {
  list: (appId: string) =>
    api.get<ApiResponse<PaginatedResponse<Incident>>>(`/incidents/${appId}`),
  create: (appId: string, body: {
    incidentType: string;
    severity: 'low' | 'medium' | 'high_critical';
    incidentDateTime: string;
    description: string;
    actionTaken?: string;
  }) => api.post(`/incidents/${appId}`, body),
};

// ─── Timeline ─────────────────────────────────────────────────────────────────
export const timelineApi = {
  get: (appId: string) =>
    api.get<ApiResponse<PaginatedResponse<TimelineEvent>>>(`/timeline/${appId}`),
};


// ─── Farm Sites (geographic containers, e.g. "Orolu Pond Cluster") ────────────
export const sitesApi = {
  list: (appId: string) =>
    api.get<ApiResponse<import('@/types').SiteListResponse>>(`/farms/${appId}/sites`),
  get: (appId: string, siteId: string) =>
    api.get<ApiResponse<{ site: import('@/types').FarmSite; units: import('@/types').FarmUnit[] }>>(
      `/farms/${appId}/sites/${siteId}`
    ),
  create: (appId: string, body: import('@/types').CreateSiteInput) =>
    api.post<ApiResponse<import('@/types').FarmSite>>(`/farms/${appId}/sites`, body),
  update: (appId: string, siteId: string, body: Partial<import('@/types').CreateSiteInput & { status: string }>) =>
    api.patch(`/farms/${appId}/sites/${siteId}`, body),
  verify: (appId: string, siteId: string, body: import('@/types').VerifySiteInput) =>
    api.post(`/farms/${appId}/sites/${siteId}/verify`, body),
};

// ─── Cluster Farms (admin-created, assigned to coordinator for field verification) ─
export const clustersApi = {
  list: () => api.get<ApiResponse<ClusterListResponse>>('/clusters'),
  get: (clusterId: string) =>
    api.get<ApiResponse<{ cluster: ClusterFarm; assignment: unknown }>>(`/clusters/${clusterId}`),
};

// ─── Farm Units (ponds, plots, etc. within a site) ────────────────────────────
export const unitsApi = {
  list: (appId: string, siteId: string) =>
    api.get<ApiResponse<import('@/types').UnitListResponse>>(`/farms/${appId}/sites/${siteId}/units`),
  get: (appId: string, siteId: string, unitId: string) =>
    api.get<ApiResponse<import('@/types').FarmUnit>>(`/farms/${appId}/sites/${siteId}/units/${unitId}`),
  create: (appId: string, siteId: string, body: import('@/types').CreateUnitInput) =>
    api.post<ApiResponse<import('@/types').FarmUnit>>(`/farms/${appId}/sites/${siteId}/units`, body),
  update: (
    appId: string,
    siteId: string,
    unitId: string,
    body: Partial<import('@/types').CreateUnitInput & { status: string }>
  ) => api.patch(`/farms/${appId}/sites/${siteId}/units/${unitId}`, body),
};

// ─── Sync ─────────────────────────────────────────────────────────────────────
export const syncApi = {
  batch: (items: OfflineQueueItem[]) =>
    api.post('/sync/batch', { items }),
  status: (appId: string) =>
    api.get(`/sync/status/${appId}`),
};
