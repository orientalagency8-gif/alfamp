# Alfa MP Launcher

Tauri 2 + React 18 launcher for Alfa MP. Style-matched to RAGE MP launcher.

## Stack

- **Frontend:** Vite + React 18 + TypeScript (no Tailwind — handcrafted CSS for size)
- **Shell:** Tauri 2.x (Rust + WebView2) — final installer ~10 MB
- **Bundles:** MSI + NSIS, per-machine install, RU/EN language selector
- **Auto-update:** Tauri updater plugin (disabled until we have a signed release; endpoint will live at `api.alfamp.gg/launcher/update/...`)

## Development

```bash
npm install
npm run tauri dev      # opens window with hot reload
```

## Build installers

Locally (needs Rust + VS C++ build tools + WebView2 runtime):

```bash
npm install
npm run tauri build    # produces .msi and .exe under src-tauri/target/release/bundle/
```

In CI: pushed to `main`, GitHub Actions on `windows-latest` produces both bundles
and attaches them to a Release.

## Layout

```
launcher/
├── src/                       # React app (UI you see)
│   ├── App.tsx
│   ├── main.tsx
│   └── styles.css
├── src-tauri/                 # Rust shell + bundle config
│   ├── Cargo.toml
│   ├── tauri.conf.json        # bundle/window/security config (MSI+NSIS)
│   ├── capabilities/
│   │   └── default.json
│   └── src/
│       ├── main.rs
│       └── lib.rs
├── public/                    # static assets shipped to webview
├── index.html
├── vite.config.ts
├── tsconfig.json
└── package.json
```
