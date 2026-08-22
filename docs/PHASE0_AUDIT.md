# NoParchi — Phase 0 Audit Report

Date: 2026-08-23
Scope: audit only. No source code was modified.
Commits audited: `ef22e4e` → `b85141b` (5 build commits by the previous AI tool).

Verification performed: full file-tree read, `npx tsc --noEmit` (passes, 0 errors),
`npx expo-doctor` (16/18), `npx expo export --platform web` (succeeds, 12 static routes).

---

## 1. Architecture reality check

**Verdict: architecture is CORRECT. This is a single unified Expo codebase. No split apps.**

| Claim | Reality |
|---|---|
| One Expo codebase, mobile + web | ✅ Confirmed. Single `app/` tree, `expo-router@4`, `react-native-web`. `expo export --platform web` produces a working static build (verified, 3.05 MB bundle, 12 routes). |
| Expo Router file conventions | ✅ Correct. `app/_layout.tsx` → `app/(tabs)/{index,ledger,scanner,settings}.tsx`, dynamic routes `app/pay/[merchantId].tsx`, `app/ticket/[ticketCode].tsx`, `+not-found.tsx`. `typedRoutes` enabled. |
| Nativewind v4 wiring | ✅ Correct. `nativewind@4.1.23`, `metro.config.js` uses `withNativeWind`, `babel.config.js` has `jsxImportSource: nativewind`, `global.css` imported in root layout, `tailwind.config.js` uses `nativewind/preset`. |
| Prisma wired to Supabase Postgres | ❌ **NO.** `prisma/schema.prisma` exists and is well-written, but `@prisma/client` is imported **zero times** anywhere in the repo. Nothing generates or uses a Prisma client. |
| Native build readiness | ⚠️ `newArchEnabled: true`, camera permissions declared for iOS+Android. No `eas.json` yet, so no EAS build config exists. |

### The Prisma problem (architectural, needs your decision)

Prisma is a **server-side ORM — it cannot run in a React Native app or a browser**, and it cannot
run inside a Supabase Deno Edge Function either. The previous AI wrote the schema and then
(correctly, by necessity) bypassed it everywhere:

- Client code (`src/services/*`) talks to Supabase via `supabase-js` REST (`.from('transactions')`).
- Edge Functions (`supabase/functions/*`) also use `supabase-js`, not Prisma.
- A **hand-written duplicate** of the schema exists at `supabase/schema.sql` — meaning you now
  have **two sources of truth that already disagree** (see §6).

So "strict Prisma, no raw queries" as specified is not achievable with the current
Expo + Supabase Edge Function topology. Decision needed — see Question Q1.

---

## 2. Multi-tenancy audit — **HIGHEST PRIORITY**

**Verdict: multi-tenancy is enforced only in client-side JavaScript. There is no server-side
isolation. Any customer can read every merchant's revenue data with a browser console.**

### P0-A — No Row Level Security anywhere
`supabase/schema.sql` creates 5 tables and **never issues a single
`ALTER TABLE ... ENABLE ROW LEVEL SECURITY`** or `CREATE POLICY`.

The app ships the Supabase **anon key** to the browser (`src/lib/supabase.ts:8`, public by design).
With RLS off, that anon key grants full read/write on every table. Anyone who opens the web app,
opens devtools, and runs `supabase.from('transactions').select('*')` gets **every merchant's
entire revenue ledger**, plus `users` including the plaintext `passcode` column.

The `.eq('merchantId', ...)` filters in `src/services/*` are a client-side convenience, not a
security boundary — the client chooses its own `merchantId`.

Files: `supabase/schema.sql` (whole file), `src/lib/supabase.ts:15`.

### P0-B — No authentication at all
There is no login route, no `supabase.auth` usage anywhere (grep: zero hits outside a code
comment). "Who am I" is `AppContext.currentUser`, seeded from `INITIAL_USERS[0]` and switchable
freely (§4). Without an authenticated JWT there is nothing for RLS policies to key off of, so
P0-A cannot even be fixed until auth exists.

Files: `src/context/AppContext.tsx:49`, `app/_layout.tsx` (no auth guard), `app/` (no login route).

### P0-C — Customer pay route ignores its own tenant parameter
`app/pay/[merchantId].tsx:14` destructures `merchantId` from the URL and **never uses it**.
Pricing, UPI ID, and business name all come from `useApp().merchant`, which is the single
hardcoded mock merchant. Every merchant's gate QR therefore leads to the **same** merchant's
checkout, at the same rates, paying the same UPI ID. The multi-tenant customer flow does not
functionally exist.

