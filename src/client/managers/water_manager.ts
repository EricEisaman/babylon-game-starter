import { oceanFragmentShader, oceanVertexShader } from '../shaders/ocean';
import { riverFragmentShader, riverVertexShader } from '../shaders/river';
import { devLog } from '../utils/dev_log';

type WaterUniformDefault = number | readonly [number, number, number];
type WaterUniforms = Readonly<Record<string, WaterUniformDefault>>;
type MetadataRecord = Record<string, unknown>;

interface WaterShaderDefinition {
  readonly shaderKey: string;
  readonly vertexShader: string;
  readonly fragmentShader: string;
  readonly uniforms: WaterUniforms;
}

const RIVER_SHADER: WaterShaderDefinition = {
  shaderKey: 'environmentRiverWater',
  vertexShader: riverVertexShader,
  fragmentShader: riverFragmentShader,
  uniforms: {
    flowSpeed: 0.22,
    flowScale: 0.55,
    waveStrength: 0.55,
    foamAmount: 0.45,
    fresnelPower: 4.2,
    opacity: 0.96,
    shallowColor: [0.08, 0.48, 0.56],
    deepColor: [0.025, 0.19, 0.29],
    foamColor: [0.58, 0.82, 0.82]
  }
};

const OCEAN_SHADER: WaterShaderDefinition = {
  shaderKey: 'environmentOceanWater',
  vertexShader: oceanVertexShader,
  fragmentShader: oceanFragmentShader,
  uniforms: {
    waveSpeed: 0.55,
    waveScale: 0.45,
    waveHeight: 0.65,
    foamAmount: 0.85,
    fresnelPower: 3.6,
    opacity: 0.88,
    deepColor: [0.015, 0.1, 0.24],
    surfaceColor: [0.04, 0.39, 0.58],
    foamColor: [0.77, 0.93, 0.94]
  }
};

function asRecord(value: unknown): MetadataRecord | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as MetadataRecord)
    : null;
}

function getMetadataProperties(metadataValue: unknown): MetadataRecord {
  const metadata = asRecord(metadataValue);
  const gltf = asRecord(metadata?.gltf);
  const candidates = [
    metadata,
    asRecord(metadata?.extras),
    gltf,
    asRecord(gltf?.extras),
    asRecord(metadata?.gltfExtras)
  ];
  return Object.assign({}, ...candidates.filter((candidate) => candidate !== null));
}

export function isWaterMesh(mesh: BABYLON.AbstractMesh): boolean {
  let node: BABYLON.Node | null = mesh;
  while (node) {
    if (node.name.startsWith('water_')) {
      return true;
    }
    node = node.parent;
  }
  return false;
}

function getMeshProperties(mesh: BABYLON.AbstractMesh): MetadataRecord {
  const hierarchy: BABYLON.Node[] = [];
  let node: BABYLON.Node | null = mesh;
  while (node) {
    hierarchy.push(node);
    node = node.parent;
  }

  return Object.assign(
    {},
    ...hierarchy.reverse().map((entry) => getMetadataProperties(entry.metadata))
  );
}

function parseColor(value: unknown): BABYLON.Color3 | null {
  if (Array.isArray(value) && value.length >= 3) {
    const [red, green, blue] = value.map(Number);
    if ([red, green, blue].every(Number.isFinite)) {
      return new BABYLON.Color3(red, green, blue);
    }
  }

  const record = asRecord(value);
  if (record && ['r', 'g', 'b'].every((channel) => Number.isFinite(record[channel]))) {
    return new BABYLON.Color3(Number(record.r), Number(record.g), Number(record.b));
  }

  if (typeof value === 'string' && /^#?[\da-f]{6}$/i.test(value)) {
    const hex = value.startsWith('#') ? value.slice(1) : value;
    return BABYLON.Color3.FromHexString(`#${hex}`);
  }

  return null;
}

function applyUniforms(
  material: BABYLON.ShaderMaterial,
  defaults: WaterUniforms,
  properties: MetadataRecord
): void {
  const customUniforms = asRecord(properties.uniforms);

  for (const [name, defaultValue] of Object.entries(defaults)) {
    const customValue = customUniforms?.[name] ?? properties[name];
    if (typeof defaultValue === 'number') {
      const value = customValue === undefined ? defaultValue : Number(customValue);
      if (Number.isFinite(value)) {
        material.setFloat(name, value);
      }
      continue;
    }

    const color = parseColor(customValue) ?? new BABYLON.Color3(...defaultValue);
    material.setColor3(name, color);
  }
}

export class WaterManager {
  private readonly materials: BABYLON.ShaderMaterial[] = [];
  private readonly startTime = performance.now();
  private isUpdatingTime = false;

  private readonly updateTime = (): void => {
    const time = (performance.now() - this.startTime) / 1000;
    for (const material of this.materials) {
      material.setFloat('time', time);
    }
  };

  public constructor(private readonly scene: BABYLON.Scene) {}

  public applyToMeshes(meshes: readonly BABYLON.AbstractMesh[]): number {
    let appliedCount = 0;

    for (const mesh of meshes) {
      if (!isWaterMesh(mesh)) {
        continue;
      }

      const properties = getMeshProperties(mesh);
      const customType = properties.type ?? properties.customType;
      const type = typeof customType === 'string' ? customType.toLowerCase() : '';
      const definition = type === 'river' ? RIVER_SHADER : type === 'ocean' ? OCEAN_SHADER : null;
      if (!definition) {
        devLog('[WaterManager] No supported type metadata found for water mesh', {
          meshName: mesh.name,
          properties
        });
        continue;
      }

      BABYLON.Effect.ShadersStore[`${definition.shaderKey}VertexShader`] = definition.vertexShader;
      BABYLON.Effect.ShadersStore[`${definition.shaderKey}FragmentShader`] =
        definition.fragmentShader;

      const material = new BABYLON.ShaderMaterial(
        `${mesh.name}_${type}_water`,
        this.scene,
        { vertex: definition.shaderKey, fragment: definition.shaderKey },
        {
          attributes: ['position', 'normal'],
          uniforms: [
            'world',
            'view',
            'worldViewProjection',
            'time',
            ...Object.keys(definition.uniforms)
          ],
          needAlphaBlending: true
        }
      );
      material.backFaceCulling = false;
      applyUniforms(material, definition.uniforms, properties);
      mesh.material = material;
      this.materials.push(material);
      appliedCount += 1;
    }

    if (appliedCount > 0 && !this.isUpdatingTime) {
      this.scene.onBeforeRenderObservable.add(this.updateTime);
      this.isUpdatingTime = true;
    }

    return appliedCount;
  }

  public dispose(): void {
    if (this.isUpdatingTime) {
      this.scene.onBeforeRenderObservable.removeCallback(this.updateTime);
      this.isUpdatingTime = false;
    }

    for (const material of this.materials) {
      material.dispose();
    }
    this.materials.length = 0;
  }
}
