/**
 * The whiteboard, drawn in dry-wipe marker, and the middle monitor's
 * diagram (same drawing code, phosphor-on-dark).
 *
 * The board mirrors what is selected in the room: with nothing open it
 * shows the model lineup with the loaded model circled; open the rack and
 * it lists the machines; pick a floppy and it shows that project's notes;
 * open the laptop and it shows its stack; open the board itself and it
 * shows the architecture diagrams. Everything it writes comes from the
 * content modules.
 *
 * Marker look: each stroke is drawn twice with a sub-pixel jitter, box
 * corners overshoot, and faint smears of erased work sit underneath.
 */
import {
  ACTIVE_BACKEND,
  DIAGRAMS,
  FLOPPIES,
  NODES,
  type Diagram,
  type DiagramNode,
  type Ink
} from '../../app/services/content/homelab';
import { STACK } from '../../app/services/content/projects';
import { routeEdge } from '../../app/utils/diagram-route';
import { canvas2d, rng } from './textures';

export type DiagramTheme = 'marker' | 'screen';

export type WhiteboardView =
  | { readonly kind: 'models' }
  | { readonly kind: 'machines' }
  | { readonly kind: 'diagrams' }
  | { readonly kind: 'laptop' }
  | { readonly kind: 'project'; readonly id: string };

const MARKER_INK: Record<Ink, string> = {
  black: '#23262b',
  blue: '#2a4f9c',
  red: '#a8352c',
  green: '#2e7a4a'
};

const SCREEN_INK: Record<Ink, string> = {
  black: '#9aa89c',
  blue: '#7fa7ff',
  red: '#ff8a7a',
  green: '#66f2a6'
};

const FONT = '"IBM Plex Mono", monospace';

/** Marker primitives over one canvas. */
class Pen {
  private readonly r = rng(71);
  constructor(
    readonly ctx: CanvasRenderingContext2D,
    private readonly marker: boolean
  ) {}

  private jitter(): number {
    return this.marker ? (this.r() - 0.5) * 2.2 : 0;
  }

