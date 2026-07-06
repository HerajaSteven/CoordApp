interface ApiErr {
  response?: {
    data?: {
      error?: { message?: string };
    };
  };
  message?: string;
}

export function getErrorMessage(err: unknown, fallback = 'Something went wrong.'): string {
  const e = err as ApiErr;
  return (
    e?.response?.data?.error?.message ??
    e?.message ??
    fallback
  );
}

export function isNetworkError(err: unknown): boolean {
  const e = err as { message?: string; code?: string };
  return (
    e?.message === 'Network Error' ||
    e?.code === 'ECONNREFUSED' ||
    e?.code === 'ENOTFOUND'
  );
}
