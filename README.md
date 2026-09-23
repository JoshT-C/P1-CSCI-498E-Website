# Joshua T-C

**Live site: https://jtc.lopyhupis.com**

Repo: https://github.com/JoshT-C/P1-CSCI-498E-Website

My personal site for CSCI 498E Project 1. It opens on a 3D model of my desk
and homelab. Scrolling walks the camera up to a VT100 terminal and through its
glass into a working shell, where `projects`, `ai-stack`, `about` and
`contact` print the rest of the site. The rack, floppy shelf, whiteboard and
laptop in the room each open a panel when clicked. Phones get a lighter version
of the room, and browsers without WebGL get a flat page with the same shell.

## Hand-in

- [`DECISIONS.md`](DECISIONS.md): the decision log
- [`verification/`](verification/): the live-site screenshot, the fetch of the
  live URL, and the three-line note
- [`docs/audit/`](docs/audit/): screenshots from the browser audit

## Stack

Angular 22 (zoneless, prerendered to static HTML), three.js 0.186 for the
room, which was modelled and light-baked in Blender (`art/`). It is served by
nginx from a Proxmox container behind Cloudflare. The nginx configs, Docker
image and Proxmox installer are in [`deploy/`](deploy/)
([`RUNBOOK.md`](deploy/RUNBOOK.md)).

## Running it

```bash
npm ci
npm start              # dev server on http://localhost:4200
npm run build          # static build in dist/jtc-site/browser, gzipped
npm test               # unit tests (Vitest)
npm run lint && npm run typecheck
npx playwright install && npm run e2e   # Chromium, Firefox, WebKit; with and without WebGL
```

GitHub Actions ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) runs
all of the above on every push and pull request. It also runs the Playwright
suite on Linux, macOS and Windows, and against the Docker image and the Proxmox
installer.

To install on a Proxmox host (creates and configures the container):

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/JoshT-C/P1-CSCI-498E-Website/main/deploy/proxmox/jtc-site.sh)"
```
