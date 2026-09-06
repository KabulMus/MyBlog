import rss from '@astrojs/rss';

// 中文 RSS：/rss.xml（只含中文文章）
export async function GET(context) {
  const posts = Object.values(import.meta.glob('./blog/*.md', { eager: true }))
    .filter((p) => p.frontmatter && !p.frontmatter.draft)
    .sort((a, b) => new Date(b.frontmatter.date) - new Date(a.frontmatter.date));

  return rss({
    title: "Ethan's Blog",
    description: 'Ethan 的博客—音乐、创作、随笔与成就。',
    site: context.site,
    items: posts.map((post) => ({
      title: post.frontmatter.title,
      pubDate: new Date(post.frontmatter.date),
      description: post.frontmatter.description || '',
      link: post.url,
    })),
  });
}
