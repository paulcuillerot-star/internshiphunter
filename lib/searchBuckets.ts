import type { CandidateProfile, MatchedSearchBucket, SearchBucket, SearchCategory, SearchRegion, WeeklyFreeOffer } from "./types";

export const searchCategories: SearchCategory[] = [
  ["sales_bd_partnerships", "Sales, Business Development & Partnerships"],
  ["marketing_brand_growth", "Marketing, Brand & Growth"],
  ["strategy_consulting_project_management", "Strategy, Consulting & Project Management"],
  ["finance_investment_ma", "Finance, Investment & M&A"],
  ["startup_founder_operations", "Startup, Founder Associate & Operations"],
  ["product_tech_business_data", "Product, Tech Business & Data"],
  ["luxury_retail_consumer_ecommerce", "Luxury, Retail, Consumer Goods & E-commerce"],
  ["sports_events_entertainment_hospitality", "Sports, Events, Entertainment & Hospitality"]
].map(([id, name]) => ({ id, name }));

export const internshipTrackLabels = searchCategories.map((category) => category.name);
export const marketChoices = ["Europe", "International outside Europe"] as const;

const categoryById = Object.fromEntries(searchCategories.map((item) => [item.id, item])) as Record<string, SearchCategory>;
const categoryByName = Object.fromEntries(searchCategories.map((item) => [item.name.toLowerCase(), item])) as Record<string, SearchCategory>;

const legacyCategoryAliases: Record<string, string> = {
  "Consulting & Strategy": "strategy_consulting_project_management",
  "Finance & Investment": "finance_investment_ma",
  "Audit, Risk & Transaction Services": "finance_investment_ma",
  "Marketing & Brand Management": "marketing_brand_growth",
  "Digital Marketing & Growth": "marketing_brand_growth",
  "Sales & Business Development": "sales_bd_partnerships",
  "Partnerships & Sponsorship": "sales_bd_partnerships",
  "Event Management & Operations": "sports_events_entertainment_hospitality",
  "E-commerce & Marketplace": "luxury_retail_consumer_ecommerce",
  "Product Management": "product_tech_business_data",
  "Data Analytics & Business Intelligence": "product_tech_business_data",
  "Operations & Project Management": "strategy_consulting_project_management",
  "Supply Chain & Procurement": "startup_founder_operations",
  "Human Resources & Talent": "startup_founder_operations",
  "Entrepreneurship & Venture Building": "startup_founder_operations",
  "Sustainability & CSR": "strategy_consulting_project_management",
  "Luxury, Fashion & Retail Management": "luxury_retail_consumer_ecommerce",
  "Hospitality, Tourism & Travel": "sports_events_entertainment_hospitality",
  "Sports Business & Entertainment": "sports_events_entertainment_hospitality",
  "International Business & Export": "sales_bd_partnerships"
};

const rules: Array<[string, string[]]> = [
  ["sales_bd_partnerships", ["sales", "business development", "partnership", "sponsorship", "commercial", "account management", "export", "market entry"]],
  ["marketing_brand_growth", ["marketing", "brand", "growth", "seo", "paid ads", "crm", "acquisition", "activation", "content"]],
  ["strategy_consulting_project_management", ["consulting", "strategy", "transformation", "project management", "analyst", "csr", "sustainability", "impact"]],
  ["finance_investment_ma", ["finance", "investment", "m&a", "merger", "private equity", "asset management", "audit", "risk", "transaction", "compliance"]],
  ["startup_founder_operations", ["startup", "founder associate", "venture", "incubator", "operations", "supply chain", "procurement", "talent", "recruitment"]],
  ["product_tech_business_data", ["product", "tech", "data", "analytics", "bi", "dashboard", "reporting", "roadmap", "user research"]],
  ["luxury_retail_consumer_ecommerce", ["luxury", "fashion", "retail", "consumer goods", "e-commerce", "ecommerce", "marketplace", "merchandising", "buying"]],
  ["sports_events_entertainment_hospitality", ["sport", "sports", "event", "events", "entertainment", "hospitality", "tourism", "travel", "hotel", "matchday", "fan engagement"]]
];

