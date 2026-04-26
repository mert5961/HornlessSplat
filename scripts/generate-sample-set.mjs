import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const outputPath = resolve('public/assets/sample-set.ply');
const splats = [];

for (let x = -12; x <= 12; x++) {
  for (let z = -12; z <= 12; z++) {
    splats.push({
      x: x * 0.12,
      y: -0.72,
      z: z * 0.12,
      color: [0.12 + (x + 12) / 72, 0.34, 0.48 + (z + 12) / 96],
      scale: [0.09, 0.02, 0.09],
      opacity: 6
    });
  }
}

for (let x = -14; x <= 14; x++) {
  for (let y = -6; y <= 12; y++) {
    splats.push({
      x: x * 0.11,
      y: y * 0.11,
      z: -1.55,
      color: [0.58, 0.24 + (y + 6) / 64, 0.17 + (x + 14) / 130],
      scale: [0.075, 0.075, 0.03],
      opacity: 6
    });
  }
}

for (let i = 0; i < 80; i++) {
  const angle = (i / 80) * Math.PI * 2;
  splats.push({
    x: Math.cos(angle) * 0.72,
    y: Math.sin(angle) * 0.38 + 0.18,
    z: -0.7 + Math.sin(angle * 3) * 0.05,
    color: [0.95, 0.76, 0.32],
    scale: [0.055, 0.055, 0.055],
    opacity: 7
  });
}

const header = [
  'ply',
  'format binary_little_endian 1.0',
  `element vertex ${splats.length}`,
  'property float x',
  'property float y',
  'property float z',
  'property float scale_0',
  'property float scale_1',
  'property float scale_2',
  'property float rot_0',
  'property float rot_1',
  'property float rot_2',
  'property float rot_3',
  'property float f_dc_0',
  'property float f_dc_1',
  'property float f_dc_2',
  'property float opacity',
  'end_header\n'
].join('\n');

const floatsPerSplat = 14;
const data = Buffer.alloc(splats.length * floatsPerSplat * Float32Array.BYTES_PER_ELEMENT);

splats.forEach((splat, index) => {
  const base = index * floatsPerSplat * Float32Array.BYTES_PER_ELEMENT;
  const values = [
    splat.x,
    splat.y,
    splat.z,
    Math.log(splat.scale[0]),
    Math.log(splat.scale[1]),
    Math.log(splat.scale[2]),
    0,
    0,
    0,
    1,
    colorToSphericalHarmonic(splat.color[0]),
    colorToSphericalHarmonic(splat.color[1]),
    colorToSphericalHarmonic(splat.color[2]),
    splat.opacity
  ];

  values.forEach((value, valueIndex) => {
    data.writeFloatLE(value, base + valueIndex * Float32Array.BYTES_PER_ELEMENT);
  });
});

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, Buffer.concat([Buffer.from(header, 'utf8'), data]));
console.log(`Wrote ${outputPath} with ${splats.length} splats`);

function colorToSphericalHarmonic(color) {
  const shC0 = 0.28209479177387814;
  return (color - 0.5) / shC0;
}
