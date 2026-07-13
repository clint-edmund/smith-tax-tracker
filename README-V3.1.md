# Smith Enterprises Tax Tracker Version 3.1

Version 3.1 removes the Supabase Edge Function requirement.

The public walk-in form submits directly from GitHub Pages or Live Server
to the `walk_in_intakes` table using the browser-safe Supabase publishable
key already stored in `js/config.js`.

## What changed from Version 3

Removed:

- Supabase CLI requirement
- Edge Function deployment
- `supabase functions deploy`
- Edge Function secrets
- service-role processing for public submissions

Added:

- anonymous insert-only RLS policy
- no anonymous read, update, or delete access
- server-side PostgreSQL validation through table constraints and RLS
- hidden honeypot field for basic bot filtering
- 15-second client-side repeat-submission delay
- confirmation-code generation in the browser

## Security limitation

Direct anonymous inserts are simpler, but they do not provide strong
server-side rate limiting or CAPTCHA validation.

This design is appropriate for a controlled in-office kiosk or tablet.
It is not recommended for a broadly advertised public internet form.

For the kiosk:

- use a dedicated browser profile
- disable autofill and password saving
- sign the browser out of personal accounts
- clear the form after each submission
- do not use full driver’s-license or bank-account numbers
- keep the kiosk physically supervised

## Installation

1. Commit or back up your existing VS Code project.
2. Extract the Version 3.1 ZIP.
3. Copy the files into your project.
4. Preserve your working `js/config.js`.
5. Run the following SQL files in order if they have not already been run:

```text
database/v2_1-role-permissions.sql
database/v3-walk-in-intake-migration.sql
database/v3_1-direct-intake-submission.sql
```

6. Restart Live Server.
7. Open:

```text
http://127.0.0.1:5500/check-in.html
```

8. Submit a fictional check-in.
9. Sign into the employee application.
10. Open `intakes.html`.
11. Verify the submitted record appears.
12. Match it to an existing client or create a new client.

## No terminal deployment is required

You do not need to run:

```text
supabase functions deploy
supabase secrets set
```

## Expected anonymous permissions

Anonymous visitors can:

- insert one new Submitted intake record

Anonymous visitors cannot:

- list intake records
- retrieve a submitted record
- update a submitted record
- delete a submitted record
- view intake history
- access employee pages

## Important data limitation

Version 3.1 stores only:

- driver’s-license last four characters
- routing-number last four digits
- account-number last four digits
- verification status

Complete identifiers should be verified and entered directly in the
authorized tax-preparation system.
