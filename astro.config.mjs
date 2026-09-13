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
// 注意：普通 ![]() 也认 —— 只要「图片独占一段」且下一段正好是单独一句斜体，那句就被当图注并进来
// （有没有 {.xxx} 尺寸类都一样）。
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
      // 图片后紧跟 {.xxx} → 提取 class（没写就不动 class）
      let cls = null;
      let clsIdx = -1;
      const after = kids[imgIdx + 1];
      if (after && after.type === 'text') {
        const m = after.value.match(/^\s*\{\s*\.?([\w-]+)\s*\}\s*$/);
        if (m) { cls = m[1]; clsIdx = imgIdx + 1; }
      }
      // 「图片自己占一段」的判定：除了图片、{...} 和空白，段里没别的行内东西
      const others = kids.filter((c, i) => i !== imgIdx && i !== clsIdx && !(c.type === 'text' && !c.value.trim()));
      if (cls) {
        img.data = img.data || {};
        img.data.hProperties = img.data.hProperties || {};
        img.data.hProperties.class = cls;
        if (clsIdx !== -1) kids.splice(clsIdx, 1);
      }
      // 下一个兄弟段落若是「单独一句斜体」→ 作为图注并入本段。
      // ⚠️ 不要求先有尺寸类：`![Placeholder](x.webp)` + 下一行 `*图注*` 也是合法图注
      //    （站点里已经有文章这么写）。以前只在写了 {.xxx} 时才合并 ⇒ 那种图注在页面上
      //    只是一条普通斜体段落，还会被「中文斜体 = 宋体」的规则套上。
      // ⚠️ 只认「图片自己占一段」的情形：行内图片后面跟的斜体段落照旧不动它。
      const next = children[i + 1];
      if (
        others.length === 0 &&
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

// 🎼 ABC 乐谱围栏支持：```abc 代码块 → 编译成 .abc-score 占位。
// 源码兜底保留在 <pre class="abc-source"><code> 里（无 JS 时退化为普通代码块；该区域在
// rehype 阶段是 raw html，不会进入智能引号/高亮流程，ABC 文本不会被破坏）；
// 页面脚本见 Layout.astro：检测到 .abc-score 时懒加载 abcjs 就地渲染 SVG，并按主题取色。
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function remarkAbc() {
  return (tree) => {
    const children = tree.children;
    for (let i = 0; i < children.length; i++) {
      const n = children[i];
      if (!n || n.type !== 'code') continue;
      if (n.lang !== 'abc' && n.lang !== 'abcjs') continue;
      const code = escapeHtml(n.value || '');
      children[i] = {
        type: 'html',
        value:
          '<div class="abc-score" data-pagefind-ignore>' +
          '<pre class="abc-source"><code class="language-abc">' + code + '</code></pre></div>',
      };
    }
  };
}

// 🎼 简谱围栏支持：```jianpu 代码块 → .jianpu-score 占位（源码兜底在 <pre class="jianpu-source">）。
// 页面脚本（Layout.astro）检测到 .jianpu-score 时懒加载 simple-notation 渲染。
// 围栏内容约定：可选头部行 title/composer/lyricist/key/beat/time/tempo/lyric:…，其余为谱面文本（如 1,1,5,5|6,6,5,-|…）。
function remarkJianpu() {
  return (tree) => {
    const children = tree.children;
    for (let i = 0; i < children.length; i++) {
      const n = children[i];
      if (!n || n.type !== 'code') continue;
      if (n.lang !== 'jianpu' && n.lang !== 'jp') continue;
      const code = escapeHtml(n.value || '');
      children[i] = {
        type: 'html',
        value:
          '<div class="jianpu-score" data-pagefind-ignore>' +
          '<pre class="jianpu-source"><code class="language-jianpu">' + code + '</code></pre></div>',
      };
    }
  };
}

/**
 * ⚡️ 简谱：simple-notation 把整份 Bravura 以 base64 字面量（417,800 字符 ≈ 306 KB）内嵌在自己的 JS 里
 * （运行时拼成 `url('data:application/x-font-woff;base64,${XX}')` 注入 <style>），这也是它体积的大头
 * （535 KB → 剥掉后只剩 ~117 KB）。
 *
 * 这个插件在打包/开发时把那串 data URI 换成静态文件 URL：
 *   ① JS chunk 少 418 KB（gzip 少 ~312 KB）
 *   ② 字体独立成文件 → 可长缓存，且只有页面真的用到变音记号/休止符时才下载
 * 字体由 scripts/build-bravura-font.mjs 从库内嵌的那份抽出并 subset（6.1 KB，码位/字形与原字体一致）。
 * ⚠️ 同时把那份 base64 字面量清空：dev 模式不做 tree-shaking，不清空等于白忙。
 */
function jianpuBravuraFont() {
  const FONT_URL = '/fonts/Bravura-Symbols.woff2';
  const RE_USE = /data:application\/x-font-woff;base64,\$\{\w+\}/;
  const RE_DEF = /"([A-Za-z0-9+/]{50000,}={0,2})"/;
  return {
    name: 'jianpu-bravura-font-url',
    enforce: 'pre',
    transform(code, id) {
      if (!id.includes('simple-notation') || !code.includes('data:application/x-font-woff')) return null;
      if (!RE_USE.test(code)) {
        console.warn('[jianpu] 没匹配到内嵌 Bravura 的 data URI —— simple-notation 版本可能变了');
        return null;
      }
      return { code: code.replace(RE_USE, FONT_URL).replace(RE_DEF, '""'), map: null };
    },
  };
}

/**
 * 🎼 五线谱/简谱切换：把**紧贴着的**两个乐谱占位（即 ````abc` + ````jianpu` 两个围栏）合成一个可切换组件。
 *
 * 设计取舍（2026-09-13 与作者确认）：
 *   ① **不引入新语法**：还是普普通通的 ````abc` / ````jianpu` 两个围栏 —— 乐理文章里只想用一种记谱法时就单独写一个，照旧单独渲染；
 *   ② **只有「紧贴」才配对**（中间只有空行/空白），中间夹了正文就各算各的 → 语义可预测；
 *   ③ 只配对**一对**：两者记谱法不同才配；连写三个时只配前两个，第三个保持独立；
 *   ④ **源文件里先写的那种就是默认显示的那一种**（作者可控）；
 *   ⑤ **单独一种记谱法也套同一个圆角外框**（`is-single`，没有右上角控件）→ 全文谱面外观统一，
 *      但它不带 data-notation，切换器脚本会直接跳过它（不会误藏）。
 *
 * ⚠️ 必须排在 remarkAbc / remarkJianpu **之后**：那两个已经把 code 节点换成了 html 占位，这里只认它们产出的 div。
 * 产出结构：
 *   <div class="score-switch" data-pagefind-ignore>
 *     <div class="score-switch-tabs" role="group" aria-label="记谱法">…两个按钮…</div>
 *     <div class="abc-score" data-notation="abc">…</div>
 *     <div class="jianpu-score" data-notation="jianpu">…</div>
 *   </div>
 * 两块仍带原来的类名 → 现有两套渲染逻辑与样式直接生效；块间的隐藏/切换由 Layout.astro 的 initScoreSwitches 负责。
 */
const SCORE_PANE_RE = /^<div class="(abc|jianpu)-score"/;
// 🎼 右上角「转换」按钮的图标（作者提供的正式图）。
// ⚠️ 颜色**不能**照抄源图里的 `stroke="#333"` —— 用 currentColor，跟随按钮的 color/hover（和代码块的复制按钮一样）。
// ⚠️ 源图 viewBox 是 48 栅格、原 stroke-width=4（视觉粗细 1/12）；图标固定渲染 14px，
//    要跟旁边复制按钮（24 栅格 / 2.4 = 1/10）看起来一样粗 → 这里用 4.8（≈ 1/10）。嫌粗嫌细就改这一个数。
const SCORE_CONVERT_ICON =
  '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="4.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' +
  '<path d="M42 19H6"/>' +
  '<path d="M30 7 42 19"/>' +
  '<path d="M6.8 29h36"/>' +
  '<path d="M6.8 29 18.8 41"/>' +
  '</svg>';
// 站内双语：en-US 目录下的文章用英文标签（中文页用中文）。
// 工具栏排版照抄代码块的「语言标签 + 复制按钮」→ 这里就是「当前记谱法 + 转换按钮」。
const NOTATION_LABEL = {
  zh: { abc: '五线谱', jianpu: '简谱', group: '记谱法', toAbc: '转换为五线谱', toJianpu: '转换为简谱' },
  en: {
    // 故意不对称：staff 本身就是「五线谱」这个词（配上五线 + 音符毫无歧义）；
    // 而简谱在英语世界少见，光写 Numbered 容易看不出是「记谱法」→ 这侧保留 notation。
    abc: 'Staff',
    jianpu: 'Numbered notation',
    group: 'Notation',
    toAbc: 'Switch to staff notation',
    toJianpu: 'Switch to numbered notation',
  },
};
function remarkScoreSwitch() {
  return (tree, file) => {
    const filePath = String((file && file.path) || '');
    const L = /[\\/]en-US[\\/]/.test(filePath) ? NOTATION_LABEL.en : NOTATION_LABEL.zh;
    const kids = tree.children;
    const out = [];
    for (let i = 0; i < kids.length; i++) {
      const a = kids[i];
      const b = kids[i + 1];
      const ak = a && a.type === 'html' && a.value ? SCORE_PANE_RE.exec(a.value) : null;
      const bk = b && b.type === 'html' && b.value ? SCORE_PANE_RE.exec(b.value) : null;
      if (ak && bk && ak[1] !== bk[1]) {
        const first = ak[1];
        const other = first === 'abc' ? 'jianpu' : 'abc';
        const toLabel = (kind) => (kind === 'abc' ? L.toAbc : L.toJianpu);
        // 非默认的那块在**静态 HTML 里就带上 hidden**：没 JS 时也不会两块一起显示（JS 接手后会自己管）
        const pane = (kind, value) =>
          value.replace(
            SCORE_PANE_RE,
            '<div class="$1-score" data-notation="' +
              kind +
              '" data-label="' +
              L[kind] +
              '"' +
              (kind === first ? '' : ' hidden') +
              '>'
          );
        out.push({
          type: 'html',
          value:
            '<div class="score-switch" data-pagefind-ignore>' +
            '<div class="score-toolbar" role="group" aria-label="' +
            L.group +
            '">' +
            '<span class="score-lang" data-score-lang>' +
            '<span data-lang-for="abc" data-active="' +
            (first === 'abc' ? 'true' : 'false') +
            '"' +
            (first === 'abc' ? '' : ' aria-hidden="true"') +
            '>' +
            L.abc +
            '</span>' +
            '<span data-lang-for="jianpu" data-active="' +
            (first === 'jianpu' ? 'true' : 'false') +
            '"' +
            (first === 'jianpu' ? '' : ' aria-hidden="true"') +
            '>' +
            L.jianpu +
            '</span>' +
            '</span>' +
            '<button type="button" class="score-convert-btn" data-score-convert' +
            ' data-label-abc="' +
            L.toAbc +
            '" data-label-jianpu="' +
            L.toJianpu +
            '" aria-label="' +
            toLabel(other) +
            '">' +
            SCORE_CONVERT_ICON +
            '</button>' +
            '</div>' +
            pane(ak[1], a.value) +
            pane(bk[1], b.value) +
            '</div>',
        });
        i++; // 跳过 b
        continue;
      }
      // 单独一种记谱法：也套同样的圆角外框 + 右上角**同样形式**的标签条，
      // 只是没有转换按钮（只有一种记谱法，没得转换）→ 高度用 CSS 的 min-height 跟按钮对齐
      out.push(
        ak
          ? {
              type: 'html',
              value:
                '<div class="score-switch is-single">' +
                '<div class="score-toolbar">' +
                '<span class="score-lang"><span data-lang-for="' +
                ak[1] +
                '" data-active="true">' +
                L[ak[1]] +
                '</span></span>' +
                '</div>' +
                a.value +
                '</div>',
            }
          : a
      );
    }
    tree.children = out;
  };
}

// ⚡️ 本地博客编辑器（/admin）—— 两半，都只在 dev 下存在：
//   ① blogEditor()：给 Astro 注入 /admin 路由（生产构建里没有这个页面）；
//   ② blogEditorApi()：给 Vite dev server 挂一个文件读写接口（apply:'serve' ⇒ 构建时根本不加载），
//      数据层复用 scripts/lib/post-io.mjs，与 CLI 脚本同一套读写/校验逻辑。
//    设计语言直接复用 main.css 的 token ⇒ 界面跟站点一致；预览用 iframe 指向真实文章页 ⇒ 自定义语法全部保真。
function blogEditor() {
  return {
    name: 'blog-editor',
    hooks: {
      'astro:config:setup': ({ command, injectRoute }) => {
        if (command !== 'dev') return;
        injectRoute({ pattern: '/admin', entryPoint: './src/editor/index.astro' });
        injectRoute({ pattern: '/admin/roundtrip', entryPoint: './src/editor/roundtrip.astro' });
      },
    },
  };
}

function blogEditorApi() {
  const readBody = (req) =>
    new Promise((resolve, reject) => {
      let raw = '';
      req.on('data', (c) => {
        raw += c;
        if (raw.length > 8 * 1024 * 1024) reject(new Error('请求体过大'));
      });
      req.on('end', () => {
        try { resolve(raw ? JSON.parse(raw) : {}); } catch (e) { reject(new Error('JSON 解析失败：' + e.message)); }
      });
      req.on('error', reject);
    });

  // 图片上传走**原始二进制**（不裹 JSON/base64，省掉 33% 膨胀）
  const readBinary = (req, limit = 16 * 1024 * 1024) =>
    new Promise((resolve, reject) => {
      const chunks = [];
      let size = 0;
      req.on('data', (c) => {
        size += c.length;
        if (size > limit) {
          reject(new Error('图片太大（上限 ' + Math.round(limit / 1024 / 1024) + ' MB）'));
          req.destroy();
          return;
        }
        chunks.push(c);
      });
      req.on('end', () => resolve(Buffer.concat(chunks)));
      req.on('error', reject);
    });

  // 白名单：只允许跑这两个脚本（编辑器里「发布」按钮用的），**不**做成通用命令执行器
  const TASKS = {
    pub: 'scripts/publish.mjs',
  };

  // 跑一个脚本并把 stdout/stderr 合在一起回给编辑器（发布要几十秒，就让它等着）
  const runTask = async (task) => {
    const entry = TASKS[task];
    if (!entry) return { code: -1, output: '未知任务：' + task };
    const { spawn } = await import('node:child_process');
    return new Promise((resolve) => {
      const child = spawn(process.execPath, [entry], { cwd: process.cwd(), env: { ...process.env, NO_COLOR: '1' } });
      let out = '';
      const onData = (c) => {
        out += c.toString();
        if (out.length > 200000) out = out.slice(-200000); // 只留尾部，别把内存撑爆
      };
      child.stdout.on('data', onData);
      child.stderr.on('data', onData);
      child.on('close', (code) => resolve({ code: code ?? 0, output: out.trim() || '（没有任何输出）' }));
      child.on('error', (err) => resolve({ code: -1, output: String(err.message) }));
    });
  };

  return {
    name: 'blog-editor-api',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__editor/api', async (req, res) => {
        const send = (code, data) => {
          res.statusCode = code;
          res.setHeader('content-type', 'application/json; charset=utf-8');
          res.setHeader('cache-control', 'no-store');
          res.end(JSON.stringify(data));
        };
        try {
          const io = await import('./scripts/lib/post-io.mjs');
          const url = new URL(req.url || '/', 'http://localhost');
          const route = url.pathname.replace(/\/+$/, '') || '/';
          if (req.method === 'GET' && route === '/posts') return send(200, io.listPosts());
          if (req.method === 'GET' && route === '/post') {
            const p = url.searchParams.get('path');
            if (!p) return send(400, { error: '缺少 path 参数' });
            return send(200, io.readPost(p));
          }
          if (req.method === 'PUT' && route === '/post') {
            const body = await readBody(req);
            // 两种写法：直接给整份 content，或分开给 frontmatter + body（由 Node 侧按固定字段顺序拼回）
            const content =
              typeof body.content === 'string'
                ? body.content
                : io.serializeFrontmatter(body.frontmatter || {}) + '\n' + String(body.body ?? '');
            return send(200, io.writePost(body.path, content));
          }
          if (req.method === 'POST' && route === '/post') {
            const body = await readBody(req);
            return send(200, io.createPost(body.path, body.content, !!body.overwrite));
          }
          // 图片上传：body = 原始二进制，文件名（含扩展名）走查询参数 `name`
          if (req.method === 'POST' && route === '/image') {
            const buf = await readBinary(req);
            return send(200, io.saveImage(url.searchParams.get('name'), buf));
          }
          // 新建文章：中文 + en-US 两份一起建（模板/命名在 scripts/lib/post-io.mjs 的 newPostBlueprint）
          if (req.method === 'POST' && route === '/new-post') {
            const body = await readBody(req);
            return send(200, { files: io.createNewPost(body, !!body.overwrite) });
          }
          // 跑白名单里的脚本（发布）
          if (req.method === 'POST' && route === '/run') {
            const body = await readBody(req);
            return send(200, await runTask(String(body.task || '')));
          }
          return send(404, { error: '未知接口：' + req.method + ' ' + route });
        } catch (err) {
          send(500, { error: String((err && err.message) || err) });
        }
      });
    },
  };
}

export default defineConfig({
  site: 'https://blog.ethan929.com',
  markdown: {
    remarkPlugins: [remarkFigure, remarkEmbed, remarkAbc, remarkJianpu, remarkScoreSwitch, remarkMath], // ⚡️ 图片尺寸/图注 + 视频短代码 + ABC 五线谱 + 简谱 + 「紧贴的两种记谱法合成切换器」+ 识别 $ $$ 语法
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
    plugins: [jianpuBravuraFont(), blogEditorApi()],
    optimizeDeps: {
      // ⚡️ 简谱库必须走普通 transform（见上面 jianpuBravuraFont），不能被 esbuild 预打包绕过
      exclude: ['simple-notation'],
    },
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
    blogEditor(),
  ],
  server: {
    host: true
  }
});