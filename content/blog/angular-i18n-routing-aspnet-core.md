---
title: "Angular i18n Routing in ASP.NET Core with Locale Prefixes"
description: "Angular i18n routing in ASP.NET Core: allow-listed /en and /ur prefixes, one base href model, and a path culture provider that beats a stale cookie."
date: "2026-10-03"
category: "architecture"
tags: ["Angular", "i18n", "ASP.NET Core", "Routing", "Localization"]
related:
  - angular-ssr-hosted-aspnet-core
  - content-security-policy-angular-aspnet-core
  - aspnet-core-api-validation
  - rfc-9457-problem-details-aspnet-core
faq:
  - q: "Should the locale live in the URL or only in a cookie?"
    a: "Put it in the URL. A prefix such as /en or /ur gives each language a shareable, indexable address. A cookie-only culture breaks deep links and makes the server guess."
  - q: "Does a locale prefix mean I must ship one Angular build per language?"
    a: "No. A single build can route on :locale and swap translations at runtime. Separate builds with different base href values are the Angular localize model, and ASP.NET Core serves them as different files. Pick one model per app."
  - q: "Should JSON APIs format numbers and dates in the request culture?"
    a: "No. Keep API payloads in invariant culture and ISO-8601. Use the locale for UI formatting and for localized ProblemDetails detail text, not for money strings in JSON."
---

**Angular i18n routing in ASP.NET Core** puts the language in a path segment (`/en/orders`, `/ur/orders`), the Angular router only accepts locales you listed, and ASP.NET Core reads that same segment so server-rendered text and `Accept-Language` agree with the screen.

```text
Browser  GET /ur/orders
    v
ASP.NET Core static files + SPA fallback (index.html, not a file named "ur")
    v
Angular router  :locale = ur  -> locale guard -> Urdu bundle / runtime strings
    |
    +--> HttpClient  Accept-Language: ur
              v
         RequestLocalization on /api/*   (invariant JSON, localized errors)
```

The URL is the source of truth. Cookies, browser language, and `Accept-Language` are hints for the first visit, not a second source that can disagree with the path the user copied into chat.

**Hosting the SPA** -> [Angular SSR on ASP.NET Core](/blog/angular-ssr-hosted-aspnet-core). **Headers and script policy** -> [Content Security Policy](/blog/content-security-policy-angular-aspnet-core). **Error bodies** -> [ProblemDetails](/blog/rfc-9457-problem-details-aspnet-core).

Search intent for **angular i18n routing asp.net core** is a how-to for the prefix: allow-list it, keep the API out of the prefix, and stop culture cookies from fighting the URL.

## Pick one deployment model before you touch routes

Two models both produce a locale prefix. Mixing them is how base href and lazy chunks break.

**Single build, runtime prefix.** One `index.html`, `base href="/"`, Angular route `/:locale/...`. Translations load in the app (Angular `@angular/localize` runtime, or a dictionary you own). This is the right default for a portfolio SPA that shares one deployment and switches language without a rebuild.

**Build per locale.** Angular's compile-time localize emits `dist/browser/en` and `dist/browser/ur` with `<base href="/en/">` and `/ur/`. ASP.NET Core maps each prefix to that folder's `index.html`. Strings are baked in, bundles are duplicated, and switching language is a full navigation to the other prefix. Use this when you want compile-time extraction and the smallest runtime, and you accept N builds in CI.

The rest of this guide implements the single-build model, then shows the fallback map for the multi-build model. Do not set `APP_BASE_HREF` to `/en/` in the single-build model. Lazy chunks would request `/en/chunk-*.js` and 404.

![Single build keeps base href /; a per-locale build uses /en/ or /ur/ and its own index.html](/images/blog/angular-i18n-routing-aspnet-core-builds.png)

Supported locales in the examples are `en` and `ur`. Urdu is included because an Asia/Karachi audience actually needs an RTL locale, not because the technique is specific to it. Keep the allow-list short and explicit.

## Reject unknown locale prefixes in the router

> **Watch:** Copying APP_BASE_HREF from a multi-build tutorial into a single build 404s chunks under /en/. A prefix that also swallows /api returns index.html for JSON calls.

```typescript
export const SUPPORTED_LOCALES = ['en', 'ur'] as const;
export type AppLocale = (typeof SUPPORTED_LOCALES)[number];

export function isAppLocale(value: string | null): value is AppLocale {
  return !!value && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

export const localeCanMatch: CanMatchFn = (route, segments) => {
  const locale = segments[0]?.path ?? '';
  return isAppLocale(locale);
};

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'en' },
  {
    path: ':locale',
    canMatch: [localeCanMatch],
    providers: [
      {
        provide: LOCALE_ID,
        useFactory: () => {
          const path = window.location.pathname.split('/')[1] ?? 'en';
          return isAppLocale(path) ? path : 'en';
        },
      },
    ],
    children: [
      { path: '', loadComponent: () => import('./home/home.component').then(m => m.HomeComponent) },
      { path: 'orders', loadComponent: () => import('./orders/orders.component').then(m => m.OrdersComponent) },
      { path: 'orders/:id', loadComponent: () => import('./orders/order-detail.component').then(m => m.OrderDetailComponent) },
    ],
  },
  { path: '**', redirectTo: 'en' },
];
```

