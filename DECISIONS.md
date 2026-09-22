# Decision log

Your methods section. About one page total.

Answer these as you go, not the night before it is due.
Specifics beat polish - a short honest answer is worth more than a long vague one.

Delete these instructions when you are done, or leave them. It does not matter.

---

## 1. What did you set out to build, and what changed?

What you wanted at the start, and what is actually live now.
Name one thing you dropped or added along the way, and why.

I wanted a personal site that looked like something I would actually run, not a
template. The first pass shipped as a "refined minimal" page — cream background,
serif display type, oxblood accents — with copy written in a generic AI voice. I
rejected both the look and the writing. So I rebuilt it around my own terminal
identity: a dark phosphor palette, monospace type throughout, and a 3D CRT
terminal fixed behind every section. The camera dollies from a wide shot into a
screen close-up as you scroll, and the phosphor screen's typed output mirrors
whatever section is in view (`cat /etc/whoami` at the top, `ls ~/projects` in
Work, the GitHub handle at the bottom).

What changed: I dropped the cream/serif aesthetic and its copy wholesale — that
was the first thing I rejected — and I added the 3D scene the brief promised from
the start but the first pass never built. I also added an automated security and
browser-console audit, because the site runs on my own hardware and I want it to
be verifiably clean, not just "looks fine."

---

## 2. A fork in the road

Name one real choice where you could have gone two ways.
Plain HTML or a framework. One page or several. Your own CSS or someone's template.
What goes on the front page and what does not.

Say which you picked, what the alternative was, and what you gave up by not taking it.

"There was no alternative" is not an answer. Find the fork.

Make the 3D scene a progressive enhancement with a fully designed CSS fallback,
or make 3D a hard requirement. I picked the first. The site runs a capability
gate: if WebGL is unavailable, the context is lost, the runtime falls under the
frame budget, or the lazy-loaded scene chunk fails to download, it downgrades to
the CSS page — and that CSS page is a real design, not a degraded afterthought
(the hero terminal card runs the same typed-terminal engine, and the stack bars
still animate). The alternative was simpler to reason about: one render path, and
if the visitor can't do 3D they just get a static page. What I gave up was that
simplicity. I maintain two render paths that have to stay in lockstep from one
source of truth — the same line queue drives both the 3D screen texture and the
DOM card — which is more code and more test surface. I decided it was worth it,
because "your GPU can't do this, here's a blank page" is not an acceptable
experience for a personal site.

---

## 3. Where you overruled the agent

One time Claude suggested, wrote, or claimed something and you did not take it.

What did it do? How did you notice? What did you do instead?

If it genuinely never happened, say so plainly, and then say what you would have had to
check in order to notice. Being honest here costs you far less than a story you cannot
defend when you record your video.

1. One immediate item I had to correct for my agent, ran locally using the Claude Code Harness was to instruct it to avoid spawning more than one sub-agent at a time, as it tried spawning multiple at once from the start causing a system resource crash.

---

## 4. How you know it works

What check did you run, and what did it tell you?

Then the real question: **what would have made this check fail?**
A check that could not have failed is not a check.

Link to your `verification/` folder.

I run `npm run audit`, which does two things. `audit-dist` walks the built bundle
and fails if it finds an internal hostname, a private IP, a bare port, or a
credential-shaped string — the site must not leak my homelab. `audit-browser`
boots the site in a real headless Chromium and fails on anything a visitor would
feel: console errors, uncaught exceptions, failed requests, HTTP 400 or above,
CSP violations. It then scrolls through all five sections and asserts that the 3D
screen is mirroring the section in view at each stop. It currently reports
21/21 checks passing.

What would have made it fail: the 3D scene originally crashed on startup with an
Angular injection error — the scene code called `inject()` from a dynamic-import
callback, which is outside a valid injection context — and it silently downgraded
to the CSS page. The "render mode is 3d" check caught that, and the "screen
mirrors X" checks would have caught a section observer that never fired. A
hostname leaking into the bundle fails `audit-dist`. A bad origin trips a CSP
violation in the browser pass.

One honest caveat. The headless environment I run this in cannot rasterize text
glyphs at all — a trivial test page renders blank text there. So the automated
pipeline verifies that the text is present and visible in the DOM and that the
fonts are valid self-hosted files, but it cannot pixel-verify that the glyphs
actually draw. That final visual check has to happen in a real browser, against
the deployed site. See `verification/`.

---

## 5. What is still wrong

One thing on your own site that is not right, not finished, or that you do not
fully understand.

What would you do next, and how would you find out?

The thing I am least sure of: I have not seen the 3D screen's text rendered on
real pixels. My automated audit runs in a headless browser that cannot rasterize
fonts, so I've confirmed the terminal machine is correct (it's unit-tested), that
the text is present and visible in the DOM, and that the fonts are valid
self-hosted woff2 — but I have not looked at the actual glyphs drawn on the 3D
screen in a working browser. Next I would run
`npm run audit:browser https://jtc.lopyhupis.com` from a machine with a real
display and working fonts, and compare the screenshots against the expected
hero/work/stack frames. If the text is still blank there, the bug is in the site
(the CanvasTexture upload path) and I would instrument that. If it renders, the
earlier blank was purely the test environment.

Secondarily: the scene's frame budget (it self-downgrades around 28 fps sustained)
is a number I have not tuned on a real low-end GPU, so a visitor on integrated
graphics may hit the downgrade path more often than I expect.
