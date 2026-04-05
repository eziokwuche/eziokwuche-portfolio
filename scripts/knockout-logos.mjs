import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOGOS_DIR = path.join(__dirname, "..", "public", "skills-logos");

const TOLERANCE = 52;
const MAX_TRANSPARENT_RATIO = 0.92;
const MIN_OPAQUE_CORNERS = 2;

function idx(x, y, w) {
  return (y * w + x) * 4;
}

function medianChannel(samples, c) {
  const arr = samples.map((s) => s[c]).sort((a, b) => a - b);
  return arr[Math.floor(arr.length / 2)];
}

function cornerSamples(data, w, h) {
  const corners = [
    [0, 0],
    [w - 1, 0],
    [0, h - 1],
    [w - 1, h - 1],
  ];
  const samples = [];
  for (const [x, y] of corners) {
    const i = idx(x, y, w);
    if (data[i + 3] > 40) samples.push([data[i], data[i + 1], data[i + 2]]);
  }
  return samples;
}

function similar(data, i, br, bg, bb) {
  if (data[i + 3] < 25) return false;
  const d =
    Math.abs(data[i] - br) +
    Math.abs(data[i + 1] - bg) +
    Math.abs(data[i + 2] - bb);
  return d <= TOLERANCE;
}

async function processFile(filePath) {
  const base = path.basename(filePath);
  if (base === "nextjs.svg") return;

  const buf = await fs.readFile(filePath);
  let input = sharp(buf).ensureAlpha();
  const meta = await input.metadata();
  if (meta.format === "svg") return;

  const { data, info } = await input.raw().toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;
  if (!w || !h) return;

  const samples = cornerSamples(data, w, h);
  if (samples.length < MIN_OPAQUE_CORNERS) return;

  const br = medianChannel(samples, 0);
  const bg = medianChannel(samples, 1);
  const bb = medianChannel(samples, 2);

  const visited = new Uint8Array(w * h);
  const q = [];

  const trySeed = (x, y) => {
    if (x < 0 || x >= w || y < 0 || y >= h) return;
    const p = y * w + x;
    if (visited[p]) return;
    const i = idx(x, y, w);
    if (!similar(data, i, br, bg, bb)) return;
    visited[p] = 1;
    q.push(x, y);
  };

  trySeed(0, 0);
  trySeed(w - 1, 0);
  trySeed(0, h - 1);
  trySeed(w - 1, h - 1);

  if (q.length === 0) return;

  let qi = 0;
  let cleared = 0;
  while (qi < q.length) {
    const x = q[qi++];
    const y = q[qi++];
    const i = idx(x, y, w);
    data[i + 3] = 0;
    cleared++;

    const neighbors = [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ];
    for (const [nx, ny] of neighbors) {
      if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
      const p = ny * w + nx;
      if (visited[p]) continue;
      const ni = idx(nx, ny, w);
      if (!similar(data, ni, br, bg, bb)) continue;
      visited[p] = 1;
      q.push(nx, ny);
    }
  }

  if (cleared / (w * h) > MAX_TRANSPARENT_RATIO) {
    console.warn(`skip ${base}: would clear ${(cleared / (w * h)).toFixed(2)} of pixels`);
    return;
  }

  const out = await sharp(Buffer.from(data), {
    raw: { width: w, height: h, channels: 4 },
  })
    .png({ compressionLevel: 9, effort: 10, palette: false })
    .toBuffer();

  const outName = path.basename(filePath, path.extname(filePath)) + ".png";
  await fs.writeFile(path.join(path.dirname(filePath), outName), out);
  console.log(`ok ${base} → rgba png (${cleared} px cleared)`);
}

const entries = await fs.readdir(LOGOS_DIR);
for (const name of entries) {
  const p = path.join(LOGOS_DIR, name);
  const st = await fs.stat(p);
  if (!st.isFile()) continue;
  await processFile(p);
}
