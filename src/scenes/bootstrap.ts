/**
 * The 3D scene's lifecycle. This is the ONLY module the Angular side
 * imports (lazily, from SceneCanvasComponent) — three.js stays out of the
 * initial bundle.
 *
 * Data flow: SceneSyncService signals are subscribed once via
 * asObservable() into a plain state object the rAF loop reads. Nothing in
 * the loop touches Angular; the scene talks back only through the
 * onPick/onHover/onPortal callbacks, and only when something changes.
 *
 * Every failure path calls onDowngrade exactly once and disposes itself:
 * WebGL unavailable, context lost, or the fps budget lost (the capability
 * service then steps down a tier: room → desk → CSS).
 */
import * as THREE from 'three';
import type { Injector, Signal } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import type { Subscription } from 'rxjs';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { CAMERA_TAU_MS, DPR_CAP, FONT_WAIT_MS, FPS_BUDGET, WARMUP } from '../app/config/scene.config';
import { SCENE_TYPING } from '../app/config/terminal.config';
import { SITE_SECTIONS, type SiteSection } from '../app/config/site.config';
import { fitPose, fovForAspect, PORTAL_AT, STATION_POSES, spinePose, type CameraPose, type FittedShot, type Vec3 } from './camera-path';
import { loadRoom, type Room, type Tier } from './room';
import { isStationId, ROOM_MAX, ROOM_MIN, type StationId } from './room/layout';
import { buildScreenLines, SCREEN_MAX_COLS } from './screen-content';
import { createTerminal } from './screen-text';
import { FilmShader } from './shaders/film';
import { createTextScreen, type TextScreen } from './text-screen';

export type { Tier } from './room';

/** The subset of SceneSyncService the scene reads (structural, so this file
 *  never imports the service). */
export interface SceneSyncSource {
  readonly activeSection: Signal<string>;
  readonly workProjects: Signal<readonly string[]>;
  readonly station: Signal<StationId | null>;
  readonly floppy: Signal<string | null>;
}

export interface SceneHandle {
  dispose(): void;
}

export interface CreateSceneOptions {
  host: HTMLElement;
  /** The intro element whose scroll drives the camera spine. */
  intro: HTMLElement;
  tier: Tier;
  sync: SceneSyncSource;
  /** The component's injector: toObservable() would otherwise call
   *  inject(Injector) internally, which throws outside an injection
   *  context (this runs from a dynamic-import .then callback). */
  injector: Injector;
  onDowngrade: (reason: string) => void;
  /** A prop was clicked. `item` is set for the floppies. */
  onPick: (station: StationId, item: string | null) => void;
  /** The prop under the pointer changed (null: none), with client coords. */
  onHover: (station: StationId | null, x: number, y: number) => void;
  /** The camera went through the glass (true) or came back out. */
  onPortal: (inside: boolean) => void;
}

/** Returned when renderer creation fails: nothing was ever created. */
const DEAD_HANDLE: SceneHandle = {
  dispose() {
    return;
  }
};

/** Props are only pickable while the whole room is in view. */
const PICKABLE_UNTIL = 0.3;

