import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";
import { getReportIfAuthorized, updateReportPremiumInputs } from "@/lib/store";
import { getStripeClient } from "@/lib/stripe";
import type { PremiumSearchInputs } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RawPremiumInputs = Record<keyof PremiumSearchInputs, string>;

const languageAliases: Record<string, string> = {
  french: "French",
  francais: "French",
  français: "French",
  fr: "French",
  english: "English",
  anglais: "English",
  en: "English",
  italian: "Italian",
  italien: "Italian",
  it: "Italian",
  spanish: "Spanish",
  espagnol: "Spanish",
  es: "Spanish",
  german: "German",
  allemand: "German",
  de: "German",
  dutch: "Dutch",
  neerlandais: "Dutch",
  néerlandais: "Dutch",
  nl: "Dutch",
  portuguese: "Portuguese",
  portugais: "Portuguese",
  pt: "Portuguese"
};

const countryAliases: Record<string, string> = {
  france: "France",
  switzerland: "Switzerland",
  suisse: "Switzerland",
  belgium: "Belgium",
  belgique: "Belgium",
  netherlands: "Netherlands",
  holland: "Netherlands",
  paysbas: "Netherlands",
  "pays-bas": "Netherlands",
  germany: "Germany",
  allemagne: "Germany",
  italy: "Italy",
  italie: "Italy",
  spain: "Spain",
  espagne: "Spain",
  portugal: "Portugal",
  "united kingdom": "United Kingdom",
  uk: "United Kingdom",
  england: "United Kingdom",
  ireland: "Ireland",
  irlande: "Ireland",
  luxembourg: "Luxembourg",
  monaco: "Monaco",
  austria: "Austria",
  autriche: "Austria",
  denmark: "Denmark",
  danemark: "Denmark",
  sweden: "Sweden",
  suede: "Sweden",
  suède: "Sweden",
  norway: "Norway",
  norvege: "Norway",
  norvège: "Norway",
  finland: "Finland",
  finlande: "Finland",
  "united states": "United States",
  usa: "United States",
  us: "United States",
  canada: "Canada",
  australia: "Australia",
  australie: "Australia",
  singapore: "Singapore",
  singapour: "Singapore",
  "united arab emirates": "United Arab Emirates",
  uae: "United Arab Emirates",
  "emirats arabes unis": "United Arab Emirates",
  "émirats arabes unis": "United Arab Emirates"
};

const countryAliasKeys = Object.keys(countryAliases).sort((a, b) => b.length - a.length);

function normalizeKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function titleCase(value: string) {
  return value
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function unique(items: string[]) {
  return Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)));
}

function splitList(value: string) {
  return unique(String(value ?? "").split(/[,;\/\n]+/).map((item) => item.trim()));
}

function splitLooseWords(value: string) {
  return unique(String(value ?? "").replace(/[;\/\n]+/g, ",").split(/[ ,]+/).map((item) => item.trim()));
}

function normalizeLanguages(value: string) {
  const directParts = splitList(value);
  const parts = directParts.length === 1 && directParts[0]?.includes(" ") ? splitLooseWords(value) : directParts;
  return unique(parts.map((part) => languageAliases[normalizeKey(part)] ?? titleCase(part)));
}

function splitTrailingCountry(value: string) {
  const key = normalizeKey(value);

  for (const countryKey of countryAliasKeys) {
    const country = countryAliases[countryKey];
    if (key === countryKey) {
      return { country };
    }

    if (key.endsWith(` ${countryKey}`)) {
      const city = titleCase(key.slice(0, -countryKey.length).trim());
      if (city) {
        return { city, country };
      }
    }
  }

  return null;
}

function normalizeLocationParts(...values: string[]) {
  const combined = values.filter(Boolean).join(",");
  const parts = splitList(combined).flatMap((part) => {
    const split = splitTrailingCountry(part);
    if (split?.city && split.country) return [split.city, split.country];
    if (split?.country) return [split.country];

    return [titleCase(part)];
  });
  return unique(parts);
}

