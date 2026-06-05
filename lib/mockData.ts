import type { CandidateProfile, InternshipSearchReport, PremiumMatchType, ScoredInternshipOffer } from "./types";
import { matchSearchBucket } from "./searchBuckets";

const now = new Date().toISOString();

export const mockCandidateProfile: CandidateProfile = {
  id: "profile_demo",
  firstName: "Alex",
  email: "alex@example.com",
  cvFileUrl: "/mock-cv.pdf",
  cvText: "Business school student interested in sports marketing, partnerships and international events.",
  targetCountries: ["Switzerland", "Australia", "Singapore"],
  targetCities: ["Geneva", "Lausanne", "Sydney", "Singapore"],
  targetIndustries: ["Sport", "Events", "Marketing", "Sponsorship"],
  desiredRoles: ["Partnerships & Sponsorship", "Sports Business & Entertainment"],
  internshipStartDate: "2026-07",
  internshipDuration: "6 months",
  languagesSpoken: ["English", "French"],
  minimumCompensation: "",
  companiesAlreadyAppliedTo: ["Decathlon"],
  idealInternshipDescription: "",
  thingsToAvoid: "Pure sales roles, unpaid remote-only internships, senior roles.",
  createdAt: now
};

function offer(id: string, title: string, company: string, city: string, country: string, premium: boolean, score: number, matchType?: PremiumMatchType, broadenedReason = ""): ScoredInternshipOffer {
  return {
    id,
    title,
    company,
    location: `${city}, ${country}`,
    country,
    city,
    url: "https://example.com/careers",
    source: "Company careers page",
    deadline: "Rolling",
    publishedDate: "Recent",
    descriptionSummary: "Support marketing, partnerships, commercial research and event activation for an international organization.",
    requirementsSummary: "Business, marketing or sport management student with strong English.",
    compensation: "Not listed",
    languageRequirements: ["English"],
    rawSourceSnippet: "Mock offer used when external APIs are not configured.",
    matchScore: score,
    qualityScore: score - 3,
    probabilityOfInterview: score - 28,
    whyItMatches: ["Fits target role", "Matches international preference", "Relevant industry exposure"],
    risks: ["Availability needs confirmation", "Competition may be high"],
    applicationAngle: "Lead with sport business interest and practical event or partnership experience.",
    linkedinMessage: "Hi, I am applying for this internship and would value one tip on what your team looks for in junior profiles.",
    coverLetterHook: "I want to help turn sport and event partnerships into visible experiences for audiences and sponsors.",
    isPremium: premium,
    matchType: premium ? matchType ?? "close" : undefined,
    broadenedReason: premium ? broadenedReason : undefined,
    languageFit: premium ? "English-compatible posting; no incompatible local-language requirement found in the mock lead." : undefined
  };
}

function bestOffer(offers: ScoredInternshipOffer[]) {
  return [...offers].sort((a, b) => (b.matchScore + b.qualityScore) - (a.matchScore + a.qualityScore))[0];
}

const matchedSearch = matchSearchBucket(mockCandidateProfile);
const topFreeOffer = bestOffer(matchedSearch.bucket.weeklyFreeOffers);

export const mockOffers: ScoredInternshipOffer[] = [
  ...(topFreeOffer ? [topFreeOffer] : []),
  offer("offer_3", "Commercial Partnerships Intern", "SailGP", "Sydney", "Australia", true, 87, "exact"),
  offer("offer_4", "Business Development Intern", "ONE Championship", "Singapore", "Singapore", true, 85, "close", "Market broadened from Switzerland-focused sport business to Singapore because it is a high-signal English-compatible sports organization."),
  offer("offer_5", "Brand Activation Intern", "Infront Sports & Media", "Zug", "Switzerland", true, 84, "broadened", "Role broadened from partnerships to brand activation within the same sports business career family.")
];

export const mockReport: InternshipSearchReport = {
  id: "report_demo",
  profileId: mockCandidateProfile.id,
  status: "completed",
  isPaid: false,
  matchedSearch,
  freeOffers: topFreeOffer ? [topFreeOffer] : [],
  premiumOffers: mockOffers.filter((item) => item.isPremium).slice(0, 3),
  createdAt: now,
  updatedAt: now
};
