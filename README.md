# Smith Enterprises Tax Tracker v2

This package is a complete front-end replacement for the Smith Enterprises Tax Tracker proof of concept.

## Included pages

- `index.html` — employee login
- `dashboard.html` — operational dashboard
- `clients.html` — searchable client directory
- `client.html` — client profile, multiple returns, status history, and payments
- `reports.html` — balances, follow-ups, status, and revenue summaries
- `employees.html` — employee directory and preparer workload
- `import.html` — controlled CSV client import
- `settings.html` — application and session information

## Important: preserve your Supabase connection

This ZIP includes `js/config.example.js`, but it intentionally does not include a live `js/config.js`.

Keep your existing working `js/config.js`, or create it from the example:

```javascript
import { createClient } from
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL = "https://YOUR-PROJECT.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "YOUR-PUBLISHABLE-KEY";

export const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
);
```

Never place a Supabase service-role key, secret key, database password, or connection string in this project.

## Installation

1. Commit or back up your current project.
2. Extract this ZIP.
3. Copy the files and folders into the root of your VS Code repository.
4. Keep or restore your existing `js/config.js`.
5. Open Supabase SQL Editor.
6. Run `database/v2-migration.sql`.
7. Restart Live Server.
8. Open `index.html`.
9. Test with fictional records.
10. Push to GitHub after testing.

## Database assumptions

This project expects these existing tables:

- `profiles`
- `clients`
- `tax_returns`
- `status_history`
- `payments`

It also expects the RPC functions:

- `record_return_payment`
- `update_return_status`

The migration script adds:

- safer profile-directory access for active employees
- dashboard and reporting functions
- client import function
- useful indexes
- required grants and schema refresh

## Test checklist

- Login and logout
- Dashboard totals
- All-client search
- Add and edit a client
- Add multiple returns
- Assign a preparer
- Update return status
- Record a payment
- View status and payment history
- Run reports
- Import a small fictional CSV
- Verify a preparer cannot access administrator-only employee controls

## Production warning

This is still a workflow-tracking application. Do not store SSNs, bank account numbers, identity PINs, tax documents, driver-license images, or other taxpayer data until a production security review is completed.
