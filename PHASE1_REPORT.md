# Phase 1 — Final Report

## End-to-end verification results

Ran the full 10-point journey against the real (unmodified) `server.py` + all
routers, using an in-memory Mongo mock (no real MongoDB in this sandbox — see
Known Limitations). **30/30 checks passed**, including 8 different countries'
domestic rails checked individually (not just India), a fallback-schema
country with no bespoke config, and a simulated legacy account with the
onboarding fields entirely absent from its DB document.

Script: `backend/_verify_journey.py` — re-runnable any time with
`python3 backend/_verify_journey.py` (needs `pip install mongomock-motor` if
you want to run it without a real Mongo instance).

Frontend: `npx tsc --noEmit` → 0 errors. `npx expo lint` → 0 errors, 26
warnings (down from 29 pre-existing; the 3 introduced by this session's new
code were fixed, the rest predate Phase 1 and are unrelated to it).

**What I could not verify**: I have no Expo simulator/device in this sandbox,
so the actual on-screen behavior (does onboarding *look* right, does the
welcome screen animate in properly, does the keyboard behave on iOS) is
unverified. Everything above proves the data layer, routing logic, and
TypeScript/lint correctness — not the rendered UI. Please do a real
`npx expo start` run and tell me what you see.

## Modified / new files

**Backend**
- `backend/server.py` — onboarding fields + `OnboardingIn` model, backward-compat
  `with_user_defaults()` (wired into the shared `current_user` dependency so
  *every* endpoint gets it for free), zero-balance registration (removed the
  seeded $2,500/€830.50/£420/₹15,000), new `POST /api/onboarding/complete`
- `backend/routes_payment_methods.py` — added `domestic: {method_type, label}`
  to all 11 bespoke `COUNTRY_SCHEMAS` entries; added a generic fallback schema
  for the ~38 other onboarding-eligible countries (from `countries.py`) so
  `/api/countries/{code}/schema` never 404s; both schema endpoints now return
  `domestic`

**Frontend**
- `frontend/app/onboarding.tsx` *(new)* — 4-step flow: country (search + flags,
  from the existing `/api/countries`) → currency (auto-detected, manually
  overridable) → account type → bank type
- `frontend/app/welcome.tsx` *(new)* — one-time post-onboarding confirmation
  screen with the checklist + "Link Payment Method" / "Explore Dashboard" CTAs
- `frontend/app/domestic.tsx` *(new)* — the replacement for the old India-only
  quick-transfer tile. Fully generic: reads the backend schema, renders
  whatever fields/method it returns. Zero country conditionals.
- `frontend/src/CountryForm.tsx` — added optional `onSchemaLoaded` callback
  (backward-compatible; existing callers unaffected) and `domestic` to the
  `CountrySchema` type, so `domestic.tsx` can reuse this component instead of
  duplicating its field-rendering logic
- `frontend/app/(tabs)/wallet.tsx` — dynamic domestic action tile (was
  hardcoded to "UPI"/`/upi`), zero-balance detection driving a proper empty
  state ("Your wallet is ready" / "Link a payment method to get started"),
  expanded welcome card to all 4 requested CTAs, personalized greeting
  (country flag + name), removed a stray "UPI" mention from generic copy
- `frontend/app/_layout.tsx` — **the actual fix**, not `index.tsx`. Found
  that the real auth router is the `Gate()` component here (fires on every
  navigation), not `index.tsx` (only runs once at cold start). Added the
  onboarding check to `Gate()`'s redirect logic.
- `frontend/app/index.tsx` — added the same check for consistency at cold
  start (redundant with `Gate()` but harmless, and correct if ever reached
  directly)
- `frontend/src/auth.tsx` — extended the `User` type with the new fields

**Dev-only verification scripts** (not part of the app; safe to delete)
- `backend/_verify_milestone.py`, `backend/_verify_journey.py`

## Remaining TODOs (explicitly out of Phase 1 scope, not silently skipped)

- **Real Google OAuth** — still stubbed (`501`), as agreed when Emergent was
  removed. Needs your own Google Cloud OAuth client.
- **Country-specific copy/logic in *pre-existing, untouched* screens** —
  auditing the whole repo (not just files I touched this phase) found:
  - `app/bills.tsx` and `app/recharge.tsx` hardcode `recipient_country: "India"`
    on every transaction regardless of the user's actual country, and their
    screen subtitles say "· India". These are **real bugs**, but they're in
    files outside the Phase 1 plan you approved (Bill Payments / Mobile
    Recharge weren't in scope). Flagging clearly rather than quietly
    expanding scope to fix them.
  - `app/qr.tsx` frames its only mode as "any UPI QR" — same story, out of
    scope, real issue.
  - `app/more.tsx`, `app/payment-methods.tsx`, `app/recipients.tsx` have
    generic copy that mentions "UPI" regardless of the viewer's country
    (cosmetic, not logic — but still not truly country-neutral)
  - I recommend these as the first items in Phase 2 or a dedicated cleanup
    pass, since they're the same category of issue Phase 1 just fixed for
    the dashboard/domestic-transfer flow.
- **`app/upi.tsx` and `app/bank.tsx`** — the original India-only screens are
  still in the repo, just no longer linked from the dashboard (superseded by
  `domestic.tsx`). Left in place rather than deleted, per "don't remove
  existing features" — but they're effectively dead code now. Worth deciding
  whether to delete them or repurpose them in Phase 2.
- **Analytics dashboard** (`app/analytics.tsx`) still returns illustrative
  mock numbers (spending series etc.) even for a zero-balance account — not
  in Phase 1's scope (that's Phase 2's "real exchange rates" territory
  broadly, analytics wasn't explicitly listed), flagging for awareness.

## Known limitations

- Verified against an in-memory MongoDB mock, not a real `mongod` — no real
  MongoDB available in this sandbox. Motor/PyMongo are mature enough that
  this is low risk, but it's not the same guarantee as hitting the real
  database engine.
- No live Expo boot/render check (no simulator here) — static typecheck +
  lint only, as called out above.
- The generic fallback schema (for countries without a bespoke one) only
  collects "bank name + account number" — functional, but noticeably less
  polished than the 11 bespoke countries. Fine for demo purposes; a real
  product would want proper field sets for more countries over time.

## Is Phase 1 production-ready for demonstration and testing?

**Yes, with the caveats above.** The core loop — register → onboarding gate →
complete onboarding → data persists in MongoDB → skipped on re-login →
zero-balance dashboard with correct personalization → country-adaptive
domestic transfer — is implemented, backward-compatible with existing
accounts, and verified end-to-end at the API/data layer. The two things
standing between this and "fully confident" are (1) an actual UI click-through
on your end, since I can't run Expo here, and (2) the pre-existing
bills/recharge/QR India-hardcoding, which was never in Phase 1's scope but is
worth knowing about before a demo touches those specific screens.

Ready for your review before Phase 2 (real exchange rates, upgraded AI,
loading/error handling, privacy & terms, security cleanup).
