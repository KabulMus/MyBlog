import { defineConfig } from 'astro/config';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

export default defineConfig({
  markdown: {
    remarkPlugins: [remarkMath], // ⚡️ 负责在 Markdown 编译阶段识别 $ 和 $$ 语法
    rehypePlugins: [rehypeKatex], // ⚡️ 负责把识别出的公式转换成高精度的 HTML/CSS 语义标签
  },
});