import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import type { SpaceMap } from '../shared/map';
import type { ChatMessage } from '../shared/types';

export interface SavedSpace {
  map: unknown;
  chat: ChatMessage[];
}

export interface Upload {
  mime: string;
  data: Buffer;
}

/** Onde ficam mapas, chat e imagens enviadas. */
export interface Store {
  kind: string;
  /** Sobrevive a um novo deploy/container? */
  persistent: boolean;
  init(): Promise<void>;
  loadSpace(id: string): Promise<SavedSpace | null>;
  saveSpace(id: string, map: SpaceMap, chat: ChatMessage[]): Promise<void>;
  saveUpload(name: string, mime: string, data: Buffer): Promise<void>;
  getUpload(name: string): Promise<Upload | null>;
}

const MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' };

/** Arquivos em data/ — bom para rodar localmente. */
class FileStore implements Store {
  kind = 'arquivos';
  persistent = false;
  private spaces: string;
  private uploads: string;

  constructor(root: string) {
    this.spaces = path.join(root, 'data', 'spaces');
    this.uploads = path.join(root, 'data', 'uploads');
  }

  async init() {
    mkdirSync(this.spaces, { recursive: true });
    mkdirSync(this.uploads, { recursive: true });
  }

  async loadSpace(id: string) {
    try {
      const data = JSON.parse(readFileSync(path.join(this.spaces, `${id}.json`), 'utf8'));
      // Formato antigo: o arquivo era só o mapa.
      if (data && data.rooms) return { map: data, chat: [] };
      return { map: data?.map, chat: Array.isArray(data?.chat) ? data.chat : [] };
    } catch {
      return null;
    }
  }

  async saveSpace(id: string, map: SpaceMap, chat: ChatMessage[]) {
    writeFileSync(path.join(this.spaces, `${id}.json`), JSON.stringify({ map, chat }));
  }

  async saveUpload(name: string, _mime: string, data: Buffer) {
    writeFileSync(path.join(this.uploads, name), data);
  }

  async getUpload(name: string) {
    try {
      return { mime: MIME[name.split('.').pop() ?? ''] ?? 'application/octet-stream', data: readFileSync(path.join(this.uploads, name)) };
    } catch {
      return null;
    }
  }
}

/** Postgres — para produção (o container pode ser recriado sem perder nada). */
export class PgStore implements Store {
  kind = 'postgres';
  persistent = true;
  private pool: pg.Pool;

  /** Sem URL, o driver usa as variáveis PGHOST/PGUSER/PGPASSWORD/PGDATABASE/PGPORT. */
  constructor(url?: string | pg.Pool) {
    this.pool = url instanceof pg.Pool ? url : new pg.Pool({ connectionString: url || undefined, max: 5 });
  }

  async init() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS spaces (
        id text PRIMARY KEY,
        map jsonb NOT NULL,
        chat jsonb NOT NULL DEFAULT '[]'::jsonb,
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS uploads (
        name text PRIMARY KEY,
        mime text NOT NULL,
        data bytea NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `);
  }

  async loadSpace(id: string) {
    const { rows } = await this.pool.query('SELECT map, chat FROM spaces WHERE id = $1', [id]);
    return rows[0] ? { map: rows[0].map, chat: Array.isArray(rows[0].chat) ? rows[0].chat : [] } : null;
  }

  async saveSpace(id: string, map: SpaceMap, chat: ChatMessage[]) {
    await this.pool.query(
      `INSERT INTO spaces (id, map, chat, updated_at) VALUES ($1, $2, $3, now())
       ON CONFLICT (id) DO UPDATE SET map = EXCLUDED.map, chat = EXCLUDED.chat, updated_at = now()`,
      [id, JSON.stringify(map), JSON.stringify(chat)],
    );
  }

  async saveUpload(name: string, mime: string, data: Buffer) {
    await this.pool.query('INSERT INTO uploads (name, mime, data) VALUES ($1, $2, $3) ON CONFLICT (name) DO NOTHING', [name, mime, data]);
  }

  async getUpload(name: string) {
    const { rows } = await this.pool.query('SELECT mime, data FROM uploads WHERE name = $1', [name]);
    return rows[0] ? { mime: rows[0].mime as string, data: Buffer.from(rows[0].data) } : null;
  }
}

/** Nomes aceitos para a URL do Postgres (o primeiro definido vale). */
export const DATABASE_ENV = ['DATABASE_URL', 'POSTGRES_URL', 'POSTGRESQL_URL', 'DATABASE_PRIVATE_URL', 'PG_URL'];

/** Usa Postgres se houver URL (ou PGHOST); senão, arquivos locais. */
export function createStore(root: string): Store {
  const url = DATABASE_ENV.map(k => process.env[k]?.trim()).find(Boolean);
  if (url || process.env.PGHOST) return new PgStore(url);
  if (process.env.NODE_ENV === 'production')
    console.warn(
      [
        '',
        '⚠️  ATENÇÃO: nenhum banco configurado — salvando dentro do container.',
        '    Mapas, chat e imagens SERÃO PERDIDOS no próximo deploy.',
        `    Defina ${DATABASE_ENV[0]} (URL do Postgres) nas variáveis de ambiente do app e faça o deploy de novo.`,
        '',
      ].join('\n'),
    );
  return new FileStore(root);
}
