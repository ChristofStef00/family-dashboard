const BASE = '';

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  health:   () => request('/api/health'),
  members:  () => request('/api/members'),
  settings: () => request('/api/settings'),
  chores:   () => request('/api/chores'),
  choresToday: () => request('/api/chores/today'),
  completeChore: (id, member_id) =>
    request(`/api/chores/${id}/complete`, { method: 'POST', body: JSON.stringify({ member_id }) }),
  uncompleteChore: (id, member_id) =>
    request(`/api/chores/${id}/complete?member_id=${member_id}`, { method: 'DELETE' }),
  // Routines
  routinesToday: () => request('/api/routines/today'),
  checkRoutineItem: (itemId, member_id) =>
    request(`/api/routines/items/${itemId}/check`, {
      method: 'POST', body: JSON.stringify({ member_id })
    }),
  uncheckRoutineItem: (itemId, member_id) =>
    request(`/api/routines/items/${itemId}/check?member_id=${member_id}`, { method: 'DELETE' }),
  // Bonuses
  bonusesAvailable: () => request('/api/bonuses/available'),
  bonusesToday:     (member_id) => request(`/api/bonuses/today${member_id ? `?member_id=${member_id}` : ''}`),
  selectBonus:      (choreId, member_id) =>
    request(`/api/bonuses/${choreId}/select`, {
      method: 'POST', body: JSON.stringify({ member_id })
    }),
  unselectBonus:    (choreId, member_id) =>
    request(`/api/bonuses/${choreId}/select?member_id=${member_id}`, { method: 'DELETE' }),
  // Rewards (existing endpoints)
  rewards:          () => request('/api/rewards'),
  redemptions:      () => request('/api/rewards/redemptions'),
  fulfillRedemption:(id) => request(`/api/rewards/redemptions/${id}/fulfill`, { method: 'POST' }),
  redeemReward:     (id, member_id) =>
    request(`/api/rewards/${id}/redeem`, {
      method: 'POST', body: JSON.stringify({ member_id })
    }),
  // Goals
  goals:            () => request('/api/goals'),
  setMemberGoal:    (member_id, reward_id) =>
    request(`/api/goals/members/${member_id}`, {
      method: 'PUT', body: JSON.stringify({ reward_id })
    }),
  clearMemberGoal:  (member_id) =>
    request(`/api/goals/members/${member_id}`, { method: 'DELETE' }),
  events:   (start, end) => {
    const qs = new URLSearchParams();
    if (start) qs.set('start', start);
    if (end)   qs.set('end', end);
    return request(`/api/calendar/events?${qs}`);
  },
  weather:  () => request('/api/weather'),
  quote:    () => request('/api/quote'),
  messages: () => request('/api/messages'),
  photos:   () => request('/api/photos'),
  streakProgress: () => request('/api/streaks/progress'),
  mealieToday:    () => request('/api/mealie/today'),
  mealieWeek:     () => request('/api/mealie/week'),
  mealiePool:     () => request('/api/mealie/meals'),
  mealieRecipe:   (slug) => request(`/api/mealie/recipe/${encodeURIComponent(slug)}`),
  mealComplete:   (slug) => request(`/api/mealie/meals/${encodeURIComponent(slug)}/complete`, { method: 'POST' }),
  mealUncomplete: (slug) => request(`/api/mealie/meals/${encodeURIComponent(slug)}/complete`, { method: 'DELETE' }),
  plannedMeals:   (start, end) => {
    const qs = new URLSearchParams();
    if (start) qs.set('start', start);
    if (end)   qs.set('end', end);
    return request(`/api/mealie/planned?${qs}`);
  },
  plannedDatesFor: (slug) =>
    request(`/api/mealie/meals/${encodeURIComponent(slug)}/planned`),
  planMeal: (slug, mealDate) =>
    request(`/api/mealie/meals/${encodeURIComponent(slug)}/plan`, {
      method: 'POST',
      body: JSON.stringify({ meal_date: mealDate })
    }),
  unplanMealByDate: (slug, mealDate) =>
    request(`/api/mealie/meals/${encodeURIComponent(slug)}/plan?meal_date=${encodeURIComponent(mealDate)}`, {
      method: 'DELETE'
    })
};
