import { useState } from "react";
import { Play, Plus, Save, Trash2, Check, X } from "lucide-react";
import { t } from "../i18n.js";

const STARTER = `for week in weeks(today(), count=4):
    if week.index % 2 == 0:
        week.mon.time(12:00..13:00).category('Работа').text('Фокус')`;
const TERMINAL_STARTER = `len(find(days(today(), count=7), done=true))`;
const WATCHER_STARTER = `watch every day:
    if day.colored_hours > 16:
        day.indicator.set(color=#FF0000, text='Перегруз')
    else:
        day.indicator.clear()`;

export function ScriptPanel({
  scripts,
  onSave,
  onDelete,
  onPreview,
  onApply,
  onCancelPreview,
  preview,
  busy,
  error,
  onRunTerminal,
  terminalOutput,
  terminalError,
  terminalBusy,
  watchers = [],
  onSaveWatcher,
  onDeleteWatcher,
  onToggleWatcher,
}) {
  const [id, setId] = useState(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState(STARTER);
  const [terminalCode, setTerminalCode] = useState(TERMINAL_STARTER);
  const [watcherId, setWatcherId] = useState(null);
  const [watcherName, setWatcherName] = useState("");
  const [watcherCode, setWatcherCode] = useState(WATCHER_STARTER);
  const [view, setView] = useState("editor");

  function choose(script) {
    setId(script.id);
    setName(script.name);
    setCode(script.code);
    onCancelPreview();
  }

  function newScript() {
    setId(null);
    setName("");
    setCode(STARTER);
    onCancelPreview();
  }

  async function save() {
    if (!name.trim() || !code.trim()) return;
    const saved = await onSave({ id, name: name.trim(), code });
    if (saved?.id) setId(saved.id);
  }

  async function remove() {
    if (!id) return;
    await onDelete(id);
    newScript();
  }

  function chooseWatcher(watcher) {
    setWatcherId(watcher.id);
    setWatcherName(watcher.name);
    setWatcherCode(watcher.code);
  }

  async function saveWatcher() {
    if (!watcherName.trim() || !watcherCode.trim()) return;
    const saved = await onSaveWatcher({ id: watcherId, name: watcherName.trim(), code: watcherCode });
    if (saved?.id) setWatcherId(saved.id);
  }

  return (
    <div className="planscript-panel">
      <div className="dock-panel-title-row">
        <span>PlanScript</span>
        <button type="button" className="icon-btn subtle tiny" title="Новый скрипт" onClick={newScript}><Plus size={13} /></button>
      </div>
      <div className="planscript-mode-tabs">
        <button type="button" className={view === "editor" ? "active" : ""} aria-pressed={view === "editor"} onClick={() => setView("editor")}>Скрипты</button>
        <button type="button" className={view === "watchers" ? "active" : ""} aria-pressed={view === "watchers"} onClick={() => setView("watchers")}>Наблюдатели</button>
        <button type="button" className={view === "terminal" ? "active" : ""} aria-pressed={view === "terminal"} onClick={() => setView("terminal")}>Терминал · чтение</button>
      </div>
      {view === "terminal" ? (
        <div className="planscript-terminal">
          <div className="hint-text">Команды только читают данные. Для проверки используйте log(...); последнее выражение выводится автоматически.</div>
          <textarea
            className="planscript-editor"
            value={terminalCode}
            onChange={(event) => setTerminalCode(event.target.value)}
            spellCheck="false"
            aria-label="Команда PlanScript для чтения"
          />
          <button type="button" className="btn btn-primary btn-sm" onClick={() => onRunTerminal(terminalCode)} disabled={terminalBusy || !terminalCode.trim()}>
            <Play size={13} /> {terminalBusy ? "Выполняется..." : "Выполнить"}
          </button>
          {terminalError && <div className="planscript-error" role="alert">{t(terminalError)}</div>}
          {terminalOutput && <pre className="planscript-log" aria-live="polite">{terminalOutput}</pre>}
        </div>
      ) : view === "watchers" ? (
        <div className="planscript-watchers">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => {
            setWatcherId(null);
            setWatcherName("");
            setWatcherCode(WATCHER_STARTER);
          }}><Plus size={13} /> Новый наблюдатель</button>
          <div className="planscript-library">
            {watchers.map((watcher) => (
              <div key={watcher.id} className={`planscript-watcher-item ${watcherId === watcher.id ? "active" : ""}`}>
                <button type="button" onClick={() => chooseWatcher(watcher)}><span data-no-translate>{watcher.name}</span> · {watcher.scope}</button>
                <label title={watcher.enabled ? "Отключить наблюдатель" : "Включить наблюдатель"}>
                  <input type="checkbox" checked={watcher.enabled} onChange={() => onToggleWatcher(watcher)} />
                </label>
              </div>
            ))}
            {!watchers.length && <span className="hint-text">Сохраните watch-блок, чтобы автоматически вычислять индикаторы.</span>}
          </div>
          <label className="field-label" htmlFor="planscript-watcher-name">Название</label>
          <input id="planscript-watcher-name" className="input-pill" value={watcherName} onChange={(event) => setWatcherName(event.target.value)} placeholder="Например, индикатор перегруза" />
          <label className="field-label" htmlFor="planscript-watcher-code">Код наблюдателя</label>
          <textarea
            id="planscript-watcher-code"
            className="planscript-editor"
            value={watcherCode}
            onChange={(event) => setWatcherCode(event.target.value)}
            spellCheck="false"
            aria-label="Код PlanScript watcher"
          />
          <div className="planscript-actions">
            <button type="button" className="btn btn-ghost btn-sm" onClick={saveWatcher} disabled={busy || !watcherName.trim() || !watcherCode.trim()}><Save size={13} /> Сохранить</button>
            {watcherId && <button type="button" className="icon-btn subtle tiny" onClick={() => onDeleteWatcher(watcherId)} disabled={busy} title="Удалить наблюдатель"><Trash2 size={13} /></button>}
          </div>
          {error && <div className="planscript-error" role="alert">{t(error)}</div>}
          <div className="hint-text">Синтаксис: watch every day / week. Наблюдатель изменяет только свой indicator.</div>
        </div>
      ) : (
        <>
      <div className="planscript-library">
        {scripts.map((script) => (
          <button
            type="button"
            key={script.id}
            className={`planscript-library-item ${id === script.id ? "active" : ""}`}
            onClick={() => choose(script)}
            title={script.lastRunAt ? `Последний запуск: ${new Date(script.lastRunAt).toLocaleString()}` : "Сохранённый скрипт"}
          >
            <span data-no-translate>{script.name}</span>
          </button>
        ))}
        {!scripts.length && <span className="hint-text">Создайте первый скрипт — он сохранится в базе приложения.</span>}
      </div>
      <label className="field-label" htmlFor="planscript-name">Название</label>
      <input id="planscript-name" className="input-pill" value={name} onChange={(event) => setName(event.target.value)} placeholder="Например, расписание семестра" />
      <label className="field-label" htmlFor="planscript-code">Код</label>
      <textarea
        id="planscript-code"
        className="planscript-editor"
        value={code}
        onChange={(event) => setCode(event.target.value)}
        spellCheck="false"
        aria-label="Код PlanScript"
      />
      <div className="planscript-actions">
        <button type="button" className="btn btn-ghost btn-sm" onClick={save} disabled={busy || !name.trim() || !code.trim()}><Save size={13} /> Сохранить</button>
        {id && <button type="button" className="icon-btn subtle tiny" onClick={remove} disabled={busy} title="Удалить скрипт"><Trash2 size={13} /></button>}
        <button type="button" className="btn btn-primary btn-sm" onClick={() => onPreview({ id, name: name.trim(), code })} disabled={busy || !code.trim()}><Play size={13} /> Предпросмотр</button>
      </div>
      {error && <div className="planscript-error" role="alert">{t(error)}</div>}
      {preview && (
        <div className="planscript-preview">
          <div className="planscript-preview-head">
            <strong>Предпросмотр</strong>
            <button type="button" className="icon-btn subtle icon-action-button" onClick={onCancelPreview} title="Закрыть" aria-label="Закрыть"><X size={16} /></button>
          </div>
          <div className="planscript-preview-stats">
            <span>Операций: {preview.operations.length}</span>
            <span>Затронуто недель: {preview.weeks.length}</span>
          </div>
          {preview.changedYears.length > 0 && <div className="hint-text">Будут добавлены годы: {preview.changedYears.join(", ")}</div>}
          {preview.log.length > 0 && <pre className="planscript-log">{preview.log.map((line) => t(line)).join("\n")}</pre>}
          <div className="planscript-actions">
            <button type="button" className="btn btn-ghost btn-sm" onClick={onCancelPreview}><X size={16} /> Отмена</button>
            <button type="button" className="btn btn-primary btn-sm" onClick={onApply} disabled={busy}><Check size={13} /> Применить</button>
          </div>
        </div>
      )}
        </>
      )}
    </div>
  );
}
