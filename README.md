# WE-estate

Project control for M Squared Developments. Every department enters its own work, and WE-estate shows where every project, phase, unit and contract stands. Payment certificates move between departments with a full history, and every department sees what is waiting on it and for how long.

Live at **weestate.app** (once deployed).

## What is in this first version

- Sign-in with work email and password (Supabase Auth). Microsoft 365 sign-in can be switched on later in Supabase.
- **Overview**: every project with progress against plan, SPI, CPI and overdue items, plus everything waiting on any department.
- **Payment certificate workflow**: Site → Technical office (QS) → Cost control → Project manager → Finance. Each step can send it on, return it to site with a comment, or reject it. Only the department that owns the step can act on it; the database enforces this.
- **Department queues** and **Waiting on me**, sorted overdue first, with "With Finance · 2 days" and "Overdue · 6 days" computed from due dates.
- **Project page**: phases with latest progress, units by status, contracts.
- **People and departments** (admins): give each person a department.
- Brand: WE-estate design system (Sora, IBM Plex Sans Arabic, IBM Plex Mono; blue `#1a3a8f`, bridge yellow `#f2c230`), light and dark mode, works on phones and installs as an app.

## Stack

- Next.js 16 (App Router) on Vercel
- Supabase: Postgres, Auth, row-level security
- No other services

## Set up

1. **Supabase**: create a project (region: Frankfurt). In the SQL editor, run `supabase/migrations/20261028000000_init.sql`, then `supabase/seed.sql` if you want the TRIO sample data.
2. **Environment**: copy `.env.example` to `.env.local` and fill in the project URL and publishable (or anon) key from Project Settings → API.
3. **First admin**: invite yourself from Authentication → Users, sign in once, then in the SQL editor run
   `update profiles set is_admin = true, department = 'pm' where email = 'you@example.com';`
4. **Run locally**: `npm install` then `npm run dev`.
5. **Deploy**: import the repo in Vercel, add the two environment variables, then add `weestate.app` under Settings → Domains and set the DNS records Vercel shows at your registrar. In Supabase, set Authentication → URL configuration → Site URL to `https://weestate.app`.

## How the workflow is enforced

Certificates only move through the `certificate_action()` database function. It checks that the signed-in person's department owns the current step, records the move in `workflow_events`, and updates the status. The steps, their departments and due days live in the `workflow_steps` table, so they can be changed without code.

## Next

Variation orders, purchase requests and unit handover on the same workflow engine; monthly progress entry; cash flow; Arabic interface; Microsoft 365 sign-in; email or WhatsApp alerts when something is waiting.
