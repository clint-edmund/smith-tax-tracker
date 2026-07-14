# Version 4 Edge Function Deployment

1. In the VS Code terminal, run `supabase login` and `supabase link --project-ref YOUR_PROJECT_REFERENCE`.
2. Generate a key: `python -c "import secrets,base64; print(base64.b64encode(secrets.token_bytes(32)).decode())"`
3. Generate a salt: `python -c "import secrets; print(secrets.token_urlsafe(48))"`
4. Set secrets:

```bash
supabase secrets set INTAKE_ENCRYPTION_KEY="BASE64_KEY" INTAKE_ENCRYPTION_KEY_VERSION="v1" INTAKE_RATE_LIMIT_SALT="RANDOM_SALT" INTAKE_SENSITIVE_RETENTION_DAYS="90"
```

5. Deploy:

```bash
supabase functions deploy submit-sensitive-intake --no-verify-jwt
supabase functions deploy reveal-sensitive-intake --no-verify-jwt
```

The reveal function validates the signed-in employee token and permits only administrator, office_manager, and senior_preparer.
