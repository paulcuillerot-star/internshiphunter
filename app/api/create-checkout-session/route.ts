import { NextResponse } from "next/server";
import { getStripeClient } from "@/lib/stripe";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const { reportId } = (await request.json()) as { reportId?: string };

  if (!reportId) {
    return NextResponse.json({ error: "Missing reportId." }, { status: 400 });
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const stripe = getStripeClient();

  if (!stripe) {
    return NextResponse.json({ url: `${siteUrl}/premium/${reportId}?mockPaid=true` });
  }

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [
      {
        price_data: {
          currency: "eur",
          unit_amount: 990,
          product_data: {
            name: "Internship Hunter premium report"
          }
        },
        quantity: 1
      }
    ],
    metadata: { reportId },
    success_url: `${siteUrl}/premium/${reportId}?paid=true`,
    cancel_url: `${siteUrl}/report/${reportId}`
  });

  return NextResponse.json({ url: session.url });
}
