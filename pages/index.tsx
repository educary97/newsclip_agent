// pages/index.tsx
// NewsClip Agent dashboard — password protected, triggers the agent on demand.

import { useState } from "react";

const STYLES = {
  wrap:        { fontFamily: "'Georgia', serif", background: "#f5f0e8", minHeight: "100vh", color: "#0f0f0f" } as React.CSSProperties,
  masthead:    { borderBottom: "3px double #0f0f0f", padding: "16px 28px 10px", display: "flex", alignItems: "baseline", gap: 14, background: "#f5f0e8" } as React.CSSProperties,
  title:       { fontSize: 26, fontWeight: 900, letterSpacing: -0.5 } as React.CSSProperties,
  sub:         { fontFamily: "monospace", fontSize: 11, color: "#8a8070", letterSpacing: "0.1em", textTransform: "uppercase" as const, borderLeft: "1px solid #d4cfc4", paddingLeft: 12 },
  tabBar:      { display: "flex", borderBottom: "1px solid #d4cfc4", padding: "0 28px", background: "#fdf6e3" } as React.CSSProperties,
  layout:      { display: "grid", gridTemplateColumns: "270px 1fr", minHeight: "calc(100vh - 98px)" } as React.CSSProperties,
  sidebar:     { borderRight: "1px solid #d4cfc4", padding: "20px 16px", background: "#fdf6e3" } as React.CSSProperties,
  label:       { fontFamily: "monospace", fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase" as const, color: "#8a8070", marginBottom: 8, paddingBottom: 5, borderBottom: "1px solid #d4cfc4" },
  content:     { padding: "24px 28px", overflowY: "auto" as const },
  emailBox:    { border: "1px solid #d4cfc4", background: "white", maxWidth: 620 } as React.CSSProperties,
  emailBar:    { background: "#0f0f0f", color: "#f5f0e8", padding: "9px 16px", fontFamily: "monospace", fontSize: 10, display: "flex", justifyContent: "space-between" } as React.CSSProperties,
  emailBody:   { padding: "22px 26px" } as React.CSSProperties,
  runBtn:      (state: string) => ({
    width: "100%", padding: "10px 0", border: "none", fontFamily: "monospace", fontSize: 11,
    letterSpacing: "0.1em", textTransform: "uppercase" as const, cursor: state === "loading" ? "not-allowed" : "pointer",
    background: state === "done" ? "#2a7a4f" : state === "error" ? "#c8402a" : "#0f0f0f",
    color: "#f5f0e8", marginTop: 8, transition: "background 0.2s",
  }),
  newsSource:  { fontFamily: "monospace", fontSize: 10, color: "#c8402a", textTransform: "uppercase" as const, letterSpacing: "0.1em", marginBottom: 2 },
  newsHead:    { fontFamily: "Georgia, serif", fontSize: 15, fontWeight: 700, lineHeight: 1.3, marginBottom: 4 } as React.CSSProperties,
  newsSummary: { fontSize: 12, lineHeight: 1.55, color: "#333", marginBottom: 6 } as React.CSSProperties,
  newsTag:     { fontFamily: "monospace", fontSize: 10, padding: "2px 5px", background: "#e8e4dc", color: "#8a8070", display: "inline-block", margin: "2px 3px 0 0" } as React.CSSProperties,
  newsLink:    { fontFamily: "monospace", fontSize: 10, color: "#1a4a7a", textDecoration: "none" } as React.CSSProperties,
  divider:     { display: "flex", alignItems: "center", gap: 10, margin: "18px 0 12px" } as React.CSSProperties,
  divLine:     { flex: 1, height: 1, background: "#d4cfc4" } as React.CSSProperties,
  divText:     { fontFamily: "monospace", fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase" as const, color: "#8a8070" },
  dot:         { width: 7, height: 7, background: "#2a7a4f", borderRadius: "50%", display: "inline-block", marginRight: 5 } as React.CSSProperties,
};

// ── Login screen ───────────────────────────────────────────────────────────────

function LoginScreen({ onLogin }: { onLogin: (pw: string) => void }) {
  const [pw, setPw]     = useState("");
  const [err, setErr]   = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pw.trim()) { setErr(true); return; }
    onLogin(pw);
  };

  return (
    <div style={{ ...STYLES.wrap, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
      <div style={{ ...STYLES.masthead, justifyContent: "center", borderBottom: "none", marginBottom: 32 }}>
        <div style={STYLES.title}>NewsClip</div>
        <div style={STYLES.sub}>Agent Dashboard</div>
      </div>
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 10, width: 280 }}>
        <div style={STYLES.label}>Password</div>
        <input
          type="password"
          value={pw}
          onChange={e => { setPw(e.target.value); setErr(false); }}
          style={{ padding: "8px 10px", border: `1px solid ${err ? "#c8402a" : "#d4cfc4"}`, background: "#f5f0e8", fontFamily: "monospace", fontSize: 13, outline: "none" }}
          autoFocus
        />
        {err && <div style={{ fontFamily: "monospace", fontSize: 10, color: "#c8402a" }}>Enter your password</div>}
        <button type="submit" style={STYLES.runBtn("idle")}>Enter</button>
      </form>
    </div>
  );
}

