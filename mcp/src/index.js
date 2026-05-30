#!/usr/bin/env node
/**
 * Family Dashboard MCP server.
 *
 * Exposes the dashboard's data and actions as MCP tools so a local LLM
 * (Qwen3 in Open WebUI) can read the family's schedule / points / chores and
 * take actions (post kiosk messages, complete chores, set reward goals, etc.).
 *
 * Transport: stdio. Open WebUI consumes OpenAPI tool servers, not MCP directly,
 * so this is launched behind `mcpo` (the MCP→OpenAPI proxy) — see the Dockerfile
 * and README. `mcpo --port 8000 -- node src/index.js` turns these tools into an
 * OpenAPI endpoint that Open WebUI registers as a Tool server.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import {
  api,
  resolveMember,
  resolveReward,
  resolveChoreToday
} from './dashboard.js';

const server = new McpServer({
  name: 'family-dashboard',
  version: '1.0.0'
});

// Tool results are returned as a single JSON text block. Open WebUI / the LLM
// reads the text; pretty-printing keeps it legible in tool-call traces.
function ok(data) {
  return { content: [{ type: 'text', text: typeof data === 'string' ? data : JSON.stringify(data, null, 2) }] };
}
function fail(err) {
  return { isError: true, content: [{ type: 'text', text: `Error: ${err.message || String(err)}` }] };
}

// ── READ TOOLS ─────────────────────────────────────────────────────────────

server.tool(
  'list_family',
  "List every family member with their current point balance, total points earned and spent, and the reward they're currently saving toward (their goal). Use this to answer 'how many points does X have?'.",
  {},
  async () => {
    try {
      const members = await api('/api/members');
      return ok(members.map(m => ({
        id: m.id,
        name: m.name,
        points_balance: m.points,
        points_earned: m.points_earned,
        points_spent: m.points_spent,
        goal: m.goal
          ? { reward: m.goal.reward_title, cost: m.goal.point_cost, progress_pct: m.goal.progress_pct, redeemable: m.goal.redeemable }
          : null
      })));
    } catch (e) { return fail(e); }
  }
);

server.tool(
  'get_chores_today',
  "List the chores scheduled for today, each with its point value, who it's assigned to, and which assignees have already completed it. Use to answer 'what chores are left today?'.",
  {},
  async () => {
    try {
      const chores = await api('/api/chores/today');
      return ok(chores.map(c => ({
        id: c.id,
        title: c.title,
        points: c.points,
        assignee_ids: c.assignee_ids,
        completed_by_ids: c.completed_by
      })));
    } catch (e) { return fail(e); }
  }
);

server.tool(
  'get_calendar',
  'List upcoming calendar events. Returns events from the start of today through the given number of days ahead (default 7).',
  { days_ahead: z.number().int().min(1).max(60).optional().describe('How many days ahead to include. Default 7.') },
  async ({ days_ahead }) => {
    try {
      const days = days_ahead ?? 7;
      const start = new Date(); start.setHours(0, 0, 0, 0);
      const end = new Date(start); end.setDate(end.getDate() + days); end.setHours(23, 59, 59, 999);
      const qs = new URLSearchParams({ start: start.toISOString(), end: end.toISOString() });
      const events = await api(`/api/calendar/events?${qs}`);
      return ok(events.map(e => ({
        title: e.title,
        start: e.start_time,
        end: e.end_time,
        all_day: e.all_day,
        location: e.location || null
      })));
    } catch (e) { return fail(e); }
  }
);

server.tool(
  'get_rewards',
  'List the rewards kids can save up for, with their point cost. Use to answer "what rewards are available?".',
  {},
  async () => {
    try {
      const rewards = await api('/api/rewards');
      return ok(rewards.map(r => ({ id: r.id, title: r.title, point_cost: r.point_cost, description: r.description || null })));
    } catch (e) { return fail(e); }
  }
);

server.tool(
  'get_meals_week',
  "Get this week's planned meals from the meal planner. May be empty if no meals are planned or the meal integration isn't configured.",
  {},
  async () => {
    try {
      const meals = await api('/api/mealie/week');
      return ok(meals);
    } catch (e) { return fail(e); }
  }
);

server.tool(
  'get_kiosk_messages',
  'List the messages currently displayed on the kiosk (those that have not yet expired).',
  {},
  async () => {
    try {
      const msgs = await api('/api/messages');
      return ok(msgs.map(m => ({ id: m.id, message: m.message, expires_at: m.expires_at })));
    } catch (e) { return fail(e); }
  }
);

// ── ACTION TOOLS ─────────────────────────────────────────────────────────────

server.tool(
  'post_kiosk_message',
  'Show a message on the family kiosk screen for a short time. Great for announcements ("Dinner in 10 minutes!").',
  {
    message: z.string().min(1).describe('The text to display on the kiosk.'),
    ttl_seconds: z.number().int().min(5).max(3600).optional().describe('How long the message stays up, in seconds. Default 30.')
  },
  async ({ message, ttl_seconds }) => {
    try {
      const row = await api('/api/messages', { method: 'POST', body: { message, ttl_seconds: ttl_seconds ?? 30 } });
      return ok({ posted: true, id: row.id, message: row.message, expires_at: row.expires_at });
    } catch (e) { return fail(e); }
  }
);

server.tool(
  'complete_chore',
  "Mark a chore as done for a family member, awarding its points. Accepts the member's name or id and the chore's title or id (both matched loosely).",
  {
    member: z.string().describe('Family member name or id (e.g. "Liam").'),
    chore: z.string().describe("Chore title or id from today's chores (e.g. \"Make the bed\").")
  },
  async ({ member, chore }) => {
    try {
      const m = await resolveMember(member);
      const c = await resolveChoreToday(chore);
      const result = await api(`/api/chores/${c.id}/complete`, { method: 'POST', body: { member_id: m.id } });
      if (result?.already_completed) {
        return ok({ status: 'already_completed', member: m.name, chore: c.title });
      }
      return ok({ status: 'completed', member: m.name, chore: c.title, points_awarded: result?.points_awarded ?? c.points });
    } catch (e) { return fail(e); }
  }
);

server.tool(
  'set_reward_goal',
  'Set the reward a family member is saving toward (their goal shown on the dashboard). Accepts member name/id and reward title/id.',
  {
    member: z.string().describe('Family member name or id.'),
    reward: z.string().describe('Reward title or id to save toward.')
  },
  async ({ member, reward }) => {
    try {
      const m = await resolveMember(member);
      const r = await resolveReward(reward);
      const progress = await api(`/api/goals/members/${m.id}`, { method: 'PUT', body: { reward_id: r.id } });
      return ok({ status: 'goal_set', member: m.name, reward: r.title, progress });
    } catch (e) { return fail(e); }
  }
);

server.tool(
  'redeem_reward',
  "Redeem a reward for a family member, spending their points. Fails if they can't afford it or aren't eligible.",
  {
    member: z.string().describe('Family member name or id.'),
    reward: z.string().describe('Reward title or id to redeem.')
  },
  async ({ member, reward }) => {
    try {
      const m = await resolveMember(member);
      const r = await resolveReward(reward);
      const result = await api(`/api/rewards/${r.id}/redeem`, { method: 'POST', body: { member_id: m.id } });
      return ok({ status: 'redeemed', member: m.name, reward: r.title, result });
    } catch (e) { return fail(e); }
  }
);

server.tool(
  'create_chore',
  'Create a new recurring or one-time chore (requires admin PIN). Frequency is "custom" (repeats on chosen weekdays) or "once" (a one-off). For custom, pass the weekdays it repeats on.',
  {
    title: z.string().min(1).describe('Chore name.'),
    points: z.number().int().min(0).describe('Points awarded on completion.'),
    assignees: z.string().optional().describe('Comma-separated member names or ids assigned to this chore (e.g. "Liam, Ava"). Omit for unassigned.'),
    frequency: z.enum(['custom', 'once']).optional().describe('"custom" = recurring on given weekdays (default); "once" = one-time.'),
    weekdays: z.string().optional().describe('For custom: comma-separated weekdays it repeats on, e.g. "Mon,Wed,Fri" or "daily" or "weekdays". Defaults to every day.')
  },
  async ({ title, points, assignees, frequency, weekdays }) => {
    try {
      let assignee_ids = [];
      if (assignees && assignees.trim()) {
        const names = assignees.split(',').map(s => s.trim()).filter(Boolean);
        assignee_ids = [];
        for (const n of names) assignee_ids.push((await resolveMember(n)).id);
      }
      const freq = frequency || 'custom';
      let custom_days = null;
      if (freq === 'custom') custom_days = parseWeekdays(weekdays);
      const created = await api('/api/chores', {
        method: 'POST', admin: true,
        body: { title, points, assignee_ids, frequency: freq, custom_days, category: 'chore' }
      });
      return ok({ status: 'created', id: created.id, title: created.title, frequency: created.frequency, custom_days: created.custom_days });
    } catch (e) { return fail(e); }
  }
);

// "Mon,Wed,Fri" | "daily" | "weekdays" → JSON array of 0..6 (Sun..Sat).
function parseWeekdays(input) {
  const EVERY = [0, 1, 2, 3, 4, 5, 6];
  if (!input || !input.trim()) return EVERY;
  const s = input.trim().toLowerCase();
  if (s === 'daily' || s === 'everyday' || s === 'every day') return EVERY;
  if (s === 'weekdays') return [1, 2, 3, 4, 5];
  if (s === 'weekends') return [0, 6];
  const NAMES = { sun: 0, sunday: 0, mon: 1, monday: 1, tue: 2, tues: 2, tuesday: 2, wed: 3, weds: 3, wednesday: 3, thu: 4, thur: 4, thurs: 4, thursday: 4, fri: 5, friday: 5, sat: 6, saturday: 6 };
  const days = [];
  for (const part of s.split(',').map(x => x.trim()).filter(Boolean)) {
    const d = NAMES[part];
    if (d === undefined) throw new Error(`Unknown weekday "${part}". Use names like Mon, Tue, or "daily"/"weekdays".`);
    if (!days.includes(d)) days.push(d);
  }
  return days.sort((a, b) => a - b);
}

// ── START ──────────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stderr is safe for logging — stdout is reserved for the MCP protocol.
  console.error(`[family-dashboard-mcp] ready (dashboard: ${process.env.DASHBOARD_URL || 'http://localhost:3000'})`);
}

main().catch(err => {
  console.error('[family-dashboard-mcp] fatal:', err);
  process.exit(1);
});
