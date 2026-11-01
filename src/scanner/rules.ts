import { createHash } from "node:crypto";
import type { Category, Finding, RawFinding, Severity } from "./types";

type Vars = Record<string, string>;
type Text = string | ((v: Vars) => string);

export interface Rule {
  id: string;
  category: Category;
  severity: Severity;
  title: Text;
  explanation: Text;
  why: Text;
  /** Concrete steps for the AI agent. The prompt wrapper adds location + guard rails. */
  fix: Text;
}

const render = (t: Text, v: Vars) => (typeof t === "function" ? t(v) : t).replace(/\{(\w+)\}/g, (_, k) => v[k] ?? "");

const where = (v: Vars) => (v.file ? `\`${v.file}\`${v.line ? ` (around line ${v.line})` : ""}` : "my project");

/** Wrap rule-specific steps into a copy-paste prompt for Lovable / Bolt / Cursor / Replit. */
export function buildFixPrompt(problem: string, steps: string, v: Vars): string {
  return [
    `Fix a security problem in my app.`,
    ``,
    `Where: ${where(v)}`,
    `Problem: ${problem}`,
    ``,
    `Please:`,
    steps.trim(),
    ``,
    `Keep the app working the same for normal users and don't change unrelated code. When you're done, list the files you changed and tell me how to check that the problem is gone.`,
  ].join("\n");
}

const R = (r: Rule) => r;

