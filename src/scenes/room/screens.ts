/**
 * What the room's screens show. Painted once into canvases; the only thing
 * that changes after that is a cursor blink, so nothing re-uploads per frame.
 *
 * Every number on them comes from the content modules (STACK, NODES,
 * SERVICES) — the screens are a view of the same facts the panels list,
 * not decoration that could drift from them.
 */
import { ACTIVE_BACKEND, DIAGRAMS, NODES, SERVICES } from '../../app/services/content/homelab';
import { STACK } from '../../app/services/content/projects';
import { canvas2d } from './textures';
import { paintDiagrams } from './whiteboard';

const FONT = '"IBM Plex Mono", monospace';
const BG = '#0b0f14';
const DIM = '#6b7885';
const INK = '#c9d3dc';
const ACCENT = '#66f2a6';

function titleBar(ctx: CanvasRenderingContext2D, w: number, text: string): void {
  ctx.fillStyle = '#161d25';
  ctx.fillRect(0, 0, w, 44);
  ctx.fillStyle = DIM;
  ctx.font = `500 22px ${FONT}`;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 20, 23);
}

/** The big monitor: `ai status` on the Thelio — which backend holds the
 *  card, the four models' measured numbers, the services around them. */
export function paintStackMonitor(): HTMLCanvasElement {
  const w = 1600;
  const h = 900;
  const [c, ctx] = canvas2d(w, h);
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, w, h);
  titleBar(ctx, w, 'thelio — ai status');

  ctx.textBaseline = 'alphabetic';
  let y = 110;
  ctx.font = `500 30px ${FONT}`;
  ctx.fillStyle = ACCENT;
  ctx.fillText('$', 40, y);
  ctx.fillStyle = INK;
  ctx.fillText('ai status', 72, y);

  y += 64;
  ctx.font = `500 24px ${FONT}`;
  ctx.fillStyle = DIM;
  const cols = [40, 520, 900, 1150, 1360];
  ['backend', 'shape', 'context', 'decode', 'state'].forEach((t, i) => ctx.fillText(t, cols[i], y));
  ctx.fillStyle = '#26303a';
  ctx.fillRect(40, y + 14, w - 80, 2);

  STACK.models.forEach((m, i) => {
    y += 56;
    const active = i === ACTIVE_BACKEND;
    if (active) {
      ctx.fillStyle = 'rgba(102, 242, 166, 0.08)';
      ctx.fillRect(30, y - 36, w - 60, 50);
    }
    ctx.font = `500 26px ${FONT}`;
    ctx.fillStyle = active ? ACCENT : INK;
    ctx.fillText(m.name, cols[0], y);
    ctx.fillStyle = DIM;
    ctx.fillText(m.architecture, cols[1], y);
    ctx.fillText(m.context, cols[2], y);
    ctx.fillStyle = INK;
    ctx.fillText(m.speed, cols[3], y);
    ctx.fillStyle = active ? ACCENT : '#3d4853';
    ctx.fillText(active ? '● resident' : '○ idle', cols[4], y);
  });

  // one card, one resident model: the constraint the whole stack is built on
  y += 80;
  const thelio = NODES.find(n => n.id === 'thelio');
  ctx.font = `500 24px ${FONT}`;
  ctx.fillStyle = DIM;
  ctx.fillText(`gpu  ${thelio?.gpu ?? ''}`, 40, y);
  ctx.fillText('only one backend fits on the card at a time', 700, y);

  y += 70;
  ctx.fillStyle = DIM;
  ctx.fillText('services', 40, y);
  SERVICES.forEach((s, i) => {
    const x = 40 + (i % 3) * 500;
    const yy = y + 44 + Math.floor(i / 3) * 44;
    ctx.fillStyle = ACCENT;
    ctx.fillText('●', x, yy);
    ctx.fillStyle = INK;
    ctx.fillText(s.name, x + 30, yy);
  });
  return c;
}

/** The middle monitor: the delegation diagram, on screen. */
export function paintDiagramMonitor(): HTMLCanvasElement {
  const diagram = DIAGRAMS.find(d => d.title.startsWith('delegation')) ?? DIAGRAMS[0];
  return paintDiagrams([diagram], 'screen', 1600, 900);
}

/** The laptop: the secondary stack's own facts. */
export function paintLaptop(): HTMLCanvasElement {
  const w = 1024;
  const h = 640;
  const [c, ctx] = canvas2d(w, h);
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, w, h);
  titleBar(ctx, w, 'laptop — secondary stack');
  const node = NODES.find(n => n.id === 'laptop');
  const lines = [
    '$ nvidia-smi --query-gpu=name',
    node?.gpu ?? '',
    '$ lscpu | grep "Model name"',
    node?.cpu ?? '',
    '$ cat /etc/role',
    'Qwen3.6-35B-A3B coding worker',
    '2 slots · 131,072 ctx each',
    '~42 tok/s decode under load',
    'WSL2 · every service on loopback'
  ].filter(Boolean);
  ctx.font = `500 26px ${FONT}`;
  ctx.textBaseline = 'alphabetic';
  let y = 100;
  for (const line of lines) {
    if (line.startsWith('$ ')) {
      ctx.fillStyle = ACCENT;
      ctx.fillText('$', 28, y);
      ctx.fillStyle = INK;
      ctx.fillText(line.slice(2), 56, y);
    } else {
      ctx.fillStyle = DIM;
      ctx.fillText(line, 28, y);
    }
    y += 56;
  }
  return c;
}

/** Label-maker tape: black on off-white, embossed-looking. */
export function paintLabel(text: string): HTMLCanvasElement {
  const [c, ctx] = canvas2d(8, 64);
  ctx.font = `600 44px ${FONT}`;
  const tw = Math.ceil(ctx.measureText(text).width) + 36;
  c.width = tw; // resizing clears the canvas and its state
  ctx.fillStyle = '#e8e2cf';
  ctx.fillRect(0, 0, tw, 64);
  ctx.font = `600 44px ${FONT}`;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#141414';
  ctx.fillText(text, 18, 34);
  return c;
}

