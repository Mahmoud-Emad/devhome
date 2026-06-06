# Contributing

Thanks for your interest in devhome — a fully local Chrome MV3 new-tab extension
built with vanilla JS + Vite. Contributions are welcome.

## Setup

```bash
# fork, then:
git clone https://github.com/<your-username>/devhome
cd devhome
make install
make dev        # http://localhost:5173 (storage falls back to localStorage in dev)
```

Load the built extension: `make build` → `chrome://extensions` → enable
**Developer mode** → **Load unpacked** → select `frontend/dist`.

## Workflow

`main` is protected: changes land through pull requests and CI must pass. Direct
pushes from contributors are blocked.

1. Fork the repo and create a branch off `main`.
2. Keep changes focused and match the surrounding code style.
3. Run the checks locally before pushing:
   ```bash
   make lint                              # ESLint
   cd frontend && npm run format:check    # Prettier — run `npm run format` to fix
   make build                             # must succeed
   ```
4. Open a PR against `main` with a clear title — it becomes part of the
   auto-generated release changelog.

CI (lint, format check, build) and CodeQL run on every PR. Pull requests from
forks never receive repository secrets, so they're safe to run.

## Where things live

- **Architecture & data layer:** [docs/architecture.md](docs/architecture.md)
- **Adding an app:** the "Adding an app" section in the [README](README.md) — it's
  one auto-discovered folder, no registry to edit.
- **Releases (maintainers):** [docs/releasing.md](docs/releasing.md)
