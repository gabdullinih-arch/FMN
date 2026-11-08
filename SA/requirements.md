# Requirements and use cases

## 1. Purpose and scope

**Product:** "Forget-me-not" (FMN), a local desktop time planner. It helps organize tasks into time intervals, reuse standard plans, and analyze workload.

**MVP goal:** provide reliable offline week/day planning, safe bulk application of templates and recurring rules, and preserve user data in the presence of failures.

**Outside the current scope:** synchronization between devices/users, server-side account management, collaborative editing, background notifications while the app is closed, and calendar rules without an end date.

**Roles:** one user of the desktop application. The actor in all scenarios is the user; Tauri/SQLite are treated as internal systems.

## 2. System and operational requirements

| ID | Requirement |
|---|---|
| SYS-01 | Target MVP build: Windows x64, Tauri 2, system WebView2 Runtime. Support for other OSes is not claimed as validated. |
| SYS-02 | For development you need Node.js 20.19+ (or 22.13+ / 24+), Rust stable, and MSVC Build Tools for native Windows builds. |
| SYS-03 | Frontend is React; the bundler is esbuild; the frontend and Tauri communicate via `@tauri-apps/api/core.invoke`. |
| SYS-04 | Business logic and the SQLite schema are located in the Rust library `planner-storage`; the application adapter is in `app/src/main.rs`. |
| SYS-05 | Core planning scenarios work without a network service. User data is stored in SQLite in the Tauri app-data directory. |
| SYS-06 | Schema changes are applied through sequential SQL migrations. A migration/initialization failure must prevent successful startup rather than creating an empty database as a fallback. |
| SYS-07 | Bulk writes for templates/recurring rules are transactional: a failed operation must not leave a partially updated range. |
| SYS-08 | Interval time is stored in minutes from midnight; user input for recurring events is limited to 5-minute steps and must end no later than midnight. |
| SYS-09 | The recurrence range is finite, from 1 to 520 weeks. This protects the UI from unlimited event generation and defines a predictable operation volume. |
| SYS-10 | Read/write/apply errors must be shown to the user; canceling a dialog or a specific conflict must not be reported as success. |
| SYS-11 | Russian is the default language; English is selected by the user and stored locally. Switching updates visible text, titles, placeholders, and available labels. |
| SYS-12 | JSON backups can be imported/exported; calendar events can be transferred via ICS. Detailed format constraints are reflected in the UI and help text. |

## 3. Functional requirements and acceptance criteria

### Planning

- **FR-01:** the user views the calendar by week, edits intervals, assigns categories/subcategories, and marks completion.
- **FR-02:** edits are reflected immediately in the UI and then saved to SQLite; save errors are reported explicitly.
- **FR-03:** undo restores the saved snapshot of the operation within the available history; bulk changes must not leave partial state.
- **FR-04:** search, agenda, statistics, and period tracking use the interval model consistent with the database.

### Templates

- **FR-TPL-01:** create a named day or week template from a selected source.
- **FR-TPL-02:** apply a daily template to selected dates; apply a weekly template to selected weeks or a range up to 520 weeks.
- **FR-TPL-03:** support modes: "replace all", "only fill empty cells", "overlay", "ask on conflicts", and auto mode.
- **FR-TPL-04:** allow week filters and date exclusions; the range is validated before writing.
- **FR-TPL-05:** before writing, show the number of targets, intersections, exclusions, and mode; canceling confirmation does not change data.
- **FR-TPL-06:** one application operation across multiple weeks is atomic and can be undone with a single Undo.

### Recurring events

- **FR-REC-01:** create a rule with a name, weekday, time, duration, category/color, comment, start week, and end horizon.
- **FR-REC-02:** support every week, odd/even weeks, and an explicit list/range of week numbers. Numbering begins from the selected first week.
- **FR-REC-03:** before saving the rule, show the number of repeats, day/time, calendar boundaries, and conflict resolution mode; the user can cancel.
- **FR-REC-04:** for overlaps, support preserving the existing interval, replacing only the matching time range, and interactive resolution for each conflicting recurrence. Non-conflicting recurrences are still applied.
- **FR-REC-05:** the rule and created events are saved in a consistent subset of the database and remain traceable for later review.
- **FR-REC-06:** the generated events are independent from the rule after materialization; editing or deleting the original rule does not mutate previously created occurrences unless an explicit reapply action is triggered.

### Import/export and data integrity

- **FR-DATA-01:** import ICS calendars and map recurring events into the existing interval model as far as the supported subset allows.
- **FR-DATA-02:** export the current calendar to ICS without losing category, time, or date information that is representable in the format.
- **FR-DATA-03:** JSON backup and restore must be reversible, version-aware, and reject malformed payloads without partially writing database state.
- **FR-DATA-04:** importing or restoring data must keep the app in a valid state even when some entries are skipped or rejected.

### UI/UX and accessibility

