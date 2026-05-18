import { getToken, clearToken } from './auth.js';

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

async function request(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(path, { ...options, headers });
  if (res.status === 401) {
    clearToken();
    throw new HttpError(401, 'Unauthorized');
  }
  if (!res.ok) {
    let detail = res.statusText;
    try { const body = await res.json(); detail = body.error || detail; } catch { /* ignore */ }
    throw new HttpError(res.status, detail);
  }
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  login: (pin) => request('/api/auth/login', { method: 'POST', body: JSON.stringify({ pin }) }),
  members:       () => request('/api/members'),
  createMember:  (body) => request('/api/members', { method: 'POST', body: JSON.stringify(body) }),
  updateMember:  (id, body) => request(`/api/members/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteMember:  (id) => request(`/api/members/${id}`, { method: 'DELETE' }),
  connections:() => request('/api/calendar/connections'),
  startOAuth: (memberId) => request(`/api/calendar/oauth/start?member_id=${memberId}`),
  disconnect: (id) => request(`/api/calendar/connections/${id}`, { method: 'DELETE' }),
  listCalendars:    (connId) => request(`/api/calendar/connections/${connId}/calendars`),
  saveCalendarSelection: (connId, calendarIds) =>
    request(`/api/calendar/connections/${connId}/calendars`, {
      method: 'PUT',
      body: JSON.stringify({ calendar_ids: calendarIds })
    }),
  sync:       () => request('/api/calendar/sync', { method: 'POST' }),
  settings:   () => request('/api/settings'),
  saveSettings: (updates) =>
    request('/api/settings', { method: 'PUT', body: JSON.stringify(updates) }),
  geocode: (q) => request(`/api/weather/geocode?q=${encodeURIComponent(q)}`),

  // Mealie
  mealieLastSync: () => request('/api/mealie/last-sync'),
  mealieTest:     () => request('/api/mealie/test'),
  mealieSync:     () => request('/api/mealie/sync', { method: 'POST' }),

  // Chores (admin-only writes)
  chores:        () => request('/api/chores'),
  createChore:   (body) => request('/api/chores', { method: 'POST', body: JSON.stringify(body) }),
  updateChore:   (id, body) => request(`/api/chores/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteChore:   (id) => request(`/api/chores/${id}`, { method: 'DELETE' }),

  // Rewards (admin-only writes; reads are public)
  rewards:       () => request('/api/rewards'),
  createReward:  (body) => request('/api/rewards', { method: 'POST', body: JSON.stringify(body) }),
  updateReward:  (id, body) => request(`/api/rewards/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteReward:  (id) => request(`/api/rewards/${id}`, { method: 'DELETE' }),
  redemptions:        (includeFulfilled) =>
    request(`/api/rewards/redemptions${includeFulfilled ? '?include_fulfilled=true' : ''}`),
  fulfillRedemption:  (id) => request(`/api/rewards/redemptions/${id}/fulfill`, { method: 'POST' }),

  // Streak rewards (admin-only writes)
  streakRewards:        () => request('/api/streaks/rewards'),
  createStreakReward:   (body)     => request('/api/streaks/rewards',     { method: 'POST',   body: JSON.stringify(body) }),
  updateStreakReward:   (id, body) => request(`/api/streaks/rewards/${id}`, { method: 'PATCH',  body: JSON.stringify(body) }),
  deleteStreakReward:   (id)       => request(`/api/streaks/rewards/${id}`, { method: 'DELETE' }),

  // Activity log (read-only; unifies chore/routine/streak/redemption events).
  activity: ({ limit = 200, member_id = null, type = null } = {}) => {
    const qs = new URLSearchParams();
    qs.set('limit', String(limit));
    if (member_id) qs.set('member_id', String(member_id));
    if (type)      qs.set('type',      type);
    return request(`/api/activity?${qs}`);
  },

  // Vacations (admin-only writes)
  vacations:       () => request('/api/vacations'),
  createVacation:  (body)     => request('/api/vacations',       { method: 'POST',   body: JSON.stringify(body) }),
  updateVacation:  (id, body) => request(`/api/vacations/${id}`, { method: 'PATCH',  body: JSON.stringify(body) }),
  deleteVacation:  (id)       => request(`/api/vacations/${id}`, { method: 'DELETE' }),

  // Routines (admin-only writes)
  routines:      () => request('/api/routines'),
  createRoutine: (body) => request('/api/routines', { method: 'POST', body: JSON.stringify(body) }),
  updateRoutine: (id, body) => request(`/api/routines/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteRoutine: (id) => request(`/api/routines/${id}`, { method: 'DELETE' }),
  addRoutineItem:    (id, body)     => request(`/api/routines/${id}/items`, { method: 'POST', body: JSON.stringify(body) }),
  updateRoutineItem: (itemId, body) => request(`/api/routines/items/${itemId}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteRoutineItem: (itemId)       => request(`/api/routines/items/${itemId}`, { method: 'DELETE' })
};

export { HttpError };
