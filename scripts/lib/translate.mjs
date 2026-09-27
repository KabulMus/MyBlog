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

/** 任务说明的尾巴：有没有标题决定输出格式（吐槽没有标题，不能凭空编一个） */
function taskBlock(hasTitle, toZh) {
  const lines = [
    '## 你的任务',
    '',
    toZh ? '把用户给你的这篇**英文**文章翻译成中文。' : '把用户给你的这篇**中文**文章翻译成英文。',
    '',
    '- 输出**只有**译文本身，不要任何前言、说明、致辞、结束语。',
    '- 不要用 ``` 代码块把整篇包起来。',
    '- 不要输出 frontmatter（不要 `---` 那一段），也不要输出 `title:` 之类的字样。',
    '- ⚠️ **保留原文的换行**：原文段落里行尾两个空格的硬换行，要在译文对应位置同样保留（别把两句并成一行），也不要自己另加换行或重新折行。',
  ];
  if (hasTitle) {
    lines.push(
      '- 第一行：翻译后的**标题**（纯文本一行，不带引号、不带任何前缀）。',
      '- 第二行：空行。',
      '- 第三行起：正文 Markdown。',
    );
  } else {
    lines.push('- 原文没有标题（吐槽体）⇒ 直接从正文第一行开始，不要自己编一个标题行。');
  }
  return lines.join('\n');
}

/**
 * 组提示词。`hasFrontmatterTitle` 由服务端按原文 frontmatter 判定后传进来：
 * 吐槽没有 title，这时模型不该编标题，服务端也要按「整份都是正文」来切。
 * `direction`：'zh2en' 或 'en2zh' —— 用词偏好文件是照中译英写的，反向时得说清楚哪些条款照旧、
 * 哪些不适用，不然模型会拿英文拼写规则去套中文输出。
 */
export function buildMessages({ style, title, hasFrontmatterTitle, body, direction = 'zh2en' }) {
  const toZh = direction === 'en2zh';
  const system = [
    toZh
      ? '你是一位把英文博客翻回中文的译者。严格遵守下面这份偏好——它原本是照中译英写的：术语表反过来用，语气那几条照旧；英文拼写/标点那几条只当参考，输出的中文按中文排版习惯来（全角标点、直角引号「」、破折号用 ——、中文之间不手打空格）：'
      : '你是一位把中文博客翻成英文的译者。严格遵守下面这份「用词偏好」，它是硬性要求：',
    '',
    style.trim() || '（没有额外偏好文件，按自然、口语的目标语言翻译。）',
    '',
    taskBlock(hasFrontmatterTitle, toZh),
  ].join('\n');

  const user = hasFrontmatterTitle
    ? `${toZh ? '英文标题' : '中文标题'}：${title}\n\n${toZh ? '英文正文' : '中文正文'}：\n${body}`
    : `${toZh ? '英文正文（没有标题）' : '中文正文（没有标题）'}：\n${body}`;

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
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
 * ⚠️ 没有 frontmatter title 的文章（吐槽）整份都是正文 —— 判据由调用方给，不靠猜。
 */
export function splitTranslation(text, hasTitle) {
  const clean = String(text || '').replace(/\r\n/g, '\n').trim();
  if (!hasTitle) return { title: '', body: clean };
  const nl = clean.indexOf('\n');
  if (nl < 0) return { title: clean, body: '' };
  return { title: clean.slice(0, nl).trim(), body: clean.slice(nl + 1).trim() };
}
