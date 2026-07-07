import type { Coordinator } from '@/types';

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null;
}

function unwrapData(value: unknown): JsonRecord {
  if (!isRecord(value)) {
    return {};
  }

  if (isRecord(value.data)) {
    return value.data;
  }

  return value;
}

function readString(record: JsonRecord, key: string): string | undefined {
  const value = record[key];
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function readRecord(record: JsonRecord, key: string): JsonRecord | undefined {
  const value = record[key];
  return isRecord(value) ? value : undefined;
}

export function extractAuthPayload(value: unknown): {
  accessToken: string;
  refreshToken: string;
  coordinator: Coordinator | null;
} {
  const payload = unwrapData(value);
  const tokens = readRecord(payload, 'tokens');
  const accessToken =
    readString(payload, 'accessToken') ??
    readString(tokens ?? {}, 'accessToken') ??
    readString(payload, 'token');
  const refreshToken =
    readString(payload, 'refreshToken') ??
    readString(tokens ?? {}, 'refreshToken');

  if (!accessToken || !refreshToken) {
    throw new Error('Login response did not include both access and refresh tokens.');
  }

  const coordinatorData =
    readRecord(payload, 'coordinator') ??
    readRecord(payload, 'user') ??
    null;

  return {
    accessToken,
    refreshToken,
    coordinator: coordinatorData as Coordinator | null,
  };
}

export function extractCoordinator(value: unknown): Coordinator {
  const payload = unwrapData(value);
  const coordinatorData =
    readRecord(payload, 'coordinator') ??
    readRecord(payload, 'user') ??
    payload;

  if (!readString(coordinatorData, 'email')) {
    throw new Error('Coordinator profile is missing required fields.');
  }

  return coordinatorData as unknown as Coordinator;
}