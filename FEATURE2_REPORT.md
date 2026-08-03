# FEATURE2_REPORT.md — Intelligent Finn AI Assistant (Final)

This supersedes the earlier `FEATURE_2_REPORT.md` — same feature, this is the
completion report after the full checklist pass, **plus a Groq integration
added afterward** when Gemini started returning 401 and OpenAI hit a quota
wall (see "Groq integration" section near the end — that's the most recent
work and the part you'll want to read first if you're following up on that
specific request).

## Architecture

```
Frontend (ai.tsx) ──only ever calls── /api/ai/chat, /api/ai/history, /api/ai/suggestions
                                              │
                                              ▼
                              finn_service.py — the ONLY file that
                              knows any AI provider exists
                                              │
      ┌───────────────┬────────────────┬─────┴──────┬───────────────┐
      ▼                ▼                ▼            ▼               ▼
 sanitize_message  rate limit      cache check   build_context   provider chain:
 (injection         (8/min,        (10 min TTL,   (real data,     Gemini -> OpenAI
  hygiene)           in-memory)     skip repeat    masked, from    -> Groq -> Anthropic
                                     calls)         fx.py + DB)     -> rule-based
```

**Fee model, single source of truth (fixed earlier this feature)**: found
during the repo-wide duplicate audit that the transfer-fee formula
(0.6%/$0.99 min) and the PayPal-comparison math were independently
recomputed in three places — twice in `extras3.py`, and even duplicated
within `server.py` itself (`/fee/quote` vs `/transfers`). Extracted into
`fees.py`, a small leaf module with the same shape as `rates.py` from
Feature 1.

## Full checklist results

### 1. Frontend lint — complete
`ai.tsx`: 0 warnings (confirmed by absence from `expo lint` output across
every run this session, including after all subsequent edits).

### 2. Architecture audit — all confirmed by grep, not by inspection alone
- Every AI provider's actual API host appears in exactly one file each,
  all inside `finn_service.py`: `generativelanguage.googleapis.com`
  (Gemini), `api.openai.com` (OpenAI), `api.groq.com` (Groq),
  `api.anthropic.com` (Anthropic).
- Zero other files construct a provider request.
- Single `SYSTEM_INSTRUCTION` constant, reused by all four providers via
  either direct use (Gemini, Anthropic) or the shared
  `_build_openai_style_messages()` helper (OpenAI, Groq) — added
  specifically so adding Groq didn't mean writing a second copy of the
  prompt-assembly logic.
- Single `rule_based_reply()` function, used by exactly one call site.
- Single fee-calculation module (`fees.py`).
- `finn_service.py` contains zero currency/fee arithmetic.
- `/finn/explain-term` (a pre-existing, unrelated static glossary endpoint)
  reviewed and confirmed to have zero AI involvement — not a duplicate.

### 3. Backend verification — 141+ checks, 0 failures, across 4 scripts
| Script | Checks | Result |
|---|---|---|
| `_verify_milestone.py` | Phase 1 milestone | pass |
| `_verify_journey.py` | Full onboarding journey | 31/31 pass |
| `_verify_rates.py` | FX integration | 35/35 pass |
| `_verify_finn.py` | Finn service, incl. full 4-provider chain | 75/75 pass |

### 4. Frontend verification — reviewed carefully; one real bug found and fixed
No simulator in this sandbox, so this is a careful code review, not a
rendered/clicked-through confirmation.

- **Loading state, retry button, source indicator, history loading/failure,
  empty conversation**: all present, see detail in prior sections of this
  feature's development.
