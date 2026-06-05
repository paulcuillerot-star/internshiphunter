import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getStripeClient } from "@/lib/stripe";
import { markReportPaid } from "@/lib/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type StripeWebhookContext = {
  eventType?: string;
  reportId?: string;
  stripeModeConfigured: boolean;
  hasWebhookSecret: boolean;
  hasSignature: boolean;
};

function captureStripeWebhookMessage(message: string, context: StripeWebhookContext, level: Sentry.SeverityLevel = "info") {
  Sentry.withScope((scope) => {
    scope.setTag("feature", "stripe-webhook");
    scope.setTag("eventType", context.eventType ?? "unknown");
    scope.setTag("stripeModeConfigured", String(context.stripeModeConfigured));
    scope.setTag("hasWebhookSecret", String(context.hasWebhookSecret));
    scope.setTag("hasSignature", String(context.hasSignature));
    if (context.reportId) scope.setTag("reportId", context.reportId);
    scope.setContext("stripe_webhook", context);
    Sentry.captureMessage(message, level);
  });
}

function captureStripeWebhookException(error: unknown, context: StripeWebhookContext) {
  Sentry.withScope((scope) => {
    scope.setTag("feature", "stripe-webhook");
    scope.setTag("eventType", context.eventType ?? "unknown");
    scope.setTag("stripeModeConfigured", String(context.stripeModeConfigured));
    scope.setTag("hasWebhookSecret", String(context.hasWebhookSecret));
    scope.setTag("hasSignature", String(context.hasSignature));
    if (context.reportId) scope.setTag("reportId", context.reportId);
    scope.setContext("stripe_webhook", context);
    Sentry.captureException(error);
  });
}

export async function POST(request: Request) {
  const stripe = getStripeClient();
  const signature = request.headers.get("stripe-signature");
  const hasWebhookSecret = Boolean(process.env.STRIPE_WEBHOOK_SECRET);
  const baseContext = {
    stripeModeConfigured: Boolean(stripe),
    hasWebhookSecret,
    hasSignature: Boolean(signature)
  };

  try {
    const rawBody = await request.text();
    captureStripeWebhookMessage("Stripe webhook received", baseContext);

    if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET || !signature) {
      captureStripeWebhookMessage("Stripe webhook mock mode", baseContext, "warning");
      return NextResponse.json({ received: true, mode: "mock" });
    }

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET);
    } catch (error) {
      captureStripeWebhookException(error, baseContext);
      return NextResponse.json({ error: "Webhook signature verification failed." }, { status: 400 });
    }

    const eventContext = { ...baseContext, eventType: event.type };

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const reportId = session.metadata?.reportId;
      captureStripeWebhookMessage("Stripe checkout session completed", { ...eventContext, reportId });

      if (!reportId) {
        captureStripeWebhookMessage("Stripe checkout session missing reportId", eventContext, "warning");
        return NextResponse.json({ received: true });
      }

      try {
        await markReportPaid(reportId);
        captureStripeWebhookMessage("Stripe report marked paid", { ...eventContext, reportId });
      } catch (error) {
        captureStripeWebhookException(error, { ...eventContext, reportId });
        return NextResponse.json({ error: "Failed to mark report as paid." }, { status: 500 });
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    captureStripeWebhookMessage("Stripe webhook failed", baseContext, "error");
    captureStripeWebhookException(error, baseContext);
    return NextResponse.json({ error: "Stripe webhook failed." }, { status: 500 });
  }
}
