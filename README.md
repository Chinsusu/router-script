# VM Config Editor (Proxmox) — Cloudflare Worker

A lightweight, **client‑side** web UI to **import, edit, and regenerate** Proxmox QEMU VM config files
(`/etc/pve/qemu-server/<VMID>.conf>`). Deployable to **Cloudflare Workers** with `wrangler`.

> ⚠️ This tool edits only selected keys and leaves everything else intact:
> - `name`
> - `vmgenid`
> - `scsi0`
> - `netX` (dynamic count, `virtio` model). MACs auto‑generate with the prefix **D8:FC:93** (editable).  
> - `VMID` is used for file naming when downloading (not stored inside the config itself).

## Quick Start

```bash
# 1) Install deps
npm i

# 2) Login to Cloudflare
npx wrangler login

# 3) Dev preview
npm run dev

# 4) Deploy
npm run deploy
```

When deployed, the Worker serves the static UI from `/public` (configured via `[site]` in `wrangler.toml`).

## Vuexy look & feel

This project ships with a **Vuexy shim** (`public/assets/vuexy-shim.css`) to emulate colors & key classes
against Bootstrap 5. If you own a Vuexy license and want the official styles:
1. Place Vuexy’s compiled CSS/JS into `public/vendor/vuexy/`.
2. Uncomment the vendor `<link>`/`<script>` tags in `public/index.html`.
3. The UI will automatically pick up Vuexy classes and palette.

> We do **not** redistribute Vuexy assets here for licensing reasons.

## How it works

- **Import**: paste the contents of an existing `.conf`; the form populates.
- **Edit**: adjust `VMID`, `name`, `vmgenid`, `scsi0`, and **NICs** (count + `vmbr`, `tag`, `MAC`).
  - `net0` defaults to `vmbr0` and you can set its `tag`.
  - MACs are validated and de‑duplicated, with quick “randomize” actions.
- **Export**: generate a sanitized config that **preserves unrelated lines**, replacing only the keys we manage.
  - Download filename: `<VMID>.conf`.
  - You can also copy to clipboard.

## Limitations / scope

- This is a **local editor**; it does *not* connect to your Proxmox host or write to `/etc/pve/` directly.
- We only rewrite: `name`, `vmgenid`, `scsi0`, and all `netX` lines. Other lines are preserved from input.
- `netX` serialization uses `virtio=MAC,bridge=vmbrX[,tag=VLAN]`. Other models aren’t edited (but are preserved if left untouched).

## Folder structure

```
.
├─ public/                 # Static site (served by the Worker)
│  ├─ assets/
│  │  ├─ app.css
│  │  ├─ app.js
│  │  └─ vuexy-shim.css
│  ├─ vendor/vuexy/        # (optional) drop your licensed Vuexy assets here
│  └─ index.html
├─ src/
│  └─ worker.js            # Minimal static-file Worker using kv-asset-handler
├─ docs/
│  └─ PROJECT_RULES.md
├─ wrangler.toml
├─ package.json
├─ .editorconfig
└─ .gitignore
```

## Security notes

- Everything happens in the browser. No VM data leaves your machine unless you explicitly deploy it and visit over the network.
- Consider hosting on a private route (e.g., access policies) if you deploy publicly.

## License

MIT (this repo). Vuexy is a separate, commercial product. Include it only if you have a valid license.
