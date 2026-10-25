/**
 * 重新生成 GSF 斜体面（**本机手动跑**，不在 CI 里跑）。
 *
 * 产物是「slnt 冻结到 -10 + ss01 并入 ccmp」的 latin 子集，提交进仓库；
 * 构建期由 scripts/build-fonts.mjs 只做存在性 + 哈希校验。
 *
 * 为什么不在构建期现算：这一步要 fontTools（python + brotli），CI 上没有 python。
 * 之前字体覆盖校验就是因为依赖 python 在 CI 上静默跳过，把有字形的乐谱符号误报成缺字、
 * 直接把部署打断了。所以凡是需要 python 的步骤一律做成「产物入库 + 构建期只校验」。
 *
 * 什么时候要重跑：
 *   - 想换 slnt 的角度（改 scripts/lib/gsf-italic.py 的 SLNT_LOCK）
 *   - 想让斜体覆盖更多 unicode-range（改下面的 QUERY / 选片逻辑）
 *   - 正体升级（轴区间变了，斜体也该跟着变）
 *
 * 用法：node scripts/rebuild-gsf-italic.mjs
 * 依赖：python3 + fonttools + brotli（python -c "import fontTools, brotli" 能过就行）
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const OUT_DIR = join(ROOT, 'public/fonts/gsf');
const MANIFEST = join(ROOT, 'src/generated/gsf-italic.json');
const TMP_SRC = join(ROOT, '.cache/fonts/gsf-italic-source.woff2');
const TMP_OUT = join(ROOT, '.cache/fonts/gsf-italic-frozen.woff2');

// 必须和正体（astro.config.mjs 里 Google Sans Flex 的 options）用同一组轴区间，
// 否则斜体的字形与正体对不上。
const QUERY = 'Google+Sans+Flex:opsz,slnt,wdth,wght@6..144,-10..0,25..151,1..1000';
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36';

mkdirSync(join(ROOT, '.cache/fonts'), { recursive: true });
mkdirSync(OUT_DIR, { recursive: true });

// 1) 取 Google 的 latin 分片（只取含 U+0000-00FF 的那一片，与正体同 range）
const css = await (await fetch(`https://fonts.googleapis.com/css2?family=${QUERY}&display=swap`, {
  headers: { 'user-agent': UA },
})).text();
if (!css.includes('@font-face')) throw new Error('css2 没返回 @font-face：' + css.slice(0, 200));
const group = css.split('@font-face').find((g) => /U\+0000-00FF/.test(g));
if (!group) throw new Error('css2 里没找到 latin 子集');
const srcUrl = /url\((https:[^)]+)\)/.exec(group)?.[1];
const unicodeRange = /unicode-range:\s*([^;}]+)/.exec(group)?.[1]?.trim();
if (!srcUrl || !unicodeRange) throw new Error('css2 解析失败（url / unicode-range）');

const res = await fetch(srcUrl, { headers: { 'user-agent': UA } });
if (!res.ok) throw new Error(`${res.status} ${srcUrl}`);
writeFileSync(TMP_SRC, Buffer.from(await res.arrayBuffer()));
console.log(`· 源文件（带 slnt 轴）：${(readFileSync(TMP_SRC).length / 1024).toFixed(0)} KB`);

// 2) 冻结 slnt + 把 ss01 并入 ccmp（脚本里自带安全检查：除 ss01 外没有特性替换 'a'）
execFileSync('python', [join(ROOT, 'scripts/lib/gsf-italic.py'), TMP_SRC, TMP_OUT], { stdio: 'inherit' });

// 3) 内容哈希命名（文件名带哈希 ⇒ /fonts/gsf/* 能 immutable）
const data = readFileSync(TMP_OUT);
const hash = createHash('sha256').update(data).digest('hex').slice(0, 12);
const file = `gsf-italic.${hash}.woff2`;
for (const name of readdirSync(OUT_DIR)) rmSync(join(OUT_DIR, name));
writeFileSync(join(OUT_DIR, file), data);

writeFileSync(
  MANIFEST,
  JSON.stringify(
    {
      url: `/fonts/gsf/${file}`,
      unicodeRange,
      slntFrozen: true,
      generatedBy: 'scripts/rebuild-gsf-italic.mjs (fontTools: slnt=-10 frozen, ss01 lookup promoted into ccmp)',
    },
    null,
    2
  ) + '\n'
);

console.log(`✓ /fonts/gsf/${file}（${(data.length / 1024).toFixed(0)} KB）已写入清单 ${MANIFEST}`);
console.log('  ⚠️ 产物与清单都要提交进仓库，否则 CI 构建会因缺文件失败');