export function createScene(options: CreateSceneOptions): SceneHandle {
  const { host, intro, tier, sync, injector, onDowngrade, onPick, onHover, onPortal } = options;

  let disposed = false;
  let degraded = false;

  const guard = (reason: string): void => {
    if (disposed || degraded) return;
    degraded = true;
    onDowngrade(reason);
    dispose();
  };

  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({
      antialias: tier === 'desk',
      alpha: false,
      powerPreference: 'high-performance'
    });
  } catch {
    onDowngrade('webgl-fail');
    return DEAD_HANDLE;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, DPR_CAP[tier]));
  // The room's light is baked in Blender and its atlases are already
  // tone-mapped (AgX); mapping them again here would crush them twice.
  renderer.toneMapping = THREE.NoToneMapping;
  const canvas = renderer.domElement;

  const onContextLost = (event: Event): void => {
    event.preventDefault();
    guard('context-lost');
  };
  canvas.addEventListener('webglcontextlost', onContextLost);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x050505);

  const camera = new THREE.PerspectiveCamera(50, 1, 0.02, 30);

  const screen: TextScreen = createTextScreen();
  // Filled when the GLB has loaded; the loop does not start before then.
  let room: Room | null = null;
  const loading = new AbortController();

  // ?debug exposes the scene to the console and the browser audit
  // (draw calls via renderer.info, picking a pixel back to its mesh).
  const debug = new URLSearchParams(window.location.search).has('debug');
  if (debug) {
    (window as unknown as Record<string, unknown>)['__scene'] = { THREE, scene, camera, renderer };
  }

  // ── post-processing (room tier only) ──────────────────────────────
  let composer: EffectComposer | null = null;
  let bloom: UnrealBloomPass | null = null;
  let film: ShaderPass | null = null;
  if (tier === 'room') {
    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
    composer = new EffectComposer(renderer, target);
    composer.addPass(new RenderPass(scene, camera));
    bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.38, 0.35, 1.0);
    composer.addPass(bloom);
    film = new ShaderPass(FilmShader);
    composer.addPass(film);
    composer.addPass(new OutputPass());
  }

  // ── the typed terminal: same machine as the DOM card ──────────────
  const term = createTerminal({ maxLines: 10, maxCols: SCREEN_MAX_COLS, ...SCENE_TYPING });
  const termState: { section: string; projects: readonly string[] | null } = { section: '', projects: null };

  const state = {
    section: 'hero' as SiteSection,
    projects: [] as readonly string[],
    station: null as StationId | null,
    floppy: null as string | null
  };
  const subs: Subscription[] = [
    toObservable(sync.activeSection, { injector }).subscribe(v => {
      if ((SITE_SECTIONS as readonly string[]).includes(v)) state.section = v as SiteSection;
    }),
    toObservable(sync.workProjects, { injector }).subscribe(v => {
      state.projects = v;
    }),
    toObservable(sync.station, { injector }).subscribe(v => {
      state.station = v;
      showSelection();
    }),
    toObservable(sync.floppy, { injector }).subscribe(v => {
      state.floppy = v;
      room?.floppies.select(v);
      showSelection();
    })
  ];

  /** The whiteboard mirrors the selection (see room/whiteboard.ts). */
  function showSelection(): void {
    if (!room) return;
    const s = state.station;
    if (s === 'rack') room.setWhiteboard({ kind: 'machines' });
    else if (s === 'whiteboard') room.setWhiteboard({ kind: 'diagrams' });
    else if (s === 'laptop') room.setWhiteboard({ kind: 'laptop' });
    else if (s === 'floppies' && state.floppy) room.setWhiteboard({ kind: 'project', id: state.floppy });
    else room.setWhiteboard({ kind: 'models' });
  }

  // ── measurement: cached, never read per frame ─────────────────────
  let introTop = 0;
  let introRun = 1;
  let width = 1;
  let height = 1;
  // Shots re-framed for the viewport (fitPose): the opening shot must hold
  // the props right of the intro pane, and each station its prop left of
  // the panel. Null keeps the fixed pose (phones, or before the room loads).
  let openShot: FittedShot | null = null;
  const stationShots: Partial<Record<StationId, FittedShot>> = {};
  const measure = (): void => {
    const rect = intro.getBoundingClientRect();
    introTop = rect.top + window.scrollY;
    introRun = Math.max(rect.height - window.innerHeight, 1);
    fitShots();
  };
  const fitShots = (): void => {
    openShot = null;
    for (const id of Object.keys(stationShots) as StationId[]) delete stationShots[id];
    if (!room) return;
    const header = document.querySelector('.site-header')?.getBoundingClientRect().height ?? 0;
    const bounds = { min: ROOM_MIN, max: ROOM_MAX };
    const edge = 24;
    const frame = { width, height, top: header + edge, bottom: height - edge };
    if (tier === 'room' && width > 900) {
      const paneRight = intro.querySelector('.intro__panel')?.getBoundingClientRect().right ?? 0;
      // near 0: never closer than the doorway; the shot only steps back
      // (or widens) when a prop would be cut off
      openShot = fitPose(spinePose(0, tier), keyPoints.open, { ...frame, left: paneRight + edge, right: width - edge }, bounds, { near: 0 });
    }
    if (width > 720) {
      const panel = Math.min(560, width);
      for (const [id, points] of Object.entries(keyPoints.stations) as [StationId, Vec3[]][]) {
        stationShots[id] = fitPose(STATION_POSES[id], points, { ...frame, left: edge, right: width - panel - edge }, bounds, { near: 0.3 });
      }
    }
  };
  /** World-space corners of the props each shot must hold, read off the
   *  loaded room (pick volumes, screens, the whiteboard, the Thelio's tape).
   *  Stations use the prop itself where its pick volume is mostly air: the
   *  disks, not the cubby; the laptop's screen, not the box around it. */
  const keyPoints: { open: Vec3[]; stations: Partial<Record<StationId, Vec3[]>> } = { open: [], stations: {} };
  const boxCorners = (box: THREE.Box3): Vec3[] =>
    [box.min.x, box.max.x].flatMap(x => [box.min.y, box.max.y].flatMap(y => [box.min.z, box.max.z].map(z => ({ x, y, z }))));
  const find = (t: string | THREE.Object3D): THREE.Object3D | undefined =>
    typeof t === 'string' ? room?.group.getObjectByName(t) : t;
  /** Each target's own box corners (a union box would claim empty space
   *  between props and frame the shot too wide). */
  const cornersOf = (targets: readonly (string | THREE.Object3D)[]): Vec3[] =>
    targets.flatMap(t => {
      const obj = find(t);
      return obj ? boxCorners(new THREE.Box3().setFromObject(obj)) : [];
    });
  /** One box around all the targets, grown `pad` times about its centre,
   *  so a small prop is framed with some of its surroundings. */
  const paddedCorners = (targets: readonly (string | THREE.Object3D)[], pad: number): Vec3[] => {
    const box = new THREE.Box3();
    for (const t of targets) {
      const obj = find(t);
      if (obj) box.expandByObject(obj);
    }
    if (box.isEmpty()) return [];
    const c = box.getCenter(new THREE.Vector3());
    box.min.sub(c).multiplyScalar(pad).add(c);
    box.max.sub(c).multiplyScalar(pad).add(c);
    return boxCorners(box);
  };
  const collectKeyPoints = (): void => {
    room?.group.updateMatrixWorld(true);
    keyPoints.open = cornersOf([
      'whiteboard_surface', 'screen_monitor_big', 'screen_monitor_mid', 'tape_thelio',
      'hit_rack', 'hit_terminal', 'hit_laptop', 'hit_floppies'
    ]);
    keyPoints.stations = {
      rack: cornersOf(['hit_rack']),
      floppies: paddedCorners(room?.floppies.hitboxes ?? ['hit_floppies'], 1.3),
      whiteboard: cornersOf(['whiteboard_surface']),
      laptop: paddedCorners(['screen_laptop'], 1.8)
    };
  };
  const resize = (): void => {
    width = host.clientWidth || window.innerWidth;
    height = host.clientHeight || window.innerHeight;
    renderer.setSize(width, height, false);
    composer?.setSize(width, height);
    bloom?.resolution.set(width / 2, height / 2);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    measure();
  };
  resize();
  window.addEventListener('resize', resize);
  const introObserver = new ResizeObserver(measure);
  introObserver.observe(intro);

  // ── pointer: parallax, hover and pick ─────────────────────────────
  const pointer = { x: 0, y: 0, clientX: 0, clientY: 0, fresh: false, inside: false };
  const raycaster = new THREE.Raycaster();
  let hovered: THREE.Object3D | null = null;
  let spineP = 0;

  // Only the bare page counts: a pointer over a link, button or panel is
  // the DOM's, not the room's.
  const overChrome = (target: EventTarget | null): boolean =>
    target instanceof Element && !!target.closest('a, button, input, [role="dialog"], .station-panel, .site-header');

  const onPointerMove = (e: PointerEvent): void => {
    pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
    pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
    pointer.clientX = e.clientX;
    pointer.clientY = e.clientY;
    pointer.inside = !overChrome(e.target);
    pointer.fresh = true;
  };
  const onClick = (e: MouseEvent): void => {
    if (!hovered || overChrome(e.target)) return;
    const station = hovered.userData['station'];
    if (typeof station === 'string' && isStationId(station)) {
      const item = hovered.userData['item'];
      onPick(station, typeof item === 'string' ? item : null);
    }
  };
  window.addEventListener('pointermove', onPointerMove, { passive: true });
  window.addEventListener('click', onClick);

  const setHovered = (obj: THREE.Object3D | null): void => {
    if (obj === hovered) {
      if (obj) onHover(obj.userData['station'], pointer.clientX, pointer.clientY);
      return;
    }
    hovered = obj;
    document.body.style.cursor = obj ? 'pointer' : '';
    onHover(obj ? obj.userData['station'] : null, pointer.clientX, pointer.clientY);
  };

  const pick = (): void => {
    // Whenever picking is impossible, drop the hover even if the pointer
    // has not moved: scrolling the camera away with a still mouse must not
    // leave a prop "hovered" for the next click to open.
    if (state.station !== null || spineP > PICKABLE_UNTIL || portalInside) {
      if (hovered) setHovered(null);
      return;
    }
    if (!pointer.fresh) return;
    pointer.fresh = false;
    if (!pointer.inside) {
      setHovered(null);
      return;
    }
    raycaster.setFromCamera(new THREE.Vector2(pointer.x, pointer.y), camera);
    if (!room) return;
    const hit = raycaster.intersectObjects(room.hitboxes as THREE.Object3D[], false)[0];
    setHovered(hit ? hit.object : null);
  };

  // ── camera: damped toward the pose the spine or a station asks for ─
  const cur = {
    position: new THREE.Vector3(),
    target: new THREE.Vector3(),
    fov: 50,
    offset: 0,
    offsetY: 0
  };
  const want = { position: new THREE.Vector3(), target: new THREE.Vector3() };
  const initial = spinePose(0, tier);
  cur.position.set(initial.position.x, initial.position.y, initial.position.z);
  cur.target.set(initial.target.x, initial.target.y, initial.target.z);

  let portalInside = false;
  // the first frame always reports, so the page learns 'out' as well
  let portalReported = false;
  let lastFov = -1;
  let lastOffset = -1;
  let lastOffsetY = -1;

  const aimCamera = (dt: number): boolean => {
    const station = state.station;
    const fitted = station ? stationShots[station] : null;
    const pose: CameraPose = station ? (fitted?.pose ?? STATION_POSES[station]) : spinePose(spineP, tier, openShot?.pose);
    want.position.set(pose.position.x, pose.position.y, pose.position.z);
    want.target.set(pose.target.x, pose.target.y, pose.target.z);
    // A hand-held drift in the wide shot; none once you are at the desk.
    if (!station) {
      const sway = Math.max(1 - spineP / 0.45, 0);
      want.position.x += pointer.x * 0.07 * sway;
      want.position.y += pointer.y * 0.035 * sway;
    }
    const tau = station ? CAMERA_TAU_MS.station : CAMERA_TAU_MS.spine;
    const k = 1 - Math.exp(-dt / tau);
    cur.position.lerp(want.position, k);
    cur.target.lerp(want.target, k);
    cur.fov += (fovForAspect(pose.fov, camera.aspect) - cur.fov) * k;
    // Keep the prop clear of the DOM: a fitted shot carries the shift that
    // centres its props beside the panel or the intro pane (the opening
    // one easing out as the camera walks in); unfitted, a panel open on the
    // right frames the prop left of centre.
    let wantX = 0;
    let wantY = 0;
    if (station) {
      if (fitted) [wantX, wantY] = [fitted.offsetX, fitted.offsetY];
      else if (width > 900) wantX = width * 0.2;
    } else if (openShot && spineP < PICKABLE_UNTIL) {
      const ease = 1 - spineP / PICKABLE_UNTIL;
      [wantX, wantY] = [openShot.offsetX * ease, openShot.offsetY * ease];
    }
    cur.offset += (wantX - cur.offset) * k;
    cur.offsetY += (wantY - cur.offsetY) * k;

    camera.position.copy(cur.position);
    camera.lookAt(cur.target);
    if (Math.abs(cur.fov - lastFov) > 1e-3 || Math.abs(cur.offset - lastOffset) > 0.5 || Math.abs(cur.offsetY - lastOffsetY) > 0.5) {
      camera.fov = cur.fov;
      if (Math.abs(cur.offset) > 0.5 || Math.abs(cur.offsetY) > 0.5) camera.setViewOffset(width, height, cur.offset, cur.offsetY, width, height);
      else camera.clearViewOffset();
      camera.updateProjectionMatrix();
      lastFov = cur.fov;
      lastOffset = cur.offset;
      lastOffsetY = cur.offsetY;
    }
    return cur.position.distanceToSquared(want.position) < 1e-7;
  };

  // ── loop ──────────────────────────────────────────────────────────
  let raf = 0;
  let lastNow = 0;
  let startedAt = 0;
  let frames = 0;
  let windowMs = 0;
  let lowStreak = 0;
  let warmupUntil = 0;

  const frame = (now: number): void => {
    if (disposed || !room) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min(now - lastNow, 100);
    lastNow = now;
    const elapsed = (now - startedAt) / 1000;

    spineP = Math.min(Math.max((window.scrollY - introTop) / introRun, 0), 1);

    const inside = state.station === null && spineP >= PORTAL_AT;
    if (inside !== portalInside || !portalReported) {
      // back out of the glass: the frame rate is measured afresh, after a
      // warm-up, not against the frames the page drew meanwhile
      if (portalInside && !inside) {
        frames = 0;
        windowMs = 0;
        warmupUntil = now + FPS_BUDGET.warmupMs;
      }
      portalInside = inside;
      portalReported = true;
      onPortal(inside);
    }

    aimCamera(dt);
    pick();
    // Through the glass the shell covers the canvas (hidden by CSS once its
    // fade ends): no GPU work, and no frame-rate verdict. The shell's glow
    // is costly to paint, and counting frames here once downgraded the
    // room while the reader was only using the terminal.
    if (portalInside) return;

    const section = state.station ? 'hero' : state.section;
    if (section !== termState.section || state.projects !== termState.projects) {
      term.setSection(section, buildScreenLines(section, state.projects));
      termState.section = section;
      termState.projects = state.projects;
    }
    const snap = term.tick(dt);
    if (snap) screen.paint(snap);

    const power = Math.min(Math.max((now - startedAt - WARMUP.delayMs) / WARMUP.durationMs, 0), 1);
    room.setPower(power);
    room.update(renderer, elapsed, dt);

    if (composer && film) {
      film.uniforms['uTime'].value = elapsed;
      film.uniforms['uPortal'].value = Math.max((spineP - 0.8) / 0.2, 0);
      composer.render(dt / 1000);
    } else {
      renderer.render(scene, camera);
    }

    // fps budget: only visible, rendering time counts (rAF pauses in
    // hidden tabs; the dt clamp makes resume safe).
    frames += 1;
    windowMs += dt;
    if (windowMs >= FPS_BUDGET.windowMs) {
      const fps = (frames / windowMs) * 1000;
      frames = 0;
      windowMs = 0;
      if (now >= warmupUntil) {
        lowStreak = fps < FPS_BUDGET.lowFps ? lowStreak + 1 : 0;
        if (lowStreak >= FPS_BUDGET.lowStreakNeeded) guard('runtime-fps');
      }
    }
  };

  const start = (): void => {
    if (disposed) return;
    host.appendChild(canvas); // the CSS fade-in runs from the first frame
    lastNow = startedAt = performance.now();
    warmupUntil = lastNow + FPS_BUDGET.warmupMs;
    raf = requestAnimationFrame(frame);
  };

  // Start once the room has loaded and the self-hosted face is ready (the
  // font wait is bounded, so the screen never waits on it for long).
  const fontReady = new Promise<void>(resolve => {
    const timer = window.setTimeout(resolve, FONT_WAIT_MS);
    const done = (): void => {
      window.clearTimeout(timer);
      resolve();
    };
    if (document.fonts?.load) document.fonts.load('500 16px "IBM Plex Mono"', 'joshua').then(done, done);
    else done();
  });
  Promise.all([loadRoom(tier, screen.texture, loading.signal), fontReady])
    .then(([loaded]) => {
      if (disposed) {
        loaded.dispose();
        return;
      }
      room = loaded;
      scene.add(loaded.group);
      collectKeyPoints();
      fitShots();
      // open on the fitted shot rather than drifting into it
      if (openShot && state.station === null) {
        const p = spinePose(spineP, tier, openShot.pose);
        cur.position.set(p.position.x, p.position.y, p.position.z);
        cur.target.set(p.target.x, p.target.y, p.target.z);
      }
      loaded.floppies.select(state.floppy);
      showSelection();
      start();
    })
    .catch((err: unknown) => {
      if (disposed) return;
      console.warn('[scene] room failed to load:', err);
      guard('scene-load-fail');
    });

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(raf);
    loading.abort();
    window.removeEventListener('resize', resize);
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('click', onClick);
    introObserver.disconnect();
    canvas.removeEventListener('webglcontextlost', onContextLost);
    document.body.style.cursor = '';
    for (const sub of subs) sub.unsubscribe();
    room?.dispose();
    screen.dispose();
    // EffectComposer.dispose() frees its own targets, not its passes'
    bloom?.dispose();
    film?.dispose();
    composer?.dispose();
    if (debug) delete (window as unknown as Record<string, unknown>)['__scene'];
    renderer.dispose();
    canvas.remove();
  }

  return { dispose };
}
