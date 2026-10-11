import { LockKeyhole } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { signIn, type AuthUser } from '../auth';

export function Login({ onLogin, initialError }: { onLogin: (user: AuthUser) => void; initialError?: string | null }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(initialError ?? null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const user = await signIn(email, password);
      if (user) onLogin(user);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="lobby">
      <form className="lobby-card login-card" onSubmit={submit}>
        <div className="brand">
          <span className="brand-dot" /> Praça
        </div>
        <p className="lobby-sub">
          <LockKeyhole size={14} /> Acesso restrito. Entre com sua conta.
        </p>
        <label className="field">
          E-mail
          <input type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} required autoFocus />
        </label>
        <label className="field">
          Senha
          <input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required />
        </label>
        <button className="primary" disabled={busy || !email || !password}>
          {busy ? 'Entrando…' : 'Entrar'}
        </button>
        {error && <p className="hint warn">{error}</p>}
      </form>
    </div>
  );
}

export function ClosedScreen({ message }: { message: string }) {
  return (
    <div className="lobby">
      <div className="lobby-card login-card">
        <div className="brand">
          <span className="brand-dot" /> Praça
        </div>
        <p className="hint warn">{message}</p>
      </div>
    </div>
  );
}
