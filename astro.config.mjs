import { defineConfig } from 'astro/config';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

export default defineConfig({
  markdown: {
    remarkPlugins: [remarkMath], // ⚡️ 负责在 Markdown 编译阶段识别 $ 和 $$ 语法
    rehypePlugins: [rehypeKatex], // ⚡️ 负责把识别出的公式转换成高精度的 HTML/CSS 语义标签
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
  }
});