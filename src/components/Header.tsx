"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { learningTopics, navLinks } from "@/lib/site";

export function Header() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [blogOpen, setBlogOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const blogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    setOpen(false);
    setBlogOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!blogOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (blogRef.current && !blogRef.current.contains(event.target as Node)) {
        setBlogOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [blogOpen]);

  const blogActive =
    pathname === "/blog" ||
    pathname.startsWith("/blog/") ||
    pathname === "/learning" ||
    pathname.startsWith("/learning/");

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition duration-300 ${
        scrolled || open
          ? "border-b border-slate-line/80 bg-paper/90 backdrop-blur-md"
          : "bg-transparent"
      }`}
    >
      <div className="container-narrow flex items-center justify-between gap-4 px-5 py-4 sm:px-8 lg:px-12">
        <Link
          href="/"
          className="flex items-center gap-2.5 font-display text-base font-semibold tracking-tight text-ink transition hover:text-teal sm:text-lg"
        >
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-teal text-xs font-bold text-white">
            MS
          </span>
          Muhammad Shahid
        </Link>

        <nav className="hidden items-center gap-5 xl:gap-6 lg:flex" aria-label="Primary">
          {navLinks.map((link) => {
            if (link.href === "/blog") {
              return (
                <div key={link.href} className="relative" ref={blogRef}>
                  <button
                    type="button"
                    className={`relative inline-flex items-center gap-1 text-sm transition after:absolute after:-bottom-1 after:left-0 after:h-0.5 after:w-0 after:bg-teal after:transition-all hover:text-teal hover:after:w-full ${
                      blogActive ? "text-teal after:w-full" : "text-muted"
                    }`}
                    aria-expanded={blogOpen}
                    aria-haspopup="menu"
                    onClick={() => setBlogOpen((value) => !value)}
                  >
                    {link.label}
                    <span aria-hidden className="text-[10px]">
                      ▾
                    </span>
                  </button>
                  {blogOpen ? (
                    <div role="menu" className="absolute left-0 top-full z-50 pt-2">
                      <div className="min-w-[230px] rounded-xl border border-slate-line bg-paper py-2 shadow-lg">
                        <Link
                          href="/blog"
                          role="menuitem"
                          className="block px-4 py-2.5 text-sm text-ink-soft hover:bg-mist hover:text-teal"
                          onClick={() => setBlogOpen(false)}
                        >
                          All articles
                        </Link>
                        <div className="my-1 border-t border-slate-line" />
                        <p className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
                          Topics
                        </p>
                        {learningTopics.map((topic) => (
                          <Link
                            key={topic.slug}
                            href={`/learning/${topic.slug}`}
                            role="menuitem"
                            className="block px-4 py-2.5 text-sm text-ink-soft hover:bg-mist hover:text-teal"
                            onClick={() => setBlogOpen(false)}
                          >
                            {topic.label}
                          </Link>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            }

            const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`relative text-sm transition after:absolute after:-bottom-1 after:left-0 after:h-0.5 after:w-0 after:bg-teal after:transition-all hover:text-teal hover:after:w-full ${
                  active ? "text-teal after:w-full" : "text-muted"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
          <Link href="/contact" className="btn-secondary !py-2 !text-xs">
            Hire me
          </Link>
        </nav>

        <button
          type="button"
          className="rounded-lg border border-slate-line px-3 py-2 text-sm font-semibold text-ink lg:hidden"
          aria-expanded={open}
          aria-controls="mobile-nav"
          onClick={() => setOpen((value) => !value)}
        >
          {open ? "Close" : "Menu"}
        </button>
      </div>

      {open ? (
        <div id="mobile-nav" className="border-t border-slate-line bg-paper px-5 py-4 lg:hidden">
          <nav className="flex flex-col gap-3" aria-label="Mobile">
            {navLinks.map((link) => {
              if (link.href === "/blog") {
                return (
                  <div key={link.href} className="flex flex-col gap-2">
                    <Link href="/blog" className="py-1 text-base font-medium text-ink-soft hover:text-teal">
                      {link.label}
                    </Link>
                    <div className="ml-3 flex flex-col gap-1 border-l border-slate-line pl-3">
                      {learningTopics.map((topic) => (
                        <Link
                          key={topic.slug}
                          href={`/learning/${topic.slug}`}
                          className="py-1 text-sm text-muted hover:text-teal"
                        >
                          {topic.label}
                        </Link>
                      ))}
                    </div>
                  </div>
                );
              }

              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className="py-1 text-base font-medium text-ink-soft hover:text-teal"
                >
                  {link.label}
                </Link>
              );
            })}
            <Link href="/contact" className="btn-primary mt-2 w-full">
              Hire me
            </Link>
          </nav>
        </div>
      ) : null}
    </header>
  );
}