// ── Story card ─────────────────────────────────────────────────────────────────

function StoryCard({ s }: { s: any }) {
  return (
    <div style={{ paddingBottom: 12, marginBottom: 12, borderBottom: "1px solid #d4cfc4" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ flex: 1 }}>
          <div style={STYLES.newsSource}>{s.source}</div>
          <div style={STYLES.newsHead}>{s.headline}</div>
          <div style={STYLES.newsSummary}>{s.summary}</div>
          <div style={{ marginBottom: 6 }}>
            {(s.keywords || []).map((k: string) => <span key={k} style={STYLES.newsTag}>{k}</span>)}
          </div>
        </div>
        <a href={s.url} target="_blank" rel="noreferrer" style={{ ...STYLES.newsLink, marginLeft: 12, whiteSpace: "nowrap" }}>↗ Read</a>
      </div>
    </div>
  );
}

// ── Main dashboard ─────────────────────────────────────────────────────────────

function Dashboard({ password }: { password: string }) {
  const [runState, setRunState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [stories,  setStories]  = useState<any[]>([]);
  const [errorMsg, setErrorMsg] = useState("");
  const [tab,      setTab]      = useState<"preview" | "status">("preview");

  const today = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  const weekStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    .toLocaleDateString("en-GB", { day: "2-digit", month: "short" });

  const handleRun = async () => {
    setRunState("loading");
    setErrorMsg("");
    try {
      const res = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Unknown error");
      setStories(data.stories);
      setRunState("done");
      setTab("preview");
    } catch (e: any) {
      setErrorMsg(e.message);
      setRunState("error");
    }
  };

  const pt    = stories.filter(s => s.section === "Portugal");
  const world = stories.filter(s => s.section === "International");

  const tabStyle = (t: string) => ({
    fontFamily: "monospace", fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase" as const,
    padding: "9px 16px", cursor: "pointer", border: "none",
    background: tab === t ? "#f5f0e8" : "transparent",
    color: tab === t ? "#0f0f0f" : "#8a8070",
    borderBottom: tab === t ? "2px solid #0f0f0f" : "2px solid transparent",
    marginBottom: -1,
  });

  return (
    <div style={STYLES.wrap}>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}} @keyframes spin{to{transform:rotate(360deg)}}`}</style>

      <div style={STYLES.masthead}>
        <div style={STYLES.title}>NewsClip</div>
        <div style={STYLES.sub}>Agent Dashboard</div>
      </div>

      <div style={STYLES.tabBar}>
        <button style={tabStyle("preview")} onClick={() => setTab("preview")}>Preview</button>
        <button style={tabStyle("status")}  onClick={() => setTab("status")}>Status</button>
      </div>

      <div style={STYLES.layout}>
        {/* Sidebar */}
        <div style={STYLES.sidebar}>
          <div style={{ ...STYLES.label, marginTop: 0 }}>Schedule</div>
          <div style={{ display: "flex", alignItems: "center", fontFamily: "monospace", fontSize: 11, color: "#2a7a4f", marginBottom: 20 }}>
            <span style={{ ...STYLES.dot, animation: "pulse 2s infinite" }}></span>
            Every Sunday, 07:00
          </div>

          <div style={STYLES.label}>On-demand Run</div>
          <div style={{ fontFamily: "monospace", fontSize: 10, color: "#8a8070", lineHeight: 1.5, marginBottom: 10 }}>
            Fetches latest stories, previews the digest, and sends the email.
          </div>

          <button
            style={STYLES.runBtn(runState)}
            onClick={handleRun}
            disabled={runState === "loading"}
          >
            {runState === "loading" ? (
              <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                <span style={{ width: 10, height: 10, border: "2px solid #f5f0e8", borderTopColor: "transparent", borderRadius: "50%", display: "inline-block", animation: "spin 0.8s linear infinite" }}></span>
                Running…
              </span>
            ) : runState === "done" ? "✓ Digest sent!" : runState === "error" ? "✗ Error — retry" : "▶ Run Now"}
          </button>

          {errorMsg && (
            <div style={{ fontFamily: "monospace", fontSize: 10, color: "#c8402a", marginTop: 8, lineHeight: 1.5 }}>
              {errorMsg}
            </div>
          )}

          {runState === "done" && (
            <div style={{ fontFamily: "monospace", fontSize: 10, color: "#2a7a4f", marginTop: 8 }}>
              {stories.length} stories · email sent
            </div>
          )}

          <div style={{ ...STYLES.label, marginTop: 24 }}>Delivery</div>
          <div style={{ fontFamily: "monospace", fontSize: 10, color: "#8a8070", lineHeight: 1.6 }}>
            Recipient: {process.env.NEXT_PUBLIC_DIGEST_EMAIL || "configured via env"}<br />
            Service: SendGrid<br />
            Format: HTML email
          </div>
        </div>

        {/* Content */}
        <div style={STYLES.content}>

          {tab === "preview" && (
            <>
              {runState === "idle" && (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 300, color: "#8a8070", gap: 12 }}>
                  <div style={{ fontSize: 32 }}>📰</div>
                  <div style={{ fontFamily: "monospace", fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase" }}>
                    Hit Run Now to fetch this week's stories
                  </div>
                </div>
              )}

              {runState === "loading" && (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 300, color: "#8a8070", gap: 14 }}>
                  <div style={{ width: 28, height: 28, border: "2px solid #d4cfc4", borderTopColor: "#0f0f0f", borderRadius: "50%", animation: "spin 0.8s linear infinite" }}></div>
                  <div style={{ fontFamily: "monospace", fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase" }}>
                    Searching the web… (~60s)
                  </div>
                </div>
              )}

              {(runState === "done" || runState === "error") && stories.length > 0 && (
                <div style={STYLES.emailBox}>
                  <div style={STYLES.emailBar}>
                    <span>Weekly Digest — {today}</span>
                    <span>{stories.length} stories</span>
                  </div>
                  <div style={STYLES.emailBody}>
                    <div style={{ borderBottom: "2px solid #0f0f0f", paddingBottom: 10, marginBottom: 16 }}>
                      <div style={{ fontFamily: "monospace", fontSize: 10, color: "#8a8070", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                        Week of {weekStart} – {today}
                      </div>
                      <div style={{ fontFamily: "Georgia, serif", fontSize: 22, fontWeight: 700, margin: "3px 0" }}>
                        Your Weekly News Digest
                      </div>
                      <div style={{ fontSize: 11, color: "#8a8070" }}>
                        {stories.length} stories · Portugal + International
                      </div>
                    </div>

                    {pt.length > 0 && (
                      <>
                        <div style={STYLES.divider}>
                          <span style={STYLES.divText}>Portugal</span>
                          <div style={STYLES.divLine}></div>
                        </div>
                        {pt.map((s, i) => <StoryCard key={i} s={s} />)}
                      </>
                    )}

                    {world.length > 0 && (
                      <>
                        <div style={STYLES.divider}>
                          <span style={STYLES.divText}>International</span>
                          <div style={STYLES.divLine}></div>
                        </div>
                        {world.map((s, i) => <StoryCard key={i} s={s} />)}
                      </>
                    )}

                    <div style={{ marginTop: 20, paddingTop: 14, borderTop: "1px solid #d4cfc4", fontFamily: "monospace", fontSize: 10, color: "#aaa", textAlign: "center" }}>
                      Generated by NewsClip Agent · Powered by Claude + Web Search
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {tab === "status" && (
            <div style={{ maxWidth: 480 }}>
              <div style={{ ...STYLES.label, marginBottom: 12 }}>Agent info</div>
              {[
                ["Schedule",     "Every Sunday at 07:00 Lisbon"],
                ["Model",        "claude-sonnet-4-5"],
                ["Email service","SendGrid"],
                ["Hosted on",    "Vercel"],
                ["Cron runner",  "GitHub Actions"],
              ].map(([k, v]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "9px 12px", borderBottom: "1px solid #d4cfc4", fontSize: 13 }}>
                  <span style={{ color: "#666" }}>{k}</span>
                  <span style={{ fontFamily: "monospace", fontSize: 11 }}>{v}</span>
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
