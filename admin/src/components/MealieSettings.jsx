import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api.js';

export default function MealieSettings() {
  const [loaded, setLoaded] = useState(false);
  const [url,    setUrl]    = useState('');
  const [token,  setToken]  = useState('');
  const [hasToken,     setHasToken]     = useState(false);
  const [touchEnabled, setTouchEnabled] = useState(false);

  const [savingForm, setSavingForm] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [testStatus, setTestStatus] = useState(null);
  const [syncStatus, setSyncStatus] = useState(null);
  const [lastSync,   setLastSync]   = useState(null);

  const refresh = useCallback(async () => {
    const s = await api.settings();
    setUrl(s.mealie_url || '');
    setHasToken(s.mealie_token === '__set__');
    setTouchEnabled(s.mealie_touch_enabled === true || s.mealie_touch_enabled === 'true');
    const ls = await api.mealieLastSync();
    setLastSync(ls.synced_at);
    setLoaded(true);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  async function saveAll() {
    setSavingForm(true);
    setSavedFlash(false);
    const updates = {
      mealie_url: url.trim(),
      mealie_touch_enabled: touchEnabled
    };
    if (token) updates.mealie_token = token;
    try {
      await api.saveSettings(updates);
      setToken('');
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2000);
      refresh();
    } finally {
      setSavingForm(false);
    }
  }

  async function testConnection() {
    setTestStatus({ loading: true });
    try {
      const r = await api.mealieTest();
      setTestStatus({ ok: true, version: r.version, path: r.mealplan_path });
    } catch (e) {
      setTestStatus({ error: e.message, status: e.status });
    }
  }

  async function syncNow() {
    setSyncStatus({ loading: true });
    try {
      const r = await api.mealieSync();
      if (r.error) setSyncStatus({ error: r.error });
      else setSyncStatus({ count: r.count, pool: r.pool });
      refresh();
    } catch (e) {
      setSyncStatus({ error: e.message });
    }
  }

  if (!loaded) return null;

  const tokenHelp = hasToken
    ? 'Token saved. Leave blank to keep, or paste a new token to replace.'
    : 'Required.';
  const tokenLink = url ? `${url.replace(/\/+$/, '')}/user/profile/api-tokens` : null;

  return (
    <section className="rounded-2xl bg-white/[0.04] border border-white/10 p-5 mt-8">
      <header className="flex items-baseline justify-between mb-5">
        <div>
          <h2 className="text-2xl font-light tracking-tight">Meal Planning</h2>
          <p className="text-fg/50 text-sm mt-1">
            Last sync: {lastSync ? new Date(lastSync).toLocaleString() : 'never'}
          </p>
        </div>
      </header>

      <p className="text-fg/55 text-sm leading-relaxed mb-5">
        Add the recipes you're shopping for to your <strong>meal plan</strong> in
        Mealie (any dates — the dashboard ignores them). The Meals tab on the
        kiosk shows the deduped pool with prep/cook/total times and full recipe
        on tap.
      </p>

      <div className="flex flex-col gap-5">
        <Field label="Mealie URL" hint="e.g. http://192.168.3.50:9925">
          <input
            type="url"
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder="http://..."
            className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 outline-none focus:border-white/30 text-sm"
          />
        </Field>

        <Field
          label="API Token"
          hint={tokenHelp}
          aside={tokenLink && (
            <a className="text-fg/50 hover:text-fg text-xs underline"
               href={tokenLink} target="_blank" rel="noreferrer">
              Generate a token →
            </a>
          )}
        >
          <input
            type="password"
            value={token}
            onChange={e => setToken(e.target.value)}
            placeholder={hasToken ? '••••••••••••' : 'Paste API token'}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 outline-none focus:border-white/30 text-sm font-mono"
          />
        </Field>

        <Field label="Touchscreen">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={touchEnabled}
              onChange={e => setTouchEnabled(e.target.checked)}
              className="h-4 w-4 accent-fg/80"
            />
            <span className="text-sm text-fg/70">
              Open recipes in Mealie when tapped (instead of inline view)
            </span>
          </label>
        </Field>

        <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-white/10">
          <button
            onClick={saveAll}
            disabled={savingForm}
            className="rounded-full px-4 py-2 bg-white/15 hover:bg-white/25 active:scale-95 disabled:opacity-40 text-sm font-medium transition"
          >
            {savingForm ? 'Saving…' : 'Save'}
          </button>
          {savedFlash && <span className="text-emerald-400 text-sm">✓ Saved</span>}

          <span className="mx-2 text-fg/20">·</span>

          <button
            onClick={testConnection}
            disabled={!url || testStatus?.loading}
            className="rounded-full px-3 py-1.5 bg-white/[0.06] hover:bg-white/[0.12] active:scale-95 disabled:opacity-40 text-xs uppercase tracking-widest font-medium transition"
          >
            {testStatus?.loading ? 'Testing…' : 'Test connection'}
          </button>
          <StatusPill status={testStatus} okLabel="✓ Connected" />

          <button
            onClick={syncNow}
            disabled={!url || syncStatus?.loading}
            className="rounded-full px-3 py-1.5 bg-white/[0.06] hover:bg-white/[0.12] active:scale-95 disabled:opacity-40 text-xs uppercase tracking-widest font-medium transition"
          >
            {syncStatus?.loading ? 'Syncing…' : 'Sync now'}
          </button>
          {syncStatus?.count != null && (
            <span className="text-emerald-400 text-sm">
              ✓ {syncStatus.count} entries
              {syncStatus.pool?.fetched != null && ` · ${syncStatus.pool.fetched} recipes`}
            </span>
          )}
          {syncStatus?.error && (
            <span className="text-rose-400 text-sm">{syncStatus.error}</span>
          )}
        </div>
      </div>
    </section>
  );
}

function Field({ label, hint, aside, children }) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <label className="text-fg/60 text-xs uppercase tracking-widest font-medium">{label}</label>
        {aside}
      </div>
      {children}
      {hint && <div className="text-fg/40 text-xs mt-1.5">{hint}</div>}
    </div>
  );
}

function StatusPill({ status, okLabel }) {
  if (!status || status.loading) return null;
  if (status.ok) {
    return (
      <span className="text-emerald-400 text-sm">
        {okLabel}
        {status.version && (
          <span className="text-emerald-400/60 ml-2">
            {String(status.version).startsWith('v') ? status.version : `v${status.version}`}
          </span>
        )}
        {status.path && (
          <span className="text-fg/40 ml-2 font-mono text-[11px]">{status.path}</span>
        )}
      </span>
    );
  }
  if (status.error) return (
    <span className="text-rose-400 text-sm">
      {status.status ? `${status.status} · ` : ''}{status.error}
    </span>
  );
  return null;
}
