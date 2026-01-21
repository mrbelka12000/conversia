// Simple script to generate placeholder PNG icons
// These are minimal valid PNG files with a solid purple color (brand color)
import { writeFileSync, mkdirSync, existsSync } from 'fs';

// Pre-encoded minimal PNG icons (purple color #6366f1)
// Generated using pngjs-like minimal structure
const icons = {
  16: 'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAALElEQVQ4y2NkYGD4z0ABYGJgYGBgZBgFoyYYJSZAA5gYGBgYRsEoGDCAAQBPOQIC15xNrwAAAABJRU5ErkJggg==',
  48: 'iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAYAAABXAvmHAAAAMklEQVRoQ+3NQREAAAjDMPBnvV4xBycI6Ko9x/kTCAgICAgICAgICAgICAgICAgIfA1YagkB/7m7dwAAAABJRU5ErkJggg==',
  128: 'iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAYAAADDPmHLAAAAOklEQVR42u3BAQ0AAADCMPunNsOGDwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADgbgYcAAH/1eGiAAAAAElFTkSuQmCC'
};

const outputDir = './public/icons';

if (!existsSync(outputDir)) {
  mkdirSync(outputDir, { recursive: true });
}

Object.entries(icons).forEach(([size, base64]) => {
  const buffer = Buffer.from(base64, 'base64');
  writeFileSync(`${outputDir}/icon${size}.png`, buffer);
  console.log(`Created icon${size}.png`);
});

console.log('Icons created successfully!');
console.log('Note: These are placeholder icons. Replace them with proper branded icons for production.');