Same class of bug: `app/ticket/[ticketCode].tsx:15-19` resolves the ticket from the local
merchant-app context instead of fetching it by code, so a real customer's browser shows a
placeholder pass (`₹50` default at line 122).

### P0-D — Client-side merchantId trust in writes
`src/services/transactionService.ts:178` and `src/services/staffService.ts:90` insert rows with a
`merchantId` supplied by the client. With no RLS and no auth, a caller can write rows into any
merchant's tenant.

### Queries that DO scope correctly (client-side) — for the record
- `src/services/transactionService.ts:47` — `.eq('merchantId', merchantId)` ✅
- `src/services/transactionService.ts:84` — local filter ✅
- `src/services/staffService.ts:44` — `.eq('merchantId', merchantId)` ✅
- `supabase/functions/validate-ticket/index.ts:107` — cross-merchant ticket check ✅ (good catch by the previous AI)

### Queries missing scoping
- `src/services/staffService.ts:183` — `.from('users').delete().eq('id', userId)` — **no merchantId filter**. Deletes any user by id across tenants.
- `supabase/functions/validate-ticket/index.ts:88` — `.eq('ticketCode', cleanedCode)` with no merchant filter; mitigated by the post-hoc check at :107, but the row is read first. Should be a compound filter.
- `supabase/functions/create-transaction/index.ts:56` — merchant lookup unauthenticated; anyone can POST and mint a `status: 'SUCCESS'` ticket for any merchant (see §7).

---

## 3. Concurrency audit

**Verdict: mixed. One path is genuinely correct, the actually-used path is not.**

### ✅ What is correct
- `supabase/schema.sql:120` — `ticket_validations.transactionId` has a **UNIQUE constraint**. This is the right primitive: it makes double-scan impossible at the DB level regardless of application code.
- `supabase/schema.sql` `validate_ticket_atomic()` — uses `SELECT ... FOR UPDATE` row lock, checks existing validation, inserts, and catches `unique_violation`. Structurally this is exactly right.
- `supabase/functions/validate-ticket/index.ts:146-158` — correctly handles PG error `23505` as ALREADY_USED. Correct pattern.

### ❌ P0-E — `validate_ticket_atomic()` cannot execute. It throws on every call.
PL/pgSQL folds unquoted identifiers to lowercase. The function accesses record fields as
`v_user.isOwner` (line ~185), `v_tx.merchantId`, `v_user.merchantId` — but those columns were
created **quoted** as `"isOwner"` / `"merchantId"`, so the runtime looks for `isowner` /
`merchantid` and raises `record "v_user" has no field "isowner"`.

Worse, the function ends with `EXCEPTION WHEN OTHERS THEN RETURN ... 'INVALID'`, which
**swallows that crash** and returns a plausible-looking `{success:false, status:'INVALID'}`.
So the "atomic concurrency stored procedure" silently rejects 100% of valid tickets and never
reports why. Nothing calls it today, which is the only reason this hasn't surfaced.

File: `supabase/schema.sql`, function `validate_ticket_atomic`.

### ❌ P0-F — The scan path actually used has no DB transaction and a TOCTOU window
`supabase/functions/validate-ticket/index.ts` does read-check-then-insert as **three separate
network round-trips** with no transaction. Two gatekeepers scanning simultaneously both pass the
:119 pre-check. The UNIQUE constraint does save the data (one insert loses at :148), so
**double-spend is prevented** — but only by luck of the constraint, not by the code. The `FOR
UPDATE` lock exists only in the dead SQL function. This should call `validate_ticket_atomic` via
RPC once that function is fixed.

### ❌ P0-G — The offline fallback validator does not persist "used", so tickets are infinitely reusable
`src/services/validationService.ts:86-149` — when Supabase is unconfigured (which is the **current
default state**, since no `.env` exists) the validator:
1. Mutates `targetTx.validation` in memory (line 134),
2. Writes only to `STORAGE_KEY_VALIDATIONS` (line 140) — **a list that is never read back anywhere**,
3. Never calls `transactionService.persist()`.

Result: reload the app and every already-scanned ticket reads as unused again. **The anti-fraud
core of the product does not survive a page refresh.** This is the single most damaging bug in
the repo for a demo.

### ❌ P1-H — `scanMutex` is not a lock
`src/services/validationService.ts:9-19`. An in-memory boolean, per device, per JS instance. It
does not span the two gatekeepers this product is explicitly designed for. Comment claims
"Concurrency Lock" (line 42), which is misleading — it's a UI double-tap guard at best. Also has a
check-then-set race in `acquireLock` itself (harmless in single-threaded JS, but the shape is wrong).

