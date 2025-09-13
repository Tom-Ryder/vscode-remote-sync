export function ensureError(error: unknown): Error {
  if (error instanceof Error) return error;
  if (typeof error === 'string') return new Error(error);
  if (error && typeof error === 'object' && 'message' in error) {
    return new Error(String(error.message));
  }
  return new Error(String(error));
}

export function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

export class ConnectionError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(`[${code}] ${message}`);
    this.name = 'ConnectionError';
  }
}

export class SyncError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(`[${code}] ${message}`);
    this.name = 'SyncError';
  }
}
