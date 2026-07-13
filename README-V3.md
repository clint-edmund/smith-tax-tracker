# Smith Enterprises Tax Tracker Version 3

Version 3 adds a secure walk-in check-in workflow to Version 2.1.

## New pages

- `check-in.html` — public kiosk intake form
- `intakes.html` — employee intake queue
- `intake-review.html` — staff review, matching, and client creation

## New JavaScript

- `js/check-in.js`
- `js/intakes.js`
- `js/intake-review.js`

## New database migration

- `database/v3-walk-in-intake-migration.sql`

## New Supabase Edge Function

- `supabase/functions/submit-walk-in-intake/index.ts`

## Security design

Version 3 intentionally does not store:

- full driver’s-license numbers
- full bank routing numbers
- full checking or savings account numbers

It stores only the last four characters/digits and verification flags.
Staff should verify and enter complete banking information directly in the
authorized tax-preparation software.

## Installation order

1. Commit or back up the current VS Code project.
2. Extract this ZIP.
3. Copy the files into the existing project.
4. Preserve the working `js/config.js`.
5. Run:
   - `database/v2-migration.sql` if not already run
   - `database/v2_1-role-permissions.sql` if not already run
   - `database/v3-walk-in-intake-migration.sql`
6. Install and authenticate the Supabase CLI.
7. Link the local folder to the Supabase project.
8. Deploy the Edge Function:

```bash
supabase functions deploy submit-walk-in-intake --no-verify-jwt
```

9. Set a long random rate-limit salt:

```bash
supabase secrets set INTAKE_RATE_LIMIT_SALT="replace-with-a-long-random-value"
```

10. Restart Live Server and hard-refresh the browser.
11. Test with fictional information only.
12. Push the files to GitHub after successful testing.

## Opening the kiosk

Local:

```text
http://127.0.0.1:5500/check-in.html
```

GitHub Pages:

```text
https://YOUR-USERNAME.github.io/YOUR-REPOSITORY/check-in.html
```

Use a dedicated tablet or kiosk browser profile. Disable saved passwords,
autofill, browsing history synchronization, and browser account sign-in.

## Workflow

1. Walk-in submits `check-in.html`.
2. Edge Function validates and inserts a pending intake.
3. Staff opens `intakes.html`.
4. Staff reviews the intake.
5. Staff searches for a possible existing client.
6. Staff either:
   - matches the existing client, or
   - creates a new client
7. Contact and address information can be copied to the client master record.
8. The intake audit history records every staff action.
9. Staff completes the intake.

## Client matching

Email and phone are search aids only. The system never automatically merges
records because families may share contact information and typos may occur.

## Role access

All active employee roles may view the intake queue.

These roles can match or create clients:

- administrator
- office_manager
- senior_preparer
- preparer
- receptionist

Bookkeepers can review banking verification and complete intake workflow, but
cannot create a client through the Version 3 processing function.

## Required testing

- Anonymous visitors cannot query `walk_in_intakes`
- Kiosk submission succeeds through the Edge Function
- Confirmation page displays only the confirmation code
- Staff can view the intake queue
- Search finds possible clients
- Match existing client works
- Create new client works
- Update existing contact/address works only when selected
- Intake history records every action
- Read-only users cannot process an intake
- Bank and license fields contain only last-four values


> Version 3.1 users should follow README-V3.1.md. Edge Function deployment is no longer required.
