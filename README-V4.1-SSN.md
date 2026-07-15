# Version 4.1 SSN Patch

This patch adds encrypted Social Security number collection to Version 4.

## Files to replace

- `check-in.html`
- `js/check-in.js`
- `intake-review.html`
- `js/intake-review.js`
- `supabase/functions/submit-sensitive-intake/index.ts`
- `supabase/functions/reveal-sensitive-intake/index.ts`

## SQL to run

Run:

```text
database/v4_1-add-encrypted-ssn.sql
```

## Deploy

```bash
supabase functions deploy submit-sensitive-intake --no-verify-jwt
supabase functions deploy reveal-sensitive-intake --no-verify-jwt
```

## What is stored

Normal intake table:

- SSN last four only

Restricted sensitive table:

- encrypted full SSN
- separate IV
- key version
- retention date

## Reveal access

Full SSN is available only through the reveal Edge Function to:

- administrator
- office_manager
- senior_preparer

Every reveal is added to `walk_in_sensitive_access_log`, and
`social_security_number` is included in the `fields_revealed` array.

Do not place full SSNs in ordinary client tables, reports, exports, notes,
browser storage, URLs, or logs.
