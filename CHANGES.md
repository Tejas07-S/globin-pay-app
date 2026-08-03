# Changes — Emergent removal + local-run unblock (Phase 1 milestone)

Goal: `cd backend && python3 server.py` and `cd frontend && npx expo start` both work,
with register / login / dashboard / wallet functioning, zero Emergent dependency.

## Verified, not just reviewed

- **Backend**: installed `requirements.txt` into a clean venv, then booted the actual
  unmodified `server.py` (with Mongo's client monkey-patched to an in-memory mock,
  since this sandbox has no network access to install real MongoDB) and hit the real
  routes over HTTP. Register → login → `/auth/me` → `/wallet` → `/rates` → `/analytics`
  all returned 200 with correct data. AI chat, Stripe, and Google auth all degraded
  gracefully instead of crashing. See `backend/_verify_milestone.py` (dev-only, not
  part of the app — needs `pip install mongomock-motor` if you want to re-run it).
- **Frontend**: ran `npm install`, `npx tsc --noEmit`, and `npx expo lint` for real —
  not just read the code. Found and fixed a few pre-existing issues along the way
  (unrelated to Emergent, listed below). I could **not** boot Expo itself or a
  simulator/device in this sandbox — that part is static review only, flagged so
  you know the difference.

## Emergent removed (3 places, confirmed via grep — zero references remain)

1. **`backend/server.py`** — `emergentintegrations.llm.chat` (AI assistant) replaced
   with a direct, pluggable call to OpenAI or Anthropic's official SDKs. Reads
   `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` from `.env`; if neither is set, the
   assistant replies with a clear "not configured" message instead of failing.
2. **`backend/extras.py`** — `emergentintegrations.payments.stripe.checkout`
   replaced with the official `stripe` Python SDK directly (`stripe.checkout.Session`,
   `stripe.Webhook.construct_event`). Same behavior, no third-party wrapper.
3. **Google auth** — was calling `https://demobackend.emergentagent.com/...` on the
   backend and `https://auth.emergentagent.com/` on the frontend. Both removed.
   The endpoint now returns a clear `501 "not configured"` instead of silently
   depending on Emergent's infrastructure. A TODO in both `backend/extras.py` and
   `frontend/src/googleAuth.ts` explains how to wire up real Google OAuth later
   (your own Google Cloud OAuth client + `expo-auth-session`, verified server-side
   with `google-auth` — no third-party session relay needed). Email/password auth
   is unaffected and works today.

Also removed:
- `emergentintegrations==0.2.0` from `requirements.txt`, replaced with `stripe`,
  `openai`, `anthropic` as direct dependencies.
- `frontend/scripts/cmd-guard*` and the `preinstall` hook in `package.json` — this
  was Emergent's own install-time guardrail tooling (blocks certain `yarn add`
  commands based on a rules file). It's platform tooling you didn't write and don't
  need; removing it means `npm install` can't be silently blocked by rules you can't
  see. Verified `npm install` still works cleanly without it.
- `com.emergent.globalpayai.xrz35g` bundle identifier / package name in
  `frontend/app.json` → `com.globinpay.app`.
- A stray comment in `frontend/constants/testIds/auth.js` referencing Emergent's
  internal lint tooling — replaced with a normal explanation.

## Real bugs fixed (unrelated to Emergent, but were blocking today's goal)

- **`backend/server.py` had no entrypoint.** There was no `if __name__ == "__main__"`
  block, so `python3 server.py` did nothing at all. Added a `uvicorn.run(...)` block
  so the exact command in your milestone actually works.
- **The server crashed at import time without a Stripe account.** `extras.py` used
  to `raise RuntimeError` if `STRIPE_API_KEY` or a public URL weren't set — and
  since that router is imported unconditionally by `server.py`, the *entire app*
  failed to boot without Stripe configured, even though Stripe has nothing to do
  with register/login/wallet. Now: missing `STRIPE_API_KEY` just disables the
  Stripe endpoints (they return `501`), and `PUBLIC_URL` falls back to
  `http://localhost:8000` instead of crashing.

## Frontend fixes found via real typecheck/lint (not Emergent-related)

- `app/payment-methods.tsx` — two implicit-`any` parameters (TS7006), now typed.
- `app/cards.tsx`, `app/health.tsx`, `app/send-abroad.tsx` (×2) — unescaped `'`
  in JSX text (`react/no-unescaped-entities`), now use `&apos;`.
- Everything else `expo lint` flagged is pre-existing warnings (unused vars,
  `react-hooks/exhaustive-deps`) — harmless, not fixed here to keep this pass
  focused, but worth a cleanup pass later if you want a fully warning-free lint run.

## New/changed files for local dev

- `backend/.env` — generated with a real random `JWT_SECRET`, `MONGO_URL` pointed
  at local Mongo, all optional keys (AI, Stripe) left blank with comments.
- `backend/.env.example` — same shape, for committing to the repo (`.env` itself
  stays gitignored, as it already was).
- `frontend/.env` — `EXPO_PUBLIC_BACKEND_URL=http://localhost:8000`, with a comment
  about swapping to your LAN IP for physical-device testing.

## What's genuinely still open (not done here — flagging honestly)

- **Real Google sign-in** — stubbed, not built. Needs your own Google Cloud OAuth
  client; out of scope for "get register/login/dashboard/wallet working."
- **Live/verified Expo boot** — I can't run a simulator or device in this sandbox.
  `tsc` and `eslint` both pass clean, which catches most real breakage, but it's
  not the same as watching it render. Worth you doing a first `npx expo start` and
  telling me if anything looks off.
- **Real MongoDB verification** — I verified against an in-memory mock, not the
  real database engine. Motor/PyMongo are mature enough that this is low risk, but
  it's not the same guarantee as hitting a real `mongod`.
