import "server-only";
import fs from "node:fs";
import path from "node:path";
import { mockCandidateProfile, mockReport } from "./mockData";
import type { AdminSearchLog, CandidateProfile, InternshipSearchReport, OfferFeedback } from "./types";

const profiles = new Map<string, CandidateProfile>([[mockCandidateProfile.id, mockCandidateProfile]]);
const reports = new Map<string, InternshipSearchReport>([[mockReport.id, mockReport]]);
const feedback = new Map<string, OfferFeedback>();
const logs = new Map<string, AdminSearchLog>();

type StoreSnapshot = {
  profiles: CandidateProfile[];
  reports: InternshipSearchReport[];
  feedback: OfferFeedback[];
  logs: AdminSearchLog[];
};

const storeFile = path.join(process.cwd(), ".internship-hunter-store.json");
let hydrated = false;

function canUseFileFallback() {
  return process.env.NODE_ENV !== "production";
}

function hydrate() {
  if (hydrated || !canUseFileFallback() || !fs.existsSync(storeFile)) {
    hydrated = true;
    return;
  }

  try {
    const snapshot = JSON.parse(fs.readFileSync(storeFile, "utf8")) as Partial<StoreSnapshot>;
    snapshot.profiles?.forEach((item) => profiles.set(item.id, item));
    snapshot.reports?.forEach((item) => reports.set(item.id, item));
    snapshot.feedback?.forEach((item) => feedback.set(item.id, item));
    snapshot.logs?.forEach((item) => logs.set(item.id, item));
  } catch {
    // Ignore corrupt local fallback state. The mock demo report still keeps the app usable.
  } finally {
    hydrated = true;
  }
}

function persist() {
  if (!canUseFileFallback()) {
    return;
  }

  const snapshot: StoreSnapshot = {
    profiles: Array.from(profiles.values()),
    reports: Array.from(reports.values()),
    feedback: Array.from(feedback.values()),
    logs: Array.from(logs.values())
  };

  fs.writeFileSync(storeFile, JSON.stringify(snapshot, null, 2));
}

export function saveProfile(profile: CandidateProfile) {
  hydrate();
  profiles.set(profile.id, profile);
  persist();
}

export function getProfile(id: string) {
  hydrate();
  return profiles.get(id) ?? mockCandidateProfile;
}

export function saveReport(report: InternshipSearchReport) {
  hydrate();
  reports.set(report.id, report);
  persist();
}

export function getReport(id: string) {
  hydrate();
  return reports.get(id) ?? (id === mockReport.id ? mockReport : undefined);
}

export function listReports() {
  hydrate();
  return Array.from(reports.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function saveFeedback(item: OfferFeedback) {
  hydrate();
  feedback.set(item.id, item);
  persist();
}

export function listFeedback() {
  hydrate();
  return Array.from(feedback.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function saveLog(log: AdminSearchLog) {
  hydrate();
  logs.set(log.id, log);
  persist();
}

export function listLogs() {
  hydrate();
  return Array.from(logs.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function markReportPaid(reportId: string) {
  hydrate();
  const report = reports.get(reportId);
  if (report) {
    reports.set(reportId, { ...report, isPaid: true, updatedAt: new Date().toISOString() });
    persist();
  }
}