### ❌ P1-I — No slot/inventory model exists at all
The spec calls for slot booking with double-booking prevention. There is **no `Slot`, `TicketType`,
`Inventory`, or capacity concept** in either schema. `vehicleType` is a fixed enum. Nothing can be
oversold because nothing is tracked as finite. This is a missing feature, not a broken one — see Q4.

---

## 4. RBAC audit

**Verdict: the permission *model* is correctly dynamic and table-driven — the *enforcement* is
100% cosmetic and trivially bypassed.**

### ✅ Model is right
`StaffPermission` is a real table with granular boolean toggles
(`can_view_ledger`, `can_verify_tickets`, `can_edit_settings`, `can_issue_refund`) in both
`prisma/schema.prisma:52` and `supabase/schema.sql:57`. `RoleGate` (`components/ui/RoleGate.tsx`)
is a proper reusable permission component keyed by permission name. Settings has a working
toggle UI. This part matches the spec well.

### ❌ P0-J — There is a literal "Switch to Owner (Root Admin)" button on the access-denied screen
`components/ui/RoleGate.tsx:56-63`. When a staff member is denied access to the Ledger, the denial
screen offers a one-tap escalation to full owner privileges. No passcode, no auth. The entire
RBAC system can be defeated by the button that RBAC itself renders.

Same escalation available freely via `RoleSwitcherModal` and `AppContext.switchUser()`
(`src/context/AppContext.tsx:121-127`) — which does not verify `passcode` at all.

### ❌ P0-K — All permission checks are client-side only
`RoleGate.tsx:24`, `settings.tsx:120`, `validationService.ts:30` all evaluate permissions in the
browser against context state. With no RLS (§2) and no auth (§2), a staff member with
`can_view_ledger: false` reads the full ledger straight from the anon key.

The only server-side check is `supabase/functions/validate-ticket/index.ts:56` — which is correct
in shape, but its user identity comes from a **client-supplied `scannedByUserId` in the request
body** (line 8/25), i.e. anyone can claim to be the owner's user id.

### ❌ P1-L — Permission JSONB extension not used; four toggles are hardcoded in 6 places
The spec asked for extensibility without schema rewrites. Instead the four keys are typed as a
closed union in `RoleGate.tsx:9` and re-listed literally in `staffService.ts:76,105,134,154`,
`settings.tsx:95,352,405-483`, `mockData.ts:32`, and both schemas. Adding `can_issue_refund_over_500`
tomorrow is a 6-file edit plus two migrations. This is both an RBAC gap and a maintainability defect.

### ❌ P1-M — Staff passcodes stored and compared in plaintext
`prisma/schema.prisma:44` comments "Hashed or 4-6 digit staff PIN" — nothing hashes.
`staffService.ts:73` stores raw, `supabase/schema.sql` seeds `'1234'` / `'0000'` in plaintext,
and with no RLS the `users` table (including `passcode`) is world-readable via the anon key.

---

## 5. Feature completeness checklist

| Module | Status | Gap |
|---|---|---|
| **Dashboard** | ⚠️ Partial | UI is complete and good: stats grid, live feed, branded QR card, responsive lg: breakpoints. But: stats are computed **client-side from the full transaction list** (`transactionService.ts:96-128`) — will not scale past a few hundred rows and needs a server aggregate. Realtime subscription exists (`transactionService.ts:209`) but is a no-op without Supabase configured, and on every event it calls a **full `loadData()` refetch** rather than patching state. |
| **Ledger** | ⚠️ Partial | Renders, searches, date-filters, gated by `can_view_ledger` via `RoleGate` ✅. Gate is bypassable (§4). "Export CSV" button present — verify it actually writes a file on native. Filtering by date is done in `getTransactions` ✅. |
| **Scanner** | ⚠️ Partial | `expo-camera` `CameraView` + `barcodeScannerSettings: ['qr']` correctly wired (`scanner.tsx:104-114`). Green/red `ValidationModal` exists and looks right. Manual code entry + three test-trigger buttons are genuinely useful for laptop testing. **But** the validation it performs is the broken non-persisting local path (§3 P0-G), so "Already Used" stops working after refresh. Camera is disabled on web by design (`Platform.OS !== 'web'`) — acceptable, but it means you cannot test a real camera scan on your laptop; use manual entry. |
| **Settings** | ✅ Mostly working | Merchant profile edit, pricing rate edit, staff list, add-staff form, 4 permission toggles per staff. Correctly disables editing for non-owners. Gap: merchant settings persist **only to AsyncStorage** (`AppContext.tsx:210`) — never written to Supabase. Change a rate on your laptop, it does not reach the DB or any other device. |
| **Customer QR → pay → WhatsApp** | ❌ Effectively missing | The screens exist and look good, but: the route ignores `merchantId` (§2 P0-C); payment is an **honour-system "I Have Paid" button** (`pay/[merchantId].tsx:229`) that mints a `status: 'SUCCESS'` ticket with zero verification (§7); no PDF is ever generated despite "PDF ticket" being the promise; WhatsApp send is a simulation (§7); and the ticket page can't find the ticket it was just given. End-to-end, this flow does not work for a real customer. |

