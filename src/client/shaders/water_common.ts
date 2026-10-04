export const waterWaveFunctions = `
#define DRAG_MULT 0.38
#define ITERATIONS 24

vec2 wavedx(vec2 position, vec2 direction, float frequency, float timeShift) {
  float angle = dot(direction, position) * frequency + timeShift;
  float wave = exp(sin(angle) - 1.0);
  float dx = wave * cos(angle);
  return vec2(wave, -dx);
}

float getwaves(vec2 position) {
  float wavePhaseShift = length(position) * 0.1;
  float iter = 0.0;
  float frequency = 1.0;
  float timeMultiplier = 2.0;
  float weight = 1.0;
  float sum = 0.0;
  float sumWeight = 0.0;

  for (int i = 0; i < ITERATIONS; i++) {
    vec2 direction = vec2(sin(iter), cos(iter));
    vec2 wave = wavedx(
      position,
      direction,
      frequency,
      time * waveSpeed * timeMultiplier + wavePhaseShift
    );
    position += direction * wave.y * weight * DRAG_MULT;
    sum += wave.x * weight;
    sumWeight += weight;
    weight = mix(weight, 0.0, 0.2);
    frequency *= 1.18;
    timeMultiplier *= 1.07;
    iter += 1232.399963;
  }

  return sum / sumWeight;
}

vec3 getWaterNormal(vec2 position, float epsilon, float normalStrength) {
  vec2 offsetX = vec2(epsilon, 0.0);
  vec2 offsetY = vec2(0.0, epsilon);
  float centerHeight = getwaves(position) * normalStrength;
  vec3 center = vec3(position.x, centerHeight, position.y);
  vec3 tangentX = center - vec3(
    position.x - epsilon,
    getwaves(position - offsetX) * normalStrength,
    position.y
  );
  vec3 tangentY = center - vec3(
    position.x,
    getwaves(position + offsetY) * normalStrength,
    position.y + epsilon
  );
  return normalize(cross(tangentX, tangentY));
}

vec3 getSunDirection() {
  return normalize(vec3(
    -0.07735,
    0.5 + sin(time * 0.2 + 2.6) * 0.45,
    0.57735
  ));
}

vec3 extraCheapAtmosphere(vec3 rayDirection, vec3 sunDirection) {
  float horizonFactor = 1.0 / max(rayDirection.y + 0.1, 0.06);
  float sunFactor = 1.0 / max(sunDirection.y * 11.0 + 1.0, 0.06);
  float sunAlignment = pow(abs(dot(sunDirection, rayDirection)), 2.0);
  vec3 sunColor = mix(
    vec3(1.0),
    max(vec3(0.0), vec3(1.0) - vec3(5.5, 13.0, 22.4) / 22.4),
    sunFactor
  );
  vec3 blueSky = vec3(5.5, 13.0, 22.4) / 22.4 * sunColor;
  vec3 horizonSky = max(
    vec3(0.0),
    blueSky - vec3(5.5, 13.0, 22.4) * 0.002 *
      (horizonFactor - 6.0 * sunDirection.y * sunDirection.y)
  );
  horizonSky *= horizonFactor * (0.24 + sunAlignment * 0.24);
  return horizonSky * (1.0 + pow(1.0 - rayDirection.y, 3.0));
}

vec3 getAtmosphere(vec3 direction) {
  return extraCheapAtmosphere(direction, getSunDirection()) * 0.5;
}

float getSun(vec3 direction) {
  return pow(max(0.0, dot(direction, getSunDirection())), 720.0) * 210.0;
}

vec3 acesTonemap(vec3 color) {
  mat3 inputMatrix = mat3(
    0.59719, 0.07600, 0.02840,
    0.35458, 0.90834, 0.13383,
    0.04823, 0.01566, 0.83777
  );
  mat3 outputMatrix = mat3(
    1.60475, -0.10208, -0.00327,
    -0.53108, 1.10813, -0.07276,
    -0.07367, -0.00605, 1.07602
  );
  vec3 transformed = inputMatrix * color;
  vec3 numerator = transformed * (transformed + 0.0245786) - 0.000090537;
  vec3 denominator = transformed * (0.983729 * transformed + 0.4329510) + 0.238081;
  return pow(clamp(outputMatrix * (numerator / denominator), 0.0, 1.0), vec3(1.0 / 2.2));
}
`;

export const waterVertexShader = `
precision highp float;
attribute vec3 position;
uniform mat4 world;
uniform mat4 viewProjection;
uniform float time;
uniform float waveSpeed;
uniform float waveScale;
uniform float waveHeight;
varying vec3 vWorldPosition;
varying vec3 vLocalPosition;

${waterWaveFunctions}

void main(void) {
  vec4 worldPosition = world * vec4(position, 1.0);
  vec2 wavePosition = worldPosition.xz * waveScale;
  worldPosition.y += (getwaves(wavePosition) - 0.5) * waveHeight;
  vWorldPosition = worldPosition.xyz;
  vLocalPosition = position;
  gl_Position = viewProjection * worldPosition;
}
`;