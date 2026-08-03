# GLOBiN Pay

AI-powered global digital wallet — FastAPI + MongoDB backend, Expo/React Native frontend.

Zero Emergent dependencies. Runs entirely locally against your own MongoDB instance.

## Today's milestone: run it locally

**1. MongoDB.** You need a MongoDB instance reachable at the URL in `backend/.env`
(defaults to `mongodb://localhost:27017`). Either:
- Install locally: https://www.mongodb.com/docs/manual/administration/install-community/
- Or use a free MongoDB Atlas cluster and paste its connection string into
  `backend/.env` as `MONGO_URL`.

**2. Backend:**
```bash
cd backend
pip install -r requirements.txt
python3 server.py
```
Runs on `http://localhost:8000` (override with `PORT` env var). `backend/.env` is
already filled in with a generated `JWT_SECRET` — nothing else is required to boot.
AI (Finn) and Stripe are optional; see `backend/.env` for how to enable them.

**3. Frontend:**
```bash
cd frontend
npm install
npx expo start
```
`frontend/.env` already points at `http://localhost:8000`. If you're testing on a
physical device via Expo Go, change that to your computer's LAN IP instead of
`localhost` (a phone can't resolve your laptop's localhost).

**Expected result:** Register works, login works, dashboard loads, wallet data loads
— no Emergent dependency anywhere.

See `CHANGES.md` for the full list of what was changed to get here.

## Project structure

```
backend/
  server.py                 — app entrypoint, auth, wallet, transfers, invoices, AI chat
  extras.py                 — Stripe checkout, Google auth (stub), family wallet, referrals, admin
  extras2.py                — payment provider abstraction, countries, Finn insights, cashback
  extras3.py                — recipients, fraud check, financial health, business hub, BYO keys
  routes_payment_methods.py — country-aware payment method schemas, withdrawals
  countries.py               — supported countries/corridors data
  tests/                      — existing e2e test suite (needs a live server + real Mongo)
frontend/
  app/                        — Expo Router screens
  src/                        — api client, auth context, shared components
```
