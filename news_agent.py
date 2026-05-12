"""
NewsClip Agent — Weekly News Digest
Searches for top news stories and fetches newsletters from Gmail,
then sends a formatted email digest.
Runs every Sunday via GitHub Actions, or on demand via the Vercel dashboard.

Requirements:
    pip install anthropic sendgrid google-auth google-auth-oauthlib google-api-python-client

Environment variables needed:
    ANTHROPIC_API_KEY
    SENDGRID_API_KEY
    DIGEST_EMAIL         — where you receive the digest (e.g. you@gmail.com)
    SENDER_EMAIL         — your verified sender in SendGrid (e.g. you@gmail.com)
    GMAIL_CLIENT_ID      — from Google Cloud OAuth credentials
    GMAIL_CLIENT_SECRET  — from Google Cloud OAuth credentials
    GMAIL_REFRESH_TOKEN  — from OAuth Playground
"""

import os
import json
import time
import base64
import re
from datetime import date, timedelta

import anthropic
from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

# ── Configuration ──────────────────────────────────────────────────────────────

RECIPIENT_EMAIL = os.environ.get("DIGEST_EMAIL")
SENDER_EMAIL    = os.environ.get("SENDER_EMAIL")

NEWSLETTER_SENDERS = [
    "theathletic.com",
    "sifted.eu",
    "techcrunch.com",
    "scalingeurope@substack.com",
    "a16z.com",
    "chartr.co",
    "daily-playbook@news.daily-playbook.com",
    "newsletters-noreply@linkedin.com",
]

CUSTOM_INSTRUCTIONS = (
    "Focus on economy, politics, business, and technology. "
    "Always include at least 3 Portuguese stories. "
    "Avoid celebrity or entertainment content."
)

# ── Gmail: fetch newsletters ───────────────────────────────────────────────────

def get_gmail_service():
    creds = Credentials(
        token=None,
        refresh_token=os.environ["GMAIL_REFRESH_TOKEN"],
        client_id=os.environ["GMAIL_CLIENT_ID"],
        client_secret=os.environ["GMAIL_CLIENT_SECRET"],
        token_uri="https://oauth2.googleapis.com/token",
        scopes=["https://www.googleapis.com/auth/gmail.readonly"],
    )
    return build("gmail", "v1", credentials=creds)

def extract_email_body(payload: dict) -> str:
    """Recursively extract plain text or HTML body from a Gmail message payload."""
    if payload.get("body", {}).get("data"):
        data = payload["body"]["data"]
        return base64.urlsafe_b64decode(data + "==").decode("utf-8", errors="ignore")
    for part in payload.get("parts", []):
        if part.get("mimeType") in ("text/plain", "text/html"):
            data = part.get("body", {}).get("data", "")
            if data:
                return base64.urlsafe_b64decode(data + "==").decode("utf-8", errors="ignore")
        # Recurse into nested parts
        result = extract_email_body(part)
        if result:
            return result
    return ""

def clean_html(text: str) -> str:
    """Strip HTML tags and collapse whitespace."""
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text[:3000]  # Limit to avoid token overflow

def fetch_newsletters() -> list[dict]:
    """Fetch newsletters from the past 7 days from configured senders."""
    print("Fetching newsletters from Gmail...")
    service = get_gmail_service()

    week_ago = (date.today() - timedelta(days=7)).strftime("%Y/%m/%d")

    # Build Gmail search query
    # LinkedIn sender is filtered by subject to only match Wall Street Oasis
    non_linkedin  = [s for s in NEWSLETTER_SENDERS if s != "newsletters-noreply@linkedin.com"]
    sender_query  = " OR ".join(f"from:{s}" for s in non_linkedin)
    query = f'({sender_query} OR (from:newsletters-noreply@linkedin.com subject:"Wall Street Oasis")) after:{week_ago}'

    results = service.users().messages().list(
        userId="me", q=query, maxResults=20
    ).execute()

    messages = results.get("messages", [])
    newsletters = []

    for msg in messages:
        try:
            full = service.users().messages().get(
                userId="me", id=msg["id"], format="full"
            ).execute()

            headers = {h["name"]: h["value"] for h in full["payload"]["headers"]}
            subject = headers.get("Subject", "No subject")
            sender  = headers.get("From", "Unknown")
            body    = clean_html(extract_email_body(full["payload"]))

            if body:
                newsletters.append({
                    "sender":  sender,
                    "subject": subject,
                    "body":    body,
                })
        except Exception as e:
            print(f"Skipping message {msg['id']}: {e}")
            continue

    print(f"Found {len(newsletters)} newsletters.")
    return newsletters

# ── Agent prompts ──────────────────────────────────────────────────────────────

def build_search_prompt() -> str:
    week_start = date.today() - timedelta(days=7)
    week_end   = date.today()
    return f"""
Search the web for news from {week_start.strftime('%d %b %Y')} to {week_end.strftime('%d %b %Y')}.

Do these 4 searches one by one:
1. "Portugal news this week"
2. "Portugal economia politica this week"
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

def build_newsletter_prompt(newsletters: list[dict]) -> str:
    if not newsletters:
        return ""
    items = ""
    for n in newsletters:
        items += f"\nFROM: {n['sender']}\nSUBJECT: {n['subject']}\nCONTENT: {n['body']}\n---\n"
    return f"""
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
{items}
"""

def build_format_prompt(raw_news: str, raw_newsletters: str) -> str:
    newsletter_section = f"\n\nNEWSLETTER STORIES:\n{raw_newsletters}" if raw_newsletters else ""
    return f"""
Convert the following news summaries into a JSON array.

NEWS STORIES:
{raw_news}
{newsletter_section}

