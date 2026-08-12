// 交互式生成一篇新文章（中文 + en-US 英文版两套模板）
// 用法：npm run new
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

const rl = createInterface({ input: stdin, output: stdout });

// 分类 → 可选 tag key（与 src/config/tags.ts 保持一致，改 tag 后请同步这里）
const CAT_TAGS = {
  music: ['insync', 'review', 'musictheory'],
  studio: ['channel', 'tutorial', 'resource', 'video', 'code'],
  essays: ['rant', 'article', 'note', 'quote'],
  achievements: ['recap', 'academic', 'skill', 'award', 'habit'],
};

// 本地时间：文件名仅用日期前缀，frontmatter date 带具体时间（如 2026-08-12T14:32）
const now = new Date();
const pad = (n) => String(n).padStart(2, '0');
const datePrefix = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
const dateStr = `${datePrefix}T${pad(now.getHours())}:${pad(now.getMinutes())}`;

const slugify = (s) =>
  s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

const arr = (s) => s.split(',').map((x) => x.trim()).filter(Boolean);

const fmtArr = (a, def) => (a.length ? `['${a.join("', '")}']` : def);

console.log(`📝 新文章（日期 ${dateStr}）\n`);

const titleZh = (await rl.question('中文标题：')).trim();
const titleEn = (await rl.question('英文标题：')).trim();
const slug =
  (await rl.question('URL 后缀（英文，回车自动按英文标题生成）：')).trim() ||
  slugify(titleEn) ||
  'post';
const category = arr(await rl.question('分类（music/studio/essays/achievements，逗号分隔，回车默认 essays）：'));
// 可选 tag 提示：列出所填分类中含有的 tag key
const availableTags = [...new Set(category.flatMap((c) => CAT_TAGS[c] || []))];
const tagHint = availableTags.length ? `，可选：${availableTags.join(',')}` : '';
const tags = arr(await rl.question(`标签（英文 key，逗号分隔${tagHint}）：`));
const draft = (await rl.question('先存草稿？(y/N，默认 N 直接发布)：')).trim().toLowerCase() === 'y';

const catArr = fmtArr(category, "['essays']");
const tagArr = fmtArr(tags, '[]');

// 草稿写入 drafts/（被 gitignore 不进 GitHub；CF 部署时无此目录，不会上线）
const draftSub = draft ? 'drafts' : '';
const zhFile = join(process.cwd(), 'src', 'pages', 'blog', draftSub, `${datePrefix}-${slug}.md`);
const enFile = join(process.cwd(), 'src', 'pages', 'blog', 'en-US', draftSub, `${datePrefix}-${slug}.md`);

// 草稿在 drafts/ 子目录，相对 layout 路径比正式目录多一级
const zhLayout = draft ? '../../../layouts/Layout.astro' : '../../layouts/Layout.astro';
const enLayout = draft ? '../../../../layouts/Layout.astro' : '../../../layouts/Layout.astro';

const zhContent = `---
layout: '${zhLayout}'
title: '${titleZh}'
date: '${dateStr}'
draft: ${draft}
category: ${catArr}
tags: ${tagArr}
---

`;
const enContent = `---
layout: '${enLayout}'
title: '${titleEn.replace(/'/g, "\\'")}'
date: '${dateStr}'
draft: ${draft}
category: ${catArr}
tags: ${tagArr}
---

`;

mkdirSync(dirname(zhFile), { recursive: true });
mkdirSync(dirname(enFile), { recursive: true });
writeFileSync(zhFile, zhContent);
console.log(`\n已创建：${zhFile}`);
writeFileSync(enFile, enContent);
console.log(`已创建：${enFile}`);

console.log(
  draft
    ? `\n✅ 已保存为草稿（drafts/，不会进入 GitHub）。填好正文后运行：npm run pub:draft  即可发布`
    : `\n✅ 填好正文后运行：npm run pub  即可一键发布`
);
rl.close();
