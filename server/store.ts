import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import type { SpaceMap } from '../shared/map';
import type { Avatar, ChatMessage } from '../shared/types';

/** Nome e código de acesso de um espaço. */
export interface SpaceMeta {
  name: string;
  code: string;
}

export interface SavedSpace {
  map: unknown;
  chat: ChatMessage[];
  meta: SpaceMeta | null;
}

export interface Upload {
  mime: string;
  data: Buffer;
}

export interface Membership {
  spaceId: string;
  name: string;
  code: string;
  lastVisited: number;
}

/** Onde ficam espaços (mapa, chat, nome/código), membros, perfis e imagens enviadas. */
export interface Store {
  kind: string;
  /** Sobrevive a um novo deploy/container? */
  persistent: boolean;
  init(): Promise<void>;
  /** Confere se o armazenamento responde (usado no /health). */
  ping(): Promise<boolean>;
  loadSpace(id: string): Promise<SavedSpace | null>;
  saveSpace(id: string, map: SpaceMap, chat: ChatMessage[], meta: SpaceMeta): Promise<void>;
  findSpaceByCode(code: string): Promise<string | null>;
  /** Registra (ou atualiza a data da) visita de uma pessoa a um espaço. */
  touchMembership(person: string, spaceId: string): Promise<void>;
  isMember(person: string, spaceId: string): Promise<boolean>;
  hasMembers(spaceId: string): Promise<boolean>;
  listMemberships(person: string): Promise<Membership[]>;
  loadProfile(person: string): Promise<Avatar | null>;
  saveProfile(person: string, avatar: Avatar): Promise<void>;
  saveUpload(name: string, mime: string, data: Buffer): Promise<void>;
  getUpload(name: string): Promise<Upload | null>;
}

const MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' };

interface FileMeta {
  /** pessoa → espaço → última visita (ms) */
  memberships: Record<string, Record<string, number>>;
  profiles: Record<string, Avatar>;
}

/** Arquivos em data/ — bom para rodar localmente. */
class FileStore implements Store {
  kind = 'arquivos';
  persistent = false;
  private spaces: string;
  private uploads: string;
  private metaFile: string;

  constructor(root: string) {
    this.spaces = path.join(root, 'data', 'spaces');
    this.uploads = path.join(root, 'data', 'uploads');
    this.metaFile = path.join(root, 'data', 'people.json');
  }

  async ping() {
    return true;
  }

  async init() {
    mkdirSync(this.spaces, { recursive: true });
    mkdirSync(this.uploads, { recursive: true });
  }

  private readMeta(): FileMeta {
    try {
      const m = JSON.parse(readFileSync(this.metaFile, 'utf8'));
      return { memberships: m.memberships ?? {}, profiles: m.profiles ?? {} };
    } catch {
      return { memberships: {}, profiles: {} };
    }
  }

  private writeMeta(m: FileMeta) {
    writeFileSync(this.metaFile, JSON.stringify(m));
  }

  private readSpace(id: string) {
    try {
      return JSON.parse(readFileSync(path.join(this.spaces, `${id}.json`), 'utf8'));
    } catch {
      return null;
    }
  }

  async loadSpace(id: string): Promise<SavedSpace | null> {
    const data = this.readSpace(id);
    if (!data) return null;
    // Formato antigo: o arquivo era só o mapa.
    if (data.rooms) return { map: data, chat: [], meta: null };
    return { map: data.map, chat: Array.isArray(data.chat) ? data.chat : [], meta: data.meta ?? null };
  }

  async saveSpace(id: string, map: SpaceMap, chat: ChatMessage[], meta: SpaceMeta) {
    writeFileSync(path.join(this.spaces, `${id}.json`), JSON.stringify({ map, chat, meta }));
  }

  async findSpaceByCode(code: string) {
    for (const file of readdirSync(this.spaces)) {
      if (!file.endsWith('.json')) continue;
      const id = file.slice(0, -5);
      if (this.readSpace(id)?.meta?.code === code) return id;
    }
    return null;
  }

  async touchMembership(person: string, spaceId: string) {
    const m = this.readMeta();
    (m.memberships[person] ??= {})[spaceId] = Date.now();
    this.writeMeta(m);
  }

  async isMember(person: string, spaceId: string) {
    return !!this.readMeta().memberships[person]?.[spaceId];
  }

  async hasMembers(spaceId: string) {
    return Object.values(this.readMeta().memberships).some(s => s[spaceId]);
  }

  async listMemberships(person: string) {
    const visits = this.readMeta().memberships[person] ?? {};
    return Object.entries(visits)
      .map(([spaceId, lastVisited]) => {
        const meta = this.readSpace(spaceId)?.meta;
        return meta ? { spaceId, name: meta.name, code: meta.code, lastVisited } : null;
      })
      .filter((m): m is Membership => !!m)
      .sort((a, b) => b.lastVisited - a.lastVisited);
  }

