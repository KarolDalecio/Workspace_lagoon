import { KeyRound, LockKeyhole } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { sendPasswordReset, signIn, updatePassword, type AuthUser } from '../auth';

export function Login({ onLogin, initialError }: { onLogin: (user: AuthUser) => void; initialError?: string | null }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [mode, setMode] = useState<'login' | 'forgot'>('login');
  const [sent, setSent] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === 'forgot') {
        await sendPasswordReset(email);
        setSent(true);
        setBusy(false);
        return;
      }
      const user = await signIn(email, password);
      if (user) onLogin(user);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  function switchMode(m: 'login' | 'forgot') {
    setMode(m);
    setError(null);
    setSent(false);
  }

  if (mode === 'forgot')
    return (
      <div className="lobby">
        <form className="lobby-card login-card" onSubmit={submit}>
          <div className="brand">
            <span className="brand-dot" /> Praça
          </div>
          <p className="lobby-sub">
            <KeyRound size={14} /> Esqueci minha senha
          </p>
          {sent ? (
            <p className="hint ok">
              Se esse e-mail tiver acesso, enviamos um link para criar uma nova senha. Confira a caixa de entrada (e o spam).
            </p>
          ) : (
            <>
              <label className="field">
                E-mail
                <input type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} required autoFocus />
              </label>
              <button className="primary" disabled={busy || !email}>
                {busy ? 'Enviando…' : 'Enviar link para redefinir'}
              </button>
            </>
          )}
          {error && <p className="hint warn">{error}</p>}
          <button type="button" className="link-btn" onClick={() => switchMode('login')}>
            ← Voltar para o login
          </button>
        </form>
      </div>
    );

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
        <button type="button" className="link-btn" onClick={() => switchMode('forgot')}>
          Esqueci minha senha
        </button>
      </form>
    </div>
  );
}

/** Tela aberta pelo link do e-mail de redefinição: cria a nova senha e já entra. */
export function NewPassword({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError('As senhas não são iguais.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await updatePassword(password);
      onDone();
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
          <KeyRound size={14} /> Crie sua nova senha
        </p>
        <label className="field">
          Nova senha
          <input type="password" autoComplete="new-password" minLength={8} value={password} onChange={e => setPassword(e.target.value)} required autoFocus />
        </label>
        <label className="field">
          Repita a nova senha
          <input type="password" autoComplete="new-password" minLength={8} value={confirm} onChange={e => setConfirm(e.target.value)} required />
        </label>
        <button className="primary" disabled={busy || password.length < 8 || !confirm}>
          {busy ? 'Salvando…' : 'Salvar nova senha'}
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
