/**
 * The homelab: machines, the ai-stack's services, the whiteboard diagrams
 * and the floppy shelf. One source for both render paths — the 3D room
 * paints its props from this, and the DOM panels render the same data as
 * text and SVG.
 *
 * Same public-safety rule as projects.ts (and the same spec gate): no
 * ports, addresses or credentials. A field that is not known is `null`,
 * and null fields are not rendered anywhere — nothing here is guessed.
 */
import { CURATED_PROJECTS, STACK } from './projects';

export type NodeId = 'thelio' | 'arcb60' | 'rtxpro' | 'laptop';

export interface HomelabNode {
  readonly id: NodeId;
  readonly chassis: string | null;
  readonly cpu: string | null;
  readonly gpu: string | null;
  readonly memory: string | null;
  /** What the machine is for. */
  readonly role: string | null;
  /** Label-maker tape on the physical prop. */
  readonly tape: string;
}

export const NODES: readonly HomelabNode[] = [
  {
    id: 'thelio',
    chassis: 'System76 Thelio Mira',
    cpu: 'Ryzen 9 9950X · 16 cores / 32 threads',
    gpu: 'RTX 5090 · 32 GB',
    memory: '123 GiB',
    role: 'Inference host for the AI stack. One of its four models is loaded on the GPU at any time.',
    tape: 'thelio · rtx 5090'
  },
  {
    id: 'arcb60',
    chassis: null,
    cpu: 'Core i9-14900',
    gpu: 'Intel Arc B60',
    memory: '64 GB DDR5',
    role: null,
    tape: 'arcb60 · arc b60'
  },
  {
    id: 'rtxpro',
    chassis: 'Minisforum MS-02 Ultra',
    cpu: null,
    gpu: 'RTX PRO 2000',
    memory: '128 GB DDR5 ECC',
    role: null,
    tape: 'rtxpro · ms-02 ultra'
  },
  {
    id: 'laptop',
    chassis: null,
    cpu: 'Core i9-13900HX · 32 threads',
    gpu: 'RTX 4080 Laptop · 12 GB',
    memory: '47 GiB',
    role: 'Second inference machine. Runs Qwen3.6-35B-A3B under WSL2 as a local coding worker.',
    tape: 'laptop · rtx 4080'
  }
];

export interface StackService {
  readonly name: string;
  readonly does: string;
}

/** The always-on harness around the engine (the backends are STACK.models). */
export const SERVICES: readonly StackService[] = [
  { name: 'open-webui', does: 'chat interface for all four backends' },
  { name: 'searxng', does: 'self-hosted web search' },
  { name: 'docling', does: 'document parsing on the CPU' },
  { name: 'tika', does: 'text extraction' },
  { name: 'mcpo', does: 'MCP tool servers over HTTP' }
];

/** The backend the rack shows lit: the interactive default. */
export const ACTIVE_BACKEND = STACK.models.findIndex(m => m.note.toLowerCase().includes('default'));

/** Whiteboard diagrams: boxes placed in 0-1 panel coordinates. */
export interface DiagramNode {
  readonly id: string;
  readonly label: string;
  /** Centre, 0-1 within the diagram's panel. */
  readonly x: number;
  readonly y: number;
  readonly ink?: Ink;
}

export interface DiagramEdge {
  readonly from: string;
  readonly to: string;
  readonly label?: string;
  readonly dashed?: boolean;
}

export interface Diagram {
  readonly title: string;
  readonly nodes: readonly DiagramNode[];
  readonly edges: readonly DiagramEdge[];
}

export type Ink = 'black' | 'blue' | 'red' | 'green';

