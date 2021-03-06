import path from 'path';
import copy from 'rollup-plugin-copy';
import livereload from 'rollup-plugin-livereload';
import postcss from 'rollup-plugin-postcss';
import resolve from '@rollup/plugin-node-resolve';
import serve from 'rollup-plugin-serve';
import { terser } from 'rollup-plugin-terser';
import webWorkerLoader from 'rollup-plugin-web-worker-loader';

const outputPath = path.resolve(__dirname, 'dist');
const production = !process.env.ROLLUP_WATCH;

export default {
  input: path.join(__dirname, 'src', 'app.js'),
  output: {
    dir: outputPath,
    format: 'iife',
  },
  plugins: [
    copy({
      targets: [{ src: 'public/*', dest: 'dist' }],
      copyOnce: !production,
    }),
    resolve({
      browser: true,
    }),
    postcss({
      extract: 'app.css',
      minimize: production,
    }),
    webWorkerLoader({
      forceInline: true,
      skipPlugins: ['copy'],
    }),
    ...(production ? [
      terser({ format: { comments: false } }),
    ] : [
      serve({
        contentBase: outputPath,
        port: 8080,
      }),
      livereload(outputPath),
    ]),
  ],
  watch: { clearScreen: false },
};
