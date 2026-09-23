/**
 * The VT100's tube, in two stages.
 *
 * 1. Persistence — a P1 phosphor does not switch off, it fades. A small
 *    ping-pong render target (the terminal canvas's own 512×384) keeps
 *    max(new frame, last frame × decay), so typed glyphs and the caret
 *    leave a short green afterglow instead of blinking cleanly.
 * 2. The glass — samples that buffer through barrel curvature, splits the
 *    channels a little toward the edges, and lays scanlines and an
 *    aperture grille over it. The grille fades out when a texel is smaller
 *    than a pixel (fwidth), so it moirés only as close as a real one would.
 *
 * Output is deliberately > 1.0 in the bright strokes: the room tier's
 * bloom pass thresholds on it, which is the phosphor halation.
 */
import * as THREE from 'three';

const QUAD_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const PERSIST_FRAG = /* glsl */ `
  uniform sampler2D uSource;
  uniform sampler2D uPrevious;
  uniform float uDecay;
  varying vec2 vUv;
  void main() {
    vec3 now = texture2D(uSource, vUv).rgb;
    vec3 was = texture2D(uPrevious, vUv).rgb * uDecay;
    gl_FragColor = vec4(max(now, was), 1.0);
  }
`;

export interface Persistence {
  /** The decayed buffer — what the glass samples. */
  readonly texture: THREE.Texture;
  /** Advance one frame. `dt` in ms. */
  update(renderer: THREE.WebGLRenderer, dt: number): void;
  dispose(): void;
}

/** τ for the afterglow, ms. P1 is a medium-persistence phosphor. */
const PHOSPHOR_TAU_MS = 70;

