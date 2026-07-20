# Muhammad Shahid — Portfolio Website

This README is the **source of truth** for building and deploying the personal portfolio site.  
Use this file as instructions for Cursor / AI agents in future sessions.

---

## Finalized decisions

| Item | Decision |
|------|----------|
| **Domain name** | `muhammadshahid.dev` |
| **Domain purchase** | Cloudflare Registrar |
| **Site hosting** | Vercel (Hobby / free tier) |
| **DNS** | Cloudflare DNS → point to Vercel |
| **Framework** | Next.js (App Router) |
| **Language** | TypeScript |
| **Styling** | Tailwind CSS |
| **Blog / posts** | MDX (Markdown + React) in the repo |
| **Email** | Cloudflare Email Routing (free) → Gmail (later) |
| **Contact form** | Resend / Formspree / similar free tier (decide at build time) |
| **Cost target** | Domain only (~$10–15/year); hosting free |

**Do not change** domain, registrar, hosting, or stack unless the owner explicitly asks.

---

## Brand & positioning

- **Name:** Muhammad Shahid
- **Title:** Full Stack Developer (.NET + Angular)
- **Experience:** 5+ years
- **Focus for clients:** Production .NET + Angular apps (healthcare, SaaS, eCommerce, Azure)
- **Primary CTA:** Hire me / Book a call / Contact
- **Location signal:** Pakistan / remote-friendly (include if useful for SEO)

**Homepage one-liner (use or refine):**  
> I build production .NET + Angular apps for healthcare, SaaS, and eCommerce.

**Resume reference:** `C:\Users\HP\Downloads\Muhammad_Shahid_Resume.pdf`

**Links to include:**
- LinkedIn: https://linkedin.com/in/muhammad-shahid-8a66a7234
- GitHub: https://github.com/ShahidBaloch
- Email: muhammadshahid6528@gmail.com
- Phone / WhatsApp: +92 308 8067617

**Featured projects (from resume):**
- CarBazaar — https://github.com/ShahidBaloch/CarBazaar
- Ecom_NET10 — https://github.com/ShahidBaloch/Ecom_NET10

---

## Goals of the website

1. Personal branding for Muhammad Shahid
2. Attract freelance / contract clients
3. SEO-friendly (crawlable pages, metadata, sitemap, blog)
4. Ability to publish posts/articles
5. Low ongoing cost (domain only; free hosting)

---

## Site structure (required pages)

1. **Home** — brand, one headline, short support text, primary CTA, strong visual
2. **Work / Projects** — case-style project cards (problem → solution → stack → result)
3. **Services** — what clients can hire for (.NET APIs, Angular SPAs, Azure, auth/SSO, microservices)
4. **Blog** — MDX posts list + individual post pages (SEO content)
5. **About** — short bio from resume (optional if Home covers enough)
6. **Contact** — form + WhatsApp + email + LinkedIn

Optional later: testimonials, certifications, resume download PDF.

---

## SEO requirements

- Use Next.js App Router with **static generation** where possible (SSG/ISR)
- Unique `<title>` and meta description per page
- Open Graph + Twitter cards
- `sitemap.xml` and `robots.txt`
- Semantic HTML headings
- Fast Core Web Vitals (images optimized, minimal JS)
- Blog posts with clear URLs, e.g. `/blog/aspnet-core-jwt-auth`
- Prefer content that ranks for: `.NET Angular developer`, `ASP.NET Core freelance`, name-based searches

**Note:** Do not build the marketing site as a client-only SPA without SSR/SSG.

---

## Tech stack details

```text
Next.js (App Router) + TypeScript + Tailwind CSS + MDX
Deployed on Vercel
Domain registered & DNS on Cloudflare → muhammadshahid.dev
```

Suggested extras (add when implementing):
- `next-sitemap` or built-in Next.js metadata routes
- `gray-matter` / `@next/mdx` / `contentlayer` / `velite` (pick one simple MDX approach)
- ESLint + Prettier
- GitHub repo for source + Vercel Git integration

---

## Domain & hosting setup (owner checklist)

### 1) Buy domain (Cloudflare)

1. Create/log in to Cloudflare account
2. Registrar → Register domain
3. Buy **`muhammadshahid.dev`**
4. Skip paid add-ons (privacy is included; no paid email/hosting needed)

### 2) Create Next.js app + GitHub repo

1. Create repo (suggested name: `muhammadshahid-portfolio` or `muhammadshahid.dev`)
2. Push Next.js project
3. Connect repo to Vercel

### 3) Deploy on Vercel

1. Import GitHub repo in Vercel
2. Framework preset: Next.js
3. Deploy (Hobby plan is enough)

### 4) Connect custom domain

1. In Vercel → Project → Settings → Domains → add `muhammadshahid.dev` (and `www` if desired)
2. In Cloudflare DNS, add the records Vercel shows (usually CNAME/A)
3. Keep Cloudflare SSL/TLS mode compatible (typically **Full**)
4. Confirm https://muhammadshahid.dev works

