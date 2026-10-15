/** Sample specs for /api/poster/sample-<template>[?stress=1] — template previews and overflow tests. */
import { clampSpec } from "../draft";
import type { PosterSpec, PosterTemplate } from "../types";

const base = { sourceHandle: "@NebulaChain", ecosystem: "Nebula Chain" };

const SAMPLES: Record<PosterTemplate, Partial<PosterSpec> & { title: string }> = {
  announcement: {
    template: "announcement",
    title: "Nebula Mainnet is live",
    subtitle: "After 14 months of testnet and 3 audits, the network is open to everyone.",
    facts: ["3 independent audits", "Bridge + RPC docs ready", "Deploy contracts today"],
    dateIST: "Wed, 14 Oct 2026",
    cta: "Start building",
  },
  event: {
    template: "event",
    title: "Nebula Mumbai Meetup",
    subtitle: "Talks on mainnet tooling, pizza and builders from across the city.",
    facts: ["WeWork BKC, Mumbai", "Free entry", "Limited seats"],
    dateIST: "Sat, 24 Oct · 6:00 PM IST",
    cta: "RSVP now",
  },
  hackathon: {
    template: "hackathon",
    title: "Nebula Buildathon",
    subtitle: "DeFi, consumer and infra tracks. Online. Students welcome.",
    facts: ["Online, 1-8 Nov", "3 tracks", "Students welcome"],
    prize: "$50,000 in prizes",
    dateIST: "Closes Mon, 9 Nov · 5:29 AM IST",
    deadlineISO: "2026-11-09",
    cta: "Register now",
  },
  digest: {
    template: "digest",
    title: "Nebula Chain Daily",
    subtitle: "Everything that shipped today, in one place.",
    facts: [],
    items: ["Mainnet is live", "Grants Round 3 open: up to $25k", "Native bridging with Orbit L2 in Nov", "Mumbai meetup on 24 Oct"],
    dateIST: "Thu, 15 Oct 2026",
    cta: "Read more",
  },
};

const LONG = "Supercalifragilistic interoperability megaannouncement featuring extraordinarily verbose wording everywhere";

export function sampleSpec(template: PosterTemplate, stress = false): PosterSpec {
  const s = SAMPLES[template];
  if (!stress) return clampSpec(s, base);
  return clampSpec(
    {
      ...s,
      title: LONG,
      subtitle: `${LONG} ${LONG}`,
      facts: [LONG, LONG, LONG, LONG],
      items: [LONG, LONG, LONG, LONG, LONG, LONG, LONG, LONG],
      prize: "$1,000,000,000 in prizes plus extra bonuses",
      dateIST: "Saturday, 24 October 2026 · 6:00 PM IST onwards",
      cta: "Register right now before it is too late",
    },
    { sourceHandle: "@AVeryLongTwitterHandle_ · @AnotherLongHandle", ecosystem: "Nebula Chain Ecosystem Foundation" }
  );
}