function classifyLocations(rawCountries: string, rawCities: string) {
  const parts = normalizeLocationParts(rawCountries, rawCities);
  const targetCountries: string[] = [];
  const targetCities: string[] = [];

  for (const part of parts) {
    const country = countryAliases[normalizeKey(part)];
    if (country) {
      targetCountries.push(country);
    } else {
      targetCities.push(part);
    }
  }

  return { targetCountries: unique(targetCountries), targetCities: unique(targetCities) };
}

function normalizeInputs(raw: Partial<RawPremiumInputs>): PremiumSearchInputs {
  const locations = classifyLocations(raw.targetCountries ?? "", raw.targetCities ?? "");
  return {
    targetCountries: locations.targetCountries,
    targetCities: locations.targetCities,
    languagesSpoken: normalizeLanguages(raw.languagesSpoken ?? ""),
    internshipStartDate: String(raw.internshipStartDate ?? "").trim(),
    internshipDuration: String(raw.internshipDuration ?? "").trim(),
    companiesAlreadyAppliedTo: splitList(raw.companiesAlreadyAppliedTo ?? ""),
    thingsToAvoid: String(raw.thingsToAvoid ?? "").trim(),
    profileSummary: String(raw.profileSummary ?? "").trim(),
    idealInternshipDescription: String(raw.idealInternshipDescription ?? "").trim()
  };
}

function hasUsableInputs(inputs: PremiumSearchInputs) {
  return (inputs.targetCountries.length > 0 || inputs.targetCities.length > 0) && inputs.languagesSpoken.length > 0;
}

function hasSubmittedInputValues(raw?: Partial<RawPremiumInputs>) {
  return Boolean(raw && Object.values(raw).some((value) => String(value ?? "").trim().length > 0));
}

function premiumUrl(siteUrl: string, reportId: string, token?: string) {
  const params = new URLSearchParams();
  if (token) params.set("token", token);
  params.set("refresh", String(Date.now()));
  return `${siteUrl}/premium/${reportId}?${params.toString()}`;
}

function capturePremiumCheckout(message: string, reportId: string | undefined, inputs: PremiumSearchInputs | undefined, level: "info" | "warning" | "error" = "info") {
  Sentry.withScope((scope) => {
    scope.setTag("feature", "premium-search");
    if (reportId) scope.setTag("reportId", reportId);
    scope.setContext("premium_checkout", {
      reportId,
      hasPremiumInputs: Boolean(inputs),
      targetCountriesCount: inputs?.targetCountries.length ?? 0,
      targetCitiesCount: inputs?.targetCities.length ?? 0,
      languagesCount: inputs?.languagesSpoken.length ?? 0,
      premiumSearchStatus: "pending_payment"
    });
    Sentry.captureMessage(message, level);
  });
}

function captureUnpaidReportWithExistingOffers({
  reportId,
  premiumSearchStatus,
  offerCount,
  hasPremiumInputs,
  hasSubmittedInputs,
  submittedInputsUsable
}: {
  reportId: string;
  premiumSearchStatus?: string;
  offerCount: number;
  hasPremiumInputs: boolean;
  hasSubmittedInputs: boolean;
  submittedInputsUsable: boolean;
}) {
  Sentry.withScope((scope) => {
    scope.setTag("feature", "premium-search");
    scope.setTag("reportId", reportId);
    scope.setContext("premium_checkout_existing_offers", {
      reportId,
      isPaid: false,
      premiumSearchStatus: premiumSearchStatus ?? "not_started",
      offerCount,
      hasPremiumInputs,
      hasSubmittedInputs,
      submittedInputsUsable
    });
    Sentry.captureMessage("Unpaid report has premium offers; continuing checkout instead of redirecting", "warning");
  });
}

