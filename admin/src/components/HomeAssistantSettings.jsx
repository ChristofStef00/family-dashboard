import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api.js';

export default function HomeAssistantSettings() {
  const [loaded, setLoaded] = useState(false);
  const [url,    setUrl]    = useState('');
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  const refresh = useCallback(async () => {
    const s = await api.settings();
    setUrl(s.ha_url || '');
    setLoaded(true);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  async function save() {
    setSaving(true);
    setSavedFlash(false);
    try {
      await api.saveSettings({ ha_url: url.trim() });
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2000);
      refresh();
    } finally {
      setSaving(false);
    }
  }

  if (!loaded) return null;

  return (
    <section className="rounded-2xl bg-white/[0.04] border border-white/10 p-5 mt-8">
      <header className="mb-5">
        <h2 className="text-2xl font-light tracking-tight">Home Assistant</h2>
      </header>

      <p className="text-fg/55 text-sm leading-relaxed mb-5">
        Point the kiosk at a Home Assistant Lovelace dashboard. A faint Home
        Assistant logo in the display's top-left corner flips over to it — kept
        subtle so kids don't wander in. Design the smart-home dashboard in Home
        Assistant itself. Appending
        <code className="mx-1 px-1 py-0.5 rounded bg-white/[0.08] font-mono text-xs">?kiosk</code>
        (with the kiosk-mode integration) hides the HA sidebar/header.
      </p>

      <div className="flex flex-col gap-5">
        <Field
          label="Dashboard URL"
          hint="e.g. http://homeassistant.local:8123/lovelace/family?kiosk"
        >
          <input
            type="url"
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder="http://..."
            className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 outline-none focus:border-white/30 text-sm"
          />
        </Field>

        <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-white/10">
          <button
            onClick={save}
            disabled={saving}
            className="rounded-full px-4 py-2 bg-white/15 hover:bg-white/25 active:scale-95 disabled:opacity-40 text-sm font-medium transition"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          {savedFlash && <span className="text-emerald-400 text-sm">✓ Saved</span>}
          {!url && (
            <span className="text-fg/40 text-sm">
              Leave blank to hide the toggle button on the display.
            </span>
          )}
        </div>
      </div>
    </section>
  );
}

function Field({ label, hint, children }) {
  return (
    <div>
      <label className="block text-fg/60 text-xs uppercase tracking-widest font-medium mb-1.5">{label}</label>
      {children}
      {hint && <div className="text-fg/40 text-xs mt-1.5">{hint}</div>}
    </div>
  );
}
