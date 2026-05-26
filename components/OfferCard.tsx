import type { ScoredInternshipOffer } from "@/lib/types";
import { FeedbackButtons } from "./FeedbackButtons";
import { ScoreBadge } from "./ScoreBadge";

const freeOfferTags = ["Weekly example", "Business school fit", "Check employer page", "Cached example"];

export function OfferCard({ offer, reportId, premium = false }: { offer: ScoredInternshipOffer; reportId: string; premium?: boolean }) {
  return (
    <article className="overflow-hidden rounded-lg border border-emerald-100 bg-white shadow-soft ring-1 ring-emerald-50">
      <div className="h-1.5 bg-gradient-to-r from-signal via-emerald-400 to-lime-300" />
      <div className="p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="inline-flex rounded-full bg-emerald-50 px-3 py-1 text-sm font-bold text-signal">{offer.company}</p>
            <h3 className="mt-3 text-2xl font-bold text-ink">{offer.title}</h3>
            <p className="mt-1 text-sm font-medium text-ink/60">{offer.location}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <ScoreBadge label="Match" value={offer.matchScore} />
            {premium ? <ScoreBadge label="Quality" value={offer.qualityScore} /> : null}
          </div>
        </div>

        {!premium ? (
          <div className="mt-5 flex flex-wrap gap-2">
            {freeOfferTags.map((tag) => (
              <span key={tag} className="rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">
                {tag}
              </span>
            ))}
          </div>
        ) : null}

        <p className="mt-5 text-sm leading-6 text-ink/75">{offer.descriptionSummary}</p>

        <div className="mt-5 grid gap-4 md:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-lg border border-emerald-100 bg-emerald-50/70 p-4">
            <h4 className="text-sm font-bold uppercase tracking-wide text-signal">Why it matches</h4>
            <ul className="mt-3 flex flex-wrap gap-2 text-sm text-emerald-900">
              {offer.whyItMatches.map((item) => (
                <li key={item} className="rounded-full bg-white px-3 py-1 font-semibold shadow-sm">{item}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-lg border border-line bg-mist/70 p-4">
            <h4 className="text-sm font-semibold text-ink/80">Risks to check</h4>
            <ul className="mt-2 space-y-1 text-sm text-ink/60">
              {offer.risks.map((item) => <li key={item}>- {item}</li>)}
            </ul>
          </div>
        </div>

        <div className="mt-5 rounded-lg border border-line bg-white p-4 text-sm text-ink/75 shadow-sm">
          <p className="font-bold text-ink">Application angle</p>
          <p className="mt-1 leading-6">{offer.applicationAngle}</p>
          {premium ? (
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <p><span className="font-semibold text-ink">Interview probability:</span> {offer.probabilityOfInterview}/100</p>
              <p><span className="font-semibold text-ink">Compensation:</span> {offer.compensation}</p>
              <p><span className="font-semibold text-ink">LinkedIn:</span> {offer.linkedinMessage}</p>
              <p><span className="font-semibold text-ink">Cover hook:</span> {offer.coverLetterHook}</p>
            </div>
          ) : null}
        </div>

        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <a href={offer.url} target="_blank" rel="noreferrer" className="button-secondary">Open source</a>
          <FeedbackButtons reportId={reportId} offerId={offer.id} />
        </div>
      </div>
    </article>
  );
}