`canMatch` beats a guard that redirects after the route has already activated. An unknown first segment (`/api`, `/fr`, `/en%2F..%2F`) never becomes a child route. The `**` redirect is only for bookmarks you do not recognize; it must not catch real files. Those are served by ASP.NET Core before the SPA fallback.

Sync the document when the param changes:

```typescript
@Injectable({ providedIn: 'root' })
export class LocaleSync {
  constructor() {
    const route = inject(ActivatedRoute);
    const router = inject(Router);
    router.events.pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe(() => {
        const locale = route.root.firstChild?.snapshot.paramMap.get('locale') ?? 'en';
        if (!isAppLocale(locale)) return;
        document.documentElement.lang = locale;
        document.documentElement.dir = locale === 'ur' ? 'rtl' : 'ltr';
      });
  }
}
```

`dir="rtl"` is not optional for Urdu. Logical CSS (`margin-inline-start`, `padding-inline`) flips with it. Physical `margin-left` will not. Set `lang` so screen readers and `DatePipe` agree with the prefix.

Format in templates with `LOCALE_ID`, not with server-formatted strings:

```typescript
constructor() {
  const locale = inject(LOCALE_ID);
  this.amount = inject(DecimalPipe).transform(12500.5, '1.2-2', locale);
}
```

Register locale data for each language you claim to support (`registerLocaleData`) or Angular falls back to `en` for pipes while the URL says `ur`. That bug looks like "routing works, formatting does not."

Language switch is a router navigation that preserves the rest of the path:

```typescript
switchTo(next: AppLocale): void {
  const segments = this.router.url.split('/').filter(Boolean);
  segments[0] = next;
  void this.router.navigateByUrl('/' + segments.join('/'));
}
```

Do not store the locale only in a signal and leave the URL on `/en` while the UI is Urdu. The next refresh and the next shared link will lie.

## Send Accept-Language from the URL, not the browser

```typescript
export const localeHeader: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith('/api/')) return next(req);
  const first = window.location.pathname.split('/')[1] ?? 'en';
  const locale = isAppLocale(first) ? first : 'en';
  return next(req.clone({ setHeaders: { 'Accept-Language': locale } }));
};
```

Register it on the client you already build. A function that nothing provides does not set the header.

```typescript
import { provideHttpClient, withInterceptors } from '@angular/common/http';

provideHttpClient(withInterceptors([localeHeader]))
```

The interceptor re-reads the path rather than a mutable service so a stale singleton cannot outlive a navigation. Scope it to `/api/`. Do not stamp `Accept-Language` onto third-party calls (maps, CDNs); you can break their caching and leak nothing useful.

Keep JSON boring. Money is a number plus a currency code. Instants are ISO-8601. The UI formats them. The day you return `"12,500.50"` versus `"12.500,50"` as a JSON string, every client parser becomes locale-aware and at least one of them is wrong.

Localized *prose* in [ProblemDetails](/blog/rfc-9457-problem-details-aspnet-core) is reasonable: a `detail` sentence can follow `Accept-Language`. Stable `type` and `title` codes should not.

## Read the prefix and ignore a stale culture cookie

> **Watch:** The default culture provider list lets a cookie outrank the URL. This page replaces that list so the prefix wins.

The default localization stack includes a cookie provider near the front of the list. A user who once set `en` and then opens `/ur/...` will see English from the server if that cookie wins. For prefix routing, the path wins.

```csharp
public sealed class PathPrefixCultureProvider : RequestCultureProvider
{
    private readonly IReadOnlySet<string> _allowed;

    public PathPrefixCultureProvider(IEnumerable<string> allowed)
        => _allowed = allowed.ToHashSet(StringComparer.OrdinalIgnoreCase);

    public override Task<ProviderCultureResult?> DetermineProviderCultureResult(HttpContext httpContext)
    {
        var segment = httpContext.Request.Path.Value?
            .Split('/', StringSplitOptions.RemoveEmptyEntries)
            .FirstOrDefault();

        if (segment is null || !_allowed.Contains(segment))
            return Task.FromResult<ProviderCultureResult?>(null);

        return Task.FromResult<ProviderCultureResult?>(new ProviderCultureResult(segment, segment));
    }
}
```

```csharp
var supported = new[] { "en", "ur" };
var cultures = supported.Select(c => new CultureInfo(c)).ToList();

builder.Services.Configure<RequestLocalizationOptions>(options =>
{
    options.DefaultRequestCulture = new RequestCulture("en");
    options.SupportedCultures = cultures;
    options.SupportedUICultures = cultures;
    options.RequestCultureProviders =
    [
        new PathPrefixCultureProvider(supported),
        new AcceptLanguageHeaderRequestCultureProvider()
    ];
});

var app = builder.Build();
app.UseRequestLocalization();
app.UseStaticFiles();
app.MapControllers(); // /api has no locale prefix
app.MapFallbackToFile("index.html");
```

