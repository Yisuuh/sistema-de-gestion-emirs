/**
 * Cliente HTTP centralizado — maneja auth headers, JSON y errores de forma uniforme.
 * Usado junto con TanStack Query: apiClient.get('/api/...') como queryFn.
 */

function buildHeaders(withJson = false) {
  const token = localStorage.getItem('token');
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (withJson) headers['Content-Type'] = 'application/json';
  return headers;
}

async function request(url, { body, headers: extraHeaders, ...options } = {}) {
  const hasBody = body !== undefined;
  const isJson =
    hasBody &&
    typeof body !== 'string' &&
    !(body instanceof FormData) &&
    !(body instanceof Blob);

  const res = await fetch(url, {
    ...options,
    headers: {
      ...buildHeaders(isJson),
      ...extraHeaders,
    },
    body: isJson ? JSON.stringify(body) : body,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || err.detail || err.message || `Error ${res.status}`);
  }

  return res.status === 204 ? null : res.json();
}

export const apiClient = {
  get: (url, opts) => request(url, { method: 'GET', ...opts }),
  post: (url, body, opts) => request(url, { method: 'POST', body, ...opts }),
  put: (url, body, opts) => request(url, { method: 'PUT', body, ...opts }),
  patch: (url, body, opts) => request(url, { method: 'PATCH', body, ...opts }),
  del: (url, opts) => request(url, { method: 'DELETE', ...opts }),
};
