// Interceptor global de JWT para window.fetch
// Maneja refresh token silencioso y logout limpio al vencer sesión

const originalFetch = window.fetch;

let refreshPromise = null;

async function doRefreshToken() {
  const refreshToken = localStorage.getItem('refreshToken');
  if (!refreshToken) {
    throw new Error('No refresh token available');
  }

  const response = await originalFetch('/api/auth/refresh/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh: refreshToken }),
  });

  if (!response.ok) {
    throw new Error(`Refresh token failed with status ${response.status}`);
  }

  const data = await response.json();
  if (!data || !data.access) {
    throw new Error('Refresh response missing access token');
  }

  localStorage.setItem('token', data.access);
  if (data.refresh) {
    localStorage.setItem('refreshToken', data.refresh);
  }

  return data.access;
}

function handleCleanLogout() {
  localStorage.removeItem('token');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('username');
  localStorage.removeItem('rol');
  localStorage.removeItem('nombre');

  if (window.location.pathname !== '/auth/login') {
    window.location.href = '/auth/login';
  }
}

window.fetch = async function (input, init = {}) {
  // Realizar la petición original
  const response = await originalFetch(input, init);

  if (response.status === 401) {
    const url = typeof input === 'string' ? input : (input && input.url ? input.url : '');

    // Evitar bucle infinito si la petición que falló ya era login o refresh
    if (url.includes('/api/auth/login/') || url.includes('/api/auth/refresh/')) {
      return response;
    }

    const refreshToken = localStorage.getItem('refreshToken');
    if (!refreshToken) {
      handleCleanLogout();
      return response;
    }

    try {
      if (!refreshPromise) {
        refreshPromise = doRefreshToken().finally(() => {
          refreshPromise = null;
        });
      }

      const newAccessToken = await refreshPromise;

      // Reintentar la petición original con el nuevo token
      const nextInit = { ...init };

      if (nextInit.headers instanceof Headers) {
        nextInit.headers = new Headers(nextInit.headers);
        nextInit.headers.set('Authorization', `Bearer ${newAccessToken}`);
      } else if (Array.isArray(nextInit.headers)) {
        nextInit.headers = nextInit.headers.filter(
          ([k]) => k.toLowerCase() !== 'authorization'
        );
        nextInit.headers.push(['Authorization', `Bearer ${newAccessToken}`]);
      } else {
        nextInit.headers = {
          ...(nextInit.headers || {}),
          Authorization: `Bearer ${newAccessToken}`,
        };
      }

      if (input instanceof Request) {
        try {
          return await originalFetch(new Request(input, nextInit));
        } catch (_) {
          return await originalFetch(input.url, nextInit);
        }
      }

      return await originalFetch(input, nextInit);
    } catch (_) {
      handleCleanLogout();
      return response;
    }
  }

  return response;
};
