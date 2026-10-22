import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Avatar } from '../../shared/types';
import { BASE, apiPath } from './base';

export interface AuthConfig {
  auth: 'supabase' | 'disabled' | 'misconfigured';
  supabaseUrl?: string;
  supabaseAnonKey?: string;
}

export interface AuthUser {
  email: string;
  person: string;
  /** Avatar salvo na conta (null se ainda não escolheu). */
  avatar?: Avatar | null;
}

let client: SupabaseClient | null = null;

/**
 * Voltou do link "redefinir senha" do e-mail? O Supabase coloca type=recovery na URL;
 * guardamos antes de criar o cliente (que limpa a URL ao ler o token).
 */
let recovering = /(^|[#&?])type=recovery(&|$)/.test(location.hash + '&' + location.search.slice(1));

export function isRecovering() {
  return recovering;
}

/** Configuração pública vinda do servidor (assim não precisa rebuild para trocar chaves). */
export async function loadAuthConfig(): Promise<AuthConfig> {
  const res = await fetch(apiPath('api/config'));
  if (!res.ok) throw new Error('Não foi possível falar com o servidor.');
  const cfg = (await res.json()) as AuthConfig;
  if (cfg.auth === 'supabase' && cfg.supabaseUrl && cfg.supabaseAnonKey)
    client = createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: 'praca-auth' },
    });
  client?.auth.onAuthStateChange(event => {
    if (event === 'PASSWORD_RECOVERY') recovering = true;
  });
  return cfg;
}

/** Token atual (renovado automaticamente pelo Supabase); undefined sem login. */
export async function accessToken() {
  if (!client) return undefined;
  const { data } = await client.auth.getSession();
  return data.session?.access_token;
}

/** Avatar salvo no servidor quando o login está desligado (desenvolvimento). */
export async function devAvatar(): Promise<Avatar | null> {
  const res = await fetch(apiPath('api/me'));
  return res.ok ? ((await res.json()).avatar ?? null) : null;
}

/** Quem está logado, conferido pelo nosso servidor (que aplica a lista de e-mails). */
export async function currentUser(): Promise<AuthUser | null> {
  const token = await accessToken();
  if (!token) return null;
  const res = await fetch(apiPath('api/me'), { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 401) {
    await signOut();
    throw new Error('Este e-mail não tem acesso ao workspace.');
  }
  if (!res.ok)
    throw new Error(
      res.status >= 500
        ? `O servidor não conseguiu confirmar o login (erro ${res.status}). Tente de novo em alguns segundos.`
        : `Não foi possível confirmar o login (erro ${res.status}).`,
    );
  return (await res.json()) as AuthUser;
}

export async function signIn(email: string, password: string) {
  if (!client) throw new Error('Login indisponível.');
  const { error } = await client.auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw new Error(error.message === 'Invalid login credentials' ? 'E-mail ou senha incorretos.' : error.message);
  return currentUser();
}

/** Manda o e-mail com o link para criar uma nova senha (volta para esta mesma página). */
export async function sendPasswordReset(email: string) {
  if (!client) throw new Error('Login indisponível.');
  const { error } = await client.auth.resetPasswordForEmail(email.trim(), { redirectTo: location.origin + BASE });
  if (error) {
    if (/rate limit|seconds/i.test(error.message)) throw new Error('Muitos pedidos seguidos. Espere um pouco e tente de novo.');
    throw new Error(error.message);
  }
}

/** Define a nova senha (vale para a sessão aberta pelo link do e-mail). */
export async function updatePassword(password: string) {
  if (!client) throw new Error('Login indisponível.');
  const { data } = await client.auth.getSession();
  if (!data.session) throw new Error('O link expirou ou já foi usado. Peça um novo em "Esqueci minha senha".');
  const { error } = await client.auth.updateUser({ password });
  if (error) {
    if (/different from the old/i.test(error.message)) throw new Error('A nova senha precisa ser diferente da anterior.');
    if (/at least|weak|short/i.test(error.message)) throw new Error('Senha fraca: use pelo menos 8 caracteres.');
    throw new Error(error.message);
  }
  recovering = false;
  history.replaceState(null, '', location.pathname);
}

export async function signOut() {
  await client?.auth.signOut();
}

/** Cabeçalho de autorização para chamadas à nossa API. */
export async function authHeaders(): Promise<Record<string, string>> {
  const token = await accessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
