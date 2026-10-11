/**
 * Login via Supabase Auth. O navegador entra com e-mail e senha (anon key) e manda
 * o token de acesso; aqui o token é conferido no Supabase e o e-mail precisa estar
 * em ALLOWED_USERS. A service role NÃO é usada.
 *
 * ALLOWED_USERS: "email=Pessoa,email2=Pessoa". Vários e-mails podem ser a mesma pessoa
 * (ex.: duas contas do Guilherme) — salas trancadas e mesas ficam presas à pessoa.
 */

export interface AuthUser {
  email: string;
  /** Nome da pessoa (usado como nome no espaço e nas salas trancadas). */
  person: string;
}

export type AuthMode = 'supabase' | 'disabled' | 'misconfigured';

const SUPABASE_URL = (process.env.SUPABASE_URL ?? '').trim().replace(/\/+$/, '');
const SUPABASE_ANON_KEY = (process.env.SUPABASE_ANON_KEY ?? '').trim();
const PRODUCTION = process.env.NODE_ENV === 'production';

function parseAllowed(raw: string | undefined) {
  const map = new Map<string, string>();
  for (const part of (raw ?? '').split(/[,;\n]/)) {
    const [email, person] = part.split('=').map(s => s?.trim());
    if (email && email.includes('@')) map.set(email.toLowerCase(), person || email.split('@')[0]);
  }
  return map;
}

const ALLOWED = parseAllowed(process.env.ALLOWED_USERS);

/** Pega o "role" de dentro do JWT sem validar (só para recusar a service role por engano). */
function jwtRole(token: string) {
  try {
    return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')).role as string | undefined;
  } catch {
    return undefined;
  }
}

function detectMode(): AuthMode {
  const configured = SUPABASE_URL && SUPABASE_ANON_KEY && ALLOWED.size > 0;
  if (configured) {
    if (jwtRole(SUPABASE_ANON_KEY) === 'service_role') {
      console.error('⛔ SUPABASE_ANON_KEY contém uma chave service_role. Use a anon/publishable key (Settings → API Keys).');
      return 'misconfigured';
    }
    return 'supabase';
  }
  // Em produção, sem login configurado o app fica fechado (nunca aberto sem senha).
  if (PRODUCTION && process.env.AUTH_DISABLED !== 'true') {
    console.error('⛔ Login não configurado: defina SUPABASE_URL, SUPABASE_ANON_KEY e ALLOWED_USERS. O app fica fechado até lá.');
    return 'misconfigured';
  }
  return 'disabled';
}

export const authMode: AuthMode = detectMode();

/** O que o navegador precisa saber para mostrar a tela de login (tudo público). */
export function publicAuthConfig() {
  return authMode === 'supabase'
    ? { auth: authMode, supabaseUrl: SUPABASE_URL, supabaseAnonKey: SUPABASE_ANON_KEY }
    : { auth: authMode };
}

const cache = new Map<string, { user: AuthUser | null; until: number }>();

/** Confere o token no Supabase e na lista autorizada. Resultado fica em cache por 5 minutos. */
export async function verifyToken(token: unknown): Promise<AuthUser | null> {
  if (authMode !== 'supabase' || typeof token !== 'string' || token.length < 20 || token.length > 4096) return null;
  const now = Date.now();
  const hit = cache.get(token);
  if (hit && hit.until > now) return hit.user;
  let user: AuthUser | null = null;
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      const data = (await res.json()) as { email?: string };
      const email = data.email?.toLowerCase();
      const person = email ? ALLOWED.get(email) : undefined;
      if (email && person) user = { email, person };
    }
  } catch (err) {
    console.error('Falha ao validar login no Supabase', err);
    return null; // erro de rede não entra no cache
  }
  cache.set(token, { user, until: now + 5 * 60 * 1000 });
  if (cache.size > 500) for (const [k, v] of cache) if (v.until <= now) cache.delete(k);
  return user;
}

/** Token "Bearer …" de uma requisição HTTP. */
export function bearer(header: string | undefined) {
  return header?.startsWith('Bearer ') ? header.slice(7).trim() : undefined;
}
