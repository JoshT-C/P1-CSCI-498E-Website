/**
 * Last pass before output: a lens vignette, fine luminance grain, and a
 * slight lift of the blacks toward green-grey — the look of the room
 * photographed on film, not rendered. `uPortal` (0-1) closes the vignette
 * around the tube as the camera dives, so the edge of the frame falls
 * away into the glass.
 */
export const FilmShader = {
  name: 'FilmShader',
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uPortal: { value: 0 }
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uPortal;
    varying vec2 vUv;

    // Hoskins' hash: no sin(), so no precision banding at large inputs.
    float hash(vec2 p) {
      vec3 p3 = fract(vec3(p.xyx) * 0.1031);
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.x + p3.y) * p3.z);
    }

    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      vec2 d = vUv - 0.5;
      float r = dot(d, d);
      float vig = smoothstep(0.75 - uPortal * 0.45, 0.12 - uPortal * 0.1, r);
      c.rgb *= mix(0.55, 1.0, vig);
      float lum = dot(c.rgb, vec3(0.299, 0.587, 0.114));
      float g = (hash(gl_FragCoord.xy + floor(uTime * 24.0) * 17.0) - 0.5) * 0.022;
      c.rgb += g * (1.0 - lum * 0.6);
      c.rgb = max(c.rgb, vec3(0.008, 0.011, 0.009));
      gl_FragColor = c;
    }
  `
};
