# Build notes & deviations from BUILD_PROMPT.md

Ground truth read in Step 0: `package.json` (Next 16.4, React 19, `@google/genai` 2.30, viem, Tailwind 4 + shadcn/base-ui), `agent/tools.ts`, `agent/wallet.ts`, `agent/agent.ts`, `app/api/weather/route.ts`.

- **x402 is the starter's demo flavour, not the Coinbase x402 spec.** The 402 body is `{ price, asset, payTo }` and the client sends `X-PAYMENT: base64({ payment, signature })` signed with `signMessage`. Payments are signed but never broadcast, so there is no on-chain `txHash`. `/api/x-feed` mirrors this exactly; SpendLog stores the signature prefix and the dashboard links the payer address on Base Sepolia explorer instead of a tx.
- `payAndFetch` has no hook to inspect the price before signing, so `lib/budget.ts` re-implements the handshake (`budgetedFetch`) using the wallet's exported helpers, checks the price against the caps, then signs. `payAndFetch` itself is left untouched for `get_weather`.
- Tool `run` signature is `(args, { baseUrl })`; kept as is.
- Agent loop `MAX_STEPS` raised from 5 to 12 so multi-step requests (triage → draft for several updates) can finish.
- Next 16: dynamic route `params` is a Promise; route handlers await it.
