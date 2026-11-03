import { NextResponse } from "next/server";
import { z } from "zod";
import { decrypt } from "@/lib/crypto";
import { env } from "@/lib/env";
import { checkRepoAccess } from "@/lib/github";
import { startManualScan } from "@/lib/scans";
import { getCurrentUser, isSameOrigin } from "@/lib/session";
import { normalizeSiteUrl } from "@/scanner/checks/live-site";
import { assertPublicUrl, BlockedTargetError } from "@/scanner/net";
import { parseGitHubRepo } from "@/scanner/repo-url";

const Body = z.object({
  repoUrl: z.string().trim().min(3).max(300),
  siteUrl: z.string().trim().max(300).optional().nullable(),
});

const err = (status: number, error: string, extra: Record<string, unknown> = {}) => NextResponse.json({ error, ...extra }, { status });

// POST /api/scans  { repoUrl, siteUrl? }
export async function POST(req: Request) {
  if (!isSameOrigin(req)) return err(403, "Forbidden");
  const user = await getCurrentUser();
  if (!user) return err(401, "Please sign in with GitHub first.", { code: "login_required" });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return err(400, "Please enter a GitHub repository address.");
  const { repoUrl } = parsed.data;

  let repoFullName: string, cloneUrl: string;
  if (env.allowLocalRepos && repoUrl.startsWith("file://")) {
    repoFullName = `local/${repoUrl.split("/").filter(Boolean).pop()}`.toLowerCase();
    cloneUrl = repoUrl;
  } else {
    const repo = parseGitHubRepo(repoUrl);
    if (!repo) return err(400, "That doesn't look like a GitHub repository. Try something like github.com/you/your-app.");
    repoFullName = repo.fullName;
    cloneUrl = repo.cloneUrl;
    let token: string | undefined;
    try { token = user.github_token_enc ? decrypt(user.github_token_enc) : undefined; } catch { token = undefined; }
    const access = await checkRepoAccess(repo.fullName, token);
    if (!access.ok && access.reason === "not_found") {
      const hasRepoScope = /\brepo\b/.test(user.github_scopes);
      return err(404, hasRepoScope
        ? "We couldn't find that repository, or your GitHub account can't see it."
        : "We couldn't find that repository. If it's private, connect private repo access first.", { code: hasRepoScope ? "not_found" : "needs_private_access" });
    }
  }

  let siteUrl: string | null = null;
  if (parsed.data.siteUrl) {
    try {
      siteUrl = (await assertPublicUrl(normalizeSiteUrl(parsed.data.siteUrl))).toString();
    } catch (e) {
      return err(400, e instanceof BlockedTargetError ? e.message : "That website address doesn't look right.");
    }
  }

  const started = await startManualScan({ userId: user.id, repoFullName, repoUrl: cloneUrl, siteUrl });
  if ("message" in started) return err(402, started.message, { code: "upgrade_required", upgrade: started.upgrade, repo: repoFullName });
  return NextResponse.json({ id: started.scan.id }, { status: 201 });
}
