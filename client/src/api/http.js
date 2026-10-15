// Единая точка общения с сервером: CSRF-заголовок, JSON, единый формат ошибок.
let csrfToken = '';
let onUnauthorized = () => {};

export const setCsrfToken = (t) => { csrfToken = t; };
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn; };

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export async function api(path, { method = 'GET', body } = {}) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (method !== 'GET') headers['X-CSRF-Token'] = csrfToken;
  const res = await fetch(`/api${path}`, {
    method, headers, credentials: 'same-origin',
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    // Сессия истекла в другой вкладке — переспрашиваем, кто мы (кроме самих форм входа)
    if (res.status === 401 && !path.startsWith('/auth')) onUnauthorized();
    throw new ApiError(res.status, data?.error || 'Ошибка запроса');
  }
  return data;
}
