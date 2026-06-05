import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";
import { getReportIfAuthorized, updateReportPremiumInputs } from "@/lib/store";
import { getStripeClient } from "@/lib/stripe";
import type { PremiumSearchInputs } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RawPremiumInputs = Record<keyof PremiumSearchInputs, string>;

function splitList(value: string) {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function normalizeInputs(raw: Partial<RawPremiumInputs>): PremiumSearchInputs {
  return {
    targetCountries: splitList(raw.targetCountries ?? ""),
    targetCities: splitList(raw.targetCities ?? ""),
    languagesSpoken: splitList(raw.languagesSpoken ?? ""),
    internshipStartDate: String(raw.internshipStartDate ?? "").trim(),
    internshipDuration: String(raw.internshipDuration ?? "").trim(),
    companiesAlreadyAppliedTo: splitList(raw.companiesAlreadyAppliedTo ?? ""),
    thingsToAvoid: String(raw.thingsToAvoid ?? "").trim(),
    profileSummary: String(raw.profileSummary ?? "").trim(),
    idealInternshipDescription: String(raw.idealInternshipDescription ?? "").trim()
  };
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

export async function POST(request: Request) {
  const { reportId, token, premiumInputs: rawPremiumInputs } = (await request.json()) as { reportId?: string; token?: string; premiumInputs?: Partial<RawPremiumInputs> };

  if (!reportId) {
    return NextResponse.json({ error: "Missing reportId." }, { status: 400 });
  }

  const report = await getReportIfAuthorized(reportId, token);
  if (!report) {
    return NextResponse.json({ error: "Unauthorized report access." }, { status: 403 });
  }

  const premiumInputs = normalizeInputs(rawPremiumInputs ?? {});
  if (!premiumInputs.targetCountries.length || !premiumInputs.languagesSpoken.length) {
    capturePremiumCheckout("Premium inputs validation failed", reportId, premiumInputs, "warning");
    return NextResponse.json({ error: "Target countries and languages are required." }, { status: 400 });
  }

  try {
    await updateReportPremiumInputs(reportId, premiumInputs);
    capturePremiumCheckout("Premium inputs saved", reportId, premiumInputs);

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
    const tokenParam = report.accessToken ? `token=${encodeURIComponent(report.accessToken)}` : "";
    const paidQuery = [tokenParam, "paid=true"].filter(Boolean).join("&");
    const cancelQuery = [tokenParam, "payment=cancelled"].filter(Boolean).join("&");
    const stripe = getStripeClient();

    if (!stripe) {
      capturePremiumCheckout("Premium checkout session created after inputs", reportId, premiumInputs);
      const mockQuery = [tokenParam, "mockPaid=true"].filter(Boolean).join("&");
      return NextResponse.json({ url: `${siteUrl}/premium/${reportId}${mockQuery ? `?${mockQuery}` : ""}` });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
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
