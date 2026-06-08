import { NextResponse } from "next/server";
import { getReportIfAuthorized } from "@/lib/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const reportId = url.searchParams.get("reportId");
  const token = url.searchParams.get("token") ?? undefined;

  if (!reportId) {
    return NextResponse.json({ error: "Missing reportId." }, { status: 400 });
  }

  const report = await getReportIfAuthorized(reportId, token);
  if (!report) {
    return NextResponse.json({ error: "Unauthorized report access." }, { status: 403 });
  }

  return NextResponse.json({
    status: report.premiumSearchStatus ?? "not_started",
    offerCount: report.premiumOffers.length,
    error: report.premiumSearchError
  });
}
