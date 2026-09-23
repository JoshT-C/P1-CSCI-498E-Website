/**
 * Hand-written site content.
 *
 * Everything in this file ships to every visitor, so it is gated by a test
 * (content/projects.spec.ts) for internal hostnames, ports, IP addresses, and
 * credential-shaped strings. When adding copy here, keep it public-safe:
 * facts a stranger reading it on the street would not regret publishing.
 */
import { SITE_META } from './site';

export const GITHUB_USERNAME = 'JoshT-C';

/** Repos that must never appear in the runtime GitHub grid. */
export const HIDDEN_REPOS: ReadonlySet<string> = new Set([
  'P1-CSCI-498E-Website', // this class project
  'JoshT-C.github.io' // the previous site — shown as a curated card instead
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
    title: 'Local AI stack',
    tagline: 'Four language models behind one llama.cpp build.',
    body: 'A llama.cpp server on an RTX 5090 that runs one of four large models at a time. Open WebUI, SearXNG and Docling run beside it. Every service listens only on the loopback interface, so nothing on the machine is reachable from the network.',
    href: '#stack',
    hrefLabel: 'Models and benchmarks below ↓',
    tags: ['llama.cpp', 'RTX 5090', 'local-first']
  },
  {
    id: 'previous-site',
    title: 'Previous site',
    tagline: 'The GitHub Pages version this site replaces.',
    body: 'My first personal site, built with Angular and hosted on GitHub Pages. It stays online at josht-c.github.io for comparison.',
    href: 'https://josht-c.github.io/projects',
    hrefLabel: 'josht-c.github.io/projects',
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
  machine: 'RTX 5090 (32 GB), Ryzen 9 9950X (16 cores), 123 GiB RAM, PCIe 5.0 x16',

  intro: [
    'The host is a System76 Thelio Mira running Bazzite, with an RTX 5090 (32 GB of VRAM), a 16-core Ryzen 9 9950X and 123 GiB of RAM. All inference runs on this machine.',
    'The engine is one llama.cpp build compiled from a pinned commit with sm_120 (Blackwell) support, which the packaged builds did not have when the card came out. It serves the Anthropic Messages API, so Claude Code can use a local model directly through `claude --local`.'
  ],

  switching:
    'Only one of the four backends fits in VRAM at a time. `ai use <model>` stops the running backend, waits until nvidia-smi reports the memory as free, and then starts the next one. A switch therefore never fails halfway through loading.',

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
      note: 'The default for interactive use, and the fastest of the four'
    },
    {
      name: 'qwen3.8-27b',
      architecture: 'Dense 27B · hybrid attention',
      context: '163,840',
      speed: '113 tok/s',
      note: 'Dense model, used for quality at long context'
    },
    {
      name: 'muse-glimmer-30b',
      architecture: 'Dense 30B · f16 KV cache',
      context: '131,072',
      speed: '83 tok/s',
      note: 'Uses 21 GB of VRAM, leaving about 11 GB free'
    },
    {
      name: 'qwen3.8-flash-next',
      architecture: 'MoE 180B · experts in system RAM',
      context: '262,144',
      speed: '27 tok/s',
      note: 'The largest; keeps about 80 GiB of its experts in system RAM'
    }
  ] satisfies readonly ModelRow[],

  alwaysOn:
    'Five services run beside the engine: Open WebUI for chat, SearXNG for web search, Docling for document parsing (on the CPU, to keep the GPU free), Tika for text extraction and MCPO for MCP tools over HTTP. Each one listens only on the loopback interface and requires a bearer token.'
};

/**
 * One line of typed terminal output. `prompt` is the `user@host:~$` prefix
 * rendered in the accent color; a line without one is program output.
 */
export interface TerminalLine {
  prompt?: string;
  text: string;
}

/**
 * The lines the terminal screen types for the static sections — one source
 * for the 3D screen texture and the DOM fallback card. The `work` and
 * `stack` screens are composed from CURATED_PROJECTS / STACK at runtime.
 *
 * Keep every line to 36 columns or fewer: the screen-text machine will
 * truncate longer ones, but the copy should fit on its own.
 */
/** The `user@host:~$` prompt rendered in the accent color. */
export const TERMINAL_PROMPT = 'joshua@t-c:~$';

export const TERMINAL: Record<'hero' | 'about' | 'contact', readonly TerminalLine[]> = {
  hero: [
    { prompt: TERMINAL_PROMPT, text: 'cat /etc/whoami' },
    { text: SITE_META.name },
    { prompt: TERMINAL_PROMPT, text: 'cat /etc/pronouns' },
    { text: SITE_META.pronouns },
    { prompt: TERMINAL_PROMPT, text: 'echo $STATUS' },
    { text: SITE_META.status }
  ],
  about: [
    { prompt: TERMINAL_PROMPT, text: 'cat about.md' },
    { text: 'CS student, Colorado School of Mines' },
    { text: 'Runs a homelab and the servers' },
    { text: 'for Minecraft at Mines (700+).' },
    { text: 'Four LLMs on one RTX 5090.' }
  ],
  contact: [
    { prompt: TERMINAL_PROMPT, text: 'contact --help' },
    { text: 'joshua_t-c@outlook.com' },
    { text: 'github.com/JoshT-C' }
  ]
};
