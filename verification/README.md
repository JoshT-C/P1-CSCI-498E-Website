# verification/

Evidence that the site works and is clean. Two kinds of artifact live here:

**Agent-produced (committed):**
- `fetch.txt` — the public GitHub profile README the About copy is derived
  from, with the contact badges omitted (the site is GitHub-only by decision).
  Provenance: the bio/experience/skills are the owner's own public words.
- `pass1-*.png` — desktop (1440×900), 3D mode, one screenshot per section as
  the audit scrolls top → work → stack → about → contact. Shows the CRT
  machine, the phosphor glow, and the section panels.
- `pass2-hero.png` — the CSS fallback (`?no3d=1`), hero terminal card with
  window chrome. This is the no-WebGL experience.

**Owner-produced (not committed — add before submitting):**
- `screenshot.png` — a screenshot **with the browser URL bar visible**, from a
  real browser, of the deployed site.
- The 3–5 minute screen recording, and the 3 peer comments.

## Regenerating the screenshots

```
npm run build
npm run audit          # runs audit-dist then audit-browser; rewrites the pass*.png files
```

`audit-browser` exits non-zero if any check fails, so a green run is what the
screenshots were taken from (21/21 at the time of writing).

## Important: text is blank in these screenshots — and why that is not a bug

The headless browser this audit runs in **cannot rasterize text glyphs at all**.
A trivial test page (white system-monospace text on black) renders zero pixels
of ink in it, even though the same box model, layout, and `fillRect` shapes all
draw correctly. The audit detects this up front and prints a `[note]` line.

So in the screenshots above the panels, the 3D machine, the glow, and the
terminal window chrome are all real and correct, but the **text inside them is
blank** — the DOM text is present and `visibility:visible` (the audit asserts
this), and the fonts are valid self-hosted woff2, but this particular browser
build simply cannot draw the glyphs.

This is a limitation of the test environment, not of the site. In a real
browser (yours, or a visitor's) the text renders normally: the self-hosted IBM
Plex Mono loads (nginx serves it as `font/woff2`, CSP is `font-src 'self'`), and
there are system monospace fallbacks if it ever doesn't.

To verify the real thing: open the site in an actual browser —
`npm start` locally, or the deployed `https://jtc.lopyhupis.com` — and you will
see the typed terminal, the section-mirrored 3D screen, and all the copy.
