/**
 * CRIER'S STORE
 *
 * One tiny interface, two adapters:
 *   - JSON file (.data/store.json) for local dev (/tmp on Vercel, ephemeral)
 *   - Upstash Redis (one hash per collection) when UPSTASH_REDIS_REST_URL is set
 *
 * Chat tools, the dashboard and /api/cycle all share it.
 */
import fs from "fs";
import path from "path";
import { Redis } from "@upstash/redis";
import type { Cursor, Draft, Group, Source, SpendLog, Update } from "./types";

type Collections = {
  sources: Source;
  groups: Group;
  updates: Update;
  drafts: Draft;
  spend: SpendLog;
  cursors: Cursor;
  meta: { id: string; value: unknown };
};
type Col = keyof Collections;

export interface Store {
  list<C extends Col>(col: C): Promise<Collections[C][]>;
  get<C extends Col>(col: C, id: string): Promise<Collections[C] | null>;
  put<C extends Col>(col: C, id: string, value: Collections[C]): Promise<void>;
  del(col: Col, id: string): Promise<void>;
}

// ─── JSON file adapter ───
class FileStore implements Store {
  // Vercel's deploy dir is read-only; /tmp is writable but ephemeral (per instance). Use Upstash for real persistence.
  private file = process.env.VERCEL ? path.join("/tmp", "crier", "store.json") : path.join(process.cwd(), ".data", "store.json");
  private queue: Promise<unknown> = Promise.resolve();

  private read(): Record<string, Record<string, unknown>> {
    try {
      return JSON.parse(fs.readFileSync(this.file, "utf8"));
    } catch {
      return {};
    }
  }

  private write(data: Record<string, Record<string, unknown>>) {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify(data, null, 2));
  }

  /** Serialize read-modify-write so concurrent tool calls don't clobber each other. */
  private mutate(fn: (data: Record<string, Record<string, unknown>>) => void) {
    const next = this.queue.then(() => {
      const data = this.read();
      fn(data);
      this.write(data);
    });
    this.queue = next.catch(() => {});
    return next;
  }

  async list<C extends Col>(col: C) {
    await this.queue;
    return Object.values(this.read()[col] ?? {}) as Collections[C][];
  }
  async get<C extends Col>(col: C, id: string) {
    await this.queue;
    return ((this.read()[col] ?? {})[id] ?? null) as Collections[C] | null;
  }
  async put<C extends Col>(col: C, id: string, value: Collections[C]) {
    await this.mutate((d) => ((d[col] ??= {})[id] = value));
  }
  async del(col: Col, id: string) {
    await this.mutate((d) => void delete (d[col] ?? {})[id]);
  }
}

// ─── Upstash Redis adapter ───
class RedisStore implements Store {
  private redis = new Redis({ url: process.env.UPSTASH_REDIS_REST_URL!, token: process.env.UPSTASH_REDIS_REST_TOKEN! });
  private key = (col: Col) => `crier:${col}`;

  async list<C extends Col>(col: C) {
    const all = await this.redis.hgetall<Record<string, Collections[C]>>(this.key(col));
    return Object.values(all ?? {});
  }
  async get<C extends Col>(col: C, id: string) {
    return (await this.redis.hget<Collections[C]>(this.key(col), id)) ?? null;
  }
  async put<C extends Col>(col: C, id: string, value: Collections[C]) {
    await this.redis.hset(this.key(col), { [id]: value });
  }
  async del(col: Col, id: string) {
    await this.redis.hdel(this.key(col), id);
  }
}

let instance: Store | null = null;
export function store(): Store {
  return (instance ??= process.env.UPSTASH_REDIS_REST_URL ? new RedisStore() : new FileStore());
}

export const storeKind = () => (process.env.UPSTASH_REDIS_REST_URL ? "upstash" : "file");

export function newId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** Normalised ecosystem match ("nebula chain" == "Nebula Chain"). */
export const sameEco = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