export const DIAGRAMS: readonly Diagram[] = [
  {
    title: 'ai-stack: loopback only',
    nodes: [
      { id: 'webui', label: 'open-webui', x: 0.12, y: 0.06 },
      { id: 'cc', label: 'claude --local', x: 0.5, y: 0.06 },
      { id: 'oc', label: 'opencode', x: 0.88, y: 0.06 },
      { id: 'lo', label: 'loopback + bearer', x: 0.5, y: 0.38, ink: 'black' },
      { id: 'engine', label: 'llama.cpp (1 of 4)', x: 0.5, y: 0.66, ink: 'green' },
      { id: 'gpu', label: 'rtx 5090 · 32 GB', x: 0.5, y: 0.94, ink: 'red' }
    ],
    edges: [
      { from: 'webui', to: 'lo' },
      { from: 'cc', to: 'lo' },
      { from: 'oc', to: 'lo' },
      { from: 'lo', to: 'engine' },
      { from: 'engine', to: 'gpu', label: 'ai use <model>' }
    ]
  },
  {
    title: 'delegation: one slot',
    nodes: [
      { id: 'orch', label: 'cloud orchestrator', x: 0.5, y: 0.06, ink: 'black' },
      { id: 'slot', label: 'ai-delegate (lock)', x: 0.5, y: 0.36, ink: 'red' },
      { id: 'worker', label: 'local qwen worker', x: 0.5, y: 0.66, ink: 'green' },
      { id: 'diff', label: 'git diff', x: 0.18, y: 0.94 },
      { id: 'checks', label: 'build + tests', x: 0.82, y: 0.94 }
    ],
    edges: [
      { from: 'orch', to: 'slot', label: 'spec' },
      { from: 'slot', to: 'worker', label: 'read/edit only' },
      { from: 'worker', to: 'diff' },
      { from: 'diff', to: 'checks' },
      { from: 'checks', to: 'orch', label: 'review', dashed: true }
    ]
  }
];

export interface Floppy {
  readonly id: string;
  /** Written on the disk label: short. */
  readonly label: string;
  readonly title: string;
  readonly body: string;
  /** Short facts the whiteboard writes out when this disk is picked. */
  readonly notes: readonly string[];
  readonly tags: readonly string[];
  readonly href: string | null;
  readonly hrefLabel: string | null;
}

const curated = (id: string, notes: readonly string[]): Floppy => {
  const p = CURATED_PROJECTS.find(c => c.id === id);
  if (!p) throw new Error(`no curated project ${id}`);
  return { id: p.id, label: p.id, title: p.title, body: p.body, notes, tags: p.tags, href: p.href, hrefLabel: p.hrefLabel };
};

/** The shelf: front row left to right, then the back row. */
export const FLOPPIES: readonly Floppy[] = [
  curated('ai-stack', ['1 GPU, 4 models, 1 loaded', 'llama.cpp, pinned build', 'loopback only + bearer auth']),
  {
    id: 'claude-local',
    label: 'claude-local',
    title: 'Claude Code on local models',
    body: 'A launcher finds whichever backend is running and points Claude Code at it for one session. Between the two sits a small Python proxy. It moves mid-conversation system messages into the user turn (the Qwen chat templates reject them), sends keep-alive pings while a long prompt is processed, and answers the connectivity probe that would otherwise log an auth error.',
    notes: ['finds the running backend', 'system msgs -> user turn', 'SSE pings during prefill'],
    tags: ['Claude Code', 'llama.cpp', 'Python'],
    href: null,
    hrefLabel: null
  },
  {
    id: 'delegation',
    label: 'delegation',
    title: 'Delegating code to a local model',
    body: 'Claude writes a specification and reviews the result; a local Qwen model writes the code. The GPU fits one worker, so a file lock allows one job at a time. The worker can read and edit files but cannot run commands, and every change is built and tested before it is kept.',
    notes: ['cloud: spec + review', 'local qwen: writes code', '1 GPU = 1 job (flock)', 'worker has no shell'],
    tags: ['agents', 'orchestration'],
    href: null,
    hrefLabel: null
  },
  {
    id: 'bench',
    label: 'bench',
    title: 'Benchmark method',
    body: 'Every speed on this site is the median of at least three runs, and each run uses a different prompt nonce. Single runs varied by up to 20%, so a difference under 8% is reported as a tie.',
    notes: ['median of >= 3 runs', 'new prompt nonce per run', 'single runs: +/-20%', 'under 8% = tie'],
    tags: ['benchmarking'],
    href: null,
    hrefLabel: null
  },
  {
    id: 'laptop-stack',
    label: 'laptop-stack',
    title: 'The laptop stack',
    body: 'The same setup on an RTX 4080 Laptop GPU with 12 GB: Qwen3.6-35B-A3B under WSL2, with the expert layers held in system RAM. It decodes about 42 tokens per second across two slots with a 131,072-token context each, and solved 162 of 164 HumanEval problems with greedy decoding.',
    notes: ['RTX 4080 Laptop, 12 GB', '~42 tok/s over 2 slots', 'HumanEval 162/164'],
    tags: ['RTX 4080 Laptop', 'WSL2'],
    href: null,
    hrefLabel: null
  },
  curated('previous-site', ['Angular on GitHub Pages', 'still online for comparison'])
];
