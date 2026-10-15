# Build notes & deviations from BUILD_PROMPT.md

Ground truth read in Step 0: `package.json` (Next 16.4, React 19, `@google/genai` 2.30, viem, Tailwind 4 + shadcn/base-ui), `agent/tools.ts`, `agent/wallet.ts`, `agent/agent.ts`, `app/api/weather/route.ts`. Where the prompt and the code disagreed, the code won:

## x402 / wallet
- **The starter's x402 is a demo flavour, not the Coinbase x402 spec.** The 402 body is `{ price, asset, payTo }`; the client sends `X-PAYMENT: base64({ payment, signature })` signed with `signMessage`. Payments are signed but never broadcast, so there is **no on-chain `txHash`**. `/api/x-feed` mirrors the weather route exactly (plus a `resource` check). SpendLog keeps the payer address and the signature prefix; the dashboard links the payer address on the Base Sepolia explorer (it links a tx when `txHash` exists).
- `payAndFetch` had no way to see the price before signing, so I added an optional `beforePay(challenge)` hook (default behaviour unchanged, `get_weather` still works). `lib/budget.ts` uses it to refuse before anything is signed. The paid result now also includes `from`.
- The `fetcher` (twitter.fetcher.sh) adapter is stubbed: it speaks real x402 (EIP-3009 USDC authorizations on Base mainnet), which the starter's signer doesn't implement. Phase 3.

## Data model additions
- `Update.status` (`new | triaged | skipped | drafted | error`), `Update.triage`, `Update.mergedInto`, `Update.inReplyTo`.
- `Draft.ecosystem`; `PosterSpec.ecosystem | prize | items | deadlineISO` (for the hackathon "deadline in N days" chip and digest list).
- `SpendLog.id | payer | signature`; a `meta` collection is reserved.
- Budget day = calendar day in IST (`Asia/Kolkata`).

## Agent
- `MODEL` moved to `lib/gemini.ts` (re-exported from `agent/agent.ts`) to avoid an import cycle.
- `MAX_STEPS` 5 → 12 so add_group → triage → draft chains finish in one turn.
- `draft_post` takes optional `updateIds`; without them it drafts everything kept for the group (more reliable than asking Gemini to pass every id). `groupId` accepts the group name.
- `review_draft` approve on a flagged draft returns `needsConfirmation` unless `confirmFlagged: true` (admin must confirm explicitly). Auto mode never approves flagged drafts.
- Scam-flagged updates are kept through triage (regardless of relevance) so the admin sees them as **flagged** drafts. They get a unique `dedupKey` (`scam:<id>`) so a fake airdrop can never be merged into the real launch.
- Tweet text is passed to Gemini only inside `<untrusted_…>` blocks and returned to the chat agent as `untrusted_preview`/`untrusted_text`. No tool can change budgets (env only).

## Publishing
- Rate limits: `maxPerDay` applies to bridge sends and manual share packages (ready-manual counts). The 20-minute gap and 30–120 s jitter apply to automated bridge sends only; the bridge enforces them again on its side.
- Poster text is always English (Roman script) so the bundled fonts cover it; captions follow the group language.

## Poster
- Satori gotchas found: a style value of `undefined` crashes rendering, and `fonts: []` means "no fonts" (pass `undefined` to fall back).
- `/api/poster/sample-<template>[?stress=1]` renders template previews / overflow tests without a draft.
- `POSTER_AI_BACKGROUND=true` uses `POSTER_IMAGE_MODEL` (default `gemini-nano-banana-2.1` as specified). Any failure falls back to the gradient silently.

## Security / scope notes
- The dashboard and chat are **unauthenticated**, like the starter. Anyone with the URL can approve/publish and spend up to `DAILY_BUDGET_USD`. Use Vercel Deployment Protection (or add auth) before sharing the link widely.
- `/api/cycle` requires `Bearer CYCLE_SECRET`; the dashboard's "Run cycle now" uses `/api/dashboard/cycle`, which has the same reach as the chat's `run_cycle` (budget-capped, never publishes).
- Demo x402 signatures are replayable (no nonce store). Fine for a testnet demo; not for real money.

## wa-bridge
- `@whiskeysockets/baileys` pinned to `7.0.0-rc14` (the current `latest` tag). Boot + `/health` + QR verified locally; sending was **not** tested end to end (needs a dedicated WhatsApp number).
