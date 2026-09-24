import { ChevronRight, Flame, History } from "lucide-react";
import Link from "next/link";
import type { CookingHistoryEntry } from "@/lib/data";
import { cn } from "@/lib/utils";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function durationMinutes(session: CookingHistoryEntry) {
  if (!session.completed_at) return null;
  const ms =
    new Date(session.completed_at).getTime() -
    new Date(session.started_at).getTime();
  return Math.max(1, Math.round(ms / 60000));
}

/** Past cooking sessions, newest first. In-progress sessions link back into
 *  the cook screen; finished ones open the session review timeline. */
export function CookingHistoryList({
  sessions,
}: {
  sessions: CookingHistoryEntry[];
}) {
  if (sessions.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-3xl bg-card p-6 text-center ring-1 ring-oat">
        <History className="h-8 w-8 text-espresso-light" />
        <p className="text-sm font-semibold text-espresso-light">
          You haven&apos;t cooked anything yet. Your sessions will show up here.
        </p>
        <Link
          href="/today"
          className="inline-flex h-11 items-center rounded-full bg-flame px-6 font-bold text-white transition-colors hover:bg-flame-dark"
        >
          Find something to cook
        </Link>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {sessions.map((s) => {
        const active = s.status === "in_progress";
        const minutes = durationMinutes(s);
        return (
          <li key={s.id}>
            <Link
              href={active ? `/cook/${s.id}` : `/sessions/${s.id}`}
              className={cn(
                "flex items-center gap-3 rounded-3xl p-4 ring-1 transition-shadow hover:shadow-sm",
                active ? "bg-flame-soft ring-flame/30" : "bg-card ring-oat",
              )}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-extrabold">
                  {s.title ?? "Cooking session"}
                </p>
                <p className="mt-0.5 text-xs font-bold text-espresso-light">
                  {formatDate(s.started_at)}
                  {minutes ? ` · ${minutes} min` : ""}
                  {s.status === "abandoned" && " · didn’t finish"}
                </p>
                {active ? (
                  <p className="mt-1 inline-flex items-center gap-1 text-sm font-bold text-flame">
                    <Flame className="h-4 w-4" /> In progress · step{" "}
                    {s.current_step}
                  </p>
                ) : (
                  s.summary?.summary && (
                    <p className="mt-1 line-clamp-2 text-sm font-semibold text-espresso-light">
                      {s.summary.summary}
                    </p>
                  )
                )}
              </div>
              <ChevronRight className="h-5 w-5 shrink-0 text-espresso-light" />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
