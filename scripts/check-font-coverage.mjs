/**
 * 字体覆盖闸门：构建产物里出现的每一个「会渲染的字符」，必须落在自托管字体的覆盖范围内。
 *
 * 为什么需要它：子集化/分片字体缺字时浏览器**不报错**，只是静默回退到系统字体 —— 排版悄悄变味，
 * 直到有人肉眼发现。所以要在构建后扫一遍真实产物。
 *
 * 扫这些来源（按「最容易漏」排序）：
 *   1. HTML 正文（去掉标签、去掉 script/style 内容）
 *   2. 内联 / 外链 JS 的字符串字面量（**去注释后**）—— 最常漏：toast 文案「已复制到剪贴板」「加载失败」
 *   3. CSS 的 content: 值（伪元素上的字也是字）
 * 覆盖范围从产物里真实的 unicode-range 声明读（不是写死的白名单）。
 * Emoji 永远走系统彩色字体，按区间白名单剔除（含变体选择符 / ZWJ / tag 序列）。
 * 另外校验自建子集字体（CatNotoSC / Bravura-Symbols / Musical）确实含有它该管的那些字。
 * cmap 由本文件自己解 WOFF2 读出，**不依赖 python / fonttools**：部署机没有它，
 * 之前正是这个自检在 CI 上静默跳过，把乐谱符号（U+ED60… / U+E080… / U+1D15F…）误判成缺字。
 * 两个 WOFF2 坑：自定义 tag 顺序是 flags → tag(4B) → origLength → [transformLength]（写反会全表错位）；
 * brotli 解压后各表紧排、无 4 字节对齐填充。
 *
 * 用法：node scripts/check-font-coverage.mjs   （在 astro build 之后跑）
 */
import { brotliDecompressSync } from 'node:zlib';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const DIST = join(ROOT, 'dist');

const EMOJI_RANGES = [
  [0x1f000, 0x1faff], // 麻将/扑克/表情/交通/补充符号
  [0x2600, 0x27bf], // misc symbols + dingbats
  [0x2b00, 0x2bff], // 箭头/星形
  [0x2190, 0x21ff], // 箭头
  [0x2300, 0x23ff], // 技术符号（⌚⏰ 等）
  [0x25a0, 0x25ff], // 几何图形（◼▶）
  [0x2900, 0x297f],
  [0x3030, 0x3030],
  [0x303d, 0x303d],
  [0x3297, 0x3299],
  [0xfe0e, 0xfe0f], // 变体选择符
  [0x200d, 0x200d], // ZWJ
  [0x20e3, 0x20e3], // keycap
  [0x1f1e6, 0x1f1ff], // 区域指示符（国旗）
  [0xe0020, 0xe007f], // tag 序列
];
const IGNORE = new Set(['\n', '\r', '\t', ' ', '\u00a0', '\u200b', '\ufeff']);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

