/**
 * Pagefind 中文 unigram（按单字）索引预处理脚本
 *
 * 背景：Pagefind 内置的中文分词是"词"粒度（如「阿拉伯」→「阿拉」「伯」「数字」），
 * 导致搜「阿」「拉」「阿拉伯」都匹配不到，只有恰好是独立词的「伯」能命中；
 * 且不加引号时按"首字前缀"匹配，搜「中国」会误命中「中日韩」。
 *
 * 方案：在 Pagefind 建索引前，把 HTML 文本中相邻汉字之间插入空格，
 * 让 Pagefind 把每个汉字当作独立 token（unigram）。配合 UI 端 processTerm
 * 给中文查询加引号做精确短语匹配，即可实现：
 *   - 搜「阿」→ 命中含「阿拉伯」的文章
 *   - 搜「阿拉伯」→ 精确命中含「阿拉伯」的文章
 *   - 搜「中国」→ 不再误命中「中日韩」
 *
 * 本脚本在临时目录操作，最终部署的 dist 里的 HTML 保持原始无空格。
 */
import { cpSync, rmSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

const DIST = 'dist';
const TMP = '.pagefind-src';

// 1. 清空并复制 dist（排除旧的 pagefind 索引目录）
rmSync(TMP, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });
cpSync(DIST, TMP, { recursive: true });
rmSync(join(TMP, 'pagefind'), { recursive: true, force: true });

// 2. 收集所有 HTML 文件
const htmlFiles = [];
function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) walk(p);
    else if (entry.name.endsWith('.html')) htmlFiles.push(p);
  }
}
walk(TMP);

// 3. 只在标签之间的文本内容里，给相邻汉字之间插入空格
//    （跳过 <script> 与 <style> 块，避免改动其内容）
function insertHanSpaces(html) {
  // 跳过 <script> 与 <style> 块，只处理标签之间的文本；
  // 相邻汉字之间插入零宽空格 U+200B（阿\u200b拉\u200b伯），
  // 让 Pagefind 按单字索引，同时显示上不可见（无多余空格）
  const HAN = /([\u4e00-\u9fff\u3400-\u4dbf])(?=[\u4e00-\u9fff\u3400-\u4dbf])/g;
  return html.replace(
    /(<script\b[\s\S]*?<\/script\s*>|<style\b[\s\S]*?<\/style\s*>)|(>([^<]*)<)/g,
    (m, skip, seg, text) => {
      if (skip) return skip;
      if (seg) return '>' + text.replace(HAN, '$1\u200b') + '<';
      return m;
    }
  );
}

for (const file of htmlFiles) {
  const html = readFileSync(file, 'utf8');
  writeFileSync(file, insertHanSpaces(html));
}

// 验证：插入是否真实生效（用码点构造字符，避免字面量编码问题）
const sample = htmlFiles.find((f) => f.includes('test-all') && !f.includes('en-US'));
if (sample) {
  const t = readFileSync(sample, 'utf8');
  const A = String.fromCodePoint(0x963f); // 阿
  console.log('[diagnose] has 阿+空格 in processed HTML:', t.includes(A + ' '));
}

// 4. 用 Pagefind CLI（Extended 版本，支持多语言）建 unigram 索引，直接输出到 dist/pagefind
execSync('npx pagefind --site ' + TMP + ' --output-path ' + join(DIST, 'pagefind'), { stdio: 'inherit' });

// 5. 清理临时目录
rmSync(TMP, { recursive: true, force: true });

console.log('✓ Pagefind unigram 中文索引已生成（' + htmlFiles.length + ' 个 HTML）');
