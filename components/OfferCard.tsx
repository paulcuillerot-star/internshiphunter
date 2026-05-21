import type { ScoredInternshipOffer } from "@/lib/types";
import { FeedbackButtons } from "./FeedbackButtons";
import { ScoreBadge } from "./ScoreBadge";

export function OfferCard({ offer, reportId, premium = false }: { offer: ScoredInternshipOffer; reportId: string; premium?: boolean }) {
  return (
    <article className="rounded-lg border border-line bg-white p-5 shadow-soft">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div><p className="text-sm font-medium text-signal">{offer.company}</p><h3 className="mt-1 text-xl font-bold text-ink">{offer.title}</h3><p className="mt-1 text-sm text-ink/60">{offer.location}</p></div>
        <div className="flex flex-wrap gap-2"><ScoreBadge label="Match" value={offer.matchScore} />{premium ? <ScoreBadge label="Quality" value={offer.qualityScore} /> : null}</div>
      </div>
      <p className="mt-4 text-sm leading-6 text-ink/75">{offer.descriptionSummary}</p>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div><h4 className="text-sm font-semibold text-ink">Why it matches</h4><ul className="mt-2 space-y-1 text-sm text-ink/70">{offer.whyItMatches.map((item) => <li key={item}>- {item}</li>)}</ul></div>
        <div><h4 className="text-sm font-semibold text-ink">Risks</h4><ul className="mt-2 space-y-1 text-sm text-ink/70">{offer.risks.map((item) => <li key={item}>- {item}</li>)}</ul></div>
      </div>
      <div className="mt-4 rounded-md bg-mist p-4 text-sm text-ink/75"><p className="font-semibold text-ink">Application angle</p><p className="mt-1">{offer.applicationAngle}</p>{premium ? <div className="mt-3 grid gap-3 md:grid-cols-2"><p><span className="font-semibold text-ink">Interview probability:</span> {offer.probabilityOfInterview}/100</p><p><span className="font-semibold text-ink">Compensation:</span> {offer.compensation}</p><p><span className="font-semibold text-ink">LinkedIn:</span> {offer.linkedinMessage}</p><p><span className="font-semibold text-ink">Cover hook:</span> {offer.coverLetterHook}</p></div> : null}</div>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><a href={offer.url} target="_blank" rel="noreferrer" className="button-secondary">Open source</a><FeedbackButtons reportId={reportId} offerId={offer.id} /></div>
    </article>
  );
}
