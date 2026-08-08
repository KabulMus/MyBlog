// 发布草稿：把 drafts/ 下的草稿移到正式目录、去掉 draft: true，然后提交推送
// 用法：npm run pub:draft          （交互式选择要发布的草稿）
import { execSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { readdirSync, readFileSync, writeFileSync, rmSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const rl = createInterface({ input: stdin, output: stdout });

const draftDirs = [
  join('src', 'pages', 'blog', 'drafts'),
  join('src', 'pages', 'blog', 'en-US', 'drafts'),
];

// 收集草稿
const drafts = [];
for (const dir of draftDirs) {
  if (!existsSync(dir)) continue;
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.md'))) {
    drafts.push({ dir, file: f });
  }
}

if (drafts.length === 0) {
  console.log('📭 没有草稿可发布（drafts/ 目录为空）');
  process.exit(0);
}

console.log(`📄 发现 ${drafts.length} 篇草稿：`);
drafts.forEach((d, i) => console.log(`  ${i + 1}. ${join(d.dir, d.file)}`));
const ans = (
  await rl.question('\n要发布哪些？(序号/逗号分隔，回车或 all = 全部)：')
).trim().toLowerCase();
rl.close();

const pick = (s) => {
  if (!s || s === 'all') return drafts;
  return s
    .split(',')
    .map((x) => parseInt(x.trim(), 10))
    .filter((n) => n >= 1 && n <= drafts.length)
    .map((n) => drafts[n - 1]);
};

const toPublish = pick(ans);
if (toPublish.length === 0) {
  console.log('❌ 未选择有效草稿，已取消');
  process.exit(0);
}

// 去掉 frontmatter 的 draft: true，并移动到正式目录
const moved = [];
for (const d of toPublish) {
  const isEn = d.dir.includes('en-US');
  const src = join(d.dir, d.file);
  const content = readFileSync(src, 'utf8');
  // 草稿目录的 layout 相对路径比正式目录多一级，发布时改回正式级
  const layoutFix = isEn
    ? /\.\.\/\.\.\/\.\.\/\.\.\/layouts\/Layout\.astro/
    : /\.\.\/\.\.\/\.\.\/layouts\/Layout\.astro/;
  const layoutTo = isEn ? '../../../layouts/Layout.astro' : '../../layouts/Layout.astro';
  const cleaned = content
    .replace(layoutFix, layoutTo)
    .replace(/\ndraft:\s*true\s*\n/, '\n')
    .replace(/\n{3,}/g, '\n\n');
  const destDir = isEn ? join('src', 'pages', 'blog', 'en-US') : join('src', 'pages', 'blog');
  mkdirSync(destDir, { recursive: true });
  const dest = join(destDir, d.file);
  writeFileSync(dest, cleaned);
  rmSync(src);
  moved.push(`${d.file} → ${dest}`);
}

// 清理空的 drafts 目录
for (const dir of draftDirs) {
  if (existsSync(dir) && readdirSync(dir).length === 0) rmSync(dir);
}

console.log('\n✅ 已发布草稿：');
moved.forEach((m) => console.log(`  ${m}`));

// 提交推送
try {
  const status = execSync('git status --porcelain').toString();
  const m = status.match(/\d{4}-\d{2}-\d{2}/);
  const msg = m ? `post: ${m[0]}` : 'post: 发布草稿';
  execSync('git add -A', { stdio: 'inherit' });
  execSync(`git commit -m "${msg.replace(/"/g, '\\"')}"`, { stdio: 'inherit' });
  execSync('git push', { stdio: 'inherit' });
  console.log(`\n🚀 已提交并推送："${msg}"，Cloudflare Pages 正在构建部署`);
} catch (e) {
  console.error('\n❌ 发布未完成：' + String(e.message).split('\n')[0]);
  process.exitCode = 1;
}
