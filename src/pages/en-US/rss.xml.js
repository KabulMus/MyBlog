import rss from '@astrojs/rss';
import { titleToText } from '../../lib/posts';

// 英文 RSS：/en-US/rss.xml（只含英文文章）
export async function GET(context) {
  // One full feed: rants are in a subfolder, so they need their own glob
  const posts = [
    ...Object.values(import.meta.glob('../blog/en-US/*.md', { eager: true })),
    ...Object.values(import.meta.glob('../blog/en-US/rants/*.md', { eager: true })),
  ]
    .filter((p) => p.frontmatter && !p.frontmatter.draft)
    .sort((a, b) => new Date(b.frontmatter.date) - new Date(a.frontmatter.date));

  return rss({
    title: "Ethan's Blog (EN)",
    description: "Ethan's blog—music, creation, essays & achievements.",
    site: context.site,
    items: posts.map((post) => ({
      // RSS 只吃纯文本：标题里的行内标记（<i> 等）要剥掉，否则阅读器会显示字面标签
      title: titleToText(post.frontmatter.title) || String(post.frontmatter.date || '').slice(0, 10),
      pubDate: new Date(post.frontmatter.date),
      description: post.frontmatter.description || '',
      link: post.url,
    })),
  });
}