---

## 6. Broken / buggy code

Build health is better than expected: **`tsc --noEmit` passes with 0 errors** under `strict: true`,
and the web export builds cleanly. The bugs are runtime and logic, not compile.

| # | Sev | File | Issue |
|---|---|---|---|
| B1 | P0 | `supabase/schema.sql` | `validate_ticket_atomic` crashes on `v_user.isOwner` / `v_tx.merchantId` (case folding, §3 P0-E), and `WHEN OTHERS` hides it. |
| B2 | P0 | `src/services/mockData.ts:4` vs `supabase/schema.sql:170` | **Merchant IDs disagree.** App uses `'m-noparchi-001'`; SQL seeds `'a0000000-0000-0000-0000-000000000001'`. The DB column is `UUID`, so the moment you configure Supabase, every query sends a non-UUID and Postgres errors out — and the code silently swallows it (`try/catch` → falls back to local). You'd see "it works" while nothing touches the DB. Same mismatch for user ids (`u-owner-001` vs `b0000000-…`). |
| B3 | P0 | `src/services/staffService.ts:150` | `.upsert()` with no `onConflict: 'userId'`. PostgREST defaults the conflict target to the primary key `id`, which isn't supplied → a fresh uuid is generated → no PK conflict → plain INSERT → violates `UNIQUE("userId")`. **Permission changes never persist to the DB.** |
| B4 | P1 | `src/services/staffService.ts:128` | `updateStaffPermissions` looks the user up in the **local** `this.users` array, but `getStaffMembers` returns **Supabase** rows when configured. Lookup misses → returns `null` → `AppContext.tsx:171` skips the state update → toggle silently reverts in the UI. |
| B5 | P1 | `src/services/transactionService.ts:46` vs `supabase/functions/validate-ticket/index.ts:119` | Inconsistent handling of the embedded `validation` relation. PostgREST returns a **to-many array** unless it detects the unique constraint. The Edge Function defensively handles both (`Array.isArray`); the client service blind-casts to `Transaction`. If it arrives as `[]`, then `Boolean(tx.validation)` is **`true` for an empty array** → every unscanned ticket renders as "Exit Cleared" and the scanner reports ALREADY_USED for valid tickets. Dashboard `todayScansCount`/`activeVehiclesCount` also invert. |
| B6 | P1 | `src/services/transactionService.ts:199` | On the Supabase path the row is inserted remotely **and** unshifted into the local array, then realtime fires `loadData()`. Duplicate/ghost rows and double-counted revenue are likely. |
| B7 | P1 | `src/services/transactionService.ts:222` | Realtime filter `` `merchantId=eq.${merchantId}` ``. Supabase realtime filters are unreliable against **camelCase quoted columns**; this likely silently never fires. (Also requires the table to be added to the `supabase_realtime` publication, which `schema.sql` never does.) |
| B8 | P1 | `src/services/*` (throughout) | Every Supabase call is wrapped in `try/catch` that **logs a warning and falls through to mock data**. This is why the app appears to work — failures are indistinguishable from success. Silent-fallback-on-error is the reason you "don't know what's broken." |
| B9 | P2 | `src/utils/whatsapp.ts:76` | Reads `process.env.WHATSAPP_ACCESS_TOKEN` from **client-side** code. Without the `EXPO_PUBLIC_` prefix this is always `undefined` in the bundle, so the branch is dead — which is *fortunate*, because if it ever worked it would ship your Meta token to every browser. Must move server-side. |
| B10 | P2 | `src/utils/whatsapp.ts:22` | Falls back to hardcoded phone `'+919876543210'` when `customerPhone` is missing — would send a stranger's ticket to that number in production. |
| B11 | P2 | `components/ui/CustomBrandedQR.tsx:24` | `useRef<any>` — one of only two `any`s in the codebase. |
| B12 | P2 | `supabase/functions/validate-ticket/index.ts:59` | `(user.permission as any)[0]?.can_verify_tickets` — `any` cast papering over the same array/object ambiguity as B5. |
| B13 | P2 | `app/(tabs)/scanner.tsx:79-97` | Gate selector writes `"Exit Gate 1"` but initial state is `"Main Exit Gate 1"`, and selection is matched by `.includes(g)` substring — fragile, and gates are a hardcoded 3-item array. |
| B14 | P2 | `app/pay/[merchantId].tsx:104,120`; `index.tsx:75` | `bg-gradient-to-br` / `grid grid-cols-2` are **web-only Tailwind classes with no Nativewind equivalent**. These silently render as flat/stacked on Android/iOS. The layout you see on your laptop is not the layout you'll get on device. |
| B15 | P2 | `supabase/functions/*` | Deno std `0.177.0` `serve` is deprecated in favour of `Deno.serve`; also imports `supabase-js` from esm.sh rather than a pinned `deno.json` import map. |
| B16 | P2 | `app/(tabs)/scanner.tsx:1`, `app/pay/[merchantId].tsx:4` | Unused imports (`useEffect`, `QrCode`, `ArrowRight`, `KeyRound`, `ShieldAlert`, `RefreshCw`). Harmless, but `noUnusedLocals` is off so they accumulate. |
| B17 | P2 | `temp-app/` | Empty leftover directory from scaffolding. Delete. |

