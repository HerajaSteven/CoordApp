const OFFLINE_SITE_PREFIX = 'offline-site:';
const OFFLINE_UNIT_PREFIX = 'offline-unit:';

export function offlineSiteId(clientId: string): string {
  return `${OFFLINE_SITE_PREFIX}${clientId}`;
}

export function offlineUnitId(clientId: string): string {
  return `${OFFLINE_UNIT_PREFIX}${clientId}`;
}

export function offlineSiteClientId(siteId: string): string | null {
  return siteId.startsWith(OFFLINE_SITE_PREFIX) ? siteId.slice(OFFLINE_SITE_PREFIX.length) : null;
}

export function offlineUnitClientId(unitId: string): string | null {
  return unitId.startsWith(OFFLINE_UNIT_PREFIX) ? unitId.slice(OFFLINE_UNIT_PREFIX.length) : null;
}
