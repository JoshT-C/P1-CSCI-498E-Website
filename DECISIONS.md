# Decision log

Your methods section. About one page total.

Answer these as you go, not the night before it is due.
Specifics beat polish - a short honest answer is worth more than a long vague one.

Delete these instructions when you are done, or leave them. It does not matter.

---

## 1. What did you set out to build, and what changed?

What you wanted at the start, and what is actually live now.
Name one thing you dropped or added along the way, and why.

What I wanted to build was a direct upgrade from my previous github.io site, before this class I had already created a site that was deployed to github using github actions and CLI using Angular 22, I wanted to migrate to a higher quality, production ready site that I could deploy on my personal home lab. This means that some security choices needed to be made. I first decided to have the application deployed within an unprivileged docker container on my Proxmox server, using NGINX as the webserver and NGINX Proxy Manager to manage the routing for my application and lets encrypt for certificates. Later on I added a Proxmox helper script in the style of the community-scripts project, so a single curl command on the Proxmox host now creates an unprivileged Debian 13 LXC, builds the site from this repo as its own unprivileged user and serves it with the same hardened NGINX config, with an `update` command inside the container for new commits. I wanted to implement some 3d elements into my website this time so I created a dedicated sub-agent on my local RAG pipeline integrating a Blender MCP tool to allow for these to be integrated into the design process. I decided to stick with Angular 22 as my framework since I am already familiar with its fundamentals.

What is live now is a 3D model of my actual room, built and baked in Blender from photos of my desk and homelab, that you walk through by scrolling and dive into through the VT100 on my desk. The biggest thing I added along the way was the terminal itself: the first version behind the glass was a long scrolling page of sections, and I replaced it with a real shell that starts at `help`, where you type or click commands like `projects`, `ai-stack` and `contact`, because a page that only looks like a terminal was not "in-terminal" enough.

I also wanted to use this assignment as an opportunity to test Claude Code's capabilities as a harness for orchestrating local models, the models I chose to test within this were Qwen 3.8 27b and Qwen 3.8 Flash-Next.

---

## 2. A fork in the road

Name one real choice where you could have gone two ways.
Plain HTML or a framework. One page or several. Your own CSS or someone's template.
What goes on the front page and what does not.

Say which you picked, what the alternative was, and what you gave up by not taking it.

"There was no alternative" is not an answer. Find the fork.

I had quite a few forks in the road from the original assignment prompt, with the most notable being the choice to locally host this website instead of on my previous github.io site. As mentioned above I already had a website on my github.io page that well meets the requirements for this assignment, so I decided I wanted to challenge myself through a more comprehensive development stack. This gives me the benefit of having greater control and agency over my hosted website, it also had the impact of introducing higher stakes for ensuring that my website is properly secured. What I gave up in this instance was convenience, I already have a Github actions CICD pipeline that lints my website, runs a suite of 131+ playwright tests and verifies that my deployment pipeline actually renders and deploys to my production repo. For this local stack I would have to re-implement this stack, locally hosting a Gitlab instance, setting up API keys, recreating my deployment pipeline, writing new docker compose files, and routing traffic correctly through NGINX Proxy Manager, Cloudflare so that my website is actually served properly. What I gain however is a hardening of many of the DevOps skills I have already learned in industry, and this allows for me to add proper backend / OAuth2 implementations later down the line utilizing backend frameworks like Springboot or FastAPI.

---

## 3. Where you overruled the agent

One time Claude suggested, wrote, or claimed something and you did not take it.

What did it do? How did you notice? What did you do instead?

If it genuinely never happened, say so plainly, and then say what you would have had to
check in order to notice. Being honest here costs you far less than a story you cannot
defend when you record your video.