export const RULES: Record<string, Rule> = Object.fromEntries(
  [
    // ───────────── Secrets ─────────────
    R({
      id: "secrets.committed-secret", category: "secrets", severity: "critical",
      title: (v) => `A secret key is saved in your code (${v.kind || "API key"})`,
      explanation: (v) => `We found what looks like a real ${v.kind || "secret key"} written directly in ${where(v)}. Anyone who can see your code (or your app's files) can copy it.`,
      why: "Secret keys work like passwords for your paid services and data. With this key, a stranger could run up your bills, read customer data, or act as your app.",
      fix: (v) => `1. Revoke/rotate this ${v.kind || "key"} in the provider's dashboard right now — assume it is already leaked.\n2. Remove the hard-coded value from ${where(v)} and read it from an environment variable instead (for example \`process.env.${v.envName || "MY_SECRET_KEY"}\`), used only in server-side code.\n3. Add the new key to my hosting provider's environment variables, not to any file in the repo.\n4. Make sure \`.env\` files are listed in \`.gitignore\`.`,
    }),
    R({
      id: "secrets.test-secret", category: "secrets", severity: "high",
      title: (v) => `A test-mode secret key is saved in your code (${v.kind || "API key"})`,
      explanation: (v) => `${where(v)} contains a ${v.kind || "secret key"} that looks like a test/sandbox key.`,
      why: "Test keys can't move real money, but they often still unlock your account's data and settings, and the same habit usually leaks the live key next.",
      fix: (v) => `1. Rotate this ${v.kind || "key"} in the provider's dashboard.\n2. Move it out of the code into an environment variable read only on the server.\n3. Make sure \`.env\` files are in \`.gitignore\`.`,
    }),
    R({
      id: "secrets.history-secret", category: "secrets", severity: "high",
      title: (v) => `An old version of your code still contains a secret (${v.kind || "API key"})`,
      explanation: (v) => `A ${v.kind || "secret key"} was committed in the past to \`${v.file || "a file"}\` (commit ${v.commit || "in history"}). It was removed later, but Git keeps every old version.`,
      why: "Deleting a key from the latest code doesn't remove it from Git history. Anyone who can view the repo can still find it in older commits.",
      fix: (v) => `1. Rotate/revoke this ${v.kind || "key"} in the provider's dashboard — that is the only real fix once a key has been committed.\n2. Confirm the current code reads it from an environment variable on the server.\n3. (Optional) Ask me before rewriting Git history; rotating the key is enough.`,
    }),
    R({
      id: "secrets.env-file-committed", category: "secrets", severity: "high",
      title: (v) => `Your settings file \`${v.file}\` is saved in the repo`,
      explanation: (v) => `The file \`${v.file}\` usually holds passwords and API keys, and it is committed to your repository.`,
      why: "Anyone with access to the repo (or anyone at all, if it's public) can read every value in this file.",
      fix: (v) => `1. Delete \`${v.file}\` from the repository (keep a copy locally) and add \`.env*\` to \`.gitignore\` (keep \`!.env.example\`).\n2. Create a \`.env.example\` with the same variable names but empty values.\n3. Rotate every secret that was in \`${v.file}\`, then put the new values in my hosting provider's environment settings.`,
    }),
    R({
      id: "secrets.env-not-gitignored", category: "secrets", severity: "medium",
      title: "Your secrets file isn't protected from being uploaded",
      explanation: "Your `.gitignore` file doesn't exclude `.env` files, so the next time you or your AI tool saves keys there they will be pushed to GitHub.",
      why: "Most leaked keys happen by accident like this. One line in `.gitignore` prevents it.",
      fix: "1. Add these lines to `.gitignore`:\n```\n.env*\n!.env.example\n```\n2. If any `.env` file is already committed, remove it from Git (keep it locally) and rotate the keys inside it.",
    }),
    R({
      id: "secrets.public-env-secret", category: "secrets", severity: "critical",
      title: (v) => `A secret is marked as public: \`${v.name}\``,
      explanation: (v) => `The setting \`${v.name}\` starts with a "public" prefix (like \`NEXT_PUBLIC_\` or \`VITE_\`). That tells your framework to copy its value into the website that every visitor downloads.`,
      why: "Anything with a public prefix ends up in your site's JavaScript. If it's an admin key or secret, anyone can open their browser's developer tools and take it.",
      fix: (v) => `1. Rename \`${v.name}\` so it has no public prefix (for example \`${v.suggested || "SECRET_KEY"}\`) everywhere it's used.\n2. Only use it in server-side code (API routes, server actions, edge functions) — never in components that run in the browser.\n3. Rotate the key, because it has probably already been shipped to browsers.`,
    }),

    // ───────────── Database ─────────────
    R({
      id: "db.rls-disabled", category: "database", severity: "critical",
      title: (v) => `Anyone can read and change your "${v.table}" table`,
      explanation: (v) => `The table \`${v.table}\` is created in ${where(v)} but Row Level Security (Supabase's per-user access rules) is never turned on for it.`,
      why: "Supabase tables are reachable straight from the internet using your public key. Without Row Level Security, any visitor can download, edit or delete every row.",
      fix: (v) => `1. Create a new Supabase migration that runs \`alter table public.${v.table} enable row level security;\`.\n2. Add policies so each user can only see and change their own rows, e.g. \`using (auth.uid() = user_id)\` and \`with check (auth.uid() = user_id)\` (adjust the column name to match my schema).\n3. Check every place the app reads \`${v.table}\` still works for a logged-in user.`,
    }),
    R({
      id: "db.open-policy", category: "database", severity: "high",
      title: (v) => `Your "${v.table}" table lets anyone ${v.action || "change data"}`,
      explanation: (v) => `A security rule on \`${v.table}\` in ${where(v)} is set to \`true\`, which means "allow everybody".`,
      why: "This rule technically turns on Row Level Security but then lets every visitor through, so it gives no protection.",
      fix: (v) => `1. Replace the \`using (true)\` / \`with check (true)\` policy on \`${v.table}\` with rules tied to the logged-in user, e.g. \`auth.uid() = user_id\`.\n2. If some rows must be public, allow only \`select\` on those rows and keep insert/update/delete restricted to the owner.\n3. Write it as a new migration file.`,
    }),
    R({
      id: "db.open-read-policy", category: "database", severity: "medium",
      title: (v) => `Everyone can read every row in your "${v.table}" table`,
      explanation: (v) => `A read rule on \`${v.table}\` in ${where(v)} is \`using (true)\`, so all rows are public.`,
      why: "That's fine for truly public content (like blog posts), but a common source of leaks when the table also holds emails, phone numbers or private notes.",
      fix: (v) => `1. Decide whether all of \`${v.table}\` is meant to be public.\n2. If not, change the select policy to only return the user's own rows (\`auth.uid() = user_id\`) or only rows marked public.\n3. Move any private columns to a separate table with stricter rules.`,
    }),
    R({
      id: "db.service-role-in-client", category: "database", severity: "critical",
      title: "Your database admin key is used inside the website",
      explanation: (v) => `${where(v)} runs in the visitor's browser and creates a Supabase client with the service-role (admin) key.`,
      why: "The service-role key skips every security rule. Shipping it to browsers gives every visitor full admin access to your whole database.",
      fix: () => `1. Remove the service-role key from this browser file and use the public anon key with the logged-in user's session instead.\n2. If an admin action is truly needed, move it to a server-only API route or server action that first checks the user is an admin.\n3. Rotate the service-role key in Supabase (Settings → API) because it has been exposed.`,
    }),
    R({
      id: "db.firebase-open-rules", category: "database", severity: "critical",
      title: (v) => (v.mode === "test" ? "Your Firebase database is still in \"test mode\"" : "Your Firebase rules let anyone read and write"),
      explanation: (v) => (v.mode === "test"
        ? `${where(v)} uses Firebase's temporary test-mode rule (open to everyone until a date). Until then anyone can read and write all data; afterwards your app stops working.`
        : `${where(v)} allows reads and writes for everybody.`),
      why: "Anyone who finds your Firebase project ID (it's in your website's code) can download, change or wipe your entire database.",
      fix: () => `1. Replace the open rules with rules that require \`request.auth != null\` and check ownership, e.g. \`allow read, write: if request.auth != null && request.auth.uid == resource.data.userId;\`.\n2. Write separate rules for each collection instead of one \`/{document=**}\` rule.\n3. Test with the Firebase Rules Playground that a logged-out user is denied.`,
    }),
    R({
      id: "db.firebase-service-account", category: "database", severity: "critical",
      title: "A Firebase/Google admin credentials file is in your repo",
      explanation: (v) => `${where(v)} is a Google service-account file. It contains a private key with full admin access.`,
      why: "This file lets anyone bypass all Firebase security rules and control your project.",
      fix: () => `1. Delete this key in Google Cloud Console → IAM → Service Accounts → Keys, and create a new one.\n2. Remove the file from the repo and add it to \`.gitignore\`.\n3. Load the new credentials from an environment variable on the server only.`,
    }),

    // ───────────── Auth ─────────────
    R({
      id: "auth.unprotected-route", category: "auth", severity: "high",
      title: (v) => `Anyone can use your ${v.admin === "1" ? "admin " : ""}API "${v.route}" without logging in`,
      explanation: (v) => `The endpoint \`${v.route}\` (${v.methods}) in ${where(v)} ${v.admin === "1" ? "does admin-level work" : "reads or changes data"} but never checks who is calling it.`,
      why: "Anyone on the internet can call this address directly — no login screen, no button needed. Hiding the button in your UI doesn't protect the endpoint.",
      fix: (v) => `1. At the very top of each handler in ${where(v)}, get the current user from the session (using the auth library this project already uses) and return a 401 error if there is none.\n${v.admin === "1" ? "2. Also check that the user is an admin (e.g. an `is_admin` flag stored on the server) and return 403 if not.\n3" : "2"}. Make sure any database query uses the logged-in user's id, not an id sent by the browser.`,
    }),
    R({
      id: "auth.server-action-no-auth", category: "auth", severity: "high",
      title: (v) => `Your server action "${v.fn}" doesn't check who is calling it`,
      explanation: (v) => `\`${v.fn}\` in ${where(v)} is a server action that changes data, but it never checks for a logged-in user.`,
      why: "Server actions are public endpoints under the hood. Anyone can call them with any input, even if the button that uses them is only shown to logged-in users.",
      fix: (v) => `1. At the start of \`${v.fn}\`, load the current user from the session and throw/return an error if nobody is logged in.\n2. Make sure the action only touches rows owned by that user (add a \`user_id = currentUser.id\` condition).\n3. Validate the inputs (for example with zod).`,
    }),
    R({
      id: "auth.idor", category: "auth", severity: "high",
      title: (v) => `Logged-in users can see other people's ${v.thing || "data"} by changing an ID`,
      explanation: (v) => `${where(v)} loads a record using an ID from the URL or request (\`${v.param || "id"}\`) but doesn't check that the record belongs to the logged-in user.`,
      why: "A user can simply change the number or ID in the address (e.g. /invoices/123 → /invoices/124) to read someone else's private data. This is one of the most common real-world leaks.",
      fix: (v) => `1. In ${where(v)}, add an ownership condition to the query, e.g. \`.eq("user_id", user.id)\` or \`where: { id, userId: session.user.id }\`.\n2. Return 404 when the record isn't found for this user.\n3. If this uses an admin/service-role database client, switch to a client scoped to the logged-in user so Row Level Security also protects it.`,
    }),
    R({
      id: "auth.webhook-unverified", category: "auth", severity: "high",
      title: "Your payment webhook trusts anyone who calls it",
      explanation: (v) => `${where(v)} handles webhook events (like "payment completed") but never verifies the provider's signature.`,
      why: "Anyone can send a fake \"payment succeeded\" message to this address and unlock paid features for free, or trigger actions in your app.",
      fix: () => `1. Read the raw request body with \`await req.text()\`.\n2. Verify it with the provider's library, e.g. \`stripe.webhooks.constructEvent(body, req.headers.get("stripe-signature"), process.env.STRIPE_WEBHOOK_SECRET)\`.\n3. Return 400 if verification fails, and only then process the event.`,
    }),

    // ───────────── Input handling ─────────────
    R({
      id: "input.sql-injection", category: "input", severity: "critical",
      title: "Visitors can run their own database commands",
      explanation: (v) => `${where(v)} builds a database query by pasting user input straight into the SQL text.`,
      why: "An attacker can type special characters into a search box or URL to read, change or delete any data in your database (\"SQL injection\").",
      fix: () => `1. Rewrite the query to use parameters instead of string building, e.g. \`pool.query("select * from products where name ilike $1", ["%" + q + "%"])\`.\n2. Do the same for any other query in this file that uses template strings or \`+\`.\n3. Validate the input (type and length) before using it.`,
    }),
    R({
      id: "input.nosql-injection", category: "input", severity: "high",
      title: "Visitors can trick your database search",
      explanation: (v) => `${where(v)} passes the raw request body or query straight into a MongoDB query.`,
      why: "Attackers can send special objects like `{\"$ne\": null}` instead of a password and log in as anyone (\"NoSQL injection\").",
      fix: () => `1. Pick out only the fields you expect and make sure they are plain strings (e.g. validate with zod: \`z.object({ email: z.string().email(), password: z.string() })\`).\n2. Never pass \`req.body\` or \`req.query\` directly into \`find\`/\`findOne\`/\`update\`.\n3. For logins, look up the user by email only and compare the password hash in code.`,
    }),
    R({
      id: "input.command-injection", category: "input", severity: "critical",
      title: "Visitors can run commands on your server",
      explanation: (v) => `${where(v)} runs a system command that includes text from the request.`,
      why: "An attacker can add `; rm -rf /` or similar to the input and take over your server.",
      fix: () => `1. Replace \`exec\` with \`execFile\`/\`spawn\` and pass arguments as an array, never as one string.\n2. Only accept known-safe values (e.g. a file id that you look up), and reject anything with slashes or special characters.\n3. Better: use a library function instead of a shell command.`,
    }),
    R({
      id: "input.code-eval", category: "input", severity: "high",
      title: "Your app runs text as code",
      explanation: (v) => `${where(v)} uses \`eval\` or \`new Function\` on data that may come from users.`,
      why: "If an attacker controls that text, they can run any code inside your app.",
      fix: () => `1. Remove \`eval\` / \`new Function\`.\n2. If you are parsing data, use \`JSON.parse\`. If you need formulas or templates, use a safe purpose-built library.`,
    }),
    R({
      id: "input.xss", category: "input", severity: "high",
      title: "Users can inject code into your pages",
      explanation: (v) => `${where(v)} inserts HTML into the page without cleaning it first.`,
      why: "If any of that HTML comes from users (comments, profiles, AI output), an attacker can add a script that steals other users' sessions (\"cross-site scripting\").",
      fix: () => `1. If the content doesn't need formatting, render it as plain text (e.g. \`{comment.body}\`) instead of using \`dangerouslySetInnerHTML\` / \`innerHTML\`.\n2. If formatting is needed, sanitize first: \`import DOMPurify from "dompurify"\` and use \`DOMPurify.sanitize(html)\`.\n3. Check other places in the app that render user content the same way.`,
    }),
    R({
      id: "input.unvalidated-upload", category: "input", severity: "medium",
      title: "File uploads aren't checked",
      explanation: (v) => `${where(v)} accepts uploaded files without checking their type or size${v.userName === "1" ? ", and uses the uploader's file name as-is" : ""}.`,
      why: "People can upload huge files to run up your storage bill, upload HTML/JS files that run as your website, or overwrite other users' files by reusing a name.",
      fix: () => `1. Allow only the file types you need (e.g. \`image/png\`, \`image/jpeg\`) and check \`file.type\` on the server.\n2. Reject files over a sensible size (e.g. 5 MB) using \`file.size\`.\n3. Generate the stored file name yourself (e.g. \`\${user.id}/\${crypto.randomUUID()}.png\`) instead of using the uploaded name.`,
    }),
    R({
      id: "input.ssrf", category: "input", severity: "medium",
      title: "Your server fetches any web address a visitor gives it",
      explanation: (v) => `${where(v)} makes a server-side request to a URL taken from the request.`,
      why: "Attackers can make your server call internal addresses (like cloud metadata services) and leak credentials (\"SSRF\").",
      fix: () => `1. Only allow specific domains (an allow-list) and \`https:\` URLs.\n2. Block private and internal IP addresses after resolving the hostname.\n3. Don't return the fetched response body directly to the user.`,
    }),

    // ───────────── Dependencies ─────────────
    R({
      id: "deps.vulnerable", category: "dependencies", severity: "high",
      title: (v) => `The package "${v.pkg}" (version ${v.version}) has known security holes`,
      explanation: (v) => `Your app uses ${v.pkg}@${v.version}${v.direct === "1" ? "" : " (pulled in by another package)"}, which has ${v.count} published security advisor${v.count === "1" ? "y" : "ies"}${v.summary ? `, for example: "${v.summary}"` : ""}.`,
      why: "Attackers scan the internet for apps using versions with known holes, because the instructions to exploit them are public.",
      fix: (v) => (v.direct === "1"
        ? `1. Upgrade \`${v.pkg}\` to ${v.fixed ? `version ${v.fixed} or newer` : "the latest version"} in package.json and update the lockfile.\n2. Read the changelog for breaking changes and fix anything that breaks.\n3. Run the app and its tests to make sure everything still works.`
        : `1. \`${v.pkg}\` is installed by another package. Run \`npm audit fix\` (or update the parent package) so that \`${v.pkg}\` resolves to ${v.fixed ? `${v.fixed} or newer` : "a patched version"}.\n2. If that doesn't work, add an \`overrides\` entry in package.json for \`${v.pkg}\`.\n3. Run the app and its tests.`),
    }),
    R({
      id: "deps.no-lockfile", category: "dependencies", severity: "low",
      title: "Your package versions aren't locked",
      explanation: "There's a package.json but no lockfile (package-lock.json, pnpm-lock.yaml, yarn.lock or bun.lock), so every install can pull different versions.",
      why: "Without a lockfile, your live app may silently get a different (possibly compromised or broken) version than the one you tested.",
      fix: () => `1. Run \`npm install\` (or your package manager's install) and commit the generated lockfile.\n2. Use \`npm ci\` in your deployment so it installs exactly what's in the lockfile.`,
    }),

    // ───────────── Live site ─────────────
    R({
      id: "live.no-https", category: "live_site", severity: "critical",
      title: "Your site doesn't use a secure connection (HTTPS)",
      explanation: (v) => `We couldn't load ${v.url} over HTTPS.`,
      why: "Without HTTPS, passwords and data travel in plain text and can be read or changed by anyone on the same Wi-Fi.",
      fix: () => `1. Turn on HTTPS for my domain in my hosting provider (Vercel, Netlify, Replit, Cloudflare and others do this for free).\n2. Redirect all http:// traffic to https://.`,
    }),
    R({
      id: "live.https-not-enforced", category: "live_site", severity: "high",
      title: "Visitors can still reach the insecure (http://) version of your site",
      explanation: (v) => `${v.url} works over plain http:// without redirecting to https://.`,
      why: "Anyone who types your address without https:// (or follows an old link) gets an unprotected connection.",
      fix: () => `1. Enable "force HTTPS" / "redirect HTTP to HTTPS" in my hosting provider.\n2. Add the header \`Strict-Transport-Security: max-age=63072000; includeSubDomains\` so browsers always use HTTPS.`,
    }),
    R({
      id: "live.missing-headers", category: "live_site", severity: "medium",
      title: "Your site is missing standard browser protections",
      explanation: (v) => `Your site doesn't send these security headers: ${v.list}.`,
      why: "These headers tell browsers to block common attacks such as clickjacking, script injection and downgrade attacks. They take minutes to add.",
      fix: (v) => `1. Add these response headers to every page: ${v.list}.\n2. For Next.js, add them in \`next.config\` via \`async headers()\`; for Vercel/Netlify you can also use \`vercel.json\` / \`_headers\`.\n3. Start the Content-Security-Policy in report-only mode if you're unsure, then tighten it.\nSuggested values:\n- Strict-Transport-Security: max-age=63072000; includeSubDomains\n- Content-Security-Policy: default-src 'self'; frame-ancestors 'none'\n- X-Content-Type-Options: nosniff\n- Referrer-Policy: strict-origin-when-cross-origin\n- X-Frame-Options: DENY`,
    }),
    R({
      id: "live.source-maps", category: "live_site", severity: "medium",
      title: "Your site publishes its original source code",
      explanation: (v) => `Source map files (like \`${v.path}\`) are publicly downloadable from your live site.`,
      why: "Source maps let anyone rebuild your original, readable code — making it far easier to find weaknesses or copy your app.",
      fix: () => `1. Turn off public source maps in production (Next.js: \`productionBrowserSourceMaps: false\`; Vite: \`build.sourcemap: false\` or \`"hidden"\`).\n2. If you need them for error tracking, upload them privately to your error tracker instead of serving them.`,
    }),
    R({
      id: "live.cors-reflect", category: "live_site", severity: "high",
      title: "Any website can make logged-in requests to your API",
      explanation: (v) => `${v.url} echoes back any website's address in \`Access-Control-Allow-Origin\` and allows credentials.`,
      why: "A malicious site could quietly use your visitors' logged-in sessions to read their data from your API.",
      fix: () => `1. Replace the "allow any origin" CORS setting with an allow-list of your own domains.\n2. Only send \`Access-Control-Allow-Credentials: true\` for those domains.`,
    }),
    R({
      id: "live.cors-wildcard", category: "live_site", severity: "low",
      title: "Your API can be called from any website",
      explanation: (v) => `${v.url} responds with \`Access-Control-Allow-Origin: *\`.`,
      why: "That's fine for public data, but if this endpoint returns anything private, other websites can read it.",
      fix: () => `1. If the API isn't meant to be public, restrict \`Access-Control-Allow-Origin\` to your own domain.`,
    }),
    R({
      id: "live.exposed-path", category: "live_site", severity: "high",
      title: (v) => `A private page is publicly reachable: ${v.path}`,
      explanation: (v) => `${v.url} is reachable without logging in and looks like ${v.what}.`,
      why: "Admin pages, debug tools and config files are prime targets. If they're reachable, attackers will find them with automated scanners within hours.",
      fix: (v) => `1. Remove \`${v.path}\` from the production site, or put it behind a login that checks for an admin user on the server.\n2. If it's a file like .env or .git, make sure it isn't in your public/static folder and rotate any secrets it contained.`,
    }),
    R({
      id: "live.secret-in-bundle", category: "live_site", severity: "critical",
      title: (v) => `Your live website gives away a secret key (${v.kind || "API key"})`,
      explanation: (v) => `The JavaScript your site sends to every visitor (\`${v.path}\`) contains a ${v.kind || "secret key"}.`,
      why: "Anyone can open their browser's developer tools and copy this key — no hacking required.",
      fix: (v) => `1. Rotate this ${v.kind || "key"} immediately.\n2. Find where the code uses it and move that logic into a server-side API route or edge function.\n3. Make sure the environment variable no longer has a public prefix like \`NEXT_PUBLIC_\` or \`VITE_\`.`,
    }),

    // ───────────── Production basics ─────────────
    R({
      id: "prod.no-error-handling", category: "production", severity: "medium",
      title: (v) => `"${v.route}" will crash with an ugly error if something goes wrong`,
      explanation: (v) => `${where(v)} calls the database or another service but never handles the case where that call fails.`,
      why: "When a request fails, users see a broken page or raw error text (sometimes including internal details), and you won't know why it happened.",
      fix: (v) => `1. Wrap the handler body in \`${v.route}\` in try/catch.\n2. On error, log the details on the server and return a friendly message with the right status code (e.g. 500) — never the raw error.\n3. Also check the \`error\` value returned by Supabase calls.`,
    }),
    R({
      id: "prod.no-rate-limit-auth", category: "production", severity: "high",
      title: (v) => `Nothing stops someone guessing passwords on "${v.route}"`,
      explanation: (v) => `${where(v)} handles logins or sign-ups but has no limit on how many attempts one person can make.`,
      why: "Bots can try thousands of passwords per minute until one works, or spam sign-ups and password-reset emails.",
      fix: (v) => `1. Add rate limiting to \`${v.route}\`, e.g. with \`@upstash/ratelimit\` keyed by IP address and email (about 5–10 attempts per minute).\n2. Return status 429 with a friendly "Too many attempts, try again soon" message.\n3. Consider using your auth provider's built-in login (Supabase Auth, Clerk, Auth.js), which already rate-limits.`,
    }),
    R({
      id: "prod.no-rate-limit-payment", category: "production", severity: "medium",
      title: (v) => `Your payment endpoint "${v.route}" has no rate limit`,
      explanation: (v) => `${where(v)} creates payments or checkout sessions with no limit on how often it can be called.`,
      why: "Fraudsters use unprotected payment endpoints to test stolen cards in bulk, which can get your Stripe account frozen.",
      fix: (v) => `1. Add rate limiting to \`${v.route}\` keyed by user and IP (e.g. \`@upstash/ratelimit\`, a few requests per minute).\n2. Require a logged-in user before creating a checkout session.\n3. Turn on Stripe Radar rules for card testing.`,
    }),
    R({
      id: "prod.no-migrations", category: "production", severity: "medium",
      title: "Your database structure isn't saved in the code",
      explanation: (v) => `This app uses ${v.db || "a database"} but we couldn't find any migration files describing its tables and security rules.`,
      why: "Without migrations you can't rebuild the database after a mistake, review its security rules, or safely make changes. It also means we couldn't verify your access rules.",
      fix: (v) => `1. Export the current database schema into migration files (Supabase: \`supabase db pull\`; Prisma: \`prisma migrate dev\`; Drizzle: \`drizzle-kit generate\`).\n2. Commit them to the repo and use them for every future change to ${v.db || "the database"}.`,
    }),
    R({
      id: "prod.no-backups", category: "production", severity: "low",
      title: "We couldn't find a backup plan for your data",
      explanation: "Nothing in the repo mentions database backups (no backup script, no backup docs, no point-in-time recovery note).",
      why: "One bad command or bug can delete your users' data. Without tested backups, it's gone for good.",
      fix: () => `1. Turn on automatic daily backups in my database provider (Supabase Pro includes daily backups and optional point-in-time recovery).\n2. Add a short "Backups" section to README.md saying where backups live and how to restore one.\n3. Do a test restore once.`,
    }),
  ].map((r) => [r.id, r]),
);

