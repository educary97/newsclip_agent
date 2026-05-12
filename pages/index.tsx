// pages/index.tsx
// NewsClip Agent dashboard — password protected, triggers the agent on demand.

import { useState } from "react";

// ── Design tokens ──────────────────────────────────────────────────────────────

const C = {
  bg:          "#faf8f4",
  surface:     "#ffffff",
  border:      "#e8e4de",
  borderLight: "#f0ece6",
  ink:         "#2c2825",
  inkLight:    "#6b6560",
  inkFaint:    "#a09890",
  accent:      "#b85c3a",
  accentBg:    "#fdf2ee",
  green:       "#3a7a5c",
  greenBg:     "#eef6f1",
  blue:        "#3a5a8a",
  sand:        "#f2ede6",
};

const F = {
  serif: "'Georgia', 'Times New Roman', serif",
  mono:  "'Menlo', 'Monaco', 'Courier New', monospace",
  sans:  "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
};

// ── Login ──────────────────────────────────────────────────────────────────────

function LoginScreen({ onLogin }: { onLogin: (pw: string) => void }) {
  const [pw, setPw]   = useState("");
  const [err, setErr] = useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pw.trim()) { setErr(true); return; }
    onLogin(pw);
  };

  return (
    <div style={{ background: C.bg, minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: F.sans }}>
      {/* Masthead */}
      <div style={{ position: "fixed", top: 0, left: 0, right: 0, padding: "14px 32px", display: "flex", alignItems: "baseline", gap: 14, background: C.ink }}>
        <div style={{ fontFamily: F.serif, fontSize: 22, color: "#f5f0e8", fontWeight: 400 }}>NewsClip</div>
        <div style={{ fontFamily: F.mono, fontSize: 10, color: "#8a8070", letterSpacing: "0.12em", textTransform: "uppercase", borderLeft: "1px solid #444", paddingLeft: 12 }}>
          Agent Dashboard
        </div>
      </div>
      <div style={{ marginBottom: 32, textAlign: "center" }}>
        <div style={{ fontFamily: F.mono, fontSize: 10, color: C.inkFaint, letterSpacing: "0.15em", textTransform: "uppercase" }}>Sign in to continue</div>
      </div>
      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 10, width: 260 }}>
        <input
          type="password" value={pw} autoFocus
          onChange={e => { setPw(e.target.value); setErr(false); }}
          placeholder="Password"
          style={{ padding: "10px 14px", border: `1px solid ${err ? C.accent : C.border}`, borderRadius: 4, background: C.surface, fontFamily: F.sans, fontSize: 14, color: C.ink, outline: "none" }}
        />
        {err && <div style={{ fontFamily: F.mono, fontSize: 10, color: C.accent }}>Enter your password</div>}
        <button type="submit" style={{ padding: "10px 0", background: C.ink, color: "#fff", border: "none", borderRadius: 4, fontFamily: F.mono, fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer" }}>
          Enter
        </button>
      </form>
    </div>
  );
}

// ── Story card ─────────────────────────────────────────────────────────────────