---

## 6b. Maintainability audit

| Offender | Where | Detail |
|---|---|---|
| **Pricing fallbacks duplicated 3×** | `app/pay/[merchantId].tsx:24-35,122-125`, `components/ui/NewTicketModal.tsx:25-31,99-102`, `components/ui/CustomBrandedQR.tsx:144-159` | The same `configSettings?.twoWheelerRate \|\| 20` ladder, including the magic `* 2` for heavy vehicles, is copy-pasted. Changing the default 4-wheeler rate is a 3-file hunt. **No central pricing module exists.** |
| **125 inline hex colors** | 17 files; worst: `settings.tsx` (22), `index.tsx` (16), `pay/[merchantId].tsx` (12) | `tailwind.config.js` defines a proper `brand` palette that **almost nothing uses**. Icons take `color="#10B981"` literals everywhere. Changing the emerald accent means editing 125 sites. There *is* one good place to change theme — it's just bypassed. |
| **Zero provider abstraction — payment** | `app/pay/[merchantId].tsx:39` | The `upi://pay?...` intent string is built inline in a screen component. There is no `PaymentProvider` interface. Swapping to Razorpay means rewriting the checkout screen. |
| **Zero provider abstraction — messaging** | `src/utils/whatsapp.ts` | Meta Cloud API payload shape (`messaging_product`, `template.components`) is hardcoded into the single send function, called directly by `WhatsAppTicketModal.tsx:7`. No `MessagingProvider` interface. Swapping to Twilio/Gupshup means rewriting the util and the modal. |
| **Ticket types are a closed enum** | `prisma/schema.prisma:19`, `supabase/schema.sql:17`, `src/types/index.ts:2` | `VehicleType` is a Postgres ENUM in two schemas plus a TS union. Adding "Cycle" or "VIP Pass" = 2 migrations + type edit + 3 UI edits. Exactly the trade-off you asked to be flagged — see Q4. |
| **Permission keys hardcoded in 6 places** | see §4 P1-L | Same problem for the RBAC toggles. |
| **Two schemas, already diverged** | `prisma/schema.prisma` vs `supabase/schema.sql` | `flatRate` default is **30** in Prisma, **40** in SQL. `amount` is `Float` in Prisma, `NUMERIC(10,2)` in SQL. This is the classic dual-source-of-truth failure and it already happened within one build session. |
| ✅ **Component reuse is genuinely good** | `components/ui/` | `Button`, `Card`, `Badge`, `StatsCard`, `Header`, `ValidationModal`, `RoleGate`, `DateFilter` are properly parameterised and reused across all screens. No copy-pasted screen-local buttons found. This is the strongest part of the existing code — keep it. |

---

## 7. Payment & WhatsApp integration status

### Payment: **UPI deep-link only, with no verification. Nothing else is wired.**
No Razorpay, no Stripe, no Cashfree, no PhonePe SDK — grep confirms zero payment SDKs in
`package.json`. What exists:

- `app/pay/[merchantId].tsx:39` builds a raw `upi://pay?pa=…&am=…&cu=INR` intent URL.
- On native it `Linking.openURL`s it; on web it renders that URL as a QR (`:217`).
- Then it shows a button literally labelled **"I Have Paid • Generate My Pass"** (`:230`) which
  calls `createTransaction` and writes `status: 'SUCCESS'` (`transactionService.ts:156`).

