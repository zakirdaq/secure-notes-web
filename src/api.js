/**
 * Thin API client for the Secure Notes backend.
 *
 * The backend is a separate project on a different origin, so every request
 * carries an absolute URL and the JWT travels in the `Authorization` header.
 * Nothing relies on cookies — that is what keeps the cross-origin setup simple
 * (no SameSite rules, no CSRF token, no `credentials: 'include'`).
 */

const BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000').replace(
  /\/$/,
  ''
);

export const API_BASE_URL = BASE_URL;

const TOKEN_KEY = 'secure-notes.token';
const USER_KEY = 'secure-notes.user';

export const auth = {
  get token() {
    return localStorage.getItem(TOKEN_KEY);
  },
  get user() {
    try {
      return JSON.parse(localStorage.getItem(USER_KEY) ?? 'null');
    } catch {
      return null;
    }
  },
  set(token, user) {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
      localStorage.setItem(USER_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    }
  }
};

/** Thrown for any non-2xx response, with the API's message already unwrapped. */
export class ApiRequestError extends Error {
  constructor(message, status, details) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.details = details;
  }
}

export async function api(path, { method = 'GET', body, auth: withAuth = true } = {}) {
  let res;

  try {
    res = await fetch(`${BASE_URL}/api${path}`, {
      method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(withAuth && auth.token ? { Authorization: `Bearer ${auth.token}` } : {})
      },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
  } catch {
    // A CORS rejection and a dead server are indistinguishable from here, so
    // name both possibilities rather than guessing.
    throw new ApiRequestError(
      `Cannot reach the API at ${BASE_URL}. Is the backend running, and is CORS_ORIGIN set to this origin?`,
      0
    );
  }

  if (res.status === 204) return null;

  const payload = await res.json().catch(() => null);

  if (!res.ok) {
    const details = payload?.error?.details;
    const message =
      details?.map((d) => `${d.path}: ${d.message}`).join('; ') ||
      payload?.error?.message ||
      `Request failed (${res.status})`;

    // An expired or rejected token means the stored session is useless.
    if (res.status === 401 && auth.token) auth.set(null, null);

    throw new ApiRequestError(message, res.status, details);
  }

  return payload;
}
