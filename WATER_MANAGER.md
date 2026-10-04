# Water Manager

`WaterManager` assigns procedural `BABYLON.ShaderMaterial` instances to imported water meshes. A mesh is considered water when its name, or an ancestor's name, begins with `water_`. Its metadata `type` (or `customType`) selects the shader: `ocean`, `river`, or `lake`.

## Type Behavior

| Type    | Shader character                                                                                    | Type-specific controls                                                                       |
| ------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `ocean` | Broad open-water wave field, atmospheric reflection, sun glint, and crest foam                      | `foamAmount`, `deepColor`, `surfaceColor`, `foamColor`                                       |
| `river` | Advected current and narrow ridge foam; flow follows the long horizontal axis of ladder-like meshes | `flowSpeed`, `flowScale`, `flowAxis`, `foamAmount`, `shallowColor`, `deepColor`, `foamColor` |
| `lake`  | Slow, broad surface motion with animated procedural caustic highlights                              | `causticScale`, `causticStrength`, `deepColor`, `surfaceColor`, `reflectionColor`            |

All types share the 24-iteration procedural wave field and reference-style Fresnel, atmospheric reflection, sun, and ACES tonemapping. The shaders are top-facing only. Shared defaults:

| Uniform          |       Default | Meaning                                                                                                   |
| ---------------- | ------------: | --------------------------------------------------------------------------------------------------------- |
| `waveHeight`     |         `0.2` | World-space vertical wave-height scale, in scene units (treated as meters)                                |
| `opacity`        |         `0.8` | Alpha used for water blending; values are clamped to `0..1`                                               |
| `normalStrength` | Type-specific | Lighting-normal detail only; ocean `3.0`, river `1.0`, lake `0.7`. Does not change geometric wave height. |

Lake caustics use warped noise rather than a regular sine grid and default to a subtle `causticStrength` of `0.07`.

This is a procedural wave approximation based on the referenced iterative GLSL pattern, not an FFT simulation. Reflections use an analytic atmosphere and sun rather than a sampled environment map; lake caustics are a visual approximation.

## GLTF Metadata

Put the type and optional uniforms on the water mesh or any ancestor. The manager reads direct metadata, `extras`, and the GLTF metadata/extras locations. Metadata on a descendant overrides matching values on its ancestors. Uniforms may be direct properties or grouped under `uniforms`.

For example, with a `water_lake` node:

```json
{
  "gltf": {
    "extras": {
      "type": "lake",
      "uniforms": {
        "opacity": 0.68,
        "waveHeight": 0.12,
        "waveSpeed": 0.06,
        "causticStrength": 0.07,
        "surfaceColor": [0.12, 0.42, 0.43]
      }
    }
  }
}
```

Scalar uniforms accept finite numbers (numeric strings are converted). Color uniforms accept RGB arrays, `{ "r": 0.1, "g": 0.3, "b": 0.4 }`, or six-digit hex strings.

## River Meshes

Build river surfaces as elongated horizontal grids, with vertices arranged in rows across the channel and repeated rungs along its length. The manager compares the mesh's local X and Z bounds and flows along whichever horizontal axis is longer. This suits ladder-like strip topology and works whether the strip runs along local X or Z.

Set `flowAxis` to override inference: `0` selects local X as the river length; `1` selects local Z. `flowSpeed` controls advection and `flowScale` controls the current pattern size. The river's underlying waves and water height remain independently adjustable with `waveSpeed`, `waveScale`, and `waveHeight`.

## Uniform Reference

Shared configurable uniforms:

- `waveSpeed`, `waveScale`, `waveHeight`, `normalStrength`, `opacity`, `fresnelPower`
- The color uniforms listed for each water type above

Ocean additionally supports `foamAmount`; river supports `flowSpeed`, `flowScale`, `flowAxis`, and `foamAmount`; lake supports `causticScale` and `causticStrength`.

The manager updates `time` and the active camera's world position automatically. Back-face culling is disabled for imported water meshes, and the shader orients its lighting normal toward the active camera, so the surface renders from above or below. These internal values are not GLTF override controls.