function StoryCard({ s }: { s: any }) {
  return (
    <div style={{ padding: "16px 0", borderBottom: `1px solid ${C.borderLight}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: F.mono, fontSize: 9, color: C.accent, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>{s.source}</div>
          <div style={{ fontFamily: F.serif, fontSize: 15, fontWeight: 400, color: C.ink, lineHeight: 1.4, marginBottom: 6 }}>{s.headline}</div>
          <div style={{ fontFamily: F.sans, fontSize: 12, color: C.inkLight, lineHeight: 1.6, marginBottom: 8 }}>{s.summary}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {(s.keywords || []).map((k: string) => (
              <span key={k} style={{ fontFamily: F.mono, fontSize: 9, padding: "2px 6px", background: C.sand, color: C.inkFaint, letterSpacing: "0.05em" }}>{k}</span>
            ))}
          </div>
        </div>
        <a href={s.url} target="_blank" rel="noreferrer"
          style={{ fontFamily: F.mono, fontSize: 10, color: C.blue, textDecoration: "none", whiteSpace: "nowrap", marginTop: 2 }}>
          ↗ Read
        </a>
      </div>
    </div>
  );
}

// ── Section divider ────────────────────────────────────────────────────────────

function SectionDivider({ title }: { title: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "20px 0 4px" }}>
      <span style={{ fontFamily: F.mono, fontSize: 9, letterSpacing: "0.15em", textTransform: "uppercase", color: C.inkFaint, whiteSpace: "nowrap" }}>{title}</span>
      <div style={{ flex: 1, height: 1, background: C.borderLight }}></div>
    </div>
  );
}

// ── Dashboard ──────────────────────────────────────────────────────────────────

function Dashboard({ password }: { password: string }) {
  const [state,   setState]   = useState<"idle" | "loading" | "done" | "error">("idle");
  const [stories, setStories] = useState<any[]>([]);
  const [errMsg,  setErrMsg]  = useState("");
  const [tab,     setTab]     = useState<"preview" | "status">("preview");

  const today = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  const weekStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    .toLocaleDateString("en-GB", { day: "2-digit", month: "short" });

  const handleRun = async () => {
    setState("loading"); setErrMsg("");
    try {
      const res  = await fetch("/api/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Unknown error");
      setStories(data.stories);
      setState("done");
      setTab("preview");
    } catch (e: any) {
      setErrMsg(e.message);
      setState("error");
    }
  };

  const pt    = stories.filter(s => s.section === "Portugal");
  const world = stories.filter(s => s.section === "International");

  const tabBtn = (t: "preview" | "status") => ({
    fontFamily: F.mono, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase" as const,
    padding: "8px 16px", cursor: "pointer", border: "none", background: "transparent",
    color: tab === t ? C.ink : C.inkFaint,
    borderBottom: tab === t ? `2px solid ${C.ink}` : "2px solid transparent",
    marginBottom: -1, transition: "color 0.15s",
  });

  const runBtnBg = state === "done" ? C.green : state === "error" ? C.accent : C.ink;

  return (
    <div style={{ fontFamily: F.sans, background: C.bg, minHeight: "100vh", color: C.ink }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}`}</style>

      {/* Masthead */}
      <div style={{ padding: "14px 32px", display: "flex", alignItems: "baseline", gap: 14, background: C.ink }}>
        <div style={{ fontFamily: F.serif, fontSize: 22, color: "#f5f0e8", fontWeight: 400 }}>NewsClip</div>
        <div style={{ fontFamily: F.mono, fontSize: 10, color: "#8a8070", letterSpacing: "0.12em", textTransform: "uppercase", borderLeft: "1px solid #444", paddingLeft: 12 }}>
          Agent Dashboard
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ display: "flex", borderBottom: `1px solid ${C.border}`, padding: "0 32px", background: C.surface }}>
        <button style={tabBtn("preview")} onClick={() => setTab("preview")}>Preview</button>
        <button style={tabBtn("status")}  onClick={() => setTab("status")}>Status</button>
      </div>

      {/* Layout */}
      <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", minHeight: "calc(100vh - 96px)" }}>

        {/* Sidebar */}
        <div style={{ borderRight: `1px solid ${C.border}`, padding: "24px 20px", background: C.surface }}>

          <div style={{ marginBottom: 24 }}>
            <div style={{ fontFamily: F.mono, fontSize: 9, letterSpacing: "0.15em", textTransform: "uppercase", color: C.inkFaint, marginBottom: 10, paddingBottom: 6, borderBottom: `1px solid ${C.borderLight}` }}>
              Schedule
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 7, fontFamily: F.mono, fontSize: 11, color: C.green }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.green, display: "inline-block", animation: "pulse 2.5s infinite" }}></span>
              Every Sunday, 07:00
            </div>
          </div>

          <div style={{ marginBottom: 24 }}>
            <div style={{ fontFamily: F.mono, fontSize: 9, letterSpacing: "0.15em", textTransform: "uppercase", color: C.inkFaint, marginBottom: 10, paddingBottom: 6, borderBottom: `1px solid ${C.borderLight}` }}>
              On-demand
            </div>
            <div style={{ fontFamily: F.sans, fontSize: 12, color: C.inkLight, lineHeight: 1.6, marginBottom: 12 }}>
              Fetches this week's stories, shows a preview, and sends the email.
            </div>
            <button
              onClick={handleRun}
              disabled={state === "loading"}
              style={{ width: "100%", padding: "9px 0", background: runBtnBg, color: "#fff", border: "none", borderRadius: 4, fontFamily: F.mono, fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", cursor: state === "loading" ? "not-allowed" : "pointer", transition: "background 0.2s", opacity: state === "loading" ? 0.7 : 1 }}
            >
              {state === "loading" ? (
                <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                  <span style={{ width: 10, height: 10, border: "2px solid rgba(255,255,255,0.4)", borderTopColor: "#fff", borderRadius: "50%", display: "inline-block", animation: "spin 0.8s linear infinite" }}></span>
                  Running…
                </span>
              ) : state === "done" ? "✓ Digest sent" : state === "error" ? "✗ Retry" : "▶ Run Now"}
            </button>
            {errMsg && <div style={{ fontFamily: F.mono, fontSize: 10, color: C.accent, marginTop: 8, lineHeight: 1.5 }}>{errMsg}</div>}
            {state === "done" && <div style={{ fontFamily: F.mono, fontSize: 10, color: C.green, marginTop: 8 }}>{stories.length} stories · email sent</div>}
          </div>

          <div>
            <div style={{ fontFamily: F.mono, fontSize: 9, letterSpacing: "0.15em", textTransform: "uppercase", color: C.inkFaint, marginBottom: 10, paddingBottom: 6, borderBottom: `1px solid ${C.borderLight}` }}>
              Delivery
            </div>
            {[
              ["Recipient", process.env.NEXT_PUBLIC_DIGEST_EMAIL || "configured via env"],
              ["Service",   "SendGrid"],
              ["Format",    "HTML email"],
            ].map(([k, v]) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: 11, color: C.inkFaint }}>{k}</span>
                <span style={{ fontFamily: F.mono, fontSize: 10, color: C.inkLight }}>{v}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Content */}
        <div style={{ padding: "28px 36px", overflowY: "auto" }}>

          {tab === "preview" && (
            <>
              {state === "idle" && (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 320, gap: 14, color: C.inkFaint }}>
                  <div style={{ fontSize: 36, opacity: 0.4 }}>📰</div>
                  <div style={{ fontFamily: F.mono, fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase" }}>
                    Hit Run Now to fetch this week's stories
                  </div>
                </div>
              )}

              {state === "loading" && (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 320, gap: 14, color: C.inkFaint }}>
                  <div style={{ width: 24, height: 24, border: `2px solid ${C.border}`, borderTopColor: C.inkLight, borderRadius: "50%", animation: "spin 0.9s linear infinite" }}></div>
                  <div style={{ fontFamily: F.mono, fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase" }}>Searching the web… (~60s)</div>
                </div>
              )}

              {stories.length > 0 && (
                <div style={{ background: C.surface, border: `1px solid ${C.border}`, maxWidth: 640, borderRadius: 4 }}>
                  {/* Email header bar */}
                  <div style={{ background: C.sand, borderBottom: `1px solid ${C.border}`, padding: "8px 20px", display: "flex", justifyContent: "space-between", borderRadius: "4px 4px 0 0" }}>
                    <span style={{ fontFamily: F.mono, fontSize: 10, color: C.inkLight }}>Weekly Digest — {today}</span>
                    <span style={{ fontFamily: F.mono, fontSize: 10, color: C.inkFaint }}>{stories.length} stories</span>
                  </div>

                  <div style={{ padding: "24px 28px" }}>
                    <div style={{ borderBottom: `1px solid ${C.border}`, paddingBottom: 14, marginBottom: 4 }}>
                      <div style={{ fontFamily: F.mono, fontSize: 9, color: C.inkFaint, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 4 }}>
                        Week of {weekStart} – {today}
                      </div>
                      <div style={{ fontFamily: F.serif, fontSize: 22, fontWeight: 400, color: C.ink, marginBottom: 4 }}>
                        Your Weekly News Digest
                      </div>
                      <div style={{ fontFamily: F.sans, fontSize: 12, color: C.inkFaint }}>
                        {stories.length} stories · Portugal + International
                      </div>
                    </div>

                    {pt.length > 0 && <><SectionDivider title="Portugal" />{pt.map((s, i) => <StoryCard key={i} s={s} />)}</>}
                    {world.length > 0 && <><SectionDivider title="International" />{world.map((s, i) => <StoryCard key={i} s={s} />)}</>}

                    <div style={{ marginTop: 20, paddingTop: 14, borderTop: `1px solid ${C.borderLight}`, fontFamily: F.mono, fontSize: 9, color: C.inkFaint, textAlign: "center" }}>
                      Generated by NewsClip Agent · Powered by Claude + Web Search
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {tab === "status" && (
            <div style={{ maxWidth: 440 }}>
              <div style={{ fontFamily: F.mono, fontSize: 9, letterSpacing: "0.15em", textTransform: "uppercase", color: C.inkFaint, marginBottom: 12, paddingBottom: 6, borderBottom: `1px solid ${C.borderLight}` }}>
                Agent info
              </div>
              {[
                ["Schedule",      "Every Sunday at 07:00 Lisbon"],
                ["Model",         "claude-sonnet-4-5"],
                ["Email service", "SendGrid"],
                ["Hosted on",     "Vercel"],
                ["Cron runner",   "GitHub Actions"],
              ].map(([k, v]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: `1px solid ${C.borderLight}` }}>
                  <span style={{ fontFamily: F.sans, fontSize: 13, color: C.inkLight }}>{k}</span>
                  <span style={{ fontFamily: F.mono, fontSize: 11, color: C.ink }}>{v}</span>
                </div>
              ))}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

// ── Root ───────────────────────────────────────────────────────────────────────

export default function Home() {
  const [password, setPassword] = useState<string | null>(null);
  if (!password) return <LoginScreen onLogin={setPassword} />;
  return <Dashboard password={password} />;
}
