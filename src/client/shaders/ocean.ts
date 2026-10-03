export const oceanVertexShader = `
precision highp float;
attribute vec3 position;
attribute vec3 normal;
uniform mat4 world;
uniform mat4 view;
uniform mat4 worldViewProjection;
varying vec3 vWorldPosition;
varying vec3 vViewNormal;
varying vec3 vViewDirection;

void main(void) {
  vec4 worldPosition = world * vec4(position, 1.0);
  vec3 worldNormal = normalize(mat3(world) * normal);
  vWorldPosition = worldPosition.xyz;
  vViewNormal = normalize(mat3(view) * worldNormal);
  vViewDirection = normalize(-(view * worldPosition).xyz);
  gl_Position = worldViewProjection * vec4(position, 1.0);
}
`;

export const oceanFragmentShader = `
precision highp float;
uniform float time;
uniform float waveSpeed;
uniform float waveScale;
uniform float waveHeight;
uniform float foamAmount;
uniform float fresnelPower;
uniform float opacity;
uniform vec3 deepColor;
uniform vec3 surfaceColor;
uniform vec3 foamColor;
varying vec3 vWorldPosition;
varying vec3 vViewNormal;
varying vec3 vViewDirection;

float hash21(vec2 point) {
  point = fract(point * vec2(123.34, 456.21));
  point += dot(point, point + 45.32);
  return fract(point.x * point.y);
}

float noise(vec2 point) {
  vec2 cell = floor(point);
  vec2 local = fract(point);
  local = local * local * (3.0 - 2.0 * local);
  float lower = mix(hash21(cell), hash21(cell + vec2(1.0, 0.0)), local.x);
  float upper = mix(hash21(cell + vec2(0.0, 1.0)), hash21(cell + vec2(1.0, 1.0)), local.x);
  return mix(lower, upper, local.y);
}

float oceanDetail(vec2 point) {
  float broad = noise(point * 0.45);
  float medium = noise(point * 1.25 + vec2(7.3, 12.8));
  float fine = noise(point * 3.6 + vec2(-15.2, 5.4));
  return broad * 0.48 + medium * 0.34 + fine * 0.18;
}

void main(void) {
  vec2 worldXZ = vWorldPosition.xz * waveScale;
  vec2 drift = vec2(time * waveSpeed * 0.16, -time * waveSpeed * 0.1);
  vec2 warped = worldXZ + vec2(
    sin(worldXZ.y * 0.72 + time * waveSpeed * 0.32),
    cos(worldXZ.x * 0.61 - time * waveSpeed * 0.24)
  ) * 0.34;

  float swellA = sin(dot(warped, vec2(0.91, 0.42)) * 1.4 + time * waveSpeed);
  float swellB = sin(dot(warped, vec2(-0.36, 0.93)) * 2.05 - time * waveSpeed * 0.72);
  float chop = sin(dot(warped, vec2(0.72, -0.69)) * 4.2 + time * waveSpeed * 1.18);
  float detail = oceanDetail(warped * 2.0 + drift);
  float surface = (swellA * 0.5 + swellB * 0.3 + chop * 0.12 + (detail - 0.5) * 0.42) * waveHeight;
  float crest = smoothstep(0.24, 0.68, surface + (detail - 0.5) * foamAmount);
  float depth = smoothstep(-0.62, 0.62, surface);
  float fresnel = pow(1.0 - clamp(dot(normalize(vViewNormal), normalize(vViewDirection)), 0.0, 1.0), fresnelPower);
  vec3 normal = normalize(vViewNormal);
  vec3 viewDirection = normalize(vViewDirection);
  vec3 lightDirection = normalize(vec3(-0.42, 0.84, 0.34));
  float sunGlint = pow(max(dot(reflect(-lightDirection, normal), viewDirection), 0.0), 72.0);

  vec3 color = mix(deepColor, surfaceColor, depth);
  color = mix(color, foamColor, crest * 0.52);
  color += surfaceColor * fresnel * 0.48;
  color += vec3(1.0, 0.96, 0.82) * sunGlint * 0.48;
  gl_FragColor = vec4(color, clamp(opacity + crest * 0.1, 0.0, 1.0));
}
`;
