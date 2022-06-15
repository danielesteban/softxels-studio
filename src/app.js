import {
  Clock,
  PerspectiveCamera,
  sRGBEncoding,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import Scene from './scene.js';
import './app.css';

const camera = new PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const clock = new Clock();
const fps = {
  dom: document.getElementById('fps'),
  count: 0,
  lastTick: clock.oldTime / 1000,
};
const renderer = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance', stencil: false });
renderer.outputEncoding = sRGBEncoding;
renderer.setSize(window.innerWidth - 270, window.innerHeight);
document.getElementById('renderer').appendChild(renderer.domElement);
window.addEventListener('resize', () => {
  const width = window.innerWidth - 270;
  renderer.setSize(width, window.innerHeight);
  camera.aspect = width / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.needsUpdate = true;
}, false);
document.addEventListener('visibilitychange', () => {
  const isVisible = document.visibilityState === 'visible';
  if (isVisible) {
    clock.start();
    fps.count = -1;
    fps.lastTick = (clock.oldTime / 1000);
  }
}, false);

const controls = {
  orbit: new OrbitControls(camera, renderer.domElement),
  transform: new TransformControls(camera, renderer.domElement),
};
controls.orbit.addEventListener('change', () => { renderer.needsUpdate = true; });
controls.orbit.enableDamping = true;
controls.transform.addEventListener('change', () => { renderer.needsUpdate = true; });
controls.transform.setSize(0.5);
controls.transform.setTranslationSnap(0.01);
controls.transform.addEventListener('dragging-changed', ({ value }) => { controls.orbit.enabled = !value; });

const scene = new Scene({ camera, controls, renderer });

renderer.setAnimationLoop(() => {
  const delta = Math.min(clock.getDelta(), 1);
  const time = clock.oldTime / 1000;
  controls.orbit.update(delta);
  if (renderer.needsUpdate) {
    renderer.needsUpdate = false;
    renderer.render(scene, camera);
  }
  fps.count += 1;
  if (time >= fps.lastTick + 1) {
    const count = Math.round(fps.count / (time - fps.lastTick));
    fps.dom.innerText = `${count}fps`;
    fps.lastTick = time;
    fps.count = 0;
  }
});
