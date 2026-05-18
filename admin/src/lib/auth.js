const KEY = 'fd_admin_token';

export function getToken() {
  try { return localStorage.getItem(KEY) || null; } catch { return null; }
}

export function setToken(token) {
  try {
    if (token) localStorage.setItem(KEY, token);
    else localStorage.removeItem(KEY);
  } catch { /* ignore */ }
}

export function clearToken() { setToken(null); }
