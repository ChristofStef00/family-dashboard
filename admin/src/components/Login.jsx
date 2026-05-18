import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { setToken } from '../lib/auth.js';

export default function Login({ onSuccess }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef();

  useEffect(() => { inputRef.current?.focus(); }, []);

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const { token } = await api.login(pin);
      setToken(token);
      onSuccess?.();
    } catch (err) {
      setError(err.status === 401 ? 'Wrong PIN' : err.message);
      setPin('');
      inputRef.current?.focus();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <form onSubmit={submit} className="w-full max-w-xs flex flex-col gap-4 text-center">
        <h1 className="text-2xl font-light tracking-tight">Family Dashboard</h1>
        <p className="text-fg/50 text-sm">Enter admin PIN</p>
        <input
          ref={inputRef}
          type="password"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
          className="bg-white/5 border border-white/10 rounded-2xl px-4 py-4 text-center text-2xl tracking-[0.4em] outline-none focus:border-white/30"
          placeholder="••••"
        />
        {error && <div className="text-rose-400 text-sm">{error}</div>}
        <button
          type="submit"
          disabled={busy || pin.length < 4}
          className="rounded-full px-4 py-3 bg-white/10 hover:bg-white/20 disabled:opacity-30 transition active:scale-95 font-medium"
        >
          {busy ? 'Checking…' : 'Unlock'}
        </button>
      </form>
    </div>
  );
}
