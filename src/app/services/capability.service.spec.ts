import { decide3D, type CapabilityProbe } from './capability.service';

function probe(overrides: Partial<CapabilityProbe> = {}): CapabilityProbe {
  return {
    no3d: false,
    reducedMotion: false,
    webgl: true,
    mobile: false,
    deviceMemory: 8,
    hardwareConcurrency: 8,
    ...overrides
  };
}

describe('decide3D', () => {
  it('lets a capable machine through', () => {
    expect(decide3D(probe())).toEqual({ render: '3d', reason: 'ok' });
  });

  it('honors the ?no3d=1 user override before anything else', () => {
    // Even a hypothetical perfect machine.
    expect(decide3D(probe({ no3d: true }))).toEqual({ render: 'css', reason: 'user-override' });
  });

  it('respects prefers-reduced-motion over hardware capability', () => {
    expect(decide3D(probe({ reducedMotion: true }))).toEqual({ render: 'css', reason: 'reduced-motion' });
  });

  it('falls back when WebGL is missing', () => {
    expect(decide3D(probe({ webgl: false }))).toEqual({ render: 'css', reason: 'no-webgl' });
  });

  it('falls back on coarse-pointer mobile devices', () => {
    expect(decide3D(probe({ mobile: true }))).toEqual({ render: 'css', reason: 'mobile' });
  });

  it('falls back at the 4 GiB deviceMemory threshold', () => {
    expect(decide3D(probe({ deviceMemory: 4 }))).toEqual({ render: 'css', reason: 'low-memory' });
    expect(decide3D(probe({ deviceMemory: 8 }))).toEqual({ render: '3d', reason: 'ok' });
  });

  it('falls back at the 4-core threshold', () => {
    expect(decide3D(probe({ hardwareConcurrency: 4 }))).toEqual({ render: 'css', reason: 'low-cores' });
    expect(decide3D(probe({ hardwareConcurrency: 8 }))).toEqual({ render: '3d', reason: 'ok' });
  });

  it('treats missing hints (Safari) as "unknown, allow"', () => {
    expect(decide3D(probe({ deviceMemory: undefined, hardwareConcurrency: undefined })))
      .toEqual({ render: '3d', reason: 'ok' });
  });

  it('checks signals in documented order: override > motion > webgl > mobile > memory > cores', () => {
    const p = probe({
      no3d: true, reducedMotion: true, webgl: false, mobile: true,
      deviceMemory: 2, hardwareConcurrency: 2
    });
    expect(decide3D(p).reason).toBe('user-override');

    const noOverride = { ...p, no3d: false };
    expect(decide3D(noOverride).reason).toBe('reduced-motion');

    expect(decide3D({ ...noOverride, reducedMotion: false }).reason).toBe('no-webgl');
    expect(decide3D({ ...noOverride, reducedMotion: false, webgl: true }).reason).toBe('mobile');
    expect(decide3D({ ...noOverride, reducedMotion: false, webgl: true, mobile: false }).reason).toBe('low-memory');
    expect(decide3D({ ...noOverride, reducedMotion: false, webgl: true, mobile: false, deviceMemory: 8 }).reason).toBe('low-cores');
    expect(decide3D({ ...noOverride, reducedMotion: false, webgl: true, mobile: false, deviceMemory: 8, hardwareConcurrency: 8 }).reason).toBe('ok');
  });
});
