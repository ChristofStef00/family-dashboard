/**
 * Thin REST client for the Family Dashboard server.
 *
 * The dashboard exposes admin-gated writes behind a Bearer JWT. Rather than
 * sharing JWT_SECRET, we log in with the admin PIN (POST /api/auth/login),
 * which returns a 30-day token. We cache it and silently re-login on a 401,
 * so the MCP server survives token expiry and dashboard restarts.
 *
 * Most kiosk actions (post message, complete chore, set goal, redeem reward)
 * need no auth at all; only create/delete chore and member/reward management
 * require the admin token. Each call says whether it needs `admin`.
 */

const BASE = (process.env.DASHBOARD_URL || 'http://localhost:3000').replace(/\/+$/, '');
const PIN  = process.env.ADMIN_PIN || '';

let token = null;

async function login() {
  if (!PIN) {
    throw new Error(
      'ADMIN_PIN is not set, but this action needs admin rights. ' +
      'Set ADMIN_PIN to the dashboard admin PIN.'
    );
  }
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin: PIN })
  });
  if (!res.ok) {
    throw new Error(`Dashboard login failed (${res.status}). Check ADMIN_PIN and DASHBOARD_URL.`);
  }
  token = (await res.json()).token;
  return token;
}

/**
 * Perform a request against the dashboard API.
 * @param {string} path  e.g. "/api/members"
 * @param {object} opts  { method, body, admin }
 */
export async function api(path, { method = 'GET', body, admin = false } = {}) {
  const doFetch = async () => {
    const headers = { 'Content-Type': 'application/json' };
    if (admin) {
      if (!token) await login();
      headers.Authorization = `Bearer ${token}`;
    }
    return fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body != null ? JSON.stringify(body) : undefined
    });
  };

  let res;
  try {
    res = await doFetch();
  } catch (e) {
    throw new Error(`Cannot reach the dashboard at ${BASE} (${e.message}). Is DASHBOARD_URL correct and reachable from this host?`);
  }

  // Token expired or dashboard restarted with a new secret — re-login once.
  if (res.status === 401 && admin) {
    token = null;
    res = await doFetch();
  }

  if (!res.ok) {
    let detail = '';
    try { detail = await res.text(); } catch { /* ignore */ }
    throw new Error(`${method} ${path} → ${res.status} ${res.statusText}${detail ? `: ${detail}` : ''}`);
  }

  if (res.status === 204) return null;
  const ct = res.headers.get('content-type') || '';
  return ct.includes('application/json') ? res.json() : res.text();
}

export const dashboardBase = BASE;

// ── Resolution helpers ───────────────────────────────────────────────────
// LLMs prefer names over numeric ids; resolve loosely so "liam", "Liam",
// or an id all work.

export async function resolveMember(nameOrId) {
  const members = await api('/api/members');
  const s = String(nameOrId).trim().toLowerCase();
  const m =
    members.find(x => String(x.id) === s) ||
    members.find(x => x.name.toLowerCase() === s) ||
    members.find(x => x.name.toLowerCase().includes(s));
  if (!m) {
    throw new Error(`No family member matches "${nameOrId}". Known members: ${members.map(x => x.name).join(', ') || '(none)'}.`);
  }
  return m;
}

export async function resolveReward(titleOrId) {
  const rewards = await api('/api/rewards');
  const s = String(titleOrId).trim().toLowerCase();
  const r =
    rewards.find(x => String(x.id) === s) ||
    rewards.find(x => (x.title || '').toLowerCase() === s) ||
    rewards.find(x => (x.title || '').toLowerCase().includes(s));
  if (!r) {
    throw new Error(`No reward matches "${titleOrId}". Known rewards: ${rewards.map(x => x.title).join(', ') || '(none)'}.`);
  }
  return r;
}

export async function resolveChoreToday(titleOrId) {
  const chores = await api('/api/chores/today');
  const s = String(titleOrId).trim().toLowerCase();
  const c =
    chores.find(x => String(x.id) === s) ||
    chores.find(x => (x.title || '').toLowerCase() === s) ||
    chores.find(x => (x.title || '').toLowerCase().includes(s));
  if (!c) {
    throw new Error(`No chore today matches "${titleOrId}". Today's chores: ${chores.map(x => x.title).join(', ') || '(none)'}.`);
  }
  return c;
}
