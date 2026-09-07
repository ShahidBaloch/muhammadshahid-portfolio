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
    <p className="text-sm text-muted">
      {showUpdated ? (
        <>
          Updated <time dateTime={updated}>{formatPostDate(updated ?? date)}</time>
          <span aria-hidden> · </span>
          Published <time dateTime={date}>{formatPostDate(date)}</time>
        </>
      ) : (
        <time dateTime={date}>{formatPostDate(date)}</time>
      )}
      {readingTime ? (
        <>
          <span aria-hidden> · </span>
          {readingTime}
        </>
      ) : null}
      {byline ? (
        <>
          <span aria-hidden> · </span>
          {byline}
        </>
      ) : null}
    </p>
  );
}