/** 去掉注释后取出字符串字面量的内容 */
function extractJsStrings(code) {
  let out = '';
  let i = 0;
  const n = code.length;
  while (i < n) {
    const c = code[i];
    const next = code[i + 1];
    if (c === '/' && next === '/') {
      while (i < n && code[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && next === '*') {
      i += 2;
      while (i < n && !(code[i] === '*' && code[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      const quote = c;
      i++;
      let buf = '';
      while (i < n) {
        if (code[i] === '\\') { buf += code[i + 1] ?? ''; i += 2; continue; }
        if (code[i] === quote) { i++; break; }
        buf += code[i];
        i++;
      }
      out += buf + '\n';
      continue;
    }
    i++;
  }
  return out;
}

function extractCssContentValues(css) {
  let out = '';
  for (const m of css.matchAll(/content\s*:\s*([^;}]+)/g)) {
    const value = m[1];
    // content: "文字" / content: '文字' / content: counter(x) … 只取引号里的
    for (const q of value.matchAll(/(['"])((?:\\.|(?!\1).)*)\1/g)) out += q[2];
  }
  return out;
}

function extractHtmlText(html) {
  const withoutBlocks = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');
  return withoutBlocks.replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ');
}

function extractInlineScripts(html) {
  let out = '';
  for (const m of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) out += extractJsStrings(m[1]) + '\n';
  return out;
}

function extractInlineStyles(html) {
  let out = '';
  for (const m of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) out += m[1] + '\n';
  return out;
}

/** 解析 unicode-range，得到覆盖集合 */
function parseCoverage(cssText, extraCodepoints) {
  const ranges = [];
  for (const m of cssText.matchAll(/unicode-range\s*:\s*([^;}]+)/g)) {
    for (const part of m[1].split(',')) {
      const t = part.trim().replace(/^U\+/i, '');
      if (!t) continue;
      const [a, b] = t.split('-');
      const start = parseInt(a, 16);
      const end = b ? parseInt(b, 16) : start;
      if (Number.isFinite(start) && Number.isFinite(end)) ranges.push([start, end]);
    }
  }
  // ⚠️ 必须先合并再二分：unicode-range 之间是嵌套/重叠的（比如 latin 与 latin-ext 交叉），
  //    直接按 start 排序后二分会在「mid 落在一个更窄的段里」时把外面那个大段跳过 ⇒ 假缺字。
  ranges.sort((x, y) => x[0] - y[0]);
  const merged = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1] + 1) last[1] = Math.max(last[1], r[1]);
    else merged.push([r[0], r[1]]);
  }
  // 自托管的本站小字体（Musical / Bravura-Digits / CatNotoSC）没有 unicode-range，
  // 它们靠 cmap 说话 ⇒ 把真实 cmap 并进来（不走「无 range 即全覆盖」那种偷懒假设）。
  let set = null;
  return (cp) => {
    if (extraCodepoints && extraCodepoints.has(cp)) return true;
    let lo = 0, hi = merged.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (cp < merged[mid][0]) hi = mid - 1;
      else if (cp > merged[mid][1]) lo = mid + 1;
      else return true;
    }
    return false;
  };
}

const isEmoji = (cp) => EMOJI_RANGES.some(([a, b]) => cp >= a && cp <= b);

// ---- 收集 ----
const files = walk(DIST);
const htmlFiles = files.filter((f) => f.endsWith('.html'));
const jsFiles = files.filter((f) => f.endsWith('.js'));
const cssFiles = files.filter((f) => f.endsWith('.css'));

const sources = { htmlText: '', jsStrings: '', cssContent: '', allCss: '' };

for (const f of htmlFiles) {
  const html = readFileSync(f, 'utf8');
  sources.htmlText += extractHtmlText(html);
  sources.jsStrings += extractInlineScripts(html);
  sources.allCss += extractInlineStyles(html);
}
for (const f of jsFiles) sources.jsStrings += extractJsStrings(readFileSync(f, 'utf8'));
for (const f of cssFiles) {
  const css = readFileSync(f, 'utf8');
  sources.allCss += css;
  sources.cssContent += extractCssContentValues(css);
}
sources.cssContent += extractCssContentValues(sources.allCss);

// ---- 自建本地字体：直接解 WOFF2 的 cmap（纯 Node，无外部依赖） ----
//
// WOFF2 的两个坑（本文件踩过一次，别再踩）：
//   1. 表目录里「自定义 tag」的顺序是 flags → tag(4B) → origLength → [transformLength]，
//      写反会让后面所有表错位。
//   2. brotli 解压后各表是**紧排**的，没有 4 字节对齐填充；按 origLength 顺序累加偏移即可。
// 另：glyf / loca 在 WOFF2 里是变换过的，但我们只要 cmap（从不变换），所以不用管重建。
const WOFF2_SIG = 0x774f4632;

function readWoff2Cmap(buf) {
  if (buf.readUInt32BE(0) !== WOFF2_SIG) throw new Error('不是 WOFF2');
  const numTables = buf.readUInt16BE(12);
  const totalCompressedSize = buf.readUInt32BE(20);
  const KNOWN = ['cmap','head','hhea','hmtx','maxp','name','OS/2','post','cvt ','fpgm','glyf','loca','prep','CFF ','VORG','EBDT','EBLC','gasp','hdmx','kern','LTSH','PCLT','VDMX','vhea','vmtx','BASE','GDEF','GPOS','GSUB','EBSC','JSTF','MATH','CBDT','CBLC','COLR','CPAL','SVG ','sbix','acnt','avar','bdat','bloc','bsln','cvar','fdsc','feat','fmtx','fvar','gvar','hsty','just','lcar','mort','morx','opbd','prop','trak','Zapf','Silf','Glat','Gloc','Feat','Sill'];
  const tags = [];
  let off = 48;
  for (let n = 0; n < numTables; n++) {
    const flags = buf.readUInt8(off++);
    const idx = flags & 0x3f;
    let tag;
    if (idx === 0x3f) {
      tag = buf.toString('latin1', off, off + 4);
      off += 4;
    } else {
      tag = KNOWN[idx];
      if (!tag) throw new Error('未知的表 tag 索引 ' + idx);
    }
    // UIntBase128
    let origLength = 0;
    for (let k = 0; k < 5; k++) {
      const byte = buf.readUInt8(off++);
      origLength = (origLength << 7) | (byte & 0x7f);
      if ((byte & 0x80) === 0) break;
    }
    let storedLength = origLength;
    if (tag === 'glyf' || tag === 'loca') {
      // 变换版本：还有一个 transformLength
      let tl = 0;
      for (let k = 0; k < 5; k++) {
        const byte = buf.readUInt8(off++);
        tl = (tl << 7) | (byte & 0x7f);
        if ((byte & 0x80) === 0) break;
      }
      storedLength = tl;
    }
    tags.push({ tag, offset: 0, length: storedLength, origLength });
  }
  const raw = brotliDecompressSync(buf.subarray(off, off + totalCompressedSize));
  let cursor = 0;
  for (const t of tags) { t.offset = cursor; cursor += t.length; }
  const cmapEntry = tags.find((t) => t.tag === 'cmap');
  if (!cmapEntry) throw new Error('没有 cmap 表');
  return parseCmap(raw.subarray(cmapEntry.offset, cmapEntry.offset + cmapEntry.length));
}

/** 解析 cmap 表：只认 Unicode 子表（platform 0，或 platform 3 的 enc 1/10），format 4 / 12 */
function parseCmap(cm) {
  const out = new Set();
  const numTables = cm.readUInt16BE(2);
  const subtables = [];
  for (let i = 0; i < numTables; i++) {
    const rec = 4 + i * 8;
    const platform = cm.readUInt16BE(rec);
    const encoding = cm.readUInt16BE(rec + 2);
    const offset = cm.readUInt32BE(rec + 4);
    const unicode = platform === 0 || (platform === 3 && (encoding === 1 || encoding === 10));
    if (unicode) subtables.push(offset);
  }
  for (const off of new Set(subtables)) {
    const format = cm.readUInt16BE(off);
    if (format === 4) {
      const segCountX2 = cm.readUInt16BE(off + 6);
      const segCount = segCountX2 / 2;
      const endOff = off + 14;
      const startOff = endOff + segCountX2 + 2;
      const deltaOff = startOff + segCountX2;
      const rangeOff = deltaOff + segCountX2;
      for (let s = 0; s < segCount; s++) {
        const end = cm.readUInt16BE(endOff + s * 2);
        const start = cm.readUInt16BE(startOff + s * 2);
        const delta = cm.readInt16BE(deltaOff + s * 2);
        const rangeOffset = cm.readUInt16BE(rangeOff + s * 2);
        if (start === 0xffff) continue;
        for (let cp = start; cp <= end; cp++) {
          let glyphId;
          if (rangeOffset === 0) {
            glyphId = (cp + delta) & 0xffff;
          } else {
            // 按规范：glyphIdAddress = idRangeOffset 所在位置 + idRangeOffset + 2*(cp - start)
            const addr = rangeOff + s * 2 + rangeOffset + 2 * (cp - start);
            if (addr + 1 >= cm.length) continue;
            glyphId = cm.readUInt16BE(addr);
            if (glyphId !== 0) glyphId = (glyphId + delta) & 0xffff;
          }
          // glyphId 0 = .notdef（没有这个字形），不能算覆盖
          if (glyphId !== 0) out.add(cp);
        }
      }
    } else if (format === 12) {
      const nGroups = cm.readUInt32BE(off + 12);
      for (let g = 0; g < nGroups; g++) {
        const rec = off + 16 + g * 12;
        const startChar = cm.readUInt32BE(rec);
        const endChar = cm.readUInt32BE(rec + 4);
        for (let cp = startChar; cp <= endChar; cp++) out.add(cp);
      }
    }
  }
  return out;
}

function cmapOf(relPath) {
  return readWoff2Cmap(readFileSync(join(ROOT, relPath)));
}

/** 读不出来就让构建**明确失败**：静默跳过等于把闸门关掉（CI 上就是这么漏的） */
function tryCmap(relPath) {
  try {
    return cmapOf(relPath);
  } catch (err) {
    console.log(`✗ 读不出 ${relPath} 的 cmap：${err.message}`);
    process.exitCode = 1;
    return null;
  }
}

// Musical / Bravura-Digits / CatNotoSC 都不在 unicode-range 体系里（无 range ⇒ 靠 cmap 命中），
// 所以先把它们的 cmap 收进来，再跑缺字检查。
const localFontFiles = readdirSync(join(ROOT, 'public/fonts')).filter((f) => f.endsWith('.woff2'));
const localCmaps = new Map();
const extraCodepoints = new Set();
for (const f of localFontFiles) {
  const cmap = tryCmap(`public/fonts/${f}`);
  if (!cmap) continue;
  localCmaps.set(f, cmap);
  for (const cp of cmap) extraCodepoints.add(cp);
}

const covered = parseCoverage(sources.allCss, extraCodepoints);

// ---- 检查 ----
const missing = new Map();
let checked = 0;
let emojiSkipped = 0;
for (const [source, text] of Object.entries({ htmlText: sources.htmlText, jsStrings: sources.jsStrings, cssContent: sources.cssContent })) {
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if (IGNORE.has(ch)) continue;
    if (isEmoji(cp)) { emojiSkipped++; continue; }
    checked++;
    if (!covered(cp)) {
      if (!missing.has(cp)) missing.set(cp, { ch, count: 0, sources: new Set() });
      const rec = missing.get(cp);
      rec.count++;
      rec.sources.add(source);
    }
  }
}

// ---- 子集自检：这些字体是「按需手工裁出来的」，最容易缺字 ----
const localChecks = [];
const catNames = readFileSync(join(ROOT, 'src/config/categories.ts'), 'utf8');
const cjkChips = [...new Set([...catNames.matchAll(/zh:\s*'([^']+)'/g)].map((m) => m[1]).join(''))];
const catCmap = localCmaps.get('CatNotoSC-VF.woff2');
if (catCmap) {
  const catMissing = cjkChips.filter((ch) => !catCmap.has(ch.codePointAt(0)));
  localChecks.push({ font: 'CatNotoSC-VF.woff2', chars: cjkChips.length, missing: catMissing.join('') || null });
}

// Bravura-Digits 里的「数字」是 SMuFL 的 timeSig0–9（PUA U+E080–E089），不是 ASCII 0-9；
// 谱面正文里的 𝅘𝅥/𝅘𝅥𝅮（U+1D15F/1D160）也在这份里 —— main.css 的衬线栈靠它接住这几个码位。
const bravuraCmap = localCmaps.get('Bravura-Symbols.woff2');
const bravuraWanted = [...Array(10)].map((_, i) => 0xe080 + i).concat([0x1d15f, 0x1d160, 0x1d16e, 0x1d16f]);
if (bravuraCmap) {
  const bravuraMissing = bravuraWanted.filter((cp) => !bravuraCmap.has(cp)).map((cp) => String.fromCodePoint(cp));
  localChecks.push({ font: 'Bravura-Symbols.woff2', chars: bravuraWanted.length, missing: bravuraMissing.join('') || null });
}

// ---- 报告 ----
console.log(`扫描：${htmlFiles.length} 个 HTML / ${jsFiles.length} 个 JS / ${cssFiles.length} 个 CSS`);
console.log(`文本字符：${checked} 个（emoji 白名单跳过 ${emojiSkipped} 次）`);
console.log(`unicode-range 段数：${(sources.allCss.match(/unicode-range/g) || []).length}`);
for (const c of localChecks) {
  console.log(`  子集自检 ${c.font}: ${c.chars} 个字符 ${c.missing ? '✗ 缺 ' + c.missing : '✓ 全覆盖'}`);
}

let failed = false;
if (missing.size > 0) {
  failed = true;
  console.log(`\n✗ ${missing.size} 个字符没有字体覆盖（会静默回退到系统字体）：`);
  const list = [...missing.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 40);
  for (const [cp, rec] of list) {
    console.log(`   U+${cp.toString(16).toUpperCase().padStart(4, '0')} ${JSON.stringify(rec.ch)} ×${rec.count} ← ${[...rec.sources].join(', ')}`);
  }
} else {
  console.log(`\n✓ ${checked} 个文本字符全部命中，缺字数 0`);
}
for (const c of localChecks) if (c.missing) failed = true;

process.exit(failed ? 1 : 0);
