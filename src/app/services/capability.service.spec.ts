import {
  decideTier,
  isTier,
  stepDown,
  type CapabilityDecision,
  type CapabilityProbe,
  type Tier
} from './capability.service';

/** A capable desktop: no signal against it, so the baseline decision is 'room'. */
function probe(overrides: Partial<CapabilityProbe> = {}): CapabilityProbe {
  return {
    forced: null,
    no3d: false,
    reducedMotion: false,
    webgl: true,
    mobile: false,
    deviceMemory: 8,
    hardwareConcurrency: 8,
    ...overrides
  };
}

interface CaseRow {
  readonly name: string;
  readonly overrides: Partial<CapabilityProbe>;
  readonly expected: CapabilityDecision;
}

const WEAK_EVERYTHING: Partial<CapabilityProbe> = {
  no3d: true,
  reducedMotion: true,
  webgl: false,
  mobile: true,
  deviceMemory: 2,
  hardwareConcurrency: 2
};

const CASES: readonly CaseRow[] = [
  {
    name: 'a forced tier wins over every other signal',
    overrides: { forced: 'desk', ...WEAK_EVERYTHING },
    expected: { tier: 'desk', reason: 'forced' }
  },
  {
    name: 'forced room likewise wins',
    overrides: { forced: 'room', ...WEAK_EVERYTHING },
    expected: { tier: 'room', reason: 'forced' }
  },
  {
    name: 'forced css likewise wins',
    overrides: { forced: 'css', ...WEAK_EVERYTHING },
    expected: { tier: 'css', reason: 'forced' }
  },
  {
    name: 'the ?no3d user override beats hardware',
    overrides: { ...WEAK_EVERYTHING },
    expected: { tier: 'css', reason: 'user-override' }
  },
  {
    name: 'reduced motion beats hardware',
    overrides: { reducedMotion: true, webgl: false, mobile: true, deviceMemory: 2, hardwareConcurrency: 2 },
    expected: { tier: 'css', reason: 'reduced-motion' }
  },
  {
    name: 'missing WebGL falls back to the flat page',
    overrides: { webgl: false, mobile: true, deviceMemory: 2, hardwareConcurrency: 2 },
    expected: { tier: 'css', reason: 'no-webgl' }
  },
  {
    name: 'mobile hardware still gets the desk',
    overrides: { mobile: true, deviceMemory: 2, hardwareConcurrency: 2 },
    expected: { tier: 'desk', reason: 'mobile' }
  },
  {
    name: '4 GiB deviceMemory lands on the desk',
    overrides: { deviceMemory: 4 },
    expected: { tier: 'desk', reason: 'low-memory' }
  },
  {
    name: '2 GiB deviceMemory lands on the desk',
    overrides: { deviceMemory: 2 },
    expected: { tier: 'desk', reason: 'low-memory' }
  },
  {
    name: '8 GiB deviceMemory is fine',
    overrides: { deviceMemory: 8 },
    expected: { tier: 'room', reason: 'ok' }
  },
  {
    name: '4 cores lands on the desk',
    overrides: { hardwareConcurrency: 4 },
    expected: { tier: 'desk', reason: 'low-cores' }
  },
  {
    name: '8 cores is fine',
    overrides: { hardwareConcurrency: 8 },
    expected: { tier: 'room', reason: 'ok' }
  },
  {
    name: 'missing hints (Safari) are treated as unknown, allow',
    overrides: { deviceMemory: undefined, hardwareConcurrency: undefined },
    expected: { tier: 'room', reason: 'ok' }
  },
  {
    name: 'a capable machine gets the room',
    overrides: {},
    expected: { tier: 'room', reason: 'ok' }
  }
];

describe('decideTier', () => {
  for (const { name, overrides, expected } of CASES) {
    it(name, () => {
      expect(decideTier(probe(overrides))).toEqual(expected);
    });
  }

  it('checks signals in documented order: forced > override > motion > webgl > mobile > memory > cores', () => {
    const p = probe({ forced: 'desk', ...WEAK_EVERYTHING });
    expect(decideTier(p).reason).toBe('forced');

    const noForced = { ...p, forced: null };
    expect(decideTier(noForced).reason).toBe('user-override');
    expect(decideTier({ ...noForced, no3d: false }).reason).toBe('reduced-motion');
    expect(decideTier({ ...noForced, no3d: false, reducedMotion: false }).reason).toBe('no-webgl');
    expect(decideTier({ ...noForced, no3d: false, reducedMotion: false, webgl: true }).reason).toBe('mobile');
    expect(
      decideTier({ ...noForced, no3d: false, reducedMotion: false, webgl: true, mobile: false }).reason
    ).toBe('low-memory');
    expect(
      decideTier({
        ...noForced, no3d: false, reducedMotion: false, webgl: true, mobile: false, deviceMemory: 8
      }).reason
    ).toBe('low-cores');
    expect(
      decideTier({
        ...noForced, no3d: false, reducedMotion: false, webgl: true, mobile: false,
        deviceMemory: 8, hardwareConcurrency: 8
      }).reason
    ).toBe('ok');
  });
});

describe('stepDown', () => {
  it('steps room → desk → css and stays at css', () => {
    expect(stepDown('room')).toBe('desk');
    expect(stepDown('desk')).toBe('css');
    expect(stepDown('css')).toBe('css');
  });
});

describe('isTier', () => {
  it('accepts exactly the three tiers', () => {
    for (const tier of ['room', 'desk', 'css'] as readonly Tier[]) {
      expect(isTier(tier)).toBe(true);
    }
  });

  it('rejects null, empty, and anything not a tier', () => {
    for (const value of [null, '', 'ROOM', '3d', 'css ']) {
      expect(isTier(value)).toBe(false);
    }
  });
});
