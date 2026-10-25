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
// ---------------------------------------------------------------------------
// Google Sans Flex 的斜体面 —— **已烘焙好的产物，构建期只做校验，不再下载/改写**。
//
// 为什么改到这个形态（原先是「带 slnt 轴的文件 + CSS font-variation-settings:slnt -10」）：
//   1. `font-variation-settings` 是**作者级轴锁定** —— 写上它，wdth/opsz/wght 的 CSS 表现
//      （font-stretch / font-optical-sizing / font-weight）全被压住。实测斜体下
//      font-stretch:100% 与 125% 宽度完全相同（385 vs 385），即宽度轴失效。
//   2. `font-feature-settings:ss01` 只在 CSS 排版路径生效，canvas 的 measureText / 导出位图
//      拿不到，两边不一致。
// 现在：slnt 用 fontTools 冻结到 -10（字体文件里就是斜体字形），ss01 的 lookup 并入 ccmp
//      （所有 shaper 默认应用）⇒ @font-face 只需要 font-style: italic，不需要任何
//      variation-settings / feature-settings，font-stretch 也恢复正常。
//   体积 626 KB → 390 KB。
//
// ⚠️ 为什么把它做成**提交进仓库的产物**而不是每次构建现算：
//    冻结轴要跑 fontTools（python + brotli），而 CI（Cloudflare Pages）没有 python ——
//    之前字体覆盖校验就是因为依赖 python 在 CI 上静默跳过而误报缺字。
//    所以：产物 + 清单（src/generated/gsf-italic.json）一起提交，构建期只校验存在性与哈希。
//    需要重新生成时跑 `node scripts/rebuild-gsf-italic.mjs`（本机需 python3 + fonttools + brotli）。
const GSF_ITALIC_DIR = join(ROOT, 'public/fonts/gsf');
const GSF_ITALIC_MANIFEST = join(ROOT, 'src/generated/gsf-italic.json');

function ensureGsfItalic() {
  if (!existsSync(GSF_ITALIC_MANIFEST)) {
    throw new Error('缺 src/generated/gsf-italic.json：先跑 node scripts/rebuild-gsf-italic.mjs');
  }
  // 容忍 BOM：Windows 上用某些编辑器/PowerShell 保存会带上
  const manifest = JSON.parse(readFileSync(GSF_ITALIC_MANIFEST, 'utf8').replace(/^\uFEFF/, ''));
  const file = join(ROOT, 'public' + manifest.url);
  if (!existsSync(file)) {
    throw new Error(`缺 GSF 斜体文件 ${manifest.url}：先跑 node scripts/rebuild-gsf-italic.mjs`);
  }
  const bytes = readFileSync(file);
  const expect = /gsf-italic\.([0-9a-f]{12})\.woff2$/.exec(manifest.url)?.[1];
  const actual = createHash('sha256').update(bytes).digest('hex').slice(0, 12);
  if (expect && expect !== actual) {
    throw new Error(
      `GSF 斜体文件名与内容哈希不符（名 ${expect} / 实 ${actual}）—— ` +
      '文件名带哈希是为了能 immutable 缓存，请重跑 node scripts/rebuild-gsf-italic.mjs'
    );
  }
  if (!manifest.slntFrozen) {
    console.log('⚠️  GSF 斜体清单标记 slntFrozen=false：这份还是带 slnt 轴的旧产物，' +
      '需要在 FontFaces 里额外写 font-variation-settings。建议重跑 rebuild-gsf-italic.mjs');
  }
  console.log(`✓ GSF 斜体（slnt 已冻结 + ss01 并入 ccmp）：${(bytes.length / 1024).toFixed(0)} KB → ${manifest.url}`);
}

ensureGsfItalic();
