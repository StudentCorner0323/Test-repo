# GitMobile

A mobile-first GitHub web client — browse, edit, and upload to your repos from any browser. No app install required.

## Run it locally

```bash
npm install
npm run dev
```

Then open the URL it prints (usually `http://localhost:5173`).

## Deploy it (free options)

This is a static site (no backend needed for PAT-based auth), so you can deploy it anywhere:

- **Vercel**: `npm i -g vercel` then `vercel` in this folder
- **Netlify**: drag the `dist/` folder (after `npm run build`) into netlify.com/drop
- **GitHub Pages**: `npm run build`, then push `dist/` to a `gh-pages` branch

## How to use it

1. Go to GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic) → Generate new token
2. Check scopes: `repo`, `read:org`, `read:user`, `workflow`, `delete_repo` (pick what you need)
3. Paste the token into GitMobile's login screen
4. Your token is stored in `sessionStorage` only — it's wiped when you close the tab, and never touches any server (this app has no backend)

## What's built (Phase 1 + 2)

- PAT auth
- Dashboard with profile/stats/repos/orgs
- Repo sidebar with search
- File explorer with recursive tree
- File view/edit/delete (lightweight code editor — not full Monaco yet)
- Branch switching + creation
- Recursive folder upload via drag-and-drop or `webkitdirectory` picker, with progress bar
- Commits, Pull Requests, Issues, Releases tabs
- New repo / new file creation

## Known limitation

The code editor is a custom lightweight component, not the real Monaco Editor — Monaco needs a worker/CDN setup that's easiest to add once this is running in your own build (not inside a sandboxed preview). To add it:

```bash
npm install @monaco-editor/react
```

Then swap the `CodeEditor` component in `App.jsx` for `<Editor language={lang} value={content} onChange={onChange} theme="vs-dark" />`.

## Roadmap (not yet built)

- Diff viewer before commit
- ZIP download/upload with extraction
- Resumable uploads, conflict resolution (overwrite/skip)
- Repo settings (rename, visibility, delete), forks, contributors
- GitHub OAuth (requires a small Express backend to protect the client secret)
- Actions workflow browsing, repo secrets (gated by detected token scopes)
