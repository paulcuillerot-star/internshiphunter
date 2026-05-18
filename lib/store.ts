import { mockCandidateProfile, mockReport } from "./mockData";
import type { AdminSearchLog, CandidateProfile, InternshipSearchReport, OfferFeedback } from "./types";

const profiles = new Map<string, CandidateProfile>([[mockCandidateProfile.id, mockCandidateProfile]]);
const reports = new Map<string, InternshipSearchReport>([[mockReport.id, mockReport]]);
const feedback = new Map<string, OfferFeedback>();
const logs = new Map<string, AdminSearchLog>();

export function saveProfile(profile: CandidateProfile) { profiles.set(profile.id, profile); }
export function getProfile(id: string) { return profiles.get(id) ?? mockCandidateProfile; }
export function saveReport(report: InternshipSearchReport) { reports.set(report.id, report); }
export function getReport(id: string) { return reports.get(id) ?? (id === mockReport.id ? mockReport : undefined); }
export function listReports() { return Array.from(reports.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt)); }
export function saveFeedback(item: OfferFeedback) { feedback.set(item.id, item); }
export function listFeedback() { return Array.from(feedback.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt)); }
export function saveLog(log: AdminSearchLog) { logs.set(log.id, log); }
export function listLogs() { return Array.from(logs.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt)); }
export function markReportPaid(reportId: string) { const report = reports.get(reportId); if (report) reports.set(reportId, { ...report, isPaid: true, updatedAt: new Date().toISOString() }); }