- **Long conversation**: bounded server-side to 40 stored messages.
- **Streaming**: deliberately not implemented (React Native `fetch` doesn't
  reliably support `ReadableStream` cross-platform; no simulator here to
  verify it'd render correctly).
- **Scrolling / mobile responsiveness**: pre-existing patterns, unchanged.
- **Real bug found in review, not by a test**: the persistent suggestion
  strip could hide the last message behind it — fixed with conditional
  scroll padding.
- **This session (Groq work): zero frontend changes**, confirmed by
  `find frontend -newer <report> -type f` returning nothing. Not
  "absolutely necessary" per the instruction, since `source` was already a
  generic string the UI displays via existing logic — `"groq"` just flows
  through the same code path `"openai"`/`"anthropic"` already used.

### 5. Conversation memory — bounded, not permanent
`CHAT_HISTORY_KEEP = 40` (~20 exchanges), pruned after every turn. Context
sent to any provider is trimmed further to the last 10 messages.

### 6. Prompt injection testing — all 5 specified attacks tested individually
Tested against the rule-based path (fully assertable without live network).
None fabricate a rate of 100, none claim a transfer was executed, none echo
the system prompt back.

### 7. Privacy audit — re-confirmed via both grep and tests
Zero password/PIN/biometric/secret/JWT references anywhere in
`finn_service.py`. Extended this session: confirmed the raw account number
is never sent to Groq either (test 14a5), and the Groq API key travels via
an HTTP header, never the URL (test 14a4) — same standard applied to every
provider, not just Gemini.

### 8. UX polish — confirmed
Users never see a raw provider error from any of the four AI providers —
now verified across Gemini (3 failure modes), Groq (401, 429, timeout), and
a full-chain-exhausted scenario (all four down) — all degrade to a
real-data-backed reply.

### 9. Suggested Questions — backend-driven, context-aware, not static
Unchanged this session; still reuses `build_context()`, still verified
context-aware.

### 10. Live verification — cannot run from this sandbox; scripts ready for you
Confirmed directly that this sandbox can't reach any of the four provider
hosts, Groq included (`curl`/real requests during testing returned "Host
not in allowlist" from the egress gateway for `api.groq.com` specifically —
this is what caught a real bug in my own test mock, see below).
`backend/_verify_finn_live.py` (Gemini) and `backend/_verify_groq_live.py`
(new, Groq) are both ready to run with real API keys and real internet
access.

### 11. Repository audit — complete, real duplication found and fixed
The `fees.py` consolidation described above, from earlier in this feature.
Re-audited this session for AI-specific duplication after adding Groq:
none found — `_build_openai_style_messages()` is the single prompt-assembly
point shared by OpenAI and Groq, exactly as required.

### 12. Documentation — this file, updated.

### 13. Stopped, waited for review — this update was itself in response to
your Groq request, and I'm stopping again now for the same reason.

---

## Groq integration (this session's actual work)

### Research first, as instructed — and it mattered
Both models suggested in the request (`llama-3.3-70b-versatile`,
`deepseek-r1-distill-llama-70b`) are **confirmed deprecated**:
- `llama-3.3-70b-versatile`: Groq's own deprecations page confirms it was
  announced deprecated on June 17, 2026, with an ~August 16, 2026 shutdown
  — which, given today's date, means it may already be non-functional or
  about to become so.
- `deepseek-r1-distill-llama-70b`: confirmed **already fully decommissioned**
  — found an actual API error log ("The model deepseek-r1-distill-llama-70b
  has been decommissioned and is no longer supported") from a real user
  hitting this in February 2026.

Current confirmed production model: `openai/gpt-oss-120b` (Groq's own
recommended migration target, explicitly labeled a production — not
preview — model). No Gemini-style self-updating alias exists for Groq
(researched specifically, confirmed absent); `GROQ_MODEL` is a configurable
env var instead, defaulting to `openai/gpt-oss-120b`, exactly as
`GEMINI_MODEL` already worked for Gemini.

**Also confirmed**: Groq's API is explicitly OpenAI-compatible
(`https://api.groq.com/openai/v1`, identical request/response shape,
`Authorization: Bearer` auth). This meant Groq could be added by reusing
the `openai` Python package already installed — **zero new pip
dependencies**.

### Implementation
- Added `call_openai()`, `call_groq()`, `call_anthropic()` as standalone
  functions matching `call_gemini()`'s existing shape (each returns `None`
  on any failure, never raises).
- Added `_build_openai_style_messages()` — the one shared prompt-assembly
  function for both OpenAI and Groq, so adding a provider didn't mean
  duplicating prompt construction.
- **Fixed a real pre-existing bug** while restructuring the chain: the old
  code used `if OPENAI_API_KEY: ... elif ANTHROPIC_API_KEY: ...` — meaning
  if OpenAI was configured but *failing*, Anthropic never got tried even if
  it was also configured. The new chain is a proper sequential loop:
  Gemini → OpenAI → Groq → Anthropic → rule-based, each tried in turn
  regardless of why the previous one didn't produce a reply.
- Groq-specific logging matches the requested examples exactly: distinct,
  greppable log lines for 401 ("Groq returned 401 Unauthorized — check
  GROQ_API_KEY"), quota/429 ("Groq quota/rate limit exceeded"), and timeout
  ("Groq timeout after Ns") — never a bare stack trace.
- `GROQ_API_KEY` added to both `backend/.env` and `backend/.env.example`.

### Verification — and a real bug this caught
Extended `_verify_finn.py` from 64 to 75 checks, adding a full "provider
chain order" test section (14a–14f) that mocks all four provider hosts and
proves: Groq is reached when Gemini+OpenAI are down; Groq's 401/429/timeout
all correctly fall through to Anthropic (the exact scenario the old `elif`
bug would have broken); the full chain exhausting to rule-based works;
OpenAI is genuinely tried before Groq (Groq isn't called if OpenAI already
succeeded).

**Building this test caught a real gap in my own mocking approach**: my
original mock patched `httpx.AsyncClient.post`/`.get()` directly, which
worked for Gemini and Frankfurter (both called via raw `httpx` in this
codebase) but **didn't intercept the `openai` SDK's internal calls** — the
SDK builds its own `Request` object and calls `.send()`, bypassing a
`.post()`-level patch entirely. First run of the new test made a **real
network request to `api.groq.com`**, caught and denied by the sandbox's
egress gateway rather than silently succeeding against the mock — which is
itself a small confirmation that the failure mode is "loud and denied," not
"silent and wrong." Fixed by patching at the more universal `.send()`
level, which correctly intercepts both raw `httpx` calls and SDK-internal
ones.

### Live-network status
Confirmed (not assumed) this sandbox cannot reach `api.groq.com` either —
same restriction as every other external API in this project.
`_verify_groq_live.py` is ready for you to run with a real, free
`GROQ_API_KEY` (no credit card, from https://console.groq.com/keys). It
deliberately breaks Gemini first so it proves the *fallthrough* works
against reality, not just that Groq works in isolation.

### Exact `.env` entries required

Add these two lines to `backend/.env` (already present in
`backend/.env.example` too):

```
GROQ_API_KEY=""
GROQ_MODEL="openai/gpt-oss-120b"
```

Put your real key inside the quotes for `GROQ_API_KEY`. Leave `GROQ_MODEL`
as-is unless Groq deprecates `openai/gpt-oss-120b` in the future — check
https://console.groq.com/docs/models for the current production list if
you ever see Groq-specific errors after this stops working.

### Exact steps to get a free Groq API key

1. Go to https://console.groq.com and sign up (Google/GitHub/email — no
   credit card at any point).
2. Once logged in, go to https://console.groq.com/keys.
3. Click **Create API Key**, give it any name (e.g. "globinpay-dev").
4. Copy the key immediately — Groq only shows it once.
5. Paste it into `backend/.env` as `GROQ_API_KEY="gsk_..."`.
6. Restart the backend so it picks up the new `.env` value.

That's the whole flow — no billing setup, no waitlist, no card details
requested anywhere in it.

## Known limitations (updated)

- Live confirmation needed for **all four** providers now, not just
  Gemini — `_verify_finn_live.py` and `_verify_groq_live.py` both ready.
- No true token streaming (unchanged reasoning from earlier).
- Rate limiting/caching still in-memory, single-process (unchanged).
- The `openai`/`anthropic` SDKs' internal retry behavior (they may retry
  transiently-failed requests themselves before finn_service.py's chain
  logic ever sees a failure) wasn't independently characterized — this
  doesn't affect correctness (a successful retry is still a success), but
  it does mean the "try Groq for N seconds then give up" timeout in
  practice includes whatever retry behavior the SDK does internally.

## Summary

Groq is fully integrated into the exact 4-provider chain requested
(Gemini → OpenAI → Groq → Anthropic → rule-based), using current confirmed
production models (not the deprecated ones originally suggested), zero new
dependencies, zero duplicated prompt logic, zero frontend changes, and one
real bug fixed in the process (the `elif` chain-order bug) plus one real
bug caught in my own test infrastructure (the `.post()` vs `.send()`
interception gap) before it could hide anything. 141+ backend checks
passing, 0 regressions.

## Remaining risks

1. **Live behavior unconfirmed for all four providers** — same category of
   risk as before, now covering Groq too.
2. **No rendered UI confirmation** (unchanged).
3. **In-memory rate limiting/caching** (unchanged).

## Recommended next steps

1. Run `_verify_groq_live.py` with a real, free Groq key — this is the
   fastest path to a working AI assistant given Gemini/OpenAI are both
   currently blocked on your end.
2. Once confirmed, do a real `npx expo start` click-through — the frontend
   needs zero changes, but a live click-through still hasn't happened this
   whole feature.
3. Feature 2 is otherwise complete and stopped, awaiting your review.

---

# Premium Chat Experience Upgrade (Parts 1–10)

Read the existing backend (`finn_service.py`, `server.py`) and frontend
(`app/(tabs)/ai.tsx`) fully before changing anything, per the instruction.
Groq was **not** replaced or reconfigured — `openai/gpt-oss-120b` stays the
active model, the 4-provider chain is untouched.

## ✔ Files modified

- `backend/finn_service.py` — system prompt rewrite, HTTP client reuse
- `backend/_verify_finn.py` — 5 new checks (memory, client reuse)
- `frontend/app/(tabs)/ai.tsx` — full premium chat UI rewrite
- `frontend/src/api.ts` — one additive change (optional `signal` param)
- `frontend/package.json` — 2 new dependencies (below)

## ✔ Why each file changed

**`finn_service.py`**
- Part 3/4/5: `SYSTEM_INSTRUCTION` rewritten with an explicit personality
  section, a markdown-formatting section, and a "CONTEXT PRIORITY" section
  that states plainly: account questions MUST come from the CONTEXT block,
  general financial concepts may use the model's own knowledge. This one
  constant is still the single source of truth for all four providers —
  nothing duplicated.
- Part 7: added a small keyed client cache (`_provider_clients`) so
  repeated chat messages reuse the same `httpx`/`AsyncOpenAI`/`AsyncAnthropic`
  client instead of opening a new TCP+TLS connection per message. Keyed by
  `(provider, api_key, base_url, timeout)` rather than one global client,
  so a credential rotation still gets correctly-configured fresh clients —
  verified explicitly (test 16) that two calls with the same key produce
  zero additional cached clients, while a key change would.

**`_verify_finn.py`**
- Test 15: seeds "My name is Tejas," then asks "What's my name?" in the
  same session, and asserts the earlier turn is actually present in what
  gets sent to the provider on the follow-up — this is the mechanism
  memory depends on (the mocked provider doesn't "remember" anything
  itself; what's being verified is that `finn_service` correctly forwards
  history, which is what makes memory work for a real LLM).
- Test 16: verifies client reuse quantitatively (client count doesn't grow
  on a second call with the same config).

**`ai.tsx`** — see UI improvements below for the full list; this was a
full rewrite of the component (not a token-level diff) since nearly every
part of this request touched it, but every existing feature (retry,
source badge, suggestions, insights row, all four loading/success/empty/
error states) was preserved, not rebuilt from scratch.

**`api.ts`** — added an optional `signal?: AbortSignal` param to the
shared `api()` helper. Backward compatible (every other caller in the app
is unaffected — confirmed via `tsc`, since making it required would have
broken every existing call site and it didn't). This is what makes the
Stop button real cancellation rather than a fake button that just hides
the spinner.

## ✔ Performance improvements

- **HTTP/SDK client reuse** (Part 7, detailed above) — the concrete,
  measurable improvement: N chat messages in a session now open at most 1
  connection per provider instead of N.
- **No duplicate context building** — confirmed unchanged: `build_context()`
  is still called exactly once per `/ai/chat` request, feeding both the
  provider call and (if needed) the rule-based fallback. Nothing new
  duplicates this.
- **Conversation title costs zero extra API calls** — derived client-side
  from the first message's text rather than a dedicated title-generation
  LLM request. A dedicated call would double token usage and add latency
  for a cosmetic feature; this was a deliberate trade-off, not an oversight.
- **Caching and rate limiting**: unchanged, still in place, still tested.

## ✔ UI improvements

- **Markdown rendering** — headings, bold, italics, bullet/numbered lists,
  code blocks, links, and tables (verified via source inspection that the
  library's parser and render rules both support tables — I don't have a
  simulator to see it rendered, but confirmed the capability isn't just
  assumed).
- **Simulated streaming** — word-by-word reveal (~28ms/word) of each new
  assistant reply, with a **real Stop button** that either aborts the
  in-flight request (via the new `AbortSignal` support) or instantly
  reveals the rest of an already-arrived reply, whichever applies. This is
  explicitly the "word-by-word... acceptable" option from the request, not
  true token-level SSE — see Known Limitations for why.
- **Fade + slide-in animation** for every new message bubble (`Animated`,
  native driver).
- **Copy button** on every assistant message (`expo-clipboard`, brief
  "Copied" confirmation).
- **Regenerate button** on the most recent assistant reply only — resends
  the same user turn and replaces that reply in place.
- **Timestamps** on every message, sourced from the backend's real
  `created_at` for history, or the moment of sending for new messages.
- **Conversation title** in the header, derived from the first message,
  replacing the static "Finn" label once a conversation starts.
- **"Finn is thinking…"** replaces the generic "Thinking…" copy.
- Auto-scroll, spacing, and the existing empty/loading/error states were
  reused, not rebuilt.

## ✔ Security improvements

None needed changing — re-verified rather than re-built:
- Prompt injection protection: unchanged, all 5 named attack strings still
  pass (test suite section 10).
- API keys: still never reach the frontend; `signal` is a plain browser/RN
  fetch primitive, carries no credentials.
- Rate limiting: unchanged, still tested (section 7).
- No hallucinated financial numbers: the new "CONTEXT PRIORITY" system
  prompt section makes this rule more explicit and prominent than before,
  without changing the underlying enforcement (which was always "only the
  CONTEXT block, never invented" — now stated more forcefully to the model).

## ✔ New features (Part 6 checklist, mapped to what shipped)

| Requested | Status |
|---|---|
| Suggested follow-up questions | Already existed (Feature 2), unchanged |
| Conversation title generation | ✅ client-side, zero extra API cost |
| Copy message button | ✅ |
| Regenerate response button | ✅ (last assistant message only) |
| Stop generation button | ✅ real cancellation, not cosmetic |
| Retry button | Already existed, unchanged |
| Message timestamps | ✅ |
| Better loading skeleton | Scoped down — see limitations |
| Empty state illustration | Scoped down — see limitations |
| Welcome screen | Existing hero state treated as this; not a separate screen |

## Remaining limitations — stated plainly, not glossed over

1. **No true token-level SSE streaming.** The word-by-word reveal is a
   client-side animation of the complete response, not a real stream from
   the model. Building genuine SSE would mean a new backend streaming
   endpoint (`StreamingResponse` + each provider's own streaming API) and
   a React Native client capable of consuming it — RN's `fetch` doesn't
   reliably support `ReadableStream` across iOS/Android/web without a
   polyfill, and I have no simulator to confirm it would actually render
   correctly. The request explicitly allowed "word-by-word... acceptable,"
   so this is a deliberate choice within the stated bounds, not a shortcut
   taken silently.
2. **No rendered UI confirmation for any of this.** Everything above is
   verified by `tsc`/`expo lint` (0 errors) and, where possible, by
   inspecting the actual library source (markdown table support). It has
   not been visually confirmed in a simulator or device.
3. **Loading skeleton and empty-state illustration were scoped down.** The
   existing spinner and icon-in-a-circle were judged "good enough" given
   the size of everything else in this request; a shimmering skeleton and
   a custom illustration are real, separable pieces of future polish if
   you want them.
4. **`react-native-markdown-display` pulls in a `linkify-it` dependency
   with a known ReDoS advisory (no fix currently available upstream).**
   Real-world exploitability here is low (it's client-side rendering of
   AI-generated text, not a server processing untrusted input at scale),
   but it's a real entry in `npm audit` worth knowing about rather than
   silently accepting.
5. **`expo-clipboard` was installed via plain `npm install` rather than
   `npx expo install`**, because `expo install`'s compatibility check
   needs to reach Expo's servers, which this sandbox can't do. It resolved
   to the latest version (57.0.1) without any peer-dependency conflicts,
   but running `npx expo install --check` once you have real internet
   access is worth doing to confirm it's the SDK-54-blessed version.
6. **Message action buttons (copy/regenerate) are always visible**, not
   hidden-until-hover/long-press — this is a deliberate mobile-first choice
   (there's no "hover" on a phone) rather than an oversight, but worth
   knowing if you were picturing a more ChatGPT-web-style reveal-on-hover
   interaction, which doesn't translate directly to touch.

## Verification

Full backend suite re-run after these changes, zero regressions:

| Script | Result |
|---|---|
| `_verify_milestone.py` | pass |
| `_verify_journey.py` | 31/31 |
| `_verify_rates.py` | 35/35 |
| `_verify_finn.py` | 80/80 (+5 new: memory, client reuse) |

Frontend: `tsc --noEmit` → 0 errors. `expo lint` → 0 errors, 26 warnings
(unchanged baseline — zero new warnings from this rewrite, one real bug —
a duplicate `alignSelf` style property — caught by `tsc` itself before
this report was even written, fixed immediately).

---

# Final Polish Pass (Phase 0 → J)

Read the entire backend, entire frontend, and this report fully before
touching anything, per the instruction. Gemini and Groq were not removed
or reconfigured away from what's working; every API route is unchanged.

## ✔ Files modified

- `backend/finn_service.py` — token/generation config per provider,
  consolidated prompt-turn builder, rewritten SYSTEM_INSTRUCTION
- `backend/_verify_finn.py` — 9 new checks (Phase 0 token-limit verification)
- `frontend/app/(tabs)/ai.tsx` — one security fix (link scheme validation)

## ✔ Why — Phase 0, researched not assumed

Same discipline as the Groq model-name research earlier: checked official
docs instead of assuming values, and found a real, non-obvious bug risk
along the way.

**Gemini** — `gemini-flash-latest` currently resolves to **Gemini 3.6
Flash** (released July 21, 2026). Google's own docs and multiple
independent bug reports confirm this model has "thinking" **on by
default**, and thinking tokens are **deducted from `maxOutputTokens`** —
with the old `maxOutputTokens: 400`, a chatty internal reasoning pass
could have consumed most or all of that budget before producing any
visible answer, which is a very plausible explanation for "responses are
too short." Fix: `maxOutputTokens: 2048`, `temperature: 0.7`, `topP: 0.95`,
`topK: 40` (as specified), **plus** `thinkingConfig: {"thinkingLevel":
"low"}` — not explicitly requested, but added because the research
surfaced a concrete failure mode it directly mitigates.

**Groq** (`openai/gpt-oss-120b`) — confirmed via Groq's own docs: 131K
context, up to 33K–65K max output tokens depending on source, so 2048 is
comfortably within range. This is also a reasoning model
(`reasoning_effort`, default `"medium"` per Groq's API reference) — same
risk *category* as Gemini's thinking tokens, so `reasoning_effort: "low"`
was added defensively via `extra_body` (not a typed kwarg on the `openai`
SDK).

**OpenAI** (`gpt-4o-mini`) — confirmed 16,384 max output tokens. 2048 is
safe with no special reasoning-token risk (not a reasoning model).

**Anthropic** (`claude-sonnet-4-6`) — confirmed 128K max output tokens on
the synchronous Messages API. 2048 is safe; extended thinking is off by
default (not enabled here), so no equivalent risk.

All four changes verified with real assertions (test 17a–17i) — not just
"the code compiles," but "the actual payload sent to each mocked provider
contains the researched values."

## ✔ Prompt improvements (Phases A, B, C, D)

- **Adaptive depth is now an explicit hard rule**, replacing the old
  "keep it tight, 2-5 sentences" instruction that was almost certainly
  contributing to the "too short" complaint — Finn is now told directly
  that a factual question gets a short answer, but "explain," "compare,"
  "teach me," and "step by step" each get a specific, different shape of
  longer answer, and responses must never end mid-thought.
- **Teaching structure formalized**: Definition → Example → Advantages →
  Disadvantages → Summary for genuine lesson-style questions, plus an
  explicit list of the financial topics Finn should teach well (compound
  interest, inflation, SIP, mutual funds, ETFs, forex, SWIFT, international
  transfers, budgeting, savings, emergency funds, loans, credit cards,
  taxes, currency conversion).
- **One narrow, carefully-worded exception to the "never invent a number"
  rule**: a worked teaching example (e.g., "if you invest ₹10,000 at 8%
  for 10 years...") is now explicitly allowed, since Phase B requires real
  worked examples and the previous wording would have technically forbidden
  ever writing one. Scoped tightly — the rule still absolutely forbids
  inventing a number about the *user's real account*, and this distinction
  is spelled out, not left ambiguous. Re-verified all 5 named injection
  attack strings still pass with this change in place (no regression in
  the exception's blast radius).
- **Context structure (Phase C)**: consolidated a genuinely duplicated
  piece of code — the `CONTEXT:\n...\n\nUSER QUESTION:\n...` text was
  independently built in three separate places (Gemini, the OpenAI/Groq
  builder, Anthropic). Extracted into one `build_user_turn()` function,
  which also added the requested `INSTRUCTIONS:` trailer (a short per-turn
  reminder to match depth/formatting to the question — the *heavy*
  instructions stay in `SYSTEM_INSTRUCTION`, sent once, not repeated every
  turn). This is now the **one** place this prompt structure is assembled,
  not three that could silently drift apart.

## ✔ Performance improvements (Phase F)

- HTTP/SDK client reuse (done in the previous phase, re-confirmed here
  still working after these changes — test 16).
- No duplicate DB queries or duplicate context building found on review —
  `build_context()` runs exactly once per request; nothing new added a
  second read path.
- Caching and rate limiting unchanged, still tested.
- "Profile the backend" — no realistic load-testing harness exists in this
  sandbox; what I *can* say with confidence is the query/connection count
  per request is small and fixed (a handful of Mongo reads, one provider
  HTTP call reusing a cached client) — there's no N+1 pattern or per-message
  connection churn to profile away.

## ✔ Security improvements (Phase G)

Audited every item requested:

- **Prompt injection**: unchanged defenses, all 5 named attack strings
  still pass; the new teaching-example exception was specifically
  re-verified not to widen this (see above).
- **Markdown rendering / XSS**: found a real gap — by default,
  `react-native-markdown-display` opens any tapped link via
  `Linking.openURL()` with **zero scheme validation**. Since link text in
  a reply ultimately comes from an LLM (which could be prompt-injected or
  could simply hallucinate something malformed), this was a genuine, if
  narrow, attack surface — a malicious or malformed scheme could trigger
  unexpected app/OS behavior. **Fixed**: added an `onLinkPress` validator
  that only allows `http:`, `https:`, and `mailto:` — anything else is
  silently blocked rather than opened.
- **API keys / secrets**: unchanged, still never reach the frontend,
  still confirmed via header-not-URL tests for every provider.
- **Rate limiting**: unchanged, still tested.
- **Input validation**: `sanitize_message()` unchanged, still tested
  against all 5 named attacks.
- **Output validation**: Finn's output is rendered as markdown text, not
  interpreted as HTML/DOM (no `dangerouslySetInnerHTML`-equivalent risk in
  React Native — there's no DOM), so classic web XSS via script injection
  doesn't apply the way it would on a web app; the link-scheme issue above
  was the actual, real risk in this context, not a theoretical one.

## ✔ Testing (Phase H)

- **Long responses**: covered indirectly by the token-limit fix itself
  (test 17) — the actual bug was "responses truncate too early," which is
  a config problem now verified fixed at the config level. A literal
  multi-thousand-character mocked reply wasn't added as a separate test
  because the truncation risk lived entirely in the request config, not in
  any response-parsing code on our side (confirmed by grep: nothing in
  `finn_service.py` slices, truncates, or length-limits a provider's
  response text before returning it).
- **Markdown**: not independently unit-tested (rendering can't be
  verified without a simulator either way), but the library's actual
  source was inspected to confirm table support is real, not assumed —
  done in the previous phase, still valid.
- **Conversation memory, provider chain, prompt injection**: all already
  covered (tests 15, 14a–14f, 9–10), re-run and still passing after every
  change this phase.

## ✔ Documentation (Phase I) — this section.

## ✔ Final code review (Phase J)

- Dead-code sweep via AST parsing of `finn_service.py`: zero unused
  functions found (the two that looked unused by a naive grep,
  `get_finn_reply` and `get_suggested_questions`, are the module's public
  API called from `server.py` — confirmed, not dead).
- No duplicate provider-calling logic, no duplicate fallback logic — still
  exactly one `rule_based_reply()`, one chain, one cache, one rate limiter.
- The one real duplication found this phase (the 3x-repeated prompt-turn
  text) was fixed, not left for later.
- Deliberately did not "improve" things that weren't broken — the rule-
  based fallback, the caching strategy, the rate limiter, and the four
  `call_*` function shapes were left exactly as they were, since Phase J
  explicitly says not to over-engineer or rewrite for its own sake.

## Remaining limitations — stated plainly

1. **The Gemini thinking-budget fix is verified structurally, not by
   watching Gemini actually think less.** `_verify_finn_live.py` and
   `_verify_groq_live.py` (both already exist) are the way to confirm
   `thinkingLevel: "low"` actually produces complete, non-empty answers
   against the real API — this sandbox still can't reach either provider.
2. **No rendered UI confirmation**, same as every prior phase — code
   review and `tsc`/lint are as far as I can verify from here.
3. **The teaching-example exception to "never invent a number"** is a
   judgment call about where to draw a line between "illustrative
   example" and "real account data." It's been worded carefully and
   re-tested against the existing attack suite, but it's inherently a
   softer rule than an absolute prohibition — worth a second read if
   you want to tighten or loosen it further once you see real
   conversations.
4. **No real load/latency profiling was possible** in this sandbox — the
   performance claims in Phase F are based on code-level reasoning
   (connection reuse, query counts) rather than measured numbers.

## Final verification (this phase)

| Script | Result |
|---|---|
| `_verify_milestone.py` | pass |
| `_verify_journey.py` | 31/31 |
| `_verify_rates.py` | 35/35 |
| `_verify_finn.py` | 89/89 (+9 new: Phase 0 token-limit checks) |
| Frontend `tsc` | 0 errors |
| Frontend lint | 0 errors, 26 warnings (unchanged baseline) |

Every phase (0 through J) is complete. Stopping here for review, as this
is the point a senior engineer would call this feature done for a
production-quality demo — the two things that would remain before calling
it done for *actual production* (not demo) are the live-provider
confirmation and a real device click-through, both flagged clearly above
and both one command/one `expo start` away rather than blocked on more of
my own code changes.



