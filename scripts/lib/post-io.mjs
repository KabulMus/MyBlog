// 文章仓库读写（CLI 脚本与本地编辑器 /admin 共用）
// ⚠️ 只在 Node 侧使用（编辑器路由只在 dev 下挂载，见 astro.config.mjs）。
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';

const BLOG_ROOT = join('src', 'pages', 'blog');

/** 四个内容目录（中文/英文 × 正式/草稿），顺序 = 编辑器下拉里的展示顺序 */
export const POST_DIRS = [
  { dir: BLOG_ROOT, lang: 'zh', draft: false },
  { dir: join(BLOG_ROOT, 'en-US'), lang: 'en', draft: false },
  { dir: join(BLOG_ROOT, 'drafts'), lang: 'zh', draft: true },
  { dir: join(BLOG_ROOT, 'en-US', 'drafts'), lang: 'en', draft: true },
];

/** frontmatter 字段顺序（写回时保持一致，避免 YAML 抖动） */
export const FM_ORDER = ['layout', 'title', 'date', 'draft', 'ai', 'category', 'tags', 'warning'];

const toPosix = (p) => p.split(sep).join('/');

/** 只接受 src/pages/blog 下的 .md，其他一律拒绝（防止路径穿越） */
export function resolvePostPath(relPath) {
  if (typeof relPath !== 'string' || !relPath.trim()) throw new Error('缺少文章路径');
  const abs = resolve(String(relPath).trim());
  const root = resolve(BLOG_ROOT) + sep;
  if (!abs.startsWith(root)) throw new Error('路径不在 src/pages/blog 内：' + relPath);
  if (!abs.toLowerCase().endsWith('.md')) throw new Error('只允许操作 .md 文件：' + relPath);
  return abs;
}

