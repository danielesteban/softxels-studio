import {
  Clock,
  PerspectiveCamera,
  sRGBEncoding,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
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
}, false);
document.addEventListener('visibilitychange', () => {
  const isVisible = document.visibilityState === 'visible';
  if (isVisible) {
    clock.start();
    fps.count = -1;
    fps.lastTick = (clock.oldTime / 1000);
  }
}, false);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
const scene = new Scene(camera);

renderer.setAnimationLoop(() => {
  const delta = Math.min(clock.getDelta(), 1);
  const time = clock.oldTime / 1000;
  controls.update(delta);
  renderer.render(scene, camera);
  fps.count += 1;
  if (time >= fps.lastTick + 1) {
    const count = Math.round(fps.count / (time - fps.lastTick));
    fps.dom.innerText = `${count}fps`;
    fps.lastTick = time;
    fps.count = 0;
  }
});

window.addEventListener('contextmenu', (e) => e.preventDefault(), false);
