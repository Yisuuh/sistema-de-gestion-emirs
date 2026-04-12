// URL base de la API.
// En desarrollo usa el proxy de Vite (vacío = relativo al origen).
// En producción el frontend y el backend son el mismo origen (Render),
// por lo que también funciona con ruta relativa.
const API_BASE = import.meta.env.VITE_API_URL || ''

export default API_BASE

/**
 * Wrapper de fetch que agrega el token JWT automáticamente.
 * Si recibe un 401, intenta refrescar el access token una vez.
 * Si el refresco falla, limpia el localStorage y redirige al login.
 */
export async function apiFetch(url, options = {}) {
  const fullUrl = url.startsWith('http') ? url : `${API_BASE}${url}`

  const buildHeaders = (extra = {}) => ({
    ...extra,
    Authorization: `Bearer ${localStorage.getItem('token')}`,
  })

  // Merge headers without overwriting Content-Type or other options
  const makeOpts = () => ({
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${localStorage.getItem('token')}`,
    },
  })

  let response = await fetch(fullUrl, makeOpts())

  if (response.status !== 401) {
    return response
  }

  // --- 401: intentar refrescar el token ---
  const refreshToken = localStorage.getItem('refreshToken')
  if (!refreshToken) {
    _forceLogout()
    return response
  }

  try {
    const refreshResponse = await fetch(`${API_BASE}/api/auth/refresh/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh: refreshToken }),
    })

    if (!refreshResponse.ok) {
      _forceLogout()
      return response
    }

    const { access } = await refreshResponse.json()
    localStorage.setItem('token', access)

    // Reintentar la solicitud original con el nuevo token
    response = await fetch(fullUrl, makeOpts())
  } catch {
    _forceLogout()
  }

  return response
}

function _forceLogout() {
  localStorage.removeItem('token')
  localStorage.removeItem('refreshToken')
  localStorage.removeItem('username')
  window.location.href = '/auth/login'
}
