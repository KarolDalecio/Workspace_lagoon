import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Avatar } from '../../shared/types';
import { apiPath } from './base';

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

/** Configuração pública vinda do servidor (assim não precisa rebuild para trocar chaves). */
export async function loadAuthConfig(): Promise<AuthConfig> {
  const res = await fetch(apiPath('api/config'));
  if (!res.ok) throw new Error('Não foi possível falar com o servidor.');
  const cfg = (await res.json()) as AuthConfig;
  if (cfg.auth === 'supabase' && cfg.supabaseUrl && cfg.supabaseAnonKey)
    client = createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: 'praca-auth' },
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
  if (!res.ok) throw new Error('Não foi possível confirmar o login.');
  return (await res.json()) as AuthUser;
}

export async function signIn(email: string, password: string) {
  if (!client) throw new Error('Login indisponível.');
  const { error } = await client.auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw new Error(error.message === 'Invalid login credentials' ? 'E-mail ou senha incorretos.' : error.message);
  return currentUser();
}

export async function signOut() {
  await client?.auth.signOut();
}

/** Cabeçalho de autorização para chamadas à nossa API. */
export async function authHeaders(): Promise<Record<string, string>> {
  const token = await accessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
