export type PublicQuote = { token: string; totalClp: number; startsAt: string; endsAt: string;
  lines: { date: string; rateClp: number; units: number }[] };
export type PublicBookingState = { error?: string; success?: boolean; nextSubmissionKey?: string; quote?: PublicQuote; selection?: Record<string, string> };
