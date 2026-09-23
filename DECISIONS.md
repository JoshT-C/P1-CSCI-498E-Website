# Decision log

Your methods section. About one page total.

Answer these as you go, not the night before it is due.
Specifics beat polish - a short honest answer is worth more than a long vague one.

Delete these instructions when you are done, or leave them. It does not matter.

---

## 1. What did you set out to build, and what changed?

What you wanted at the start, and what is actually live now.
Name one thing you dropped or added along the way, and why.

What I wanted to build was a direct upgrade from my previous github.io site. Before this class I had already built a site in Angular 22 that deployed to GitHub Pages through GitHub Actions, and I wanted to move to a higher quality, production ready site that I could host on my own homelab. That meant some security choices had to be made. I first deployed the application in an unprivileged Docker container on my Proxmox server, with NGINX as the webserver, NGINX Proxy Manager handling routing and Let's Encrypt for certificates. Later I added a Proxmox helper script in the style of the community-scripts project, so a single curl command on the Proxmox host creates an unprivileged Debian 13 LXC, builds the site from this repo as its own unprivileged user and serves it with the same hardened NGINX config, with an `update` command inside the container for new commits. I wanted 3D elements in the site this time, so I set up a dedicated sub-agent on my local RAG pipeline with a Blender MCP tool so modelling could be part of the design process. I stuck with Angular 22 because I already know its fundamentals.

What is live now at https://jtc.lopyhupis.com is a 3D model of my actual room, built and baked in Blender from photos of my desk and homelab. You walk through it by scrolling and dive into the VT100 on my desk, and the rack, floppy shelf, whiteboard and laptop each open a panel when you click them. The biggest thing I added along the way was the terminal itself. The first version behind the glass was a long scrolling page of sections, and I replaced it with a real shell that starts at `help`, where you type or click commands like `projects`, `ai-stack` and `contact`, because a page that only looked like a terminal was not "in-terminal" enough. The thing I dropped was the headphones and microphone on the top shelf, which I swapped for a Minecraft crafting table.

I also used this assignment to test Claude Code as a harness for orchestrating local models, specifically Qwen 3.8 27b and Qwen 3.8 Flash-Next.

---

## 2. A fork in the road

Name one real choice where you could have gone two ways.
Plain HTML or a framework. One page or several. Your own CSS or someone's template.
What goes on the front page and what does not.

Say which you picked, what the alternative was, and what you gave up by not taking it.

"There was no alternative" is not an answer. Find the fork.

The most notable fork was hosting this site on my own hardware instead of on my github.io page. I already had a site there that meets the requirements for this assignment, so I wanted to challenge myself with a more complete stack. Self-hosting gives me more control over the site, and it also raises the stakes on securing it properly, since it is my server on the other end.

What I gave up was convenience. My github.io site already had a GitHub Actions pipeline that lints it, runs a suite of 131+ Playwright tests and checks that the deploy actually renders. For a self-hosted site I had to rebuild all of that: I kept GitHub Actions for CI (lint, type checks, unit tests, the Playwright suite on Linux, macOS and Windows, and a run against the Docker image and the Proxmox installer), and wrote the deploy side myself with the Proxmox script, the NGINX configs and Cloudflare in front. I also gave up the github.io URL the brief asks for, which is a real cost for this assignment. What I gain is practice with the DevOps skills I already use in industry, and room to add a real backend with OAuth2 later using something like Spring Boot or FastAPI, which GitHub Pages cannot host.

A smaller fork was how much 3D to ship. The full room runs well on my RTX 5090 but is far too heavy for a laptop's integrated graphics or a phone. I could have dropped the room for anyone without a strong GPU, but I kept three versions instead: the full room, a lighter desk-only room for phones and weak GPUs, and a flat page for browsers without WebGL. The cost is that every change has to be checked three ways.

---

## 3. Where you overruled the agent

One time Claude suggested, wrote, or claimed something and you did not take it.

What did it do? How did you notice? What did you do instead?

If it genuinely never happened, say so plainly, and then say what you would have had to
check in order to notice. Being honest here costs you far less than a story you cannot
defend when you record your video.

Qwen 3.8 27b has a nasty tendency to implement CSRF vulnerabilities into its JS React code, and will hallucinate these vulnerabilities as security fixes. This is obviously unacceptable. The way I fixed this behavior was by utilizing the Chrome Dev MCP tools and the built-in Angular linter as a deterministic quality gate, if the model produces code that does not pass the quality gate upon compile or runtime the model will fail this deterministic quality gate and be forced to rewrite the code until it passes. Within this deterministic quality gate I also implemented a research agent that would research the particular vulnerability that the quality gate identified and then pass through suggested revisions to reduce the number of iterations needed to resolve these types of security vulnerabilities.