function profileText(profile: CandidateProfile) {
  return [...profile.targetCountries, ...profile.targetCities, ...profile.targetIndustries, ...profile.desiredRoles, ...profile.languagesSpoken, profile.idealInternshipDescription, profile.thingsToAvoid].join(" ").toLowerCase();
}

function marketText(profile: CandidateProfile) {
  return [...profile.targetCountries, ...profile.targetCities].join(" ").toLowerCase();
}

function any(value: string, words: string[]) {
  return words.some((word) => value.includes(word));
}

function selectedCategories(profile: CandidateProfile): SearchCategory[] {
  return profile.desiredRoles
    .map((role) => bucketsById[role]?.category ?? categoryByName[role.toLowerCase()] ?? categoryById[legacyCategoryAliases[role] ?? ""])
    .filter((item): item is SearchCategory => Boolean(item));
}

function selectedBuckets(profile: CandidateProfile): SearchBucket[] {
  return profile.desiredRoles
    .map((role) => bucketsById[role])
    .filter((item): item is SearchBucket => Boolean(item));
}

export function detectSearchRegion(profile: CandidateProfile): SearchRegion {
  const value = marketText(profile);
  if (any(value, ["international outside europe", "outside europe", "north america", "asia-pacific", "asia pacific", "middle east", "australia", "singapore", "usa", "united states", "canada", "dubai", "uae", "remote", "international"])) return "International outside Europe";
  if (any(value, ["europe", "switzerland", "france", "germany", "italy", "spain", "netherlands", "united kingdom", "uk", "ireland", "belgium", "luxembourg", "austria", "denmark", "sweden", "norway", "finland", "geneva", "lausanne", "zurich", "bern", "basel"])) return "Europe";
  return "Europe";
}

export function detectSearchCategory(profile: CandidateProfile): SearchCategory {
  const selected = selectedCategories(profile);
  if (selected[0]) return selected[0];
  const value = profileText(profile);
  const best = rules.map(([categoryId, words]) => ({ categoryId, score: words.filter((word) => value.includes(word)).length })).sort((a, b) => b.score - a.score)[0];
  return best?.score ? categoryById[best.categoryId] : categoryById.marketing_brand_growth;
}

function offer(id: string, title: string, company: string, city: string, country: string, summary: string, score = 82): WeeklyFreeOffer {
  return {
    id,
    title,
    company,
    location: `${city}, ${country}`,
    country,
    city,
    url: "https://example.com/careers",
    source: "Cached weekly example",
    deadline: "Check employer page",
    publishedDate: "Weekly cached example",
    descriptionSummary: summary,
    requirementsSummary: "Business school student profile; requirements and dates must be verified on the employer website.",
    compensation: "Not live verified",
    languageRequirements: ["English"],
    rawSourceSnippet: "Cached/mock weekly example for the free search track. Not live-verified.",
    matchScore: score,
    qualityScore: score - 5,
    probabilityOfInterview: score - 35,
    whyItMatches: ["Fits the selected internship track", "Relevant business-school responsibilities", "Good example of the target market"],
    risks: ["Cached example, not a live-verified vacancy", "Eligibility and deadline need confirmation"],
    applicationAngle: "Use this as a directionally relevant example before unlocking personalized live search.",
    linkedinMessage: "Hi, I am exploring internships in this field and would value one tip on what junior profiles should highlight.",
    coverLetterHook: "I am looking for an internship where I can turn business-school training into practical project impact.",
    isPremium: false
  };
}

function bucket(id: string, categoryId: string, region: SearchRegion, title: string, companyA: string, cityA: string, countryA: string, roleA: string, companyB: string, cityB: string, countryB: string, roleB: string): SearchBucket {
  return {
    id,
    category: categoryById[categoryId],
    region,
    displayTitle: title,
    shortDescription: `${title} cached weekly examples.`,
    whyThisBucketFits: `This bucket matches ${categoryById[categoryId].name} interests in ${region}.`,
    fallbackBucketId: region === "Europe" ? "marketing_brand_growth_europe" : "marketing_brand_growth_international",
    weeklyFreeOffers: [
      offer(`${id}_1`, roleA, companyA, cityA, countryA, `Cached example for ${roleA} responsibilities in ${title}.`, 84),
      offer(`${id}_2`, roleB, companyB, cityB, countryB, `Cached example for ${roleB} responsibilities in ${title}.`, 82)
    ]
  };
}

