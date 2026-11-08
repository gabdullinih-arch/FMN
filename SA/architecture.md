# Architecture

## Context and execution flow

```mermaid
flowchart LR
    U[User] --> UI[React UI<br/>src/]
    UI -->|invoke command DTO| TAURI[Tauri adapter<br/>app/src/main.rs]
    TAURI -->|typed operation| STORE[planner-storage<br/>src-tauri/src/lib.rs]
    STORE -->|SQL + transaction| DB[(SQLite<br/>user app-data)]
    STORE --> MIG[SQL migrations<br/>src-tauri/migrations/]
    UI -->|dialog / file APIs| PLUGINS[Tauri dialog + filesystem plugins]
    PLUGINS --> FILES[JSON / ICS / Markdown files]
```

React is responsible for the screen, input, local reactive state, and invocation of Tauri commands. The Tauri adapter validates and transforms the transport DTO. The Rust storage library contains SQLite operations and transactions. File dialogs and file access are provided by the official Tauri plugins.

## SQLite ER diagram

```mermaid
erDiagram
    CATEGORIES ||--o{ SUBCATEGORIES : contains
    CATEGORIES o|--o{ INTERVALS : labels
    SUBCATEGORIES o|--o{ INTERVALS : refines
    CATEGORIES o|--o{ ALL_DAY_EVENTS : labels

    CATEGORIES {
        TEXT id PK
        TEXT name UK
        TEXT color
        INTEGER sort_order
    }
    SUBCATEGORIES {
        TEXT id PK
        TEXT category_id FK
        TEXT name
        TEXT description
        INTEGER sort_order
    }
    INTERVALS {
        INTEGER id PK
        TEXT date
        INTEGER start_min
        INTEGER end_min
        TEXT text
        TEXT task
        TEXT description
        TEXT color
        TEXT cat_id FK
        TEXT sub_id FK
        INTEGER done
        INTEGER moved
    }
    ALL_DAY_EVENTS {
        TEXT id PK
        TEXT text
        TEXT cat_id FK
        TEXT color
        TEXT start_date
        TEXT end_date
        INTEGER created_at
    }
    TEMPLATES {
        TEXT id PK
        TEXT name
        TEXT type
        TEXT data
        INTEGER created_at
    }
    RECURRING_RULES {
        TEXT id PK
        TEXT name
        INTEGER day_idx
        INTEGER start_min
        INTEGER duration_min
        TEXT cat_id FK
        TEXT sub_id FK
        TEXT color
        TEXT task
        TEXT pattern_type
        TEXT custom_ranges
        TEXT anchor_date
        INTEGER weeks_count
        TEXT conflict_mode
        INTEGER created_at
    }
    TODOS {
        TEXT id PK
        TEXT text
        INTEGER done
        INTEGER created_at
        INTEGER sort_order
    }
    PLANSCRIPTS {
        TEXT id PK
        TEXT name
        TEXT code
        INTEGER version
        INTEGER created_at
        INTEGER updated_at
        INTEGER last_run_at
    }
    PLANSCRIPT_WATCHERS {
        TEXT id PK
        TEXT name
        TEXT scope
        TEXT code
        INTEGER enabled
        INTEGER version
        INTEGER created_at
        INTEGER updated_at
    }
    WATCH_INDICATORS {
        TEXT watcher_id PK, FK
        TEXT scope PK
        TEXT owner_key PK
        TEXT text
        TEXT color
    }
    WATCH_DEPENDENCIES {
        TEXT watcher_id PK, FK
        TEXT scope PK
        TEXT owner_key PK
        TEXT dependency_date PK
    }
    REFLECTIONS {
        TEXT date PK
        TEXT text
        INTEGER updated_at
    }
    WEEK_META {
        TEXT monday_date PK
        TEXT order_label
    }
    WEEK_QUANTUM {
        TEXT monday_date PK
        INTEGER cell_min
    }
    CREATED_YEARS {
        INTEGER year PK
    }
    SETTINGS {
        INTEGER id PK
        INTEGER day_start
        INTEGER day_end
        INTEGER cell_min
        REAL zoom
        TEXT theme
        INTEGER notifications_enabled
        INTEGER notify_lead_min
        TEXT last_all_day_notify_date
    }
    CATEGORIES ||--o{ RECURRING_RULES : defaults
    SUBCATEGORIES o|--o{ RECURRING_RULES : refines
    PLANSCRIPT_WATCHERS ||--o{ WATCH_INDICATORS : produces
    PLANSCRIPT_WATCHERS ||--o{ WATCH_DEPENDENCIES : tracks
```

