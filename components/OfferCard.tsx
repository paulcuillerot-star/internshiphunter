import type { PremiumMatchType, ScoredInternshipOffer } from "@/lib/types";
import { FeedbackButtons } from "./FeedbackButtons";
import { ScoreBadge } from "./ScoreBadge";

const matchLabels: Record<PremiumMatchType, string> = {
  exact: "Exact match",
  close: "Close match",
  broadened: "Broadened match"
};

export function OfferCard({ offer, reportId, premium = false }: { offer: ScoredInternshipOffer; reportId: string; premium?: boolean }) {
  const matchType = offer.matchType ?? "close";

  return (
    <article className="overflow-hidden rounded-xl border border-emerald-100 bg-white shadow-soft ring-1 ring-emerald-50">
      <div className="h-1.5 bg-gradient-to-r from-signal via-emerald-400 to-lime-300" />
      <div className="p-6 sm:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            {premium ? <p className="mb-3 inline-flex rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold uppercase tracking-wide text-signal ring-1 ring-emerald-100">{matchLabels[matchType]}</p> : null}
            <p className="text-3xl font-black tracking-tight text-signal sm:text-4xl">{offer.company}</p>
            <h3 className="mt-3 text-xl font-bold leading-tight text-ink sm:text-2xl">{offer.title}</h3>
            <p className="mt-3 text-base font-semibold text-ink/65 sm:text-lg">{offer.location}</p>
          </div>
          {premium ? (
            <div className="flex flex-wrap gap-2">
              <ScoreBadge label="Match" value={offer.matchScore} />
              <ScoreBadge label="Quality" value={offer.qualityScore} />
            </div>
          ) : null}
        </div>

        {premium && (offer.languageFit || offer.broadenedReason) ? (
          <div className="mt-5 grid gap-3 rounded-lg border border-emerald-100 bg-emerald-50/60 p-4 text-sm text-emerald-950 md:grid-cols-2">
            {offer.languageFit ? <p><span className="font-bold text-signal">Language fit:</span> {offer.languageFit}</p> : null}
            {offer.broadenedReason ? <p><span className="font-bold text-signal">Broadening:</span> {offer.broadenedReason}</p> : null}
          </div>
        ) : null}

        <p className="mt-7 max-w-3xl text-sm leading-6 text-ink/75 sm:text-base">{offer.descriptionSummary}</p>

        <div className="mt-6 grid gap-4 md:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-lg border border-emerald-100 bg-emerald-50/70 p-4">
            <h4 className="text-sm font-bold uppercase tracking-wide text-signal">Why it matches</h4>
            <ul className="mt-3 space-y-2 text-sm text-emerald-950">
              {offer.whyItMatches.map((item) => (
                <li key={item} className="leading-5">{item}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-lg border border-line bg-mist/70 p-4">
            <h4 className="text-sm font-semibold text-ink/80">Risks to check</h4>
            <ul className="mt-2 space-y-2 text-sm text-ink/60">
              {offer.risks.map((item) => <li key={item} className="leading-5">{item}</li>)}
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
          <a href={offer.url} target="_blank" rel="noreferrer" className="button-secondary">Link to the internship</a>
          <FeedbackButtons reportId={reportId} offerId={offer.id} />
        </div>
      </div>
    </article>
  );
}
