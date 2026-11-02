# TaskPal (sample insecure app)

A deliberately vulnerable "vibe-coded" Next.js + Supabase app used to test Seaproof.
Every file here contains at least one planted problem. **Never deploy this.**

Secrets are double-underscore placeholders; `npm run sample:make` swaps in
freshly generated *fake* keys when it builds a real git repo for scanning.
