import axios, { AxiosError, type AxiosRequestConfig } from 'axios';

/** Jeton d'accès conservé en mémoire uniquement (jamais dans localStorage). */
let accessToken: string | null = null;
let onSessionExpired: (() => void) | null = null;

export const setAccessToken = (t: string | null) => {
  accessToken = t;
};
export const setSessionExpiredHandler = (fn: () => void) => {
  onSessionExpired = fn;
};

export const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
  headers: { 'X-Requested-With': 'TeamTrack' },
});

api.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  return config;
});

let refreshing: Promise<{ accessToken: string; user: unknown } | null> | null = null;

/**
 * Renouvelle la session grâce au cookie httpOnly. Les appels simultanés partagent
 * la même requête : le jeton de rafraîchissement étant à usage unique (rotation),
 * deux requêtes parallèles invalideraient la session.
 */
export function refreshSession(): Promise<{ accessToken: string; user: unknown } | null> {
  refreshing ??= axios
    .post('/api/auth/refresh', null, { withCredentials: true, headers: { 'X-Requested-With': 'TeamTrack' } })
    .then(({ data }) => {
      setAccessToken(data.accessToken);
      return data;
    })
    .catch(() => {
      setAccessToken(null);
      return null;
    })
    .finally(() => {
      setTimeout(() => (refreshing = null), 0);
    });
  return refreshing;
}

// Renouvellement transparent du jeton d'accès (15 min) grâce au jeton de rafraîchissement (7 jours).
api.interceptors.response.use(
  (r) => r,
  async (error: AxiosError) => {
    const original = error.config as AxiosRequestConfig & { _retry?: boolean };
    if (error.response?.status === 401 && original && !original._retry && !original.url?.startsWith('/auth/')) {
      original._retry = true;
      const token = (await refreshSession())?.accessToken;
      if (token) return api(original);
      onSessionExpired?.();
    }
    return Promise.reject(error);
  },
);

export interface ApiErrorBody {
  error?: { message?: string; code?: string; fields?: Record<string, string>; details?: any };
}

export function errorMessage(err: unknown, fallback = 'Une erreur est survenue.'): string {
  const e = err as AxiosError<ApiErrorBody>;
  if (!e?.response) return e?.message === 'Network Error' ? 'Le serveur est injoignable. Vérifiez votre connexion.' : fallback;
  const body = e.response.data?.error;
  if (body?.fields) return Object.values(body.fields)[0] ?? body.message ?? fallback;
  return body?.message ?? fallback;
}

export const errorCode = (err: unknown) => (err as AxiosError<ApiErrorBody>)?.response?.data?.error?.code;
export const errorDetails = (err: unknown) => (err as AxiosError<ApiErrorBody>)?.response?.data?.error?.details;

/** Téléchargement authentifié d'un fichier (exports, pièces jointes). */
export async function download(url: string, fallbackName = 'fichier') {
  const res = await api.get(url, { responseType: 'blob' });
  const disposition = res.headers['content-disposition'] as string | undefined;
  const match = disposition?.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i);
  const name = match ? decodeURIComponent(match[1]) : fallbackName;
  const href = URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}
