export function validateRemotePath(path: string): string | undefined {
  const trimmed = path.trim();

  if (!trimmed) {
    return 'Path cannot be empty';
  }

  if (!trimmed.startsWith('/')) {
    return 'Path must be absolute (start with /)';
  }

  if (trimmed.includes('..')) {
    return 'Path cannot contain parent directory references (..)';
  }

  if (trimmed.includes('~')) {
    return 'Path cannot contain tilde (~), use absolute path';
  }

  if (!/^[a-zA-Z0-9/_.-]+$/.test(trimmed)) {
    return 'Path contains invalid characters';
  }

  return undefined;
}

export function parseJsonSafe<T = unknown>(content: string): T | null {
  try {
    const parsed = JSON.parse(content) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as T;
    }
    return null;
  } catch {
    return null;
  }
}
