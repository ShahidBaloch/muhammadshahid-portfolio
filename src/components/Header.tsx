"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { BrandMark } from "@/components/BrandMark";
import { learningTopics, navLinks } from "@/lib/site";

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

  const blogActive =
    pathname === "/blog" ||
    pathname.startsWith("/blog/") ||
    pathname === "/learning" ||
    pathname.startsWith("/learning/");

  return (
    <header
      className={`fixed inset-x-0 top-0 z-[60] flex flex-col pt-[env(safe-area-inset-top)] transition duration-300 ${
        open ? "h-dvh bg-paper" : ""
      } ${
        scrolled || open
          ? "border-b border-slate-line/80 bg-paper/95 backdrop-blur-md"
          : "bg-transparent"
      }`}
    >
      <div className="container-narrow flex h-14 shrink-0 items-center justify-between gap-3 px-4 sm:h-16 sm:gap-4 sm:px-8 lg:px-12">
        <Link
          href="/"
          className="flex min-w-0 items-center gap-2 font-display text-[0.95rem] font-semibold tracking-tight text-ink transition hover:text-teal sm:gap-2.5 sm:text-lg"
        >
          <BrandMark size="sm" />
          <span className="truncate">Muhammad Shahid</span>
        </Link>

        <nav className="hidden items-center gap-5 xl:gap-6 lg:flex" aria-label="Primary">
          {navLinks.map((link) => {
            if (link.href === "/blog") {
              return (
                <div key={link.href} className="relative" ref={blogRef}>
                  <button
                    type="button"
                    className={`relative inline-flex min-h-11 items-center gap-1 text-sm transition after:absolute after:bottom-2 after:left-0 after:h-0.5 after:w-0 after:bg-teal after:transition-all hover:text-teal hover:after:w-full ${
                      blogActive ? "text-teal after:w-full" : "text-muted"
                    }`}
                    aria-expanded={blogOpen}
                    aria-haspopup="menu"
                    aria-controls="blog-menu"
                    onClick={() => setBlogOpen((value) => !value)}
                  >
                    {link.label}
                    <span aria-hidden className="text-[10px]">
                      ▾
                    </span>
                  </button>
                  {blogOpen ? (
                    <div id="blog-menu" role="menu" className="absolute left-0 top-full z-50 pt-2">
                      <div className="max-h-[min(24rem,70vh)] min-w-[230px] overflow-y-auto overscroll-contain rounded-xl border border-slate-line bg-mist py-2">
                        <Link
                          href="/blog"
                          role="menuitem"
                          className="block px-4 py-2.5 text-sm text-ink-soft hover:bg-paper hover:text-teal"
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
                            className="block px-4 py-2.5 text-sm text-ink-soft hover:bg-paper hover:text-teal"
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
                className={`relative inline-flex min-h-11 items-center text-sm transition after:absolute after:bottom-2 after:left-0 after:h-0.5 after:w-0 after:bg-teal after:transition-all hover:text-teal hover:after:w-full ${
                  active ? "text-teal after:w-full" : "text-muted"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
          <Link href="/contact" className="btn-primary !px-4 !py-2 !text-xs">
            Hire me
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

      {open ? (
        <div
          ref={mobileRef}
          id="mobile-nav"
          className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain border-t border-slate-line bg-paper px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-2 lg:hidden"
        >
          <nav className="flex flex-col" aria-label="Mobile">
            {navLinks.map((link) => {
              if (link.href === "/blog") {
                return (
                  <div key={link.href} className="border-b border-slate-line/70">
                    <Link
                      href="/blog"
                      className="flex min-h-12 items-center text-base font-medium text-ink hover:text-teal"
                    >
                      {link.label}
                    </Link>
                    <button
                      type="button"
                      className="flex min-h-11 w-full items-center justify-between text-sm font-medium text-muted"
                      aria-expanded={topicsOpen}
                      onClick={() => setTopicsOpen((value) => !value)}
                    >
                      Topics
                      <span aria-hidden>{topicsOpen ? "–" : "+"}</span>
                    </button>
                    {topicsOpen ? (
                      <div className="mb-3 flex flex-col border-l border-slate-line pl-3">
                        {learningTopics.map((topic) => (
                          <Link
                            key={topic.slug}
                            href={`/learning/${topic.slug}`}
                            className="flex min-h-11 items-center text-sm text-muted hover:text-teal"
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
                  className={`flex min-h-12 items-center border-b border-slate-line/70 text-base font-medium hover:text-teal ${
                    active ? "text-teal" : "text-ink"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
            <Link href="/contact" className="btn-primary mt-6 w-full">
              Hire me
            </Link>
          </nav>
        </div>
      ) : null}
    </header>
  );
}
