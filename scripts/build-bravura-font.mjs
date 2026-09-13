/**
 * 从 simple-notation 的 dist 里抽出它内嵌的 Bravura 字体，subset 成「库真正会用到的码位」，
 * 输出 public/fonts/Bravura-Symbols.woff2。
 *
 * 为什么要这一步：库把整份 Bravura 以 base64 字面量（417,800 字符 ≈ 313 KB）塞在自己的 JS 里，
 * 占它体积的 78%（535 KB → 剩下 ~117 KB），而且是**每个有简谱的页面都要下载**的 JS chunk 的一部分。
 * 抽出来之后，astro.config.mjs 里的 `jianpu-bravura-font` 插件会在打包时把内联的 data URI
 * 换成这个静态文件的 URL：
 *   ① JS chunk 少 418 KB（gzip 少 ~312 KB）
 *   ② 字体独立成文件 → 只有页面真的用到变音记号/休止符时才下载，且能长缓存
 *
 * ⚠️ 码位与字形跟原来那份**完全一致**（只是砍掉了用不到的字符），所以渲染结果不变，
 *    也不用改任何码位映射或字号位置。
 * 用法：node scripts/build-bravura-font.mjs （升级 simple-notation 后重跑一次）
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SRC = 'node_modules/simple-notation/dist/simple-notation.js';
const OUT = 'public/fonts/Bravura-Symbols.woff2';

const code = readFileSync(SRC, 'utf8');

// ① 抽出内嵌 base64（库的写法：const XX = "<417800 字符的 base64>"）
const m = /"([A-Za-z0-9+/]{50000,}={0,2})"/.exec(code);
if (!m) {
	console.error('[bravura] 没找到内嵌的 base64 字体 —— 库版本可能变了，检查 ' + SRC);
	process.exit(1);
}
const buf = Buffer.from(m[1], 'base64');
// ⚠️ 库的 data URI 写的是 application/x-font-woff，但实际是 **woff2**（魔数 wOF2）
const magic = buf.subarray(0, 4).toString('latin1');
if (magic !== 'wOFF' && magic !== 'wOF2') {
	console.error('[bravura] 解出来的不是 woff/woff2，头 4 字节 =', magic);
	process.exit(1);
}

// ② 库会用到的码位：直接从 JS 源码里扫（私用区 + 音乐符号区），比手写清单可靠、库升级也不会漏
const cps = new Set();
for (const ch of code) {
	const cp = ch.codePointAt(0);
	if ((cp >= 0xe000 && cp <= 0xf8ff) || (cp >= 0x1d100 && cp <= 0x1d1ff)) cps.add(cp);
}
// ②b 手动补充：库自己用不到、但我们额外要的字形
//     - 拍号数字 `timeSig0`–`timeSig9`（U+E080–E089）：简谱拍号 / 速度数字用它渲染（见 src/lib/bravura-digits.ts）
//     - 速度记号前的**音符符号**（U+1D15D–U+1D164 全音符～一百二十八分音符）：库写死用 U+1D15F（四分），
//       我们要按「每拍时值」换成对应的那一个（见 Layout.astro 的 useTempoBeatSymbol）
//     库里没有这些码位 → ②扫不到，必须列在这里。要再加别的字形（如 timeSigCommon 𝄴 = U+E08A）也写在这。
for (let cp = 0xe080; cp <= 0xe089; cp++) cps.add(cp);
for (let cp = 0x1d15d; cp <= 0x1d164; cp++) cps.add(cp);
const unicodes = [...cps]
	.sort((a, b) => a - b)
	.map((c) => 'U+' + c.toString(16).toUpperCase())
	.join(',');
console.log('[bravura] 源码里扫到 ' + cps.size + ' 个码位：' + unicodes);

// ③ subset（用 fonttools；name 表全保留，OFL 的版权/许可信息不能丢）
const tmp = join(tmpdir(), 'bravura-full.woff');
writeFileSync(tmp, buf);
mkdirSync('public/fonts', { recursive: true });
execFileSync(
	'python',
	['-m', 'fontTools.subset', tmp, '--unicodes=' + unicodes, '--flavor=woff2', '--name-IDs=*', '--output-file=' + OUT],
	{ stdio: 'inherit' }
);
rmSync(tmp, { force: true });

const kb = (n) => Math.round((n / 1024) * 10) / 10 + ' KB';
console.log('[bravura] 内嵌 ' + kb(buf.length) + ' → ' + OUT + ' ' + kb(statSync(OUT).size));
