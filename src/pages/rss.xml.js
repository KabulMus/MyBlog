import rss from '@astrojs/rss';

// RSS 订阅：列出全部非草稿文章（中英双语都包含，各自链接到对应 URL）
export async function GET(context) {
  const cnPosts = Object.values(import.meta.glob('./blog/*.md', { eager: true }));
  const enPosts = Object.values(import.meta.glob('./blog/en-US/*.md', { eager: true }));

  const posts = [...cnPosts, ...enPosts]
    .filter((p) => p.frontmatter && !p.frontmatter.draft)
    .sort((a, b) => new Date(b.frontmatter.date) - new Date(a.frontmatter.date));

  return rss({
    title: "Ethan's Blog",
    description: 'Ethan 的博客 — 音乐、创作、随笔与成就 / Music, creation, essays & achievements.',
    site: context.site,
    items: posts.map((post) => ({
      title: post.frontmatter.title,
      pubDate: new Date(post.frontmatter.date),
      description: post.frontmatter.description || '',
      link: post.url,
    })),
  });
}