export const searchBuckets: SearchBucket[] = [
  bucket("sales_bd_partnerships_europe", "sales_bd_partnerships", "Europe", "Sales, Business Development & Partnerships in Europe", "Decathlon", "Lille", "France", "Business Development Intern", "UEFA", "Nyon", "Switzerland", "Partnerships Intern"),
  bucket("marketing_brand_growth_europe", "marketing_brand_growth", "Europe", "Marketing, Brand & Growth in Europe", "Danone", "Paris", "France", "Brand Marketing Intern", "Philips", "Amsterdam", "Netherlands", "Growth Marketing Intern"),
  bucket("strategy_consulting_project_management_europe", "strategy_consulting_project_management", "Europe", "Strategy, Consulting & Project Management in Europe", "Roland Berger", "Munich", "Germany", "Strategy Analyst Intern", "BearingPoint", "Amsterdam", "Netherlands", "Transformation Project Intern"),
  bucket("finance_investment_ma_europe", "finance_investment_ma", "Europe", "Finance, Investment & M&A in Europe", "BNP Paribas", "Paris", "France", "M&A Analyst Intern", "Pictet", "Geneva", "Switzerland", "Investment Analyst Intern"),
  bucket("startup_founder_operations_europe", "startup_founder_operations", "Europe", "Startup, Founder Associate & Operations in Europe", "Entrepreneur First", "London", "United Kingdom", "Founder Associate Intern", "Back Market", "Paris", "France", "Operations Intern"),
  bucket("product_tech_business_data_europe", "product_tech_business_data", "Europe", "Product, Tech Business & Data in Europe", "Booking.com", "Amsterdam", "Netherlands", "Business Analytics Intern", "Miro", "Berlin", "Germany", "Product Operations Intern"),
  bucket("luxury_retail_consumer_ecommerce_europe", "luxury_retail_consumer_ecommerce", "Europe", "Luxury, Retail, Consumer Goods & E-commerce in Europe", "LVMH", "Paris", "France", "Retail Marketing Intern", "Zalando", "Berlin", "Germany", "Marketplace Operations Intern"),
  bucket("sports_events_entertainment_hospitality_europe", "sports_events_entertainment_hospitality", "Europe", "Sports, Events, Entertainment & Hospitality in Europe", "FIFA", "Zurich", "Switzerland", "Sports Business Intern", "Accor", "Paris", "France", "Hospitality Commercial Intern"),
  bucket("sales_bd_partnerships_international", "sales_bd_partnerships", "International outside Europe", "Sales, Business Development & Partnerships International", "Salesforce", "Singapore", "Singapore", "Business Development Intern", "Infront Sports & Media", "Singapore", "Singapore", "Sponsorship Sales Intern"),
  bucket("marketing_brand_growth_international", "marketing_brand_growth", "International outside Europe", "Marketing, Brand & Growth International", "Canva", "Sydney", "Australia", "Growth Marketing Intern", "HubSpot", "Remote", "International", "CRM Marketing Intern"),
  bucket("strategy_consulting_project_management_international", "strategy_consulting_project_management", "International outside Europe", "Strategy, Consulting & Project Management International", "Deloitte", "Dubai", "United Arab Emirates", "Strategy Consulting Intern", "Bain & Company", "Singapore", "Singapore", "Associate Consultant Intern"),
  bucket("finance_investment_ma_international", "finance_investment_ma", "International outside Europe", "Finance, Investment & M&A International", "Macquarie Group", "Sydney", "Australia", "Investment Banking Intern", "DBS Bank", "Singapore", "Singapore", "Corporate Finance Intern"),
  bucket("startup_founder_operations_international", "startup_founder_operations", "International outside Europe", "Startup, Founder Associate & Operations International", "Antler", "Singapore", "Singapore", "Venture Building Intern", "Airwallex", "Melbourne", "Australia", "Operations Intern"),
  bucket("product_tech_business_data_international", "product_tech_business_data", "International outside Europe", "Product, Tech Business & Data International", "Atlassian", "Sydney", "Australia", "Product Analyst Intern", "Grab", "Singapore", "Singapore", "Business Intelligence Intern"),
  bucket("luxury_retail_consumer_ecommerce_international", "luxury_retail_consumer_ecommerce", "International outside Europe", "Luxury, Retail, Consumer Goods & E-commerce International", "Lululemon", "Vancouver", "Canada", "Retail Operations Intern", "Shopee", "Singapore", "Singapore", "E-commerce Campaign Intern"),
  bucket("sports_events_entertainment_hospitality_international", "sports_events_entertainment_hospitality", "International outside Europe", "Sports, Events, Entertainment & Hospitality International", "IMG", "New York", "United States", "Sports Partnerships Intern", "Marriott", "Dubai", "United Arab Emirates", "Hospitality Marketing Intern")
];