**There is no webhook, no callback, no reconciliation, no payment verification of any kind.**
The customer self-declares payment. A product whose entire pitch is "staff steal 30% of your cash"
currently lets any customer press a button and get a free valid ticket. This is the mirror image of
the fraud you're trying to solve, and it's P0.

`paymentRef` is generated locally as `UPI-${Date.now()}-${random}` (`:148`) — it is a fabricated
string, not a real UPI transaction reference, despite being stored in a `UNIQUE` column.

### WhatsApp: **simulated. Meta Cloud API payload is correctly shaped but never sends.**
- `src/utils/whatsapp.ts` builds a genuinely correct Meta Cloud API v20 template payload
  (`digital_parking_pass_v1`, header image + 5 body params). Whoever wrote this knew the API.
- It only fires if `process.env.WHATSAPP_ACCESS_TOKEN` exists — which, being client-side and
  un-prefixed, is **always `undefined`** (B9). So it always returns `status: 'SIMULATED'` (`:110`).
- The QR image is generated via the **third-party public service `api.qrserver.com`** (`:32`) —
  you'd be leaking every ticket code to an external host, and depending on their uptime.
- **No PDF is ever generated.** The "PDF digital ticket" in the spec does not exist in any form.
  `expo-file-system` and `expo-sharing` are installed but unused.
