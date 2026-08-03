# Phase 2, Feature 2: Intelligent Finn AI Assistant — Report

## Workflow followed

1. **Research** — confirmed current Gemini API facts before writing code (my training data is stale on this; Gemini's model lineup churned through 4+ generations in the past year per public docs). Confirmed: the REST contract (`POST /v1beta/models/{model}:generateContent`, `x-goog-api-key` header, `{"contents":[...], "systemInstruction":{...}}` request, `{"candidates":[{"content":{"parts"}}]}` response), and — critically — that Google publishes a **self-updating alias** `gemini-flash-latest` specifically so callers don't have to track version churn. Used that as the default instead of hardcoding a model name that might be deprecated by the time you read this.
2. **Design** — architecture below, decided before writing implementation code.
3. **Implement backend** — `finn_service.py` (new), wired into `server.py`.
4. **Implement frontend** — `ai.tsx` polish (retry, source transparency, full loading/error states).
5. **Verify backend** — 35 mocked checks in `_verify_finn.py`, all passing.
6. **Verify frontend** — `tsc` 0 errors, `expo lint` 0 errors (26 warnings, all pre-existing, none introduced).
7. **Integration tests** — full register→chat→fallback→cache→rate-limit flow through the real (unmodified) FastAPI app.
8. **Live-network honesty** — attempted the real Gemini call the same way I now do for external APIs; confirmed this sandbox can't reach `generativelanguage.googleapis.com` either (same egress allowlist restriction as Frankfurter). Provided `_verify_finn_live.py` upfront this time, not as an afterthought.

## Architecture

```
Frontend (ai.tsx)
      │  only ever calls our own backend
      ▼
POST /api/ai/chat  (server.py)
      │
      ▼
finn_service.get_finn_reply()          ← the ONLY place Gemini is called from
      │
      ├─ 1. sanitize_message()          — strip injection patterns, cap length
      ├─ 2. check_rate_limit()          — 8 req/min/user, in-memory sliding window
      ├─ 3. check cache                 — identical question within 10 min → instant reuse
      ├─ 4. build_context(db, user)     — pulls REAL data from existing collections
      │        └─ reuses fx.py (Feature 1) for rates — no duplicate rate logic
      ├─ 5. call_gemini(context, msg)   — Gemini explains/recommends, never calculates
      │        └─ None on ANY failure → falls through, never raises
      ├─ 6. (optional) OpenAI/Anthropic — Phase 1's pluggable providers, preserved
      └─ 7. rule_based_reply(msg, ctx)  — ALWAYS works, same real context, zero deps
```

**Single source of truth, enforced structurally, not just by convention**: both the
Gemini path and the rule-based fallback path consume the exact same `ctx` dict from
`build_context()`. There's no second calculation anywhere — if Gemini says something
about the user's balance, it's because that balance was in the context block Gemini
was given, not because Gemini computed it.

## Answering your specific requirements

**"Frontend MUST NEVER call Gemini directly"** — confirmed by construction: `GEMINI_API_KEY`
is read only in `finn_service.py`, on the backend, from `backend/.env`. Frontend's `api.ts`
has zero knowledge of Gemini's existence; it only calls `/api/ai/chat`. Verified in the test
suite that the API key travels via an HTTP header server-side and never appears in any
frontend-reachable response.

**"Finn must NEVER invent or calculate financial data"** — enforced two ways:
1. `SYSTEM_INSTRUCTION` explicitly instructs Gemini: *"NEVER invent, estimate, or recalculate
   a financial number. Only reference numbers that appear in the CONTEXT block."*
2. Verified in tests: real balance (500.00), real recipient (Maria Garcia), real masked
   payment method, and real live exchange rates all appear correctly in what's sent to
   Gemini — and a prompt-injection attempt asking Finn to claim a fake $1,000,000 balance
   was checked to NOT appear in the reply.

**Privacy — "never send passwords/tokens/PIN/biometric/secret keys/internal IDs"**:
`build_context()` explicitly whitelists only the fields it includes (never a raw DB
document). Verified: password, JWT tokens, and Mongo `_id`s are never in the formatted
context block; raw bank account/routing numbers are excluded the same way the REST API
itself already excludes them from client responses (reused that existing convention,
didn't invent a new one).

**Security**:
- Rate limiting: 8 requests/minute/user, in-memory sliding window. Tested explicitly —
  request #4 within a 3/min test window gets a friendly "slow down" message, not an error.
- Caching: identical question within 10 minutes is served from cache, verified to not
  trigger a second Gemini call (protects your free-tier daily quota too).
- Prompt sanitization: strips common override patterns ("ignore previous instructions",
  "you are now", "reveal your system prompt", etc.) before the message ever reaches Gemini,
  *and* `SYSTEM_INSTRUCTION` is sent via Gemini's dedicated `systemInstruction` field —
  structurally separate from user content, which is Gemini's own recommended defense, not
  just string concatenation. I'm not claiming this is bulletproof (no regex filter is) —
  it's documented as best-effort in the code itself.

**Fallback — "user should never see an error"**: verified across three distinct Gemini
failure modes (network error, malformed/empty response, HTTP 503) — all three degrade to
a real-data-backed rule-based reply with `source: "rule_based"`, never a raw error message
or a 500. The one case that *does* still show an error is a genuine failure to reach our
*own* backend (frontend network issue) — that's a different, honest failure mode with its
own retry button, not Gemini's fault.

## Frontend

- **Typing indicator**: already existed ("Thinking…" with spinner), kept as-is (rule 1 —
  don't rewrite working code).
- **Retry button**: new — appears only on a genuine backend-unreachable error, re-sends
  the exact failed message.
- **Loading/success/empty/error states**: history fetch now has all four explicitly
  (previously silently swallowed failures with no visual state at all).
- **Source transparency**: a small, non-alarming "Answered from your account data" badge
  appears under fallback replies — honest without looking like an error, per the spirit of
  "never see an error" (the user sees a helpful answer, with a subtle honest footnote, not
  a scary failure state).
- **Streaming — the one place I scoped down deliberately**: true token-by-token streaming
  in React Native needs either an SSE polyfill or raw progressive-read handling, since RN's
  `fetch` doesn't reliably support `ReadableStream` across iOS/Android/web the way browser
  `fetch` does — and I have no simulator here to verify that actually renders correctly.
  Given the spec said "streaming if practical," I judged a half-verified streaming
  implementation riskier than the existing typing-indicator-then-full-reply pattern, and
  didn't implement it. Flagging this explicitly rather than silently skipping it — happy to
  revisit if you want to prioritize it and test it live on your end.
- Removed a stray India-default in the suggested-prompts list ("transfer to India") while I
  was already in this file — same category of issue flagged and partially fixed in Phase 1.

## Unit / integration tests — `backend/_verify_finn.py` (35 checks)

Covers: context building from real seeded data (balance, recipient, payment method, rates),
privacy filtering (no password/token/_id/raw account number anywhere in the context or in
what's sent to Gemini), Gemini success path with real-data verification, three distinct
Gemini failure modes all degrading gracefully, zero-Gemini-key clean rule-based path,
rate limiting, caching, and prompt-injection sanitization. Two real bugs were caught and
fixed by this suite before it went green:
1. A keyword-matching bug (`"verify"` isn't a substring of `"verified"` — English, it turns
   out, is annoying) that made the fallback miss KYC-related questions.
2. Test-isolation issues in my own harness (not app code) — rate-limit state leaking
   between test phases.

Re-ran `_verify_journey.py` (31 checks) and `_verify_rates.py` (35 checks) afterward —
zero regressions from wiring `finn_service` into `server.py`.

## Live-network status (honest, upfront this time)

Same situation as Feature 1: confirmed directly that this sandbox cannot reach
`generativelanguage.googleapis.com`. `backend/_verify_finn_live.py` is ready for you to run
with a real `GEMINI_API_KEY` (free, no card, from https://aistudio.google.com/apikey) and
real internet access — it hits the actual API, confirms the reply references your real
balance, and prints Finn's actual answer to a KYC-status question for you to eyeball against
the real (pending) status, since tone/accuracy on an open-ended reply needs a human read,
not just an assertion.

## Files changed

- `backend/finn_service.py` *(new)* — the entire AI service described above
- `backend/server.py` — `/api/ai/chat` now delegates to `finn_service.get_finn_reply()`;
  removed the old ad-hoc `_call_llm`/`AI_SYSTEM` (superseded, not duplicated — confirmed
  `OPENAI_API_KEY`/`ANTHROPIC_API_KEY` are no longer read in two places)
- `backend/.env` / `.env.example` — added `GEMINI_API_KEY`, `GEMINI_MODEL`
- `frontend/app/(tabs)/ai.tsx` — retry button, source badge, full loading/error states,
  removed a hardcoded India-default prompt
- `backend/_verify_finn.py` *(new, dev-only)* — the 35-check suite above
- `backend/_verify_finn_live.py` *(new, dev-only)* — for you to run with real internet

## What's still open

- Live Gemini confirmation — one command away (`_verify_finn_live.py`), not something I
  can close from this sandbox.
- True token streaming — deliberately scoped out, reasoning above.
- No new pip dependency was needed (Gemini is called via plain `httpx`, already a
  dependency) — nothing to add to `requirements.txt`.

## Production-readiness

Code-complete, single source of truth verified structurally (not just claimed), 35/35
mocked checks + 31 journey + 35 rates checks all passing with zero regressions. The one
open item is the same category as Feature 1's: live-network confirmation needs to happen
in an environment with real internet access, and the tool to do that is ready.

Pausing here for your review, per the checkpoint pattern, before starting Feature 3.
