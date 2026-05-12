// pages/api/run.ts
// Vercel serverless function — runs the NewsClip agent and sends the email.
// Called by the dashboard when the user clicks "Run Now".

import type { NextApiRequest, NextApiResponse } from "next";
import Anthropic from "@anthropic-ai/sdk";
import sgMail from "@sendgrid/mail";

const CUSTOM_INSTRUCTIONS =
  "Focus on economy, politics, business, and technology. " +
  "Always include at least 3 Portuguese stories. " +
  "Avoid celebrity or entertainment content.";

function buildSearchPrompt(): string {
  const now       = new Date();
  const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const fmt       = (d: Date) =>
    d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

  return `
Search the web for news from ${fmt(weekStart)} to ${fmt(now)}.

Do these 4 searches one by one:
1. "Portugal news this week"
2. "Portugal economia politica this week"
3. "top world news this week"
4. "business technology news this week"

${CUSTOM_INSTRUCTIONS}

Then list exactly 12 stories total (at least 3 from Portugal).
For each story write:
SECTION: Portugal or International
HEADLINE: ...
SUMMARY: ...
SOURCE: ...
URL: ...
KEYWORDS: ...
---
`;
}

function buildFormatPrompt(raw: string): string {
  return `
Convert the following news summaries into a JSON array.

${raw}

Return exactly this structure — a JSON array of 12 objects:
  "section"   — "Portugal" or "International"
  "headline"  — the story headline
  "summary"   — 1-2 sentences, max 60 words
  "keywords"  — list of 3-4 topic tags
  "source"    — outlet name
  "url"       — article URL

Return ONLY the JSON array. No preamble, no markdown fences, no extra text.
`;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchStories(): Promise<object[]> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  // Step 1: search
  const response = await client.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 8000,
    tools: [{ type: "web_search_20250305", name: "web_search" }] as any,
    messages: [{ role: "user", content: buildSearchPrompt() }],
  });

  const textBlocks = response.content.filter((b: any) => b.type === "text");
  if (!textBlocks.length) throw new Error("No text returned from search step.");
  const raw = (textBlocks[textBlocks.length - 1] as any).text.trim();

  // Step 2: format
  await sleep(30000);
  const response2 = await client.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 8000,
    messages: [{ role: "user", content: buildFormatPrompt(raw) }],
  });

  const textBlocks2 = response2.content.filter((b: any) => b.type === "text");
  if (!textBlocks2.length) throw new Error("No text returned from format step.");
  let text = (textBlocks2[textBlocks2.length - 1] as any).text.trim();

  const start = text.indexOf("[");
  const end   = text.lastIndexOf("]") + 1;
  if (start === -1 || end === 0) throw new Error("No JSON array found.");
  return JSON.parse(text.slice(start, end));
}

function buildEmailHtml(stories: any[]): string {
  const now       = new Date();
  const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const fmt       = (d: Date) =>
    d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  const today     = fmt(now);
  const weekStartStr = weekStart.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });

  const renderStory = (s: any) => {
    const keywords = (s.keywords || [])
      .map((kw: string) =>
        `<span style="display:inline-block;margin:2px 3px 0 0;padding:2px 7px;background:#e8e4dc;font-family:monospace;font-size:11px;color:#8a8070;">${kw}</span>`
      ).join("");
    return `
      <tr><td style="padding:14px 0;border-bottom:1px solid #e0dbd4;">
        <div style="font-family:monospace;font-size:10px;color:#c8402a;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:3px;">${s.source}</div>
        <div style="font-family:Georgia,serif;font-size:16px;font-weight:700;line-height:1.3;margin-bottom:5px;">
          <a href="${s.url}" style="color:#0f0f0f;text-decoration:none;" target="_blank">${s.headline}</a>
        </div>
        <div style="font-size:13px;line-height:1.55;color:#333;margin-bottom:7px;">${s.summary}</div>
        <div style="margin-bottom:6px;">${keywords}</div>
        <a href="${s.url}" style="font-family:monospace;font-size:11px;color:#1a4a7a;text-decoration:none;" target="_blank">Read full story &rarr;</a>
      </td></tr>`;
  };

  const renderSection = (title: string, items: any[]) => {
    if (!items.length) return "";
    return `
      <tr><td style="padding:20px 0 6px;">
        <table width="100%" cellpadding="0" cellspacing="0"><tr>
          <td style="font-family:monospace;font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:#8a8070;padding-right:10px;white-space:nowrap;width:1%;">${title}</td>
          <td style="border-bottom:1px solid #d4cfc4;">&nbsp;</td>
        </tr></table>
      </td></tr>
      ${items.map(renderStory).join("")}`;
  };

  const pt    = stories.filter((s) => s.section === "Portugal");
  const world = stories.filter((s) => s.section === "International");

  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Weekly Digest &mdash; ${today}</title></head>
<body style="margin:0;padding:0;background:#f0ebe0;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0ebe0;padding:24px 0;">
<tr><td align="center">
<table width="620" cellpadding="0" cellspacing="0" style="background:#f5f0e8;border:1px solid #d4cfc4;max-width:620px;">
  <tr><td style="background:#0f0f0f;padding:10px 24px;">
    <table width="100%" cellpadding="0" cellspacing="0"><tr>
      <td style="font-family:Georgia,serif;font-size:20px;font-weight:900;color:#f5f0e8;">NewsClip</td>
      <td align="right" style="font-family:monospace;font-size:10px;color:#8a8070;text-transform:uppercase;letter-spacing:0.1em;">Weekly Digest</td>
    </tr></table>
  </td></tr>
  <tr><td style="padding:20px 28px 0;border-bottom:2px solid #0f0f0f;">
    <div style="font-family:monospace;font-size:10px;color:#8a8070;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:3px;">Week of ${weekStartStr} &ndash; ${today}</div>
    <div style="font-family:Georgia,serif;font-size:24px;font-weight:700;margin-bottom:4px;">Your Weekly News Digest</div>
    <div style="font-family:monospace;font-size:11px;color:#8a8070;padding-bottom:14px;">${stories.length} stories &middot; Portugal + International</div>
  </td></tr>
  <tr><td style="padding:0 28px 24px;">
    <table width="100%" cellpadding="0" cellspacing="0">
      ${renderSection("Portugal", pt)}
      ${renderSection("International", world)}
    </table>
  </td></tr>
  <tr><td style="padding:14px 28px;border-top:1px solid #d4cfc4;font-family:monospace;font-size:10px;color:#aaa;text-align:center;">
    Generated by NewsClip Agent &middot; Powered by Claude + Web Search
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}

async function sendEmail(html: string): Promise<void> {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY!);
  const now   = new Date();
  const today = now.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  await sgMail.send({
    from:    { email: process.env.SENDER_EMAIL!, name: "NewsClip Agent" },
    to:      process.env.DIGEST_EMAIL!,
    subject: `Weekly Digest — ${today}`,
    html,
  });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Method check
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Password check
  const { password } = req.body;
  if (password !== process.env.DASHBOARD_PASSWORD) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const stories = await fetchStories();
    const html    = buildEmailHtml(stories);
    await sendEmail(html);
    return res.status(200).json({ stories });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}

// Vercel timeout — allow up to 5 minutes for the agent to run
export const config = {
  maxDuration: 300,
};
