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

// ⚡️ 图片尺寸 + 图注的 Markdown 写法支持（Pandoc 风格）：
//   ![alt](/images/xxx.webp){.img-md}
//   *图注*（markdown 斜体，可省略）
// 编译成 <p><img class="img-md"><em>图注</em></p>，复用现有 p:has(img) 居中 + em 图注样式；
// 图注是普通 md 文本节点，智能引号也能正常生效。
// 注意：只有写了 {.xxx} 才会进入该处理，普通 ![]() 完全不受影响。
function remarkFigure() {
  return (tree) => {
    const children = tree.children;
    for (let i = 0; i < children.length; i++) {
      const p = children[i];
      if (!p || p.type !== 'paragraph') continue;
      const kids = p.children;
      const imgIdx = kids.findIndex((c) => c.type === 'image');
      if (imgIdx === -1) continue;
      const img = kids[imgIdx];
      // 图片后紧跟 {.xxx} → 提取 class
      let cls = null;
      let clsIdx = -1;
      const after = kids[imgIdx + 1];
      if (after && after.type === 'text') {
        const m = after.value.match(/^\s*\{\s*\.?([\w-]+)\s*\}\s*$/);
        if (m) { cls = m[1]; clsIdx = imgIdx + 1; }
      }
      if (!cls) continue; // 无尺寸 class → 保持原样
      img.data = img.data || {};
      img.data.hProperties = img.data.hProperties || {};
      img.data.hProperties.class = cls;
      if (clsIdx !== -1) kids.splice(clsIdx, 1);
      // 下一个兄弟段落若是「单独一句斜体」→ 作为图注并入本段
      const next = children[i + 1];
      if (
        next && next.type === 'paragraph' &&
        next.children.length === 1 &&
        next.children[0].type === 'emphasis'
      ) {
        kids.push(next.children[0]);
        children.splice(i + 1, 1);
      }
    }
  };
}

