// Search + tag filter for the /blog post list (components/BlogFeed.tsx). Matches the old React
// behavior: case-insensitive search over title, summary and tags; heading, count and an empty
// message update as you type.
const root = document.querySelector<HTMLElement>("[data-blog-feed]");

if (root) {
  const search = root.querySelector<HTMLInputElement>('input[type="search"]')!;
  const select = root.querySelector<HTMLSelectElement>("select")!;
  const heading = root.querySelector<HTMLElement>("h2")!;
  const count = heading.nextElementSibling as HTMLElement;
  const list = count.nextElementSibling as HTMLElement;
  const articles = [...list.querySelectorAll<HTMLElement>("article")].map((el) => {
    const tags = [...el.querySelectorAll("li")].map((li) => li.textContent ?? "");
    const title = el.querySelector("h3")?.textContent ?? "";
    const description = el.querySelector("h3 + p")?.textContent ?? "";
    return { el, tags, text: `${title} ${description} ${tags.join(" ")}`.toLowerCase() };
  });
  const empty = document.createElement("p");
  empty.className = "py-10 text-muted";
  empty.textContent = "No articles match that filter.";

  // Non-matching articles are taken out of the list (not just hidden), as React did, so the
  // divide-y borders stay correct.
  const update = () => {
    const q = search.value.trim().toLowerCase();
    const tag = select.value;
    const shown = articles.filter((a) => (!tag || a.tags.includes(tag)) && (!q || a.text.includes(q))).map((a) => a.el);
    heading.textContent = q || tag ? "Matching articles" : "All articles";
    count.textContent = `${shown.length} article${shown.length === 1 ? "" : "s"}`;
    list.replaceChildren(...(shown.length ? shown : [empty]));
  };

  search.addEventListener("input", update);
  select.addEventListener("change", update);
}
