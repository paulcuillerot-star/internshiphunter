import { NextResponse } from "next/server";
import { getReportIfAuthorized } from "@/lib/store";
import { getStripeClient } from "@/lib/stripe";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const { reportId, token } = (await request.json()) as { reportId?: string; token?: string };

  if (!reportId) {
    return NextResponse.json({ error: "Missing reportId." }, { status: 400 });
  }

  const report = await getReportIfAuthorized(reportId, token);
  if (!report) {
    return NextResponse.json({ error: "Unauthorized report access." }, { status: 403 });
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const tokenParam = report.accessToken ? `token=${encodeURIComponent(report.accessToken)}` : "";
  const paidQuery = [tokenParam, "paid=true"].filter(Boolean).join("&");
  const stripe = getStripeClient();

  if (!stripe) {
    const mockQuery = [tokenParam, "mockPaid=true"].filter(Boolean).join("&");
    return NextResponse.json({ url: `${siteUrl}/premium/${reportId}${mockQuery ? `?${mockQuery}` : ""}` });
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
    success_url: `${siteUrl}/premium/${reportId}${paidQuery ? `?${paidQuery}` : ""}`,
    cancel_url: `${siteUrl}/report/${reportId}${tokenParam ? `?${tokenParam}` : ""}`
  });

  return NextResponse.json({ url: session.url });
}
