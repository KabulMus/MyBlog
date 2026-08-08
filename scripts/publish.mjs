// 一键发布：git add + commit + push，Cloudflare Pages 会自动构建部署
// 用法：npm run pub                  （自动生成提交信息，如 "post: 2026-08-05"）
//       npm run pub -- "自定义消息"
import { execSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// 提示未发布的草稿（drafts/ 已被 gitignore，草稿绝不会被提交进 GitHub）
const draftDirs = [join('src', 'pages', 'blog', 'drafts'), join('src', 'pages', 'blog', 'en-US', 'drafts')];
const draftCount = draftDirs.reduce(
  (n, d) => n + (existsSync(d) ? readdirSync(d).filter((f) => f.endsWith('.md')).length : 0),
  0
);
if (draftCount > 0) {
  console.log(`⚠️  检测到 ${draftCount} 篇草稿在 drafts/ 未发布（不会被提交，也不会进 GitHub）`);
  console.log('   如需发布草稿：npm run pub:draft\n');
}

let msg = process.argv[2];
if (!msg) {
  try {
    const status = execSync('git status --porcelain').toString();
    const m = status.match(/\d{4}-\d{2}-\d{2}/);
    msg = m ? `post: ${m[0]}` : 'post: 更新';
  } catch {
    msg = 'post: 更新';
  }
}

const safeMsg = msg.replace(/"/g, '\\"');
try {
  execSync('git add -A', { stdio: 'inherit' });
  execSync(`git commit -m "${safeMsg}"`, { stdio: 'inherit' });
  execSync('git push', { stdio: 'inherit' });
  console.log(`\n✅ 已提交并推送："${msg}"`);
  console.log('   Cloudflare Pages 正在自动构建部署，稍后即可访问');
} catch (e) {
  console.error('\n❌ 发布未完成：' + String(e.message).split('\n')[0]);
  process.exitCode = 1;
}
