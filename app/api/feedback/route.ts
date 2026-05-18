import { NextResponse } from "next/server";
import { saveFeedback } from "@/lib/store";
import type { FeedbackType } from "@/lib/types";

const allowed: FeedbackType[] = ["relevant", "not_relevant", "expired", "already_applied", "wrong_country", "wrong_role", "too_senior", "not_a_real_internship"];

export async function POST(request: Request) {
  const body = (await request.json()) as { reportId?: string; offerId?: string; feedbackType?: FeedbackType; comment?: string };
  if (!body.reportId || !body.offerId || !body.feedbackType || !allowed.includes(body.feedbackType)) return NextResponse.json({ error: "Invalid feedback." }, { status: 400 });
  saveFeedback({ id: `feedback_${crypto.randomUUID()}`, reportId: body.reportId, offerId: body.offerId, feedbackType: body.feedbackType, comment: body.comment, createdAt: new Date().toISOString() });
  return NextResponse.json({ ok: true });
}
