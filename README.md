# Hunter System v0.2 — Supabase-ready source

This is the next-stage source scaffold for the Solo Leveling-inspired real-life quest app.

## What's included
- A quieter, more anime-inspired dark system interface
- Supabase email/password login and account signup
- Supabase-backed profile and quest loading
- Private proof uploads (PNG/JPG/WEBP/PDF, up to 8 MB)
- Admin proof review UI, signed evidence download links, account CSV export, and daily section-event CSV
- 30 hidden rank classifications, progressively revealed
- Increasing XP requirement curve
- Standard XP cap design of 280 XP/day; dungeon quests are tracked separately
- SQL schema, row-level security, private Storage bucket, and transactional proof-review function

## Important: not production-ready without configuration and review
The project has no Supabase project credentials. You must create and configure your own Supabase project before login works.

### Setup
1. Install Node.js 20+.
2. Create a Supabase project.
3. Copy `.env.example` to `.env.local` and fill in the Project URL and anon/public key.
4. In Supabase SQL Editor, run `supabase/schema.sql`.
5. Create your account in the app.
6. In SQL Editor, promote your own profile to admin:
   `update public.profiles set is_admin=true where username='YOUR_USERNAME';`
7. Run locally:
   `npm install`
   `npm run dev`
8. Deploy to Vercel and add the same environment variables in Project Settings.

## Security review needed before a public launch
- Review RLS and column-level permissions carefully before launch. The schema grants client updates only to display_name; test that all privileged fields remain immutable from browser clients.
- Create a secure function for profile display-name changes rather than granting unrestricted profile updates.
- The daily report CSV exports section events recorded today; broader date-range filters and PDF report formatting are follow-up improvements.
- Admin proof review uses a database function, which must be tested in your Supabase project.
- Add email verification, rate limiting, moderation, backups, error monitoring, and deletion/export flows.
- Consider timezone handling for daily XP cap; the current SQL uses the database timezone day boundary.
- Configure Supabase Auth redirect URLs for localhost and your deployed domain.

## Evidence and fair-use notes
Evidence supports review but does not prove uninterrupted attention or absence of social media use. Use honest self-reporting and optional screen-time reports; do not require invasive surveillance. Do not upload sensitive personal documents.
