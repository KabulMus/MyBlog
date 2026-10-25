/**
 * 生成中文字体（Noto Sans SC / Noto Serif SC）的 @font-face 样式表。
 *
 * 为什么单独做、不走 Astro 的 Fonts API：
 *   Fonts API 把 @font-face **内联**进每个页面的 <head>。中文两族被 Google 按 unicode-range
 *   切成约 100 片/族 ⇒ 196 条规则、约 188 KB（gzip 63 KB）。内联意味着**每翻一页都要重下一遍**
 *   （实测 71 个页面的 HTML 从 4 MB 涨到 16.6 MB，单页 gzip 19 KB → 83 KB）。
 *   这里改成生成一份带内容哈希、全站共用的 CSS（可 immutable 缓存）。
 *
 * 做的事：
 *   1. 向 fonts.googleapis.com 取 css2（只用它来拿「分片表」：unicode-range + woff2 地址）
 *   2. 把每片 woff2 下到 public/fonts/cjk/（文件名带内容哈希），本地已有就跳过
 *   3. 把 CSS 里的远程 url() 换成 /fonts/cjk/... ，输出 /fonts/cjk-fonts.<hash>.css
 *   4. 清掉 public/fonts/cjk/ 里这次没用到的旧文件
 *
 * ⚠️ 不要改成整包子集：中文内容是动态的，整包 9 MB 起步；分片后浏览器只下命中的那几片。
 * ⚠️ 不要写死 unicode-range 白名单：这里原样保留 Google 给的范围。
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const OUT_DIR = join(ROOT, 'public/fonts/cjk');
const CACHE_DIR = join(ROOT, '.cache/fonts');
const MANIFEST = join(ROOT, 'src/generated/cjk-fonts.json');

const FAMILIES = [
  { query: 'Noto+Sans+SC:wght@100..900', display: 'swap' },
  { query: 'Noto+Serif+SC:wght@200..900', display: 'swap' },
];

// Google 按 UA 决定返回哪种格式：要 woff2 就必须伪装成现代浏览器
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36';

async function fetchText(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: { 'user-agent': UA } });
      if (!res.ok) throw new Error(`${res.status} ${url}`);
      return await res.text();
    } catch (err) {
      if (i === tries - 1) throw err;
      await new Promise((r) => setTimeout(r, 800 * (i + 1)));
    }
  }
}

async function download(url) {
  const key = createHash('sha256').update(url).digest('hex').slice(0, 16);
  const cached = join(CACHE_DIR, `${key}.woff2`);
  if (existsSync(cached)) return { key, data: readFileSync(cached) };
  // 仓库里已经有同一份（比如 CI 复用了上次的产物）就别再下一遍
  const already = join(OUT_DIR, `${key}.woff2`);
  if (existsSync(already)) return { key, data: readFileSync(already) };
  const res = await fetch(url, { headers: { 'user-agent': UA } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const data = Buffer.from(await res.arrayBuffer());
  // 字体文件本身不会变（Google 的 URL 带版本号），缓存下来免得每次构建都下 10 MB
  writeFileSync(cached, data);
  return { key, data };
}

function slug(family) {
  return family.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

mkdirSync(OUT_DIR, { recursive: true });
mkdirSync(CACHE_DIR, { recursive: true });

const urls = new Set();
const blocks = [];

for (const { query, display } of FAMILIES) {
  const familyName = decodeURIComponent(query.split(':')[0].replace(/\+/g, ' '));
  const cssUrl = `https://fonts.googleapis.com/css2?family=${query}&display=${display}`;
  const css = await fetchText(cssUrl);
  // 抓出每条 @font-face 的正文（Google 的格式固定，不用上解析器）
  const faces = [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)].map((m) => m[1]);
  if (faces.length === 0) throw new Error(`没有从 ${cssUrl} 拿到任何 @font-face`);
  for (const body of faces) {
    const srcMatch = body.match(/src:\s*url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/);
    if (!srcMatch) continue;
    const range = body.match(/unicode-range:\s*([^;]+);/);
    const weight = body.match(/font-weight:\s*([^;]+);/);
    urls.add(srcMatch[1]);
    blocks.push({
      family: familyName,
      weight: weight ? weight[1].trim() : '400',
      unicodeRange: range ? range[1].trim() : null,
      remote: srcMatch[1],
    });
  }
}

const byUrl = new Map();
let bytes = 0;
for (const url of urls) {
  const { key, data } = await download(url);
  const name = `${key}.woff2`;
  writeFileSync(join(OUT_DIR, name), data);
  byUrl.set(url, `/fonts/cjk/${name}`);
  bytes += data.length;
}

const css = blocks
  .map(({ family, weight, unicodeRange, remote }) =>
    `@font-face{font-family:'${family}';font-style:normal;font-weight:${weight};font-display:swap;` +
    `src:url(${byUrl.get(remote)}) format('woff2');` +
    (unicodeRange ? `unicode-range:${unicodeRange};` : '') +
    `}`
  )
  .join('\n');

const hash = createHash('sha256').update(css).digest('hex').slice(0, 12);
const cssFile = `cjk-fonts.${hash}.css`;
// CSS 和字体都放 /fonts/cjk/ 下：这目录里全是内容哈希文件名，
// 于是 public/_headers 能用一条 `/fonts/cjk/*` 给它们 immutable。
writeFileSync(join(OUT_DIR, cssFile), css);

// 旧哈希的 CSS / 字体文件要清掉，不然 public/ 会一直堆着历史版本被原样拷进 dist
for (const name of readdirSync(OUT_DIR)) {
  const keepCss = name === cssFile;
  const keepFont = [...byUrl.values()].some((p) => p.endsWith(`/${name}`));
  if (!keepCss && !keepFont) rmSync(join(OUT_DIR, name));
}

mkdirSync(join(ROOT, 'src/generated'), { recursive: true });
writeFileSync(MANIFEST, JSON.stringify({ href: `/fonts/cjk/${cssFile}`, faces: blocks.length, families: FAMILIES.length }, null, 2) + '\n');

console.log(
  `✓ 中文字体样式表：${blocks.length} 片 / ${(bytes / 1024 / 1024).toFixed(2)} MB → /fonts/cjk/${cssFile}`
);

// ---------------------------------------------------------------------------
// KaTeX：把 node_modules 里的 katex.min.css + 字体搬进 public/katex/<version>/，
// 页面里不再请求 cdn.jsdelivr.net（那是最后一个第三方字体源）。
// ⚠️ 目录名带 katex 版本号 ⇒ 升级 katex 时是**新 URL**，所以 public/_headers 里给它 immutable 是安全的。
// ⚠️ katex.min.css 里的 url() 本来就是相对的 `fonts/KaTeX_*.woff2`，保持同样布局即无需改写。
// ⚠️ 只搬 woff2：浏览器按 src 列表顺序取第一个支持的格式，woff2 排在最前，不会回落到 woff/ttf。
const KATEX_SRC = join(ROOT, 'node_modules/katex/dist');
if (!existsSync(KATEX_SRC)) {
  throw new Error('找不到 node_modules/katex/dist（katex 是不是没装？）');
}
const katexVersion = JSON.parse(readFileSync(join(ROOT, 'node_modules/katex/package.json'), 'utf8')).version;
const katexOut = join(ROOT, 'public/katex', katexVersion);
rmSync(join(ROOT, 'public/katex'), { recursive: true, force: true });
mkdirSync(join(katexOut, 'fonts'), { recursive: true });
writeFileSync(join(katexOut, 'katex.min.css'), readFileSync(join(KATEX_SRC, 'katex.min.css')));
let katexBytes = 0;
let katexFonts = 0;
for (const name of readdirSync(join(KATEX_SRC, 'fonts'))) {
  if (!name.endsWith('.woff2')) continue;
  const data = readFileSync(join(KATEX_SRC, 'fonts', name));
  writeFileSync(join(katexOut, 'fonts', name), data);
  katexBytes += data.length;
  katexFonts++;
}
mkdirSync(join(ROOT, 'src/generated'), { recursive: true });
writeFileSync(
  join(ROOT, 'src/generated/katex.json'),
  JSON.stringify({ css: `/katex/${katexVersion}/katex.min.css`, version: katexVersion }, null, 2) + '\n'
);
console.log(`✓ KaTeX ${katexVersion} 自托管：${katexFonts} 个 woff2 / ${(katexBytes / 1024).toFixed(0)} KB → /katex/${katexVersion}/`);

// ---------------------------------------------------------------------------
// Google Sans Flex 的斜体面。
// GSF 没有 italic，只有一个 slnt 轴（-10..0）。只声明正体的话，`font-style: italic` 选不中任何
// @font-face，浏览器会自己把正体倾斜（假斜体）。这里单独拉一份带 slnt 轴的文件，
// 由 FontFaces.astro 声明成 font-style: italic，并用 variation-settings 把 slnt 压到 -10。
//
// ⚠️ 只在页面真的渲染了斜体 GSF 时才会下载（FontFaces 里那份 @font-face 带 unicode-range）。
// ⚠️ 体积：带 slnt 的 latin 子集约 626 KB，比正体那份（359 KB）大。这是 slnt 轴的固有代价。
//    若哪天斜体用得多，可以改成用 fontTools 把 slnt 实例化到 -10（约 390 KB），
//    代价是构建多一个 python/fonttools 依赖。
const GSF_ITALIC_QUERY = 'Google+Sans+Flex:opsz,slnt,wdth,wght@6..144,-10..0,25..151,1..1000';

const GSF_ITALIC_DIR = join(ROOT, 'public/fonts/gsf');

async function buildGsfItalic() {
  const css = await fetchText(`https://fonts.googleapis.com/css2?family=${GSF_ITALIC_QUERY}&display=block`);
  // 只取 latin 那一片（含 U+0000-00FF），和正体保持同一个 unicode-range
  const group = css.split('@font-face').find((g) => /U\+0000-00FF/.test(g));
  if (!group) throw new Error('GSF 斜体：css2 里没找到 latin 子集');
  const url = /url\((https:[^)]+)\)/.exec(group)?.[1];
  const range = /unicode-range:\s*([^;}]+)/.exec(group)?.[1]?.trim();
  if (!url || !range) throw new Error('GSF 斜体：css2 里的 url / unicode-range 解析失败');

  const { key, data } = await download(url);
  mkdirSync(GSF_ITALIC_DIR, { recursive: true });
  for (const name of readdirSync(GSF_ITALIC_DIR)) rmSync(join(GSF_ITALIC_DIR, name));
  const file = `gsf-italic.${key}.woff2`;
  writeFileSync(join(GSF_ITALIC_DIR, file), data);

  writeFileSync(
    join(ROOT, 'src/generated/gsf-italic.json'),
    JSON.stringify({ url: `/fonts/gsf/${file}`, unicodeRange: range, slnt: -10 }, null, 2) + '\n'
  );
  console.log(`✓ GSF 斜体（slnt −10 映射到 italic）：${(data.length / 1024).toFixed(0)} KB → /fonts/gsf/${file}`);
}

await buildGsfItalic();