Templates and recurring rules are intentionally not foreign keys to created intervals. Applying a template or rule creates independent `intervals` rows; therefore deleting the template or rule does not remove calendar data. FTS5 `intervals_fts` and its supporting triggers are used for interval search. PlanScript, watchers, and their indicators were added via subsequent migrations; the full DDL is the source of truth in `src-tauri/migrations/`. `settings` is a single row with `id = 1`, while `created_years`, `week_quantum`, and `week_day_bounds` are not connected to calendar intervals; they are navigation data and week display settings.

## UML: functional model

```mermaid
flowchart TB
    actor([User])
    subgraph FMN[FMN desktop application]
      UC1((Plan time))
      UC2((Create template))
      UC3((Apply template))
      UC4((Create recurrence))
      UC5((Resolve conflict))
      UC6((Re-apply rule))
      UC7((Delete rule))
      UC8((Import / export data))
      UC9((Switch language))
    end
    actor --> UC1
    actor --> UC2
    actor --> UC3
    actor --> UC4
    actor --> UC6
    actor --> UC7
    actor --> UC8
    actor --> UC9
    UC4 -. on overlap .-> UC5
    UC6 -. on overlap .-> UC5
    UC3 -. "ask" mode .-> UC5
```

## UML: class/module diagram

```mermaid
classDiagram
    class PlannerContent {
      +weeksData
      +templates
      +recurringRules
      +createRecurringRule(rule)
      +materializeRule(rule)
    }
    class TemplatesPanel {
      +markedWeeks
      +markedDays
      +applyMode
    }
    class RecurringPanel {
      +validateRule()
      +previewOccurrences()
      +submit()
    }
    class StorageClient {
      +addRecurringRule(rule)
      +applyRecurringRule(rule)
      +applyWeekTemplate(template, targets, mode)
    }
    class TauriCommands {
      +cmd_add_recurring_rule()
      +cmd_apply_recurring_rule()
      +cmd_apply_week_template()
    }
    class PlannerStorage {
      +add_recurring_rule()
      +apply_recurring_rule()
      +apply_week_template_with_options()
    }
    class SQLite {
      +intervals
      +templates
      +recurring_rules
    }
    PlannerContent --> TemplatesPanel : renders
    TemplatesPanel *-- RecurringPanel
    PlannerContent --> StorageClient : invokes
    StorageClient --> TauriCommands : Tauri invoke
    TauriCommands --> PlannerStorage : typed DTO mapping
    PlannerStorage --> SQLite : SQL transaction
```

## UML: recurring creation sequence

```mermaid
sequenceDiagram
    actor User as User
    participant UI as RecurringPanel
    participant P as PlannerContent
    participant T as Tauri command
    participant S as planner-storage
    participant DB as SQLite
    User->>UI: Fills the rule
    UI->>UI: Validates range, time, and pattern
    UI->>User: Shows recurring count and requests confirmation
    alt User cancelled
        User-->>UI: Cancel
        UI-->>User: No data changed
    else Confirmed
        UI->>P: onCreate(rule)
        P->>T: cmd_add_recurring_rule
        T->>S: add_recurring_rule
        S->>DB: INSERT recurring_rules
        DB-->>S: commit
        S-->>P: success
        P->>T: cmd_apply_recurring_rule
        T->>S: apply_recurring_rule(spec)
        S->>DB: BEGIN; write matching intervals
        S->>DB: COMMIT
        DB-->>P: processed recurring count
        P->>T: reload affected weeks
        P-->>UI: show result / update error
    end
```

## Repository structure and build

```text
src/                         React UI + client model
  components/                separate panels and widgets
  script/                    PlanScript lexer/parser/interpreter
src-tauri/                   Rust storage crate
  migrations/                SQL schema migrations
  tests/                     SQLite integration tests
app/                         Tauri executable crate + frontend host
  src/main.rs                commands, plugins, DB initialization
  capabilities/              Tauri permissions
  frontend/index.html        React mount point
tests-frontend/              Node tests and jsdom integration harness
docs/                        architecture diagrams
```

1. `npm ci` restores frontend/tooling dependencies.
2. `npm run build` runs esbuild and writes `app/frontend/bundle.js`.
3. `app/tauri.conf.json` sets `app/frontend` as `frontendDist`; the pre-build hook builds the bundle from the root npm project.
4. Cargo builds both `app/` and the local `src-tauri/` library. Rust wires in bundled SQLite, applies migrations, and produces MSI/NSIS installers.

See the root [README](../README.md) for development commands and [requirements](./requirements.md) for user scenarios and acceptance criteria.
