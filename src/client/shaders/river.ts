import { waterVertexShader, waterWaveFunctions } from './water_common';

export const riverVertexShader = waterVertexShader;

export const riverFragmentShader = `
precision highp float;
uniform float time;
uniform float waveSpeed;
uniform float waveScale;
uniform float waveHeight;
uniform float normalStrength;
uniform float flowSpeed;
uniform float flowScale;
uniform float flowAxis;
uniform float foamAmount;
uniform float fresnelPower;
uniform float opacity;
uniform vec3 cameraPosition;
uniform vec3 shallowColor;
uniform vec3 deepColor;
uniform vec3 foamColor;
varying vec3 vWorldPosition;
varying vec3 vLocalPosition;

${waterWaveFunctions}

void main(void) {
  vec2 wavePosition = vWorldPosition.xz * waveScale;
  float longitudinal = mix(vLocalPosition.x, vLocalPosition.z, flowAxis);
  float lateral = mix(vLocalPosition.z, vLocalPosition.x, flowAxis);
  vec2 flowPosition = vec2(longitudinal, lateral) * flowScale;
  float travel = time * flowSpeed;
  flowPosition.x += sin(flowPosition.y * 0.65 + travel * 0.08) * 0.42 - travel;

  float waveValue = getwaves(flowPosition);
  float currentRidge = 0.5 + 0.5 * sin(
    flowPosition.y * 1.8 + sin(flowPosition.x * 0.32)
  );
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
  float foam = smoothstep(0.62, 0.82, waveValue) * foamAmount *
    mix(0.35, 1.0, currentRidge);
  vec3 scattering = mix(deepColor, shallowColor, depth) * 0.2;
  scattering = mix(scattering, deepColor * 0.16, belowWater);
  vec3 color = fresnel * reflection + scattering;
  color = mix(color, foamColor, foam * 0.42);
  gl_FragColor = vec4(acesTonemap(color * 2.0), clamp(opacity, 0.0, 1.0));
}
`;