// ⚡️ 视频嵌入短代码（避免每次复制整段 iframe）：
//   {{youtube VIDEO_ID}}           → YouTube 播放器（点击加载）
//   {{bilibili AID BVID CID}}      → B 站播放器（点击加载）
// 编译成 .video-embed 点击加载占位；按钮文案按源文件路径是否含 en-US 自动切中/英。
function remarkEmbed() {
  return (tree, file) => {
    const isEn = String(file.path || '').includes('en-US');
    const label = isEn ? 'Load video' : '点击加载视频';
    const children = tree.children;
    for (let i = 0; i < children.length; i++) {
      const p = children[i];
      if (!p || p.type !== 'paragraph') continue;
      const text = (p.children || []).map((c) => (c.type === 'text' ? c.value : '')).join('').trim();
      const m = text.match(/^\{\{(youtube|bilibili)\s+([^}]+)\}\}$/);
      if (!m) continue;
      const kind = m[1];
      const args = m[2].trim().split(/\s+/).filter(Boolean);
      let src = '';
      let logo = '';
      let note = '';
      if (kind === 'youtube') {
        if (!args[0]) continue;
        const id = args[0];
        src = 'https://www.youtube.com/embed/' + encodeURIComponent(id);
        // 可选参数 cn → 在占位 logo 下方显示「中国大陆可能无法访问」提示（开关）
        if (args[1] === 'cn') note = isEn ? 'Note: this platform cannot be directly accessible in Chinese mainland.' : '请注意，此平台在中国大陆无法直接访问。';
        // 正式 YouTube logo（红播放钮 #F03 + 白三角 + 文字用 currentColor 随主题黑白转换：亮=近黑、暗=近白）
        logo = '<svg viewBox="0 0 42.75 9.23" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
          '<path fill="currentColor" d="M15.95,8.72v-2.52l-1.58-5.23h1.2l.59,2.37c.15.58.29,1.18.35,1.65h.07c.09-.53.22-1.1.36-1.64l.61-2.37h1.2l-1.6,5.23v2.52h-1.19Z"/>' +
          '<path fill="currentColor" d="M20.35,2.91c-1.4,0-1.88.8-1.88,2.54v.83c0,1.56.3,2.54,1.85,2.54s1.86-.93,1.86-2.54v-.83c0-1.55-.32-2.54-1.83-2.54ZM20.94,6.8c0,.76-.13,1.23-.62,1.23s-.61-.48-.61-1.23v-1.86c0-.65.09-1.22.61-1.22.54,0,.62.61.62,1.22v1.86Z"/>' +
          '<path fill="currentColor" d="M22.97,7.3V3.02h1.21v4.22c0,.47.11.75.47.75.28,0,.58-.16.71-.39V3.02h1.22v5.7h-.92l-.05-.7h-.05c-.35.51-.77.79-1.44.79-.88,0-1.15-.59-1.15-1.51Z"/>' +
          '<polygon fill="currentColor" points="27.79 8.72 27.79 1.92 26.38 1.92 26.38 .97 30.39 .97 30.39 1.92 28.99 1.92 28.99 8.72 27.79 8.72"/>' +
          '<path fill="currentColor" d="M30.17,7.3V3.02h1.21v4.22c0,.47.11.75.47.75.28,0,.58-.16.71-.39V3.02h1.22v5.7h-.92l-.05-.7h-.05c-.35.51-.77.79-1.44.79-.88,0-1.15-.59-1.15-1.51Z"/>' +
          '<path fill="currentColor" d="M37.22,2.89c-.59,0-1.01.26-1.29.68h-.06c.04-.55.06-1.03.06-1.4V.67h-1.18v4.96s0,3.1,0,3.1h1.03l.09-.56h.03c.28.38.69.61,1.25.61.93,0,1.32-.8,1.32-2.5v-.88c0-1.59-.18-2.51-1.25-2.51ZM37.27,6.28c0,1.06-.16,1.69-.65,1.69-.23,0-.55-.11-.69-.32v-3.39c.12-.32.4-.56.71-.56.5,0,.63.6.63,1.71v.87Z"/>' +
          '<path fill="currentColor" d="M42.75,6.26v-.95c0-1.38-.13-2.4-1.72-2.4-1.49,0-1.82,1-1.82,2.46v1c0,1.42.3,2.46,1.78,2.46,1.17,0,1.78-.59,1.71-1.72l-1.04-.06c-.01.7-.17.99-.64.99-.59,0-.62-.56-.62-1.39v-.39h2.34ZM40.41,5.11c0-.89.04-1.43.6-1.43s.6.53.6,1.43v.47h-1.2v-.47Z"/>' +
          '<path fill="#F03" d="M13.38,4.61s0,2.16-.29,3.18c-.15.56-.6,1.01-1.18,1.17-1.04.28-5.23.28-5.23.28,0,0-4.18,0-5.22-.28-.57-.16-1.03-.61-1.19-1.17-.28-1.03-.28-3.18-.28-3.18,0,0,0-2.14.28-3.15C.44.88.89.44,1.46.29c1.04-.29,5.22-.29,5.22-.29,0,0,4.19,0,5.23.29.58.15,1.03.59,1.18,1.17.29,1.01.29,3.15.29,3.15Z"/>' +
          '<path fill="#fff" d="M8.77,4.62l-3.46-1.96v3.93l3.46-1.96Z"/></svg>';
      } else if (kind === 'bilibili') {
        if (args.length < 3) continue;
        src = '//player.bilibili.com/player.html?isOutside=true&aid=' + args[0] + '&bvid=' + args[1] + '&cid=' + args[2] + '&p=1&autoplay=0';
        // 正式 Bilibili logo（单色蓝 #0cb6f2，黑/白底均可读）
        logo = '<svg viewBox="0 0 32.95 9.96" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path fill="#0cb6f2" d="M3.21,0c.14,0,.28.07.35.18l.85,1.22c.27-.01.54-.01.82-.01.26,0,.52,0,.78,0l.85-1.21c.08-.11.21-.18.35-.18h.04c.11,0,.22.04.3.1.25.17.3.5.13.75l-.42.6c.54.04,1.07.08,1.59.13.69.08,1.34.71,1.41,1.4.12,1.04.19,2.12.19,3.21,0,.72-.03,1.44-.08,2.15-.05.69-.68,1.34-1.37,1.41-1.22.14-2.5.21-3.79.21s-2.57-.07-3.79-.21c-.69-.08-1.31-.73-1.37-1.41-.05-.71-.08-1.43-.08-2.15,0-1.08.06-2.16.19-3.21.08-.69.73-1.32,1.41-1.4.51-.06,1.03-.1,1.55-.13l-.42-.6c-.06-.09-.09-.2-.09-.31,0-.3.24-.54.54-.54h.04ZM1.86,2.57c-.36.02-.69.34-.71.7-.06.93-.1,1.88-.1,2.83,0,.66.01,1.31.05,1.96.02.36.33.69.7.71,1.12.08,2.28.12,3.45.12s2.33-.04,3.45-.12c.36-.02.68-.35.7-.71.03-.65.05-1.31.05-1.96,0-.96-.04-1.9-.1-2.83-.03-.36-.35-.68-.71-.71-1.1-.07-2.23-.11-3.38-.11s-2.28.04-3.38.12ZM1.82,5.27l.04.09c.06.16.25.25.41.19.58-.21,1.14-.44,1.75-.62.23-.07.35-.29.26-.51h0c-.08-.23-.34-.35-.57-.27-.44.15-1.09.39-1.65.59-.22.08-.33.32-.24.53ZM3.82,5.96h0c.09,0,.16.07.18.16.13.72.78.81,1.02.07.02-.08.11-.15.19-.15.08,0,.17.07.2.15.26.73.86.66,1.03-.07.02-.09.1-.16.19-.16s.17.07.17.16c-.01.47-.33.96-.86.97-.29,0-.54-.16-.7-.4-.01-.02-.03-.02-.04,0-.16.24-.41.4-.7.4-.42.04-.86-.45-.86-.97,0-.09.08-.16.17-.16ZM8.64,5.27l-.04.09c-.06.16-.25.25-.41.19-.59-.21-1.15-.44-1.76-.62-.22-.07-.35-.29-.26-.51h0c.09-.23.34-.35.57-.27.44.15,1.1.39,1.65.59.22.08.33.32.25.53ZM11.5.9s0-.05.04-.06l1.63-.6h0s.05.02.05.05c-.1,1.93-.02,3.86.22,5.78,0,.04.04.06.06.05,1.21-.14,2.43.11,3.47.71,1.25.71.39,1.65-.23,2.03-1.21.75-2.64,1.05-4.05.88-.03,0-.05-.02-.05-.05-.23-2.95-.61-5.88-1.14-8.79ZM15.84,7.78s.02-.06-.02-.08c-.51-.27-1.05-.46-1.62-.57h-.01s-.05.03-.05.06c.06.61.18,1.44.21,1.56,0,0,0,.01,0,.02.01.02.04.03.06.02.52-.27.99-.6,1.42-1h0ZM17.17,3.33s-.04.04-.02.06l.28,1.39s.04.04.06.04l.37-.05s.05-.03.05-.06l-.19-1.39s-.04-.05-.06-.05l-.46.06h-.02ZM17.48,5.37l.77,3.84s.02.04.05.04l.8-.09s.05-.04.05-.06l-.47-3.88s-.04-.05-.06-.05l-1.09.13s-.05.03-.05.06ZM17.94,3.23l.45-.05s.05.02.05.04l.18,1.41s-.02.05-.05.05l-.43.05s-.06-.02-.06-.05l-.18-1.4s.01-.05.04-.05ZM18.81,1.44l.88,7.28s.03.05.06.05h.72s.05-.03.05-.06l-.63-7.4s0,0,0,0c0-.03-.03-.05-.06-.04l-.97.12s-.05.03-.05.06ZM20.72,3.29s.04-.04.06-.04h.46s.05.02.05.05l.02,1.41s-.02.05-.05.05h-.38s-.05-.02-.05-.05l-.11-1.42h0ZM20.92,5.24s-.05.03-.05.06l.3,3.91s.02.05.05.05h.78s.05-.02.05-.05v-3.91s-.02-.05-.05-.05h-1.08ZM21.46,3.29s.04-.04.06-.04h.44s.04.03.04.05v1.41s-.02.05-.05.05h-.4s-.05-.02-.05-.05l-.04-1.41h0ZM22.38.93s0-.05.04-.06l1.62-.59s.02,0,.02,0c.02,0,.05.02.04.05-.09,1.92-.02,3.84.23,5.75,0,.04.03.06.06.05,1.21-.14,2.42.11,3.47.71,1.25.71.39,1.65-.24,2.03-1.21.75-2.64,1.06-4.05.88-.03,0-.05-.02-.05-.05-.23-2.94-.61-5.87-1.14-8.77ZM26.71,7.78s.02-.06-.02-.08c-.5-.28-1.05-.46-1.62-.57h-.01s-.05.03-.05.06c.06.61.18,1.44.21,1.56,0,0,0,.01,0,.01.02.03.05.04.07.02.52-.27.99-.6,1.42-1h0ZM28.07,3.33s-.04.03-.04.05l.28,1.39s.03.05.06.04l.37-.05s.05-.03.05-.06l-.19-1.39s-.03-.05-.06-.05l-.46.06h0ZM28.42,5.3s-.05.04-.04.06l.77,3.84s.03.04.05.04l.81-.09s.05-.04.04-.06l-.47-3.88s-.04-.05-.06-.05l-1.09.13h0ZM28.85,3.23l.43-.05s.05.02.05.04l.17,1.41s-.01.05-.04.05l-.43.05h0s-.05-.02-.05-.05l-.18-1.4s.02-.05.05-.05ZM29.71,1.44l.88,7.28s.03.05.05.05h.72s.05-.03.05-.06l-.63-7.4h0s-.03-.05-.06-.05l-.97.12s-.05.03-.05.06ZM31.67,3.25h.45s.05.02.05.05l.03,1.41s-.02.05-.05.05h-.38s-.05-.02-.05-.05l-.11-1.42s.02-.05.05-.05ZM31.82,5.24s-.05.03-.05.06l.3,3.91s.02.05.05.05h.78s.05-.02.05-.05v-3.91s-.02-.05-.05-.05h-1.08ZM32.41,3.25h.44s.05.03.05.05v1.41s-.02.05-.05.05h-.4s-.05-.02-.05-.05l-.03-1.41s.02-.05.05-.05Z"/></svg>';
      } else {
        continue;
      }
      const html =
        '<div class="video-embed" data-pagefind-ignore data-embed-src="' + src + '">' +
        '<button class="video-embed-btn" type="button" aria-label="' + label + '">' +
        '<span class="video-embed-center">' +
        '<span class="video-embed-logo">' + logo + '</span>' +
        (note ? '<span class="video-embed-note">' + note + '</span>' : '') +
        '</span>' +
        '</button></div>';
      children[i] = { type: 'html', value: html };
    }
  };
}

export default defineConfig({
  site: 'https://blog.ethan929.com',
  markdown: {
    remarkPlugins: [remarkFigure, remarkEmbed, remarkMath], // ⚡️ 图片尺寸/图注 + 视频短代码 + 识别 $ $$ 语法
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