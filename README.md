# VM Config Editor (Proxmox) — Cloudflare Worker

**Fix for 404/Not found on workers.dev** — this build uses Wrangler v3 `assets` binding to serve `/public`.
No `kv-asset-handler` required.

## Quick Start
```bash
npm i
npx wrangler login
npm run dev     # http://localhost:8787
npm run deploy  # deploy to workers.dev
```

## What it does
- Import a `.conf` (Proxmox QEMU) → parse
- Edit: `VMID` (download name), `name`, `vmgenid`, `scsi0`
- NICs: choose **count**, set `bridge`, `tag`, auto-MAC with **prefix `D8:FC:93`**; `net0` defaults `vmbr0`
- Export: only rewrites `name`, `vmgenid`, `scsi0`, `netX`; **preserves other lines**

## Vuexy look & feel
- Ships with a small **Vuexy shim** over Bootstrap 5 (`/assets/vuexy-shim.css`)
- If you have an official Vuexy license, copy the compiled CSS/JS to `public/vendor/vuexy/`
  and uncomment tags in `index.html`.

## Files
- `wrangler.toml` → `assets = { directory = "./public", binding = "ASSETS" }`
- `src/worker.js` → `env.ASSETS.fetch()` (+ SPA fallback to `/index.html`)

## Notes
- Everything runs client-side; no write access to `/etc/pve/` directly.
- Generated download name is `<VMID>.conf`.
