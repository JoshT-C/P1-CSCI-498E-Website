/**
 * The 3D scene's lifecycle. This is the ONLY module the Angular side
 * imports (lazily, from SceneCanvasComponent) — three.js stays out of the
 * initial bundle.
 *
 * Data flow: the four SceneSyncService signals are subscribed once via
 * asObservable() into a plain state object the rAF loop reads. Nothing in
 * the loop touches Angular; nothing writes signals per frame.
 *
 * Every failure path calls onDowngrade exactly once and disposes itself:
 * WebGL unavailable, context lost, the fps budget lost, or (upstream) the
 * chunk itself failing to load.
 */
import * as THREE from 'three';
import type { Injector, Signal } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import type { Subscription } from 'rxjs';
import { cameraPose, SCREEN_CENTER } from './camera-path';
import {
  buildScreenLines,
  SCREEN_MAX_COLS,
  type ScreenSection
} from './screen-content';
import { createMachine, type Machine } from './machine';
import { createTextScreen, type TextScreen } from './text-screen';
import { createTerminal } from './screen-text';

const SECTIONS: ReadonlySet<string> = new Set([
  'hero',
  'work',
  'stack',
  'about',
  'contact'
]);

/** The subset of SceneSyncService the scene reads (structural, so this file
 *  never imports the service). */
export interface SceneSyncSource {
  readonly activeSection: Signal<string>;
  readonly workProjects: Signal<readonly string[]>;
  readonly activeWorkIndex: Signal<number>;
  readonly activeModelIndex: Signal<number>;
}

export interface SceneHandle {
  dispose(): void;
}

export interface CreateSceneOptions {
  host: HTMLElement;
  sync: SceneSyncSource;
  /** The component's injector: toObservable() would otherwise call
   *  inject(Injector) internally, which throws outside an injection
   *  context (this runs from a dynamic-import .then callback). Binding
   *  the effects to it also cleans them up with the component. */
  injector: Injector;
  onDowngrade: (reason: string) => void;
}

/** fps budget: 2 s windows; two consecutive low windows (≈4 s) after a 3 s
 *  warm-up means the machine is losing, and the CSS fallback takes over. */
const LOW_FPS = 28;
const WINDOW_MS = 2000;
const WARMUP_MS = 3000;
const LOW_STREAK_NEEDED = 2;

/** Returned when renderer creation fails: nothing was ever created. */
const DEAD_HANDLE: SceneHandle = {
  dispose() {
    return;
  }
};

