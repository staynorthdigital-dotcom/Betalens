# Putting Beta Lens online

This gets the app live at its own web address, with real sign-in, saved climbs and Pro payments. It takes about an hour the first time. You don't need to write any code: you'll create four free accounts and copy some keys between them.

You'll need: a laptop, an email address, and a bank card for the Anthropic API (you pay per scan, usually a small fraction of a penny to a few pence each).

---

## 1. Put the code on GitHub (10 min)

1. Make a free account at **github.com**.
2. Click **New repository**, name it `beta-lens`, choose **Private**, then **Create repository**.
3. On the next page click **uploading an existing file**, drag in everything from the unzipped `beta-lens` folder, and click **Commit changes**.

## 2. Set up the database and sign-in: Supabase (15 min)

1. Make a free account at **supabase.com** and click **New project**. Pick the **London** region, set a database password and save it somewhere safe.
2. When it's ready, open **SQL Editor → New query**, paste in everything from `supabase/schema.sql`, and click **Run**. You should see "Success".
3. Open **Project Settings → API**. Keep this tab open; you need three values from it:
   - **Project URL** → `SUPABASE_URL`
   - **anon public** key → `SUPABASE_ANON_KEY`
   - **service_role** key → `SUPABASE_SERVICE_ROLE_KEY` (secret: never share it)
4. Optional, for "Continue with Google": **Authentication → Providers → Google** and follow the steps there. Email sign-in works without this.

## 3. Get your AI key: Anthropic (5 min)

1. Make an account at **console.anthropic.com**.
2. Under **Billing**, add a card and some credit. £10 to £20 is plenty to start.
3. Set a **monthly spend limit** so a busy month can't surprise you.
4. Under **API keys**, create a key → `ANTHROPIC_API_KEY`.

## 4. Put it online: Vercel (10 min)

1. Make a free account at **vercel.com** and sign in with GitHub.
2. Click **Add New → Project**, pick `beta-lens`, and click **Import**. Leave the settings as they are.
3. Open **Environment Variables** and add each line from `.env.example` with your real values. Skip the Stripe ones for now.
4. Click **Deploy**. You'll get an address like `beta-lens.vercel.app`.
5. Back in Supabase, open **Authentication → URL Configuration**. Set **Site URL** to that address and add it under **Redirect URLs** too. (This makes the email sign-in link come back to your app.)

At this point you can open the address on your phone, sign up, and scan real climbs. Every account gets 5 free scans a month.

## 5. Take payments: Stripe (20 min)

Do this in **Test mode** first (the toggle at the top of the Stripe dashboard), so you can try it with fake cards.

1. Make an account at **stripe.com**.
2. **Product catalogue → Add product**: name it "Beta Lens Pro". Add two recurring prices: £3.99 monthly and £29.99 yearly. Copy each **Price ID** (they start `price_`) → `STRIPE_PRICE_MONTHLY` and `STRIPE_PRICE_YEARLY`.
3. **Developers → API keys**: copy the **Secret key** → `STRIPE_SECRET_KEY`.
4. **Developers → Webhooks → Add endpoint**:
   - URL: `https://YOUR-ADDRESS/api/stripe-webhook`
   - Events: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`
   - Copy the **Signing secret** → `STRIPE_WEBHOOK_SECRET`
5. **Settings → Billing → Customer portal**: switch it on, and allow people to cancel.
6. Add the four Stripe values in Vercel (**Settings → Environment Variables**), then **Deployments → ⋯ → Redeploy**.
7. Test it: tap **Go Pro** in the app and pay with card `4242 4242 4242 4242`, any future date, any CVC. You should come back to confetti and a **Pro** badge.

When you're ready for real money, switch Stripe to **Live mode**, repeat steps 2 to 4 there, and swap the live values into Vercel.

## 6. Install it on your phone

- **iPhone (Safari):** open your address → Share → **Add to Home Screen**.
- **Android (Chrome):** open your address → ⋮ → **Install app**.

It opens full screen with the Beta Lens icon, like any other app.

---

## Before you launch publicly

- **Your own domain:** buy one (e.g. betalens.app), add it in Vercel → Settings → Domains, then update the Supabase URLs and `APP_URL`.
- **Legal pages:** fill in the brackets in `privacy.html` and `terms.html`, and get them checked.
- **Name:** check nobody else is trading as or has trademarked "Beta Lens".
- **Prices:** the price labels shown in the app come from `PRICE_LABEL_MONTHLY` and `PRICE_LABEL_YEARLY`. Keep them in step with Stripe.
- **Limits:** change the free and Pro allowances with the `FREE_…` and `PRO_…` settings, then redeploy.

## Changing things later

Edit a file on GitHub (click the file, then the pencil icon) and commit. Vercel goes live with the change in about a minute. After design changes, bump `VERSION` at the top of `sw.js` so installed phones pick up the update.

## What's in the folder

| Path | What it is |
|---|---|
| `index.html`, `styles.css`, `js/` | The app people see |
| `js/engine.js` | Finds the holds of one colour in a photo and draws the beta |
| `shared/prompt.js` | The instructions sent to the AI coach |
| `api/` | The server: AI beta, coach questions, payments |
| `supabase/schema.sql` | Database tables and security rules |
| `manifest.webmanifest`, `sw.js`, `icons/` | Make it installable with an icon |
| `privacy.html`, `terms.html` | Templates to fill in |