export async function POST(request: Request) {
  const { reportId, token, premiumInputs: rawPremiumInputs } = (await request.json()) as { reportId?: string; token?: string; premiumInputs?: Partial<RawPremiumInputs> };

  if (!reportId) {
    return NextResponse.json({ error: "Missing reportId." }, { status: 400 });
  }

  const report = await getReportIfAuthorized(reportId, token);
  if (!report) {
    return NextResponse.json({ error: "Unauthorized report access." }, { status: 403 });
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const tokenParam = report.accessToken ? `token=${encodeURIComponent(report.accessToken)}` : "";

  if (report.isPaid) {
    return NextResponse.json({ url: premiumUrl(siteUrl, reportId, report.accessToken) });
  }

  const submittedInputs = hasSubmittedInputValues(rawPremiumInputs) ? normalizeInputs(rawPremiumInputs ?? {}) : undefined;
  const submittedInputsUsable = Boolean(submittedInputs && hasUsableInputs(submittedInputs));
  const premiumInputs = submittedInputsUsable ? submittedInputs : report.premiumInputs;

  if (report.premiumOffers.length > 0) {
    captureUnpaidReportWithExistingOffers({
      reportId,
      premiumSearchStatus: report.premiumSearchStatus,
      offerCount: report.premiumOffers.length,
      hasPremiumInputs: Boolean(report.premiumInputs),
      hasSubmittedInputs: Boolean(submittedInputs),
      submittedInputsUsable
    });
  }

  if (!premiumInputs || !hasUsableInputs(premiumInputs)) {
    capturePremiumCheckout("Premium inputs validation failed", reportId, submittedInputs, "warning");
    return NextResponse.json({ error: "Please add at least one target location and one language." }, { status: 400 });
  }

  try {
    if (submittedInputsUsable && premiumInputs === submittedInputs) {
      await updateReportPremiumInputs(reportId, premiumInputs);
      capturePremiumCheckout("Premium inputs saved", reportId, premiumInputs);
    } else {
      capturePremiumCheckout("Saved premium inputs reused for checkout", reportId, premiumInputs);
    }

    const paidQuery = [tokenParam, "paid=true", "session_id={CHECKOUT_SESSION_ID}"].filter(Boolean).join("&");
    const cancelQuery = [tokenParam, "payment=cancelled"].filter(Boolean).join("&");
    const stripe = getStripeClient();

    if (!stripe) {
      capturePremiumCheckout("Premium checkout session created after inputs", reportId, premiumInputs);
      const mockQuery = [tokenParam, "mockPaid=true"].filter(Boolean).join("&");
      return NextResponse.json({ url: `${siteUrl}/premium/${reportId}${mockQuery ? `?${mockQuery}` : ""}` });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      allow_promotion_codes: true,
      line_items: [
        {
          price_data: {
            currency: "eur",
            unit_amount: 590,
            product_data: {
              name: "Internship Hunter premium report"
            }
          },
          quantity: 1
        }
      ],
      metadata: { reportId },
      success_url: `${siteUrl}/premium/${reportId}${paidQuery ? `?${paidQuery}` : ""}`,
      cancel_url: `${siteUrl}/premium/${reportId}${cancelQuery ? `?${cancelQuery}` : ""}`
    });

    capturePremiumCheckout("Premium checkout session created after inputs", reportId, premiumInputs);
    return NextResponse.json({ url: session.url });
  } catch (error) {
    Sentry.withScope((scope) => {
      scope.setTag("feature", "premium-search");
      scope.setTag("reportId", reportId);
      scope.setContext("premium_checkout_failure", {
        reportId,
        hasPremiumInputs: Boolean(premiumInputs),
        targetCountriesCount: premiumInputs.targetCountries.length,
        targetCitiesCount: premiumInputs.targetCities.length,
        languagesCount: premiumInputs.languagesSpoken.length,
        premiumSearchStatus: "pending_payment"
      });
      Sentry.captureException(error);
    });
    return NextResponse.json({ error: "Could not save premium criteria or create checkout." }, { status: 500 });
  }
}
