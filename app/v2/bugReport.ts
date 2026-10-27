// app/v2/bugReport.ts
// Builds a bug report from what the rider typed plus (optionally) basic app and phone details. Kept
// pure so it can be tested; the screen sends it to Sentry, or falls back to an email draft.

export const DEVELOPER_EMAIL = 'contact.deusx@gmail.com';
export const MIN_REPORT_CHARS = 10;
export const MAX_REPORT_CHARS = 2000;

export interface DeviceDetails {
  appVersion?: string | null;
  model?: string | null;
  os?: string | null;
  osVersion?: string | null;
}

export interface BugReport {
  message: string;
  email: string;
  includeDevice: boolean;
  device: DeviceDetails;
}

/** Why a report can't be sent yet, or null when it is fine. */
export function reportProblem(message: string, email: string): string | null {
  const text = message.trim();
  if (text.length < MIN_REPORT_CHARS) return `Tell us a bit more (at least ${MIN_REPORT_CHARS} characters).`;
  if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return 'That email address does not look right. Fix it or clear it.';
  return null;
}

/** Device lines as shown to the rider and added to the report: no location, no ride data. */
export function deviceLines(d: DeviceDetails): string[] {
  const lines: string[] = [];
  if (d.appVersion) lines.push(`App: Wayfarian ${d.appVersion}`);
  if (d.model) lines.push(`Phone: ${d.model}`);
  if (d.os) lines.push(`System: ${d.os}${d.osVersion ? ` ${d.osVersion}` : ''}`);
  return lines;
}

/** The text that goes out: what the rider wrote, then the device lines if they allowed them. */
export function reportBody(r: BugReport): string {
  const text = r.message.trim().slice(0, MAX_REPORT_CHARS);
  const lines = r.includeDevice ? deviceLines(r.device) : [];
  return lines.length ? `${text}\n\n${lines.join('\n')}` : text;
}

/** A mail draft for when the report can't go through Sentry. */
export function reportMailto(r: BugReport): string {
  return `mailto:${DEVELOPER_EMAIL}?subject=${encodeURIComponent('Wayfarian bug report')}&body=${encodeURIComponent(reportBody(r))}`;
}
