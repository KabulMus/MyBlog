/**
 * 准备自托管的 KaTeX 和 Google Sans Flex 斜体资源。
 * 中文 Noto 字体由页面直接使用 Google Fonts CSS API，不在构建时下载。
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

// 旧构建生成的 Noto 字体文件不再使用，避免被 public/ 自动复制进产物。
rmSync(join(ROOT, 'public/fonts/cjk'), { recursive: true, force: true });
rmSync(join(ROOT, 'src/generated/cjk-fonts.json'), { force: true });

// KaTeX：把 node_modules 里的 katex.min.css + 字体搬进 public/katex/<version>/，
// 页面里不再请求 cdn.jsdelivr.net（那是最后一个第三方字体源）。
// ⚠️ 目录名带 katex 版本号 ⇒ 升级时是新 URL，可安全 immutable 缓存。
// ⚠️ 只搬 woff2：浏览器按 src 列表顺序取第一个支持的格式。
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

// Google Sans Flex 的斜体面是烘焙好的产物，构建期只校验存在性与哈希。
const GSF_ITALIC_MANIFEST = join(ROOT, 'src/generated/gsf-italic.json');

function ensureGsfItalic() {
  if (!existsSync(GSF_ITALIC_MANIFEST)) {
    throw new Error('缺 src/generated/gsf-italic.json：先跑 node scripts/rebuild-gsf-italic.mjs');
  }
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
