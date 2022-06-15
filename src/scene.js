import { deflate, Unzip, UnzipInflate, Zip, ZipDeflate, ZipPassThrough } from 'fflate';
import {
  Box3,
  Box3Helper,
  BufferAttribute,
  BufferGeometry,
  Group,
  MathUtils,
  MeshBasicMaterial,
  Points,
  PointsMaterial,
  Scene,
  Vector3,
} from 'three';
import World from 'softxels';
import Grid from './grid.js';
import Worker from 'web-worker:./worker.js';

const _box = new Box3();
const _size = new Vector3();

class Studio extends Scene {
  constructor({ camera, controls, renderer }) {
    super();

    this.options = {
      gain: 1.7,
      grid: 1,
      resolution: 10,
      rotateX: -90,
      rotateY: 0,
      rotateZ: 0,
      metadata: {
        chunkSize: 32,
        scale: 0.125,
        spawn: [0, 8, 0],
        version: '0.0.1',
      },
    };

    camera.position.set(0, 16, 8);
    controls.orbit.target.set(0, 8, 0);
    this.renderer = renderer;

    this.grid = new Grid();
    this.add(this.grid);

    this.pointcloud = new Points(new BufferGeometry(), new PointsMaterial({ vertexColors: true }));
    this.pointcloud.frustumCulled = false;
    this.pointcloud.geometry.computeBoundingBox();
    this.pointcloud.geometry.computeBoundingSphere();
    this.add(this.pointcloud);

    this.world = new World({ chunkMaterial: new MeshBasicMaterial({ vertexColors: true }) });
    this.world.addEventListener('update', () => { this.renderer.needsUpdate = true; });
    this.add(this.world);

    this.spawn = new Group();
    this.spawn.add(new Box3Helper((new Box3()).setFromCenterAndSize(new Vector3(0, 1, 0), new Vector3(0.5, 2, 0.5)), 0x339933));
    this.spawn.position.fromArray(this.options.metadata.spawn);
    this.add(this.spawn);

    controls.transform.attach(this.spawn);
    this.spawn.transform = controls.transform;
    this.add(controls.transform);

    this.worker = new Worker();
    let requestId = 0;
    const requests = new Map();
    this.worker.addEventListener('message', ({ data }) => {
      const request = requests.get(data.request);
      if (request) {
        requests.delete(data.request);
        if (data.err) request.reject(data.err);
        else request.resolve(data);
      }
    }, false);
    this.worker.request = (payload, transfer) => new Promise((resolve, reject) => {
      const request = requestId++;
      requests.set(request, { resolve, reject });
      this.worker.postMessage({ ...payload, request }, transfer);
    });

    this.setupUI();
    this.onDragEnter = this.onDragEnter.bind(this);
    this.onDragOver = this.onDragOver.bind(this);
    this.onDrop = this.onDrop.bind(this);
    window.addEventListener('dragenter', this.onDragEnter, false);
    window.addEventListener('dragover', this.onDragOver, false);
    window.addEventListener('drop', this.onDrop, false);
  }

