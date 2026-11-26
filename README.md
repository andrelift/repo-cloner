# Repo Cloner

Two-step web app: (1) duplicate ONE fixed base repo (BASE_REPO) under a new name, (2) create the Vercel project, attach a domain/subdomain and deploy. The base repo must be a clean template; the app refuses to copy repos that contain traffic-cloaking scripts. The header shows a live count of your GitHub repos (refreshes every 8 s).

## Deploy
1. Push this folder to GitHub and import it in Vercel (Next.js).
2. Env vars (add BASE_REPO=owner/repo too) (see `.env.example`): GITHUB_TOKEN, VC_API_TOKEN, APP_PASSWORD; optional VERCEL_TEAM_ID, GITHUB_OWNER.
3. Install the Vercel GitHub integration on the GitHub account that owns the copies.

## Notes
- `.github/workflows/*` is not copied (tokens without `workflow` scope can't push it).
- Phase 3 edits are applied to the repo's default branch as a single new commit; Vercel redeploys automatically.
- Vercel request body limit (~4.5 MB) caps the uploaded file size.
- Custom domains need DNS records at your registrar if Vercel shows "not verified".
