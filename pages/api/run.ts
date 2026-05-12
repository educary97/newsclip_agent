// pages/api/run.ts
// Vercel serverless function — runs the NewsClip agent and sends the email.
// Fetches web news via Claude + web search, and newsletters from Gmail.

import type { NextApiRequest, NextApiResponse } from "next";
import Anthropic from "@anthropic-ai/sdk";
import sgMail from "@sendgrid/mail";
import { google } from "googleapis";

// ── Configuration ──────────────────────────────────────────────────────────────

const NEWSLETTER_SENDERS = [
  "theathletic.com",
  "sifted.eu",
  "techcrunch.com",
  "scalingeurope@substack.com",
  "a16z.com",
  "chartr.co",
  "daily-playbook@news.daily-playbook.com",
  "newsletters-noreply@linkedin.com",
];

const CUSTOM_INSTRUCTIONS =
  "Focus on economy, politics, business, and technology. " +
  "Always include at least 3 Portuguese stories. " +
  "Avoid celebrity or entertainment content.";

// ── Helpers ────────────────────────────────────────────────────────────────────

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatDate(d: Date) {
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function cleanHtml(text: string): string {
  return text
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 3000);
}

function extractBody(payload: any): string {
  if (payload?.body?.data) {
    return Buffer.from(payload.body.data, "base64url").toString("utf-8");
  }
  for (const part of payload?.parts || []) {
    if (["text/plain", "text/html"].includes(part.mimeType) && part?.body?.data) {
      return Buffer.from(part.body.data, "base64url").toString("utf-8");
    }
    const result = extractBody(part);
    if (result) return result;
  }
  return "";
}

// ── Gmail: fetch newsletters ───────────────────────────────────────────────────

async function fetchNewsletters(): Promise<{ sender: string; subject: string; body: string }[]> {
  const auth = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET,
  );
  auth.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN });

  const gmail  = google.gmail({ version: "v1", auth });
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const after  = `${cutoff.getFullYear()}/${String(cutoff.getMonth() + 1).padStart(2, "0")}/${String(cutoff.getDate()).padStart(2, "0")}`;

  // LinkedIn sender filtered by subject to only match Wall Street Oasis
  const nonLinkedin  = NEWSLETTER_SENDERS.filter((s) => s !== "newsletters-noreply@linkedin.com");
  const senderQuery  = nonLinkedin.map((s) => `from:${s}`).join(" OR ");
  const query        = `(${senderQuery} OR (from:newsletters-noreply@linkedin.com subject:"Wall Street Oasis")) after:${after}`;

  const list = await gmail.users.messages.list({ userId: "me", q: query, maxResults: 20 });
  const messages = list.data.messages || [];

  const newsletters: { sender: string; subject: string; body: string }[] = [];

  for (const msg of messages) {
    try {
      const full    = await gmail.users.messages.get({ userId: "me", id: msg.id!, format: "full" });
      const headers = Object.fromEntries(
        (full.data.payload?.headers || []).map((h: any) => [h.name, h.value])
      );
      const subject = headers["Subject"] || "No subject";
      const sender  = headers["From"]    || "Unknown";
      const body    = cleanHtml(extractBody(full.data.payload));
      if (body) newsletters.push({ sender, subject, body });
    } catch (e) {
      console.warn(`Skipping message ${msg.id}:`, e);
    }
  }

  console.log(`Found ${newsletters.length} newsletters.`);
  return newsletters;
}

// ── Prompts ────────────────────────────────────────────────────────────────────

