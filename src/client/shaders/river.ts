export const riverVertexShader = `
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

export const riverFragmentShader = `
precision highp float;
uniform float time;
uniform float flowSpeed;
uniform float flowScale;
uniform float waveStrength;
uniform float foamAmount;
uniform float fresnelPower;
uniform float opacity;
uniform vec3 shallowColor;
uniform vec3 deepColor;
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

float riverDetail(vec2 point) {
  float broad = noise(point * 0.42);
  float medium = noise(point * 0.9 + vec2(13.7, -8.2));
  return broad * 0.68 + medium * 0.32;
}

void main(void) {
  vec2 worldXZ = vWorldPosition.xz;
  vec2 flowUV = vec2(
    dot(worldXZ, vec2(0.94, 0.34)),
    dot(worldXZ, vec2(-0.34, 0.94))
  ) * flowScale;
  float travel = time * flowSpeed;
  flowUV.x += sin(flowUV.y * 0.65 + travel * 0.08) * 0.42 - travel;

  float longWave = sin(flowUV.x * 1.1 + sin(flowUV.y * 0.5) * 0.4);
  float crossWave = sin(flowUV.y * 1.85 - flowUV.x * 0.18 - travel * 0.2);
  float detail = riverDetail(flowUV * 0.72 + vec2(-travel * 0.08, 0.0));
  float surface = longWave * 0.56 + crossWave * 0.15 + (detail - 0.5) * 0.2;
  surface *= waveStrength;

  float depth = smoothstep(-0.58, 0.68, surface);
  float foamSignal = surface + (detail - 0.5) * foamAmount * 0.2;
  float foam = smoothstep(0.28, 0.52, foamSignal) * foamAmount;
  float fresnel = pow(1.0 - clamp(dot(normalize(vViewNormal), normalize(vViewDirection)), 0.0, 1.0), fresnelPower);
  vec3 normal = normalize(vViewNormal);
  vec3 viewDirection = normalize(vViewDirection);
  vec3 lightDirection = normalize(vec3(-0.38, 0.82, 0.42));
  float specular = pow(max(dot(reflect(-lightDirection, normal), viewDirection), 0.0), 64.0);

  vec3 color = mix(deepColor, shallowColor, depth);
  color = mix(color, foamColor, foam * 0.28);
  color += shallowColor * fresnel * 0.16;
  color += vec3(1.0, 0.98, 0.9) * specular * 0.12;
  gl_FragColor = vec4(color, clamp(opacity + foam * 0.08, 0.0, 1.0));
}
`;
