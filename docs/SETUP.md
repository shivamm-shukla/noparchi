# Running NoParchi

Everything here is on a free tier. Where a paid step is unavoidable it says so.

---

## 0. Just want to look at it first?

```bash
npm install
npm run preview
```

Opens the whole app on sample data with no backend at all — every screen, both
themes, all the scanner outcomes. An amber bar across the top says so the entire
time, and nothing you press is saved anywhere.

Things worth clicking:

- **Settings → Appearance** switches light / dark / automatic.
- **Scanner** — type a code from the Ledger to see each outcome:
  `NP-K4RT-8WQZ` verified · `NP-B3ZC-7PLM` already used ·
  `NP-Q9WE-5HJN` expired with overstay · `NP-T6NX-4RVB` not paid ·
  anything else invalid.
- **`/ticket/NP-Q9WE-5HJN`** — the customer's pass with a live countdown that has
  already run out, and the Extend button.
- **`/pay/preview-merchant`** — the app-less customer checkout.

> Preview mode is opt-in through `EXPO_PUBLIC_PREVIEW=1` and is never a fallback
> from a failed request. Expo inlines that variable at build time and Metro
> caches the result, which is why the `preview` and `web` scripts both pass
> `--clear` — switching modes without it silently keeps the previous value.

---

## 1. Create the Supabase project (free)

1. supabase.com → **New project**. Pick the region closest to your venues
   (Mumbai/Singapore for India).
2. **Project Settings → API** gives you the two values below.
3. **Authentication → Providers → Email**: leave enabled. For laptop testing turn
   **Confirm email** *off* so you can sign up and land straight in the app.
   Turn it back on before real merchants use it.
4. **Authentication → Policies → Password**: minimum length must be **6 or less**,
   otherwise 4-digit staff PINs are rejected.

```bash
cp .env.example .env
```

Fill in:

```
EXPO_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJ...
EXPO_PUBLIC_WEB_URL=http://localhost:8081
```

`EXPO_PUBLIC_WEB_URL` is what the gate QR encodes. On a laptop use the address
you actually open the app on; once deployed, use the real domain.

> The anon key is public by design and safe in the bundle. Row level security is
> what protects the data. The **service role** key must never appear in `.env`.

---

## 2. Push the database

```bash
npx supabase login
npx supabase link --project-ref YOUR-PROJECT-REF
npm run db:push
```

No Docker needed — this pushes straight to the hosted project. If you would
rather not use the CLI, paste each file in `supabase/migrations/` into the
Supabase **SQL Editor**, in filename order.

Then regenerate the typed schema so TypeScript matches the real database:

```bash
npx supabase gen types typescript --linked > src/types/database.ts
```

---

## 3. Deploy the Edge Functions

Only the first two are needed to run the app. The rest are for optional
providers.

```bash
# Required — staff PIN sign-in and staff management.
# Any long random string; changing it later invalidates every staff PIN.
npx supabase secrets set STAFF_PIN_SECRET="$(openssl rand -hex 32)"

npx supabase functions deploy staff-auth --no-verify-jwt
npx supabase functions deploy staff-provision
```

`--no-verify-jwt` on `staff-auth` is deliberate: its whole job is to run before
a session exists.

### Optional — automated WhatsApp delivery

Without this, delivery uses the free share-link provider, which opens WhatsApp
with the pass prefilled and someone presses send. That works today with no setup.

```bash
npx supabase secrets set WHATSAPP_ACCESS_TOKEN=...
npx supabase secrets set WHATSAPP_PHONE_NUMBER_ID=...
npx supabase secrets set WHATSAPP_TEMPLATE_NAME=noparchi_pass
npx supabase functions deploy send-pass
```

What to expect before switching a merchant to this in Settings:

- The message **must** use a template Meta has approved. Budget a day or two,
  and expect one rejection.
- The free allowance is counted in **conversations**, not messages.
- The sending number must **not** be registered on the consumer WhatsApp app.

### Optional — automatic expiry reminders

Thirty minutes before a pass runs out, the customer gets a WhatsApp message with
a link to their pass page, where a countdown and an **Extend** button are
waiting. This needs the Cloud API above — the free share-link provider cannot
send anything unattended, so without it the fallback is the **Running out soon**
card on the dashboard, which staff nudge by hand.

```bash
npx supabase secrets set CRON_SECRET="$(openssl rand -hex 32)"
npx supabase secrets set PUBLIC_WEB_URL=https://your-app-domain
npx supabase secrets set WHATSAPP_REMINDER_TEMPLATE=noparchi_expiry_reminder
npx supabase functions deploy expiry-reminders --no-verify-jwt
```

Then enable **pg_cron** and **pg_net** under Database → Extensions, tell the
database where to find the function, and re-run the migrations:

```sql
alter database postgres set app.settings.functions_url =
  'https://YOUR-PROJECT.functions.supabase.co';
alter database postgres set app.settings.cron_secret = 'the CRON_SECRET you set';
```

The reminder template needs four body variables — business, vehicle, minutes
left, extension offer — and a **URL button** whose variable is the pass code.
The sweep runs every five minutes and claims each pass exactly once, so a
customer is never messaged twice about the same pass.

### Optional — Razorpay (the only way to skip manual payment confirmation)

Test mode needs no KYC, so this can be built and exercised before any paperwork.