### 5) Free custom email (do this before or after deploy)

Use **Cloudflare Email Routing** (not a new Gmail):

1. Cloudflare dashboard → select domain **`muhammadshahid.dev`**
2. Go to **Email** → **Email Routing**
3. Click **Get started** / enable Email Routing (Cloudflare will add MX records automatically)
4. **Destination addresses** → add `muhammadshahid6528@gmail.com` → verify via the link Google/Cloudflare sends
5. **Routing rules** → create address:
   - Custom address: `info@muhammadshahid.dev`
   - Action: Send to → `muhammadshahid6528@gmail.com`
6. Send a test email to `info@muhammadshahid.dev` and confirm it arrives in Gmail

Optional extras: `hello@…`, `contact@…`, `hire@…` — same destination Gmail.

**How to know it came via your domain:** In Gmail, open the message → check **To:** (should show `info@muhammadshahid.dev`). You can also create a Gmail filter/label for mail to that address.

**Replying as info@…:** Email Routing only *receives*. To *send/reply* as `info@muhammadshahid.dev`, set Gmail “Send mail as” (needs an SMTP provider) or use a free custom-domain mailbox (e.g. Zoho Mail). Details in chat / below when you set it up.

**Note:** Cloudflare Email Routing is receive/forward only (free).

---

## Design direction (when building UI)

- Client-attracting, professional, modern developer portfolio
- Strong personal brand in the first viewport (name must read as hero-level, not only nav)
- One clear composition on first screen (not a busy dashboard)
- Avoid generic “AI purple gradient” look
- Mobile-friendly and fast
- Prefer real project screenshots / atmosphere over abstract decoration only

Follow Cursor frontend design rules when implementing visuals.

---

## Content priorities for client conversion

Lead with outcomes, not only tools:
- Healthcare / SaaS / eCommerce delivery
- .NET 6/8/10 + Angular 15+
- Azure, SQL Server, Cosmos DB, Redis, SignalR
- Auth: IdentityServer, OAuth 2.0, JWT, SSO
- Microservices, Docker, CI/CD

Make contact frictionless (form + WhatsApp + LinkedIn).

---

## Instructions for future Cursor / AI sessions

When the owner pastes or points to this README, the agent should:

1. Treat the **Finalized decisions** table as locked
2. Build or continue the Next.js portfolio under this project folder / repo
3. Keep changes small and focused unless asked for a full build
4. Prefer SEO-friendly App Router pages + MDX blog
5. Deploy path remains: **GitHub → Vercel**, domain on **Cloudflare**
6. Do not switch to Angular/WordPress/static-only Astro unless explicitly requested
7. Use resume + GitHub projects for accurate content
8. Ask before committing/pushing if unclear; never force-push

### Example prompts the owner can use later

- `Read README.md and scaffold the Next.js portfolio with Home, Work, Services, Blog, Contact.`
- `Add an MDX blog post about ASP.NET Core JWT auth.`
- `Connect the site checklist for Cloudflare + Vercel domain setup.`
- `Improve SEO metadata and sitemap.`

---

## Status

| Step | Status |
|------|--------|
| Domain name chosen | Done — `muhammadshahid.dev` |
| Domain availability checked | Available (as of planning) |
| Domain purchased | Done — Cloudflare (`muhammadshahid.dev`) |
| Stack finalized | Done — Next.js + TS + Tailwind + MDX |
| Hosting finalized | Done — Vercel + Cloudflare DNS |
| Site code scaffolded | Done — Next.js App Router portfolio |
| Deployed live | Not started — next: GitHub → Vercel → DNS |

---

## Local development

```bash
cd C:\Users\HP\Documents\muhammadshahid-portfolio
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Add a blog post

1. Create `content/blog/your-post-slug.md`
2. Add frontmatter: `title`, `description`, `date`, `tags`
3. Write Markdown body
4. Visit `/blog/your-post-slug`

### Contact form email (Gmail SMTP — same as old portfolio)

Your old repo used **nodemailer + Gmail**. This project uses the same approach via `/api/contact`.

1. Create a Gmail **App Password**: [https://myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)
2. Create `.env.local`:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=muhammadshahid6528@gmail.com
SMTP_PASS=your_16_char_app_password
CONTACT_TO=muhammadshahid6528@gmail.com
```

3. Restart `npm run dev`
4. On Vercel, add the same env vars in Project → Settings → Environment Variables

Public contact address on the site: `info@muhammadshahid.dev` (Cloudflare forward).  
Form delivery inbox: `muhammadshahid6528@gmail.com` (SMTP).

---

## Owner next actions

1. Purchase `muhammadshahid.dev` on Cloudflare Registrar
2. Push this repo to GitHub
3. Import the repo in Vercel and deploy
4. Attach the custom domain in Vercel + Cloudflare DNS
