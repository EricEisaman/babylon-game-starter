import { waterVertexShader, waterWaveFunctions } from './water_common';

export const lakeVertexShader = waterVertexShader;

export const lakeFragmentShader = `
precision highp float;
uniform float time;
uniform float waveSpeed;
uniform float waveScale;
uniform float waveHeight;
uniform float normalStrength;
uniform float causticScale;
uniform float causticStrength;
uniform float fresnelPower;
uniform float opacity;
uniform vec3 cameraPosition;
uniform vec3 deepColor;
uniform vec3 surfaceColor;
uniform vec3 reflectionColor;
varying vec3 vWorldPosition;
varying vec3 vLocalPosition;

${waterWaveFunctions}

float causticHash(vec2 point) {
  point = fract(point * vec2(123.34, 456.21));
  point += dot(point, point + 45.32);
  return fract(point.x * point.y);
}

float causticNoise(vec2 point) {
  vec2 cell = floor(point);
  vec2 local = fract(point);
  local = local * local * (3.0 - 2.0 * local);
  float lower = mix(causticHash(cell), causticHash(cell + vec2(1.0, 0.0)), local.x);
  float upper = mix(causticHash(cell + vec2(0.0, 1.0)), causticHash(cell + vec2(1.0, 1.0)), local.x);
  return mix(lower, upper, local.y);
}

float lakeCaustics(vec2 point) {
  float phase = time * 0.035;
  vec2 uv = point * causticScale;
  vec2 warp = vec2(
    causticNoise(uv * 0.65 + vec2(3.1, phase)),
    causticNoise(uv * 0.65 + vec2(-7.4, -phase * 0.83))
  ) - 0.5;
  uv += warp * 2.8;
  float broad = causticNoise(uv * 1.25 + vec2(phase, -2.7));
  float fine = causticNoise(uv * 2.1 + vec2(-4.3, -phase * 1.4));
  float ridge = 1.0 - smoothstep(0.035, 0.19, abs(broad - fine));
  return ridge * ridge;
}

void main(void) {
  vec2 wavePosition = vWorldPosition.xz * waveScale;
  float waveValue = getwaves(wavePosition);
  vec3 normal = getWaterNormal(wavePosition, 0.01, normalStrength);
  vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
  float belowWater = step(dot(normal, viewDirection), 0.0);
  normal = mix(normal, -normal, belowWater);
  float fresnel = 0.04 + 0.96 * pow(
    1.0 - max(0.0, dot(normal, viewDirection)),
    fresnelPower
  );
  vec3 reflectionDirection = normalize(reflect(-viewDirection, normal));
  reflectionDirection.y = abs(reflectionDirection.y);
  vec3 reflection = getAtmosphere(reflectionDirection) + getSun(reflectionDirection);
  float depth = smoothstep(0.34, 0.68, waveValue);
  float caustics = lakeCaustics(wavePosition) * causticStrength;
  vec3 scattering = mix(deepColor, surfaceColor, depth) * 0.2;
  scattering = mix(scattering, deepColor * 0.16, belowWater);
  vec3 color = fresnel * reflection + scattering;
  color += reflectionColor * caustics * (0.3 + depth * 0.7);
  gl_FragColor = vec4(acesTonemap(color * 2.0), clamp(opacity, 0.0, 1.0));
}
`;