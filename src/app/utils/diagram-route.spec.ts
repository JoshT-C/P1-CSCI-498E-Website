import { routeEdge } from './diagram-route';

describe('routeEdge', () => {
  const box = (x: number, y: number) => ({ x, y, w: 100, h: 40 });

  it('runs a straight edge border to border, with the label to its right', () => {
    const r = routeEdge(box(0, 0), box(0, 200), false, 4, 10);
    expect(r.points).toEqual([
      [0, 24],
      [0, 176]
    ]);
    expect(r.label.x).toBeGreaterThan(0);
    expect(r.label.y).toBe(100);
  });

  it('routes an elbow up the source column, then across into the target side', () => {
    const r = routeEdge(box(400, 300), box(100, 0), true, 4, 10);
    expect(r.points).toEqual([
      [400, 276],
      [400, 0],
      [154, 0]
    ]);
    // the label sits above the across stretch, not over the column
    expect(r.label.y).toBeLessThan(0);
    expect(r.label.x).toBeGreaterThan(154);
    expect(r.label.x).toBeLessThan(400);
  });
});
