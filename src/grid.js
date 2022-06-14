import {
  Mesh,
  PlaneBufferGeometry,
  ShaderLib,
  ShaderMaterial,
  UniformsUtils,
} from 'three';

class Grid extends Mesh {
  static setupGeometry() {
    Grid.geometry = new PlaneBufferGeometry(256, 256, 1, 1);
    Grid.geometry.deleteAttribute('uv');
    Grid.geometry.rotateX(Math.PI * -0.5);
  }

  static setupMaterial() {
    const { vertexShader, fragmentShader, uniforms } = ShaderLib.basic;
    Grid.material = new ShaderMaterial({
      uniforms: {
        ...UniformsUtils.clone(uniforms),
        gridScale: { value: 0.125 },
        chunkSize: { value: 32 },
      },
      vertexShader: vertexShader
        .replace('#include <common>', [
          '#include <common>',
          'varying vec2 gridPosition;',
          'varying vec3 fragPosition;',
          'uniform float gridScale;',
        ].join('\n'))
        .replace('#include <fog_vertex>', [
          '#include <fog_vertex>',
          'gridPosition = vec3(modelMatrix * vec4(position / gridScale, 1.0)).xz;',
          'fragPosition = vec3(modelViewMatrix * vec4(position.x, cameraPosition.y, position.z, 1.0));',
        ].join('\n')),
      fragmentShader: fragmentShader
        .replace('#include <common>', [
          '#include <common>',
          'varying vec2 gridPosition;',
          'varying vec3 fragPosition;',
          'uniform float chunkSize;',
          'const float fogDensity = 0.03;',
          'float line(vec2 position) {',
          '  vec2 coord = abs(fract(position - 0.5) - 0.5) / fwidth(position);',
          '  return 1.0 - min(min(coord.x, coord.y), 1.0);',
          '}',
        ].join('\n'))
        .replace('vec4 diffuseColor = vec4( diffuse, opacity );', [
          'vec4 diffuseColor = vec4( diffuse, opacity );',
          'float gridLine = line(gridPosition / chunkSize) + line(gridPosition);',
          'diffuseColor.xyz = mix(diffuse, max(diffuse, vec3(0.01)) * 1.2, gridLine);',
        ].join('\n'))
        .replace('#include <fog_fragment>', [
          'float fogDepth = length(fragPosition);',
          'float fogFactor = 1.0 - exp( - fogDensity * fogDensity * fogDepth * fogDepth );',
          'gl_FragColor.xyz = mix(gl_FragColor.xyz, vec3(0.0), fogFactor);',
        ].join('\n')),
    });
    Grid.material.uniforms.diffuse.value.set(0);
  }

  constructor() {
    if (!Grid.geometry) {
      Grid.setupGeometry();
    }
    if (!Grid.material) {
      Grid.setupMaterial();
    }
    super(Grid.geometry, Grid.material);
  }
}

export default Grid;
