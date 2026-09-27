import rss from '@astrojs/rss';

// 中文 RSS：/rss.xml（只含中文文章）
export async function GET(context) {
  // 一份全量订阅：成篇的和吐槽都在里面（rants/ 在子目录，得单独 glob）
  const posts = [
    ...Object.values(import.meta.glob('./blog/*.md', { eager: true })),
    ...Object.values(import.meta.glob('./blog/rants/*.md', { eager: true })),
  ]
    .filter((p) => p.frontmatter && !p.frontmatter.draft)
    .sort((a, b) => new Date(b.frontmatter.date) - new Date(a.frontmatter.date));

  return rss({
    title: "Ethan's Blog",
    description: 'Ethan 的博客—音乐、创作、随笔与成就。',
    site: context.site,
    items: posts.map((post) => ({
      title: post.frontmatter.title || String(post.frontmatter.date || '').slice(0, 10),
      pubDate: new Date(post.frontmatter.date),
      description: post.frontmatter.description || '',
      link: post.url,
    })),
  });
}