  load(file) {
    const { pointcloud, ui: { loading, downloadViewer, downloadWorld, generate, publish }, world, worker } = this;
    world.reset();
    delete this.buffer;
    pointcloud.hasLoaded = false;
    loading.classList.add('enabled');
    downloadViewer.disabled = downloadWorld.disabled = generate.disabled = publish.disabled = true;
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    })
      .then((buffer) => (
        worker.request({ operation: 'load', buffer }, [buffer])
      ))
      .then(({ color, position }) => {
        generate.disabled = false;
        pointcloud.geometry.setAttribute('color', new BufferAttribute(color, 3));
        pointcloud.geometry.setAttribute('position', new BufferAttribute(position, 3));
        pointcloud.geometry.computeBoundingBox();
        pointcloud.hasLoaded = true;
        this.update();
      })
      .catch((e) => {
        console.error(e);
      })
      .finally(() => {
        loading.classList.remove('enabled');
      });
  }

  generate() {
    const {
      options,
      pointcloud: { geometry },
      ui: { loading, generate, downloadViewer, downloadWorld, publish },
      world,
      worker,
    } = this;
    world.reset();
    delete this.buffer;
    loading.classList.add('enabled');
    downloadViewer.disabled = downloadWorld.disabled = generate.disabled = publish.disabled = true;
    worker.request({
      operation: 'generate',
      geometry: {
        color: geometry.getAttribute('color').array,
        position: geometry.getAttribute('position').array
      },
      options,
    })
      .then(({ buffer }) => {
        this.buffer = buffer;
        world.importChunks(buffer.buffer, true, false);
        downloadViewer.disabled = downloadWorld.disabled = publish.disabled = false;
      })
      .catch((e) => {
        console.error(e);
      })
      .finally(() => {
        loading.classList.remove('enabled');
      });
  }

  download({ target }) {
    const {
      options,
      ui: { loading, downloader, downloadViewer, downloadWorld },
    } = this;
    loading.classList.add('enabled');
    target.disabled = true;
    const download = (buffers, ext) => {
      target.disabled = false;
      const blob = URL.createObjectURL(new Blob(buffers));
      downloader.download = `${(options.metadata.name || 'world')}.${ext}`;
      downloader.href = blob;
      downloader.click();
      setTimeout(() => URL.revokeObjectURL(blob), 0);
    };
    Promise.all([
      this.getOutput(),
      ...(target === downloadViewer ? [this.getViewer()] : []),
    ])
      .then(([output, viewer]) => {
        switch (target) {
          case downloadWorld:
            return download([output], 'bin');
          case downloadViewer:
            return (new Promise((resolve, reject) => {
              const buffers = [];
              const zip = new Zip((err, data, final) => {
                if (err) {
                  reject(err);
                  return;
                }
                buffers.push(data.buffer);
                if (final) {
                  resolve(buffers);
                }
              });
              const unzipper = new Unzip();
              unzipper.register(UnzipInflate);
              unzipper.onfile = (file) => {
                const copy = new ZipDeflate(file.name);
                zip.add(copy);
                file.ondata = (err, data, final) => {
                  if (err) {
                    reject(err);
                    return;
                  }
                  copy.push(data, final);
                };
                file.start();
              };
              unzipper.push(new Uint8Array(viewer), true);
              const world = new ZipPassThrough('world.bin');
              zip.add(world);
              world.push(output, true);
              zip.end();
            }))
            .then((buffers) => download(buffers, 'zip'));
        }
      })
      .catch((e) => {
        console.error(e);
      })
      .finally(() => {
        loading.classList.remove('enabled');
      });
  }

  publish({ target }) {
    const {
      options,
      ui: { loading, viewer },
    } = this;
    delete this.cid;
    loading.classList.add('enabled');
    target.disabled = viewer.disabled = true;
    Promise.all([
      this.getIPFS(),
      this.getOutput(),
    ])
      .then(([ipfs, output]) => (
        ipfs.add({ path: `${(options.metadata.name || 'world')}.bin`, content: output })
      ))
      .then((file) => {
        viewer.disabled = false;
        this.cid = `${file.cid}`;
      })
      .catch((e) => {
        console.error(e);
      })
      .finally(() => {
        loading.classList.remove('enabled');
      });
  }

  update() {
    const {
      grid,
      options: {
        metadata,
        resolution,
        rotateX,
        rotateY,
        rotateZ
      },
      pointcloud,
      renderer,
      spawn,
      world,
    } = this;
    grid.material.uniforms.gridScale.value = metadata.scale;
    pointcloud.material.size = metadata.scale;
    pointcloud.position.set(0, 0, 0);
    pointcloud.rotation.set(MathUtils.degToRad(rotateX), MathUtils.degToRad(rotateY), MathUtils.degToRad(rotateZ));
    pointcloud.scale.setScalar(resolution * metadata.scale);
    pointcloud.updateMatrixWorld();
    _box.copy(pointcloud.geometry.boundingBox);
    _box.applyMatrix4(pointcloud.matrixWorld);
    _box.getSize(_size);
    pointcloud.position.set(0, _size.y * 0.5, 0);
    spawn.position.fromArray(this.options.metadata.spawn);
    world.scale.setScalar(metadata.scale);
    world.updateMatrixWorld();
    renderer.needsUpdate = true;
  }

  getIPFS() {
    if (this.ipfs) {
      return Promise.resolve(this.ipfs);
    }
    return (new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.type = 'text/javascript';
      script.onload = resolve;
      script.onerror = reject;
      script.src = 'https://cdn.jsdelivr.net/npm/ipfs-core@0.15.2/dist/index.min.js';
      document.head.appendChild(script);
    }))
      .then(() => window.IpfsCore.create({
        repo: String(Math.random() + Date.now()),
        init: { alogorithm: 'ed25519' }
      }))
      .then((node) => {
        this.ipfs = node;
        return node;
      });
  }

  getOutput() {
    const {
      buffer,
      options,
    } = this;
    let output = buffer;
    if (buffer.metadataNeedsUpdate) {
      const metadata = (new TextEncoder()).encode(JSON.stringify(options.metadata));
      const prev = 2 + (new Uint16Array(buffer.slice(0, 2)))[0];
      const next = 2 + metadata.length;
      output = new Uint8Array(buffer.length - prev + next);
      output.set(new Uint8Array((new Uint16Array([metadata.length])).buffer), 0);
      output.set(metadata, 2);
      output.set(buffer.slice(prev), next);
    }
    return new Promise((resolve, reject) => {
      deflate(output, (err, buffer) => {
        if (err) reject(err);
        else resolve(buffer);
      })
    });
  }

  getViewer() {
    if (this.viewer) {
      return Promise.resolve(this.viewer);
    }
    return fetch('/viewer.zip')
      .then((res) => res.arrayBuffer())
      .then((buffer) => {
        this.viewer = buffer;
        return buffer;
      });
  }

  onDragEnter(e) {
    e.preventDefault();
  }

  onDragOver(e) {
    e.preventDefault();
  }

  onDrop(e) {
    e.preventDefault();
    const [file] = e.dataTransfer.files;
    if (!file) {
      return;
    }
    this.load(file);
  }

  setupUI() {
    const ui = document.getElementById('ui');

    const actions = (title, actions) => {
      const h4 = document.createElement('h4');
      h4.innerText = title;
      ui.appendChild(h4);
      const div = document.createElement('div');
      div.className = 'actions';
      ui.appendChild(div);
      return actions.map(([name, onClick]) => {
        const button = document.createElement('button');
        button.disabled = true;
        button.innerText = name;
        button.addEventListener('click', onClick, false);
        div.appendChild(button);
        return button;
      });
    };

    const form = (title, inputs, onChange) => {
      const h4 = document.createElement('h4');
      h4.innerText = title;
      ui.appendChild(h4);
      const form = document.createElement('div');
      form.className = 'form';
      ui.appendChild(form);
      return inputs.map(([name, key, state, type]) => {
        const div = document.createElement('div');
        const label = document.createElement('label');
        const input = document.createElement('input');
        div.appendChild(label);
        div.appendChild(input);
        label.innerText = name;
        if (type === 'bool') {
          input.type = 'checkbox';
          input.checked = !!state[key];
        } else {
          if (type === 'text') {
            input.type = 'text';
          } else {
            input.type = 'number';
            input.step = type === 'float' ? 0.01 : 1;
          }
          input.value = `${state[key] !== undefined ? state[key] : ''}`;
        }
        input.addEventListener('input', () => {
          let { value } = input;
          switch (type) {
            default:
              value = parseInt(input.value, 10);
              break;
            case 'bool':
              value = !!input.checked;
              break;
            case 'float':
              value = parseFloat(input.value);
              break;
          }
          state[key] = value;
          if (onChange) {
            onChange();
          }
        }, false);
        form.appendChild(div);
        return input;
      });
    };

    const downloader = document.createElement('a');
    downloader.style.display = 'none';
    ui.appendChild(downloader);
    const loader = document.createElement('input');
    loader.accept = '.ply';
    loader.style.display = 'none';
    loader.type = 'file';
    loader.addEventListener('change', () => {
      this.load(loader.files[0]);
      loader.value = null;
    }, false);
    ui.appendChild(loader);

    const [load, generate] = actions('Pointcloud', [
      ['Load (.PLY)', () => loader.click()],
      ['Voxelize', this.generate.bind(this)],
    ]);
    load.disabled = false;

    const updateMetadata = () => {
      this.update();
      if (this.buffer) {
        this.buffer.metadataNeedsUpdate = true;
        publish.disabled = false;
        viewer.disabled = true;
      }
    };

    const [/*auhtor*/, /*name*/, /*scale*/, spawnX, spawnY, spawnZ] = form('Metadata', [
      ['Author', 'author', this.options.metadata, 'text'],
      ['Name', 'name', this.options.metadata, 'text'],
      ['Render scale', 'scale', this.options.metadata, 'float'],
      ['SpawnX', 0, this.options.metadata.spawn, 'float'],
      ['SpawnY', 1, this.options.metadata.spawn, 'float'],
      ['SpawnZ', 2, this.options.metadata.spawn, 'float'],
    ], updateMetadata);
  
    this.spawn.transform.addEventListener('objectChange', () => {
      const { position } = this.spawn;
      this.options.metadata.spawn[0] = position.x;
      this.options.metadata.spawn[1] = position.y;
      this.options.metadata.spawn[2] = position.z;
      spawnX.value = position.x.toLocaleString();
      spawnY.value = position.y.toLocaleString();
      spawnZ.value = position.z.toLocaleString();
      updateMetadata();
    });

    form('Voxelizer', [
      ['Gain', 'gain', this.options, 'float'],
      ['Grid', 'grid', this.options],
      ['Resolution', 'resolution', this.options],
      ['RotateX', 'rotateX', this.options],
      ['RotateY', 'rotateY', this.options],
      ['RotateZ', 'rotateZ', this.options],
    ], () => {
      this.update();
      this.world.reset();
      generate.disabled = !this.pointcloud.hasLoaded;
      downloadViewer.disabled = downloadWorld.disabled = publish.disabled = viewer.disabled = true;
    });

    const [downloadWorld, downloadViewer] = actions('Download', [
      ['World (.BIN)', this.download.bind(this)],
      ['Viewer (.ZIP)', this.download.bind(this)],
    ]);

    const [publish, viewer] = actions('IPFS', [
      ['Publish', this.publish.bind(this)],
      ['Open viewer', () => window.open(`https://softxels-viewer.gatunes.com/#/ipfs:${this.cid}`)],
    ]);
    
    form('Visibility', [
      ['Pointcloud', 'visible', this.pointcloud, 'bool'],
      ['Softxels', 'visible', this.world, 'bool'],
      ['Spawn', 'visible', this.spawn, 'bool'],
    ], () => {
      this.spawn.transform.visible = this.spawn.visible;
      this.renderer.needsUpdate = true;
    });

    this.ui = {
      loading: document.getElementById('loading'),
      downloader,
      downloadViewer,
      downloadWorld,
      generate,
      publish,
      viewer,
    };
  }
}

export default Studio;
