import { formatPostDate } from "@/lib/dates";

type PostDateProps = {
  date: string;
  updated?: string;
  readingTime?: string;
  byline?: string;
};

export function PostDate({ date, updated, readingTime, byline }: PostDateProps) {
  const showUpdated = Boolean(updated && updated !== date);

  return (
    <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm text-muted">
      {showUpdated ? (
        <>
          <span>
            Updated <time dateTime={updated}>{formatPostDate(updated ?? date)}</time>
          </span>
          <span aria-hidden>·</span>
          <span>
            Published <time dateTime={date}>{formatPostDate(date)}</time>
          </span>
        </>
      ) : (
        <time dateTime={date}>{formatPostDate(date)}</time>
      )}
      {readingTime ? (
        <>
          <span aria-hidden>·</span>
          <span>{readingTime}</span>
        </>
      ) : null}
      {byline ? (
        <>
          <span aria-hidden>·</span>
          <span>{byline}</span>
        </>
      ) : null}
    </p>
  );
}