/** 源码路径 → 站点 URL（草稿也在 dev 下可访问） */
export function postUrl(relPath) {
  const posix = toPosix(relPath);
  return '/' + posix.replace(/^src\/pages\//, '').replace(/\.md$/, '');
}

function parseScalar(s) {
  if (s === '') return '';
  if (s === 'true') return true;
  if (s === 'false') return false;
  const arr = /^\[([\s\S]*)\]$/.exec(s);
  if (arr) {
    return arr[1]
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean)
      .map((x) => x.replace(/^['"]|['"]$/g, ''));
  }
  return s.replace(/^['"]|['"]$/g, '');
}

/**
 * 极简 frontmatter 解析：只覆盖本站用到的形状
 * （引号字符串 / 布尔 / `['a', 'b']` 行内数组 / YAML 的 `- item` 列表）
 */
export function parseFrontmatter(raw) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw);
  if (!m) return { data: {}, body: raw, hasFrontmatter: false };
  const lines = m[1].split(/\r?\n/);
  const data = {};
  for (let i = 0; i < lines.length; i++) {
    const kv = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(lines[i]);
    if (!kv) continue;
    const key = kv[1];
    const value = kv[2].trim();
    if (value === '') {
      const items = [];
      while (i + 1 < lines.length && /^\s*-\s+/.test(lines[i + 1])) {
        items.push(parseScalar(lines[++i].replace(/^\s*-\s+/, '').trim()));
      }
      data[key] = items.length ? items : '';
    } else {
      data[key] = parseScalar(value);
    }
  }
  return { data, body: raw.slice(m[0].length), hasFrontmatter: true };
}

/** 把 frontmatter 写回（字段顺序固定，数组用 `['a', 'b']` 行内形式 —— 与 new-post.mjs 一致） */
export function serializeFrontmatter(data) {
  const keys = [...FM_ORDER.filter((k) => k in data), ...Object.keys(data).filter((k) => !FM_ORDER.includes(k))];
  const out = keys.map((key) => {
    const v = data[key];
    if (Array.isArray(v)) return `${key}: [${v.map((x) => `'${String(x)}'`).join(', ')}]`;
    if (typeof v === 'boolean') return `${key}: ${v}`;
    if (v === '' || v === null || v === undefined) return null;
    return `${key}: '${String(v).replace(/'/g, "\\'")}'`;
  });
  return '---\n' + out.filter(Boolean).join('\n') + '\n---\n';
}

function readMeta(relPath) {
  const raw = readFileSync(relPath, 'utf8');
  const { data } = parseFrontmatter(raw);
  const st = statSync(relPath);
  return {
    path: toPosix(relPath),
    url: postUrl(relPath),
    title: String(data.title || '（无标题）'),
    date: String(data.date || ''),
    category: Array.isArray(data.category) ? data.category : data.category ? [data.category] : [],
    tags: Array.isArray(data.tags) ? data.tags : data.tags ? [data.tags] : [],
    warning: Array.isArray(data.warning) ? data.warning : data.warning ? [data.warning] : [],
    ai: data.ai === true || data.ai === 'true',
    hasFrontmatter: undefined,
    bytes: st.size,
    mtime: st.mtimeMs,
  };
}

/** 列出全部文章（按日期倒序）；每个目录单独容错，缺目录不算错 */
export function listPosts() {
  const posts = [];
  for (const { dir, lang, draft } of POST_DIRS) {
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.md'))) {
      const rel = join(dir, file);
      try {
        posts.push(Object.assign(readMeta(rel), { lang, draft, file }));
      } catch (err) {
        posts.push({ path: toPosix(rel), url: postUrl(rel), lang, draft, file, title: '（解析失败）', date: '', category: [], tags: [], warning: [], ai: false, bytes: 0, mtime: 0, error: String(err.message) });
      }
    }
  }
  return posts.sort((a, b) => String(b.date).localeCompare(String(a.date)) || a.file.localeCompare(b.file));
}

/** 读原文（不做任何改写） */
export function readPost(relPath) {
  const abs = resolvePostPath(relPath);
  const raw = readFileSync(abs, 'utf8');
  const { data, body, hasFrontmatter } = parseFrontmatter(raw);
  return { path: toPosix(relPath), url: postUrl(relPath), raw, body, frontmatter: data, hasFrontmatter };
}

/** 写原文；`content` 是完整文件内容（含 frontmatter），编辑器只负责拼对 */
export function writePost(relPath, content) {
  if (typeof content !== 'string') throw new Error('内容必须是字符串');
  const abs = resolvePostPath(relPath);
  if (!existsSync(abs)) throw new Error('文件不存在：' + relPath);
  writeFileSync(abs, content, 'utf8');
  return { path: toPosix(relPath), bytes: Buffer.byteLength(content, 'utf8'), mtime: statSync(abs).mtimeMs };
}

/** 新建文件（父目录不存在则建），已存在时 `overwrite` 为假就报错 */
export function createPost(relPath, content, overwrite = false) {
  const abs = resolvePostPath(relPath);
  if (existsSync(abs) && !overwrite) throw new Error('文件已存在：' + relPath);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content, 'utf8');
  return { path: toPosix(relPath), bytes: Buffer.byteLength(content, 'utf8') };
}

const IMAGE_DIR = join('public', 'images');
const IMAGE_EXT = new Set(['webp', 'png', 'jpg', 'jpeg', 'gif', 'avif']);

/**
 * 存一张从编辑器粘贴/拖进来的图片。
 * ⚠️ 只允许落到 `public/images/` 下：名字里的路径分隔符与奇怪字符一律清掉（防目录穿越），
 *    扩展名只放行图片类；重名**不覆盖**，改成 `-1`、`-2`…（二进制写坏了 git 里救不回来）。
 */
export function saveImage(name, buf) {
  if (!buf || !buf.length) throw new Error('图片内容为空');
  const raw = String(name || '');
  const ext = (raw.match(/\.([a-z0-9]+)$/i)?.[1] || 'webp').toLowerCase();
  const base =
    raw
      .replace(/\.[a-z0-9]+$/i, '')
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      .replace(/^[-.]+|[-.]+$/g, '')
      .slice(0, 80) || 'image';
  mkdirSync(IMAGE_DIR, { recursive: true });
  const suffix = IMAGE_EXT.has(ext) ? ext : 'webp';
  let file = `${base}.${suffix}`;
  for (let n = 1; existsSync(join(IMAGE_DIR, file)); n++) file = `${base}-${n}.${suffix}`;
  writeFileSync(join(IMAGE_DIR, file), buf);
  return { file, url: '/images/' + file, bytes: buf.length };
}

// ── 新建文章 ────────────────────────────────────────────────
// ⚠️ 模板与命名规则只有这一份：CLI 的 `npm run new` 和编辑器顶栏的「新建」都走 newPostBlueprint。
//    （以前 new-post.mjs 里手写了整套模板，编辑器再抄一遍就等着两边跑偏。）

/** 文件名用的 slug：小写、非字母数字一律折成短横 */
export function slugify(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const pad2 = (n) => String(n).padStart(2, '0');

/** 本地时间的 `YYYY-MM-DDTHH:MM` —— frontmatter 的 date 就是这个形状 */
export function nowStamp(d = new Date()) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/**
 * 新文章的两个文件（中文 + en-US）：
 * · 文件名 `${日期}-${slug}.md`，日期就是 frontmatter 里 date 的前 10 位；
 * · 草稿落各自的 drafts/ 子目录 ⇒ layout 的相对层级要跟着深一级（中文草稿是 blog/drafts/）；
 * · frontmatter 一律走 serializeFrontmatter（字段顺序、引号转义跟编辑器保存时完全一致）；
 * · 「AI 翻译」标记分中英两份各自开关（aiZh / aiEn）—— 不限定英文版：
 *   中文写的、AI 翻成英文是一种情况，英文写的、AI 翻成中文是另一种，两边都可能。
 */
export function newPostBlueprint({ titleZh, titleEn, slug, date, draft = false, category, tags, warning, aiZh = false, aiEn = false } = {}) {
  // ⚠️ 标题不能是空串：serializeFrontmatter 会把空值整行丢掉，写出去就是一篇没有 title 的文章。
  //    某一侧没填就拿另一侧顶上（编辑器那边两侧都必填，这是兜底）。
  const zhTitle = String(titleZh ?? '').trim();
  const enTitle = String(titleEn ?? '').trim();
  if (!zhTitle && !enTitle) throw new Error('中文标题和英文标题至少要有一个');
  const title = { zh: zhTitle || enTitle, en: enTitle || zhTitle };
  const clean = slugify(slug) || slugify(enTitle) || slugify(zhTitle) || 'post';
  const stamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(String(date || '')) ? String(date).slice(0, 16) : nowStamp();
  const file = `${stamp.slice(0, 10)}-${clean}.md`;
  const base = {
    date: stamp,
    draft: draft === true,
    category: Array.isArray(category) && category.length ? category : ['essays'],
    tags: Array.isArray(tags) ? tags : [],
    warning: Array.isArray(warning) ? warning : [],
  };
  const make = (lang) => {
    const dir = join(BLOG_ROOT, ...(lang === 'en' ? ['en-US'] : []), ...(draft ? ['drafts'] : []));
    // blog/ 起算两级，en-US 与 drafts 各再加一级
    const depth = 2 + (lang === 'en' ? 1 : 0) + (draft ? 1 : 0);
    const data = { layout: '../'.repeat(depth) + 'layouts/Layout.astro', title: title[lang], ...base };
    if (lang === 'en' ? aiEn : aiZh) data.ai = true;
    return { path: toPosix(join(dir, file)), lang, content: serializeFrontmatter(data) };
  };
  return [make('zh'), make('en')];
}

/** 落盘。⚠️ 先把两个目标都查一遍再写：不能一个成、一个败，留下半篇文章 */
export function createNewPost(opts, overwrite = false) {
  const files = newPostBlueprint(opts);
  for (const f of files) {
    if (existsSync(resolvePostPath(f.path)) && !overwrite) throw new Error('文件已存在：' + f.path);
  }
  return files.map((f) => Object.assign(createPost(f.path, f.content, overwrite), { lang: f.lang }));
}
