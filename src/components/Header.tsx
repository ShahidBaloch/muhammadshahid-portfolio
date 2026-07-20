"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { navLinks, siteConfig } from "@/lib/site";

export function Header() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

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

        <nav className="hidden items-center gap-6 lg:flex" aria-label="Primary">
          {navLinks.map((link) => {
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
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="py-1 text-base font-medium text-ink-soft hover:text-teal"
              >
                {link.label}
              </Link>
            ))}
            <Link href="/contact" className="btn-primary mt-2 w-full">
              Hire me
            </Link>
          </nav>
        </div>
      ) : null}
    </header>
  );
}