Higher-Tier Cloud models did not have as many obvious issues, but Opus 5 did introduce a DDOS vulnerability through improperly placed rate limits on the NGINX Webserver config and improperly supplied firewall rules, rather than dropping incoming connections from a certain IP after a certain number of requests in a second it chose to instead provide an HTTP 401, which still takes up network bandwidth and still returns data to the malicious client (essentially still telling a malicious client that a server is still at this location). This issue was diagnosed through my Qwen 3.8 Flash-Next cybersecurity test harness. I resolved this by manually writing the security policies for the website as after these two issues I did not trust these agents to properly implement the CIPS compliance level I was aiming for.

---

## 4. How you know it works

What check did you run, and what did it tell you?

Then the real question: **what would have made this check fail?**
A check that could not have failed is not a check.

Link to your `verification/` folder.

The live check is in [`verification/`](verification/): a screenshot of https://jtc.lopyhupis.com in Brave with the URL bar showing, the full response from fetching the live URL, and the three-line note. That fetch would have failed the check I actually care about if NGINX were still dropping the security headers on the main page, which it was until I moved them to the server level. The response would still be a 200, just without the Content-Security-Policy.

My main verification was Playwright and spec based unit tests, along with looking at the site myself. The Playwright suite (`e2e/`) runs every test in Chromium, Firefox and WebKit, with WebGL and with it switched off, at desktop and phone sizes, and GitHub Actions runs it on Linux, macOS and Windows on every push along with lint, type checks, the unit tests, a bundle audit for secrets and `npm audit`. Every test fails if anything shows up in the browser console, and the tests that race clicks against each other check every animation frame for a black screen. Those checks did fail, which is how I know they can: they caught a black screen when the room downgraded itself while I was in the terminal, the page scrolling past the terminal into black in Chromium/Brave depending on the order I typed commands in, the terminal flashing over the room on load, and the first typed key getting dropped in Chromium. The same suite also runs against the real NGINX, both the Docker image and the Proxmox install, which is how I found the missing headers, and that the Content Security Policy as written would have blocked the room's WebAssembly decoder and knocked every visitor down to the flat page. Screenshots from the last green audit run are in [`docs/audit/`](docs/audit/).

Looking at it myself caught things the tests did not. The site felt much laggier from another machine on my network, so I tested with the Radeon integrated graphics in my Ryzen 9 9950X as the baseline: the room ran at 41 to 48 fps at 1080p and 21 to 25 fps on a 1440p screen before dropping to the lighter version. After adding dynamic resolution and a pixel budget it holds 58 to 60 fps at every size I tried. Opening it on my phone showed that the dive cropped the terminal text off both sides of the CRT and that the landscape layout covered the room, so I screenshotted five phone sizes and fixed the framing until the whole screen fit.

For security I use a locally hosted abliterated version of Qwen 3.8 Flash-Next to look for vulnerabilities in the site. It did escape its sandbox a few times, so that is something to consider for future testing. Rate limiting now closes the connection with no response at all (NGINX's 444) once a client goes over its limit.

---

## 5. What is still wrong

One thing on your own site that is not right, not finished, or that you do not
fully understand.

What would you do next, and how would you find out?

I started this project with Qwen 3.8 27b in Claude Code as the harness, moved to Qwen 3.8 Flash-Next, and finally to the Claude Opus/Fable models (Opus 5/5.5, Fable 5.1). The local models struggled in Claude Code because of the cloud-based assumptions built into the harness: things like the automatic classifier and sub-agents did not work well within the resource limits of my hardware. I got around this with a buffer queue and a limit on agent depth. Going forward I would use other compute in my homelab as separate model servers so the orchestrating agent and its sub-agents can run in parallel. I already do this in other local harnesses like OpenCode, but Claude Code impressed me for single-agent workflows on local models, and I could extend it with what I already know about multi-agent architectures.

On the site itself, Cloudflare's email obfuscation rewrites my email address in the page and injects a script that my Content Security Policy blocks, so the live site logs errors in the console even though the link still works. The fix is turning that feature off in Cloudflare, and I will know it worked when a fetch of the live page no longer contains `email-protection`. The phone layout has only been checked in emulation and on my own phone, which is fast, so I do not know yet how the 3D room feels on an older phone; the next step is testing on a cheaper Android device and watching whether it drops to the flat page. The Windows Firefox run in CI also had one failure I could not reproduce locally, so I made that test report what it saw when it fails, and the next CI run will tell me more.
