/**
 * Prefixo em que o app está publicado (ex.: "/workspace/" atrás do Traefik com
 * Strip Path). Vem do `base` do Vite, definido por BASE_PATH no build.
 */
export const BASE = import.meta.env.BASE_URL.endsWith('/') ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`;

/** Caminho de um recurso do próprio servidor (API, Socket.IO, uploads) com o prefixo. */
export function apiPath(path: string) {
  return BASE + path.replace(/^\//, '');
}

/** Imagens enviadas ficam salvas no mapa como "/uploads/…"; no navegador ganham o prefixo. */
export function assetUrl(url: string) {
  return url.startsWith('/uploads/') ? apiPath(url) : url;
}