const MAX_LEN = { title: 140, text: 1200, fix: 3000 };

export function fingerprintOf(parts: (string | number | undefined)[]): string {
  return createHash("sha256").update(parts.map((p) => String(p ?? "")).join("\u0000")).digest("hex").slice(0, 24);
}

/** Turn a raw finding into a complete, plain-English finding. */
export function enrich(raw: RawFinding): Finding {
  const rule = RULES[raw.ruleId];
  if (!rule) throw new Error(`Unknown rule ${raw.ruleId}`);
  const v: Vars = { ...(raw.vars || {}), file: raw.file || raw.vars?.file || "", line: raw.line ? String(raw.line) : "" };
  const explanation = render(rule.explanation, v);
  return {
    ruleId: rule.id,
    category: rule.category,
    severity: raw.severity || rule.severity,
    title: render(rule.title, v).slice(0, MAX_LEN.title),
    explanation: explanation.slice(0, MAX_LEN.text),
    whyItMatters: render(rule.why, v).slice(0, MAX_LEN.text),
    fixPrompt: buildFixPrompt(explanation, render(rule.fix, v), v).slice(0, MAX_LEN.fix),
    file: raw.file,
    line: raw.line,
    source: raw.source,
    evidence: raw.evidence,
    fingerprint: fingerprintOf([rule.id, raw.file, raw.key ?? raw.line, raw.vars?.table, raw.vars?.pkg, raw.vars?.path]),
  };
}

/** Collapse exact duplicates (same fingerprint), keeping the most severe. */
export function dedupe(findings: Finding[]): Finding[] {
  const order: Severity[] = ["critical", "high", "medium", "low"];
  const map = new Map<string, Finding>();
  for (const f of findings) {
    const prev = map.get(f.fingerprint);
    if (!prev || order.indexOf(f.severity) < order.indexOf(prev.severity)) map.set(f.fingerprint, f);
  }
  return [...map.values()];
}
