# Project Rules & Conventions

## Code style
- **JavaScript/HTML/CSS** only (no build step needed).
- Keep files small and focused (≤500 lines each where reasonable).
- 2-space indent, LF line endings, max line length ~100 chars.
- Use semantic HTML with accessible labels.

## Commits
- Conventional style is recommended:
  - `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `style:`
- Keep subjects ≤72 chars; body wraps at ~100 chars.

## Branching
- `main` for production; create feature branches: `feat/xyz`, `fix/abc`.
- Use PRs for review if collaborating.

## UI/UX
- Vuexy look via shim; if you own Vuexy, drop assets in `public/vendor/vuexy/`.
- Keep primary actions top-right and clearly labeled.
- Validate inputs inline and show helpful messages (no alerts for routine UX).

## Testing (lightweight)
- Manual testing: import sample config, change NIC count, randomize MACs, export & diff.
- Validate no duplicate MACs and correct `netX` sequencing.

## Packaging & Deploy
- Deploy with `npm run deploy` (wrangler).
- For offline share, zip the folder root.
