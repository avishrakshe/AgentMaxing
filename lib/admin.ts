/** Sources & groups CRUD, shared by chat tools and the dashboard. */
import { newId, sameEco, store } from "./store";
import type { Group, Language, Source } from "./types";

const cleanDomain = (d: string) => d.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");

export async function addSource(input: { ecosystem: string; kind: Source["kind"]; value?: string; allowedDomains?: string[] }) {
  const db = store();
  const ecosystem = input.ecosystem.trim();
  const value = (input.value ?? "").trim() || (input.kind === "list" ? `${ecosystem} list` : ecosystem);
  const existing = (await db.list("sources")).find((s) => sameEco(s.ecosystem, ecosystem) && s.kind === input.kind && s.value.toLowerCase() === value.toLowerCase());
  const source: Source = {
    id: existing?.id ?? newId("src"),
    ecosystem,
    kind: input.kind,
    value: input.kind === "handle" ? value.replace(/^@/, "") : value,
    allowedDomains: [...new Set([...(existing?.allowedDomains ?? []), ...(input.allowedDomains ?? []).map(cleanDomain).filter(Boolean)])],
    enabled: true,
  };
  await db.put("sources", source.id, source);
  return source;
}

export async function addGroup(input: {
  name: string;
  ecosystems: string[];
  language?: Language;
  mode?: Group["mode"];
  maxPerDay?: number;
  jid?: string;
  theme?: Group["theme"];
}) {
  const db = store();
  const existing = (await db.list("groups")).find((g) => g.name.toLowerCase() === input.name.trim().toLowerCase());
  const group: Group = {
    id: existing?.id ?? newId("grp"),
    name: input.name.trim(),
    jid: input.jid ?? existing?.jid,
    ecosystems: input.ecosystems.map((e) => e.trim()).filter(Boolean),
    language: input.language ?? existing?.language ?? "en",
    mode: input.mode ?? existing?.mode ?? "review",
    maxPerDay: input.maxPerDay ?? existing?.maxPerDay ?? 6,
    theme: input.theme ?? existing?.theme,
  };
  await db.put("groups", group.id, group);
  return group;
}
