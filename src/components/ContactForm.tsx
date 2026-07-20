"use client";

import { FormEvent, useState } from "react";
import { siteConfig } from "@/lib/site";

type Status = "idle" | "submitting" | "success" | "error";

export function ContactForm() {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("submitting");
    setError("");

    const form = event.currentTarget;
    const data = new FormData(form);
    const name = String(data.get("name") ?? "").trim();
    const email = String(data.get("email") ?? "").trim();
    const company = String(data.get("company") ?? "").trim();
    const message = String(data.get("message") ?? "").trim();

    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, company, message }),
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

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="block text-sm font-medium text-ink">
          Name
          <input
            required
            name="name"
            autoComplete="name"
            className="mt-2 w-full rounded border border-slate-line bg-mist px-3 py-2.5 text-ink outline-none transition focus:border-teal"
          />
        </label>
        <label className="block text-sm font-medium text-ink">
          Email
          <input
            required
            type="email"
            name="email"
            autoComplete="email"
            className="mt-2 w-full rounded border border-slate-line bg-mist px-3 py-2.5 text-ink outline-none transition focus:border-teal"
          />
        </label>
      </div>

      <label className="block text-sm font-medium text-ink">
        Company / product
        <input
          name="company"
          autoComplete="organization"
          className="mt-2 w-full rounded border border-slate-line bg-mist px-3 py-2.5 text-ink outline-none transition focus:border-teal"
        />
      </label>

      <label className="block text-sm font-medium text-ink">
        How can I help?
        <textarea
          required
          name="message"
          rows={6}
          className="mt-2 w-full rounded border border-slate-line bg-mist px-3 py-2.5 text-ink outline-none transition focus:border-teal"
          placeholder="Project goals, timeline, and tech stack…"
        />
      </label>

      <button type="submit" className="btn-primary" disabled={status === "submitting"}>
        {status === "submitting" ? "Sending…" : "Send message"}
      </button>

      {status === "success" ? (
        <p className="text-sm font-medium text-teal" role="status">
          Thanks — your message was sent. I&apos;ll get back to you soon.
        </p>
      ) : null}

      {status === "error" ? (
        <p className="text-sm text-red-600" role="alert">
          {error}{" "}
          <a className="font-semibold text-teal link-underline" href={siteConfig.whatsapp} target="_blank" rel="noopener noreferrer">
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