export function createScene(options: CreateSceneOptions): SceneHandle {
  const { host, sync, injector, onDowngrade } = options;

  let disposed = false;
  let degraded = false;

  const guard = (reason: string): boolean => {
    if (disposed || degraded) return false;
    degraded = true;
    onDowngrade(reason);
    dispose();
    return false;
  };

  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance'
    });
  } catch {
    onDowngrade('webgl-fail');
    return DEAD_HANDLE;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const canvas = renderer.domElement;

  const onContextLost = (event: Event): void => {
    event.preventDefault();
    guard('context-lost');
  };
  canvas.addEventListener('webglcontextlost', onContextLost);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x0b0c0a, 9, 22);

  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100);

  scene.add(new THREE.HemisphereLight(0x28312a, 0x0b0c0a, 0.9));
  const keyLight = new THREE.DirectionalLight(0xd9e2d5, 1.1);
  keyLight.position.set(4, 8, 6);
  scene.add(keyLight);
  // phosphor spill from the screen onto the keyboard and floor
  const glow = new THREE.PointLight(0x66f2a6, 10, 7, 2);
  glow.position.set(0, SCREEN_CENTER.y, SCREEN_CENTER.z + 1.3);
  scene.add(glow);

  const screen: TextScreen = createTextScreen();
  const machine: Machine = createMachine(screen.texture);
  scene.add(machine.group);

  // The same typed-terminal machine the DOM card runs — one source of truth.
  const term = createTerminal({
    maxLines: 10,
    maxCols: SCREEN_MAX_COLS,
    charsPerSecond: 45,
    linePauseMs: 320
  });
  const termState: { section: string; projects: readonly string[] | null } = {
    section: '',
    projects: null
  };

  // Signals → plain state, on discrete updates only.
  const state = {
    section: 'hero' as ScreenSection,
    projects: [] as readonly string[],
    workIndex: -1,
    modelIndex: -1
  };
  const subs: Subscription[] = [
    toObservable(sync.activeSection, { injector }).subscribe(v => {
      if (SECTIONS.has(v)) state.section = v as ScreenSection;
    }),
    toObservable(sync.workProjects, { injector }).subscribe(v => {
      state.projects = v;
    }),
    toObservable(sync.activeWorkIndex, { injector }).subscribe(v => {
      state.workIndex = v;
    }),
    toObservable(sync.activeModelIndex, { injector }).subscribe(v => {
      state.modelIndex = v;
    })
  ];

  // Scroll fraction from a cached doc height — no scroll listener, no
  // per-frame layout reads.
  let docHeight = 0;
  const measure = (): void => {
    docHeight = Math.max(document.documentElement.scrollHeight - window.innerHeight, 0);
  };
  const resize = (): void => {
    const w = host.clientWidth || window.innerWidth;
    const h = host.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    measure();
  };
  resize();
  window.addEventListener('resize', resize);

  let raf = 0;
  let lastNow = 0;
  let lastFov = -1;
  let frames = 0;
  let windowMs = 0;
  let lowStreak = 0;
  let warmupUntil = 0;

  const frame = (now: number): void => {
    if (disposed) return;
    const dt = Math.min(now - lastNow, 100);
    lastNow = now;

    const p = docHeight > 0 ? Math.min(window.scrollY / docHeight, 1) : 0;
    const pose = cameraPose(p);
    camera.position.set(pose.position.x, pose.position.y, pose.position.z);
    camera.lookAt(pose.target.x, pose.target.y, pose.target.z);
    if (Math.abs(pose.fov - lastFov) > 1e-3) {
      camera.fov = pose.fov;
      camera.updateProjectionMatrix();
      lastFov = pose.fov;
    }

    if (state.section !== termState.section || state.projects !== termState.projects) {
      term.setSection(state.section, buildScreenLines(state.section, state.projects));
      termState.section = state.section;
      termState.projects = state.projects;
    }
    const snap = term.tick(dt);
    if (snap) screen.paint(snap);

    renderer.render(scene, camera);

    // fps budget (rAF is already paused in hidden tabs; the dt clamp makes
    // resume-safe, so only visible time counts against the budget)
    frames += 1;
    windowMs += dt;
    if (windowMs >= WINDOW_MS) {
      const fps = (frames / windowMs) * 1000;
      frames = 0;
      windowMs = 0;
      if (now >= warmupUntil) {
        if (fps < LOW_FPS) lowStreak += 1;
        else lowStreak = 0;
        if (lowStreak >= LOW_STREAK_NEEDED) {
          guard('runtime-fps');
          return;
        }
      }
    }
    raf = requestAnimationFrame(frame);
  };

  const start = (): void => {
    if (disposed) return;
    host.appendChild(canvas); // the CSS fade-in runs from the first frame
    lastNow = performance.now();
    warmupUntil = lastNow + WARMUP_MS;
    raf = requestAnimationFrame(frame);
  };

  // Wait (bounded) for the self-hosted face so the first texture frame is
  // not drawn in the fallback monospace.
  if (document.fonts && document.fonts.load) {
    let settled = false;
    const fallback = window.setTimeout(() => {
      if (!settled) {
        settled = true;
        start();
      }
    }, 1500);
    document.fonts
      .load('500 16px "IBM Plex Mono"', 'joshua')
      .then(
        () => {
          if (!settled) {
            settled = true;
            window.clearTimeout(fallback);
            start();
          }
        },
        () => {
          if (!settled) {
            settled = true;
            window.clearTimeout(fallback);
            start();
          }
        }
      );
  } else {
    start();
  }

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', resize);
    canvas.removeEventListener('webglcontextlost', onContextLost);
    for (const sub of subs) sub.unsubscribe();
    machine.dispose();
    screen.dispose();
    renderer.dispose();
    canvas.remove();
  }

  return { dispose };
}
