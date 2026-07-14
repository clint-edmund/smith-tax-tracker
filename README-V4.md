# Smith Enterprises Tax Tracker Version 4

Version 4 encrypts complete driver-license, routing, and account numbers with AES-GCM-256 in Supabase Edge Functions. Normal intake records store only last-four values. Full values are isolated in `walk_in_intake_sensitive`, cannot be queried by browser roles, and can be revealed only by administrator, office_manager, or senior_preparer. Every reveal requires a reason and is audited.

## Install
1. Back up code and database.
2. Copy files into VS Code, preserving `js/config.js`.
3. Run `database/v4-secure-sensitive-intake.sql`.
4. Follow `V4-EDGE-FUNCTION-DEPLOYMENT.md`.
5. Test only with fictional data.

Require MFA, a supervised kiosk, a written retention policy, and a protected backup of the encryption key. Do not copy revealed values into email, chat, screenshots, notes, or reports.
