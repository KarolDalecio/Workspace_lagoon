import { cleanAvatar, randomAvatar, type Avatar, type SpaceSummary } from '../../shared/types';
import { authHeaders } from './auth';
import { apiPath } from './base';

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(apiPath(path), {
    ...init,
    headers: { ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...(await authHeaders()), ...(init.headers ?? {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? 'Algo deu errado. Tente de novo.');
  return data as T;
}

export const listSpaces = () => call<SpaceSummary[]>('api/spaces');

export const createSpace = (name: string) =>
  call<{ id: string; name: string; code: string }>('api/spaces', { method: 'POST', body: JSON.stringify({ name }) });

export const joinByCode = (code: string) =>
  call<{ id: string; name: string; code: string }>('api/spaces/join', { method: 'POST', body: JSON.stringify({ code }) });

export const saveAvatarRemote = (avatar: Avatar) => call<{ avatar: Avatar }>('api/me/avatar', { method: 'PUT', body: JSON.stringify({ avatar }) });

const AVATAR_KEY = 'praca:avatar';
const AUTOJOIN_KEY = 'praca:autojoin';

/** Avatar guardado neste navegador (reserva quando a conta ainda não tem um). */
export function localAvatar(): Avatar {
  try {
    const saved = JSON.parse(localStorage.getItem(AVATAR_KEY) ?? localStorage.getItem('praca:profile') ?? 'null');
    if (saved) return cleanAvatar(saved.avatar ?? saved);
  } catch {
    // sem armazenamento
  }
  return randomAvatar();
}

export function saveLocalAvatar(avatar: Avatar) {
  try {
    localStorage.setItem(AVATAR_KEY, JSON.stringify(avatar));
  } catch {
    // ignora
  }
}

/** Espaço em que a pessoa entra direto ao abrir o app (até clicar em "Sair"). */
export function autoJoinSpace() {
  try {
    return localStorage.getItem(AUTOJOIN_KEY);
  } catch {
    return null;
  }
}

export function setAutoJoinSpace(id: string | null) {
  try {
    if (id) localStorage.setItem(AUTOJOIN_KEY, id);
    else localStorage.removeItem(AUTOJOIN_KEY);
  } catch {
    // ignora
  }
}