function buildSearchPrompt(): string {
  const now       = new Date();
  const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  return `
Search the web for news from ${formatDate(weekStart)} to ${formatDate(now)}.

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

function buildNewsletterPrompt(newsletters: { sender: string; subject: string; body: string }[]): string {
  const items = newsletters
    .map((n) => `FROM: ${n.sender}\nSUBJECT: ${n.subject}\nCONTENT: ${n.body}\n---`)
    .join("\n");
  return `
Based on the following newsletter emails received this week, extract the 6 most interesting
stories or insights. For each one write:
SECTION: Newsletter
HEADLINE: ...
SUMMARY: ...
SOURCE: (newsletter name, e.g. "The Athletic" or "Sifted")
URL: (if mentioned in the content, otherwise use "#")
KEYWORDS: ...
---

Newsletters:
${items}
`;
}

function buildFormatPrompt(rawNews: string, rawNewsletters: string): string {
  const newsletterSection = rawNewsletters ? `\n\nNEWSLETTER STORIES:\n${rawNewsletters}` : "";
  return `
Convert the following news summaries into a JSON array.

NEWS STORIES:
${rawNews}
${newsletterSection}

Return a JSON array. Each object must have:
  "section"   — "Portugal", "International", or "Newsletter"
  "headline"  — the story headline
  "summary"   — 1-2 sentences, max 60 words
  "keywords"  — list of 3-4 topic tags
  "source"    — outlet or newsletter name
  "url"       — article URL or "#"

Order: Portugal first, then International, then Newsletter.
Return ONLY the JSON array. No preamble, no markdown fences, no extra text.
`;
}

// ── Fetch stories ──────────────────────────────────────────────────────────────

async function fetchStories(): Promise<object[]> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  // Step 1: web search
  console.log("Step 1: searching the web...");
  const response = await client.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 8000,
    tools: [{ type: "web_search_20250305", name: "web_search" }] as any,
    messages: [{ role: "user", content: buildSearchPrompt() }],
  });
  const textBlocks = response.content.filter((b: any) => b.type === "text");
  if (!textBlocks.length) throw new Error("No text returned from search step.");
  const rawNews = (textBlocks[textBlocks.length - 1] as any).text.trim();

  // Step 2: fetch and summarise newsletters
  const newsletters = await fetchNewsletters();
  let rawNewsletters = "";
  if (newsletters.length > 0) {
    console.log("Step 2: summarising newsletters...");
    await sleep(10000);
    const resp2      = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 4000,
      messages: [{ role: "user", content: buildNewsletterPrompt(newsletters) }],
    });
    const blocks2 = resp2.content.filter((b: any) => b.type === "text");
    if (blocks2.length) rawNewsletters = (blocks2[blocks2.length - 1] as any).text.trim();
  }

  // Step 3: format into JSON
  console.log("Step 3: formatting into JSON...");
  await sleep(30000);
  const response3   = await client.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 8000,
    messages: [{ role: "user", content: buildFormatPrompt(rawNews, rawNewsletters) }],
  });
  const textBlocks3 = response3.content.filter((b: any) => b.type === "text");
  if (!textBlocks3.length) throw new Error("No text returned from format step.");
  let text = (textBlocks3[textBlocks3.length - 1] as any).text.trim();

  const start = text.indexOf("[");
  const end   = text.lastIndexOf("]") + 1;
  if (start === -1 || end === 0) throw new Error("No JSON array found.");
  return JSON.parse(text.slice(start, end));
}

// ── Build HTML email ───────────────────────────────────────────────────────────

function buildEmailHtml(stories: any[]): string {
  const now        = new Date();
  const weekStart  = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const today      = formatDate(now);
  const weekStartS = weekStart.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });

  const renderStory = (s: any) => {
    const keywords = (s.keywords || [])
      .map((kw: string) =>
        `<span style="display:inline-block;margin:2px 3px 0 0;padding:2px 7px;background:#e8e4dc;font-family:monospace;font-size:11px;color:#8a8070;">${kw}</span>`
      ).join("");
    return `
      <tr><td style="padding:14px 0;border-bottom:1px solid #e0dbd4;">
        <div style="font-family:monospace;font-size:10px;color:#b85c3a;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:3px;">${s.source}</div>
        <div style="font-family:Georgia,serif;font-size:16px;font-weight:400;line-height:1.4;margin-bottom:5px;">
          <a href="${s.url}" style="color:#2c2825;text-decoration:none;" target="_blank">${s.headline}</a>
        </div>
        <div style="font-size:13px;line-height:1.55;color:#6b6560;margin-bottom:7px;">${s.summary}</div>
        <div style="margin-bottom:6px;">${keywords}</div>
        <a href="${s.url}" style="font-family:monospace;font-size:11px;color:#3a5a8a;text-decoration:none;" target="_blank">Read full story &rarr;</a>
      </td></tr>`;
  };

  const renderSection = (title: string, items: any[]) => {
    if (!items.length) return "";
    return `
      <tr><td style="padding:20px 0 6px;">
        <table width="100%" cellpadding="0" cellspacing="0"><tr>
          <td style="font-family:monospace;font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:#a09890;padding-right:10px;white-space:nowrap;width:1%;">${title}</td>
          <td style="border-bottom:1px solid #e8e4de;">&nbsp;</td>
        </tr></table>
      </td></tr>
      ${items.map(renderStory).join("")}`;
  };

  const pt         = stories.filter((s) => s.section === "Portugal");
  const world      = stories.filter((s) => s.section === "International");
  const newsletter = stories.filter((s) => s.section === "Newsletter");

  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Weekly Digest &mdash; ${today}</title></head>
<body style="margin:0;padding:0;background:#faf8f4;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#faf8f4;padding:24px 0;">
<tr><td align="center">
<table width="620" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e8e4de;max-width:620px;">
  <tr><td style="background:#2c2825;padding:12px 24px;">
    <table width="100%" cellpadding="0" cellspacing="0"><tr>
      <td style="font-family:Georgia,serif;font-size:20px;font-weight:400;color:#f5f0e8;">NewsClip</td>
      <td align="right" style="font-family:monospace;font-size:10px;color:#8a8070;text-transform:uppercase;letter-spacing:0.1em;">Weekly Digest</td>
    </tr></table>
  </td></tr>
  <tr><td style="padding:20px 28px 0;border-bottom:1px solid #e8e4de;">
    <div style="font-family:monospace;font-size:10px;color:#a09890;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:3px;">Week of ${weekStartS} &ndash; ${today}</div>
    <div style="font-family:Georgia,serif;font-size:24px;font-weight:400;color:#2c2825;margin-bottom:4px;">Your Weekly News Digest</div>
    <div style="font-family:monospace;font-size:11px;color:#a09890;padding-bottom:14px;">${stories.length} stories &middot; Portugal + International + Newsletters</div>
  </td></tr>
  <tr><td style="padding:0 28px 24px;">
    <table width="100%" cellpadding="0" cellspacing="0">
      ${renderSection("Portugal", pt)}
      ${renderSection("International", world)}
      ${renderSection("Newsletters", newsletter)}
    </table>
  </td></tr>
  <tr><td style="padding:14px 28px;border-top:1px solid #e8e4de;font-family:monospace;font-size:10px;color:#a09890;text-align:center;">
    Generated by NewsClip Agent &middot; Powered by Claude + Web Search + Gmail
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}

// ── Send email ─────────────────────────────────────────────────────────────────

async function sendEmail(html: string): Promise<void> {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY!);
  const today = formatDate(new Date());
  await sgMail.send({
    from:    { email: process.env.SENDER_EMAIL!, name: "NewsClip Agent" },
    to:      process.env.DIGEST_EMAIL!,
    subject: `Weekly Digest — ${today}`,
    html,
  });
}

// ── Handler ────────────────────────────────────────────────────────────────────

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { password } = req.body;
  if (password !== process.env.DASHBOARD_PASSWORD) return res.status(401).json({ error: "Unauthorized" });

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

export const config = { maxDuration: 300 };
