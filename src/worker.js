import {
  BufferAttribute,
  BufferGeometry,
  MathUtils,
  Vector3,
} from 'three';
import { parse, voxelize, chunk, pack } from 'softxels-voxelizer';

const load = ({ buffer, request }) => {
  parse({ buffer })
    .then((geometry) => {
      const { array: color } = geometry.getAttribute('color');
      const { array: position } = geometry.getAttribute('position');
      self.postMessage({ color, position, request }, [color.buffer, position.buffer]);
    })
    .catch((err) => {
      self.postMessage({ err, request });
    });
};

const generate = ({
  geometry: { color, position },
  options: {
    metadata,
    gain,
    grid,
    rotateX,
    rotateY,
    rotateZ,
    resolution,
  },
  request,
}) => {
  const geometry = new BufferGeometry();
  geometry.setAttribute('color', new BufferAttribute(color, 3));
  geometry.setAttribute('position', new BufferAttribute(position, 3));
  if (rotateX) {
    geometry.rotateX(MathUtils.degToRad(rotateX));
  }
  if (rotateY) {
    geometry.rotateY(MathUtils.degToRad(rotateY));
  }
  if (rotateZ) {
    geometry.rotateZ(MathUtils.degToRad(rotateZ));
  }
  geometry.computeBoundingBox();
  geometry.boundingBox.size = geometry.boundingBox.getSize(new Vector3());
  geometry.translate(0, geometry.boundingBox.size.y * 0.5, 0);
  voxelize({ geometry, gain, grid, resolution })
    .then((voxels) => chunk({ metadata, voxels }))
    .then((chunks) => pack({ chunks, metadata }))
    .then((buffer) => {
      self.postMessage({ buffer, request }, [buffer.buffer]);
    })
    .catch((err) => {
      self.postMessage({ err, request });
    });
};

self.addEventListener('message', ({ data }) => {
  switch (data.operation) {
    case 'load':
      load(data);
      break;
    case 'generate':
      generate(data);
      break;
  }
});
