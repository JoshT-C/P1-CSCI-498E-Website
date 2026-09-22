/**
 * Hand-written site content.
 *
 * Everything in this file ships to every visitor, so it is gated by a test
 * (content/projects.spec.ts) for internal hostnames, ports, IP addresses, and
 * credential-shaped strings. When adding copy here, keep it public-safe:
 * facts a stranger reading it on the street would not regret publishing.
 */

export const GITHUB_USERNAME = 'JoshT-C';

/** Repos that must never appear in the runtime GitHub grid. */
export const HIDDEN_REPOS: ReadonlySet<string> = new Set([
  'P1-CSCI-498E-Website', // this class project
  'joshua_t-c.github.io', // the previous site — shown as a curated card instead
  'joshua_t-c.github.io.dev'
]);

/** How many GitHub repos the grid shows, most recently updated first. */
export const MAX_GRID_PROJECTS = 8;

export interface CuratedProject {
  id: string;
  title: string;
  tagline: string;
  /** One short paragraph. */
  body: string;
  href: string;
  hrefLabel: string;
  tags: string[];
}

/**
 * Curated entries, rendered above the GitHub grid. The local AI stack comes
 * first — it is the project this site is being rebuilt around.
 */
export const CURATED_PROJECTS: readonly CuratedProject[] = [
  {
    id: 'ai-stack',
    title: 'The Local AI Stack',
    tagline: 'One machine, one engine, four backends.',
    body: 'A self-hosted inference stack: a single locally-built llama.cpp engine serving four large language models on an RTX 5090, with a chat UI, local search, and document pipeline running around it. Everything runs on one desktop box, loopback-only.',
    href: '#stack',
    hrefLabel: 'Read the stack notes below ↓',
    tags: ['llama.cpp', 'RTX 5090', 'local-first']
  },
  {
    id: 'previous-site',
    title: 'The Previous Site',
    tagline: 'First iteration, still running.',
    body: 'My first full personal site — Angular on GitHub Pages with the terminal-voice identity. It stays up at joshua_t-c.github.io as the reference point this revamp is measured against.',
    href: 'https://joshua_t-c.github.io',
    hrefLabel: 'joshua_t-c.github.io',
    tags: ['Angular', 'GitHub Pages']
  }
];

export interface ModelRow {
  /** Backend name as the `ai use` switcher knows it. */
  name: string;
  architecture: string;
  context: string;
  speed: string;
  note: string;
}

export const STACK = {
  machine: 'RTX 5090 · 32 GB VRAM — Ryzen 9 9950X · 16c/32t — 123 GiB RAM — PCIe 5.0 x16',

  intro: [
    'One machine, one engine, four backends. The stack lives on a System76 Thelio Mira running Bazzite — an RTX 5090 with 32 GB of VRAM next to a 16-core Ryzen 9 9950X and 123 GiB of system RAM. Everything is local: no cloud round-trip, no telemetry, no per-token billing.',
    'The engine is a single llama.cpp build compiled from commit-pinned source with Blackwell (sm_120) support, because stock package builds did not have it when the card shipped. It serves the Anthropic Messages API natively, so tools that speak that protocol — including Claude Code, via `claude --local` — point at it directly.'
  ],

  switching:
    'The four backends are mutually exclusive — only one is resident in VRAM at a time. `ai use <model>` reclaims the current one (polling nvidia-smi until the VRAM is actually freed) before loading the next, so there are no half-loads and no out-of-memory crashes.',

  /**
   * Measured on the machine itself (median, sustained load).
   * Keep these in sync with docs/models.md in the ai-stack repo.
   */
  models: [
    {
      name: 'qwen3.6-35b-a3b',
      architecture: 'MoE 35B · 3B active',
      context: '262,144',
      speed: '282 tok/s',
      note: 'Interactive default — fastest of the four by a wide margin'
    },
    {
      name: 'qwen3.8-27b',
      architecture: 'Dense 27B · hybrid attention',
      context: '163,840',
      speed: '113 tok/s',
      note: 'Dense workhorse'
    },
    {
      name: 'muse-glimmer-30b',
      architecture: 'Dense 30B · f16 KV cache',
      context: '131,072',
      speed: '84 tok/s',
      note: 'Most VRAM headroom of the four'
    },
    {
      name: 'qwen3.8-flash-next',
      architecture: 'MoE 180B · experts in system RAM',
      context: '262,144',
      speed: '27 tok/s',
      note: 'Largest of the four; ~80 GiB RAM resident'
    }
  ] satisfies readonly ModelRow[],

  alwaysOn:
    'Running around the engine at all times: Open WebUI for chat, SearXNG for local search, Docling for document parsing (CPU-only, deliberately), Tika for extraction, and MCPO for model context over the web. Every endpoint is loopback-only with bearer auth — nothing on the stack is exposed to the network.',

  harness:
    'One build, one server process, four interchangeable model backends — the point being that switching models is a config change, not a reinstall.'
};
