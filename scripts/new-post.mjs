// 交互式生成一篇新文章（中文 + en-US 英文版两套模板）
// 用法：npm run new
import { createInterface } from 'node:readline/promises';
import { emitKeypressEvents } from 'node:readline';
import { stdin, stdout } from 'node:process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createSelectState, handleSelectKey, addCustom } from './lib/select-core.mjs';
import { newPostBlueprint, slugify } from './lib/post-io.mjs';

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
const fmtDate = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
const fmtTime = (h, min) => `${pad(h)}:${pad(min)}`;
const nowDate = fmtDate(now.getFullYear(), now.getMonth() + 1, now.getDate());
const nowTime = fmtTime(now.getHours(), now.getMinutes());

// 先问标题前确认：用当前时间新建，还是自定义日期/时间？（默认当前时间）
const parseDate = (s) => {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s.trim());
  if (!m) return null;
  const y = +m[1], mo = +m[2], d = +m[3];
  const dt = new Date(y, mo - 1, d);
  if (!(dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d)) return null;
  return fmtDate(y, mo, d);
};
const parseTime = (s) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const h = +m[1], min = +m[2];
  if (h > 23 || min > 59) return null;
  return fmtTime(h, min);
};

const useNow =
  (await rl.question(`用当前时间（${nowDate} ${nowTime}）新建？(Y/n，默认 Y)：`))
    .trim().toLowerCase() !== 'n';

let datePrefix = nowDate;
let timeStr = nowTime;
if (!useNow) {
  // 选否：分别自定义日期与时间；直接回车则仍用「今天 / 当前时刻」
  while (true) {
    const ans = (await rl.question(`日期（YYYY-MM-DD，回车 = 今天 ${nowDate}）：`)).trim();
    if (!ans) break;
    const v = parseDate(ans);
    if (v) { datePrefix = v; break; }
    console.log('  ⚠ 日期无效（如 2026-02-30），请重输');
  }
  while (true) {
    const ans = (await rl.question(`时间（HH:MM，回车 = 当前 ${nowTime}，00:00 请输 00:00）：`)).trim();
    if (!ans) break;
    const v = parseTime(ans);
    if (v) { timeStr = v; break; }
    console.log('  ⚠ 时间无效（如 25:00），请重输');
  }
}
const dateStr = `${datePrefix}T${timeStr}`;

const arr = (s) => s.split(',').map((x) => x.trim()).filter(Boolean);

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
// 「AI 翻译」标记：默认只标英文版（多数情况下是中文写、AI 翻成英文）；
// 反过来（英文写、AI 翻成中文）就选中文版，两份都标也行。
const aiAnswer = (await rl2.question('「AI 翻译」标哪一份？(e=英文版(默认) / z=中文版 / b=两份 / n=不标)：'))
  .trim()
  .toLowerCase();
const aiEn = !['z', 'b', 'n'].includes(aiAnswer);
const aiZh = ['z', 'b'].includes(aiAnswer);
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

// ⚠️ 模板与命名规则在 scripts/lib/post-io.mjs（编辑器顶栏那个「新建」按钮用同一份）——
//    以前这里手写过整套模板，再抄一遍就等着两边跑偏。
const files = newPostBlueprint({
  titleZh,
  titleEn,
  slug,
  date: dateStr,
  draft,
  category: effectiveCats,
  tags,
  warning: warnings,
  aiZh,
  aiEn,
});
for (const f of files) {
  const abs = join(process.cwd(), f.path);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, f.content);
  console.log(`\n已创建：${abs}`);
}

console.log(
  draft
    ? `\n✅ 已保存为草稿（drafts/，不会进入 GitHub）。填好正文后运行：npm run pub:draft  即可发布`
    : `\n✅ 填好正文后运行：npm run pub  即可一键发布`
);

// —— 收尾：解除 raw 模式并停止读取 stdin，让进程自然退出 ——
//（选择器里多次 stdin.resume() 会把 stdin 留在“流动”状态；若不 pause，
//  stdin 句柄始终活跃 → 事件循环不空 → 进程不退出，结束后还得 Ctrl+C 才能继续敲命令）
try { stdin.setRawMode(false); } catch {}
stdin.pause();