```bash
npx supabase secrets set RAZORPAY_KEY_ID=rzp_test_...
npx supabase secrets set RAZORPAY_KEY_SECRET=...
npx supabase secrets set RAZORPAY_WEBHOOK_SECRET=...

npx supabase functions deploy razorpay-order --no-verify-jwt
npx supabase functions deploy razorpay-webhook --no-verify-jwt
```

Add `EXPO_PUBLIC_RAZORPAY_KEY_ID` to `.env`, then in the Razorpay dashboard point
a **payment.captured** webhook at the deployed `razorpay-webhook` URL.

Cost: ~2% per transaction, no monthly fee. What it buys is a pass that becomes
valid on its own, with no gatekeeper in the loop to confirm the money.

---

## 4. Run it

```bash
npm install
npm run web          # laptop
npm start            # then press a / i for a device
```

---

## 5. Click through the whole flow

1. **Sign up** as the owner. The business is created with four starter pass
   types already priced.
2. **Dashboard** → the *Scan to enter* card holds your gate QR. Copy the link.
3. **Customer**: open that link (another browser, or a phone on the same
   network). Pick a pass, enter a vehicle number, press pay. You get a **pass
   code** and the pass is **pending** — deliberately not valid yet.
4. **Ledger** → find the pending pass → **Payment received — make pass valid**.
   That is the manual confirmation UPI requires; Razorpay does it via webhook.
5. **Scanner** → type the pass code → big green **VERIFIED**.
6. Scan the same code again → big red **ALREADY USED**.
7. Try a code that was never paid for → amber **NOT PAID**.

### Test expiry, extension and overstay

The starter pass types are timed: Car is 6 hours (+₹30 per 3), Bike is 12 hours
(+₹10 per 6), General Entry never expires. To see the whole loop in a minute
rather than six hours, add a throwaway type in **Settings → Pass types** with a
**1 hour** validity, then shorten it directly in the Supabase SQL editor:

```sql
update ticket_types set valid_for_minutes = 2, extension_minutes = 2, extension_amount = 5
 where code = 'YOUR_TEST_CODE';
```

1. Issue a pass of that type and open it at `/ticket/<code>`. A **live countdown**
   sits above the QR.
2. Under thirty minutes left it turns amber; the **Extend** button shows the
   price and the time it buys.
3. Tap **Extend** → a pending extension is created and priced by the server. The
   pass page says the time lands once staff confirm.
4. **Ledger** → the row shows *Extension requested* → tap **Extension paid**.
   The customer's page updates on its own.
5. Let it run out. The countdown flips to **Time over by**, and the overstay due
   appears.
6. **Scanner** → scan it → amber **TIME OVER** with the amount to collect →
   **Collected ₹X — open gate**. The collection is recorded against the
   gatekeeper who tapped it, and shows in the ledger.

Overstay is billed in whole extension periods, so extending in advance is never
more expensive than being late — the incentive points at paying early.

### Test that permissions are real

1. **Settings → Gatekeepers → Add a gatekeeper**, PIN `1234`.
2. Sign out. Sign in on the **Gatekeeper** tab with that phone and PIN.
3. Ledger is gone, and the scanner works. Turning on *View ledger & revenue* from
   the owner account makes it appear.

This is enforced by the database, not the UI: the transactions policy requires
`can_view_ledger`, so a gatekeeper without it gets no rows even from a console.

### Test offline scanning

1. Load the scanner while online (this caches paid passes).
2. Turn off wifi. Scan a valid pass → verified, marked *recorded offline*.
3. **Reload the page, still offline.** Scan the same pass → **ALREADY USED**.
   This is the fix that mattered most: used passes used to come back after a
   refresh.
4. Turn wifi back on. The scan uploads by itself. Anything the server rejects
   appears on the dashboard as a conflict.

---

## 6. Android and iOS from the same codebase

```bash
npm install -g eas-cli
eas login
eas build:configure
eas build --platform android --profile preview   # installable APK
eas build --platform ios --profile preview       # simulator build
```

Free tier: EAS gives a limited number of builds per month; local builds are
unlimited if you have the toolchains. **Publishing** costs money regardless of
us — Google Play is a one-time $25, Apple is $99/year.

Camera scanning only runs on the native builds. On a laptop, use the manual code
entry box, which is why it is there.

---

## Where to change things later

| To change | Edit |
|---|---|
| Any colour, anywhere | `src/config/theme.js` |
| Permission toggles | `src/config/permissions.ts` |
| Starter pass types for a new merchant | `src/config/pricing.ts` |
| Pass types for an existing merchant | Settings → Pass types (no code) |
| Add a payment gateway | `src/services/payment/`, register in `index.ts` |
| Add a delivery channel | `src/services/messaging/`, register in `index.ts` |
| Scan rules (what clears a gate) | `validate_ticket` in `supabase/migrations/…expiry_rpcs.sql` |
| How long a pass lasts / extension price | Settings → Pass types (no code) |
| Default validity for new merchants | `src/config/pricing.ts` |
| How overstay is calculated | `overstay_due` in `supabase/migrations/…pass_expiry.sql` |
| Reminder lead time | `EXPIRY_LEAD_MINUTES` secret (default 30) |
| Who can see what | `supabase/migrations/…rls_policies.sql` |
