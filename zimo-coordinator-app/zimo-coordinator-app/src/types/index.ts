// ─── Auth ─────────────────────────────────────────────────────────────────────
export interface LoginInput {
  email: string;
  password: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface Coordinator {
  coordinatorId: string;
  name: string;
  phone: string;
  email: string;
  state: string;
  lga: string;
  role: 'SuperAdmin' | 'StateAdmin' | 'Coordinator' | 'Verifier';
  status: 'active' | 'suspended';
  organizationSlug: string;
}

// ─── Farm Registration (read-only from external system) ───────────────────────
export interface FarmRegistration {
  appId: string;
  name: string;
  phone: string;
  email: string;
  state: string;
  lga: string;
  address: string;
  farmerType: string;
  farmName: string;
  farmLocation: string;
  farmSize: string;
  farmUnit: string;
  farmType: string[];
  idType: string;
  status: string;
  paymentStatus: 'pending' | 'paid' | 'failed' | string;
  organizationSlug: string;
  createdAt: string;
}

// ─── Verification ─────────────────────────────────────────────────────────────
export type VerificationStep =
  | 'identity'
  | 'farmType'
  | 'gps'
  | 'landOwnership'
  | 'infrastructure'
  | 'capacity'
  | 'evidence'
  | 'review';

export type VerificationStatus =
  | 'in_progress'
  | 'submitted'
  | 'approved'
  | 'rejected'
  | 'identity_mismatch';

export interface VerificationRecord {
  currentStep: VerificationStep;
  completedSteps: VerificationStep[];
  overallStatus: VerificationStatus;
  farmTypeSelected: 'crop' | 'livestock' | 'mixed' | null;
  identity: {
    status: 'pending' | 'matched' | 'confirmed' | 'mismatch';
    confidence: number | null;
    coordinatorConfirmed: boolean;
    confirmedAt: string | null;
    mismatchReason: string | null;
    mismatchNotes: string | null;
  };
  gps: {
    centerLat: number | null;
    centerLng: number | null;
    accuracyMeters: number | null;
    verifiedAt: string | null;
  };
  landOwnership: {
    ownershipType: string | null;
    docRef: string | null;
    docIssueDate: string | null;
    activeDispute: boolean;
    encumbrance: boolean;
    notes: string | null;
    verifiedAt: string | null;
  };
  infrastructure: {
    waterSource: string | null;
    irrigationStatus: string | null;
    roadCondition: string | null;
    distanceToRoadValue: number | null;
    distanceToRoadUnit: string | null;
    storageType: string | null;
    storageCapacityTonnes: number | null;
    verifiedAt: string | null;
  };
  capacity: {
    measurementMethod: string | null;
    crops: DynamicCategoryEntry[];
    livestock: DynamicCategoryEntry[];
    verifiedAt: string | null;
  };
  certification: {
    statementText: string | null;
    coordinatorId: string | null;
    confirmedAt: string | null;
  };
  submittedAt: string | null;
  approvedAt: string | null;
  syncStatus: 'synced' | 'pending' | 'conflict';
}

export interface DynamicCategoryEntry {
  categoryKey: string;
  categoryLabel: string;
  fields: Record<string, unknown>;
}

// ─── Boundary ─────────────────────────────────────────────────────────────────
export interface BoundaryRecord {
  areaHectares: number | null;
  areaDiscrepancyPct: number | null;
  walkDurationSeconds: number | null;
  declaredAreaValue: string | null;
  declaredAreaUnit: string | null;
  pointCount: number;
  isWalkActive: boolean;
  verifiedAt: string | null;
}

// ─── Merged Farm Profile ──────────────────────────────────────────────────────
export interface FarmProfile {
  registration: FarmRegistration;
  verification: VerificationRecord | null;
  timeline: TimelineEvent[];
  boundary: BoundaryRecord | null;
  photos: UploadedPhoto[];
  documents: UploadedDocument[];
  sites: Array<{ siteId: string; siteNumber: number; label: string; address: string | null; status: SiteStatus }>;
  computed: {
    verificationStatus: string;
    profileCompletion: number;
    lastVisit: string | null;
    assignedCoordinator: string | null;
    assignmentStatus: string;
    riskLevel: 'low' | 'medium' | 'high' | null;
    totalSites: number;
    verifiedSites: number;
  };
}

// ─── Timeline ─────────────────────────────────────────────────────────────────
export interface TimelineEvent {
  _id: string;
  eventType: string;
  summary: string;
  actorId: string;
  metadata: Record<string, unknown>;
  occurredAt: string;
}

// ─── Uploads ─────────────────────────────────────────────────────────────────
export interface UploadedPhoto {
  relatedTo: string;
  slotKey: string | null;
  url: string;
  filename: string;
  capturedAt: string;
}

export interface UploadedDocument {
  relatedTo: string;
  url: string;
  filename: string;
  capturedAt: string;
}

// ─── Category ─────────────────────────────────────────────────────────────────
export interface CategoryFieldDef {
  key: string;
  label: string;
  type: 'text' | 'number' | 'boolean' | 'select' | 'date';
  required: boolean;
  options?: string[];
  unit?: string;
}

export interface FarmTypeCategory {
  _id: string;
  kind: 'crop' | 'livestock';
  categoryKey: string;
  label: string;
  icon: string | null;
  fieldSchema: CategoryFieldDef[];
  status: 'active' | 'archived';
}

// ─── Visits ──────────────────────────────────────────────────────────────────
export interface FarmVisit {
  _id: string;
  appId: string;
  visitType: 'verification' | 'inspection';
  visitNumber: number;
  visitedAt: string;
  cropHealth: 'excellent' | 'good' | 'fair' | 'poor' | null;
  pestSigns: boolean;
  notes: string | null;
}

// ─── Incidents ────────────────────────────────────────────────────────────────
export interface Incident {
  _id: string;
  appId: string;
  incidentType: string;
  severity: 'low' | 'medium' | 'high_critical';
  incidentDateTime: string;
  description: string;
  actionTaken: string | null;
  status: 'open' | 'escalated' | 'resolved';
}


// ─── Farm Sites (geographic containers — e.g. "Orolu Pond Cluster") ───────────
export type SiteStatus = 'pending' | 'in_progress' | 'verified' | 'flagged';

export interface SiteVerification {
  gpsLat: number | null;
  gpsLng: number | null;
  accuracyMeters: number | null;
  gpsVerifiedAt: string | null;
  entrancePhotoUrl: string | null;
  overviewPhotoUrl: string | null;
  coordinatorNotes: string | null;
  verifiedAt: string | null;
  verifiedBy: string | null;
}

export interface FarmSite {
  _id: string;
  registrationId: string;
  appId: string;
  siteId: string;
  siteNumber: number;
  label: string;
  address: string | null;
  notes: string | null;
  status: SiteStatus;
  verification: SiteVerification;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  unitSummary?: {
    total: number;
    verified: number;
    inProgress: number;
    pending: number;
    allVerified: boolean;
  };
}

export interface SiteListResponse {
  sites: FarmSite[];
  summary: {
    total: number;
    verified: number;
    inProgress: number;
    pending: number;
    allVerified: boolean;
  };
}

export interface CreateSiteInput {
  label: string;
  address?: string;
  notes?: string;
}

export interface VerifySiteInput {
  gpsLat: number;
  gpsLng: number;
  accuracyMeters: number;
  coordinatorNotes?: string;
  entrancePhotoUrl?: string;
  overviewPhotoUrl?: string;
}

// ─── Farm Units (ponds, plots, etc. within a site) ────────────────────────────
export type UnitType = 'pond' | 'plot' | 'paddock' | 'pen' | 'greenhouse' | 'orchard' | 'other';
export type UnitStatus = 'pending' | 'in_progress' | 'verified' | 'flagged';

export interface FarmUnit {
  _id: string;
  registrationId: string;
  appId: string;
  siteId: string;
  unitId: string;
  unitNumber: number;
  label: string;
  unitType: UnitType;
  primaryFocus: string | null;
  secondaryFocus: string | null;
  status: UnitStatus;
  notes: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface UnitListResponse {
  units: FarmUnit[];
  summary: {
    total: number;
    verified: number;
    inProgress: number;
    pending: number;
    flagged: number;
    allVerified: boolean;
  };
}

export interface CreateUnitInput {
  label: string;
  unitType: UnitType;
  primaryFocus?: string;
  secondaryFocus?: string;
  notes?: string;
}

// ─── Pagination ───────────────────────────────────────────────────────────────
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// ─── API wrapper ──────────────────────────────────────────────────────────────
export interface ApiResponse<T> {
  data: T;
}

// ─── Offline queue ────────────────────────────────────────────────────────────
export type SyncCollection =
  | 'verificationSteps'
  | 'boundaryPoints'
  | 'visits'
  | 'incidents';

export interface OfflineQueueItem {
  clientId: string;
  collection: SyncCollection;
  appId: string;
  payload: Record<string, unknown>;
  clientTimestamp: string;
  createdAt: number;
}
