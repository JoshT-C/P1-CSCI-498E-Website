/**
 * Edge routing for the architecture diagrams, shared by the SVG panel and
 * the marker drawing on the whiteboard so the two lay edges out the same
 * way. Pure: boxes in, points and a label position out.
 */
export interface RouteBox {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface Route {
  /** Polyline from the source's border to the target's border. */
  readonly points: readonly (readonly [number, number])[];
  /** Label anchor; the text runs rightward from it. */
  readonly label: { readonly x: number; readonly y: number };
}

/** Where a line toward (dx, dy) leaves a box's border, plus a gap. */
function exit(b: RouteBox, dx: number, dy: number, gap: number): [number, number] {
  const len = Math.hypot(dx, dy) || 1;
  const sx = dx / len;
  const sy = dy / len;
  const tx = sx === 0 ? Infinity : b.w / 2 / Math.abs(sx);
  const ty = sy === 0 ? Infinity : b.h / 2 / Math.abs(sy);
  const t = Math.min(tx, ty) + gap;
  return [b.x + sx * t, b.y + sy * t];
}

/**
 * A straight edge between border points, or an elbow: vertical out of `a`
 * to the height of `b`, then horizontal into `b`'s side. A straight edge's
 * label sits off its middle on the right-hand side; an elbow's sits above
 * the across stretch. Either way the text runs rightward, away from the line.
 */
export function routeEdge(a: RouteBox, b: RouteBox, elbow: boolean, gap: number, offset: number): Route {
  if (elbow) {
    const up = b.y < a.y ? -1 : 1;
    const side = b.x < a.x ? 1 : -1; // enter b on the side facing a
    const start: [number, number] = [a.x, a.y + up * (a.h / 2 + gap)];
    const corner: [number, number] = [a.x, b.y];
    const end: [number, number] = [b.x + side * (b.w / 2 + gap), b.y];
    // label above the across stretch, clear of the boxes in the column
    return { points: [start, corner, end], label: { x: (corner[0] + end[0]) / 2, y: b.y - offset } };
  }
  const p0 = exit(a, b.x - a.x, b.y - a.y, gap);
  const p1 = exit(b, a.x - b.x, a.y - b.y, gap);
  const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) || 1;
  // normal pointing to the right of travel (screen space, y down)
  let nx = -(p1[1] - p0[1]) / len;
  let ny = (p1[0] - p0[0]) / len;
  // prefer the right-hand side of the line for reading
  if (nx < 0 || (nx === 0 && ny < 0)) {
    nx = -nx;
    ny = -ny;
  }
  const mx = (p0[0] + p1[0]) / 2;
  const my = (p0[1] + p1[1]) / 2;
  return {
    points: [p0, p1],
    label: { x: mx + nx * offset, y: my + ny * offset }
  };
}