  async loadProfile(person: string) {
    return this.readMeta().profiles[person] ?? null;
  }

  async saveProfile(person: string, avatar: Avatar) {
    const m = this.readMeta();
    m.profiles[person] = avatar;
    this.writeMeta(m);
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
    this.pool = url instanceof pg.Pool ? url : new pg.Pool({ connectionString: url || undefined, max: 5, idleTimeoutMillis: 30_000 });
    // O pooler do Supabase fecha conexões ociosas; sem este handler o Node derruba o processo.
    this.pool.on('error', err => console.error('Conexão com o Postgres caiu (o pool reconecta sozinho):', err.message));
  }

  async ping() {
    try {
      await this.pool.query('SELECT 1');
      return true;
    } catch (err) {
      console.error('Postgres não respondeu:', (err as Error).message);
      return false;
    }
  }

  async init() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS spaces (
        id text PRIMARY KEY,
        map jsonb NOT NULL,
        chat jsonb NOT NULL DEFAULT '[]'::jsonb,
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      ALTER TABLE spaces ADD COLUMN IF NOT EXISTS name text;
      ALTER TABLE spaces ADD COLUMN IF NOT EXISTS code text;
      CREATE UNIQUE INDEX IF NOT EXISTS spaces_code_idx ON spaces (code);
      CREATE TABLE IF NOT EXISTS memberships (
        person text NOT NULL,
        space_id text NOT NULL,
        last_visited timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (person, space_id)
      );
      CREATE TABLE IF NOT EXISTS profiles (
        person text PRIMARY KEY,
        avatar jsonb NOT NULL,
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
    const { rows } = await this.pool.query('SELECT map, chat, name, code FROM spaces WHERE id = $1', [id]);
    const r = rows[0];
    if (!r) return null;
    return { map: r.map, chat: Array.isArray(r.chat) ? r.chat : [], meta: r.name && r.code ? { name: r.name, code: r.code } : null };
  }

  async saveSpace(id: string, map: SpaceMap, chat: ChatMessage[], meta: SpaceMeta) {
    await this.pool.query(
      `INSERT INTO spaces (id, map, chat, name, code, updated_at) VALUES ($1, $2, $3, $4, $5, now())
       ON CONFLICT (id) DO UPDATE SET map = EXCLUDED.map, chat = EXCLUDED.chat, name = EXCLUDED.name, code = EXCLUDED.code, updated_at = now()`,
      [id, JSON.stringify(map), JSON.stringify(chat), meta.name, meta.code],
    );
  }

  async findSpaceByCode(code: string) {
    const { rows } = await this.pool.query('SELECT id FROM spaces WHERE code = $1', [code]);
    return (rows[0]?.id as string) ?? null;
  }

  async touchMembership(person: string, spaceId: string) {
    await this.pool.query(
      `INSERT INTO memberships (person, space_id, last_visited) VALUES ($1, $2, now())
       ON CONFLICT (person, space_id) DO UPDATE SET last_visited = now()`,
      [person, spaceId],
    );
  }

  async isMember(person: string, spaceId: string) {
    const { rowCount } = await this.pool.query('SELECT 1 FROM memberships WHERE person = $1 AND space_id = $2', [person, spaceId]);
    return !!rowCount;
  }

  async hasMembers(spaceId: string) {
    const { rowCount } = await this.pool.query('SELECT 1 FROM memberships WHERE space_id = $1 LIMIT 1', [spaceId]);
    return !!rowCount;
  }

  async listMemberships(person: string) {
    const { rows } = await this.pool.query(
      `SELECT m.space_id, s.name, s.code, m.last_visited FROM memberships m JOIN spaces s ON s.id = m.space_id
       WHERE m.person = $1 AND s.code IS NOT NULL ORDER BY m.last_visited DESC`,
      [person],
    );
    return rows.map(r => ({ spaceId: r.space_id, name: r.name ?? r.space_id, code: r.code, lastVisited: new Date(r.last_visited).getTime() }));
  }

  async loadProfile(person: string) {
    const { rows } = await this.pool.query('SELECT avatar FROM profiles WHERE person = $1', [person]);
    return (rows[0]?.avatar as Avatar) ?? null;
  }

  async saveProfile(person: string, avatar: Avatar) {
    await this.pool.query(
      `INSERT INTO profiles (person, avatar, updated_at) VALUES ($1, $2, now())
       ON CONFLICT (person) DO UPDATE SET avatar = EXCLUDED.avatar, updated_at = now()`,
      [person, JSON.stringify(avatar)],
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
