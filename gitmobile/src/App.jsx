import { useState, useEffect, useCallback, useRef, createContext, useContext } from "react";

// ─── Theme & Auth Context ────────────────────────────────────────────────────
const AppContext = createContext(null);
const useApp = () => useContext(AppContext);

const LANGS = {
  js: "javascript", jsx: "javascript", ts: "typescript", tsx: "typescript",
  py: "python", md: "markdown", json: "json", html: "html", css: "css",
  java: "java", cpp: "cpp", c: "c", go: "go", rs: "rust", php: "php",
  yml: "yaml", yaml: "yaml", sh: "bash", xml: "xml", txt: "plaintext",
};
const getLang = (name = "") => LANGS[name.split(".").pop()?.toLowerCase()] || "plaintext";

const ICONS = {
  repo: "⬡", file: "📄", folder: "📁", folderOpen: "📂", branch: "⎇",
  commit: "◉", star: "★", fork: "⑂", eye: "◉", lock: "🔒", public: "🌐",
  pr: "⤵", issue: "◎", tag: "◈", user: "○", org: "⬡", gear: "⚙",
  upload: "↑", download: "↓", plus: "+", close: "×", back: "←",
  search: "⌕", code: "<>", edit: "✎", trash: "⌫", copy: "⎘", check: "✓",
  alert: "⚠", info: "ℹ", refresh: "↺", link: "⇗", dots: "⋯",
};

// ─── GitHub API ──────────────────────────────────────────────────────────────
function useGitHub(token) {
  const call = useCallback(async (path, opts = {}) => {
    if (!token) throw new Error("No token");
    const res = await fetch(`https://api.github.com${path}`, {
      ...opts,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        ...(opts.body ? { "Content-Type": "application/json" } : {}),
        ...opts.headers,
      },
    });
    const remaining = res.headers.get("x-ratelimit-remaining");
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw Object.assign(new Error(err.message || `HTTP ${res.status}`), { status: res.status, remaining });
    }
    if (res.status === 204) return null;
    return res.json();
  }, [token]);

  return {
    getUser: () => call("/user"),
    getRepos: (page = 1) => call(`/user/repos?sort=updated&per_page=30&page=${page}`),
    getOrgs: () => call("/user/orgs"),
    getRepo: (owner, repo) => call(`/repos/${owner}/${repo}`),
    getContents: (owner, repo, path = "", ref = "") =>
      call(`/repos/${owner}/${repo}/contents/${path}${ref ? `?ref=${ref}` : ""}`),
    getBranches: (owner, repo) => call(`/repos/${owner}/${repo}/branches?per_page=100`),
    getCommits: (owner, repo, branch, page = 1) =>
      call(`/repos/${owner}/${repo}/commits?sha=${branch}&per_page=30&page=${page}`),
    getFileContent: (owner, repo, path, ref = "") =>
      call(`/repos/${owner}/${repo}/contents/${path}${ref ? `?ref=${ref}` : ""}`),
    createOrUpdateFile: (owner, repo, path, body) =>
      call(`/repos/${owner}/${repo}/contents/${path}`, { method: "PUT", body: JSON.stringify(body) }),
    deleteFile: (owner, repo, path, body) =>
      call(`/repos/${owner}/${repo}/contents/${path}`, { method: "DELETE", body: JSON.stringify(body) }),
    createRepo: (body) => call("/user/repos", { method: "POST", body: JSON.stringify(body) }),
    deleteRepo: (owner, repo) => call(`/repos/${owner}/${repo}`, { method: "DELETE" }),
    createBranch: (owner, repo, body) =>
      call(`/repos/${owner}/${repo}/git/refs`, { method: "POST", body: JSON.stringify(body) }),
    getRef: (owner, repo, ref) => call(`/repos/${owner}/${repo}/git/ref/${ref}`),
    getPRs: (owner, repo) => call(`/repos/${owner}/${repo}/pulls?state=open&per_page=20`),
    getIssues: (owner, repo) => call(`/repos/${owner}/${repo}/issues?state=open&per_page=20`),
    getReleases: (owner, repo) => call(`/repos/${owner}/${repo}/releases?per_page=10`),
    getTree: (owner, repo, sha) =>
      call(`/repos/${owner}/${repo}/git/trees/${sha}?recursive=1`),
    createTree: (owner, repo, body) =>
      call(`/repos/${owner}/${repo}/git/trees`, { method: "POST", body: JSON.stringify(body) }),
    createCommit: (owner, repo, body) =>
      call(`/repos/${owner}/${repo}/git/commits`, { method: "POST", body: JSON.stringify(body) }),
    updateRef: (owner, repo, ref, body) =>
      call(`/repos/${owner}/${repo}/git/refs/${ref}`, { method: "PATCH", body: JSON.stringify(body) }),
    createBlob: (owner, repo, body) =>
      call(`/repos/${owner}/${repo}/git/blobs`, { method: "POST", body: JSON.stringify(body) }),
    searchRepos: (q) => call(`/search/repositories?q=${encodeURIComponent(q)}&per_page=10`),
  };
}

// ─── Utilities ───────────────────────────────────────────────────────────────
function relTime(dateStr) {
  const s = (Date.now() - new Date(dateStr)) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 2592000) return `${Math.floor(s / 86400)}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

function fmtNum(n) {
  if (!n) return "0";
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function b64decode(str) {
  try { return atob(str.replace(/\s/g, "")); } catch { return ""; }
}
function b64encode(str) {
  try { return btoa(unescape(encodeURIComponent(str))); } catch { return btoa(str); }
}

// ─── Components ──────────────────────────────────────────────────────────────

function Spinner({ size = 16 }) {
  return (
    <span style={{
      display: "inline-block", width: size, height: size,
      border: `2px solid #30363d`, borderTopColor: "#58a6ff",
      borderRadius: "50%", animation: "spin 0.7s linear infinite",
    }} />
  );
}

function Toast({ msg, type = "info", onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 3500); return () => clearTimeout(t); }, []);
  const colors = { info: "#58a6ff", success: "#3fb950", error: "#f85149", warn: "#d29922" };
  return (
    <div style={{
      position: "fixed", bottom: 40, right: 16, zIndex: 9999,
      background: "#161b22", border: `1px solid ${colors[type]}`,
      color: "#e6edf3", padding: "10px 16px", borderRadius: 8,
      fontSize: 13, maxWidth: 320, boxShadow: "0 8px 24px #0008",
      display: "flex", gap: 8, alignItems: "center",
    }}>
      <span style={{ color: colors[type] }}>{type === "error" ? ICONS.alert : ICONS.info}</span>
      <span style={{ flex: 1 }}>{msg}</span>
      <button onClick={onClose} style={{ background: "none", border: "none", color: "#8b949e", cursor: "pointer" }}>×</button>
    </div>
  );
}