export function createPersistence(source: THREE.Texture, width: number, height: number): Persistence {
  const opts: THREE.RenderTargetOptions = {
    type: THREE.HalfFloatType,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: false,
    colorSpace: THREE.LinearSRGBColorSpace
  };
  let read = new THREE.WebGLRenderTarget(width, height, opts);
  let write = new THREE.WebGLRenderTarget(width, height, opts);

  const material = new THREE.ShaderMaterial({
    vertexShader: QUAD_VERT,
    fragmentShader: PERSIST_FRAG,
    uniforms: {
      uSource: { value: source },
      uPrevious: { value: read.texture },
      uDecay: { value: 0 }
    },
    depthTest: false,
    depthWrite: false
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  quad.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(quad);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  // The written target swaps every frame; readers take .texture after
  // update() (the glass re-points its sampler each frame).
  const out = { texture: write.texture };

  return {
    get texture() {
      return out.texture;
    },
    update(renderer, dt) {
      material.uniforms['uPrevious'].value = read.texture;
      material.uniforms['uDecay'].value = Math.exp(-dt / PHOSPHOR_TAU_MS);
      const prevTarget = renderer.getRenderTarget();
      renderer.setRenderTarget(write);
      renderer.render(scene, camera);
      renderer.setRenderTarget(prevTarget);
      out.texture = write.texture;
      [read, write] = [write, read];
    },
    dispose() {
      read.dispose();
      write.dispose();
      material.dispose();
      quad.geometry.dispose();
    }
  };
}

const GLASS_VERT = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vViewNormal;
  varying vec3 vViewPos;
  void main() {
    vUv = uv;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vViewPos = mv.xyz;
    vViewNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * mv;
  }
`;

const GLASS_FRAG = /* glsl */ `
  uniform sampler2D uMap;
  uniform vec2 uTexel;       // texture size in texels
  uniform float uTime;
  uniform float uPower;      // 0 = tube cold, 1 = warmed up
  uniform float uIntensity;
  uniform float uCurve;      // barrel strength
  varying vec2 vUv;
  varying vec3 vViewNormal;
  varying vec3 vViewPos;

  // Hoskins' hash: no sin(), so no precision banding at large inputs.
  float hash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  vec2 barrel(vec2 uv) {
    vec2 c = uv * 2.0 - 1.0;
    c *= 1.0 + uCurve * dot(c, c);
    return c * 0.5 + 0.5;
  }

  void main() {
    // The tube face is a little smaller than the glass: a dark border
    // where the raster does not reach, as on the real thing.
    vec2 uv = (vUv - 0.5) * 1.06 + 0.5;
    vec2 bent = barrel(uv);
    vec2 fromCentre = bent - 0.5;
    float edge = dot(fromCentre, fromCentre);

    // Convergence error grows toward the corners.
    vec2 split = fromCentre * 0.0035 * (0.4 + edge * 3.0);
    vec3 col;
    col.r = texture2D(uMap, bent + split).r;
    col.g = texture2D(uMap, bent).g;
    col.b = texture2D(uMap, bent - split).b;

    // Raster bounds: soft-edged so the curvature does not alias.
    vec2 inside = smoothstep(vec2(0.0), vec2(0.012), bent) * smoothstep(vec2(0.0), vec2(0.012), 1.0 - bent);
    col *= inside.x * inside.y;

    // Scanlines at the texture's own line pitch.
    float line = 0.5 + 0.5 * cos(bent.y * uTexel.y * 6.2831853);
    col *= mix(1.0, 0.72 + 0.28 * line, 0.85);

    // Aperture grille: R, G, B stripes, only once a texel outgrows a pixel.
    float texelPx = 1.0 / max(fwidth(bent.x * uTexel.x), 1e-4);
    float grilleVis = smoothstep(2.0, 5.0, texelPx);
    float stripe = mod(floor(bent.x * uTexel.x * 3.0), 3.0);
    vec3 mask = vec3(stripe == 0.0 ? 1.0 : 0.7, stripe == 1.0 ? 1.0 : 0.7, stripe == 2.0 ? 1.0 : 0.7);
    col *= mix(vec3(1.0), mask, grilleVis * 0.6);

    // Faint green bias even in the black: an energised P1 face is never 0.
    col += vec3(0.004, 0.018, 0.009) * inside.x * inside.y;

    float flicker = 1.0 + 0.012 * sin(uTime * 377.0) + 0.02 * (hash(vec2(uTime, 1.7)) - 0.5);
    float grain = (hash(floor(bent * uTexel * 2.0) + floor(uTime * 30.0) * 7.0) - 0.5) * 0.018;
    col = col * flicker + grain * inside.x * inside.y;

    // Tube vignette.
    col *= 1.0 - smoothstep(0.12, 0.5, edge);

    // Warm-up: the raster opens from a horizontal line, then brightens.
    float open = smoothstep(0.0, 0.5, uPower);
    col *= step(abs(vUv.y - 0.5), 0.5 * open + 0.004) * smoothstep(0.2, 1.0, uPower);

    // Glass sheen: a fresnel lift and a soft, off-centre highlight.
    vec3 viewDir = normalize(-vViewPos);
    float fres = pow(1.0 - max(dot(viewDir, normalize(vViewNormal)), 0.0), 3.0);
    float sheen = smoothstep(0.35, 0.0, distance(vUv, vec2(0.28, 0.78))) * 0.05;
    col += vec3(0.5, 0.55, 0.5) * (fres * 0.05 + sheen * 0.6);

    gl_FragColor = vec4(col * uIntensity, 1.0);
    #include <colorspace_fragment>
  }
`;

export function createGlassMaterial(map: THREE.Texture, texW: number, texH: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: GLASS_VERT,
    fragmentShader: GLASS_FRAG,
    uniforms: {
      uMap: { value: map },
      uTexel: { value: new THREE.Vector2(texW, texH) },
      uTime: { value: 0 },
      uPower: { value: 0 },
      uIntensity: { value: 1.55 },
      uCurve: { value: 0.085 }
    },
    toneMapped: false
  });
}
