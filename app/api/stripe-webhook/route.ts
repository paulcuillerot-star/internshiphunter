import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getStripeClient } from "@/lib/stripe";
import { markReportPaid } from "@/lib/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const stripe = getStripeClient();
  const signature = request.headers.get("stripe-signature");
  const rawBody = await request.text();

  if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET || !signature) {
    return NextResponse.json({ received: true, mode: "mock" });
  }

  const event = stripe.webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET);

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const reportId = session.metadata?.reportId;
    if (reportId) {
      await markReportPaid(reportId);
    }
  }

  return NextResponse.json({ received: true });
}