function Modal({ title, children, onClose, width = 480 }) {
  return (
    <div style={{
      position: "fixed", inset: 0, background: "#0009", zIndex: 1000,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: "#161b22", border: "1px solid #30363d", borderRadius: 12,
        width: "100%", maxWidth: width, maxHeight: "90vh", overflow: "auto",
        padding: 24, color: "#e6edf3",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>{title}</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#8b949e", cursor: "pointer", fontSize: 20, lineHeight: 1 }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Input({ label, ...props }) {
  return (
    <div style={{ marginBottom: 12 }}>
      {label && <label style={{ display: "block", fontSize: 12, color: "#8b949e", marginBottom: 4 }}>{label}</label>}
      <input {...props} style={{
        width: "100%", background: "#0d1117", border: "1px solid #30363d",
        borderRadius: 6, color: "#e6edf3", padding: "8px 10px", fontSize: 14,
        outline: "none", boxSizing: "border-box",
        ...(props.style || {}),
      }} />
    </div>
  );
}

function Btn({ children, variant = "default", size = "md", ...props }) {
  const bg = { default: "#21262d", primary: "#238636", danger: "#da3633", ghost: "transparent", blue: "#1f6feb" };
  const hov = { default: "#30363d", primary: "#2ea043", danger: "#b91c1c", ghost: "#21262d", blue: "#388bfd" };
  const pad = { sm: "4px 10px", md: "6px 14px", lg: "10px 20px" };
  const fs = { sm: 12, md: 13, lg: 14 };
  return (
    <button {...props} style={{
      background: bg[variant], border: "1px solid #30363d", borderRadius: 6,
      color: "#e6edf3", padding: pad[size], fontSize: fs[size], cursor: "pointer",
      fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 6,
      transition: "background 0.1s", whiteSpace: "nowrap",
      opacity: props.disabled ? 0.5 : 1,
      ...(props.style || {}),
    }}
      onMouseEnter={e => !props.disabled && (e.currentTarget.style.background = hov[variant])}
      onMouseLeave={e => !props.disabled && (e.currentTarget.style.background = bg[variant])}
    >{children}</button>
  );
}

function Badge({ children, color = "#8b949e" }) {
  return (
    <span style={{
      background: "#21262d", color, border: `1px solid ${color}33`,
      borderRadius: 20, padding: "2px 8px", fontSize: 11, fontWeight: 600,
    }}>{children}</span>
  );
}

// ─── Auth Screen ─────────────────────────────────────────────────────────────
function AuthScreen({ onAuth }) {
  const [pat, setPat] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const handlePAT = async () => {
    if (!pat.trim()) return setErr("Enter a token");
    setLoading(true); setErr("");
    try {
      const res = await fetch("https://api.github.com/user", {
        headers: { Authorization: `Bearer ${pat.trim()}` },
      });
      if (!res.ok) throw new Error("Invalid token");
      const user = await res.json();
      sessionStorage.setItem("gh_token", pat.trim());
      onAuth(pat.trim(), user);
    } catch (e) { setErr(e.message); }
    setLoading(false);
  };

  const checkStored = useCallback(() => {
    const t = sessionStorage.getItem("gh_token");
    if (t) {
      fetch("https://api.github.com/user", { headers: { Authorization: `Bearer ${t}` } })
        .then(r => r.ok ? r.json() : null)
        .then(u => u && onAuth(t, u))
        .catch(() => {});
    }
  }, [onAuth]);

  useEffect(() => { checkStored(); }, []);

  return (
    <div style={{
      minHeight: "100vh", background: "#0d1117", display: "flex",
      alignItems: "center", justifyContent: "center", padding: 16,
      fontFamily: "'SF Mono', 'Fira Code', 'Consolas', monospace",
    }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} @keyframes fade{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}`}</style>
      <div style={{ width: "100%", maxWidth: 420, animation: "fade 0.4s ease" }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div style={{
            width: 64, height: 64, background: "linear-gradient(135deg,#58a6ff,#bc8cff)",
            borderRadius: 16, margin: "0 auto 16px", display: "flex", alignItems: "center",
            justifyContent: "center", fontSize: 32, boxShadow: "0 0 40px #58a6ff44",
          }}>⬡</div>
          <h1 style={{ color: "#e6edf3", fontSize: 24, fontWeight: 700, margin: "0 0 4px" }}>GitMobile</h1>
          <p style={{ color: "#8b949e", fontSize: 13, margin: 0 }}>GitHub from any browser</p>
        </div>

        {/* PAT Card */}
        <div style={{
          background: "#161b22", border: "1px solid #30363d", borderRadius: 12,
          padding: 24, marginBottom: 16,
        }}>
          <h2 style={{ color: "#e6edf3", fontSize: 15, fontWeight: 600, margin: "0 0 4px" }}>Sign in with Token</h2>
          <p style={{ color: "#8b949e", fontSize: 12, margin: "0 0 16px" }}>
            Create a PAT at GitHub → Settings → Developer settings → Personal access tokens
          </p>
          <div style={{ marginBottom: 12 }}>
            <input
              type="password"
              placeholder="ghp_xxxxxxxxxxxxxxxx"
              value={pat}
              onChange={e => setPat(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handlePAT()}
              style={{
                width: "100%", background: "#0d1117", border: `1px solid ${err ? "#f85149" : "#30363d"}`,
                borderRadius: 6, color: "#e6edf3", padding: "10px 12px", fontSize: 14,
                outline: "none", boxSizing: "border-box", fontFamily: "monospace",
              }}
            />
            {err && <p style={{ color: "#f85149", fontSize: 12, margin: "6px 0 0" }}>{err}</p>}
          </div>
          <Btn variant="primary" size="lg" onClick={handlePAT} disabled={loading} style={{ width: "100%" }}>
            {loading ? <Spinner size={14} /> : null}
            {loading ? "Verifying…" : "Connect to GitHub"}
          </Btn>
        </div>

        {/* Scopes hint */}
        <div style={{ background: "#161b22", border: "1px solid #30363d", borderRadius: 12, padding: 16 }}>
          <p style={{ color: "#8b949e", fontSize: 12, margin: "0 0 8px", fontWeight: 600 }}>Recommended token scopes</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {["repo", "read:org", "read:user", "workflow", "delete_repo"].map(s => (
              <Badge key={s} color="#3fb950">{s}</Badge>
            ))}
          </div>
        </div>

        <p style={{ color: "#484f58", fontSize: 11, textAlign: "center", marginTop: 20 }}>
          Token stored in session only · never sent to any server · clears on tab close
        </p>
      </div>
    </div>
  );
}

// ─── Sidebar ─────────────────────────────────────────────────────────────────
function Sidebar({ user, repos, currentRepo, onSelectRepo, onNewRepo, onHome, activeTab, setActiveTab, sidebarOpen, setSidebarOpen }) {
  const [search, setSearch] = useState("");
  const filtered = repos.filter(r =>
    r.full_name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          style={{ position: "fixed", inset: 0, background: "#0006", zIndex: 49, display: window.innerWidth >= 768 ? "none" : "block" }}
        />
      )}
      <aside style={{
        width: 260, flexShrink: 0, background: "#161b22", borderRight: "1px solid #30363d",
        display: "flex", flexDirection: "column", height: "100%", overflow: "hidden",
        position: window.innerWidth < 768 ? "fixed" : "relative",
        left: 0, top: 0, bottom: 0, zIndex: 50,
        transform: (window.innerWidth < 768 && !sidebarOpen) ? "translateX(-100%)" : "none",
        transition: "transform 0.2s ease",
      }}>
        {/* User */}
        <div
          onClick={onHome}
          style={{ padding: "14px 16px", borderBottom: "1px solid #30363d", display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}
        >
          <img src={user.avatar_url} alt="" style={{ width: 32, height: 32, borderRadius: "50%", border: "2px solid #30363d" }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: "#e6edf3", fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.login}</div>
            <div style={{ color: "#8b949e", fontSize: 11 }}>{user.public_repos} repos</div>
          </div>
          <Btn size="sm" variant="ghost" onClick={e => { e.stopPropagation(); onNewRepo(); }} title="New repo">{ICONS.plus}</Btn>
        </div>

        {/* Search */}
        <div style={{ padding: "10px 12px", borderBottom: "1px solid #30363d" }}>
          <div style={{ position: "relative" }}>
            <span style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", color: "#8b949e", fontSize: 14 }}>{ICONS.search}</span>
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Filter repositories…"
              style={{
                width: "100%", background: "#0d1117", border: "1px solid #30363d",
                borderRadius: 6, color: "#e6edf3", padding: "6px 8px 6px 28px",
                fontSize: 12, outline: "none", boxSizing: "border-box",
              }}
            />
          </div>
        </div>

        {/* Nav tabs */}
        <div style={{ padding: "8px 8px 0" }}>
          {[["repos", ICONS.repo, "Repositories"], ["orgs", ICONS.org, "Organizations"]].map(([id, icon, label]) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              style={{
                width: "100%", background: activeTab === id ? "#21262d" : "none",
                border: "none", borderRadius: 6, color: activeTab === id ? "#e6edf3" : "#8b949e",
                padding: "7px 10px", fontSize: 12, cursor: "pointer", display: "flex",
                alignItems: "center", gap: 8, textAlign: "left", marginBottom: 2,
              }}
            >{icon} {label}</button>
          ))}
        </div>

        {/* Repo list */}
        <div style={{ flex: 1, overflowY: "auto", padding: "4px 8px 8px" }}>
          {filtered.map(r => (
            <button
              key={r.id}
              onClick={() => { onSelectRepo(r); setSidebarOpen(false); }}
              style={{
                width: "100%", background: currentRepo?.id === r.id ? "#1f6feb22" : "none",
                border: `1px solid ${currentRepo?.id === r.id ? "#1f6feb" : "transparent"}`,
                borderRadius: 6, color: "#e6edf3", padding: "8px 10px", fontSize: 12,
                cursor: "pointer", display: "block", textAlign: "left", marginBottom: 2,
                transition: "all 0.1s",
              }}
              onMouseEnter={e => currentRepo?.id !== r.id && (e.currentTarget.style.background = "#21262d")}
              onMouseLeave={e => currentRepo?.id !== r.id && (e.currentTarget.style.background = "none")}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                <span style={{ color: "#8b949e" }}>{r.private ? ICONS.lock : ICONS.public}</span>
                <span style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{r.name}</span>
              </div>
              <div style={{ display: "flex", gap: 10, color: "#8b949e", fontSize: 11 }}>
                {r.language && <span>{r.language}</span>}
                {r.stargazers_count > 0 && <span>{ICONS.star} {fmtNum(r.stargazers_count)}</span>}
                <span style={{ marginLeft: "auto" }}>{relTime(r.updated_at)}</span>
              </div>
            </button>
          ))}
          {filtered.length === 0 && <p style={{ color: "#8b949e", fontSize: 12, padding: "8px 10px" }}>No repos found</p>}
        </div>
      </aside>
    </>
  );
}

// ─── Dashboard / Home ─────────────────────────────────────────────────────────
function Dashboard({ user, repos, orgs, onSelectRepo, onNewRepo }) {
  const pinned = repos.slice(0, 6);
  return (
    <div style={{ padding: "20px 16px", maxWidth: 900, margin: "0 auto" }}>
      {/* Profile */}
      <div style={{ display: "flex", gap: 16, alignItems: "flex-start", marginBottom: 28 }}>
        <img src={user.avatar_url} alt="" style={{ width: 72, height: 72, borderRadius: "50%", border: "3px solid #30363d" }} />
        <div>
          <h1 style={{ color: "#e6edf3", margin: "0 0 4px", fontSize: 20, fontWeight: 700 }}>{user.name || user.login}</h1>
          <p style={{ color: "#8b949e", margin: "0 0 8px", fontSize: 13 }}>@{user.login}</p>
          {user.bio && <p style={{ color: "#c9d1d9", fontSize: 13, margin: "0 0 8px" }}>{user.bio}</p>}
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            {[
              [user.followers, "Followers"],
              [user.following, "Following"],
              [user.public_repos, "Repos"],
            ].map(([n, l]) => (
              <span key={l} style={{ color: "#8b949e", fontSize: 12 }}>
                <strong style={{ color: "#e6edf3" }}>{fmtNum(n)}</strong> {l}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(100px,1fr))", gap: 8, marginBottom: 24 }}>
        {[
          [ICONS.repo, repos.length, "Repositories"],
          [ICONS.star, repos.reduce((a, r) => a + r.stargazers_count, 0), "Stars"],
          [ICONS.fork, repos.reduce((a, r) => a + r.forks_count, 0), "Forks"],
          [ICONS.org, orgs.length, "Organizations"],
        ].map(([icon, val, label]) => (
          <div key={label} style={{
            background: "#161b22", border: "1px solid #30363d", borderRadius: 10,
            padding: "14px 16px", textAlign: "center",
          }}>
            <div style={{ fontSize: 22, marginBottom: 4 }}>{icon}</div>
            <div style={{ color: "#e6edf3", fontWeight: 700, fontSize: 20 }}>{fmtNum(val)}</div>
            <div style={{ color: "#8b949e", fontSize: 11 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Pinned repos */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h2 style={{ color: "#e6edf3", fontSize: 15, fontWeight: 600, margin: 0 }}>Recent Repositories</h2>
        <Btn size="sm" variant="primary" onClick={onNewRepo}>{ICONS.plus} New</Btn>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 10 }}>
        {pinned.map(r => (
          <div
            key={r.id}
            onClick={() => onSelectRepo(r)}
            style={{
              background: "#161b22", border: "1px solid #30363d", borderRadius: 10,
              padding: 16, cursor: "pointer", transition: "border-color 0.15s",
            }}
            onMouseEnter={e => e.currentTarget.style.borderColor = "#58a6ff"}
            onMouseLeave={e => e.currentTarget.style.borderColor = "#30363d"}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <span style={{ color: "#8b949e" }}>{r.private ? ICONS.lock : ICONS.public}</span>
              <span style={{ color: "#58a6ff", fontWeight: 600, fontSize: 14 }}>{r.name}</span>
              {r.private && <Badge color="#8b949e">Private</Badge>}
            </div>
            {r.description && <p style={{ color: "#8b949e", fontSize: 12, margin: "0 0 10px", lineHeight: 1.5 }}>{r.description}</p>}
            <div style={{ display: "flex", gap: 12, color: "#8b949e", fontSize: 11 }}>
              {r.language && <span>◉ {r.language}</span>}
              {r.stargazers_count > 0 && <span>{ICONS.star} {fmtNum(r.stargazers_count)}</span>}
              {r.forks_count > 0 && <span>{ICONS.fork} {fmtNum(r.forks_count)}</span>}
              <span style={{ marginLeft: "auto" }}>{relTime(r.updated_at)}</span>
            </div>
          </div>
        ))}
      </div>

      {orgs.length > 0 && (
        <>
          <h2 style={{ color: "#e6edf3", fontSize: 15, fontWeight: 600, margin: "24px 0 12px" }}>Organizations</h2>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            {orgs.map(o => (
              <div key={o.id} style={{ display: "flex", alignItems: "center", gap: 8, background: "#161b22", border: "1px solid #30363d", borderRadius: 8, padding: "8px 12px" }}>
                <img src={o.avatar_url} alt="" style={{ width: 24, height: 24, borderRadius: 4 }} />
                <span style={{ color: "#e6edf3", fontSize: 13 }}>{o.login}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── File Explorer & Editor ───────────────────────────────────────────────────
function FileTree({ items, prefix = "", onOpen, depth = 0, staged = {} }) {
  const [expanded, setExpanded] = useState({});

  const current = items.filter(i => {
    const parts = i.path.replace(prefix, "").split("/").filter(Boolean);
    return parts.length === 1;
  });
  const dirs2 = current.filter(i => i.type === "dir");
  const files2 = current.filter(i => i.type === "file");

  return (
    <div>
      {[...dirs2, ...files2].map(item => {
        const stagedInfo = staged[item.path];
        const stagedColor = stagedInfo ? (stagedInfo.type === "delete" ? "#f85149" : "#d29922") : null;
        return (
          <div key={item.sha + item.path}>
            <div
              onClick={() => {
                if (item.type === "dir") setExpanded(e => ({ ...e, [item.path]: !e[item.path] }));
                else onOpen(item);
              }}
              style={{
                display: "flex", alignItems: "center", gap: 6, padding: "4px 8px",
                paddingLeft: 8 + depth * 14, cursor: "pointer", borderRadius: 4,
                color: stagedColor || (item.type === "dir" ? "#58a6ff" : "#e6edf3"),
                fontSize: 13,
              }}
              onMouseEnter={e => e.currentTarget.style.background = "#21262d"}
              onMouseLeave={e => e.currentTarget.style.background = "none"}
            >
              <span style={{ flexShrink: 0 }}>
                {item.type === "dir" ? (expanded[item.path] ? ICONS.folderOpen : ICONS.folder) : ICONS.file}
              </span>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                {item.path.split("/").pop()}
              </span>
              {stagedInfo && (
                <span style={{ fontSize: 10, color: stagedColor, fontWeight: 700, flexShrink: 0 }}>
                  {stagedInfo.type === "delete" ? "D" : "M"}
                </span>
              )}
            </div>
            {item.type === "dir" && expanded[item.path] && (
              <FileTree
                items={items.filter(i => i.path.startsWith(item.path + "/"))}
                prefix={item.path + "/"}
                onOpen={onOpen}
                depth={depth + 1}
                staged={staged}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// Computes a simple unified diff between two strings — enough to show
// added/removed lines without pulling in a diff library.
function computeDiff(oldText, newText) {
  if (!oldText && !newText) return [];
  if (!oldText) return newText.split("\n").map(l => ({ type: "add", line: l }));
  if (!newText) return oldText.split("\n").map(l => ({ type: "remove", line: l }));
  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");
  // LCS-based diff for accuracy on real edits
  const m = oldLines.length, n = newLines.length;
  // For large files just show a summary to keep rendering fast
  if (m + n > 400) {
    const added = newLines.filter(l => !oldLines.includes(l)).length;
    const removed = oldLines.filter(l => !newLines.includes(l)).length;
    return [{ type: "summary", added, removed }];
  }
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--)
    for (let j = n - 1; j >= 0; j--)
      dp[i][j] = oldLines[i] === newLines[j] ? 1 + dp[i+1][j+1] : Math.max(dp[i+1][j], dp[i][j+1]);
  const result = [];
  let i = 0, j = 0;
  while (i < m || j < n) {
    if (i < m && j < n && oldLines[i] === newLines[j]) {
      result.push({ type: "same", line: oldLines[i] }); i++; j++;
    } else if (j < n && (i >= m || dp[i+1]?.[j] <= dp[i]?.[j+1])) {
      result.push({ type: "add", line: newLines[j] }); j++;
    } else {
      result.push({ type: "remove", line: oldLines[i] }); i++;
    }
  }
  return result;
}

function StagedFileDiff({ path, change, onUnstage }) {
  const [expanded, setExpanded] = useState(true);
  const diff = change.type === "edit"
    ? computeDiff(change.originalContent, change.content)
    : null;
  const hasChanges = diff && diff.some(d => d.type !== "same");
  const addedCount = diff ? diff.filter(d => d.type === "add").length : 0;
  const removedCount = diff ? diff.filter(d => d.type === "remove").length : 0;

  return (
    <div style={{ borderBottom: "1px solid #21262d" }}>
      {/* File header */}
      <div
        onClick={() => setExpanded(e => !e)}
        style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 16px", cursor: "pointer", background: "#161b22" }}
        onMouseEnter={e => e.currentTarget.style.background = "#1c2128"}
        onMouseLeave={e => e.currentTarget.style.background = "#161b22"}
      >
        <span style={{ color: "#8b949e", fontSize: 12 }}>{expanded ? "▾" : "▸"}</span>
        <span style={{ fontSize: 13, color: "#e6edf3", flex: 1, fontFamily: "monospace" }}>{path}</span>
        {change.type === "delete" ? (
          <Badge color="#f85149">Deleted</Badge>
        ) : (
          <>
            {addedCount > 0 && <span style={{ color: "#3fb950", fontSize: 12, fontWeight: 600 }}>+{addedCount}</span>}
            {removedCount > 0 && <span style={{ color: "#f85149", fontSize: 12, fontWeight: 600 }}>-{removedCount}</span>}
            <Badge color="#d29922">Modified</Badge>
          </>
        )}
        <Btn size="sm" variant="ghost" onClick={e => { e.stopPropagation(); onUnstage(); }} title="Unstage">✕</Btn>
      </div>

      {/* Diff view */}
      {expanded && (
        <div style={{ fontFamily: "'SF Mono','Fira Code','Consolas',monospace", fontSize: 12, overflowX: "auto" }}>
          {change.type === "delete" ? (
            <div style={{ padding: "8px 16px", color: "#f85149", background: "#3d0000" }}>
              This file will be deleted from the repository.
            </div>
          ) : diff?.some(d => d.type === "summary") ? (
            <div style={{ padding: "8px 16px", color: "#8b949e" }}>
              Large file: +{diff[0].added} lines added, -{diff[0].removed} lines removed
            </div>
          ) : !hasChanges ? (
            <div style={{ padding: "8px 16px", color: "#484f58" }}>No text changes (binary or identical content)</div>
          ) : (
            diff.filter(d => d.type !== "same").length > 0 && (() => {
              // Show context: same lines adjacent to changes, collapse long same-runs
              const out = [];
              let sameRun = 0;
              diff.forEach((d, idx) => {
                if (d.type === "same") { sameRun++; }
                else {
                  if (sameRun > 6) out.push({ type: "ellipsis", count: sameRun - 3 });
                  sameRun = 0;
                  out.push(d);
                }
              });
              return out.map((d, i) => {
                if (d.type === "ellipsis") return (
                  <div key={i} style={{ padding: "2px 16px", color: "#484f58", background: "#0d1117" }}>
                    ⋯ {d.count} unchanged lines
                  </div>
                );
                return (
                  <div key={i} style={{
                    padding: "1px 16px", whiteSpace: "pre",
                    background: d.type === "add" ? "#0d2d0d" : d.type === "remove" ? "#2d0d0d" : "transparent",
                    color: d.type === "add" ? "#3fb950" : d.type === "remove" ? "#f85149" : "#8b949e",
                  }}>
                    {d.type === "add" ? "+" : d.type === "remove" ? "-" : " "} {d.line}
                  </div>
                );
              });
            })()
          )}
        </div>
      )}
    </div>
  );
}

function CodeEditor({ content, lang, onChange, readOnly = false }) {
  const lines = content.split("\n");
  const [cursor, setCursor] = useState({ line: 0, col: 0 });

  return (
    <div style={{ fontFamily: "'SF Mono','Fira Code','Consolas',monospace", fontSize: 13, lineHeight: "1.6", display: "flex", height: "100%", background: "#0d1117", overflow: "auto" }}>
      {/* Line numbers */}
      <div style={{ background: "#161b22", padding: "12px 12px", textAlign: "right", color: "#484f58", userSelect: "none", minWidth: 40, borderRight: "1px solid #21262d", flexShrink: 0 }}>
        {lines.map((_, i) => <div key={i} style={{ color: cursor.line === i ? "#8b949e" : undefined }}>{i + 1}</div>)}
      </div>
      {/* Editor area */}
      <textarea
        value={content}
        onChange={e => onChange(e.target.value)}
        readOnly={readOnly}
        onClick={e => {
          const val = e.target.value.slice(0, e.target.selectionStart);
          const lines = val.split("\n");
          setCursor({ line: lines.length - 1, col: lines[lines.length - 1].length });
        }}
        onKeyUp={e => {
          const val = e.target.value.slice(0, e.target.selectionStart);
          const lines = val.split("\n");
          setCursor({ line: lines.length - 1, col: lines[lines.length - 1].length });
        }}
        spellCheck={false}
        style={{
          flex: 1, background: "transparent", border: "none", color: "#e6edf3",
          fontFamily: "inherit", fontSize: "inherit", lineHeight: "inherit",
          padding: "12px 16px", resize: "none", outline: "none", whiteSpace: "pre",
          overflowX: "auto", minHeight: "100%", boxSizing: "border-box",
        }}
      />
    </div>
  );
}

// ─── Upload Panel ─────────────────────────────────────────────────────────────
function UploadPanel({ owner, repo, branch, gh, onSuccess, showToast }) {
  const [files, setFiles] = useState([]);
  const [prefix, setPrefix] = useState("");
  const [msg, setMsg] = useState("Upload files via GitMobile");
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [dragOver, setDragOver] = useState(false);
  const folderRef = useRef();
  const fileRef = useRef();

  const handleFolder = (e) => {
    const list = [...e.target.files];
    setFiles(list.map(f => ({ file: f, path: f.webkitRelativePath || f.name })));
  };

  const handleDrop = (e) => {
    e.preventDefault(); setDragOver(false);
    const items = [...e.dataTransfer.items];
    const collected = [];
    let pending = 0;
    const done = () => { if (--pending === 0) setFiles(collected); };
    const processEntry = (entry, basePath = "") => {
      if (entry.isFile) {
        pending++;
        entry.file(f => { collected.push({ file: f, path: basePath + f.name }); done(); });
      } else if (entry.isDirectory) {
        const reader = entry.createReader();
        pending++;
        reader.readEntries(entries => {
          entries.forEach(e2 => processEntry(e2, basePath + entry.name + "/"));
          done();
        });
      }
    };
    items.forEach(item => {
      const entry = item.webkitGetAsEntry?.();
      if (entry) processEntry(entry);
    });
    if (items.length === 0 && e.dataTransfer.files.length > 0) {
      const list = [...e.dataTransfer.files];
      setFiles(list.map(f => ({ file: f, path: f.name })));
    }
  };

  // Builds one commit for the entire upload, the same way `git add -A && git commit`
  // does locally: upload all blobs (in parallel batches), build one tree on top of
  // the current branch tree, create one commit, then fast-forward the branch ref.
  // This replaces the old per-file create-or-update loop, which made N×2 API calls
  // and created N separate commits for an N-file upload.
  const upload = async () => {
    if (!files.length) return;
    setUploading(true);
    setProgress({ done: 0, total: files.length, stage: "Reading files…" });
    try {
      // 1. Read & base64-encode every file locally first (fast, no network)
      const entries = await Promise.all(files.map(async ({ file, path }) => {
        const buf = await file.arrayBuffer();
        let binary = "";
        const bytes = new Uint8Array(buf);
        const chunk = 0x8000;
        for (let i = 0; i < bytes.length; i += chunk) {
          binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
        }
        const filePath = (prefix ? prefix.replace(/\/$/, "") + "/" : "") + path;
        return { path: filePath, content: btoa(binary) };
      }));

      // 2. Upload blobs in parallel batches (GitHub handles concurrency fine in
      // batches of ~10; doing all at once on a big folder can hit rate limits)
      setProgress(p => ({ ...p, stage: "Uploading file contents…" }));
      const BATCH = 10;
      const blobs = [];
      for (let i = 0; i < entries.length; i += BATCH) {
        const batch = entries.slice(i, i + BATCH);
        const results = await Promise.all(batch.map(e =>
          gh.createBlob(owner, repo, { content: e.content, encoding: "base64" })
            .then(res => ({ path: e.path, sha: res.sha }))
        ));
        blobs.push(...results);
        setProgress(p => ({ ...p, done: blobs.length, total: entries.length }));
      }

      // 3. Get current branch HEAD + its tree, build one new tree on top of it
      setProgress(p => ({ ...p, stage: "Building commit…" }));
      const ref = await gh.getRef(owner, repo, `heads/${branch}`);
      const headSha = ref.object.sha;

      const tree = await gh.createTree(owner, repo, {
        base_tree: headSha,
        tree: blobs.map(b => ({ path: b.path, mode: "100644", type: "blob", sha: b.sha })),
      });

      // 4. One commit pointing at the new tree, parented on the old HEAD
      const commit = await gh.createCommit(owner, repo, {
        message: msg,
        tree: tree.sha,
        parents: [headSha],
      });

      // 5. Fast-forward the branch to the new commit
      await gh.updateRef(owner, repo, `heads/${branch}`, { sha: commit.sha });

      showToast(`Uploaded ${files.length} file(s) in 1 commit`, "success");
      setFiles([]);
      onSuccess();
    } catch (e) {
      showToast(e.message || "Upload failed", "error");
    }
    setUploading(false);
  };

  return (
    <div style={{ padding: 16 }}>
      <h3 style={{ color: "#e6edf3", fontSize: 15, fontWeight: 600, margin: "0 0 16px" }}>Upload Files</h3>

      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        style={{
          border: `2px dashed ${dragOver ? "#58a6ff" : "#30363d"}`,
          borderRadius: 10, padding: 32, textAlign: "center", marginBottom: 16,
          background: dragOver ? "#1f6feb11" : "transparent", transition: "all 0.15s",
          cursor: "pointer",
        }}
        onClick={() => folderRef.current?.click()}
      >
        <div style={{ fontSize: 36, marginBottom: 8 }}>{ICONS.upload}</div>
        <p style={{ color: "#8b949e", fontSize: 13, margin: "0 0 12px" }}>
          Drag & drop a folder or click to select
        </p>
        <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
          <Btn size="sm" onClick={e => { e.stopPropagation(); folderRef.current?.click(); }}>📁 Folder</Btn>
          <Btn size="sm" onClick={e => { e.stopPropagation(); fileRef.current?.click(); }}>📄 Files</Btn>
        </div>
        <input ref={folderRef} type="file" webkitdirectory="true" multiple style={{ display: "none" }} onChange={handleFolder} />
        <input ref={fileRef} type="file" multiple style={{ display: "none" }} onChange={e => {
          const list = [...e.target.files];
          setFiles(list.map(f => ({ file: f, path: f.name })));
        }} />
      </div>

      {/* File list preview */}
      {files.length > 0 && (
        <div style={{ background: "#161b22", border: "1px solid #30363d", borderRadius: 8, padding: 12, marginBottom: 16, maxHeight: 180, overflowY: "auto" }}>
          <p style={{ color: "#8b949e", fontSize: 12, margin: "0 0 8px" }}>{files.length} file(s) selected</p>
          {files.slice(0, 50).map((f, i) => (
            <div key={i} style={{ color: "#c9d1d9", fontSize: 12, padding: "2px 0" }}>{ICONS.file} {f.path}</div>
          ))}
          {files.length > 50 && <div style={{ color: "#8b949e", fontSize: 12 }}>… and {files.length - 50} more</div>}
        </div>
      )}

      <Input label="Target folder (optional)" placeholder="e.g. src/components" value={prefix} onChange={e => setPrefix(e.target.value)} />
      <Input label="Commit message" value={msg} onChange={e => setMsg(e.target.value)} />

      {uploading && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", color: "#8b949e", fontSize: 12, marginBottom: 4 }}>
            <span>{progress.stage || "Uploading…"}</span><span>{progress.done}/{progress.total}</span>
          </div>
          <div style={{ background: "#21262d", borderRadius: 4, height: 6 }}>
            <div style={{ background: "#238636", height: "100%", borderRadius: 4, width: `${(progress.done / progress.total) * 100}%`, transition: "width 0.2s" }} />
          </div>
        </div>
      )}

      <Btn variant="primary" onClick={upload} disabled={!files.length || uploading} style={{ width: "100%" }}>
        {uploading ? <Spinner size={14} /> : ICONS.upload}
        {uploading ? `${progress.stage || "Uploading"} ${progress.done}/${progress.total}…` : `Upload ${files.length || ""} file(s)`}
      </Btn>
    </div>
  );
}

// ─── Repository View ──────────────────────────────────────────────────────────
function RepoView({ repo, gh, showToast, onBack }) {
  const [tab, setTab] = useState("files");
  const [branch, setBranch] = useState(repo.default_branch);
  const [branches, setBranches] = useState([]);
  const [tree, setTree] = useState([]);
  const [loadingTree, setLoadingTree] = useState(false);
  const [openFile, setOpenFile] = useState(null);
  const [fileContent, setFileContent] = useState("");
  const [fileSha, setFileSha] = useState("");
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [commits, setCommits] = useState([]);
  const [prs, setPRs] = useState([]);
  const [issues, setIssues] = useState([]);
  const [releases, setReleases] = useState([]);
  const [loadingTab, setLoadingTab] = useState(false);
  const [newBranchModal, setNewBranchModal] = useState(false);
  const [newBranchName, setNewBranchName] = useState("");
  const [createFileModal, setCreateFileModal] = useState(false);
  const [newFileName, setNewFileName] = useState("");
  const [newFileContent, setNewFileContent] = useState("");
  const [newFileMsg, setNewFileMsg] = useState("Create file via GitMobile");
  // Staged changes: path -> { type: 'edit'|'delete', content, originalContent, sha }
  // Nothing here touches GitHub until "Commit staged changes" is pressed —
  // this mirrors how MGit's stage/commit flow works, instead of every Save
  // hitting the API immediately.
  const [staged, setStaged] = useState({});
  const [committingStage, setCommittingStage] = useState(false);
  const [commitMsg, setCommitMsg] = useState("");

  const owner = repo.owner.login;
  const repoName = repo.name;

  useEffect(() => {
    gh.getBranches(owner, repoName).then(setBranches).catch(() => {});
    loadTree();
  }, []);

  useEffect(() => { loadTree(); }, [branch]);

  const loadTree = async (retry = 0) => {
    setLoadingTree(true);
    try {
      const ref = await gh.getRef(owner, repoName, `heads/${branch}`);
      const sha = ref.object.sha;
      const t = await gh.getTree(owner, repoName, sha);
      setTree(t.tree || []);
    } catch {
      // Fallback to root contents
      try {
        const root = await gh.getContents(owner, repoName, "", branch);
        setTree(Array.isArray(root) ? root : [root]);
      } catch {
        // GitHub's tree/ref endpoints can lag a moment right after a commit;
        // retry once after a short delay before giving up.
        if (retry < 1) {
          setTimeout(() => loadTree(retry + 1), 800);
          return;
        }
      }
    }
    setLoadingTree(false);
  };

  const loadTabData = async (t) => {
    setLoadingTab(true);
    try {
      if (t === "commits") { const c = await gh.getCommits(owner, repoName, branch); setCommits(c); }
      if (t === "prs") { const p = await gh.getPRs(owner, repoName); setPRs(p); }
      if (t === "issues") { const i = await gh.getIssues(owner, repoName); setIssues(i); }
      if (t === "releases") { const r = await gh.getReleases(owner, repoName); setReleases(r); }
    } catch (e) { showToast(e.message, "error"); }
    setLoadingTab(false);
  };

  const switchTab = (t) => {
    setTab(t); setOpenFile(null);
    if (["commits", "prs", "issues", "releases"].includes(t)) loadTabData(t);
  };

  const openFileHandler = async (item) => {
    setOpenFile(item); setEditing(false);
    try {
      const f = await gh.getFileContent(owner, repoName, item.path, branch);
      const decoded = b64decode(f.content || "");
      setFileSha(f.sha);
      // If this file has staged edits, show the staged version
      const stagedVersion = staged[item.path];
      if (stagedVersion?.type === "edit") {
        setFileContent(stagedVersion.content);
        setEditContent(stagedVersion.content);
      } else {
        setFileContent(decoded);
        setEditContent(decoded);
      }
    } catch (e) { showToast(e.message, "error"); }
  };

  // Stage an edit locally — no network call. Shows up in the Staging tab
  // until the user explicitly commits.
  const stageEdit = () => {
    if (editContent === fileContent && !staged[openFile.path]) {
      setEditing(false);
      return;
    }
    setStaged(s => ({
      ...s,
      [openFile.path]: { type: "edit", content: editContent, originalContent: fileContent, sha: fileSha },
    }));
    setFileContent(editContent); setEditing(false);
    showToast(`Staged changes to ${openFile.path}`, "info");
  };

  const stageDelete = (item) => {
    if (!confirm(`Stage deletion of ${item.path}? It won't be removed from GitHub until you commit.`)) return;
    setStaged(s => ({ ...s, [item.path]: { type: "delete", sha: item.sha } }));
    if (openFile?.path === item.path) setOpenFile(null);
    showToast(`Staged deletion of ${item.path}`, "info");
  };

  const unstage = (path) => {
    setStaged(s => { const n = { ...s }; delete n[path]; return n; });
  };

  // Commits every staged change in one atomic commit, same tree-based
  // approach as the folder upload: build blobs for edits, mark deletes by
  // omitting them from the new tree (GitHub's tree API removes a path when
  // you set sha: null for it), one commit, one ref update.
  const commitStaged = async () => {
    const paths = Object.keys(staged);
    if (paths.length === 0) return;
    setCommittingStage(true);
    try {
      const ref = await gh.getRef(owner, repoName, `heads/${branch}`);
      const headSha = ref.object.sha;

      const treeEntries = [];
      for (const path of paths) {
        const change = staged[path];
        if (change.type === "delete") {
          treeEntries.push({ path, mode: "100644", type: "blob", sha: null });
        } else {
          const blob = await gh.createBlob(owner, repoName, {
            content: b64encode(change.content), encoding: "base64",
          });
          treeEntries.push({ path, mode: "100644", type: "blob", sha: blob.sha });
        }
      }

      const tree = await gh.createTree(owner, repoName, { base_tree: headSha, tree: treeEntries });
      const message = commitMsg.trim() || `Update ${paths.length} file(s) via GitMobile`;
      const commit = await gh.createCommit(owner, repoName, { message, tree: tree.sha, parents: [headSha] });
      await gh.updateRef(owner, repoName, `heads/${branch}`, { sha: commit.sha });

      showToast(`Committed ${paths.length} file(s) in 1 commit`, "success");
      setStaged({}); setCommitMsg("");
      loadTree();
    } catch (e) {
      showToast(e.message || "Commit failed", "error");
    }
    setCommittingStage(false);
  };

  const deleteFile = async (item) => {
    if (!confirm(`Delete ${item.path}?`)) return;
    try {
      await gh.deleteFile(owner, repoName, item.path, {
        message: `Delete ${item.path} via GitMobile`,
        sha: item.sha, branch,
      });
      setOpenFile(null); showToast("File deleted", "success"); loadTree();
    } catch (e) { showToast(e.message, "error"); }
  };

  const createBranch = async () => {
    if (!newBranchName.trim()) return;
    try {
      const ref = await gh.getRef(owner, repoName, `heads/${branch}`);
      await gh.createBranch(owner, repoName, {
        ref: `refs/heads/${newBranchName}`,
        sha: ref.object.sha,
      });
      showToast(`Branch "${newBranchName}" created`, "success");
      setBranch(newBranchName); setNewBranchModal(false); setNewBranchName("");
      gh.getBranches(owner, repoName).then(setBranches);
    } catch (e) { showToast(e.message, "error"); }
  };

  const createFile = async () => {
    if (!newFileName.trim()) return;
    try {
      await gh.createOrUpdateFile(owner, repoName, newFileName, {
        message: newFileMsg, content: b64encode(newFileContent), branch,
      });
      showToast("File created!", "success");
      setCreateFileModal(false); setNewFileName(""); setNewFileContent("");
      loadTree();
    } catch (e) { showToast(e.message, "error"); }
  };

  const stagedCount = Object.keys(staged).length;
  const TABS = [
    ["files", ICONS.code, "Files"],
    ["stage", "◈", `Stage${stagedCount > 0 ? ` (${stagedCount})` : ""}`],
    ["upload", ICONS.upload, "Upload"],
    ["commits", ICONS.commit, "Commits"],
    ["prs", ICONS.pr, "PRs"],
    ["issues", ICONS.issue, "Issues"],
    ["releases", ICONS.tag, "Releases"],
  ];

  const topBar = (
    <div style={{ background: "#161b22", borderBottom: "1px solid #30363d", padding: "10px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <button onClick={onBack} style={{ background: "none", border: "none", color: "#8b949e", cursor: "pointer", fontSize: 16 }}>{ICONS.back}</button>
        <span style={{ color: "#8b949e" }}>{owner}/</span>
        <span style={{ color: "#58a6ff", fontWeight: 600 }}>{repoName}</span>
        <Badge color={repo.private ? "#8b949e" : "#3fb950"}>{repo.private ? "Private" : "Public"}</Badge>
        {repo.stargazers_count > 0 && <Badge color="#d29922">{ICONS.star} {fmtNum(repo.stargazers_count)}</Badge>}
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <a href={repo.html_url} target="_blank" rel="noreferrer" style={{ color: "#8b949e", fontSize: 12 }}>
            <Btn size="sm" variant="ghost">{ICONS.link} GitHub</Btn>
          </a>
        </div>
      </div>

      {/* Branch selector + actions */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <select
          value={branch}
          onChange={e => setBranch(e.target.value)}
          style={{ background: "#21262d", border: "1px solid #30363d", borderRadius: 6, color: "#e6edf3", padding: "5px 10px", fontSize: 13 }}
        >
          {branches.map(b => <option key={b.name} value={b.name}>{ICONS.branch} {b.name}</option>)}
        </select>
        <Btn size="sm" onClick={() => setNewBranchModal(true)}>{ICONS.plus} Branch</Btn>
        <Btn size="sm" onClick={() => setCreateFileModal(true)}>{ICONS.plus} File</Btn>
        <Btn size="sm" onClick={loadTree}>{ICONS.refresh}</Btn>
        {repo.description && <span style={{ color: "#8b949e", fontSize: 12, flex: 1 }}>{repo.description}</span>}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 2, marginTop: 10, overflowX: "auto" }}>
        {TABS.map(([id, icon, label]) => (
          <button
            key={id}
            onClick={() => switchTab(id)}
            style={{
              background: tab === id ? "#0d1117" : "none",
              border: `1px solid ${tab === id ? "#30363d" : "transparent"}`,
              borderBottom: tab === id ? "1px solid #0d1117" : "1px solid transparent",
              borderRadius: "6px 6px 0 0", color: tab === id ? "#e6edf3" : "#8b949e",
              padding: "6px 12px", fontSize: 12, cursor: "pointer", whiteSpace: "nowrap",
            }}
          >{icon} {label}</button>
        ))}
      </div>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {topBar}

      <div style={{ flex: 1, overflow: "hidden", display: "flex" }}>
        {/* Files tab */}
        {tab === "files" && (
          <>
            {/* Tree panel */}
            <div style={{ width: 220, flexShrink: 0, background: "#161b22", borderRight: "1px solid #30363d", overflowY: "auto", padding: "8px 4px" }}>
              {loadingTree ? (
                <div style={{ padding: 16, display: "flex", justifyContent: "center" }}><Spinner /></div>
              ) : (
                <FileTree items={tree} onOpen={openFileHandler} staged={staged} />
              )}
            </div>

            {/* Editor panel */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
              {openFile ? (
                <>
                  {/* File header */}
                  <div style={{ background: "#161b22", borderBottom: "1px solid #30363d", padding: "8px 12px", display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ color: "#8b949e", fontSize: 12, flex: 1 }}>{openFile.path}</span>
                    <Badge color="#8b949e">{getLang(openFile.path)}</Badge>
                    {staged[openFile.path] && (
                      <Badge color="#d29922">
                        {staged[openFile.path].type === "delete" ? "Staged: Delete" : "Staged: Modified"}
                      </Badge>
                    )}
                    {editing ? (
                      <>
                        <Btn size="sm" variant="primary" onClick={stageEdit}>
                          {ICONS.check} Stage
                        </Btn>
                        <Btn size="sm" onClick={() => { setEditing(false); setEditContent(fileContent); }}>Cancel</Btn>
                      </>
                    ) : (
                      <>
                        <Btn size="sm" onClick={() => setEditing(true)}>{ICONS.edit} Edit</Btn>
                        <Btn size="sm" variant="danger" onClick={() => stageDelete(openFile)}>{ICONS.trash} Stage Delete</Btn>
                      </>
                    )}
                  </div>
                  <div style={{ flex: 1, overflow: "hidden" }}>
                    <CodeEditor
                      content={editing ? editContent : fileContent}
                      lang={getLang(openFile.path)}
                      onChange={setEditContent}
                      readOnly={!editing}
                    />
                  </div>
                </>
              ) : (
                <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#484f58", flexDirection: "column", gap: 8 }}>
                  <span style={{ fontSize: 48 }}>{ICONS.code}</span>
                  <span style={{ fontSize: 14 }}>Select a file to view or edit</span>
                </div>
              )}
            </div>
          </>
        )}

        {/* Upload tab */}
        {/* Stage tab */}
        {tab === "stage" && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            {stagedCount === 0 ? (
              <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "#484f58", gap: 10 }}>
                <span style={{ fontSize: 40 }}>◈</span>
                <span style={{ fontSize: 14 }}>No staged changes</span>
                <span style={{ fontSize: 12, color: "#484f58", textAlign: "center", maxWidth: 240 }}>
                  Open any file, edit it, then tap "Stage" instead of saving directly. Changes collect here until you commit them all at once.
                </span>
              </div>
            ) : (
              <>
                {/* Commit message + button */}
                <div style={{ padding: "12px 16px", borderBottom: "1px solid #30363d", background: "#161b22" }}>
                  <div style={{ fontSize: 13, color: "#8b949e", marginBottom: 8 }}>
                    <span style={{ color: "#d29922", fontWeight: 600 }}>{stagedCount} change{stagedCount > 1 ? "s" : ""}</span> staged for commit on <span style={{ color: "#58a6ff" }}>{branch}</span>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input
                      value={commitMsg}
                      onChange={e => setCommitMsg(e.target.value)}
                      placeholder={`Update ${stagedCount} file(s) via GitMobile`}
                      onKeyDown={e => e.key === "Enter" && !committingStage && commitStaged()}
                      style={{
                        flex: 1, background: "#0d1117", border: "1px solid #30363d",
                        borderRadius: 6, color: "#e6edf3", padding: "8px 10px", fontSize: 13, outline: "none",
                      }}
                    />
                    <Btn variant="primary" onClick={commitStaged} disabled={committingStage}>
                      {committingStage ? <Spinner size={13} /> : "◉"} Commit
                    </Btn>
                  </div>
                </div>

                {/* Staged file list with inline diff */}
                <div style={{ flex: 1, overflowY: "auto" }}>
                  {Object.entries(staged).map(([path, change]) => (
                    <StagedFileDiff key={path} path={path} change={change} onUnstage={() => unstage(path)} />
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {tab === "upload" && (
          <div style={{ flex: 1, overflowY: "auto" }}>
            <UploadPanel owner={owner} repo={repoName} branch={branch} gh={gh} onSuccess={() => { loadTree(); setTab("files"); }} showToast={showToast} />
          </div>
        )}

        {/* Commits tab */}
        {tab === "commits" && (
          <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
            {loadingTab ? <div style={{ display: "flex", justifyContent: "center", paddingTop: 40 }}><Spinner /></div> : (
              commits.map(c => (
                <div key={c.sha} style={{ background: "#161b22", border: "1px solid #30363d", borderRadius: 8, padding: 14, marginBottom: 10 }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                    <img src={c.author?.avatar_url || c.committer?.avatar_url} alt="" style={{ width: 28, height: 28, borderRadius: "50%", flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ color: "#e6edf3", fontSize: 13, margin: "0 0 4px", fontWeight: 500 }}>{c.commit.message.split("\n")[0]}</p>
                      <div style={{ display: "flex", gap: 10, color: "#8b949e", fontSize: 11, flexWrap: "wrap" }}>
                        <span>{c.commit.author.name}</span>
                        <span>{relTime(c.commit.author.date)}</span>
                        <code style={{ color: "#58a6ff" }}>{c.sha.slice(0, 7)}</code>
                      </div>
                    </div>
                    <a href={c.html_url} target="_blank" rel="noreferrer">
                      <Btn size="sm" variant="ghost">{ICONS.link}</Btn>
                    </a>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* PRs tab */}
        {tab === "prs" && (
          <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
            {loadingTab ? <div style={{ display: "flex", justifyContent: "center", paddingTop: 40 }}><Spinner /></div> : (
              prs.length === 0 ? <p style={{ color: "#8b949e" }}>No open pull requests</p> :
                prs.map(pr => (
                  <div key={pr.id} style={{ background: "#161b22", border: "1px solid #30363d", borderRadius: 8, padding: 14, marginBottom: 10 }}>
                    <div style={{ display: "flex", gap: 8 }}>
                      <Badge color="#3fb950">{ICONS.pr} Open</Badge>
                      <span style={{ color: "#e6edf3", fontSize: 13, fontWeight: 500 }}>#{pr.number} {pr.title}</span>
                    </div>
                    <div style={{ color: "#8b949e", fontSize: 11, marginTop: 6 }}>by {pr.user.login} · {relTime(pr.created_at)}</div>
                  </div>
                ))
            )}
          </div>
        )}

        {/* Issues tab */}
        {tab === "issues" && (
          <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
            {loadingTab ? <div style={{ display: "flex", justifyContent: "center", paddingTop: 40 }}><Spinner /></div> : (
              issues.length === 0 ? <p style={{ color: "#8b949e" }}>No open issues</p> :
                issues.map(issue => (
                  <div key={issue.id} style={{ background: "#161b22", border: "1px solid #30363d", borderRadius: 8, padding: 14, marginBottom: 10 }}>
                    <div style={{ display: "flex", gap: 8 }}>
                      <Badge color="#3fb950">{ICONS.issue} Open</Badge>
                      <span style={{ color: "#e6edf3", fontSize: 13, fontWeight: 500 }}>#{issue.number} {issue.title}</span>
                    </div>
                    <div style={{ color: "#8b949e", fontSize: 11, marginTop: 6 }}>
                      by {issue.user.login} · {relTime(issue.created_at)}
                      {issue.labels.map(l => <Badge key={l.id} color={`#${l.color}`} style={{ marginLeft: 4 }}>{l.name}</Badge>)}
                    </div>
                  </div>
                ))
            )}
          </div>
        )}

        {/* Releases tab */}
        {tab === "releases" && (
          <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
            {loadingTab ? <div style={{ display: "flex", justifyContent: "center", paddingTop: 40 }}><Spinner /></div> : (
              releases.length === 0 ? <p style={{ color: "#8b949e" }}>No releases yet</p> :
                releases.map(r => (
                  <div key={r.id} style={{ background: "#161b22", border: "1px solid #30363d", borderRadius: 8, padding: 14, marginBottom: 10 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                      <Badge color="#bc8cff">{ICONS.tag} {r.tag_name}</Badge>
                      <span style={{ color: "#e6edf3", fontWeight: 600 }}>{r.name}</span>
                      {r.prerelease && <Badge color="#d29922">Pre-release</Badge>}
                    </div>
                    <p style={{ color: "#8b949e", fontSize: 12, margin: "0 0 6px" }}>{relTime(r.published_at)} by {r.author.login}</p>
                    {r.body && <p style={{ color: "#c9d1d9", fontSize: 12, margin: 0, whiteSpace: "pre-wrap" }}>{r.body.slice(0, 200)}</p>}
                  </div>
                ))
            )}
          </div>
        )}
      </div>

      {/* Modals */}
      {newBranchModal && (
        <Modal title="Create Branch" onClose={() => setNewBranchModal(false)}>
          <p style={{ color: "#8b949e", fontSize: 12, margin: "0 0 12px" }}>Branching from <strong>{branch}</strong></p>
          <Input label="Branch name" value={newBranchName} onChange={e => setNewBranchName(e.target.value)} placeholder="feature/my-feature" autoFocus />
          <Btn variant="primary" onClick={createBranch} style={{ width: "100%" }}>Create Branch</Btn>
        </Modal>
      )}

      {createFileModal && (
        <Modal title="Create File" onClose={() => setCreateFileModal(false)} width={600}>
          <Input label="File path" value={newFileName} onChange={e => setNewFileName(e.target.value)} placeholder="src/hello.js" autoFocus />
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: "block", fontSize: 12, color: "#8b949e", marginBottom: 4 }}>Content</label>
            <textarea
              value={newFileContent} onChange={e => setNewFileContent(e.target.value)}
              style={{ width: "100%", height: 180, background: "#0d1117", border: "1px solid #30363d", borderRadius: 6, color: "#e6edf3", padding: 10, fontSize: 13, fontFamily: "monospace", resize: "vertical", boxSizing: "border-box" }}
            />
          </div>
          <Input label="Commit message" value={newFileMsg} onChange={e => setNewFileMsg(e.target.value)} />
          <Btn variant="primary" onClick={createFile} style={{ width: "100%" }}>Create File</Btn>
        </Modal>
      )}
    </div>
  );
}

// ─── New Repo Modal ───────────────────────────────────────────────────────────
function NewRepoModal({ gh, user, onClose, onCreated, showToast }) {
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [priv, setPriv] = useState(false);
  const [auto, setAuto] = useState(true);
  const [loading, setLoading] = useState(false);

  const create = async () => {
    if (!name.trim()) return;
    setLoading(true);
    try {
      const r = await gh.createRepo({ name: name.trim(), description: desc, private: priv, auto_init: auto });
      showToast(`Repository "${r.name}" created!`, "success");
      onCreated(r);
    } catch (e) { showToast(e.message, "error"); }
    setLoading(false);
  };

  return (
    <Modal title="Create Repository" onClose={onClose}>
      <Input label="Repository name *" value={name} onChange={e => setName(e.target.value)} placeholder="my-awesome-project" autoFocus />
      <Input label="Description (optional)" value={desc} onChange={e => setDesc(e.target.value)} placeholder="What's this repo about?" />
      <div style={{ marginBottom: 12 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", color: "#e6edf3", fontSize: 13 }}>
          <input type="checkbox" checked={priv} onChange={e => setPriv(e.target.checked)} />
          Private repository
        </label>
      </div>
      <div style={{ marginBottom: 16 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", color: "#e6edf3", fontSize: 13 }}>
          <input type="checkbox" checked={auto} onChange={e => setAuto(e.target.checked)} />
          Initialize with README
        </label>
      </div>
      <Btn variant="primary" onClick={create} disabled={!name.trim() || loading} style={{ width: "100%" }}>
        {loading ? <Spinner size={14} /> : null} Create Repository
      </Btn>
    </Modal>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);
  const [repos, setRepos] = useState([]);
  const [orgs, setOrgs] = useState([]);
  const [currentRepo, setCurrentRepo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [newRepoModal, setNewRepoModal] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("repos");

  const gh = useGitHub(token);

  // History integration: pushing a state when a repo is opened means the
  // first back-press closes the repo view instead of leaving the app
  // entirely (this was a single-page app with zero history entries before,
  // so back always exited immediately).
  const openRepo = (repo) => {
    setCurrentRepo(repo);
    window.history.pushState({ view: "repo", repoId: repo.id }, "", `#${repo.full_name}`);
  };
  const closeRepo = () => {
    setCurrentRepo(null);
    if (window.history.state?.view === "repo") window.history.back();
  };
  useEffect(() => {
    const onPop = (e) => {
      // Any back navigation while a repo is open just closes it locally;
      // we don't try to restore the exact repo object from history state
      // since repos array may differ across reloads — closing is enough
      // to keep the user from accidentally leaving the page.
      setCurrentRepo(null);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  // Ensure there's always at least one history entry to "absorb" a back press
  useEffect(() => {
    if (token) window.history.replaceState({ view: "dashboard" }, "", "#dashboard");
  }, [token]);

  const showToast = (msg, type = "info") => {
    const id = Date.now();
    setToasts(t => [...t, { id, msg, type }]);
  };

  const handleAuth = async (tok, userData) => {
    setToken(tok); setUser(userData);
    setLoading(true);
    try {
      // Build headers directly from tok (not from gh/token state, which hasn't
      // re-rendered yet and would still be null here — that was the bug).
      const headers = { Authorization: `Bearer ${tok}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" };
      const [reposRes, orgsRes] = await Promise.all([
        fetchAllRepos(tok),
        fetch("https://api.github.com/user/orgs", { headers }).then(r => r.ok ? r.json() : []),
      ]);
      setRepos(Array.isArray(reposRes) ? reposRes : []);
      setOrgs(Array.isArray(orgsRes) ? orgsRes : []);
    } catch (e) { showToast(e.message, "error"); }
    setLoading(false);
  };

  // Fetches every page of /user/repos (not just the first 30), with
  // affiliation+visibility explicit so private repos aren't silently dropped.
  const fetchAllRepos = async (tok) => {
    const headers = { Authorization: `Bearer ${tok}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" };
    let page = 1, all = [];
    while (true) {
      const res = await fetch(
        `https://api.github.com/user/repos?sort=updated&per_page=100&page=${page}&visibility=all&affiliation=owner,collaborator,organization_member`,
        { headers }
      );
      if (!res.ok) break;
      const batch = await res.json();
      if (!Array.isArray(batch) || batch.length === 0) break;
      all = all.concat(batch);
      if (batch.length < 100) break;
      page++;
    }
    return all;
  };

  const refreshRepos = async () => {
    if (!token) return;
    try {
      const fresh = await fetchAllRepos(token);
      setRepos(fresh);
    } catch (e) { showToast(e.message, "error"); }
  };

  const handleSignOut = () => {
    sessionStorage.removeItem("gh_token");
    setToken(null); setUser(null); setRepos([]); setOrgs([]); setCurrentRepo(null);
  };

  if (!token) return <AuthScreen onAuth={handleAuth} />;

  return (
    <div style={{
      height: "100vh", background: "#0d1117", color: "#e6edf3", display: "flex", flexDirection: "column",
      fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif",
      overflow: "hidden",
    }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fade { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:none; } }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #30363d; border-radius: 3px; }
        select option { background: #161b22; }
      `}</style>

      {/* Top nav */}
      <div style={{ background: "#161b22", borderBottom: "1px solid #30363d", padding: "0 16px", display: "flex", alignItems: "center", height: 46, flexShrink: 0, zIndex: 40 }}>
        <button
          onClick={() => setSidebarOpen(o => !o)}
          style={{ background: "none", border: "none", color: "#8b949e", cursor: "pointer", fontSize: 18, marginRight: 12, display: window.innerWidth >= 768 ? "none" : "block", padding: "4px 6px" }}
        >☰</button>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1 }}>
          <span style={{ color: "#58a6ff", fontWeight: 700, fontSize: 15 }}>⬡ GitMobile</span>
          {currentRepo && (
            <span style={{ color: "#8b949e", fontSize: 13 }}>/ {currentRepo.full_name}</span>
          )}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {loading && <Spinner size={14} />}
          <Btn size="sm" variant="ghost" onClick={handleSignOut}>Sign out</Btn>
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        <Sidebar
          user={user} repos={repos} currentRepo={currentRepo}
          onSelectRepo={r => openRepo(r)} onNewRepo={() => setNewRepoModal(true)}
          onHome={() => closeRepo()} activeTab={activeTab} setActiveTab={setActiveTab}
          sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen}
        />

        <main style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          {currentRepo ? (
            <RepoView
              repo={currentRepo} gh={gh} showToast={showToast}
              onBack={() => closeRepo()}
            />
          ) : (
            <div style={{ flex: 1, overflowY: "auto" }}>
              {loading ? (
                <div style={{ display: "flex", justifyContent: "center", paddingTop: 60 }}><Spinner /></div>
              ) : (
                <Dashboard user={user} repos={repos} orgs={orgs} onSelectRepo={openRepo} onNewRepo={() => setNewRepoModal(true)} />
              )}
            </div>
          )}
        </main>
      </div>

      {/* Status bar */}
      <div style={{ background: "#1f6feb", borderTop: "1px solid #388bfd", padding: "3px 16px", display: "flex", alignItems: "center", gap: 12, fontSize: 11, color: "#cae8ff", flexShrink: 0 }}>
        <span>{ICONS.check} Ready</span>
        {currentRepo && <span>{ICONS.branch} {currentRepo.default_branch}</span>}
        <span style={{ marginLeft: "auto" }}>{user?.login}</span>
      </div>

      {/* Modals */}
      {newRepoModal && (
        <NewRepoModal gh={gh} user={user} showToast={showToast} onClose={() => setNewRepoModal(false)}
          onCreated={r => { setRepos(p => [r, ...p]); openRepo(r); setNewRepoModal(false); refreshRepos(); }}
        />
      )}

      {/* Toasts */}
      {toasts.slice(-1).map(t => (
        <Toast key={t.id} msg={t.msg} type={t.type} onClose={() => setToasts(p => p.filter(x => x.id !== t.id))} />
      ))}
    </div>
  );
}