`UseRequestLocalization` must run before endpoints that format text. It does not belong after the SPA fallback.

`/api/orders` has no prefix, so the path provider returns null and `Accept-Language` applies. That header was set from the URL by the interceptor, so the two still match. A direct API caller with no header gets `en`. Document that.

Never build a file path from the raw segment (`wwwroot/{segment}/index.html`) unless the segment has already passed the allow-list. An allow-list is what turns localization into something that cannot walk out of `wwwroot`.

Exclude `/api`, `/graphql`, `/health`, and `/signin-*` from any rewrite rule that inserts a locale. A reverse proxy that "helpfully" redirects `/api/orders` to `/en/api/orders` will break the interceptor and every integration test.

## Host one folder per locale for compile-time builds

```csharp
foreach (var locale in new[] { "en", "ur" })
{
    var folder = Path.Combine(app.Environment.WebRootPath, locale);
    app.MapWhen(
        ctx => ctx.Request.Path.StartsWithSegments("/" + locale),
        branch =>
        {
            branch.UseStaticFiles(new StaticFileOptions
            {
                FileProvider = new PhysicalFileProvider(folder),
                RequestPath = "/" + locale
            });
            branch.UseRouting();
            branch.UseEndpoints(endpoints =>
            {
                endpoints.MapFallbackToFile("/" + locale + "/{*path:nonfile}", "index.html");
            });
        });
}
```

The `index.html` you fall back to has to be the one inside that locale folder, and its `<base href>` must be `/en/` or `/ur/` to match. A single shared `index.html` with the wrong base href loads the document and then fails every chunk. Check the network tab for the chunk URL before you debug the router.

This map is incompatible with the `:locale` route in the same deployment. Pick one.

## Give each locale its own canonical URL

> **Watch:** Cache /ur/orders and /en/orders as different documents. Accept-Language is the wrong vary key when the locale is already in the path.

Each locale needs its own canonical URL. Emit `link rel="alternate" hreflang="en"` and `hreflang="ur"` pointing at the same path under the other prefix, plus `hreflang="x-default"` toward `/en/...` if English is the default. Do not canonicalize every language back to `/en`; that tells a crawler the Urdu URL is a duplicate.

First visit to `/` redirects to `/en` in the route table above. If you want the browser's language on that first hop only, do it in one server redirect, allow-listed, then let the URL take over:

```csharp
app.MapGet("/", (HttpContext http) =>
{
    var header = http.Request.Headers.AcceptLanguage.ToString();
    var choice = header.StartsWith("ur", StringComparison.OrdinalIgnoreCase) ? "ur" : "en";
    return Results.Redirect("/" + choice);
});
```

Do not repeat that redirect on every request. A user who explicitly switched to English must be able to stay on `/en` in a browser that prefers Urdu.

## What breaks a locale prefix?

- **Culture cookie outranks the prefix** because the default provider list was left in place. The configuration above replaces the list on purpose.
- **`APP_BASE_HREF` copied from a multi-build tutorial into a single build.** Chunks 404 under `/en/`.
- **Locale prefix swallowed `/api`.** Controllers never run; the SPA returns `index.html` for JSON calls and Angular shows a parse error.
- **Reflecting the path segment into HTML** (`<html lang="{{raw}}">`) without the allow-list. Even a locale parameter is user input.
- **RTL applied as a body class but components use `left`/`right`.** The shell flips and the form does not.
- **`registerLocaleData` missing for `ur`.** `DatePipe` stays English. Routing is not formatting.
- **Localized route segments (`/ur/orders` vs `/ur/adaigi`) plus a prefix.** That is a second translation problem. Get the prefix stable before you translate slugs. Translated slugs need a map back to one component, or your analytics split forever.
- **SSR or a CDN caching `/ur/orders` as `/en/orders`** because the cache key ignored the path. The path is the vary key. `Accept-Language` alone is not, if the URL already contains the locale.

## How do you verify the prefix wins?

1. `/` returns a redirect to `/en` (or `/ur` only when you implemented the first-hop header rule and the header starts with `ur`).
2. `/ur/orders` serves the SPA, the document ends up `lang="ur"` and `dir="rtl"`, and lazy chunk URLs do not contain a duplicated prefix.
3. `/fr/orders` does not activate the orders component; it ends on an allow-listed locale.
4. A call to `/api/orders` from the Urdu screen sends `Accept-Language: ur`. A culture cookie left over from an English session does not flip server messages back to English.
5. `/api/orders` is not redirected to `/en/api/orders`.
6. Response bodies still contain numeric JSON (`12500.5`), not a grouped string.
7. Switching the language control changes only the first segment and keeps `orders/42`.

When those seven hold, add translation catalogs. The prefix is the load-bearing part; the catalog is content.

