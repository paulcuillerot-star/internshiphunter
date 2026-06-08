import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";
import { getStripeClient } from "@/lib/stripe";
import { getReport, getReportIfAuthorized, markReportPaid, updateReportPremiumSearchStatus } from "@/lib/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ConfirmationOutcome = "paid" | "invalid" | "error";

const terminalPremiumStatuses = new Set(["running", "completed", "failed"]);

function captureConfirmationMessage(
  message: string,
  context: {
    reportId?: string;
    hasSessionId: boolean;
    sessionPaymentStatus?: string | null;
    sessionStatus?: string | null;
    outcome: ConfirmationOutcome;
  },
  level: "info" | "warning" | "error" = "info"
) {
  Sentry.withScope((scope) => {
    scope.setTag("feature", "premium-checkout-confirmation");
    scope.setTag("outcome", context.outcome);
    scope.setTag("hasSessionId", String(context.hasSessionId));
    if (context.reportId) scope.setTag("reportId", context.reportId);
    if (context.sessionPaymentStatus) scope.setTag("sessionPaymentStatus", context.sessionPaymentStatus);
    if (context.sessionStatus) scope.setTag("sessionStatus", context.sessionStatus);
    scope.setContext("premium_checkout_confirmation", context);
    Sentry.captureMessage(message, level);
  });
}

function captureConfirmationException(
  error: unknown,
  context: {
    reportId?: string;
    hasSessionId: boolean;
    sessionPaymentStatus?: string | null;
    sessionStatus?: string | null;
    outcome: ConfirmationOutcome;
  }
) {
  Sentry.withScope((scope) => {
    scope.setTag("feature", "premium-checkout-confirmation");
    scope.setTag("outcome", context.outcome);
    scope.setTag("hasSessionId", String(context.hasSessionId));
    if (context.reportId) scope.setTag("reportId", context.reportId);
    if (context.sessionPaymentStatus) scope.setTag("sessionPaymentStatus", context.sessionPaymentStatus);
    if (context.sessionStatus) scope.setTag("sessionStatus", context.sessionStatus);
    scope.setContext("premium_checkout_confirmation", context);
    Sentry.captureException(error);
  });
}

async function markPremiumSearchReadyIfNeeded(reportId: string) {
  const report = await getReport(reportId);
  if (!report?.premiumInputs) return;

  const status = report.premiumSearchStatus ?? "not_started";
  if (terminalPremiumStatuses.has(status)) return;

  await updateReportPremiumSearchStatus(reportId, "ready_to_run");
}

export async function POST(request: Request) {
  const { reportId, token, sessionId } = (await request.json()) as { reportId?: string; token?: string; sessionId?: string };
  const baseContext = { reportId, hasSessionId: Boolean(sessionId), outcome: "invalid" as ConfirmationOutcome };

  if (!reportId || !sessionId) {
    captureConfirmationMessage("Premium checkout confirmation missing required fields", baseContext, "warning");
    return NextResponse.json({ error: "Missing reportId or sessionId." }, { status: 400 });
  }

  const report = await getReportIfAuthorized(reportId, token);
  if (!report) {
    captureConfirmationMessage("Premium checkout confirmation unauthorized", baseContext, "warning");
    return NextResponse.json({ error: "Unauthorized report access." }, { status: 403 });
  }

  const stripe = getStripeClient();
  if (!stripe) {
    captureConfirmationMessage("Premium checkout confirmation missing Stripe config", baseContext, "error");
    return NextResponse.json({ error: "Stripe is not configured." }, { status: 400 });
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const context = {
      reportId,
      hasSessionId: true,
      sessionPaymentStatus: session.payment_status,
      sessionStatus: session.status,
      outcome: "invalid" as ConfirmationOutcome
    };

    if (session.metadata?.reportId !== reportId) {
      captureConfirmationMessage("Premium checkout confirmation report mismatch", context, "warning");
      return NextResponse.json({ error: "Checkout session does not match this report." }, { status: 403 });
    }

    const completed = session.status === "complete";
    const paid = session.payment_status === "paid" || session.payment_status === "no_payment_required";

    if (!completed || !paid) {
      captureConfirmationMessage("Premium checkout confirmation session not paid", context, "warning");
      return NextResponse.json({ error: "Checkout session is not completed or paid." }, { status: 400 });
    }

    await markReportPaid(reportId);
    await markPremiumSearchReadyIfNeeded(reportId);
    captureConfirmationMessage("Premium checkout session confirmed", { ...context, outcome: "paid" });
    return NextResponse.json({ status: "paid" });
  } catch (error) {
    captureConfirmationMessage("Premium checkout confirmation failed", { ...baseContext, outcome: "error" }, "error");
    captureConfirmationException(error, { ...baseContext, outcome: "error" });
    return NextResponse.json({ error: "Could not confirm checkout session." }, { status: 500 });
  }
}
