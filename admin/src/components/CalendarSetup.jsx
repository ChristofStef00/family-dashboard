import { useCallback, useEffect, useState } from 'react';
import { api, HttpError } from '../lib/api.js';
import ConnectionRow from './ConnectionRow.jsx';

export default function CalendarSetup() {
  const [members, setMembers]         = useState([]);
  const [connections, setConnections] = useState([]);
  const [settings, setSettings]       = useState({});
  const [error, setError]             = useState(null);
  const [busy, setBusy]               = useState(false);
  const [syncResult, setSyncResult]   = useState(null);

  const refresh = useCallback(async () => {
    try {
      const [m, c, s] = await Promise.all([api.members(), api.connections(), api.settings()]);
      setMembers(m);
      setConnections(c);
      setSettings(s);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    refresh();
    const onFocus = () => refresh();
    const interval = setInterval(refresh, 10_000);
    window.addEventListener('focus', onFocus);
    return () => { clearInterval(interval); window.removeEventListener('focus', onFocus); };
  }, [refresh]);

  async function connect(memberId) {
    setError(null);
    setBusy(true);
    try {
      const { url } = await api.startOAuth(memberId);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      if (err instanceof HttpError && /not configured/i.test(err.message)) {
        setError('Google OAuth is not configured. See setup steps below.');
      } else {
        setError(err.message);
      }
    } finally {
      setBusy(false);
    }
  }

  async function syncNow() {
    setBusy(true);
    setSyncResult(null);
    try {
      const r = await api.sync();
      setSyncResult(r);
      refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const connectionsByMember = new Map();
  for (const c of connections) {
    if (!connectionsByMember.has(c.member_id)) connectionsByMember.set(c.member_id, []);
    connectionsByMember.get(c.member_id).push(c);
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-baseline justify-between gap-4">
        <div>
          <h2 className="text-3xl font-light tracking-tight">Calendar</h2>
          <p className="text-fg/50 text-sm mt-1">
            Last sync: {settings.last_calendar_sync
              ? new Date(settings.last_calendar_sync).toLocaleString()
              : 'never'}
          </p>
        </div>
        <button
          onClick={syncNow}
          disabled={busy || connections.length === 0}
          className="rounded-full px-4 py-2 bg-white/10 hover:bg-white/20 active:scale-95 disabled:opacity-40 text-sm transition"
        >
          {busy ? 'Syncing…' : 'Sync now'}
        </button>
      </header>

      {error && <div className="rounded-2xl bg-rose-500/15 border border-rose-500/30 px-4 py-3 text-rose-200 text-sm">{error}</div>}

      {syncResult && (
        <div className="rounded-2xl bg-emerald-500/10 border border-emerald-500/25 px-4 py-3 text-emerald-200 text-sm">
          Synced {syncResult.synced} account{syncResult.synced === 1 ? '' : 's'}
          {syncResult.errors?.length ? ` · ${syncResult.errors.length} error(s)` : ''}
        </div>
      )}

      <ul className="flex flex-col gap-3">
        {members.map(m => {
          const conns = connectionsByMember.get(m.id) || [];
          return (
            <li key={m.id} className="rounded-2xl bg-white/[0.04] border border-white/10 p-4 flex items-start gap-4">
              <div
                className="h-12 w-12 rounded-full flex items-center justify-center text-2xl shrink-0"
                style={{ backgroundColor: `${m.color}33`, border: `1px solid ${m.color}66` }}
              >
                {m.emoji}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium">{m.name}</div>
                {conns.length === 0 ? (
                  <div className="text-fg/40 text-sm mt-0.5">No calendar connected</div>
                ) : (
                  <ul className="mt-2 flex flex-col gap-2">
                    {conns.map(c => (
                      <ConnectionRow key={c.id} connection={c} onChange={refresh} />
                    ))}
                  </ul>
                )}
              </div>
              <button
                onClick={() => connect(m.id)}
                disabled={busy}
                className="rounded-full px-3 py-1.5 bg-white/10 hover:bg-white/20 active:scale-95 disabled:opacity-40 text-xs uppercase tracking-widest font-medium transition shrink-0"
              >
                Connect
              </button>
            </li>
          );
        })}
      </ul>

      <SetupHelp />
    </div>
  );
}

function SetupHelp() {
  const [open, setOpen] = useState(false);
  return (
    <details
      open={open}
      onToggle={(e) => setOpen(e.target.open)}
      className="rounded-2xl bg-white/[0.03] border border-white/10 p-4 text-sm"
    >
      <summary className="cursor-pointer font-medium text-fg/70 hover:text-fg select-none">
        Google OAuth setup
      </summary>
      <ol className="mt-3 list-decimal list-inside space-y-2 text-fg/70 leading-relaxed">
        <li>Go to <a className="underline" href="https://console.cloud.google.com/" target="_blank" rel="noreferrer">Google Cloud Console</a> and create (or pick) a project.</li>
        <li>Enable the <strong>Google Calendar API</strong>.</li>
        <li>Configure the OAuth consent screen (External). Add yourself as a test user.</li>
        <li>Create credentials → <strong>OAuth client ID</strong> → type <em>Web application</em>.</li>
        <li>Add redirect URI: <code className="bg-black/40 px-1.5 py-0.5 rounded">http://localhost:3000/api/calendar/oauth/callback</code> (replace host when deploying to the Pi).</li>
        <li>Put the client ID and secret in <code className="bg-black/40 px-1.5 py-0.5 rounded">server/.env</code>:
          <pre className="mt-2 bg-black/40 rounded-lg p-3 text-xs text-fg/80 overflow-x-auto">
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=http://localhost:3000/api/calendar/oauth/callback
          </pre>
        </li>
        <li>Restart the server, then click <strong>Connect</strong> next to a member above.</li>
      </ol>
    </details>
  );
}