- **FR-UX-01:** the layout remains readable on standard desktop resolutions and supports keyboard navigation for primary actions.
- **FR-UX-02:** all destructive or significant actions are confirmed explicitly; no operation silently commits a large-scale change.
- **FR-UX-03:** user-visible labels, hints, and errors are displayed in the selected language and remain consistent with the underlying model.

## 4. Use-case descriptions

### UC-PLAN-01 — Plan time in the weekly grid

1. The user selects a date and a time interval.
2. They fill in the title, category, subcategory, and optional notes.
3. The UI updates immediately and shows the interval in context.
4. The user saves the change; the writing path persists the interval in SQLite.
5. The user can change the title, move the interval, or clear it.

**Failure:** invalid time, category mismatch, or storage error must show a clear message and not produce a false success.

### UC-TPL-01 — Create a template from a selected day/week

1. The user marks a day or week as a template source.
2. They give the template a name and choose the template type.
3. The system captures a snapshot and stores it in the templates table.
4. If a template with the same name exists, the user is asked to replace, rename, or cancel.

**Failure:** if the template cannot be serialized or saved, no partial state is stored.

### UC-TPL-02 — Apply a template with mode and filters

1. The user chooses a target week range and a template.
2. They select a mode: replace / fill empty / overlay / ask-on-conflict.
3. The system validates the range and shows the number of affected cells and conflicts.
4. The user confirms or cancels.
5. On apply, the app writes a single atomic transaction.

**Failure:** invalid date range, failed SQL transaction, or canceled confirmation must leave the calendar untouched.

### UC-REC-01 — Create a recurring rule

1. The user specifies the weekday, time, duration, category, and optional title.
2. They choose the week pattern and date horizon.
3. The app previews the total number of occurrences and shows conflict information.
4. The user confirms creation.
5. The app stores the rule and materializes the matching intervals.

**Failure:** if the rule cannot be validated or saved, the app must not create partial recurring entries.

### UC-REC-02 — Resolve conflicts during recurrence application

1. The user creates a rule that intersects existing intervals.
2. The app shows a conflict panel with the affected dates and options.
3. The user chooses one of the supported modes: keep existing, replace match, skip, or resolve individually.
4. Non-conflicting occurrences continue to be generated.
5. The final operation remains a single transaction.

**Failure:** if the operation fails after partial writes, the system rolls back and reports the failure clearly.

### UC-DATA-01 — Import ICS

1. The user selects an `.ics` file.
2. The app parses events and skips records without recognizable times.
3. Before modifying each week, it captures an Undo snapshot.
4. Events that fall within the working window are displayed locally and saved using the unified `set_interval` path.
5. The app waits for all pending records to finish and shows the number of imported and skipped events.

**Failure:** parsing or write errors are visible to the user; an incomplete action must not report a full successful import.

## 5. Rules and definitions

- Time is a half-open interval `[start, end)`: adjacent events may touch without conflict.
- In SQLite, one interval corresponds to a continuous range of identical properties; empty time is not stored.
- In a recurring rule, the first selected week is number 1; a custom range is defined relative to it.
- "Overlay" replaces only the overlapping time range. Content outside the template range is preserved.
- "Replace all" for a template clears the target day window before applying.
- A recurring rule is limited to 520 weeks and remains an independent record after creating one-off interval events.

## 6. Limitations and future development plan

### Known limitations

- No synchronization, collaborative editing, or remote backup storage.
- A repeat is a finite materialization, not a dynamic calendar rule; editing the original rule does not modify already written occurrences.
- Deleting a rule does not remove its applied intervals, and deleting a template does not roll back previous applications.
- The interactive mode asks about each occupied recurrence individually; over a long horizon this may be inconvenient.
- Notifications work only while the app is running.
- ICS export/import is limited to the current event model; complex recurring events from external calendars are not imported as live rules.

### Development plan

1. Add editing of rules, safe deletion/archival, and review of scheduled recurrences before finalizing.
2. Replace a series of system confirm dialogs with a single conflict screen with grouped resolution and final dry-run.
3. Support specific dates/holiday exclusions for recurrences and log the source of each created interval.
4. Extend automated UI tests for localization and negative scenarios (Tauri command failure, cancellation, reapplication, conflict, restart).
5. Validate and document build/installation for each additional OS before claiming support for it.

## 7. Requirement-to-verification traceability

| Area | Checks |
|---|---|
| Week selection and range boundaries | `tests-frontend/recurring-scenarios.test.mjs`, `tests-frontend/template-range.test.mjs` |
| Recurrence application and conflict handling | `src-tauri/tests/bulk_operations.rs` |
| CRUD for rules and templates | `src-tauri/tests/new_operations.rs` |
| Atomicity of templates/recurrences | `src-tauri/tests/bulk_operations.rs` |
| Interval model | `tests-frontend/intervals.test.mjs`, `src-tauri/tests/storage_semantics.rs` |
| Real React UI with mock Tauri | `tests-frontend/mock-backend-smoke-test.mjs`, `tests-frontend/move-scenario-test.mjs` |

