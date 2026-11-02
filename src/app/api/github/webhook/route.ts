import { sql } from "@/lib/db";
import { env } from "@/lib/env";
import { createCheckRun, verifyWebhookSignature } from "@/lib/github";
import { getEntitlements } from "@/lib/plans";
import { createScan } from "@/lib/scans";

interface Payload {
  action?: string;
  installation?: { id: number; account?: { login: string; id: number } };
  sender?: { id: number; login: string };
  repository?: { full_name: string; owner: { login: string } };
  pull_request?: { number: number; head: { sha: string }; draft?: boolean };
}

// GitHub App webhook: tracks installations and runs a scan + check on every PR (Pro).
export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifyWebhookSignature(raw, req.headers.get("x-hub-signature-256"), env.githubAppWebhookSecret)) {
    return new Response("Invalid signature", { status: 401 });
  }
  const event = req.headers.get("x-github-event");
  const p = JSON.parse(raw) as Payload;
  const db = sql();

  if (event === "installation" && p.installation) {
    if (p.action === "deleted") {
      await db`delete from github_installations where installation_id = ${p.installation.id}`;
    } else if (p.action === "created" || p.action === "new_permissions_accepted" || p.action === "unsuspend") {
      const [u] = p.sender ? await db<{ id: string }[]>`select id from users where github_id = ${p.sender.id}` : [];
      await db`
        insert into github_installations (installation_id, account_login, account_id, user_id)
        values (${p.installation.id}, ${p.installation.account?.login ?? ""}, ${p.installation.account?.id ?? null}, ${u?.id ?? null})
        on conflict (installation_id) do update set account_login = excluded.account_login, user_id = coalesce(excluded.user_id, github_installations.user_id)`;
    }
    return Response.json({ ok: true });
  }

  if (event === "pull_request" && p.pull_request && p.repository && p.installation) {
    if (!["opened", "synchronize", "reopened", "ready_for_review"].includes(p.action || "") || p.pull_request.draft) return Response.json({ ignored: "action" });
    const [inst] = await db<{ user_id: string | null }[]>`select user_id from github_installations where installation_id = ${p.installation.id}`;
    if (!inst?.user_id) return Response.json({ ignored: "installation not linked to a Seaproof account" });
    const ent = await getEntitlements(inst.user_id);
    if (!ent.pro) return Response.json({ ignored: "PR checks need Pro" });
    const [{ busy }] = await db<{ busy: number }[]>`select count(*)::int as busy from scans where user_id = ${inst.user_id} and status in ('queued','running')`;
    if (busy >= 10) return Response.json({ ignored: "too many scans queued" });

    const fullName = p.repository.full_name;
    const checkRunId = await createCheckRun(p.installation.id, fullName, p.pull_request.head.sha, { status: "queued", output: { title: "Queued", summary: "Seaproof will scan this pull request shortly." } });
    await createScan({
      userId: inst.user_id, repoFullName: fullName.toLowerCase(), repoUrl: `https://github.com/${fullName}.git`,
      ref: `refs/pull/${p.pull_request.number}/head`, trigger: "pr", prNumber: p.pull_request.number,
      checkRunId, installationId: p.installation.id,
    });
    return Response.json({ queued: true });
  }

  return Response.json({ ignored: event });
}
