const getToken = () => localStorage.getItem('token')

function authHeaders(body) {
  const headers = {
    Authorization: `Bearer ${getToken()}`,
  }
  // Only set JSON content-type when body is a plain object/string (not FormData)
  if (body !== undefined && !(body instanceof FormData)) {
    headers['Content-Type'] = 'application/json'
  }
  return headers
}

async function request(method, url, body) {
  const options = {
    method,
    headers: authHeaders(body),
  }
  if (body !== undefined) {
    options.body = body instanceof FormData ? body : JSON.stringify(body)
  }

  const res = await fetch(url, options)

  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`
    try {
      const err = await res.json()
      message = JSON.stringify(err)
    } catch (_) {}
    throw new Error(message)
  }

  if (res.status === 204) return null
  return res.json()
}

export const apiClient = {
  get:   (url)        => request('GET',    url),
  post:  (url, body)  => request('POST',   url, body),
  patch: (url, body)  => request('PATCH',  url, body),
  put:   (url, body)  => request('PUT',    url, body),
  del:   (url)        => request('DELETE', url),
}

export default apiClient

