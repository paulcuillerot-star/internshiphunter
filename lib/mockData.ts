import type { CandidateProfile, InternshipSearchReport, ScoredInternshipOffer } from "./types";
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
  desiredRoles: ["Marketing intern", "Partnerships intern", "Business development intern"],
  internshipStartDate: "2026-07",
  internshipDuration: "6 months",
  languagesSpoken: ["English", "French"],
  minimumCompensation: "Paid preferred",
  companiesAlreadyAppliedTo: ["Decathlon"],
  idealInternshipDescription: "A hands-on role around sports events, partnerships or brand activation.",
  thingsToAvoid: "Pure sales roles, unpaid remote-only internships, senior roles.",
  createdAt: now
};

function offer(id: string, title: string, company: string, city: string, country: string, premium: boolean, score: number): ScoredInternshipOffer {
  return { id, title, company, location: `${city}, ${country}`, country, city, url: "https://example.com/careers", source: "Company careers page", deadline: "Rolling", publishedDate: "Recent", descriptionSummary: "Support marketing, partnerships, commercial research and event activation for an international organization.", requirementsSummary: "Business, marketing or sport management student with strong English.", compensation: "Not listed", languageRequirements: ["English"], rawSourceSnippet: "Mock offer used when external APIs are not configured.", matchScore: score, qualityScore: score - 3, probabilityOfInterview: score - 28, whyItMatches: ["Fits target role", "Matches international preference", "Relevant industry exposure"], risks: ["Availability needs confirmation", "Competition may be high"], applicationAngle: "Lead with sport business interest and practical event or partnership experience.", linkedinMessage: "Hi, I am applying for this internship and would value one tip on what your team looks for in junior profiles.", coverLetterHook: "I want to help turn sport and event partnerships into visible experiences for audiences and sponsors.", isPremium: premium };
}

const matchedSearch = matchSearchBucket(mockCandidateProfile);

export const mockOffers: ScoredInternshipOffer[] = [
  ...matchedSearch.bucket.weeklyFreeOffers,
  offer("offer_3", "Commercial Partnerships Intern", "SailGP", "Sydney", "Australia", true, 87),
  offer("offer_4", "Business Development Intern", "ONE Championship", "Singapore", "Singapore", true, 85),
  offer("offer_5", "Brand Activation Intern", "Infront Sports & Media", "Zug", "Switzerland", true, 84),
  offer("offer_6", "Marketing Intern, Major Events", "Sport Singapore", "Singapore", "Singapore", true, 82),
  offer("offer_7", "Sponsorship and Events Intern", "Australian Grand Prix Corporation", "Melbourne", "Australia", true, 80)
];

export const mockReport: InternshipSearchReport = {
  id: "report_demo",
  profileId: mockCandidateProfile.id,
  status: "completed",
  isPaid: false,
  matchedSearch,
  freeOffers: matchedSearch.bucket.weeklyFreeOffers,
  premiumOffers: mockOffers.filter((item) => item.isPremium),
  createdAt: now,
  updatedAt: now
};
