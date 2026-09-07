import fs from "fs";
import path from "path";
import matter from "gray-matter";
import readingTime from "reading-time";
import { learningTopics } from "@/lib/site";

const postsDirectory = path.join(process.cwd(), "content", "blog");

export type PostMeta = {
  slug: string;
  title: string;
  description: string;
  date: string;
  updated?: string;
  tags: string[];
  category?: string;
  readingTime: string;
};

export type PostFaq = {
  q: string;
  a: string;
};

export type Post = PostMeta & {
  content: string;
  related?: string[];
  faq?: PostFaq[];
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
    updated: data.updated ? String(data.updated) : undefined,
    tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
    category: data.category ? String(data.category) : undefined,
    readingTime: stats.text,
    related: Array.isArray(data.related) ? data.related.map(String) : undefined,
    faq: readFaq(data.faq),
    content,
  };
}

function readFaq(value: unknown): PostFaq[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const record = entry as { q?: unknown; a?: unknown };
    const q = String(record.q ?? "").trim();
    const a = String(record.a ?? "").trim();
    return q && a ? [{ q, a }] : [];
  });
  return items.length > 0 ? items : undefined;
}

export function getAllPosts(): PostMeta[] {
  return getPostSlugs()
    .flatMap((slug) => {
      try {
        const post = getPostBySlug(slug);
        return [
          {
            slug: post.slug,
            title: post.title,
            description: post.description,
            date: post.date,
            updated: post.updated,
            tags: post.tags,
            category: post.category,
            readingTime: post.readingTime,
          },
        ];
      } catch {
        return [];
      }
    })
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

export function getPostsByCategory(category: string): PostMeta[] {
  return getAllPosts().filter((post) => post.category === category);
}

const hubSlugs = new Set(learningTopics.map((topic) => topic.slug));

/**
 * Posts for a topic hub: category first. Tags may add a post only when it is
 * not already owned by a different hub (so JWT on middleware does not land
 * on Auth, and Architecture on an EF post does not land on Architecture).
 * categoryOnly hubs skip tag matching. Explicit pinSlugs can still cross hubs.
 */
export function getPostsForTopic(topic: {
  slug: string;
  matchTags: readonly string[];
  pinSlugs?: readonly string[];
  categoryOnly?: boolean;
}): PostMeta[] {
  const tagSet = new Set(topic.matchTags.map((tag) => tag.toLowerCase()));
  const all = getAllPosts();

  const posts = all.filter((post) => {
    if (post.category === topic.slug) return true;
    if (topic.categoryOnly) return false;
    const byTag = post.tags.some((tag) => tagSet.has(tag.toLowerCase()));
    if (!byTag) return false;
    const ownedByOtherHub = Boolean(
      post.category && hubSlugs.has(post.category) && post.category !== topic.slug,
    );
    return !ownedByOtherHub;
  });

  const pinSlugs = topic.pinSlugs ?? [];
  if (pinSlugs.length === 0) return posts;

  const bySlug = new Map(all.map((post) => [post.slug, post]));
  const pinned = pinSlugs
    .map((slug) => bySlug.get(slug))
    .filter((post): post is PostMeta => Boolean(post));
  const pinnedSet = new Set(pinned.map((post) => post.slug));
  const rest = posts.filter((post) => !pinnedSet.has(post.slug));
  return [...pinned, ...rest];
}

export function getRelatedPosts(slug: string, limit = 5): PostMeta[] {
  const current = getPostBySlug(slug);
  const others = getAllPosts().filter((post) => post.slug !== slug);
  const bySlug = new Map(others.map((post) => [post.slug, post]));
  const pinned = (current.related ?? [])
    .map((relatedSlug) => bySlug.get(relatedSlug))
    .filter((post): post is PostMeta => Boolean(post));
  const pinnedSet = new Set(pinned.map((post) => post.slug));
  const remaining = others.filter((post) => !pinnedSet.has(post.slug));

  const scored = remaining.map((post) => {
    const sharedTags = post.tags.filter((tag) => current.tags.includes(tag)).length;
    let score = sharedTags * 4;
    if (sharedTags > 0 && current.category && post.category === current.category) {
      score += 2;
    }
    return { post, score };
  });

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.post.date < b.post.date ? 1 : -1;
  });

  const related = scored.filter((item) => item.score > 0).map((item) => item.post);
  const fillers = remaining.filter(
    (post) => !related.some((item) => item.slug === post.slug),
  );

  return [...pinned, ...related, ...fillers].slice(0, limit);
}

/**
 * Homepage mix: pages that already earn Search Console impressions, then the
 * newest unique posts. Keeps the click-winning interview URL above a same-week dump.
 */
/** Pages that already earn Search Console impressions — pin these above newest dumps. */
export const searchWinnerSlugs = [
  "csharp-async-await-interview-questions",
  "identityserver-vs-aspnet-identity",
  "aspnet-core-appsettings-localappsettings",
] as const;

export function getHomepagePosts(limit = 4): PostMeta[] {
  const all = getAllPosts();
  const featured = searchWinnerSlugs
    .map((slug) => all.find((post) => post.slug === slug))
    .filter((post): post is PostMeta => Boolean(post));
  const featuredSet = new Set<string>(searchWinnerSlugs);
  const rest = all.filter((post) => !featuredSet.has(post.slug));
  return [...featured, ...rest].slice(0, limit);
}
