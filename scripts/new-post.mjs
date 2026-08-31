// 交互式生成一篇新文章（中文 + en-US 英文版两套模板）
// 用法：npm run new
import { createInterface } from 'node:readline/promises';
import { emitKeypressEvents } from 'node:readline';
import { stdin, stdout } from 'node:process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createSelectState, handleSelectKey, addCustom } from './lib/select-core.mjs';

// 开启 keypress 事件（独立于 readline 接口，raw 选择器依赖它）
emitKeypressEvents(stdin);

const rl = createInterface({ input: stdin, output: stdout });

// 分类定义（与 src/config/categories.ts 保持一致）
const CATS = [
  { id: 'music', zh: '音乐', en: 'Music' },
  { id: 'studio', zh: '创作', en: 'Studio' },
  { id: 'essays', zh: '随笔', en: 'Essays' },
  { id: 'achievements', zh: '成就', en: 'Achievements' },
];

// 分类 → 可选 tag key（与 src/config/tags.ts 保持一致，改 tag 后请同步这里）
const CAT_TAGS = {
  music: ['insync', 'review', 'musictheory'],
  studio: ['channel', 'tutorial', 'resource', 'video', 'code'],
  essays: ['rant', 'article', 'note', 'quote'],
  achievements: ['recap', 'academic', 'skill', 'award', 'habit'],
};

// tag 中文名 / 英文名（与 src/config/tags.ts 保持一致，仅用于提示显示）
const TAG_ZH = {
  insync: '同频', review: '乐评', musictheory: '乐理',
  channel: '频道', tutorial: '教程', resource: '资源', video: '视频', code: '代码',
  rant: '吐槽', article: '长文', note: '短记', quote: '摘抄',
  recap: '回顾', academic: '学业', skill: '技能', award: '获奖', habit: '习惯',
};
const TAG_EN = {
  insync: 'In-sync', review: 'Review', musictheory: 'Music Theory',
  channel: 'Channel', tutorial: 'Tutorial', resource: 'Resource', video: 'Video', code: 'Code',
  rant: 'Rant', article: 'Article', note: 'Note', quote: 'Quote',
  recap: 'Recap', academic: 'Academic', skill: 'Skill', award: 'Award', habit: 'Habit',
};
// tag 双语显示名（与分类的「中文 / English」格式一致）
const tagLabel = (k) => `${TAG_ZH[k] || ''} / ${TAG_EN[k] || k}`;

// —— 进阶版：方向键交互式多选 ——
// 选择逻辑在 lib/select-core.mjs（纯逻辑，可单元测试）
// choices: [{ key, label }]；opts: multi/ordered/preSelected/custom
// opts.custom 非空时列表末尾出现「✚ 自定义」行，回车/空格进入内联输入，
//   输入内容（可多个、逗号分隔）直接加入选择，与列表项平起平坐（混在勾选顺序里）。
// 返回：选中 key 数组（ordered 时按勾选顺序）
function select(prompt, choices, opts = {}) {
  return new Promise((resolve) => {
    const state = createSelectState(choices, opts);
    let linesDrawn = 0;
    let inputMode = false; // 自定义输入子模式
    let inputBuf = '';

    const labelOf = (k) => {
      const c = choices.find((x) => x.key === k);
      return c ? c.label : k;
    };

    function render() {
      let out = '';
      for (let i = 0; i < linesDrawn; i++) out += '\x1b[1A\x1b[2K';
      linesDrawn = 0;
      if (inputMode) {
        out += '\r\x1b[2K' + '自定义标签（多个用逗号分隔，回车 添加，Esc 取消）：' + inputBuf + '\x1b[J';
        stdout.write(out);
        return;
      }
      out += '\r\x1b[2K' + prompt;
      choices.forEach((c, i) => {
        const on = state.chosen.has(c.key);
        const mark = on ? '◉' : '○';
        const idx = state.ordered && on ? `  #${state.order.indexOf(c.key) + 1}` : '';
        out += '\n' + (i === state.cursor ? '\x1b[7m' : '') + `  ${mark} ${c.key}  ${c.label}${idx}` + '\x1b[0m';
        linesDrawn++;
      });
      if (state.custom) {
        const on = state.cursor === choices.length;
        out += '\n' + (on ? '\x1b[7m' : '') + `  ✚ ${state.custom}` + '\x1b[0m';
        linesDrawn++;
      }
      if (state.multi) {
        const preview = state.order.length ? state.order.map(labelOf).join(' → ') : '（未选）';
        out += '\n  已选：' + preview;
        linesDrawn++;
      }
      stdout.write(out);
    }

    function finish() {
      stdin.removeListener('keypress', onKey);
      stdin.setRawMode(false);
      let out = '';
      for (let i = 0; i < linesDrawn; i++) out += '\x1b[1A\x1b[2K';
      const summary = state.multi
        ? ` 已选：${state.order.length ? state.order.map(labelOf).join('、') : '（未选）'}`
        : (state.order[0] ? labelOf(state.order[0]) : '');
      out += '\r\x1b[2K' + prompt + summary + '\n\x1b[J';
      stdout.write(out);
    }

    function onKey(str, key) {
      if (key.ctrl && key.name === 'c') { finish(); process.exit(0); }
      if (inputMode) {
        if (key.name === 'return' || key.name === 'enter') {
          addCustom(state, arr(inputBuf));
          inputMode = false;
          inputBuf = '';
          render();
        } else if (key.name === 'escape') {
          inputMode = false;
          inputBuf = '';
          render();
        } else if (key.name === 'backspace') {
          inputBuf = inputBuf.slice(0, -1);
          render();
        } else if (str && !key.ctrl && !key.meta) {
          inputBuf += str;
          render();
        }
        return;
      }
      const r = handleSelectKey(state, str, key);
      if (r.action === 'submit') { finish(); resolve(state.order); }
      else if (r.action === 'exit') { finish(); process.exit(0); }
      else if (r.action === 'custom') { inputMode = true; inputBuf = ''; render(); }
      else if (r.action === 'render') render();
    }

    stdin.on('keypress', onKey);
    stdin.setRawMode(true);
    stdin.resume();
    render();
  });
}

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
// —— 进阶版：分类、标签用方向键交互式多选 ——
// 进入自定义 raw 输入前先关闭 readline 接口，避免双方抢键
rl.close();
try { stdin.setRawMode(false); } catch {}