Return a JSON array. Each object must have:
  "section"   — "Portugal", "International", or "Newsletter"
  "headline"  — the story headline
  "summary"   — 1-2 sentences, max 60 words
  "keywords"  — list of 3-4 topic tags
  "source"    — outlet or newsletter name
  "url"       — article URL or "#"

Order: Portugal first, then International, then Newsletter.
Return ONLY the JSON array. No preamble, no markdown fences, no extra text.
"""

# ── Run the agent ──────────────────────────────────────────────────────────────

def fetch_stories() -> list[dict]:
    client = anthropic.Anthropic()

    # Step 1: web search
    print("Step 1: searching the web for news...")
    response = client.messages.create(
        model="claude-sonnet-4-5",
        max_tokens=8000,
        tools=[{"type": "web_search_20250305", "name": "web_search"}],
        messages=[{"role": "user", "content": build_search_prompt()}],
    )
    text_blocks = [b for b in response.content if b.type == "text"]
    if not text_blocks:
        raise ValueError("No text returned from search step.")
    raw_news = text_blocks[-1].text.strip()
    print(f"Web search preview: {raw_news[:200]}")

    # Step 2: fetch newsletters from Gmail
    newsletters = fetch_newsletters()
    raw_newsletters = ""
    if newsletters:
        print("Step 2: summarising newsletters...")
        time.sleep(10)
        resp2 = client.messages.create(
            model="claude-sonnet-4-5",
            max_tokens=4000,
            messages=[{"role": "user", "content": build_newsletter_prompt(newsletters)}],
        )
        blocks2 = [b for b in resp2.content if b.type == "text"]
        if blocks2:
            raw_newsletters = blocks2[-1].text.strip()
            print(f"Newsletter summary preview: {raw_newsletters[:200]}")

    # Step 3: format everything into JSON
    print("Step 3: formatting into JSON...")
    time.sleep(30)
    response3 = client.messages.create(
        model="claude-sonnet-4-5",
        max_tokens=8000,
        messages=[{"role": "user", "content": build_format_prompt(raw_news, raw_newsletters)}],
    )
    text_blocks3 = [b for b in response3.content if b.type == "text"]
    if not text_blocks3:
        raise ValueError("No text returned from format step.")
    text = text_blocks3[-1].text.strip()
    print(f"Format preview: {text[:300]}")

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
            <div style="font-family:monospace;font-size:10px;color:#b85c3a;
                        text-transform:uppercase;letter-spacing:0.08em;margin-bottom:3px;">
              {s['source']}
            </div>
            <div style="font-family:Georgia,serif;font-size:16px;font-weight:400;
                        line-height:1.4;margin-bottom:5px;">
              <a href="{s['url']}" style="color:#2c2825;text-decoration:none;"
                 target="_blank">{s['headline']}</a>
            </div>
            <div style="font-size:13px;line-height:1.55;color:#6b6560;margin-bottom:7px;">
              {s['summary']}
            </div>
            <div style="margin-bottom:6px;">{keywords_html}</div>
            <a href="{s['url']}" style="font-family:monospace;font-size:11px;
               color:#3a5a8a;text-decoration:none;" target="_blank">Read full story &rarr;</a>
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
                            text-transform:uppercase;color:#a09890;padding-right:10px;
                            white-space:nowrap;width:1%;">{title}</td>
                <td style="border-bottom:1px solid #e8e4de;">&nbsp;</td>
              </tr>
            </table>
          </td>
        </tr>
        {rows}
        """

    pt_stories         = [s for s in stories if s.get("section") == "Portugal"]
    world_stories      = [s for s in stories if s.get("section") == "International"]
    newsletter_stories = [s for s in stories if s.get("section") == "Newsletter"]

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Weekly Digest &mdash; {today}</title>
</head>
<body style="margin:0;padding:0;background:#faf8f4;">
  <table width="100%" cellpadding="0" cellspacing="0"
         style="background:#faf8f4;padding:24px 0;">
    <tr><td align="center">
      <table width="620" cellpadding="0" cellspacing="0"
             style="background:#ffffff;border:1px solid #e8e4de;max-width:620px;">

        <!-- Masthead -->
        <tr>
          <td style="background:#2c2825;padding:12px 24px;">
            <table width="100%" cellpadding="0" cellspacing="0"><tr>
              <td style="font-family:Georgia,serif;font-size:20px;font-weight:400;
                          color:#f5f0e8;">NewsClip</td>
              <td align="right" style="font-family:monospace;font-size:10px;
                                       color:#8a8070;text-transform:uppercase;
                                       letter-spacing:0.1em;">Weekly Digest</td>
            </tr></table>
          </td>
        </tr>

        <!-- Intro -->
        <tr>
          <td style="padding:20px 28px 0;border-bottom:1px solid #e8e4de;">
            <div style="font-family:monospace;font-size:10px;color:#a09890;
                        text-transform:uppercase;letter-spacing:0.1em;margin-bottom:3px;">
              Week of {week_start} &ndash; {today}
            </div>
            <div style="font-family:Georgia,serif;font-size:24px;font-weight:400;
                        color:#2c2825;margin-bottom:4px;">Your Weekly News Digest</div>
            <div style="font-family:monospace;font-size:11px;color:#a09890;
                        padding-bottom:14px;">
              {len(stories)} stories &middot; Portugal + International + Newsletters
            </div>
          </td>
        </tr>

        <!-- Stories -->
        <tr>
          <td style="padding:0 28px 24px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              {render_section("Portugal", pt_stories)}
              {render_section("International", world_stories)}
              {render_section("Newsletters", newsletter_stories)}
            </table>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:14px 28px;border-top:1px solid #e8e4de;
                      font-family:monospace;font-size:10px;color:#a09890;text-align:center;">
            Generated by NewsClip Agent &middot; Powered by Claude + Web Search + Gmail
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
