import * as THREE from 'three';

export function makeSky() {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    toneMapped: false,
    uniforms: {
      zenith: { value: new THREE.Color(0x15152f) },
      horizon: { value: new THREE.Color(0x67568b) },
      dark: { value: new THREE.Color(0x282643) },
    },
    vertexShader: `
      varying vec3 vDirection;
      void main() {
        vDirection = position;
        vec3 viewDirection = mat3(viewMatrix) * position;
        gl_Position = projectionMatrix * vec4(viewDirection, 1.0);
        gl_Position.z = gl_Position.w;
      }
    `,
    fragmentShader: `
      varying vec3 vDirection;
      uniform vec3 zenith;
      uniform vec3 horizon;
      uniform vec3 dark;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
      float stars(vec2 uv, float density) {
        vec2 cell = floor(uv);
        vec2 center = vec2(hash(cell + 2.0), hash(cell + 7.0)) * .7 + .15;
        float spark = 1.0 - smoothstep(.03, .088, length(fract(uv) - center));
        return spark * step(1.0 - density, hash(cell));
      }
      void main() {
        vec3 ray = normalize(vDirection);
        vec3 color = mix(horizon, zenith, smoothstep(-.025, .68, ray.y));
        color = mix(color, dark, smoothstep(.08, .48, -ray.y));
        vec2 uv = vec2(atan(ray.x, -ray.z), asin(ray.y));
        float star = stars(uv * 65.0, .058) + stars(uv * 169.0 + 9.0, .026) * .26;
        color += vec3(.38, .33, .65) * star * smoothstep(.025, .47, ray.y);
        vec3 anchor = normalize(vec3(.24, .35, ray.z > 0.0 ? 1.0 : -1.0));
        vec3 east = normalize(cross(anchor, vec3(0.0, 1.0, 0.0)));
        vec2 p = vec2(dot(ray, east), dot(ray, normalize(cross(east, anchor))));
        float fov = smoothstep(.60, .87, dot(ray, anchor));
        float radius = length(p);
        float ring = exp(-abs(radius - .142) * 368.0) * .27;
        float ticks = step(.74, fract(atan(p.y, p.x) * 9.23));
        ring += exp(-abs(radius - .165) * 370.0) * ticks * .14;
        float glow = exp(-radius * radius * 37.0) * .21;
        p.x += p.y * .46;
        float jagged = p.x + .009 * sin(103.0 * p.y) + .005 * sin(197.0 * p.y);
        float tear = exp(-abs(jagged) * 166.0) * (1.0 - smoothstep(.012, .108, abs(p.y)));
        float halo = exp(-abs(jagged) * 33.0 - abs(p.y) * 17.0);
        color += vec3(.55, .19, 1.0) * (glow + ring + halo * .38) * fov;
        color += vec3(.88, .68, 1.0) * tear * 1.15 * fov;
        float band = ray.y - .085 - .035 * sin(uv.x * 3.0) - .014 * cos(uv.x * 8.0);
        color += vec3(.18, .08, .29) * exp(-band * band * 500.0) * .36;
        gl_FragColor = vec4(color, 1.0);
        #include <colorspace_fragment>
      }
    `,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1, 36, 22), material);
  sky.frustumCulled = false;
  sky.renderOrder = -100;
  return sky;
}
