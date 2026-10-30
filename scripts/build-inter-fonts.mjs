import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT_DIR = join(ROOT, 'public/fonts/inter');
const CACHE_DIR = join(ROOT, '.cache/fonts');
const MANIFEST = join(ROOT, 'src/generated/inter-fonts.json');
const CSS_URL = 'https://rsms.me/inter/inter.css';

async function fetchResource(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`${response.status} ${url}`);
      return response;
    } catch (error) {
      if (i === tries - 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, 800 * (i + 1)));
    }
  }
}

async function getText(url) {
  const response = await fetchResource(url);
  return response.text();
}

async function downloadFont(url) {
  const key = createHash('sha256').update(url).digest('hex').slice(0, 16);
  const cacheFile = join(CACHE_DIR, `${key}.woff2`);
  if (existsSync(cacheFile)) return readFileSync(cacheFile);

  const response = await fetchResource(url);
  const data = Buffer.from(await response.arrayBuffer());
  if (data.length < 4 || data.toString('ascii', 0, 4) !== 'wOF2') {
    throw new Error(`Not a WOFF2 font: ${url}`);
  }
  writeFileSync(cacheFile, data);
  return data;
}

mkdirSync(OUT_DIR, { recursive: true });
mkdirSync(CACHE_DIR, { recursive: true });

const sourceCss = await getText(CSS_URL);
const faces = [...sourceCss.matchAll(/@font-face\s*\{([^}]*)\}/g)]
  .map((match) => match[1])
  .filter((body) => /font-family:\s*InterVariable\s*;/.test(body))
  .map((body) => {
    const style = body.match(/font-style:\s*(normal|italic)\s*;/)?.[1];
    const weight = body.match(/font-weight:\s*([^;]+);/)?.[1].trim();
    const source = body.match(/src:\s*url\(['"]?([^'")]+)['"]?\)/)?.[1];
    if (!style || !weight || !source) throw new Error('Unrecognized InterVariable @font-face in rsms CSS');
    const url = new URL(source, CSS_URL);
    if (url.hostname !== 'rsms.me' || !url.pathname.startsWith('/inter/font-files/')) {
      throw new Error(`Unexpected InterVariable source URL: ${url.href}`);
    }
    return { style, weight, url: url.href };
  });

if (faces.length !== 2 || !faces.some((face) => face.style === 'normal') || !faces.some((face) => face.style === 'italic')) {
  throw new Error(`Expected normal and italic InterVariable faces from ${CSS_URL}`);
}

const fontUrls = {};
const cssFaces = [];
for (const face of faces) {
  const data = await downloadFont(face.url);
  const hash = createHash('sha256').update(data).digest('hex').slice(0, 16);
  const fileName = `InterVariable-${face.style}.${hash}.woff2`;
  writeFileSync(join(OUT_DIR, fileName), data);
  const publicUrl = `/fonts/inter/${fileName}`;
  fontUrls[face.style] = publicUrl;
  cssFaces.push(
    `@font-face{font-family:'InterVariable';font-style:${face.style};font-weight:${face.weight};font-display:swap;src:url('${publicUrl}') format('woff2');}`
  );
}

const css = cssFaces.join('\n');
const cssHash = createHash('sha256').update(css).digest('hex').slice(0, 12);
const cssFile = `inter.${cssHash}.css`;
writeFileSync(join(OUT_DIR, cssFile), css);
writeFileSync(
  MANIFEST,
  JSON.stringify({ href: `/fonts/inter/${cssFile}`, normal: fontUrls.normal, italic: fontUrls.italic }, null, 2) + '\n'
);

console.log(`✓ InterVariable: ${faces.length} faces → /fonts/inter/${cssFile}`);
