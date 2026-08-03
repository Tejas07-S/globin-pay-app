# Phase 2, Feature 1: Real Exchange Rates — Summary

## What changed and why

Replaced every fake/hardcoded exchange rate in the app with real live data from
Frankfurter (frankfurter.dev — free, no API key, 80+ central bank sources,
confirmed to cover all 11 of our SUPPORTED currencies including AED). This
was researched first (confirmed exact response shapes via web search before
writing any code, since I can't reach this API from this sandbox to test
live), then designed as a single shared module, then wired into every
consumer, then a real bug was found and fixed by my own test suite, then
verified end-to-end.

**Single source of truth**: `backend/rates.py` is now the *only* place
exchange-rate logic exists anywhere in the project. Found and removed a
second, independent copy of the same fake-rates-with-jitter pattern in
`extras2.py` (used for Finn's "Wait a day for EUR" insight card) that I
hadn't touched in Phase 1 — confirmed via repo-wide grep that zero
`BASE_USD_RATES` or similar duplicates remain anywhere.

**No fake predictions**: the old `/rates/predict` endpoint fabricated a
"tomorrow" rate, a "confidence %" score, and a "best day to send" — all from
a seeded random jitter, not real data. There's no honest free source for
actual FX forecasting, so rather than keep faking it, that endpoint (kept at
the same route for backward compatibility) now returns real today/yesterday
rates plus real accumulated history, with an explicit disclaimer that
GLOBiN Pay doesn't forecast future rates. Same fix applied to Finn's
proactive insights, which used to claim "waiting until tomorrow could save
you $X" based on a fabricated future rate — now compares today's real rate
to a real recorded trend instead.

**Real, self-accumulating history instead of gambling on an unconfirmed API
shape**: I could only fully confirm two Frankfurter response shapes from
research (the bulk `/v2/rates?base=&quotes=` endpoint, and single-day
historical lookups via `?date=`) — not the exact shape of a multi-day
historical range. Rather than risk shipping an integration against an
unconfirmed contract, every successful rate fetch also upserts a daily
snapshot into a new `fx_history` Mongo collection. The 7-day trend chart
reads from our *own* recorded real data — sparse on day one, fills in
day by day, never backfilled with anything fake.

**Graceful degradation everywhere** (rule 10): if the live provider fails
entirely, the last good cached rates are served, clearly marked `stale`.
If only some currencies fail, the successful ones still work and the rest
are listed in `unavailable` — never silently substituted with a guess.
This is tested explicitly (see below), including the case of a totally
fresh currency pair with zero prior cache and total provider failure.

## Answering your specific verification asks

- **Every endpoint that previously used `BASE_USD_RATES`**: found and fixed
  all of them — `/wallet` (total_usd), `/rates`, `/rates/predict`,
  `/fee/quote`, `/transfers` (both the conversion and the cashback calc),
  `/analytics` (spending/income/allocation USD conversion).
- **Every helper importing fake rates**: `get_rate()`/`_daily_seed()` in
  `server.py` removed (note: `_daily_seed()` itself is still used for one
  unrelated thing — the analytics mock spending/income bar chart, which
  isn't currency data and is a separate, out-of-scope mock — restored as a
  generic helper so removing it didn't silently break that). The duplicate
  `BASE_USD_RATES`/`_rate()` in `extras2.py` removed entirely.
- **Frontend rate screens consume the new shape**: `rates.tsx` fully
  rewritten — old fields (`sparkline`, `week`, `tomorrow`, `best_day`,
  `confidence`) don't exist anymore, so the "AI Prediction" card is now an
  honest "Live rate" card with real yesterday/today/change%, a proper empty
  state when history is still building, and a stale-data badge when the
  provider's down. Full loading/success/empty/error states per rule 11.
- **Transfer calculations use the cached rate service, not direct HTTP**:
  verified explicitly — a test asserts the mocked-HTTP call count doesn't
  increase during a transfer when the rate is already cached.
- **Wallet USD totals match transfer calculations**: verified explicitly —
  a test independently recomputes the expected `total_usd` from the wallet's
  own currency balances using the same rate source, and confirms it matches
  what `/wallet` reports, plus confirms the rate used in `/transfers` matches
  the rate `/fee/quote` would have quoted for the same pair.

## Unit tests added

`backend/_verify_rates.py` — 35 checks, all passing:
- Correct parsing of the real documented response shape
- `fx_history` persistence
- **Cache hit** (no re-fetch within TTL) and **cache expiration** (a stale
  timestamp forces a real re-fetch) — both explicitly tested
- **Partial failure** (some currencies missing from a response) merges
  gracefully from last-known-good cache, without falsely marking them
  unavailable (this exact bug was caught by my own test, then fixed)
- **Total failure** with an existing cache falls back to it, marked stale
- **Total failure with zero prior cache** (fresh currency, provider down at
  the same time) — doesn't crash, correctly marks everything unavailable
- Every downstream consumer (`/wallet`, `/fee/quote`, `/transfers`,
  `/analytics`, `/ai/insights`, `/rates`, `/rates/predict`) exercised
  end-to-end through the real (unmodified) FastAPI app

Re-ran `backend/_verify_journey.py` (Phase 1's 30-check suite) afterward —
zero regressions.

## Files changed

- `backend/rates.py` *(new)* — the single shared rate provider module
- `backend/server.py` — removed `BASE_USD_RATES`/`get_rate`, wired `fx.*`
  into `/wallet`, `/rates`, `/rates/predict`, `/fee/quote`, `/transfers`,
  `/analytics`; restored `_daily_seed()` as a generic (non-FX) helper after
  my own test caught that I'd broken it
- `backend/extras2.py` — removed the duplicate fake-rates block, rewrote
  `ai_insights()` to use real data and honest copy (no fabricated
  "tomorrow"/"wait a day, save $X" claims)
- `frontend/app/(tabs)/rates.tsx` — full rewrite to match the new response
  shape and add proper loading/success/empty/error states
- `backend/_verify_rates.py` *(new, dev-only)* — the 35-check test suite
  above, re-runnable any time

## What I still can't verify from this sandbox

Everything above is verified against a mocked HTTP layer built to match
Frankfurter's *documented* response shapes exactly (confirmed via research,
not assumed) — this sandbox's network egress can't reach api.frankfurter.dev
to test the live provider. Please do one real request once this is running
somewhere with internet access (e.g. `curl` the `/api/rates` endpoint) to
confirm the live provider behaves exactly as documented — if it doesn't,
the fix is isolated entirely to `rates.py`'s `_fetch_bulk()` function.

## Live integration test — attempted, honestly reported

Tried it directly rather than assuming: `curl -v https://api.frankfurter.dev/...`
from this sandbox's bash tool returns **`Host not in allowlist:
api.frankfurter.dev. Add this host to your network egress settings to allow
access.`** — a definitive, checkable answer from the egress gateway itself,
not a guess or a timeout I'm interpreting. This sandbox genuinely cannot
reach the live provider, for either `bash_tool` or the running app's own
network calls (same egress path).

So: **I did not mark Feature 1 "production-ready" myself**, because I
can't back that claim with a live result. What I did instead:

- `backend/_verify_rates_live.py` *(new)* — a standalone script with **zero
  mocking** that hits the real Frankfurter API, checks all 11 currencies
  come back (including AED specifically, since that was the one open
  question from research), checks the historical-date lookup, and then
  boots the real app and confirms `/rates`, `/fee/quote`, and `/transfers`
  all report the *identical* live rate for the same pair, and that
  `/wallet`'s total matches. Same checks you asked for, just against the
  real network instead of a mock.
- **Please run this yourself**: `cd backend && pip install mongomock-motor
  && python3 _verify_rates_live.py` from anywhere with real internet
  access. It'll tell you plainly if the live provider doesn't match what
  the mock assumed — and if so, the fix is isolated to one function.
- On the frontend side: there's no separate frontend rate source to verify
  independently — `rates.tsx` only ever calls `/rates` and `/rates/predict`
  and renders whatever they return, by construction (that's what "single
  source of truth" means here). So a passing live backend test plus a real
  `npx expo start` click-through covers it; there's no third thing to check.

**Feature 1 status**: code-complete, architecturally single-source-of-truth
(verified by repo-wide grep), and verified end-to-end against a contract
matching Frankfurter's own documentation exactly (35/35 mocked checks).
**Live-network confirmation is the one open item**, and it's now a
one-command script away rather than something only I could do.

## Ready for Feature 2?

Following the checkpoint pattern — pausing here for your review before
moving to Phase 2's next item (better AI assistant).