The command list is in the root [README](../README.md#quick-start-windows).
1. The user creates a rule that intersects existing intervals.
2. The app shows a conflict panel with the affected dates and options.
3. The user chooses one of the supported modes: keep existing, replace matching time, skip, or resolve individually.
4. Non-conflicting occurrences continue to be generated.
5. The final operation remains a single transaction.

**Failure:** if the operation fails after partial writes, the system rolls back and reports the failure clearly.

### UC-REC-03 — Reapply an existing rule

1. The user selects a previously saved rule and invokes the reapply action.
2. Before execution, the user sees the number of occurrences and the calendar bounds.
3. The user confirms; in interactive mode they resolve conflicts as needed.
4. Rust performs a transactional write; the UI reloads already-loaded weeks.

**Alternative:** canceling the overall confirmation leaves the data unchanged.
**Failure:** a transaction error is shown to the user; reload failure is distinguished from write failure because the commit may already have completed.

### UC-REC-04 — Delete a rule

1. The user clicks delete on a rule.
2. The app removes the configuration from SQLite.
3. On success it removes the rule from the list.
4. Previously applied intervals remain; the user can edit or clear them through normal calendar actions.

**Failure:** if the database fails, the rule stays visible and an error is shown. Deleting multiple rules in one click is not supported.

### UC-TPL-03 — Save and apply a weekly template

1. The user opens the templates panel and marks a source week.
2. They choose create template, confirm the source, and give a non-empty name.
3. They mark target weeks or supply a range, filter, and date exclusions.
4. They select a conflict mode; the app completes validation and loads unsaved changes in the target weeks.
5. Before writing, it shows the number of records, intersections, excluded dates, mode, and option to cancel with a single Undo.
6. After confirmation, one backend call applies the batch atomically; the UI reloads affected weeks.

**Alternatives:** apply a daily template to marked days; cancel the dialog; skip date exclusions; choose "only fill empty" or interactive resolution.
**Failures:** empty ranges, invalid date ranges, failed target week load, or SQL errors must not leave partial writes.

### UC-DATA-01 — Import ICS

1. The user selects an `.ics` file.
2. The app parses events and skips records without recognizable times.
3. Before modifying each week, it captures an Undo snapshot.
4. Events that fall within the working window are displayed locally and saved via the unified `set_interval` flow.
5. The app waits for all pending entries and shows the imported/skipped count.

**Failure:** parsing or write errors are visible to the user; an incomplete action must not report a fully successful import.

## 5. Rules and definitions

- Time is a half-open interval `[start, end)`: adjacent events may touch without conflict.
- In SQLite, one interval corresponds to a continuous range of identical properties; empty time is not stored.
- In a recurring rule, the first selected week is number 1; a custom range is defined relative to it.
- "Overlay" replaces only the overlapping time range. Content outside the template range is preserved.
- "Replace all" for a template clears the target day window before applying.
- A recurring rule is limited to 520 weeks and remains an independent record after creating one-off interval events.

## 6. Limitations and future development plan

### Known limitations

- No synchronization, collaborative editing, or remote backup storage.
- A repeat is a finite materialization, not a dynamic calendar rule; editing the original rule does not modify already written occurrences.
- Deleting a rule does not remove its applied intervals, and deleting a template does not roll back previous applications.
- The interactive mode asks about each occupied recurrence individually; over a long horizon this may be inconvenient.
- Notifications work only while the app is running.
- ICS export/import is limited to the current event model; complex recurring events from external calendars are not imported as live rules.

### Development plan

1. Add editing of rules, safe deletion/archival, and review of scheduled recurrences before finalizing.
2. Replace a series of system confirm dialogs with a single conflict screen with grouped resolution and final dry-run.
3. Support specific dates/holiday exclusions for recurrences and log the source of each created interval.
4. Extend automated UI tests for localization and negative scenarios (Tauri command failure, cancellation, reapplication, conflict, restart).
5. Validate and document build/installation for each additional OS before claiming support for it.

## 7. Requirement-to-verification traceability

| Area | Checks |
|---|---|
| Week selection and range boundaries | `tests-frontend/recurring-scenarios.test.mjs`, `tests-frontend/template-range.test.mjs` |
| Recurrence application and conflict handling | `src-tauri/tests/bulk_operations.rs` |
| CRUD for rules and templates | `src-tauri/tests/new_operations.rs` |
| Atomicity of templates/recurrences | `src-tauri/tests/bulk_operations.rs` |
| Interval model | `tests-frontend/intervals.test.mjs`, `src-tauri/tests/storage_semantics.rs` |
| Real React UI with mock Tauri | `tests-frontend/mock-backend-smoke-test.mjs`, `tests-frontend/move-scenario-test.mjs` |

The command list is in the root [README](../README.md#quick-start-windows).
