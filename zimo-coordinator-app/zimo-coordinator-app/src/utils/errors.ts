interface ApiErr {
  response?: {
    status?: number;
    data?: {
      error?: { message?: string };
      message?: string;
      data?: {
        message?: string;
      };
    };
  };
  message?: string;
  code?: string;
}

export function getErrorMessage(err: unknown, fallback = 'Something went wrong.'): string {
  const e = err as ApiErr;

  const status = e?.response?.status;
  if (status === 502 || status === 503 || status === 504) {
    return 'Server is temporarily unavailable. Please try again in a moment.';
  }

  return (
    e?.response?.data?.error?.message ??
    e?.response?.data?.data?.message ??
    e?.response?.data?.message ??
    e?.message ??
    fallback
  );
}

export function isNetworkError(err: unknown): boolean {
  const e = err as { message?: string; code?: string };
  return (
    e?.message === 'Network Error' ||
    e?.code === 'ECONNREFUSED' ||
    e?.code === 'ENOTFOUND' ||
    e?.code === 'ERR_NETWORK'
  );
}

export function isTimeoutError(err: unknown): boolean {
  const e = err as { message?: string; code?: string };
  return (
    e?.code === 'ECONNABORTED' ||
    e?.code === 'ETIMEDOUT' ||
    e?.message?.toLowerCase().includes('timeout') === true
  );
}

export function getLoginErrorMessage(err: unknown): string {
  const e = err as ApiErr;
  if (e?.response?.status === 502 || e?.response?.status === 503 || e?.response?.status === 504) {
    return 'Server is temporarily unavailable. Please try again shortly.';
  }

  if (isTimeoutError(err)) {
    return 'Login timed out. The server is not responding right now.';
  }

  if (isNetworkError(err)) {
    return 'Cannot reach server. Check your internet connection or try again shortly.';
  }

  return getErrorMessage(err, 'Login failed. Check your credentials.');
}