export const priorityBucketIds = searchBuckets.filter((bucketItem) => bucketItem.region === "Europe").map((bucketItem) => bucketItem.id);

const bucketsById = Object.fromEntries(searchBuckets.map((item) => [item.id, item])) as Record<string, SearchBucket>;
const activeFreeBucketIds = new Set(priorityBucketIds);
const suffix: Record<"Europe" | "International outside Europe", string> = { Europe: "europe", "International outside Europe": "international" };

export const freeTrackOptions = priorityBucketIds.map((bucketId) => {
  const bucketItem = bucketsById[bucketId];
  return { id: bucketItem.id, label: bucketItem.displayTitle };
});

export function getActiveFreeBucketById(bucketId: string) {
  const bucketItem = bucketsById[bucketId];
  return bucketItem && activeFreeBucketIds.has(bucketItem.id) ? bucketItem : undefined;
}

function bucketIdFor(categoryId: string, region: SearchRegion) {
  const normalizedRegion = region === "Europe" ? "Europe" : "International outside Europe";
  return `${categoryId}_${suffix[normalizedRegion]}`;
}

function fallbackBucket(categoryId: string, region: SearchRegion) {
  const normalizedRegion = region === "Europe" ? "Europe" : "International outside Europe";
  return searchBuckets.find((item) => item.category.id === categoryId && item.region === normalizedRegion) ?? searchBuckets.find((item) => item.region === normalizedRegion) ?? bucketsById.marketing_brand_growth_europe;
}

export function matchSearchBucketFromBucketId(bucketId: string): MatchedSearchBucket | undefined {
  const bucketItem = getActiveFreeBucketById(bucketId);
  if (!bucketItem) return undefined;
  return { category: bucketItem.category, region: "Europe", bucket: bucketItem, explanation: `${bucketItem.category.name} is the closest track based on your selected internship track and Europe free market. ${bucketItem.whyThisBucketFits}` };
}

export function matchSearchBucket(profile: CandidateProfile): MatchedSearchBucket {
  const region: SearchRegion = "Europe";
  const exactBucket = selectedBuckets(profile).find((candidate) => activeFreeBucketIds.has(candidate.id));
  if (exactBucket) {
    return { category: exactBucket.category, region, bucket: exactBucket, explanation: `${exactBucket.category.name} is the closest track based on your selected internship track and Europe free market. ${exactBucket.whyThisBucketFits}` };
  }

  const selected = selectedCategories(profile);
  const exact = selected.map((category) => bucketsById[bucketIdFor(category.id, region)]).find((candidate): candidate is SearchBucket => Boolean(candidate));
  const category = exact?.category ?? selected[0] ?? detectSearchCategory(profile);
  const selectedBucket = exact ?? bucketsById[bucketIdFor(category.id, region)] ?? fallbackBucket(category.id, region);
  return { category, region, bucket: selectedBucket, explanation: `${category.name} is the closest track based on your selected internship track and Europe free market. ${selectedBucket.whyThisBucketFits}` };
}
