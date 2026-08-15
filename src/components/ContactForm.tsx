"use client";

import { FormEvent, useState } from "react";
import { inquiryBudgets, inquiryTimelines, siteConfig } from "@/lib/site";

type Status = "idle" | "submitting" | "success" | "error";

const fieldClass =
  "mt-2 w-full min-h-11 rounded border border-slate-line bg-paper px-3 py-2.5 text-base text-ink outline-none transition focus:border-teal";

export function ContactForm() {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("submitting");
    setError("");

    const form = event.currentTarget;
    const data = new FormData(form);
    const payload = {
      name: String(data.get("name") ?? "").trim(),
      email: String(data.get("email") ?? "").trim(),
      company: String(data.get("company") ?? "").trim(),
      timeline: String(data.get("timeline") ?? "").trim(),
      budget: String(data.get("budget") ?? "").trim(),
      repoUrl: String(data.get("repoUrl") ?? "").trim(),
      message: String(data.get("message") ?? "").trim(),
      website: String(data.get("website") ?? "").trim(),
    };

    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const result: { ok?: boolean; error?: string } = await response.json().catch(() => ({}));

      if (!response.ok || !result.ok) {
        throw new Error(result.error ?? "Failed to send message.");
      }

      form.reset();
      setStatus("success");
    } catch (err) {
      setStatus("error");
      setError(
        err instanceof Error
          ? err.message
          : "Could not send your message. Please try WhatsApp or email me directly.",
      );
    }
  }

  if (status === "success") {
    return (
      <div className="space-y-4" role="status">
        <p className="font-display text-lg font-semibold text-ink">Message sent</p>
        <p className="text-sm text-ink-soft">
          Thanks — I&apos;ll get back to you within one business day.
        </p>
        <button type="button" className="btn-primary" onClick={() => setStatus("idle")}>
          Send another message
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="block text-sm font-medium text-ink">
          Name
          <input required name="name" autoComplete="name" className={fieldClass} />
        </label>
        <label className="block text-sm font-medium text-ink">
          Email
          <input required type="email" name="email" autoComplete="email" className={fieldClass} />
        </label>
      </div>

      <label className="block text-sm font-medium text-ink">
        Company / product
        <input name="company" autoComplete="organization" className={fieldClass} />
      </label>

      <div className="grid gap-5 sm:grid-cols-2">
        <label className="block text-sm font-medium text-ink">
          Timeline
          <select name="timeline" className={fieldClass} defaultValue="">
            <option value="">Select…</option>
            {inquiryTimelines.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-medium text-ink">
          Budget range
          <select name="budget" className={fieldClass} defaultValue="">
            <option value="">Select…</option>
            {inquiryBudgets.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="block text-sm font-medium text-ink">
        Repo or product URL <span className="font-normal text-muted">(optional)</span>
        <input
          type="url"
          name="repoUrl"
          inputMode="url"
          placeholder="https://"
          className={fieldClass}
        />
      </label>

      <label className="block text-sm font-medium text-ink">
        How can I help?
        <textarea
          required
          name="message"
          rows={6}
          maxLength={5000}
          className={fieldClass}
          placeholder="Project goals, constraints, and tech stack…"
        />
      </label>

      <div className="hidden" aria-hidden="true">
        <label>
          Website
          <input type="text" name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <button type="submit" className="btn-primary" disabled={status === "submitting"}>
        {status === "submitting" ? "Sending — typically one business day…" : siteConfig.inquiryCta}
      </button>

      {status === "error" ? (
        <p className="text-sm text-red-700" role="alert">
          {error}{" "}
          <a
            className="font-semibold text-teal link-underline"
            href={siteConfig.whatsapp}
            target="_blank"
            rel="noopener noreferrer"
          >
            WhatsApp
          </a>{" "}
          or{" "}
          <a className="font-semibold text-teal link-underline" href={`mailto:${siteConfig.email}`}>
            {siteConfig.email}
          </a>
          .
        </p>
      ) : null}
    </form>
  );
}
