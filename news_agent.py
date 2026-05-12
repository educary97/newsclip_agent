"""
NewsClip Agent — Weekly News Digest
Searches for top news stories and sends a formatted email digest.

Requirements:
    pip install anthropic sendgrid

Environment variables needed:
    ANTHROPIC_API_KEY
    SENDGRID_API_KEY
    DIGEST_EMAIL   — where you receive the digest (e.g. you@gmail.com)
    SENDER_EMAIL   — your verified sender in SendGrid (e.g. you@gmail.com)
"""

import os
import json
import time
from datetime import date, timedelta

import anthropic
from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail

# ── Configuration ──────────────────────────────────────────────────────────────

RECIPIENT_EMAIL = os.environ.get("DIGEST_EMAIL")
SENDER_EMAIL    = os.environ.get("SENDER_EMAIL")

CUSTOM_INSTRUCTIONS = (
    "Focus on economy, politics, business, and technology. "
    "Always include at least 3 Portuguese stories. "
    "Avoid celebrity or entertainment content."
)

# ── Agent prompts ──────────────────────────────────────────────────────────────

def build_search_prompt() -> str:
    week_start = date.today() - timedelta(days=7)
    week_end   = date.today()
    return f"""
Search the web for news from {week_start.strftime('%d %b %Y')} to {week_end.strftime('%d %b %Y')}.

Do these 4 searches one by one:
1. "Portugal news this week"
2. "Portugal economia politica maio 2026"
3. "top world news this week"
4. "business technology news this week"

{CUSTOM_INSTRUCTIONS}

Then list exactly 12 stories total (at least 3 from Portugal).
For each story write:
SECTION: Portugal or International
HEADLINE: ...
SUMMARY: ...
SOURCE: ...
URL: ...
KEYWORDS: ...
---
"""

def build_format_prompt(raw: str) -> str:
    return f"""
Convert the following news summaries into a JSON array.

{raw}

Return exactly this structure — a JSON array of 12 objects:
  "section"   — "Portugal" or "International"
  "headline"  — the story headline
  "summary"   — 1-2 sentences, max 60 words
  "keywords"  — list of 3-4 topic tags
  "source"    — outlet name
  "url"       — article URL

Return ONLY the JSON array. No preamble, no markdown fences, no extra text.
"""

# ── Run the agent ──────────────────────────────────────────────────────────────

def fetch_stories() -> list[dict]:
    client = anthropic.Anthropic()

    # Step 1: search and summarise
    print("Step 1: searching for news...")
    response = client.messages.create(
        model="claude-sonnet-4-5",
        max_tokens=8000,
        tools=[{"type": "web_search_20250305", "name": "web_search"}],
        messages=[{"role": "user", "content": build_search_prompt()}],
    )
    text_blocks = [b for b in response.content if b.type == "text"]
    if not text_blocks:
        raise ValueError("No text returned from search step.")
    raw = text_blocks[-1].text.strip()
    print(f"Search step result preview: {raw[:300]}")

    # Step 2: format into JSON
    print("Step 2: formatting into JSON...")
    time.sleep(30)
    response2 = client.messages.create(
        model="claude-sonnet-4-5",
        max_tokens=8000,
        messages=[{"role": "user", "content": build_format_prompt(raw)}],
    )
    text_blocks2 = [b for b in response2.content if b.type == "text"]
    if not text_blocks2:
        raise ValueError("No text returned from format step.")
    text = text_blocks2[-1].text.strip()
    print(f"Format step result preview: {text[:300]}")

    # Extract JSON array
    start = text.find("[")
    end   = text.rfind("]") + 1
    if start == -1 or end == 0:
        raise ValueError(f"No JSON array found: {text[:300]}")
    return json.loads(text[start:end])

# ── Build HTML email ───────────────────────────────────────────────────────────

