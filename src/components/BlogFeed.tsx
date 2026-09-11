"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { PostDate } from "@/components/PostDate";
import type { PostMeta } from "@/lib/posts";

export function BlogFeed({ posts }: { posts: PostMeta[] }) {
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState("");

  const tags = useMemo(
    () => [...new Set(posts.flatMap((post) => post.tags))].sort((a, b) => a.localeCompare(b)),
    [posts],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return posts.filter((post) => {
      const matchesTag = tag ? post.tags.some((item) => item === tag) : true;
      const matchesQuery = q
        ? `${post.title} ${post.description} ${post.tags.join(" ")}`.toLowerCase().includes(q)
        : true;
      return matchesTag && matchesQuery;
    });
  }, [posts, query, tag]);

  return (
    <div className="section-stack">
      <div className="grid gap-3 sm:grid-cols-[1fr_16rem]">
        <label className="block text-sm font-medium text-ink">
          Search
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search titles and summaries"
            className="field"
          />
        </label>
        <label className="block text-sm font-medium text-ink">
          Tag
          <select
            value={tag}
            onChange={(event) => setTag(event.target.value)}
            className="field"
          >
            <option value="">All tags</option>
            {tags.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
      </div>

      <h2 className="heading-section mt-2">
        {query || tag ? "Matching articles" : "All articles"}
      </h2>
      <p className="mt-2 text-sm text-muted">
        {filtered.length} article{filtered.length === 1 ? "" : "s"}
      </p>

      <div className="mt-6 divide-y divide-slate-line border-y border-slate-line">
        {filtered.length === 0 ? (
          <p className="py-10 text-muted">No articles match that filter.</p>
        ) : (
          filtered.map((post) => (
            <article key={post.slug} className="py-5 sm:py-6">
              <PostDate date={post.date} updated={post.updated} readingTime={post.readingTime} />
              <h3 className="heading-subsection mt-2">
                <Link href={`/blog/${post.slug}`} className="hover:text-link">
                  {post.title}
                </Link>
              </h3>
              <p className="mt-3 max-w-2xl text-muted">{post.description}</p>
              <ul className="mt-4 flex flex-wrap gap-2">
                {post.tags.map((item) => (
                  <li
                    key={item}
                    className="rounded border border-slate-line bg-mist px-2.5 py-1 font-mono text-xs text-ink-soft"
                  >
                    {item}
                  </li>
                ))}
              </ul>
            </article>
          ))
        )}
      </div>
    </div>
  );
}
