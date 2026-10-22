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
/**
 * Tabelas antigas (sem _wa): todas as colunas deste app e as mínimas para aproveitar os dados.
 * Com exatamente essas colunas, a tabela é renomeada; com colunas a mais (pode ser compartilhada
 * com outro app no mesmo projeto Supabase), as linhas são só copiadas e a tabela fica intocada.
 */
const LEGACY_TABLES: Record<string, { cols: string[]; required: string[] }> = {
  spaces: { cols: ['id', 'map', 'chat', 'updated_at', 'name', 'code'], required: ['id', 'map'] },
  memberships: { cols: ['person', 'space_id', 'last_visited'], required: ['person', 'space_id'] },
  profiles: { cols: ['person', 'avatar', 'updated_at'], required: ['person', 'avatar'] },
  uploads: { cols: ['name', 'mime', 'data', 'created_at'], required: ['name', 'mime', 'data'] },
};

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

  /**
   * Versões antigas criavam as tabelas sem o sufixo _wa. Renomeia só se a tabela antiga
   * tiver as colunas deste app (num projeto Supabase compartilhado, "profiles" pode ser de outro app).
   */
  private async legacyInfo(table: string) {
    const { rows } = await this.pool.query(
      `SELECT
         to_regclass($1) IS NOT NULL AS has_new,
         (SELECT array_agg(column_name::text) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $2) AS old_cols`,
      [`public.${table}_wa`, table],
    );
    return rows[0] as { has_new: boolean; old_cols: string[] | null };
  }

  /** Antes de criar as tabelas _wa: renomeia as antigas que são só deste app (mantém dados e índices). */
  private async renameLegacyTables() {
    for (const [table, { cols }] of Object.entries(LEGACY_TABLES)) {
      const { has_new, old_cols } = await this.legacyInfo(table);
      if (has_new || !old_cols) continue;
      if (old_cols.length !== cols.length || !cols.every(c => old_cols.includes(c))) continue; // copiada depois
      await this.pool.query(`ALTER TABLE public.${table} RENAME TO ${table}_wa`);
      console.log(`Tabela "${table}" renomeada para "${table}_wa".`);
    }
    await this.pool.query('ALTER INDEX IF EXISTS public.spaces_code_idx RENAME TO spaces_wa_code_idx').catch(() => {});
  }

  /**
   * Depois de criar as tabelas _wa: copia as linhas das tabelas antigas que continuam existindo
   * (as que têm colunas a mais). Não altera nem apaga a tabela antiga; linhas já copiadas são ignoradas.
   */
  private async copyLegacyRows() {
    for (const [table, { cols, required }] of Object.entries(LEGACY_TABLES)) {
      const { old_cols } = await this.legacyInfo(table);
      if (!old_cols) continue;
      if (!required.every(c => old_cols.includes(c))) {
        console.warn(`Tabela "${table}" existente não é deste app — ignorada.`);
        continue;
      }
      const shared = cols.filter(c => old_cols.includes(c));
      const list = shared.join(', ');
      const where = required.map(c => `${c} IS NOT NULL`).join(' AND ');
      try {
        const { rowCount } = await this.pool.query(
          `INSERT INTO ${table}_wa (${list}) SELECT ${list} FROM public.${table} WHERE ${where} ON CONFLICT DO NOTHING`,
        );
        if (rowCount) console.log(`${rowCount} linha(s) copiada(s) de "${table}" para "${table}_wa".`);
      } catch (err) {
        console.error(`Não foi possível copiar "${table}" para "${table}_wa":`, (err as Error).message);
      }
    }
  }

  /**
   * Antes de qualquer migração, guarda uma cópia (uma por dia) das tabelas deste app, antigas e _wa,
   * em backup_wa_<tabela>_<AAAAMMDD>. Nunca apaga nada; RLS ligado como nas outras.
   */
  private async backupTables() {
    const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    for (const [table, { required }] of Object.entries(LEGACY_TABLES))
      for (const name of [table, `${table}_wa`]) {
        const { rows } = await this.pool.query(
          `SELECT array_agg(column_name::text) AS cols FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`,
          [name],
        );
        const cols = rows[0]?.cols as string[] | null;
        if (!cols || !required.every(c => cols.includes(c))) continue; // não existe ou não é deste app
        const backup = `backup_wa_${name.replace(/_wa$/, '')}${name.endsWith('_wa') ? '_novo' : ''}_${day}`;
        try {
          const created = await this.pool.query(`SELECT to_regclass($1) IS NULL AS missing`, [`public.${backup}`]);
          if (!created.rows[0].missing) continue;
          await this.pool.query(`CREATE TABLE public.${backup} AS TABLE public.${name}`);
          await this.pool.query(`ALTER TABLE public.${backup} ENABLE ROW LEVEL SECURITY`);
          const { rows: n } = await this.pool.query(`SELECT count(*)::int AS n FROM public.${backup}`);
          console.log(`Backup: "${name}" → "${backup}" (${n[0].n} linha(s)).`);
        } catch (err) {
          console.error(`Falha no backup de "${name}":`, (err as Error).message);
        }
      }
  }

  async init() {
    await this.backupTables();
    await this.renameLegacyTables();
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS spaces_wa (
        id text PRIMARY KEY,
        map jsonb NOT NULL,
        chat jsonb NOT NULL DEFAULT '[]'::jsonb,
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      ALTER TABLE spaces_wa ADD COLUMN IF NOT EXISTS name text;
      ALTER TABLE spaces_wa ADD COLUMN IF NOT EXISTS code text;
      CREATE UNIQUE INDEX IF NOT EXISTS spaces_wa_code_idx ON spaces_wa (code);
      CREATE TABLE IF NOT EXISTS memberships_wa (
        person text NOT NULL,
        space_id text NOT NULL,
        last_visited timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (person, space_id)
      );
      CREATE TABLE IF NOT EXISTS profiles_wa (
        person text PRIMARY KEY,
        avatar jsonb NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS uploads_wa (
        name text PRIMARY KEY,
        mime text NOT NULL,
        data bytea NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      -- Sem policies: só o servidor (dono das tabelas) acessa; a API REST do Supabase com a chave anon não.
      ALTER TABLE spaces_wa ENABLE ROW LEVEL SECURITY;
      ALTER TABLE memberships_wa ENABLE ROW LEVEL SECURITY;
      ALTER TABLE profiles_wa ENABLE ROW LEVEL SECURITY;
      ALTER TABLE uploads_wa ENABLE ROW LEVEL SECURITY;
    `);
    await this.copyLegacyRows();
  }

  async loadSpace(id: string) {
    const { rows } = await this.pool.query('SELECT map, chat, name, code FROM spaces_wa WHERE id = $1', [id]);
    const r = rows[0];
    if (!r) return null;
    return { map: r.map, chat: Array.isArray(r.chat) ? r.chat : [], meta: r.name && r.code ? { name: r.name, code: r.code } : null };
  }

  async saveSpace(id: string, map: SpaceMap, chat: ChatMessage[], meta: SpaceMeta) {
    await this.pool.query(
      `INSERT INTO spaces_wa (id, map, chat, name, code, updated_at) VALUES ($1, $2, $3, $4, $5, now())
       ON CONFLICT (id) DO UPDATE SET map = EXCLUDED.map, chat = EXCLUDED.chat, name = EXCLUDED.name, code = EXCLUDED.code, updated_at = now()`,
      [id, JSON.stringify(map), JSON.stringify(chat), meta.name, meta.code],
    );
  }

  async findSpaceByCode(code: string) {
    const { rows } = await this.pool.query('SELECT id FROM spaces_wa WHERE code = $1', [code]);
    return (rows[0]?.id as string) ?? null;
  }

  async touchMembership(person: string, spaceId: string) {
    await this.pool.query(
      `INSERT INTO memberships_wa (person, space_id, last_visited) VALUES ($1, $2, now())
       ON CONFLICT (person, space_id) DO UPDATE SET last_visited = now()`,
      [person, spaceId],
    );
  }

  async isMember(person: string, spaceId: string) {
    const { rowCount } = await this.pool.query('SELECT 1 FROM memberships_wa WHERE person = $1 AND space_id = $2', [person, spaceId]);
    return !!rowCount;
  }

  async hasMembers(spaceId: string) {
    const { rowCount } = await this.pool.query('SELECT 1 FROM memberships_wa WHERE space_id = $1 LIMIT 1', [spaceId]);
    return !!rowCount;
  }

  async listMemberships(person: string) {
    const { rows } = await this.pool.query(
      `SELECT m.space_id, s.name, s.code, m.last_visited FROM memberships_wa m JOIN spaces_wa s ON s.id = m.space_id
       WHERE m.person = $1 AND s.code IS NOT NULL ORDER BY m.last_visited DESC`,
      [person],
    );
    return rows.map(r => ({ spaceId: r.space_id, name: r.name ?? r.space_id, code: r.code, lastVisited: new Date(r.last_visited).getTime() }));
  }

  async loadProfile(person: string) {
    const { rows } = await this.pool.query('SELECT avatar FROM profiles_wa WHERE person = $1', [person]);
    return (rows[0]?.avatar as Avatar) ?? null;
  }

  async saveProfile(person: string, avatar: Avatar) {
    await this.pool.query(
      `INSERT INTO profiles_wa (person, avatar, updated_at) VALUES ($1, $2, now())
       ON CONFLICT (person) DO UPDATE SET avatar = EXCLUDED.avatar, updated_at = now()`,
      [person, JSON.stringify(avatar)],
    );
  }

  async saveUpload(name: string, mime: string, data: Buffer) {
    await this.pool.query('INSERT INTO uploads_wa (name, mime, data) VALUES ($1, $2, $3) ON CONFLICT (name) DO NOTHING', [name, mime, data]);
  }

  async getUpload(name: string) {
    const { rows } = await this.pool.query('SELECT mime, data FROM uploads_wa WHERE name = $1', [name]);
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
