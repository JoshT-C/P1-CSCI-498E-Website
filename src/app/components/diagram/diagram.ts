import { Component, computed, input } from '@angular/core';
import type { Diagram } from '../../services/content/homelab';
import { routeEdge } from '../../utils/diagram-route';

const W = 640;
const H = 420;
const BOX_H = 40;
const CHAR_W = 8.4;

interface Box {
  readonly id: string;
  readonly label: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly ink: string;
}

/**
 * A whiteboard diagram as SVG — the accessible twin of the marker drawing
 * in the room. Same data (content/homelab DIAGRAMS), so the two cannot
 * drift. The figure caption lists every edge as text for screen readers.
 */
@Component({
  selector: 'app-diagram',
  template: `
    <figure class="diagram">
      <svg [attr.viewBox]="'0 0 ' + width + ' ' + height" role="img" [attr.aria-labelledby]="captionId()">
        <defs>
          <marker [attr.id]="markerId()" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" class="diagram__arrow" />
          </marker>
        </defs>
        @for (e of edges(); track $index) {
          <polyline
            [attr.points]="e.points"
            class="diagram__edge" [class.diagram__edge--dashed]="e.dashed"
            [attr.marker-end]="'url(#' + markerId() + ')'" />
          @if (e.label) {
            <text [attr.x]="e.lx" [attr.y]="e.ly" dominant-baseline="middle" class="diagram__edge-label">{{ e.label }}</text>
          }
        }
        @for (b of boxes(); track b.id) {
          <rect [attr.x]="b.x - b.w / 2" [attr.y]="b.y - boxH / 2" [attr.width]="b.w" [attr.height]="boxH" rx="3"
            class="diagram__box" [attr.data-ink]="b.ink" />
          <text [attr.x]="b.x" [attr.y]="b.y + 5" text-anchor="middle" class="diagram__label" [attr.data-ink]="b.ink">{{ b.label }}</text>
        }
      </svg>
      <figcaption [id]="captionId()">
        <span class="diagram__title">{{ diagram().title }}</span>
        <span class="visually-hidden">
          @for (e of diagram().edges; track $index) {
            {{ labelOf(e.from) }} to {{ labelOf(e.to) }}{{ e.label ? ' (' + e.label + ')' : '' }}.
          }
        </span>
      </figcaption>
    </figure>
  `
})
export class DiagramComponent {
  readonly diagram = input.required<Diagram>();
  readonly width = W;
  readonly height = H;
  readonly boxH = BOX_H;

  private readonly slug = computed(() => this.diagram().title.replace(/[^a-z0-9]+/gi, '-').toLowerCase());
  readonly captionId = computed(() => `diagram-${this.slug()}`);
  readonly markerId = computed(() => `arrow-${this.slug()}`);

  readonly boxes = computed<Box[]>(() =>
    this.diagram().nodes.map(n => ({
      id: n.id,
      label: n.label,
      x: 40 + n.x * (W - 80),
      y: 30 + n.y * (H - 60),
      w: n.label.length * CHAR_W + 24,
      ink: n.ink ?? 'blue'
    }))
  );

  readonly edges = computed(() => {
    const byId = new Map(this.boxes().map(b => [b.id, b]));
    return this.diagram().edges.flatMap(e => {
      const a = byId.get(e.from);
      const b = byId.get(e.to);
      if (!a || !b) return [];
      const r = routeEdge({ ...a, h: BOX_H }, { ...b, h: BOX_H }, !!e.elbow, 4, 10);
      const points = r.points.map(p => p.join(',')).join(' ');
      return [{ points, lx: r.label.x, ly: r.label.y, label: e.label, dashed: !!e.dashed }];
    });
  });

  labelOf(id: string): string {
    return this.diagram().nodes.find(n => n.id === id)?.label ?? id;
  }
}
