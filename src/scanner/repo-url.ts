export interface ParsedRepo { owner: string; repo: string; fullName: string; cloneUrl: string; }

const OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const REPO = /^[A-Za-z0-9._-]{1,100}$/;

/** Accepts github.com URLs or "owner/repo". We rebuild the clone URL ourselves. */
export function parseGitHubRepo(input: string): ParsedRepo | null {
  const s = input.trim().replace(/\.git$/, "").replace(/\/+$/, "");
  const m = s.match(/^(?:https?:\/\/)?(?:www\.)?github\.com\/([^/\s]+)\/([^/\s#?]+)(?:\/.*)?$/i) || s.match(/^([^/\s]+)\/([^/\s]+)$/);
  if (!m) return null;
  const [owner, repo] = [m[1], m[2].replace(/\.git$/, "")];
  if (!OWNER.test(owner) || !REPO.test(repo) || repo === "." || repo === "..") return null;
  return { owner, repo, fullName: `${owner}/${repo}`.toLowerCase(), cloneUrl: `https://github.com/${owner}/${repo}.git` };
}
