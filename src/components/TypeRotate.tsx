"use client";

import { useEffect, useState } from "react";

const WORDS = [
  "resilient platforms",
  "secure identity flows",
  "domain-driven APIs",
  "healthcare workflows",
  "cloud-ready systems",
];

export function TypeRotate() {
  const [index, setIndex] = useState(0);
  const [text, setText] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const word = WORDS[index] ?? "";
    const speed = deleting ? 40 : 70;

    if (!deleting && text === word) {
      const pause = window.setTimeout(() => setDeleting(true), 1400);
      return () => window.clearTimeout(pause);
    }

    if (deleting && text === "") {
      setDeleting(false);
      setIndex((value) => (value + 1) % WORDS.length);
      return;
    }

    const tick = window.setTimeout(() => {
      const next = deleting ? word.slice(0, text.length - 1) : word.slice(0, text.length + 1);
      setText(next);
    }, speed);

    return () => window.clearTimeout(tick);
  }, [text, deleting, index]);

  return (
    <span className="typing-cursor text-teal" aria-live="polite">
      {text}
    </span>
  );
}
