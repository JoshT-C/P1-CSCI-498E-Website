# verification/

Evidence that the site works and is clean.

**Produced by the audit (committed):**
- `fetch.txt` — the public GitHub profile README the About copy is derived
  from, with the contact badges omitted. Provenance: the bio, experience and
  skills are the owner's own public words.
- `pass1-room.png` — desktop (1440×900), 3D: the opening shot of the room
  with the intro pane.
- `pass1-rack.png` — the rack station open: the camera on the rack and the
  NZXT, the homelab panel on the right.
- `pass1-shell-help.png`, `pass1-shell-about.png`,
  `pass1-shell-contact.png` — through the glass: the shell at `help`, after
  a typed `about`, and after an unknown command, a clicked `projects` and
  the header's contact link.
- `pass2-flat-intro.png`, `pass2-flat-shell.png` — the flat version
  (`?no3d=1`): the intro's typed terminal card, and the shell after the
  header's ai-stack link. This is the no-WebGL experience.
- `pass4-phone.png` — 375×812 with touch: the two-row header and the room.

**Owner-produced (not committed — add before submitting):**
- `screenshot.png` — a screenshot **with the browser URL bar visible**, from a
  real browser, of the deployed site.
- The 3–5 minute screen recording, and the 3 peer comments.

## What the audit checks

`scripts/audit-browser.mjs`, four passes in headless Firefox; every pass
also fails on uncaught exceptions, console errors, failed requests,
HTTP >= 400 and CSP violations.

1. **Desktop, 3D.** The session never shows over the room while the page
   loads. A station opens its panel, the page cannot scroll under it, and
   Esc closes it. Scrolling to the end goes through the glass; the shell
   fills the screen, ends the page, and has the keyboard. It starts at
   `help`; a typed command runs and the header marks its section; an
   unknown command says so; clicking a command in `help` fills the prompt
   without running it, and Enter runs it; a header link types and runs its
   command; `exit` walks back out to the room.
2. **Flat (`?no3d=1`).** No canvas; the intro's card types in full; the
   shell runs a header link's command.
3. **JavaScript off.** The server-rendered HTML carries every section
   (`#work`, `#stack`, `#about`, `#contact`), the name and the email.
4. **Phone (375×812, touch).** Nothing scrolls sideways and all four header
   links are on screen.

A 3D pass that ends in a clean, logged downgrade (a slow headless GPU)
skips its 3D-only checks with a note; an unexplained flat page fails.
GitHub API failures are the network's, not the site's: notes, not failures.

## Regenerating

```
npm run build
npm run audit          # audit-dist, then audit-browser; rewrites the screenshots
```

`audit-browser` exits non-zero if any check fails, so a green run is what
the screenshots were taken from (43/43 at the time of writing).
`AUDIT_BROWSER=chromium` runs it in Chromium instead; in this project's
environment headless Chromium cannot draw text glyphs, so its screenshots
show blank text where the page has copy. That is the test browser, not the
site: the DOM text is present, and the fonts are valid self-hosted woff2.
