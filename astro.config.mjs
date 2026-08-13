import { defineConfig } from 'astro/config';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import sitemap from '@astrojs/sitemap';

// ⚡️ 智能引号状态机（与 Layout.astro 的 smartQuotes 完全同一套逻辑，等长替换 1:1）。
// 不依赖任何硬编码单词列表：只靠结构（前后字符 + 是否存在配对的闭引号）判断开引号 / 闭引号 / 撇号。
function smartQuotesText(text) {
  text = text.replace(/"([^"\n]*)"/g, '\u201C$1\u201D');
  const chars = text.split('');
  const positions = [];
  for (let i = 0; i < chars.length; i++) {
    if (chars[i] === "'") positions.push(i);
  }
  if (positions.length === 0) return text;
  const isAlnum = (ch) => /[A-Za-z0-9]/.test(ch);
  let inQuote = false;
  for (let i = 0; i < chars.length; i++) {
    if (chars[i] !== "'") continue;
    const prev = i > 0 ? chars[i - 1] : '';
    const next = i < chars.length - 1 ? chars[i + 1] : '';
    if (inQuote) {
      if (isAlnum(next)) {
        chars[i] = '\u2019'; // 后是字母 → 撇号（it's）
      } else if (next === '' || /\s/.test(next)) {
        chars[i] = '\u2019'; // 后是空白/结尾 → 闭引号
        inQuote = false;
      } else {
        // 后是标点：若后面还有 ' → 是撇号（如 somethin'.' 中间），否则是闭引号
        if (positions.some((p) => p > i)) {
          chars[i] = '\u2019';
        } else {
          chars[i] = '\u2019';
          inQuote = false;
        }
      }
    } else {
      if (isAlnum(prev)) {
        chars[i] = '\u2019'; // 前是字母 → 撇号（it's）
      } else {
        // 只有后面存在“闭引号候选”（某个 ' 后是非字母/结尾）才当开引号，
        // 否则是开头撇号缩写（'cause / 'Twas / 'em / 'til）
        const hasClosing = positions.some(
          (j) => j > i && (j === chars.length - 1 || !isAlnum(chars[j + 1]))
        );
        if (hasClosing) {
          chars[i] = '\u2018'; // 开引号
          inQuote = true;
        } else {
          chars[i] = '\u2019'; // 开头撇号（'cause 等）
        }
      }
    }
  }
  return chars.join('');
}

// ⚡️ 正文引号统一走上面的状态机（替代 Astro 内置 retext-smartypants 的引号转换，避免其把
// 'cause/'Twas 等开头撇号误判为开引号的固有限制）。跨 text 节点拼接 → 统一处理 → 按原长度写回，
// 保证引号对跨越加粗/链接/代码时也能正确配对；code/pre/KaTeX 等受保护区域原样保留、不参与状态机。
// 块级元素集合：引号配对只在同一个块级元素内进行，避免跨段落/跨列表项串扰。
const BLOCK_TAGS = new Set([
  'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'blockquote',
  'td', 'th', 'dt', 'dd', 'figcaption', 'pre', 'div', 'section',
  'article', 'aside', 'caption', 'summary', 'details',
]);
const PLACEHOLDER = '\u0001';
function rehypeSmartQuotesBody() {
  return (tree) => {
    // 手动递归遍历，用显式 ancestors 数组维护祖先链（unist 节点没有 .parent 反向引用，
    // 不能用 p = p.parent 向上查找，否则所有文本都会落到同一个 root 组导致跨块串扰）
    const collected = [];
    (function walk(node, ancestors) {
      if (!node) return;
      if (node.type === 'text') {
        let isProtected = false;
        let block = null;
        for (let k = ancestors.length - 1; k >= 0; k--) {
          const a = ancestors[k];
          const cls = a.properties && a.properties.className;
          const isKatex =
            (Array.isArray(cls) && cls.includes('katex')) ||
            a.tagName === 'annotation' ||
            a.tagName === 'math';
          if (
            a.tagName === 'code' || a.tagName === 'pre' || a.tagName === 'kbd' ||
            a.tagName === 'samp' || a.tagName === 'script' || a.tagName === 'style' || isKatex
          ) {
            isProtected = true;
            break;
          }
          if (BLOCK_TAGS.has(a.tagName)) {
            block = a;
            break;
          }
        }
        collected.push({ node, isProtected, block: block || tree });
        return;
      }
      const children = node.children;
      if (children) {
        for (const child of children) {
          walk(child, ancestors.concat([node]));
        }
      }
    })(tree, []);

    // 按块级元素分组，组内拼接 → 状态机 → 按原长度写回
    const groups = new Map();
    for (const t of collected) {
      if (!groups.has(t.block)) groups.set(t.block, []);
      groups.get(t.block).push(t);
    }
    groups.forEach((nodes) => {
      let full = '';
      nodes.forEach((t) => {
        full += t.isProtected ? PLACEHOLDER.repeat(t.node.value.length) : t.node.value;
      });
      const transformed = smartQuotesText(full);
      let offset = 0;
      nodes.forEach((t) => {
        const len = t.node.value.length;
        t.node.value = t.isProtected ? t.node.value : transformed.slice(offset, offset + len);
        offset += len;
      });
    });
  };
}

export default defineConfig({
  site: 'https://blog.ethan929.com',
  markdown: {
    remarkPlugins: [remarkMath], // ⚡️ 负责在 Markdown 编译阶段识别 $ 和 $$ 语法
    rehypePlugins: [rehypeKatex, rehypeSmartQuotesBody], // ⚡️ KaTeX 公式 + 正文智能引号（统一状态机）
    // ⚡️ 关闭内置 smartypants 的引号转换，改由 rehypeSmartQuotesBody 统一接管；
    //    保留破折号/省略号；backticks 也关闭（否则正文两个单引号 '' 会被合并成右双引号 ”）
    smartypants: {
      quotes: false,
      dashes: true,
      ellipses: true,
      backticks: false,
    },
  },
  vite: {
    css: {
      // ⚡️ 方案 2-1：直接强制指定 vite 的 CSS 目标，覆盖默认的激进压缩
      target: ['chrome80', 'safari13', 'firefox75', 'edge80']
    },
    build: {
      // ⚡️ 方案 2-2：如果上面还不行，可以尝试把默认的 cssMinify 换成 esbuild（更守规矩）
      cssMinify: 'esbuild' 
    }
  },
  integrations: [
    sitemap(),
  ],
  server: {
    host: true
  }
});