def build_email_html(stories: list[dict]) -> str:
    today      = date.today().strftime("%d %b %Y")
    week_start = (date.today() - timedelta(days=7)).strftime("%d %b")

    def render_story(s: dict) -> str:
        keywords_html = "".join(
            f'<span style="display:inline-block;margin:2px 3px 0 0;padding:2px 7px;'
            f'background:#e8e4dc;font-family:monospace;font-size:11px;color:#8a8070;">'
            f'{kw}</span>'
            for kw in s.get("keywords", [])
        )
        return f"""
        <tr>
          <td style="padding:14px 0;border-bottom:1px solid #e0dbd4;">
            <div style="font-family:monospace;font-size:10px;color:#c8402a;
                        text-transform:uppercase;letter-spacing:0.08em;margin-bottom:3px;">
              {s['source']}
            </div>
            <div style="font-family:Georgia,serif;font-size:16px;font-weight:700;
                        line-height:1.3;margin-bottom:5px;">
              <a href="{s['url']}" style="color:#0f0f0f;text-decoration:none;"
                 target="_blank">{s['headline']}</a>
            </div>
            <div style="font-size:13px;line-height:1.55;color:#333;margin-bottom:7px;">
              {s['summary']}
            </div>
            <div style="margin-bottom:6px;">{keywords_html}</div>
            <a href="{s['url']}" style="font-family:monospace;font-size:11px;
               color:#1a4a7a;text-decoration:none;" target="_blank">Read full story &rarr;</a>
          </td>
        </tr>
        """

    def render_section(title: str, section_stories: list[dict]) -> str:
        if not section_stories:
            return ""
        rows = "".join(render_story(s) for s in section_stories)
        return f"""
        <tr>
          <td style="padding:20px 0 6px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="font-family:monospace;font-size:10px;letter-spacing:0.14em;
                            text-transform:uppercase;color:#8a8070;padding-right:10px;
                            white-space:nowrap;width:1%;">{title}</td>
                <td style="border-bottom:1px solid #d4cfc4;">&nbsp;</td>
              </tr>
            </table>
          </td>
        </tr>
        {rows}
        """

    pt_stories    = [s for s in stories if s.get("section") == "Portugal"]
    world_stories = [s for s in stories if s.get("section") == "International"]

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Weekly Digest &mdash; {today}</title>
</head>
<body style="margin:0;padding:0;background:#f0ebe0;">
  <table width="100%" cellpadding="0" cellspacing="0"
         style="background:#f0ebe0;padding:24px 0;">
    <tr><td align="center">
      <table width="620" cellpadding="0" cellspacing="0"
             style="background:#f5f0e8;border:1px solid #d4cfc4;max-width:620px;">

        <!-- Masthead -->
        <tr>
          <td style="background:#0f0f0f;padding:10px 24px;">
            <table width="100%" cellpadding="0" cellspacing="0"><tr>
              <td style="font-family:Georgia,serif;font-size:20px;font-weight:900;
                          color:#f5f0e8;">NewsClip</td>
              <td align="right" style="font-family:monospace;font-size:10px;
                                       color:#8a8070;text-transform:uppercase;
                                       letter-spacing:0.1em;">Weekly Digest</td>
            </tr></table>
          </td>
        </tr>

        <!-- Intro -->
        <tr>
          <td style="padding:20px 28px 0;border-bottom:2px solid #0f0f0f;">
            <div style="font-family:monospace;font-size:10px;color:#8a8070;
                        text-transform:uppercase;letter-spacing:0.1em;margin-bottom:3px;">
              Week of {week_start} &ndash; {today}
            </div>
            <div style="font-family:Georgia,serif;font-size:24px;font-weight:700;
                        margin-bottom:4px;">Your Weekly News Digest</div>
            <div style="font-family:monospace;font-size:11px;color:#8a8070;
                        padding-bottom:14px;">
              {len(stories)} stories &middot; Portugal + International
            </div>
          </td>
        </tr>

        <!-- Stories -->
        <tr>
          <td style="padding:0 28px 24px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              {render_section("Portugal", pt_stories)}
              {render_section("International", world_stories)}
            </table>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:14px 28px;border-top:1px solid #d4cfc4;
                      font-family:monospace;font-size:10px;color:#aaa;text-align:center;">
            Generated by NewsClip Agent &middot; Powered by Claude + Web Search
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>"""

# ── Send email ─────────────────────────────────────────────────────────────────

def send_email(html: str) -> None:
    today = date.today().strftime("%d %b %Y")
    message = Mail(
        from_email=(SENDER_EMAIL, "NewsClip Agent"),
        to_emails=RECIPIENT_EMAIL,
        subject=f"Weekly Digest — {today}",
        html_content=html,
    )
    sg = SendGridAPIClient(os.environ["SENDGRID_API_KEY"])
    sg.send(message)
    print(f"Digest sent to {RECIPIENT_EMAIL}")

# ── Entry point ────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print("Fetching stories...")
    stories = fetch_stories()
    print(f"Got {len(stories)} stories. Building email...")
    html = build_email_html(stories)
    send_email(html)