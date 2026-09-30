// 中译英（编辑器顶栏「AI 翻译」用）
// ⚠️ 只在 Node 侧跑：编辑器那个 dev 中间件调用它（见 astro.config.mjs 的 blogEditorApi）。
// 提示词里的「用词偏好」整份来自仓库根目录的 TRANSLATION-STYLE.md —— 改风格改那个文件即可。
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** 流结束时补的哨兵：客户端靠它判断「有没有被截断」（少一个字符就当失败） */
export const DONE_MARK = '\n<<<TRANSLATE_DONE>>>';

const STYLE_FILE = 'TRANSLATION-STYLE.md';
const DEFAULT_BASE_URL = 'https://api.deepseek.com';
const DEFAULT_MODEL = 'deepseek-chat';

/** 用词偏好文件（缺了不致命：退化成「只有下面那份任务说明」的翻译） */
export function readStyleGuide(cwd = process.cwd()) {
  try {
    return readFileSync(join(cwd, STYLE_FILE), 'utf8');
  } catch {
    return '';
  }
}

/**
 * 任务说明。
 * ⚠️ 正文这一路**只要正文**：标题不在这里出（历史教训：以前要求「第一行是标题」，
 *    模型一旦没给，服务端就会把正文第一行当标题吃掉，标题也跟着丢了）。
 *    标题走单独的 translateTitle 小请求。
 */
function taskBlock(toZh) {
  return [
    '## 你的任务',
    '',
    toZh ? '把用户给你的这篇**英文**文章正文翻译成中文。' : '把用户给你的这篇**中文**文章正文翻译成英文。',
    '',
    '- 输出**只有**译文正文本身：不要标题行、不要 frontmatter（`---` 那段）、不要 `title:`、不要任何前言/说明/致辞/结束语。',
    '- 不要用 ``` 代码块把整篇包起来。',
    '- ⚠️ **保留原文的换行**：原文段落里行尾两个空格的硬换行，要在译文对应位置同样保留（别把两句并成一行），也不要自己另加换行或重新折行。',
  ].join('\n');
}

/**
 * 组正文提示词。只靠正文，不需要原文标题参与（不把标题放进来，免得模型又把它写回正文里）。
 * `direction`：'zh2en' 或 'en2zh' —— 用词偏好文件是照中译英写的，反向时得说清楚哪些条款照旧、
 * 哪些不适用，不然模型会拿英文拼写规则去套中文输出。
 */
export function buildMessages({ style, body, direction = 'zh2en' }) {
  const toZh = direction === 'en2zh';
  const system = [
    directionIntro(toZh),
    '',
    style.trim() || '（没有额外偏好文件，按自然、口语的目标语言翻译。）',
    '',
    taskBlock(toZh),
  ].join('\n');

  return [
    { role: 'system', content: system },
    { role: 'user', content: (toZh ? '英文正文：' : '中文正文：') + '\n' + body },
  ];
}

/** 标题：去掉模型可能加上的引号/书名号/换行，只留一行纯文本 */
export function cleanTitleText(raw) {
  return String(raw || '')
    .split('\n')
    .map((line) => line.trim())
    .find(Boolean)
    ?.replace(/^["'“”「『《]+/, '')
    .replace(/["'“”」』》]+$/, '')
    .trim() ?? '';
}

/** 正文和标题两路共用的开场白（方向决定措辞） */
function directionIntro(toZh) {
  return toZh
    ? '你是一位把英文博客翻回中文的译者。严格遵守下面这份偏好——它原本是照中译英写的：术语表反过来用，语气那几条照旧；英文拼写/标点那几条只当参考，输出的中文按中文排版习惯来（全角标点、直角引号「」、破折号用 ——、中文之间不手打空格）：'
    : '你是一位把中文博客翻成英文的译者。严格遵守下面这份「用词偏好」，它是硬性要求：';
}

/**
 * 单独翻标题。
 * ⚠️ 这一步失败就当整体失败：宁可不出译文，也不能悄悄把标题写错（反正可以再点一次）。
 * ⚠️ 偏好文件（术语表、Em Dash、打码、Title Case…）**必须也带进来** —— 标题里一样会出现
 *    「一中」「周深」这种专名，漏了就会出一个跟正文不一致的译名。
 */
export async function translateTitle({ apiKey, baseUrl, model, title, direction = 'zh2en', style, signal }) {
  const toZh = direction === 'en2zh';
  const messages = [
    {
      role: 'system',
      content: [
        directionIntro(toZh),
        '',
        String(style || '').trim() || '（没有额外偏好文件，按自然、口语的目标语言翻译。）',
        '',
        '## 你的任务',
        '',
        `把用户给你的这**一个标题**翻成${toZh ? '中文' : '英文'}。`,
        '',
        '- 只输出译文本身：不加引号、不加说明、不另起一行。',
        '- 标题里的专名一律按上面那张术语表来。',
        '- 保持原标题的标点和语气。',
      ].join('\n'),
    },
    { role: 'user', content: String(title || '') },
  ];
  const raw = await streamTranslation({ apiKey, baseUrl, model, messages, signal });
  return cleanTitleText(raw);
}

/**
 * 调 DeepSeek 的流式接口，边收边通过 `onDelta` 吐出来。
 * ⚠️ 用的是 OpenAI 兼容的 /chat/completions + SSE；SSE 帧自己拆，不引依赖。
 */
export async function streamTranslation(options) {
  const {
    apiKey,
    baseUrl = DEFAULT_BASE_URL,
    model = DEFAULT_MODEL,
    messages,
    onDelta,
    signal,
  } = options;

  if (!apiKey) throw new Error('缺少 DeepSeek API key');

  const res = await fetch(String(baseUrl).replace(/\/+$/, '') + '/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: 'Bearer ' + apiKey,
    },
    body: JSON.stringify({ model, messages, stream: true, temperature: 0.3, max_tokens: 8192 }),
    signal,
  });

  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => '');
    throw new Error(`DeepSeek 返回 ${res.status}：${detail.slice(0, 300) || '（没有内容）'}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // 按行拆 SSE：一行一个 `data: {...}`，空行是帧结束
    let nl;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;
      let delta = '';
      try {
        delta = JSON.parse(payload)?.choices?.[0]?.delta?.content ?? '';
      } catch {
        continue; // 半截 JSON 或者心跳包，跳过
      }
      if (!delta) continue;
      full += delta;
      onDelta?.(delta);
    }
  }

  return full;
}

/**
 * 把流出来的整份译文切成「标题 + 正文」。
 * ⚠️ 已经不用了：标题现在由 translateTitle 单独翻、走响应头（这样模型漏标题也不会把正文第一行当标题）。
 */