  line(x0: number, y0: number, x1: number, y1: number, ink: string, width = 4, dashed = false): void {
    const { ctx } = this;
    ctx.strokeStyle = ink;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.setLineDash(dashed ? [16, 12] : []);
    for (let pass = 0; pass < (this.marker ? 2 : 1); pass++) {
      ctx.globalAlpha = pass === 0 ? 0.85 : 0.35;
      ctx.beginPath();
      ctx.moveTo(x0 + this.jitter(), y0 + this.jitter());
      ctx.quadraticCurveTo((x0 + x1) / 2 + this.jitter() * 3, (y0 + y1) / 2 + this.jitter() * 3, x1 + this.jitter(), y1 + this.jitter());
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.setLineDash([]);
  }

  text(s: string, x: number, y: number, ink: string, size = 34, weight = 500): number {
    const { ctx } = this;
    ctx.font = `${weight} ${size}px ${FONT}`;
    ctx.fillStyle = ink;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(this.marker ? (this.r() - 0.5) * 0.02 : 0);
    ctx.fillText(s, 0, 0);
    ctx.restore();
    ctx.textBaseline = 'alphabetic';
    return ctx.measureText(s).width;
  }

  /** A title with a hand-drawn underline. */
  title(s: string, x: number, y: number, ink: string): void {
    const w = this.text(s, x, y, ink, 46, 600);
    this.line(x, y + 16, x + w, y + 20, ink, 3);
  }

  /** A loose loop around a box, as when you ring a row: a stadium drawn
   *  in one stroke that overshoots where it closes. An ellipse wide enough
   *  to clear a long row's corners would run into the rows beside it. */
  loop(x: number, y: number, w: number, h: number, ink: string): void {
    const { ctx } = this;
    const r = h / 2;
    ctx.strokeStyle = ink;
    ctx.lineWidth = 4;
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.moveTo(x + r + 40, y - 3);
    ctx.lineTo(x + w - r, y);
    ctx.arc(x + w - r, y + r, r, -Math.PI / 2, Math.PI / 2);
    ctx.lineTo(x + r, y + h);
    ctx.arc(x + r, y + r, r, Math.PI / 2, (Math.PI * 3) / 2);
    ctx.lineTo(x + r + 90, y + 4);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

function board(W: number, H: number, marker: boolean): [HTMLCanvasElement, Pen] {
  const [c, ctx] = canvas2d(W, H);
  const r = rng(29);
  ctx.fillStyle = marker ? '#eef0ec' : '#0b0f0d';
  ctx.fillRect(0, 0, W, H);
  // smears of erased work
  for (let i = 0; marker && i < 26; i++) {
    ctx.strokeStyle = `rgba(90, 100, 120, ${0.03 + r() * 0.04})`;
    ctx.lineWidth = 10 + r() * 30;
    ctx.beginPath();
    const x = r() * W;
    const y = r() * H;
    ctx.moveTo(x, y);
    ctx.bezierCurveTo(x + r() * 200, y - 40, x + r() * 260, y + 60, x + 120 + r() * 200, y + r() * 30);
    ctx.stroke();
  }
  return [c, new Pen(ctx, marker)];
}

export function paintDiagrams(diagrams: readonly Diagram[], theme: DiagramTheme, W = 1536, H = 1024): HTMLCanvasElement {
  const marker = theme === 'marker';
  const INK = marker ? MARKER_INK : SCREEN_INK;
  const [c, pen] = board(W, H, marker);
  const { ctx } = pen;

  const panelW = W / diagrams.length;
  diagrams.forEach((d, di) => {
    const ox = di * panelW;
    const pad = 70;
    const px = (u: number): number => ox + pad + u * (panelW - pad * 2);
    const py = (v: number): number => 170 + v * (H - 250);
    pen.title(d.title, ox + pad, 96, INK.black);

    // One box size for the whole panel, shrunk until the widest row of
    // boxes fits side by side with a gap between them.
    const inner = panelW - pad * 2;
    let size = 30;
    const widthAt = (label: string): number => {
      ctx.font = `500 ${size}px ${FONT}`;
      return ctx.measureText(label).width + size * 1.4;
    };
    const rows = new Map<number, DiagramNode[]>();
    for (const n of d.nodes) rows.set(n.y, [...(rows.get(n.y) ?? []), n]);
    const fits = (): boolean =>
      [...rows.values()].every(row => {
        const sorted = [...row].sort((p, q) => p.x - q.x);
        return sorted.every((n, i) => {
          const half = widthAt(n.label) / 2;
          if (px(n.x) - half < ox + pad * 0.4 || px(n.x) + half > ox + pad + inner + pad * 0.6) return false;
          const next = sorted[i + 1];
          return !next || px(n.x) + half + 24 < px(next.x) - widthAt(next.label) / 2;
        });
      });
    while (size > 18 && !fits()) size -= 1;
    const boxH = size * 2.1;
    const boxes = new Map<string, { x: number; y: number; w: number; h: number }>();
    for (const n of d.nodes) boxes.set(n.id, { x: px(n.x), y: py(n.y), w: widthAt(n.label), h: boxH });

    for (const e of d.edges) {
      const a = boxes.get(e.from);
      const b = boxes.get(e.to);
      if (!a || !b) continue;
      const r = routeEdge(a, b, !!e.elbow, 8, 22);
      for (let k = 0; k + 1 < r.points.length; k++) {
        const [x0, y0] = r.points[k];
        const [x1, y1] = r.points[k + 1];
        pen.line(x0, y0, x1, y1, INK.black, 3.5, e.dashed);
      }
      // arrowhead along the last stretch
      const [x0, y0] = r.points[r.points.length - 2];
      const [x1, y1] = r.points[r.points.length - 1];
      const ang = Math.atan2(y1 - y0, x1 - x0);
      pen.line(x1, y1, x1 - 22 * Math.cos(ang - 0.45), y1 - 22 * Math.sin(ang - 0.45), INK.black, 3.5);
      pen.line(x1, y1, x1 - 22 * Math.cos(ang + 0.45), y1 - 22 * Math.sin(ang + 0.45), INK.black, 3.5);
      if (e.label) {
        ctx.textBaseline = 'middle';
        pen.text(e.label, r.label.x, r.label.y, INK.red, 24, 400);
      }
    }

    for (const n of d.nodes) {
      const b = boxes.get(n.id)!;
      const ink = INK[n.ink ?? 'blue'];
      const x0 = b.x - b.w / 2;
      const y0 = b.y - b.h / 2;
      const o = marker ? 6 : 0;
      pen.line(x0 - o, y0, x0 + b.w + o, y0, ink);
      pen.line(x0 + b.w, y0 - o, x0 + b.w, y0 + b.h + o, ink);
      pen.line(x0 + b.w + o, y0 + b.h, x0 - o, y0 + b.h, ink);
      pen.line(x0, y0 + b.h + o, x0, y0 - o, ink);
      ctx.textAlign = 'center';
      pen.text(n.label, b.x, b.y + size / 3, ink, size);
      ctx.textAlign = 'left';
    }
  });
  return c;
}

/** The whiteboard for the current selection (see the module comment). */
export function paintWhiteboard(view: WhiteboardView, W = 1600, H = 960): HTMLCanvasElement {
  if (view.kind === 'diagrams') return paintDiagrams(DIAGRAMS, 'marker', W, H);
  const INK = MARKER_INK;
  const [c, pen] = board(W, H, true);
  const x = 80;

  if (view.kind === 'models') {
    pen.title('which model is loaded', x, 110, INK.black);
    const cols = [x, x + 560, x + 980];
    pen.text('model', cols[0], 210, INK.blue, 28);
    pen.text('context', cols[1], 210, INK.blue, 28);
    pen.text('decode', cols[2], 210, INK.blue, 28);
    STACK.models.forEach((m, i) => {
      const y = 300 + i * 110;
      pen.text(m.name, cols[0], y, INK.black, 36);
      pen.text(m.context, cols[1], y, INK.black, 36);
      const speedW = pen.text(m.speed, cols[2], y, INK.black, 36);
      if (i === ACTIVE_BACKEND) {
        const right = cols[2] + speedW + 30;
        pen.loop(cols[0] - 34, y - 52, right - cols[0] + 34, 74, INK.red);
        pen.text('loaded', right + 40, y, INK.red, 34, 600);
      }
    });
    pen.text('32 GB of VRAM holds one model at a time.', x, H - 90, INK.green, 32);
  } else if (view.kind === 'machines') {
    pen.title('machines', x, 110, INK.black);
    // one row per machine: name, then gpu / cpu / memory in columns
    const cols = [x + 30, x + 460, x + 1170];
    ['gpu', 'cpu', 'memory'].forEach((h, k) => pen.text(h, cols[k], 200, INK.blue, 26));
    NODES.forEach((n, i) => {
      const y = 280 + i * 160;
      pen.text(n.tape, x, y, INK.black, 38, 600);
      [n.gpu, n.cpu, n.memory].forEach((f, k) => pen.text(f ?? '-', cols[k], y + 56, INK.black, 28));
    });
  } else if (view.kind === 'laptop') {
    const node = NODES.find(n => n.id === 'laptop');
    const story = FLOPPIES.find(f => f.id === 'laptop-stack');
    pen.title('laptop', x, 110, INK.black);
    [node?.gpu, node?.cpu, node?.memory].forEach((f, i) => {
      if (f) pen.text(f, x, 230 + i * 80, INK.blue, 38);
    });
    story?.notes.forEach((note, i) => pen.text(`- ${note}`, x, 520 + i * 90, INK.black, 38));
  } else {
    const f = FLOPPIES.find(p => p.id === view.id) ?? FLOPPIES[0];
    pen.title(f.title, x, 110, INK.black);
    f.notes.forEach((note, i) => pen.text(`- ${note}`, x, 250 + i * 110, INK.black, 42));
    pen.text(f.tags.join('  /  '), x, H - 90, INK.blue, 30);
  }
  return c;
}
