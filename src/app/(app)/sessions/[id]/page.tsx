import {
  ArrowLeft,
  Camera,
  CheckCircle2,
  Flag,
  ImageIcon,
  MessageCircle,
  Mic,
  Star,
  StepForward,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getSessionById, getSessionEvents } from "@/lib/session-events";
import type { SessionEventRow } from "@/lib/types";

export const dynamic = "force-dynamic";

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Full review of one cooking session — the multimodal timeline: step
 *  navigation, text/voice Q&A, camera checkpoints, photos and feedback. */
export default async function SessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [session, events] = await Promise.all([
    getSessionById(id),
    getSessionEvents(id),
  ]);
  if (!session) notFound();

  const recipeTitle = session.recipe?.title ?? "Cooking session";
  const recipeSlug = session.recipe?.slug;
  const durationMin = session.completed_at
    ? Math.max(
        1,
        Math.round(
          (new Date(session.completed_at).getTime() -
            new Date(session.started_at).getTime()) /
            60000,
        ),
      )
    : null;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <Link
          href={recipeSlug ? `/recipes/${recipeSlug}` : "/recipes"}
          className="mb-2 inline-flex items-center gap-1 text-sm font-bold text-espresso-light hover:text-espresso"
        >
          <ArrowLeft className="h-4 w-4" /> Back to recipe
        </Link>
        <h1 className="text-3xl font-extrabold tracking-tight">
          {recipeTitle}
        </h1>
        <p className="mt-1 font-semibold text-espresso-light">
          {new Date(session.started_at).toLocaleDateString(undefined, {
            weekday: "long",
            day: "numeric",
            month: "long",
          })}
          {durationMin ? ` · about ${durationMin} min` : ""}
          {" · "}
          {session.status}
        </p>
      </div>

      {session.summary && (
        <section className="flex flex-col gap-2 rounded-3xl bg-flame-soft p-5">
          <h2 className="text-xs font-extrabold tracking-wide uppercase">
            StarterChef recap
          </h2>
          <p className="text-sm font-semibold">{session.summary.summary}</p>
          {session.summary.insights.length > 0 && (
            <ul className="mt-1 flex flex-col gap-1">
              {session.summary.insights.map((insight) => (
                <li
                  key={insight}
                  className="text-sm font-bold text-espresso-light"
                >
                  · {insight}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-xs font-extrabold tracking-wide text-espresso-light uppercase">
          What happened
        </h2>
        {events.length === 0 ? (
          <p className="text-sm font-semibold text-espresso-light">
            Nothing was recorded for this session.
          </p>
        ) : (
          <ol className="flex flex-col gap-2">
            {events.map((event) => (
              <EventRow key={event.id} event={event} />
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

function EventRow({ event }: { event: SessionEventRow }) {
  const p = event.payload;
  const verdict =
    typeof p.verdict === "object" && p.verdict !== null
      ? (p.verdict as { looksRight?: boolean; feedback?: string; tip?: string })
      : p;

  const base =
    "flex gap-3 rounded-2xl bg-card p-3 ring-1 ring-oat text-sm font-semibold";
  const time = (
    <span className="ml-auto shrink-0 text-xs font-bold text-espresso-light">
      {formatTime(event.created_at)}
    </span>
  );

  switch (event.kind) {
    case "session_started":
      return (
        <li className={base}>
          <Flag className="mt-0.5 h-4 w-4 shrink-0 text-flame" />
          <span>Started cooking{String(p.recipeTitle ?? "")}</span>
          {time}
        </li>
      );
    case "step_entered":
      return (
        <li className={base}>
          <StepForward className="mt-0.5 h-4 w-4 shrink-0 text-espresso-light" />
          <span>Moved to step {event.step_index}</span>
          {time}
        </li>
      );
    case "qa":
      return (
        <li className={`${base} flex-col`}>
          <span className="flex items-center gap-2 font-extrabold">
            {p.channel === "voice" ? (
              <Mic className="h-4 w-4 text-flame" />
            ) : (
              <MessageCircle className="h-4 w-4 text-flame" />
            )}
            You asked{event.step_index ? ` (step ${event.step_index})` : ""}
            {time}
          </span>
          <span>“{String(p.question ?? "")}”</span>
          <span className="text-espresso-light">
            StarterChef: {String(p.answer ?? "")}
          </span>
        </li>
      );
    case "photo_check":
      return (
        <li className={`${base} flex-col`}>
          <span className="flex items-center gap-2 font-extrabold">
            <Camera className="h-4 w-4 text-flame" />
            Camera checkpoint
            {event.step_index ? ` (step ${event.step_index})` : ""}
            {verdict.looksRight === true && (
              <span className="text-green-700">✓ looked right</span>
            )}
            {verdict.looksRight === false && (
              <span className="text-flame-ink">needed a fix</span>
            )}
            {time}
          </span>
          {typeof p.photoUrl === "string" && (
            <span className="relative block h-32 w-48 overflow-hidden rounded-xl">
              <Image
                src={p.photoUrl}
                alt="Checkpoint photo"
                fill
                className="object-cover"
              />
            </span>
          )}
          <span>{String(verdict.feedback ?? "")}</span>
          {verdict.tip ? (
            <span className="font-bold text-flame-ink">
              Try: {String(verdict.tip)}
            </span>
          ) : null}
        </li>
      );
    case "photo_upload":
      return (
        <li className={`${base} flex-col`}>
          <span className="flex items-center gap-2 font-extrabold">
            <ImageIcon className="h-4 w-4 text-espresso-light" />
            Added a photo of step {event.step_index}
            {time}
          </span>
          {typeof p.photoUrl === "string" && (
            <span className="relative block h-32 w-48 overflow-hidden rounded-xl">
              <Image
                src={p.photoUrl}
                alt="Step photo"
                fill
                className="object-cover"
              />
            </span>
          )}
        </li>
      );
    case "feedback":
      return (
        <li className={`${base} flex-col`}>
          <span className="flex items-center gap-2 font-extrabold">
            <CheckCircle2 className="h-4 w-4 text-green-700" />
            Finished cooking
            {typeof p.rating === "number" && (
              <span className="inline-flex items-center gap-0.5">
                {Array.from({ length: p.rating }).map((_, i) => (
                  <Star key={i} className="h-3.5 w-3.5 fill-flame text-flame" />
                ))}
              </span>
            )}
            {time}
          </span>
          {p.notes ? <span>“{String(p.notes)}”</span> : null}
          {Array.isArray(p.substitutionsMade) &&
          p.substitutionsMade.length > 0 ? (
            <span className="text-espresso-light">
              Substitutions: {p.substitutionsMade.join(", ")}
            </span>
          ) : null}
        </li>
      );
    default:
      return null;
  }
}
