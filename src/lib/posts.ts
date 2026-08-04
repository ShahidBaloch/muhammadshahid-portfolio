import fs from "fs";
import path from "path";
import matter from "gray-matter";
import readingTime from "reading-time";

const postsDirectory = path.join(process.cwd(), "content", "blog");

export type PostMeta = {
  slug: string;
  title: string;
  description: string;
  date: string;
  tags: string[];
  category?: string;
  readingTime: string;
};

export type Post = PostMeta & {
  content: string;
};

function ensurePostsDirectory(): void {
  if (!fs.existsSync(postsDirectory)) {
    fs.mkdirSync(postsDirectory, { recursive: true });
  }
}

export function getPostSlugs(): string[] {
  ensurePostsDirectory();
  return fs
    .readdirSync(postsDirectory)
    .filter((file) => file.endsWith(".md") || file.endsWith(".mdx"))
    .map((file) => file.replace(/\.mdx?$/, ""));
}

export function getPostBySlug(slug: string): Post {
  const mdPath = path.join(postsDirectory, `${slug}.md`);
  const mdxPath = path.join(postsDirectory, `${slug}.mdx`);
  const fullPath = fs.existsSync(mdPath) ? mdPath : mdxPath;
  const fileContents = fs.readFileSync(fullPath, "utf8");
  const { data, content } = matter(fileContents);
  const stats = readingTime(content);

  return {
    slug,
    title: String(data.title ?? slug),
    description: String(data.description ?? ""),
    date: String(data.date ?? ""),
    tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
    category: data.category ? String(data.category) : undefined,
    readingTime: stats.text,
    content,
  };
}

export function getAllPosts(): PostMeta[] {
  return getPostSlugs()
    .map((slug) => {
      const post = getPostBySlug(slug);
      return {
        slug: post.slug,
        title: post.title,
        description: post.description,
        date: post.date,
        tags: post.tags,
        category: post.category,
        readingTime: post.readingTime,
      };
    })
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

export function getPostsByCategory(category: string): PostMeta[] {
  return getAllPosts().filter((post) => post.category === category);
}

/** Posts for a topic hub: matching category or matching topic tags. */
export function getPostsForTopic(topic: {
  slug: string;
  matchTags: readonly string[];
}): PostMeta[] {
  const tagSet = new Set(topic.matchTags.map((tag) => tag.toLowerCase()));
  const seen = new Set<string>();

  return getAllPosts().filter((post) => {
    const byCategory = post.category === topic.slug;
    const byTag = post.tags.some((tag) => tagSet.has(tag.toLowerCase()));
    if (!byCategory && !byTag) return false;
    if (seen.has(post.slug)) return false;
    seen.add(post.slug);
    return true;
  });
}

export function getRelatedPosts(slug: string, limit = 3): PostMeta[] {
  const current = getPostBySlug(slug);
  const others = getAllPosts().filter((post) => post.slug !== slug);

  const scored = others.map((post) => {
    let score = 0;
    if (current.category && post.category === current.category) {
      score += 5;
    }
    const sharedTags = post.tags.filter((tag) => current.tags.includes(tag)).length;
    score += sharedTags * 2;
    return { post, score };
  });

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.post.date < b.post.date ? 1 : -1;
  });

  const related = scored.filter((item) => item.score > 0).slice(0, limit).map((item) => item.post);
  if (related.length >= limit) {
    return related;
  }

  const fillers = others
    .filter((post) => !related.some((item) => item.slug === post.slug))
    .slice(0, limit - related.length);

  return [...related, ...fillers];
}
