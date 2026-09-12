"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { BrandMark } from "@/components/BrandMark";
import { learningTopics, navLinks, siteConfig } from "@/lib/site";

export function Header() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [blogOpen, setBlogOpen] = useState(false);
  const [topicsOpen, setTopicsOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const blogRef = useRef<HTMLDivElement>(null);
  const mobileRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    setOpen(false);
    setBlogOpen(false);
    setTopicsOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!blogOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (blogRef.current && !blogRef.current.contains(event.target as Node)) {
        setBlogOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setBlogOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [blogOpen]);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const panel = mobileRef.current;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const focusables = () =>
      panel
        ? Array.from(
            panel.querySelectorAll<HTMLElement>(
              'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
            ),
          )
        : [];

    focusables()[0]?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        menuButtonRef.current?.focus();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };

    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKey);
      previouslyFocused?.focus();
    };
  }, [open]);

  const onBlog = pathname === "/blog" || pathname.startsWith("/blog/");
  const blogCluster =
    onBlog || pathname === "/learning" || pathname.startsWith("/learning/");

  return (
    <>
      {open ? (
        <button
          type="button"
          className="fixed inset-0 z-[55] bg-navy/60 lg:hidden"
          aria-label="Close menu"
          tabIndex={-1}
          onClick={() => setOpen(false)}
        />
      ) : null}
      <header
        className={`fixed inset-x-0 top-0 z-[60] h-[calc(3.5rem+env(safe-area-inset-top))] overflow-visible pt-[env(safe-area-inset-top)] transition duration-300 sm:h-[calc(4rem+env(safe-area-inset-top))] ${
          scrolled || open
            ? "border-b border-slate-line/80 bg-paper/95 backdrop-blur-md"
            : "bg-transparent"
        }`}
      >
      <div className="container-narrow flex h-14 items-center justify-between gap-3 px-4 sm:h-16 sm:gap-4 sm:px-8 lg:px-12">
        <Link
          href="/"
          aria-label="Muhammad Shahid, home"
          className="group flex min-w-0 items-center gap-2 font-display text-[0.95rem] font-semibold tracking-tight text-ink transition hover:text-link sm:gap-2.5 sm:text-lg"
        >
          <BrandMark size="sm" />
          <span className="truncate">Muhammad Shahid</span>
        </Link>

        <nav className="hidden items-center gap-5 xl:gap-6 lg:flex" aria-label="Primary">
          {navLinks.map((link) => {
              if (link.href === "/blog") {
              return (
                <div key={link.href} className="relative flex items-center" ref={blogRef}>
                  <Link
                    href="/blog"
                    className={`nav-link hover:text-link ${
                      blogCluster ? "nav-link-active" : "text-ink-soft"
                    }`}
                    aria-current={onBlog ? "page" : undefined}
                  >
                    {link.label}
                  </Link>
                  <button
                    type="button"
                    className={`nav-link px-1 hover:text-link ${
                      blogCluster ? "text-teal" : "text-ink-soft"
                    }`}
                    aria-expanded={blogOpen}
                    aria-haspopup="menu"
                    aria-controls="blog-menu"
                    aria-label="Blog topics"
                    onClick={() => setBlogOpen((value) => !value)}
                  >
                    <span aria-hidden className="text-[10px]">
                      ▾
                    </span>
                  </button>
                  {blogOpen ? (
                    <div id="blog-menu" role="menu" className="absolute left-0 top-full z-50 pt-2">
                      <div className="max-h-[min(24rem,70vh)] min-w-[230px] overflow-y-auto overscroll-contain rounded-xl border border-slate-line bg-surface-2 py-2 shadow-[0_12px_32px_rgba(15,23,42,0.12)]">
                        <Link
                          href="/blog"
                          role="menuitem"
                          className="block px-4 py-2.5 text-sm text-ink-soft hover:bg-paper hover:text-link"
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
                            className="block px-4 py-2.5 text-sm text-ink-soft hover:bg-paper hover:text-link"
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
                aria-current={active ? "page" : undefined}
                className={`nav-link hover:text-link ${
                  active ? "nav-link-active" : "text-ink-soft"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
          <Link href="/contact" className="btn-primary ml-2 !px-4 !py-2 !text-xs">
            {siteConfig.inquiryCta}
          </Link>
        </nav>

        <button
          ref={menuButtonRef}
          type="button"
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-slate-line bg-mist text-ink lg:hidden"
          aria-expanded={open}
          aria-controls="mobile-nav"
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen((value) => !value)}
        >
          <span className="sr-only">{open ? "Close menu" : "Open menu"}</span>
          <span className="relative block h-3.5 w-4" aria-hidden>
            <span
              className={`absolute left-0 block h-0.5 w-4 bg-ink transition ${
                open ? "top-1.5 rotate-45" : "top-0"
              }`}
            />
            <span
              className={`absolute left-0 top-1.5 block h-0.5 w-4 bg-ink transition ${
                open ? "opacity-0" : "opacity-100"
              }`}
            />
            <span
              className={`absolute left-0 block h-0.5 w-4 bg-ink transition ${
                open ? "top-1.5 -rotate-45" : "top-3"
              }`}
            />
          </span>
        </button>
      </div>

      </header>
      {open ? (
        <div
          ref={mobileRef}
          id="mobile-nav"
          className="fixed inset-x-0 top-[calc(3.5rem+env(safe-area-inset-top))] z-[60] h-auto max-h-[min(70dvh,calc(100dvh-3.5rem-env(safe-area-inset-top)))] overflow-y-auto overscroll-contain border-b border-slate-line bg-paper px-4 pb-4 pt-1 shadow-[0_18px_40px_rgba(15,23,42,0.18)] sm:top-[calc(4rem+env(safe-area-inset-top))] sm:max-h-[min(70dvh,calc(100dvh-4rem-env(safe-area-inset-top)))] lg:hidden"
        >
          <nav className="flex h-auto flex-col" aria-label="Mobile">
            {navLinks.map((link) => {
              if (link.href === "/blog") {
                return (
                  <div key={link.href} className="border-b border-slate-line/70">
                    <div className="flex items-center gap-1">
                      <Link
                        href="/blog"
                        aria-current={onBlog ? "page" : undefined}
                        className={`flex min-h-12 min-w-0 flex-1 items-center text-base font-medium hover:text-link ${
                          blogCluster ? "text-teal" : "text-ink"
                        }`}
                      >
                        {link.label}
                      </Link>
                      <button
                        type="button"
                        className="inline-flex h-11 w-11 shrink-0 items-center justify-center text-muted hover:text-link"
                        aria-expanded={topicsOpen}
                        aria-controls="mobile-topics"
                        aria-label="Blog topics"
                        onClick={() => setTopicsOpen((value) => !value)}
                      >
                        <span aria-hidden>{topicsOpen ? "–" : "+"}</span>
                      </button>
                    </div>
                    {topicsOpen ? (
                      <div
                        id="mobile-topics"
                        className="mb-3 flex flex-col border-l border-slate-line pl-3"
                      >
                        {learningTopics.map((topic) => (
                          <Link
                            key={topic.slug}
                            href={`/learning/${topic.slug}`}
                            className="flex min-h-11 items-center text-sm text-muted hover:text-link"
                          >
                            {topic.label}
                          </Link>
                        ))}
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
                  aria-current={active ? "page" : undefined}
                  className={`flex min-h-12 items-center border-b border-slate-line/70 text-base font-medium hover:text-link ${
                    active ? "text-teal" : "text-ink"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
            <Link href="/contact" className="btn-primary mt-4 w-full">
              {siteConfig.inquiryCta}
            </Link>
          </nav>
        </div>
      ) : null}
    </>
  );
}