- No template has been submitted to Meta for approval (that's an external step, not code).

---

## 8. Dependency health

The Expo 52 / RN 0.76.7 / Nativewind 4.1.23 / React 18.3.1 trio is **a valid, compatible
combination** — this is the version set that usually breaks, and it didn't. `expo-doctor` gives
16/18.

| Item | Status |
|---|---|
| `expo@~52.0.35` + `react-native@0.76.7` + `nativewind@4.1.23` | ✅ Compatible. Builds and typechecks. |
| `react-native@0.76.7` | ⚠️ Expo 52 expects `0.76.9`. Minor drift — `npx expo install --check` fixes it. |
| `@expo/vector-icons@14.1.0` | ⚠️ Expo 52 expects `~14.0.4`. Minor drift. |
| `@prisma/client` + `prisma@6.4.1` | ⚠️ ~380 MB of dependencies for something imported zero times. Also flagged "no metadata" by expo-doctor because it isn't an RN package — it can't be. |
| `clsx@2.1.1` | ⚠️ Flagged unmaintained. Trivial to drop (you also have `tailwind-merge`). |
| `expo@52` (SDK) | ⚠️ **Note:** SDK 52 is now well behind current. Not urgent for laptop testing, but plan an SDK upgrade before you ship to the stores — Apple/Google minimum-SDK deadlines bite Expo apps that lag. |
| `eas.json` / EAS config | ❌ Absent. Needed for Android/iOS builds. |
| `.env` | ❌ Absent (only `.env.example`). **This is why everything currently runs on mock data.** |
| Security | ✅ `.gitignore` correctly excludes `.env`, `dist/`, `*.key`, `*.p12`. No secrets committed. `dist/` confirmed untracked. |

---

## Prioritised fix list

### P0 — security, data integrity, or "the demo lies to you"
1. **P0-1** Enable RLS + policies on all 5 tables (§2 P0-A) — currently the anon key is a full DB grant.
2. **P0-2** Add real authentication (Supabase Auth, phone/OTP or passcode-backed) (§2 P0-B) — prerequisite for #1 and #4.
3. **P0-3** Remove the "Switch to Owner" escalation button and gate `switchUser` behind a passcode (§4 P0-J).
4. **P0-4** Move all permission enforcement server-side; stop trusting client-supplied `scannedByUserId` (§4 P0-K).
5. **P0-5** Fix `validate_ticket_atomic` identifier quoting + stop swallowing errors in `WHEN OTHERS` (§3 P0-E).
6. **P0-6** Route scanning through the fixed RPC inside one transaction (§3 P0-F).
7. **P0-7** Fix the offline validator so "used" actually persists (§3 P0-G) — the anti-fraud core.
8. **P0-8** Reconcile merchant/user IDs to real UUIDs (B2) and collapse to one schema source of truth (Q1).
9. **P0-9** Replace the honour-system "I Have Paid" button with real payment verification (§7).
10. **P0-10** Make `app/pay/[merchantId].tsx` actually load the merchant from its route param (§2 P0-C), and make the ticket page fetch by code (§2 P0-C).
11. **P0-11** Stop swallowing Supabase errors into mock-data fallbacks (B8) — surface them loudly, at least in dev.

### P1 — missing core features / correctness
12. Fix `staff_permissions` upsert `onConflict` (B3) and the local/remote lookup mismatch (B4).
13. Normalise the embedded-`validation` array-vs-object handling in one place (B5).
14. Hash staff passcodes (§4 P1-M).
15. Persist merchant settings to Supabase, not just AsyncStorage (§5 Settings).
16. Server-side dashboard aggregates instead of client-side reduce (§5 Dashboard).
17. Real WhatsApp delivery from a server-side Edge Function + actual PDF/image pass generation (§7).
18. Central `PaymentProvider` / `MessagingProvider` interfaces (§6b).
19. Central `pricing.ts` + `permissions.ts` config modules (§6b).
20. Fix realtime: add tables to the publication, verify the camelCase filter, patch state instead of full refetch (B7, §5).
21. Scope `deleteStaffMember` by merchantId (§2).
22. Slot/inventory model, **if** you want it (Q4).

### P2 — polish, DX, maintainability
23. Replace 125 inline hex colors with theme tokens (§6b).
24. Replace web-only Tailwind classes that break on native (B14).
25. `npx expo install --check` version alignment; drop `clsx`; decide on Prisma (Q1).
26. Delete `temp-app/`, clean unused imports, remove the two `any`s.
27. Self-host QR generation instead of `api.qrserver.com` (§7).
28. `eas.json` + EAS Build setup for Android/iOS.
29. Modernise Edge Functions to `Deno.serve` (B15).

---

## What I need from you before Phase 1

**Q1 — Prisma: keep, or drop?**
Prisma cannot run in Expo or in Deno Edge Functions, so today it's a 380 MB unused dependency plus
a second schema that has already drifted from the real one. Three options:
 - **(a) Drop Prisma. `supabase/schema.sql` + Supabase migrations become the single source of truth.** ← my recommendation. Simplest, zero cost, matches how the code already works.
 - (b) Keep Prisma purely as the schema authoring tool: define schema in Prisma, `prisma migrate` against Supabase Postgres from your laptop, delete the hand-written SQL. Runtime still uses supabase-js. Costs nothing, gives you nice migrations, but you must never import the client.
 - (c) Add a real Node backend (Railway/Fly free tier) that owns Prisma. Most faithful to your original spec, most moving parts, and a free-tier server that sleeps is bad for a gate scanner.

**Q2 — Existing DB data: reset or preserve?**
Is there a live Supabase project with real data, or is everything still mock/local? I found no
`.env`, which suggests nothing has ever hit a real database — please confirm, because P0-8 (UUID
reconciliation) is trivial on an empty DB and painful on a populated one.

**Q3 — Auth model for merchants and staff.**
Owner and staff both need to sign in before RLS can mean anything. Which do you want?
 - **(a) Phone + OTP for the owner (Supabase Auth, free tier), and owner-issued PIN for staff devices.** ← my recommendation: matches how a parking-lot owner actually onboards a gatekeeper, and staff often share one device.
 - (b) Phone + OTP for everyone (cleaner, but every gatekeeper needs their own number and SMS costs money past the free tier).
 - (c) Email + password for the owner only, staff via PIN.
Note: Supabase's built-in SMS provider requires you to bring your own Twilio/MessageBird account — that has a cost. Email OTP is free. Tell me if SMS cost is a blocker.

**Q4 — Ticket/vehicle types: fixed enum or config-driven?**
Right now `VehicleType` is a hard Postgres enum. Trade-off, as you asked me to flag:
 - **Config-driven (a `ticket_types` table or a JSONB array on the merchant):** you add "Cycle", "VIP Pass", "Night Rate" from the Settings UI with no migration. Slightly more query complexity, loses DB-level type safety on the value.
 - **Keep the enum:** simpler and type-safe, but every new type is a migration + a code deploy.
Given you explicitly said you'll keep adding merchant types, **I recommend config-driven** — but it's your call and it affects the schema I write in Phase 1, which is why I'm asking now.

**Q5 — Slot booking: in scope for v1?**
The spec mentions "pick a slot" and double-booking prevention, but there is no capacity model
anywhere in the code, and for a parking lot / mela gate the real flow is usually "pay, get pass,
walk in" with no reserved slot. **Do you want finite slot inventory in v1, or is "pay → pass →
scan at exit" enough for now?** I recommend deferring slots — it's a meaningful schema addition
and the fraud problem you're solving doesn't need it.

**Q6 — Credentials.** I'll need these when we get to the relevant modules; nothing is blocked
until then, and I will **not** invent placeholders:
 - Supabase project URL + anon key + service role key (free tier is fine)
 - Later: WhatsApp Cloud API phone number ID + access token
 - Later: payment gateway keys, once you pick one below

---

## My recommendation: payment + WhatsApp on a zero-budget path

### Payment → **keep UPI, but make it verifiable. Add Razorpay only when you have real merchants.**

You already have a UPI intent flow, and it's genuinely the right instinct for this market — Indian
parking customers already have GPay/PhonePe open. Don't rip it out. The problem isn't UPI, it's
that nothing verifies the payment happened.

Realistic free-tier options, in the order I'd try them:

| Option | Cost | Verdict |
|---|---|---|
| **Razorpay Standard Checkout / UPI** | ₹0 setup, ₹0/month, **2% per transaction**. Needs KYC (PAN + bank + business proof). Test mode is free and instant. | ✅ **Recommended.** Gives you a real webhook → server-verified payment → only then mint the ticket. This is the only option that actually closes P0-9. Build against **test mode now** — no KYC needed to develop, and the integration is identical when you flip to live. |
| **Cashfree** | Similar, ~1.75-2%, also has a free test mode | ✅ Fine alternative; slightly cheaper. Same integration shape. Worth a look if Razorpay KYC stalls. |
| **Raw UPI deep link + manual confirm (current)** | Truly ₹0, money lands directly in the merchant's bank | ⚠️ Keep as a **fallback tier**, but it can never be trusted to auto-issue a ticket. If you must ship it, the ticket should be issued by the *gatekeeper* confirming receipt on the merchant app, not by the customer clicking a button. |
| UPI AutoPay / collect requests | Requires a PSP partnership | ❌ Not accessible pre-revenue. |

**Concretely:** I'd put a `PaymentProvider` interface in front, ship a `UpiIntentProvider`
(honour-system, gatekeeper-confirmed — works today, zero cost, zero KYC) **and** a
`RazorpayProvider` (test mode now, live after KYC), selectable per merchant from config. That way
you can demo tomorrow and go live without touching business logic.

### WhatsApp → **Meta Cloud API direct, on the free tier. Not Twilio.**

| Option | Cost | Verdict |
|---|---|---|
| **Meta WhatsApp Cloud API direct** | Free tier: 1,000 free service conversations/month; **utility templates are cheap (~₹0.12-0.15 each)** and there's no monthly platform fee. Needs a Meta Business account + a dedicated phone number + template approval (~1-2 days). | ✅ **Recommended**, and the previous AI already wrote a correctly-shaped Cloud API payload — that work is salvageable. Don't throw it away. |
| Twilio WhatsApp sandbox | Free sandbox, but **every recipient must first message a join code** to Twilio's shared number. | ❌ Fine for your own testing, useless for real customers — no parking customer will send a join code. Also adds Twilio's markup on top of Meta's fee later. |
| Gupshup / AiSensy / Wati | Free trials, then ₹1-2k/month platform fee | ❌ Skip while pre-revenue; the monthly fee is exactly the cost you said you don't have. |

**Caveats you should know now, not later:**
 - Templates must be **pre-approved** by Meta. You cannot send arbitrary text to someone who hasn't messaged you first — a ticket receipt must go out as an approved *utility* template. Budget 1-2 days for approval and expect one rejection.
 - The free tier is per-*conversation* (24h window), not per-message.
 - You need a phone number **not currently registered on the WhatsApp consumer app**.
 - **Interim path that costs nothing and needs no approval:** a `wa.me/<number>?text=…` deep link that opens the customer's own WhatsApp with the pass details pre-filled, plus the pass rendered as a shareable web page at `/ticket/<code>`. Not automated delivery, but it demos end-to-end today, and it slots behind the same `MessagingProvider` interface so swapping in real Cloud API later is one new adapter.

**Concretely:** `MessagingProvider` interface → `WaDeepLinkProvider` (works today, ₹0) and
`MetaCloudProvider` (the existing payload, moved **server-side into an Edge Function** so the token
never reaches the browser — B9).

---

## Bottom line

The previous AI built a **better skeleton than expected**: architecture is right, it typechecks
clean under strict mode, the web build works, the component library is genuinely reusable, and
several hard things (the UNIQUE constraint on validations, the cross-merchant ticket check, the
Meta payload shape) were done correctly.

What it did **not** build is anything that survives contact with a second user: no auth, no RLS,
no real payment verification, no persistence on the scan path, and a one-tap privilege escalation
button. It looks finished because every failure silently falls back to mock data.

Nothing here needs a rewrite. It needs a security floor poured underneath it.

**Awaiting your answers to Q1-Q6 before writing any code.**
