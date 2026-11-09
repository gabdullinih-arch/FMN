# Forget-me-not (FMN)

A desktop time planner with a weekly grid, categories, templates, and recurring events. The application runs locally: the React interface is launched via Tauri, while data and operations are stored in SQLite. The interface supports both Russian and English.

> Portfolio project for systems analysis and software development. The complete systems-analysis package—context, requirements, use cases, data model, architecture, quality attributes, integrations, traceability, risks, and PlanScript—is maintained in [SA/](./SA/README.md).

## Documentation

- [Documentation index](./docs/index.md)
- [User guide](./docs/user-guide.md)
- [Developer guide](./docs/developer-guide.md)
- [Systems analysis package](./SA/README.md)

## Features

- Weekly and daily time planning; events are represented as time intervals rather than individual 5-minute records.
- Categories and subcategories, completion markers, descriptions, and time tracking.
- Day/week templates with application modes, date-range selection, filters, and date exclusions.
- Recurring events with a limited horizon, week selection, and behavior when intersecting occupied intervals.
- Local SQLite database, schema migrations, JSON backup, and calendar import/export in ICS format.

A template is a one-time copy of data to selected dates. A recurring rule is also materialized in the calendar when created or reapplied; it is not a live link to future weeks. Deleting the rule does not remove already created events.

You can assign a custom grid step and separate day start/end hours for an individual week in the settings row above its calendar; the "Shared hours" button restores the global day boundaries.

## Quick start (Windows)

For development you need Node.js 20.19+ (or 22.13+ / 24+; validated on Node.js 22), Rust stable, WebView2 Runtime, and MSVC build tools for native dependencies. To create an MSI/NSIS installer, install Tauri CLI 2 and the relevant Windows Build Tools. SQLite is provided through the bundled Rust library.

```powershell
npm ci
npm test
cargo test --manifest-path .\src-tauri\Cargo.toml
cargo check --manifest-path .\app\Cargo.toml
```

To run the application from PowerShell:

```powershell
Set-Location .\app
cargo tauri dev
```

In development mode, Tauri automatically builds the frontend before startup. If the window was already opened with a blank screen, stop it (`Ctrl+C`) and rerun `cargo tauri dev`.

Build the installer:

```powershell
Set-Location .\app
cargo tauri build
```

Before building, Tauri itself runs the frontend build; the result is created in `app/frontend/bundle.js` and is not kept in Git. Release files are located in `app/target/release/`, and installers are in `app/target/release/bundle/`.

## Project structure

| Path | Purpose |
|---|---|
| `src/` | React UI, screens, application state, localization, and client-side models |
| `src/components/` | Calendar panels, templates, recurring rules, tasks, settings, and statistics |
| `src/script/` | PlanScript lexer, parser, and interpreter |
| `src-tauri/src/` | SQLite storage library, business operations, and backup logic |
| `src-tauri/migrations/` | Sequential schema migrations |
| `src-tauri/tests/` | Integration tests for storage and transactional semantics |
| `app/src/main.rs` | Tauri commands exposed to the frontend via `invoke` |
| `app/` | Tauri configuration, plugins, permissions, and Windows packaging |
| `tests-frontend/` | Client-side unit and smoke tests with a mock Tauri backend |
| `SA/` | Systems-analysis artifacts: requirements, use cases, domain model, architecture, quality, integrations, traceability, and risks |
| `docs/` | User and developer guides |

`src-tauri/` is the storage library, while `app/` is the executable Tauri wrapper. The frontend is built by esbuild from the root `package.json`. The Rust command in `app/src/main.rs` transforms Tauri DTOs into `planner-storage` operations. Migrations are applied when initializing the user database in the app-data directory; their source sequence is in `src-tauri/migrations/`.

## Validation and readiness

`npm test` builds the UI and runs client-side unit/smoke scenarios. `cargo test` validates SQLite operations, migrations, templates, recurring rules, and atomicity. Installer builds also depend on WebView2 and the Windows toolchain.

The list of constraints, assumptions, error-handling requirements, and planned improvements is in [SA/requirements.md](./SA/requirements.md#6-limitations-and-future-development-plan).
