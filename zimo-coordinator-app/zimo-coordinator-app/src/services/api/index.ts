import { api } from './client';
import type {
  LoginInput,
  AuthTokens,
  Coordinator,
  FarmRegistration,
  FarmProfile,
  FarmTypeCategory,
  PaginatedResponse,
  ApiResponse,
  VerificationRecord,
  FarmVisit,
  Incident,
  OfflineQueueItem,
  TimelineEvent,
} from '@/types';

// ─── Auth ─────────────────────────────────────────────────────────────────────
export const authApi = {
  login: (input: LoginInput) =>
    api.post<ApiResponse<AuthTokens & { coordinator: Coordinator }>>('/auth/login', input),
  refresh: (refreshToken: string) =>
    api.post<ApiResponse<AuthTokens>>('/auth/refresh', { refreshToken }),
  logout: () => api.post('/auth/logout'),
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

export const farmsApi = {
  assigned: (params: FarmListParams = {}) =>
    api.get<ApiResponse<PaginatedResponse<FarmRegistration>>>('/farms', { params }),
  all: (params: FarmListParams = {}) =>
    api.get<ApiResponse<PaginatedResponse<FarmRegistration>>>('/farms', { params }),
  profile: (appId: string) =>
    api.get<ApiResponse<FarmProfile>>(`/farms/${appId}/profile`),
};

// ─── Categories ───────────────────────────────────────────────────────────────
export const categoriesApi = {
  list: (kind?: 'crop' | 'livestock') =>
    api.get<ApiResponse<FarmTypeCategory[]>>('/categories', { params: { kind, status: 'active' } }),
};

// ─── Verification Steps ───────────────────────────────────────────────────────
export const verificationApi = {
  get: (appId: string, unitId?: string) =>
    api.get<ApiResponse<VerificationRecord>>(`/verifications/${appId}`, { params: { unitId } }),
  identity: (appId: string, body: {
    confirmed: boolean;
    confidence?: number;
    mismatchReason?: string;
    mismatchNotes?: string;
  }, unitId?: string) => api.post(`/verifications/${appId}/identity`, body, { params: { unitId } }),
  farmType: (appId: string, farmType: 'crop' | 'livestock' | 'mixed', unitId?: string) =>
    api.post(`/verifications/${appId}/farm-type`, { farmType }, { params: { unitId } }),
  gps: (appId: string, body: { centerLat: number; centerLng: number; accuracyMeters: number }, unitId?: string) =>
    api.put(`/verifications/${appId}/gps`, body, { params: { unitId } }),
  landOwnership: (appId: string, body: {
    ownershipType: string;
    docRef: string;
    docIssueDate: string;
    activeDispute: boolean;
    encumbrance: boolean;
    notes?: string;
  }, unitId?: string) => api.put(`/verifications/${appId}/land-ownership`, body, { params: { unitId } }),
  infrastructure: (appId: string, body: {
    waterSource: string;
    irrigationStatus: string;
    roadCondition: string;
    distanceToRoadValue: number;
    distanceToRoadUnit: string;
    storageType: string;
    storageCapacityTonnes?: number;
  }, unitId?: string) => api.put(`/verifications/${appId}/infrastructure`, body, { params: { unitId } }),
  capacity: (appId: string, body: {
    measurementMethod: string;
    crops: Array<{ categoryKey: string; fields: Record<string, unknown> }>;
    livestock: Array<{ categoryKey: string; fields: Record<string, unknown> }>;
  }, unitId?: string) => api.put(`/verifications/${appId}/capacity`, body, { params: { unitId } }),
  evidenceComplete: (appId: string, unitId?: string) =>
    api.post(`/verifications/${appId}/evidence/complete`, {}, { params: { unitId } }),
  certify: (appId: string, unitId?: string) =>
    api.post(`/verifications/${appId}/certify`, { statementConfirmed: true }, { params: { unitId } }),
  submit: (appId: string, unitId?: string) =>
    api.post(`/verifications/${appId}/submit`, {}, { params: { unitId } }),
  approve: (appId: string, unitId?: string) =>
    api.post(`/verifications/${appId}/approve`, {}, { params: { unitId } }),
};

// ─── Boundaries ───────────────────────────────────────────────────────────────
export const boundaryApi = {
  get: (appId: string) => api.get(`/boundaries/${appId}`),
  startWalk: (appId: string) => api.post(`/boundaries/${appId}/start`),
  addPoint: (appId: string, body: { lat: number; lng: number; accuracyMeters: number }) =>
    api.post(`/boundaries/${appId}/points`, body),
  closeWalk: (appId: string, forceReset = false) =>
    api.post(`/boundaries/${appId}/close`, { forceReset }),
};

// ─── Uploads ──────────────────────────────────────────────────────────────────
export const uploadsApi = {
  presign: (filename: string, contentType: string) =>
    api.get<ApiResponse<{ uploadUrl: string; fileUrl: string; signature: string; apiKey: string; timestamp: number; folder: string; publicId: string }>>(
      '/uploads/presign',
      { params: { filename, contentType } }
    ),
  confirmPhoto: (appId: string, body: {
    relatedTo: string;
    slotKey?: string;
    filename: string;
    url: string;
    mimeType: string;
    sizeBytes: number;
    capturedAt: string;
    gpsTagLat?: number;
    gpsTagLng?: number;
  }) => api.post(`/uploads/photos/${appId}`, body),
  confirmDocument: (appId: string, body: {
    relatedTo: 'identity' | 'landOwnership';
    filename: string;
    url: string;
    mimeType: string;
    sizeBytes: number;
    capturedAt: string;
  }) => api.post(`/uploads/documents/${appId}`, body),
  photos: (appId: string, relatedTo?: string) =>
    api.get(`/uploads/photos/${appId}`, { params: { relatedTo } }),
};

// ─── Visits ───────────────────────────────────────────────────────────────────
export const visitsApi = {
  list: (appId: string, params: { page?: number; limit?: number } = {}) =>
    api.get<ApiResponse<PaginatedResponse<FarmVisit>>>(`/visits/${appId}`, { params }),
  create: (appId: string, body: {
    visitType: 'verification' | 'inspection';
    visitedAt: string;
    cropHealth?: string;
    pestSigns?: boolean;
    diseaseSigns?: boolean;
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