Qwen 3.8 27b has a nasty tendency to implement CSRF vulnerabilities into its JS React code, and will hallucinate these vulnerabilities as security fixes. This is obviously unacceptable. The way I fixed this behavior was by utilizing the Chrome Dev MCP tools and the built-in Angular linter as a deterministic quality gate, if the model produces code that does not pass the quality gate upon compile or runtime the model will fail this deterministic quality gate and be forced to rewrite the code until it passes. Within this deterministic quality gate I also implemented a research agent that would research the particular vulnerability that the quality gate identified and then pass through suggested revisions to reduce the number of iterations needed to resolve these types of security vulnerabilities.

Higher-Tier Cloud models did not have as many obvious issues, but Opus 5 did introduce a DDOS vulnerability through improperly placed rate limits on the NGINX Webserver config and improperly supplied firewall rules, rather than dropping incoming connections from a certain IP after a certain number of requests in a second it chose to instead provide an HTTP 401, which still takes up network bandwidth and still returns data to the malicious client (essentially still telling a malicious client that a server is still at this location). This issue was diagnosed through my Qwen 3.8 Flash-Next cybersecurity test harness. I resolved this by manually writing the security policies for the website as after these two issues I did not trust these agents to properly implement the CIPS compliance level I was aiming for. The current config closes the connection with no response at all (NGINX's 444) once a client goes over its limit.

---

## 4. How you know it works

What check did you run, and what did it tell you?

Then the real question: **what would have made this check fail?**
A check that could not have failed is not a check.

Link to your `verification/` folder.

My primary form of verification was done through Playwright and Spec based unit tests. Along with personal visual inspection. The Playwright suite (`e2e/`) runs every test in Chromium, Firefox and WebKit, both with WebGL and with it switched off, on desktop and phone sizes, and GitHub Actions runs it on Linux, macOS and Windows on every push along with lint, type checks, the unit tests, a bundle audit for secrets and `npm audit`. Every test fails if anything at all shows up in the browser console, and the tests that race clicks against each other check every animation frame for a black screen. Those checks did fail, which is how I know they can: they caught a black screen when the room downgraded itself while I was in the terminal, the page scrolling past the terminal into black in Chromium/Brave depending on the order I typed commands in, the terminal flashing over the room on load, and the first key typed getting dropped in Chromium. The same suite also runs against the real NGINX, both the Docker image and the Proxmox install, and checks the security headers, which is how I found that NGINX had been silently dropping every security header on the main page, and that the Content Security Policy as written would have blocked the room's WebAssembly decoder and knocked every visitor down to the flat page. Screenshots from the last green audit run are in [`verification/`](verification/).

For security I utilize a locally hosted abliterated version of Qwen 3.8 Flash-Next to diagnose potential vulnerabilities within my website. The Abliterated Version of Qwen 3.8 Flash-Next did escape its sandbox a few times so that is something to consider for future testing...

---

## 5. What is still wrong

One thing on your own site that is not right, not finished, or that you do not
fully understand.

What would you do next, and how would you find out?

I initially started this project using Qwen 3.8 27b with Claude Code as the Harness, migrating then to Qwen 3.8 Flash-Next, and then Finally Claude Opus/Fable Models (Opus 5/5.5, Fable 5.1). The local agents struggled using Claude Code as a harness simply due to the cloud-based assumptions that the Claude Code harness integrates into their application stack, things like the automatic classifier and sub-agents would not operate properly due to resource limitations on the hosted system. I was able to resolve these issues by adding a buffer queue and agent depth limitations. The way that I would resolve this in the future would be to leverage other locally hosted compute within my homelab to act as separate model servers to allow for parallel operation between the orchestrating agent and the called sub-agents. This capability has already been implemented in my other local harnesses (like OpenCode) but the Claude Code Harness has impressed me for single agent workflows on local models and could easily be expanded with my already existing knowledge of multi-agent architectures.

On the site itself, the Proxmox script has only run against stand-ins for the Proxmox commands inside a Debian 13 container, not on my actual Proxmox host yet, so the first real run is the next thing I need to watch. The 3D room also downgrades itself when the frame rate drops, and I have only tuned that on my own GPU and on software rendering in CI, so someone on integrated graphics may land on the lighter room more often than I expect.
