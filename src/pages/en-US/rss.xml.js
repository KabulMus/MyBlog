import rss from '@astrojs/rss';

// 英文 RSS：/en-US/rss.xml（只含英文文章）
export async function GET(context) {
  const posts = Object.values(import.meta.glob('../blog/en-US/*.md', { eager: true }))
    .filter((p) => p.frontmatter && !p.frontmatter.draft)
    .sort((a, b) => new Date(b.frontmatter.date) - new Date(a.frontmatter.date));

  return rss({
    title: "Ethan's Blog (EN)",
    description: "Ethan's blog — music, creation, essays & achievements.",
    site: context.site,
    items: posts.map((post) => ({
      title: post.frontmatter.title,
      pubDate: new Date(post.frontmatter.date),
      description: post.frontmatter.description || '',
      link: post.url,
    })),
  });
}