// 分类：多选 + 记录勾选顺序（第一个即主分类，写入 frontmatter 数组顺序）
const selectedCats = await select(
  '分类（↑↓ 空格 勾选，回车 确认；顺序=勾选顺序，默认 essays）：',
  CATS.map((c) => ({ key: c.id, label: `${c.zh} / ${c.en}` })),
  { multi: true, ordered: true, preSelected: ['essays'] }
);
const effectiveCats = selectedCats.length ? selectedCats : ['essays'];

// 标签：多选，候选 = 所选分类中含有的 tag；列表底部「✚ 自定义标签…」行可直接输自定义 tag
const availableTags = [...new Set(effectiveCats.flatMap((c) => CAT_TAGS[c] || []))];
const tags = await select(
  `标签（↑↓ 空格 勾选，回车 确认；✚ 行可输自定义，可选 ${availableTags.length} 个）：`,
  availableTags.map((k) => ({ key: k, label: tagLabel(k) })),
  { multi: true, ordered: true, custom: '自定义标签…' }
);

// 重建 readline 接口，继续用普通输入问剩余问题
const rl2 = createInterface({ input: stdin, output: stdout });
const draft = (await rl2.question('先存草稿？(y/N，默认 N 直接发布)：')).trim().toLowerCase() === 'y';
// 英文版默认显示「AI 翻译」pill（当前英语水平还不够，默认 true；日后英语水平够了改成 false 即可）
const aiTranslate = (await rl2.question('英文版显示「AI 翻译」pill？(Y/n，默认 Y)：')).trim().toLowerCase() !== 'n';
rl2.close();

// 内容警告（多选，顺序=显示顺序，可留空）：与 Layout.astro warningLabel / main.css cw-* 保持一致
const warningChoices = [
  { key: 'opinion', label: '主观 / Opinion' },
  { key: 'spoilers', label: '剧透 / Spoilers' },
  { key: 'politics', label: '政治 / Politics' },
  { key: 'adult', label: '成人 / Adult' },
];
const warnings = await select(
  '内容警告（↑↓ 空格 勾选，回车 确认；顺序=显示顺序，可留空）：',
  warningChoices,
  { multi: true, ordered: true }
);

const catArr = fmtArr(effectiveCats, "['essays']");
const tagArr = fmtArr(tags, '[]');
const warningLine =
  warnings.length === 1
    ? `warning: ${warnings[0]}\n`
    : warnings.length > 1
      ? `warning: ['${warnings.join("', '")}']\n`
      : '';
const aiLine = aiTranslate ? 'ai: true\n' : '';

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
${warningLine}
---
`;
const enContent = `---
layout: '${enLayout}'
title: '${titleEn.replace(/'/g, "\\'")}'
date: '${dateStr}'
draft: ${draft}
${aiLine}category: ${catArr}
tags: ${tagArr}
${warningLine}
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
