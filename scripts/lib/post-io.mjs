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
