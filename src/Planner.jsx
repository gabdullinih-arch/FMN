import { useState, useEffect, useRef, useCallback, useMemo, useTransition, startTransition, Fragment } from "react";
import {
  X, Download, Upload, Undo2,
  Search, Type, PaintBucket, MousePointer2, CalendarClock,
  Copy, ClipboardPaste, CalendarDays, ClipboardCheck, LayoutTemplate,
  ZoomIn, ZoomOut, Eraser, Palette, Settings2, ChevronsLeft,
  ListChecks, BookOpen, ListTodo, CalendarPlus, ChevronUp, ChevronDown, Pipette, NotebookPen, Repeat,
  Code2, CalendarRange,
} from "lucide-react";

import { WEEKDAYS_SHORT, MONTHS_NOM, DEFAULT_COLORS, DEFAULT_CATEGORIES, VIEW_ZOOM_STEPS, BASE_UNIT } from "./constants.js";
import {
  pad, toISO, getMonday, addDays, formatRange, minToTime, timeToMin,
  uid, clamp, snap5, weeksOfYear, parseDateQuery, expandWeekRange, recurringWeekNumbers,
} from "./utils.js";
import {
  fetchWeekIntervals, fetchDayIntervals, writeInterval, clearIntervalRange, restoreWeek, restoreWeeks,
  fetchSettings, updateSettingsRemote, fetchWeekData, saveWeekQuantum, saveWeekDayBounds, listCategories, listSubcategories,
  listTemplates, listRecurringRules, listTodos, listAllAllDayEvents,
  getWeekLabels, setWeekLabel, listCreatedYears, addCreatedYear,
  getReflection, setReflection, exportReflectionsMarkdown, saveTextFile,
  exportDatabaseBackup, importDatabaseBackup, saveJsonFile, exportAllReflectionsMarkdown,
  addCategory, renameCategory, updateCategoryColor, deleteCategory,
  addSubcategory, updateSubcategoryDescription, deleteSubcategory,
  addTodo as addTodoRemote, toggleTodo as toggleTodoRemote, deleteTodo as deleteTodoRemote,
  reorderTodos as reorderTodosRemote, restoreTodoDrop as restoreTodoDropRemote,
  setAllDay as setAllDayRemote, clearAllDay as clearAllDayRemote,
  addTemplate as addTemplateRemote, deleteTemplate as deleteTemplateRemote,
  applyWeekTemplate as applyWeekTemplateRemote, applyDayTemplate as applyDayTemplateRemote,
  applyRecurringRule as applyRecurringRuleRemote, addRecurringRule as addRecurringRuleRemote,
  deleteRecurringRule as deleteRecurringRuleRemote, fetchTrackerStatsByMonth, fetchTrackerStatsRange,
  fetchMinutesByCategory, listPlanScripts, savePlanScript as savePlanScriptRemote,
  deletePlanScript as deletePlanScriptRemote, markPlanScriptRun, applyPlanScriptOperations,
  listPlanScriptWatchers, savePlanScriptWatcher, deletePlanScriptWatcher,
  saveWatchResult, listWatchIndicators, listAffectedWatchInstances,
} from "./storage.js";
import {
  EMPTY_CELL, readCellValue, applyPatchLocally, clearRangeLocally, buildAgendaEventsFromIntervals,
  daysToTemplateIntervals, dayToTemplateIntervals,
} from "./intervals.js";
import { GlobalStyles } from "./styles.jsx";
import { getLanguage, I18nProvider, LanguageSelector, t, useI18n } from "./i18n.js";
import { CategoryPanel } from "./components/CategoryPanel.jsx";
import { LazyWeek } from "./components/WeekGrid.jsx";
import { TrackerPanel } from "./components/TrackerPanel.jsx";
import { TemplatesPanel, TemplateEditorModal } from "./components/TemplatesPanel.jsx";
import { MonthsGrid, YearsGrid } from "./components/Tiles.jsx";
import { AgendaPanel } from "./components/AgendaPanel.jsx";
import { WeekTiles } from "./components/WeekTiles.jsx";
import { GlossaryPanel } from "./components/GlossaryPanel.jsx";
import { TodoPanel } from "./components/TodoPanel.jsx";
import { RecurringPanel } from "./components/RecurringPanel.jsx";
import { NotificationsSettings } from "./components/NotificationsSettings.jsx";
import { CommandPalette } from "./components/CommandPalette.jsx";
import {
  isPermissionGranted,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ScriptPanel } from "./components/ScriptPanel.jsx";
import { formatPlanScriptValue, runPlanScript, runPlanWatch } from "./script/interpreter.js";
import { parse as parsePlanScript } from "./script/parser.js";
import forgetMeNotIcon from "../app/app-icon.png";

/* ------------------------------------------------------------------ */
/*  Main app                                                           */
/* ------------------------------------------------------------------ */

const REAL_YEAR = new Date().getFullYear();
// Список годов больше не бутафорский диапазон - пользователь заводит года
// сам (см. createdYears/addYear ниже), и в селекторе/плитках "годы" видны
// только реально заведённые + опция "Завести год".

function PlannerContent() {
  const { language } = useI18n();
  useEffect(() => {
    try {
      getCurrentWindow().setTitle(language === "en" ? "Forget-me-not · FMN" : "Незабудка · FMN").catch((error) => {
        console.error("Could not update the window title", error);
      });
    } catch (error) {
      console.error("Could not access the current window", error);
    }
  }, [language]);
  const [mode, setMode] = useState("text");
  const [activeDockPanel, setActiveDockPanel] = useState(null); // null | 'categories' | 'todo' | 'agenda' | 'tracker' | 'templates' | 'script' | 'glossary' | 'settings' | 'search'
  const [fullscreenWeekIso, setFullscreenWeekIso] = useState(null);

  /* ---------- Отметка недель/дней для шаблонов ----------
     Пока открыта панель "Шаблоны" в доке, у карточек недель и у
     заголовков дней появляются чекбоксы отметки. Отмеченное используется
     и для создания шаблона (источник), и для применения (куда). Отметки
     сбрасываются при закрытии панели шаблонов, чтобы не оставались "зависшими". */
  const [markedWeeks, setMarkedWeeks] = useState(() => new Set());
  const [markedDays, setMarkedDays] = useState(() => new Set());
  const toggleWeekMark = useCallback((iso) => {
    setMarkedWeeks((prev) => { const next = new Set(prev); next.has(iso) ? next.delete(iso) : next.add(iso); return next; });
  }, []);
  const toggleDayMark = useCallback((iso, d) => {
    const key = `${iso}_${d}`;
    setMarkedDays((prev) => { const next = new Set(prev); next.has(key) ? next.delete(key) : next.add(key); return next; });
  }, []);
  const [trackerTab, setTrackerTab] = useState("week"); // "week" | "interval" | "year" - вкладка внутри Трекера
  useEffect(() => {
    if (activeDockPanel !== "templates" && !(activeDockPanel === "tracker" && trackerTab === "interval")) { setMarkedWeeks(new Set()); setMarkedDays(new Set()); }
  }, [activeDockPanel, trackerTab]);
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [templateApplyMode, setTemplateApplyMode] = useState("auto");
  const [dockHover, setDockHover] = useState(false);
  const [manualColor, setManualColor] = useState(DEFAULT_COLORS[0]);
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const categoriesLoadedRef = useRef(false);
  const [active, setActive] = useState(null);
  const [eyedropperActive, setEyedropperActive] = useState(false); // пипетка (I) - следующий клик по клетке возьмёт её "краску"
  const eyedropperActiveRef = useRef(false);
  useEffect(() => { eyedropperActiveRef.current = eyedropperActive; }, [eyedropperActive]);
  const [settings, setSettings] = useState(() => {
    // Тема по умолчанию для самого первого запуска (пока ничего ещё не
    // сохранено) - подстраиваемся под системную тёмную тему, если она
    // включена в ОС; иначе теперь по умолчанию идёт "calm" (см. также
    // ниже - названия у сегмента переключателя намеренно поменяны
    // местами: "calm" подписан как "Светлая", а "light" - как "Спокойная").
    // Как только пользователь явно выберет тему - в settings.json появится
    // поле theme, и дальше уже оно всегда побеждает системную настройку.
    let initialTheme = "calm";
    try {
      if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) initialTheme = "dark";
    } catch { /* matchMedia недоступен - остаёмся на calm */ }
    return { dayStart: 360, dayEnd: 1440, cellMin: 30, zoom: 1, theme: initialTheme, notificationsEnabled: false, notifyLeadMin: 10 };
  });
  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
  }, [settings.theme]);
  const [viewMode, setViewMode] = useState("weeks"); // "weeks" | "weekTiles" | "months" | "years" - управляется зумом
  const [weeksData, setWeeksData] = useState({});
  const [mountedWeeks, setMountedWeeks] = useState(() => {
    const cur = toISO(getMonday(new Date()));
    return { [cur]: true };
  });
  const [year, setYear] = useState(REAL_YEAR);
  // Года, которые пользователь сам завёл (селектор года и плитки "годы"
  // показывают только их + опцию "Завести год") - см. addYear() и эффект
  // миграции ниже, который один раз при первом запуске этой функции
  // подтягивает вместе с текущим годом ещё и все года, где уже реально
  // есть данные (иначе старые записи стали бы недостижимы через список).
  const [createdYears, setCreatedYears] = useState([REAL_YEAR]);
  const [createYearModalOpen, setCreateYearModalOpen] = useState(false);
  const [createYearInput, setCreateYearInput] = useState("");
  const [clearRangeScope, setClearRangeScope] = useState("week");
  const [clearRangeAnchor, setClearRangeAnchor] = useState("");
  const [clearRangeMonth, setClearRangeMonth] = useState(new Date().getMonth());
  const [clearRangeYear, setClearRangeYear] = useState(REAL_YEAR);
  const [clearRangeStart, setClearRangeStart] = useState("");
  const [clearRangeEnd, setClearRangeEnd] = useState("");
  const [clearRangeAdditional, setClearRangeAdditional] = useState([]);
  const [clearRangeBusy, setClearRangeBusy] = useState(false);
  const [clearRangeError, setClearRangeError] = useState("");
  const [selection, setSelection] = useState(null);
  const [highlight, setHighlight] = useState(null);
  const [dayHighlight, setDayHighlight] = useState(null);
  const [loading, setLoading] = useState(true);
  const [startupError, setStartupError] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [jumpDate, setJumpDate] = useState("");
  const [busyIO, setBusyIO] = useState(false);
  const [toast, setToast] = useState(null);
  const [historyCount, setHistoryCount] = useState(0);
  const [clipboardCount, setClipboardCount] = useState(0);
  const [templates, setTemplates] = useState([]);
  const [trackerLoading, setTrackerLoading] = useState(false);
  const [trackerStats, setTrackerStats] = useState(null);
  const [counterLoading, setCounterLoading] = useState(false);
  const [counterResult, setCounterResult] = useState(null);
  const [weekStats, setWeekStats] = useState(null);
  const [weekStatsLoading, setWeekStatsLoading] = useState(false);
  const [selectedDashCats, setSelectedDashCats] = useState(() => new Set());
  const [agendaDate, setAgendaDate] = useState(() => new Date());
  const [recurringRules, setRecurringRules] = useState([]);
  const [recurringBusy, setRecurringBusy] = useState(false);
  const [planScripts, setPlanScripts] = useState([]);
  const [planWatchers, setPlanWatchers] = useState([]);
  const [watchIndicators, setWatchIndicators] = useState({});
  const [scriptPreview, setScriptPreview] = useState(null);
  const [scriptError, setScriptError] = useState("");
  const [scriptBusy, setScriptBusy] = useState(false);
  const [terminalOutput, setTerminalOutput] = useState("");
  const [terminalError, setTerminalError] = useState("");
  const [terminalBusy, setTerminalBusy] = useState(false);
  const scriptsLoadedRef = useRef(false);
  const lastWatchWeeksRef = useRef({});
  const watcherRunLocksRef = useRef(new Set());
  const watcherRerunRef = useRef(new Set());
  const [todos, setTodos] = useState([]);
  const [todoToScheduleId, setTodoToScheduleId] = useState(null);
  const [allDayEvents, setAllDayEvents] = useState([]);
  const allDayEventsLoadedRef = useRef(false);
  const [weekNumbers, setWeekNumbers] = useState({}); // iso -> подпись, настоящее хранилище номера недели (не костыль)

  const weekRefs = useRef({});
  const weeksDataRef = useRef({});
  const weekLoadPromisesRef = useRef(new Map());
  const weekBoundsSavePromisesRef = useRef(new Map());
  const weekBoundsRevisionRef = useRef(new Map());
  const selRef = useRef(null);
  const dragRef = useRef(null);
  const clipboardRef = useRef([]);
  const historyRef = useRef([]);
  const fileInputRef = useRef(null);
  const yearSelectRef = useRef(null);
  const monthSelectRef = useRef(null);
  const icsInputRef = useRef(null);
  const settingsRef = useRef(settings);
  // Смена шага клетки/границ дня заставляет пересчитать сетку каждой
  // смонтированной недели заново (другое число строк) - при заметном
  // количестве смонтированных недель (после скролла по календарю) это
  // тысячи компонентов разом и жёсткий фриз интерфейса на секунду-другую.
  // startTransition просит React не считать это обновление срочным -
  // браузер остаётся отзывчивым (можно прервать/перерисовать поверх),
  // вместо того чтобы вставать колом на время всего пересчёта.
  const [isSettingsPending, startSettingsTransition] = useTransition();
  const trackerOpenRef = useRef(false);
  // ---- система прокрутки (см. блок useEffect ниже, "Прокрутка") ----
  const hoveredWeekIsoRef = useRef(null);   // неделя, в которую последней заходил курсор - цель для Ctrl+стрелки
  const handleHoverWeek = useCallback((hoveredIso) => { hoveredWeekIsoRef.current = hoveredIso; }, []);
  const manualHoverDirRef = useRef(null);   // 'up' | 'down' | null - наведение именно на стрелочку-квадратик (не на всю кромку окна)
  const autoscrollRafRef = useRef(null);    // id текущего requestAnimationFrame автопрокрутки, если она идёт
  const lockedScrollDirRef = useRef(null);  // 'up' | 'down' | null - "запертая" автопрокрутка после двойного клика по стрелочке
  const [lockedScrollDir, setLockedScrollDir] = useState(null);
  const [canScrollUp, setCanScrollUp] = useState(false);   // есть куда крутить вверх - стрелочка вообще показывается
  const [canScrollDown, setCanScrollDown] = useState(false);
  useEffect(() => { lockedScrollDirRef.current = lockedScrollDir; }, [lockedScrollDir]);
  const [spaceScrollLock, setSpaceScrollLock] = useState(false); // пробел зажат - колесо мыши крутит только всё окно
  const [weekSnapLock, setWeekSnapLock] = useState(false); // режим "прокрутка по неделям" - переключается клавишей Q
  const [keyTipsVisible, setKeyTipsVisible] = useState(false); // Alt зажат - показываем подсказки-бейджи над инструментами (как KeyTips в Excel)
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false); // Ctrl+K - список действий с поиском и хоткеями рядом
  const weekSnapLockRef = useRef(false);
  useEffect(() => { weekSnapLockRef.current = weekSnapLock; }, [weekSnapLock]);
  const snapCooldownRef = useRef(false);
  const allDayEventsRef = useRef([]);
  const notifiedKeysRef = useRef(new Set());
  const lastAllDayNotifyDateRef = useRef(null);
  const allDayNotifiedInSessionRef = useRef(new Set());
  // Ссылка на актуальную refreshTracker - чтобы setCellDone мог дёрнуть
  // пересчёт трекера сразу после отметки "выполнено", не попадая в его
  // список зависимостей (иначе setCellDone пересоздавался бы каждый рендер
  // и лишний раз перерисовывал все клетки на экране).
  const refreshTrackerRef = useRef(null);
  refreshTrackerRef.current = refreshTracker;
  const computeWeekStatsRef = useRef(null);
  computeWeekStatsRef.current = computeWeekStats;

  const mondayCur = getMonday(new Date());
  const isoCur = toISO(mondayCur);
  const yearList = useMemo(() => weeksOfYear(year), [year]);
  const weekCellMin = useCallback((iso) => weeksDataRef.current[iso]?.cellMin ?? settingsRef.current.cellMin, []);
  const weekDayStart = useCallback((iso) => weeksDataRef.current[iso]?.dayStart ?? settingsRef.current.dayStart, []);
  const weekDayEnd = useCallback((iso) => weeksDataRef.current[iso]?.dayEnd ?? settingsRef.current.dayEnd, []);
  const rowCountForWeek = useCallback((iso) => {
    return Math.ceil((weekDayEnd(iso) - weekDayStart(iso)) / weekCellMin(iso));
  }, [weekCellMin, weekDayStart, weekDayEnd]);

  useEffect(() => { selRef.current = selection; }, [selection]);
  useEffect(() => { settingsRef.current = settings; }, [settings]);
  useEffect(() => { trackerOpenRef.current = activeDockPanel === "tracker"; }, [activeDockPanel]);
  // Открыли вкладку трекера в доке - сразу считаем актуальные цифры,
  // как раньше делала кнопка в шапке.
  useEffect(() => {
    if (activeDockPanel !== "tracker") return;
    refreshTrackerRef.current && refreshTrackerRef.current();
    computeWeekStatsRef.current && computeWeekStatsRef.current();
  }, [activeDockPanel]);

  const showToast = useCallback((msg) => {
    setToast(t(msg, language));
    setTimeout(() => setToast(null), 2600);
  }, [language]);
  const showToastRef = useRef(showToast);
  showToastRef.current = showToast;

  const updateWeeksData = useCallback((updater) => {
    const next = typeof updater === "function" ? updater(weeksDataRef.current) : updater;
    weeksDataRef.current = next;
    setWeeksData(next);
    return next;
  }, []);

  // Данные недели, шаг сетки и переопределения часов загружаются одним
  // вызовом Rust-команды, чтобы при скролле не плодить отдельные запросы.
  // migrateLegacyCells больше не нужна - миграцию старых данных теперь
  // делает Rust один раз при первом запуске (см. migrate_from_old_json).
  const ensureLoadedData = useCallback((iso) => {
    if (weeksDataRef.current[iso]) return Promise.resolve(weeksDataRef.current[iso]);
    const pending = weekLoadPromisesRef.current.get(iso);
    if (pending) return pending;
    const load = fetchWeekData(iso).then((week) => {
      const data = { days: week.days, cellMin: week.cellMin, dayStart: week.dayStart, dayEnd: week.dayEnd };
      updateWeeksData((prev) => ({ ...prev, [iso]: data }));
      return data;
    }).finally(() => {
      if (weekLoadPromisesRef.current.get(iso) === load) weekLoadPromisesRef.current.delete(iso);
    });
    weekLoadPromisesRef.current.set(iso, load);
    return load;
  }, [updateWeeksData]);

  const ensureLoadedWeeks = useCallback(async (isos) => {
    const loaded = [];
    for (let index = 0; index < isos.length; index += 8) {
      loaded.push(...await Promise.all(isos.slice(index, index + 8).map(ensureLoadedData)));
    }
    return loaded;
  }, [ensureLoadedData]);

  // Размонтирование недели, уехавшей далеко за пределы экрана (см. LazyWeek
  // в WeekGrid.jsx - второй, более широкий IntersectionObserver). Данные
  // недели остаются в weeksData как были - убирается только DOM, поэтому
  // повторный вход в вьюпорт снова мгновенный (ensureLoadedData увидит,
  // что данные уже есть, и не полезет в storage). Не размонтируем неделю,
  // если на ней прямо сейчас активное перетаскивание/заливка/выделение -
  // такое совпадение маловероятно (неделя уже далеко за экраном), но
  // на всякий случай подстраховываемся, чтобы не оборвать жест на полпути.
  const handleWeekVisible = useCallback((iso, isStillNear) => {
    // Монтирование новой недели при скролле - при мелком шаге клетки
    // (10/5 мин) это сотни компонентов на одну неделю; при быстром
    // скролле такие монтирования идут одно за другим почти без пауз.
    // startTransition даёт скроллу/следующим кадрам приоритет выше,
    // чем этой довольно тяжёлой, но не срочной подгрузке контента.
    ensureLoadedData(iso).then(() => {
      if (!isStillNear()) return;
      startTransition(() => { setMountedWeeks((p) => ({ ...p, [iso]: true })); });
    }).catch((error) => {
      console.error(`Could not load week ${iso}`, error);
      showToast(`Не удалось загрузить неделю: ${error instanceof Error ? error.message : String(error)}`);
    });
  }, [ensureLoadedData, showToast]);
  const handleWeekHidden = useCallback((iso) => {
    if (dragRef.current && dragRef.current.iso === iso) return;
    setMountedWeeks((prev) => {
      if (!(iso in prev)) return prev;
      const next = { ...prev };
      delete next[iso];
      return next;
    });
  }, []);

  useEffect(() => {
    let active = true;
    const loadInBackground = (label, request, apply) => {
      request.then((value) => {
        if (active) apply(value);
      }).catch((error) => {
        console.error(`Could not load ${label}`, error);
        if (active) showToastRef.current(`Не удалось загрузить ${label}: ${error instanceof Error ? error.message : String(error)}`);
      });
    };

    (async () => {
      const [s, [cats, subs]] = await Promise.all([
        fetchSettings(),
        Promise.all([listCategories(), listSubcategories()]),
        ensureLoadedData(isoCur),
      ]);
      if (!active) return;

      const merged = { dayStart: s.dayStart, dayEnd: s.dayEnd, cellMin: s.cellMin, zoom: s.zoom, theme: s.theme, notificationsEnabled: s.notificationsEnabled, notifyLeadMin: s.notifyLeadMin };
      settingsRef.current = merged;
      setSettings(merged);
      if (s.lastAllDayNotifyDate) lastAllDayNotifyDateRef.current = s.lastAllDayNotifyDate;
      setCategories(cats.map((c) => ({
        ...c,
        subs: subs.filter((s2) => s2.categoryId === c.id).map((s2) => ({ id: s2.id, name: s2.name, description: s2.description })),
      })));
      categoriesLoadedRef.current = true;

      setLoading(false);
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const el = weekRefs.current[isoCur];
        if (el) el.scrollIntoView({ behavior: "auto", block: "start" });
      }));

      loadInBackground("шаблоны", listTemplates(), (items) => {
        const loaded = items.map((item) => ({ id: item.id, name: item.name, type: item.kind, ...JSON.parse(item.data || "{}") }));
        setTemplates((prev) => [...new Map([...loaded, ...prev].map((item) => [item.id, item])).values()]);
      });
      loadInBackground("повторяющиеся события", listRecurringRules(), (items) => {
        const loaded = items.map((r) => ({
          id: r.id, name: r.name, dayIdx: r.dayIdx, startMin: r.startMin, durationMin: r.durationMin,
          catId: r.catId, subId: r.subId, color: r.color, task: r.task,
          patternType: r.patternType, customRanges: r.customRanges, anchorIso: r.anchorMonday, weeksCount: r.weeksCount,
          conflictMode: r.conflictMode === "overwrite" ? "templateWins" : (r.conflictMode || "keepExisting"),
        }));
        setRecurringRules((prev) => [...new Map([...loaded, ...prev].map((item) => [item.id, item])).values()]);
      });
      loadInBackground("наблюдатели PlanScript", listPlanScriptWatchers(), (items) => {
        setPlanWatchers((prev) => [...new Map([...(Array.isArray(items) ? items : []), ...prev].map((item) => [item.id, item])).values()]);
      });
      loadInBackground("список задач", listTodos(), (items) => {
        setTodos((prev) => [...new Map([...items, ...prev].map((item) => [item.id, item])).values()]);
      });
      loadInBackground("события на весь день", listAllAllDayEvents(), (items) => {
        const loaded = items.map((event) => ({ id: event.id, text: event.text, catId: event.catId, color: event.color, startIso: event.startDate, endIso: event.endDate }));
        const mergedEvents = [...new Map([...loaded, ...allDayEventsRef.current].map((event) => [event.id, event])).values()];
        allDayEventsRef.current = mergedEvents;
        setAllDayEvents(mergedEvents);
        allDayEventsLoadedRef.current = true;
      });
      loadInBackground("подписи недель", getWeekLabels("1900-01-01", "2200-01-01"), (pairs) => {
        const loaded = Object.fromEntries(pairs);
        setWeekNumbers((prev) => ({ ...loaded, ...prev }));
      });
      loadInBackground("список годов", listCreatedYears().then(async (items) => {
        if (items.length === 0) {
          await addCreatedYear(REAL_YEAR);
          return [REAL_YEAR];
        }
        return items;
      }), (items) => {
        setCreatedYears((prev) => [...new Set([...items, ...prev])].sort((a, b) => a - b));
      });
    })().catch((error) => {
      console.error("Не удалось загрузить данные приложения:", error);
      if (active) setStartupError(error instanceof Error ? error.message : String(error));
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [ensureLoadedData, isoCur]);

  useEffect(() => {
    if (activeDockPanel !== "script" || scriptsLoadedRef.current) return;
    let activeEffect = true;
    listPlanScripts().then((items) => {
      if (!activeEffect) return;
      setPlanScripts(items);
      scriptsLoadedRef.current = true;
    }).catch((error) => {
      if (activeEffect) setScriptError(`Не удалось загрузить библиотеку PlanScript: ${error instanceof Error ? error.message : String(error)}`);
    });
    return () => { activeEffect = false; };
  }, [activeDockPanel]);

  // CategoryPanel emits a complete state snapshot; persist only the differences.
  const prevCategoriesRef = useRef(null);
  useEffect(() => {
    if (!categoriesLoadedRef.current) return;
    const prev = prevCategoriesRef.current;
    prevCategoriesRef.current = categories;
    if (!prev) { // первый прогон после загрузки - синхронизировать нечего
      return;
    }
    const prevById = new Map(prev.map((c) => [c.id, c]));
    const nextIds = new Set(categories.map((c) => c.id));

    prev.forEach((c) => { if (!nextIds.has(c.id)) deleteCategory(c.id).catch(() => {}); });

    categories.forEach((c, i) => {
      const old = prevById.get(c.id);
      if (!old) {
        addCategory(c.id, c.name, c.color, i).catch(() => {});
        (c.subs || []).forEach((s, j) => addSubcategory(s.id, c.id, s.name, j).catch(() => {}));
        return;
      }
      if (old.name !== c.name) renameCategory(c.id, c.name).catch(() => {});
      if (old.color !== c.color) updateCategoryColor(c.id, c.color).catch(() => {});

      const oldSubsById = new Map((old.subs || []).map((s) => [s.id, s]));
      const nextSubIds = new Set((c.subs || []).map((s) => s.id));
      (old.subs || []).forEach((s) => { if (!nextSubIds.has(s.id)) deleteSubcategory(s.id).catch(() => {}); });
      (c.subs || []).forEach((s, j) => {
        const oldSub = oldSubsById.get(s.id);
        if (!oldSub) { addSubcategory(s.id, c.id, s.name, j).catch(() => {}); return; }
        if (oldSub.description !== s.description) updateSubcategoryDescription(s.id, s.description || "").catch(() => {});
        // Переименование подкатегории (name) отдельной Rust-команды пока
        // нет - редкая операция, не встретилась в текущем UI CategoryPanel.jsx.
      });
    });
  }, [categories]);
  useEffect(() => { allDayEventsRef.current = allDayEvents; }, [allDayEvents]);
  useEffect(() => { if (mode !== "select") { setSelection(null); selRef.current = null; pendingMoveRef.current = null; } }, [mode]);
  useEffect(() => {
    ensureLoadedData(toISO(getMonday(agendaDate))).catch((error) => {
      console.error("Could not load agenda week", error);
      showToast(`Не удалось загрузить неделю: ${error instanceof Error ? error.message : String(error)}`);
    });
  }, [agendaDate, ensureLoadedData, showToast]);
  useEffect(() => {
    if (viewMode !== "weekTiles") return;
    ensureLoadedWeeks(yearList.map(toISO)).catch((error) => {
      console.error("Could not load weeks for week tiles", error);
      showToast(`Не удалось загрузить недели: ${error instanceof Error ? error.message : String(error)}`);
    });
  }, [viewMode, yearList, ensureLoadedWeeks, showToast]);

  // Подпись на плитке недели (режим "Недели плитками") - хранится отдельно
  // от клеток (weekNumbers, iso -> подпись; на Rust-стороне это week_meta,
  // см. lib.rs). Раньше здесь был ещё и legacy-фолбэк на текст, вписанный
  // прямо в клетку d0_t{dayStart} - это была подстраховка ДО появления
  // самого weekNumbers-хранилища; с миграцией на Rust она не нужна -
  // настоящую миграцию старых данных делает migrate_from_old_json один раз.
  const weekNumberLabels = weekNumbers;

  function setWeekNumber(iso, label) {
    setWeekNumbers((prev) => {
      const next = { ...prev };
      if (label) next[iso] = label; else delete next[iso];
      return next;
    });
    setWeekLabel(iso, label || "").catch(() => {}); // пустая строка - Rust сам удаляет ряд (см. set_week_label)
  }

  const maybeRefreshTracker = useCallback(() => {
    if (trackerOpenRef.current && refreshTrackerRef.current) refreshTrackerRef.current();
  }, []);

  function goToCurrentWeek() {
    if (year !== REAL_YEAR) setYear(REAL_YEAR);
    setMountedWeeks((prev) => ({ ...prev, [isoCur]: true }));
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const el = weekRefs.current[isoCur];
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }));
  }

  // Этап 2: снимок/восстановление недели теперь целиком через restore_week
  // (Rust, одна транзакция) - см. lib.rs. days внутри снимка никогда не
  // мутируется на месте (applyPatchLocally/clearRangeLocally всегда строят
  // новые массивы - см. intervals.js), так что сохранять в историю можно
  // прямую ссылку без глубокого клонирования - она не "протухнет" заодно
  // с последующими правками.
  const snapshot = useCallback((iso) => {
    const wk = weeksDataRef.current[iso] || { days: [[], [], [], [], [], [], []] };
    historyRef.current.push({ iso, days: wk.days });
    if (historyRef.current.length > 40) historyRef.current.shift();
    setHistoryCount(historyRef.current.length);
  }, []);

  const cancelPendingWeekWrites = useCallback((iso) => {
    const monday = new Date(`${iso}T00:00:00`);
    Object.entries(intervalWriteTimersRef.current).forEach(([key, pending]) => {
      for (let day = 0; day < 7; day++) {
        if (key.startsWith(`${toISO(addDays(monday, day))}_`)) {
          clearTimeout(pending.timer);
          delete intervalWriteTimersRef.current[key];
          break;
        }
      }
    });
  }, []);

  const undo = useCallback(async () => {
    const last = historyRef.current.pop();
    setHistoryCount(historyRef.current.length);
    if (!last) { showToast("Отменять больше нечего"); return; }
    if (last.kind === "todoDrop") {
      try {
        cancelPendingWeekWrites(last.iso);
        if (!(await last.deletePromise)) throw new Error("дело не было удалено из списка");
        await restoreTodoDropRemote(last.iso, last.days, last.todo);
        updateWeeksData((prev) => ({ ...prev, [last.iso]: { ...prev[last.iso], days: last.days } }));
        setTodos((prev) => prev.some((todo) => todo.id === last.todo.id)
          ? prev
          : [...prev, last.todo].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)));
        maybeRefreshTracker();
        showToast("Перенос дела отменён");
      } catch (error) {
        historyRef.current.push(last);
        setHistoryCount(historyRef.current.length);
        showToast(`Не удалось отменить перенос: ${error instanceof Error ? error.message : String(error)}`);
      }
      return;
    }
    if (last.kind === "multiWeek") {
      try {
        last.snapshots.forEach(({ monday }) => cancelPendingWeekWrites(monday));
        await restoreWeeks(last.snapshots);
        updateWeeksData((prev) => {
          const next = { ...prev };
          for (const snapshot of last.snapshots) {
            next[snapshot.monday] = { ...prev[snapshot.monday], days: snapshot.days };
          }
          return next;
        });
        maybeRefreshTracker();
        showToast("Операция отменена");
      } catch (error) {
        historyRef.current.push(last);
        setHistoryCount(historyRef.current.length);
        showToast(`Не удалось отменить операцию: ${error instanceof Error ? error.message : String(error)}`);
      }
      return;
    }
    if (last.kind === "planscript") {
      try {
        await applyPlanScriptOperations(last.inverseOperations);
        updateWeeksData((prev) => {
          const next = { ...prev };
          for (const [iso, week] of Object.entries(last.weeks)) next[iso] = { ...prev[iso], ...week };
          return next;
        });
        prevCategoriesRef.current = last.categories;
        setCategories(last.categories);
        setTodos(last.todos);
        setAllDayEvents(last.allDayEvents);
        setCreatedYears(last.createdYears);
        maybeRefreshTracker();
        showToast("Скрипт отменён");
      } catch (error) {
        historyRef.current.push(last);
        setHistoryCount(historyRef.current.length);
        showToast(`Не удалось отменить скрипт: ${error instanceof Error ? error.message : String(error)}`);
      }
      return;
    }
    try {
      cancelPendingWeekWrites(last.iso);
      await restoreWeek(last.iso, last.days);
    } catch (error) {
      historyRef.current.push(last);
      setHistoryCount(historyRef.current.length);
      showToast(`Не удалось отменить действие: ${error instanceof Error ? error.message : String(error)}`);
      return;
    }
    updateWeeksData((prev) => ({ ...prev, [last.iso]: { ...prev[last.iso], days: last.days } }));
    maybeRefreshTracker();
    showToast("Отменено");
  }, [showToast, updateWeeksData, maybeRefreshTracker, cancelPendingWeekWrites]);

  /* ---------- Общий механизм записи одной клетки (Этап 2) ----------
     Раньше: readCellValue+writeCellValue на локальном плоском словаре
     недели + сохранение всего JSON-блока недели целиком. Теперь: один
     Rust-вызов SetInterval на ОДНУ строку сетки (см. §8 PlanScript-spec) -
     мерж полей ("не упомянутое поле остаётся как было") бэкенд делает сам,
     фронтенду не нужно самому читать существующее значение перед записью.

     Локальный кэш (weeksData[iso].days[d]) обновляется СРАЗУ же (через
     applyPatchLocally - JS-копия логики set_interval_tx из lib.rs) для
     мгновенного отклика на ввод, а дебаунсing-запись на Rust-сторону идёт
     отдельно; после того как она подтвердится, day перечитывается заново
     с бэкенда и заменяет локальный кэш - самокоррекция на случай, если
     JS-копия где-то разойдётся с настоящей Rust-логикой (см. intervals.js). */
  const intervalWriteTimersRef = useRef({});

  const applyLocalCellPatch = useCallback((iso, dayIdx, startMin, endMin, patch) => {
    updateWeeksData((prev) => {
      const wk = prev[iso] || { days: [[], [], [], [], [], [], []] };
      const days = wk.days.slice();
      days[dayIdx] = applyPatchLocally(days[dayIdx] || [], startMin, endMin, patch);
      return { ...prev, [iso]: { ...wk, days } };
    });
  }, [updateWeeksData]);

  const writePendingInterval = useCallback(async (pending) => {
    if (pending.clear) await clearIntervalRange(pending.date, pending.startMin, pending.endMin);
    else await writeInterval(pending.date, pending.startMin, pending.endMin, pending.patch);
    const fresh = await fetchDayIntervals(pending.date);
    updateWeeksData((prev) => {
      const wk = prev[pending.iso];
      if (!wk) return prev;
      const days = wk.days.slice();
      days[pending.dayIdx] = fresh;
      return { ...prev, [pending.iso]: { ...wk, days } };
    });
  }, [updateWeeksData]);

  const scheduleCellWrite = useCallback((iso, dayIdx, startMin, endMin, patch) => {
    const date = toISO(addDays(new Date(iso + "T00:00:00"), dayIdx));
    const key = `${date}_${startMin}`;
    if (intervalWriteTimersRef.current[key]) clearTimeout(intervalWriteTimersRef.current[key].timer);
    const pending = { iso, dayIdx, date, startMin, endMin, patch, clear: false, timer: null };
    pending.timer = setTimeout(async () => {
      if (intervalWriteTimersRef.current[key] !== pending) return;
      delete intervalWriteTimersRef.current[key];
      try { await writePendingInterval(pending); }
      catch (error) { showToast(`Не удалось сохранить клетку: ${error instanceof Error ? error.message : String(error)}`); }
    }, 400);
    intervalWriteTimersRef.current[key] = pending;
  }, [writePendingInterval, showToast]);

  const setCellPatch = useCallback((iso, d, r, patch) => {
    const cellMin = weekCellMin(iso);
    const startMin = weekDayStart(iso) + r * cellMin;
    const endMin = Math.min(weekDayEnd(iso), startMin + cellMin);
    applyLocalCellPatch(iso, d, startMin, endMin, patch);
    scheduleCellWrite(iso, d, startMin, endMin, patch);
  }, [applyLocalCellPatch, scheduleCellWrite, weekCellMin, weekDayStart, weekDayEnd]);

  // Полная очистка клетки (ластик, повторный клик той же краской) -
  // аналог ClearInterval (не SetInterval с пустым патчем): без лишнего
  // похода "прочитать существующее на старте диапазона" на Rust-стороне.
  const clearCellPatch = useCallback((iso, d, r) => {
    const cellMin = weekCellMin(iso);
    const startMin = weekDayStart(iso) + r * cellMin;
    const endMin = Math.min(weekDayEnd(iso), startMin + cellMin);
    const date = toISO(addDays(new Date(iso + "T00:00:00"), d));
    updateWeeksData((prev) => {
      const wk = prev[iso] || { days: [[], [], [], [], [], [], []] };
      const days = wk.days.slice();
      days[d] = clearRangeLocally(days[d] || [], startMin, endMin);
      return { ...prev, [iso]: { ...wk, days } };
    });
    const key = `${date}_${startMin}`;
    if (intervalWriteTimersRef.current[key]) clearTimeout(intervalWriteTimersRef.current[key].timer);
    const pending = { iso, dayIdx: d, date, startMin, endMin, clear: true, timer: null };
    pending.timer = setTimeout(async () => {
      if (intervalWriteTimersRef.current[key] !== pending) return;
      delete intervalWriteTimersRef.current[key];
      try { await writePendingInterval(pending); }
      catch (error) { showToast(`Не удалось очистить клетку: ${error instanceof Error ? error.message : String(error)}`); }
    }, 400);
    intervalWriteTimersRef.current[key] = pending;
  }, [updateWeeksData, weekCellMin, weekDayStart, weekDayEnd, writePendingInterval, showToast]);

  const flushPendingWeekWrites = useCallback(async (iso) => {
    const pendingWrites = Object.entries(intervalWriteTimersRef.current)
      .filter(([, pending]) => pending.iso === iso);
    for (const [key, pending] of pendingWrites) {
      if (intervalWriteTimersRef.current[key] !== pending) continue;
      clearTimeout(pending.timer);
      delete intervalWriteTimersRef.current[key];
      await writePendingInterval(pending);
    }
  }, [writePendingInterval]);

  const clearWeek = useCallback(async (iso) => {
    if (!window.confirm(t("Очистить все клетки этой недели? Действие можно отменить через Undo (Ctrl+Z)."))) return;
    try {
      await flushPendingWeekWrites(iso);
    } catch (error) {
      showToast(`Не удалось сохранить ожидающие изменения: ${error instanceof Error ? error.message : String(error)}`);
      return;
    }
    const emptyDays = [[], [], [], [], [], [], []];
    const previousDays = weeksDataRef.current[iso]?.days || [[], [], [], [], [], [], []];
    try {
      await restoreWeek(iso, emptyDays);
    } catch (error) {
      showToast(`Не удалось очистить неделю: ${error instanceof Error ? error.message : String(error)}`);
      return;
    }
    historyRef.current.push({ iso, days: previousDays });
    if (historyRef.current.length > 40) historyRef.current.shift();
    setHistoryCount(historyRef.current.length);
    updateWeeksData((prev) => ({ ...prev, [iso]: { ...prev[iso], days: emptyDays } }));
    maybeRefreshTracker();
    showToast("Неделя очищена");
  }, [updateWeeksData, showToast, maybeRefreshTracker, flushPendingWeekWrites]);

  const openClearRangeDialog = useCallback((scope = "week") => {
    const anchor = hoveredWeekIsoRef.current || isoCur;
    const monday = new Date(`${anchor}T00:00:00`);
    setClearRangeAnchor(anchor);
    setClearRangeMonth(monday.getMonth());
    setClearRangeYear(monday.getFullYear());
    setClearRangeStart(anchor);
    setClearRangeEnd(toISO(addDays(monday, 6)));
    setClearRangeAdditional([]);
    setClearRangeScope(scope);
    setClearRangeError("");
    setViewMode(scope === "week" ? "weekTiles" : scope === "month" ? "months" : scope === "year" ? "years" : "weeks");
    if (scope === "month") setYear(monday.getFullYear());
    setActiveDockPanel("clearRange");
  }, [isoCur]);

  const setClearRangeMode = useCallback((scope) => {
    setClearRangeScope(scope);
    setClearRangeError("");
    setViewMode(scope === "week" ? "weekTiles" : scope === "month" ? "months" : scope === "year" ? "years" : "weeks");
    if (scope === "month") setYear(clearRangeYear);
  }, [clearRangeYear]);

  const clearRangeDates = useMemo(() => {
    if (clearRangeScope === "week" && clearRangeAnchor) {
      const monday = new Date(`${clearRangeAnchor}T00:00:00`);
      return [{ start: clearRangeAnchor, end: toISO(addDays(monday, 6)) }];
    }
    if (clearRangeScope === "month") {
      const leapYear = clearRangeYear % 4 === 0 && (clearRangeYear % 100 !== 0 || clearRangeYear % 400 === 0);
      const monthDays = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
      return [{
        start: `${String(clearRangeYear).padStart(4, "0")}-${pad(clearRangeMonth + 1)}-01`,
        end: `${String(clearRangeYear).padStart(4, "0")}-${pad(clearRangeMonth + 1)}-${pad(monthDays[clearRangeMonth])}`,
      }];
    }
    if (clearRangeScope === "year") {
      return [{
        start: `${String(clearRangeYear).padStart(4, "0")}-01-01`,
        end: `${String(clearRangeYear).padStart(4, "0")}-12-31`,
      }];
    }
    return [{ start: clearRangeStart, end: clearRangeEnd }, ...clearRangeAdditional];
  }, [clearRangeAdditional, clearRangeAnchor, clearRangeEnd, clearRangeMonth, clearRangeScope, clearRangeStart, clearRangeYear]);

  const clearCalendarRange = useCallback(async () => {
    const validIsoDate = (value) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
      const year = Number(value.slice(0, 4));
      if (year < 1 || year > 9999) return false;
      const parsed = new Date(`${value}T00:00:00`);
      const normalized = `${String(parsed.getFullYear()).padStart(4, "0")}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}`;
      return Number.isFinite(parsed.getTime()) && normalized === value;
    };
    if (clearRangeDates.some(({ start, end }) => !validIsoDate(start) || !validIsoDate(end) || start > end)) {
      setClearRangeError(t("Проверьте даты: начало должно быть не позже конца."));
      return;
    }

    const weekStartSet = new Set();
    clearRangeDates.forEach(({ start, end }) => {
      const firstMonday = getMonday(new Date(`${start}T00:00:00`));
      const lastMonday = getMonday(new Date(`${end}T00:00:00`));
      for (let monday = firstMonday; monday <= lastMonday; monday = addDays(monday, 7)) {
        weekStartSet.add(toISO(monday));
      }
    });
    const weekStarts = [...weekStartSet].sort();
    if (weekStarts.length > 520) {
      setClearRangeError(t("За один раз можно очистить не более 520 недель."));
      return;
    }

    setClearRangeBusy(true);
    setClearRangeError("");
    try {
      await ensureLoadedWeeks(weekStarts);
      for (const iso of weekStarts) await flushPendingWeekWrites(iso);

      const affectedDays = weekStarts.reduce((count, iso) => {
        const week = weeksDataRef.current[iso];
        if (!week) throw new Error(`Не загружена неделя ${iso}`);
        const monday = new Date(`${iso}T00:00:00`);
        return count + week.days.reduce((dayCount, intervals, dayIdx) => {
          const date = toISO(addDays(monday, dayIdx));
          const included = clearRangeDates.some((range) => date >= range.start && date <= range.end);
          return dayCount + (included && intervals.length > 0 ? 1 : 0);
        }, 0);
      }, 0);
      if (affectedDays === 0) {
        setActiveDockPanel(null);
        showToast(t("В выбранном диапазоне нет записей."));
        return;
      }

      const snapshots = weekStarts.map((iso) => {
        const week = weeksDataRef.current[iso];
        if (!week) throw new Error(`Не загружена неделя ${iso}`);
        return { monday: iso, days: week.days.map((intervals) => intervals.slice()) };
      });
      const clearedSnapshots = snapshots.map((snapshot) => {
        const iso = snapshot.monday;
        const monday = new Date(`${iso}T00:00:00`);
        return {
          monday: iso,
          days: snapshot.days.map((intervals, dayIdx) => {
            const date = toISO(addDays(monday, dayIdx));
            return clearRangeDates.some((range) => date >= range.start && date <= range.end) ? [] : intervals;
          }),
        };
      });

      await restoreWeeks(clearedSnapshots);
      historyRef.current.push({ kind: "multiWeek", snapshots });
      if (historyRef.current.length > 40) historyRef.current.shift();
      setHistoryCount(historyRef.current.length);
      updateWeeksData((previous) => {
        const next = { ...previous };
        clearedSnapshots.forEach((snapshot) => {
          next[snapshot.monday] = { ...previous[snapshot.monday], days: snapshot.days };
        });
        return next;
      });
      maybeRefreshTracker();
      setActiveDockPanel(null);
      showToast(t("Календарный диапазон очищен. Отмена: Ctrl+Z."));
    } catch (error) {
      console.error("Could not clear calendar date range", error);
      setClearRangeError(`${t("Не удалось очистить календарный диапазон:")} ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setClearRangeBusy(false);
    }
  }, [clearRangeDates, ensureLoadedWeeks, flushPendingWeekWrites, maybeRefreshTracker, showToast, updateWeeksData]);

  const changeWeekQuantum = useCallback(async (iso, value) => {
    const cellMin = value === "" ? null : Number(value);
    try {
      await saveWeekQuantum(iso, cellMin);
      updateWeeksData((prev) => ({
        ...prev,
        [iso]: { ...(prev[iso] || { days: [[], [], [], [], [], [], []] }), cellMin },
      }));
      showToast(cellMin ? `Шаг недели: ${cellMin} мин` : "Для недели восстановлен общий шаг");
    } catch (error) {
      showToast(`Не удалось изменить шаг недели: ${error instanceof Error ? error.message : String(error)}`);
    }
  }, [updateWeeksData, showToast]);

  const changeWeekDayBounds = useCallback(async (iso, field, rawValue) => {
    const wk = weeksDataRef.current[iso];
    const global = settingsRef.current;
    const value = timeToMin(rawValue);
    const dayStart = field === "dayStart" ? (value === global.dayStart ? null : value) : (wk?.dayStart ?? null);
    const dayEndValue = field === "dayEnd" && value === 0 ? 1440 : value;
    const dayEnd = field === "dayEnd" ? (dayEndValue === global.dayEnd ? null : dayEndValue) : (wk?.dayEnd ?? null);
    const nextStart = dayStart ?? global.dayStart;
    const nextEnd = dayEnd ?? global.dayEnd;
    if (nextStart >= nextEnd) {
      showToast("Начало дня должно быть раньше конца");
      return;
    }
    const previousBounds = { dayStart: wk?.dayStart ?? null, dayEnd: wk?.dayEnd ?? null };
    const revision = (weekBoundsRevisionRef.current.get(iso) || 0) + 1;
    weekBoundsRevisionRef.current.set(iso, revision);
    updateWeeksData((prev) => ({
      ...prev,
      [iso]: {
        ...(prev[iso] || { days: [[], [], [], [], [], [], []] }),
        dayStart,
        dayEnd,
      },
    }));
    try {
      const previousSave = weekBoundsSavePromisesRef.current.get(iso);
      const save = previousSave
        ? previousSave.catch(() => {}).then(() => saveWeekDayBounds(iso, dayStart, dayEnd))
        : saveWeekDayBounds(iso, dayStart, dayEnd);
      weekBoundsSavePromisesRef.current.set(iso, save);
      try {
        await save;
      } finally {
        if (weekBoundsSavePromisesRef.current.get(iso) === save) weekBoundsSavePromisesRef.current.delete(iso);
      }
      if (weekBoundsRevisionRef.current.get(iso) === revision) {
        showToast(`Время недели: ${minToTime(nextStart)}–${minToTime(nextEnd === 1440 ? 0 : nextEnd)}`);
      }
    } catch (error) {
      console.error(`Could not update day bounds for week ${iso}`, error);
      if (weekBoundsRevisionRef.current.get(iso) === revision) {
        updateWeeksData((prev) => ({
          ...prev,
          [iso]: { ...(prev[iso] || {}), ...previousBounds },
        }));
        showToast(`Не удалось изменить часы недели: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }, [updateWeeksData, showToast]);

  const resetWeekDayBounds = useCallback(async (iso) => {
    const wk = weeksDataRef.current[iso];
    const previousBounds = { dayStart: wk?.dayStart ?? null, dayEnd: wk?.dayEnd ?? null };
    const revision = (weekBoundsRevisionRef.current.get(iso) || 0) + 1;
    weekBoundsRevisionRef.current.set(iso, revision);
    updateWeeksData((prev) => ({
      ...prev,
      [iso]: { ...(prev[iso] || { days: [[], [], [], [], [], [], []] }), dayStart: null, dayEnd: null },
    }));
    try {
      const previousSave = weekBoundsSavePromisesRef.current.get(iso);
      const save = previousSave
        ? previousSave.catch(() => {}).then(() => saveWeekDayBounds(iso, null, null))
        : saveWeekDayBounds(iso, null, null);
      weekBoundsSavePromisesRef.current.set(iso, save);
      try {
        await save;
      } finally {
        if (weekBoundsSavePromisesRef.current.get(iso) === save) weekBoundsSavePromisesRef.current.delete(iso);
      }
      if (weekBoundsRevisionRef.current.get(iso) === revision) showToast("Для недели восстановлены общие часы");
    } catch (error) {
      console.error(`Could not reset day bounds for week ${iso}`, error);
      if (weekBoundsRevisionRef.current.get(iso) === revision) {
        updateWeeksData((prev) => ({
          ...prev,
          [iso]: { ...(prev[iso] || {}), ...previousBounds },
        }));
        showToast(`Не удалось восстановить общие часы: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }, [updateWeeksData, showToast]);

  const setCellText = useCallback((iso, d, r, text) => setCellPatch(iso, d, r, { text }), [setCellPatch]);
  const setCellTask = useCallback((iso, d, r, task) => setCellPatch(iso, d, r, { task }), [setCellPatch]);

  // Описание конкретного дела в клетке (не подкатегории - см. CategoryPanel) -
  // читаемый текст-заметка, который можно раскрыть иконкой на самой клетке
  // и который также всплывает подсказкой при наведении (см. hoverDescTooltip).
  const setCellDescription = useCallback((iso, d, r, description) => setCellPatch(iso, d, r, { description }), [setCellPatch]);

  const [hoverDescTooltip, setHoverDescTooltip] = useState(null); // {x,y,text} | null - единая всплывающая подсказка на всё приложение
  const handleLeaveDescription = useCallback(() => setHoverDescTooltip(null), []);

  /* ---------- Рефлексия дня - заметка на дату, не привязанная к клеткам
     сетки (отдельный ключ "reflection:{iso}" в том же хранилище, что и всё
     остальное - никаких изменений в Python-бэкенде не требуется, он уже
     умеет читать/писать произвольные ключи). ---------- */
  const [reflectionModalIso, setReflectionModalIso] = useState(null); // null - закрыта
  const [reflectionText, setReflectionText] = useState("");
  const [reflectionLoading, setReflectionLoading] = useState(false);
  const [reflectionSaving, setReflectionSaving] = useState(false);
  const reflectionSaveTimerRef = useRef(null);
  const reflectionSavePromiseRef = useRef(Promise.resolve());

  const openReflection = useCallback((iso) => {
    setReflectionModalIso(iso);
    setReflectionText("");
    setReflectionLoading(true);
    getReflection(iso).then((text) => {
      setReflectionText(typeof text === "string" ? text : "");
      setReflectionLoading(false);
    });
  }, []);

  function scheduleReflectionSave(iso, text) {
    if (reflectionSaveTimerRef.current) clearTimeout(reflectionSaveTimerRef.current);
    setReflectionSaving(true);
    reflectionSaveTimerRef.current = setTimeout(() => {
      reflectionSaveTimerRef.current = null;
      // Пустой текст - set_reflection в Rust сам удаляет ряд целиком
      // (см. lib.rs: set_reflection), а не держит пустую строку вечно.
      const save = setReflection(iso, text, Date.now());
      reflectionSavePromiseRef.current = save;
      save.then(
        () => setReflectionSaving(false),
        (error) => {
          console.error("Could not save reflection", error);
          showToast(t("Не удалось сохранить рефлексию"));
          setReflectionSaving(false);
        },
      );
    }, 500);
  }

  async function flushReflectionSave() {
    if (reflectionSaveTimerRef.current) {
      clearTimeout(reflectionSaveTimerRef.current);
      reflectionSaveTimerRef.current = null;
      if (reflectionModalIso) {
        reflectionSavePromiseRef.current = setReflection(reflectionModalIso, reflectionText, Date.now());
      }
    }
    try {
      await reflectionSavePromiseRef.current;
      setReflectionSaving(false);
    } catch (error) {
      console.error("Could not save reflection before export", error);
      showToast(t("Не удалось сохранить рефлексию"));
      throw error;
    }
  }

  function closeReflectionModal() {
    if (reflectionSaveTimerRef.current) { clearTimeout(reflectionSaveTimerRef.current); reflectionSaveTimerRef.current = null; }
    if (reflectionModalIso) {
      const save = setReflection(reflectionModalIso, reflectionText, Date.now());
      reflectionSavePromiseRef.current = save;
      save.then(
        () => setReflectionSaving(false),
        (error) => {
          console.error("Could not save reflection", error);
          showToast(t("Не удалось сохранить рефлексию"));
          setReflectionSaving(false);
        },
      );
    }
    setReflectionModalIso(null);
    setReflectionSaving(false);
  }

  // Выгрузка всех рефлексий года одним .md-файлом - теперь просто вызов
  // готовой Rust-команды (export_reflections_markdown - та же самая
  // SQL-выборка по диапазону дат, что и everywhere else в бэкенде) +
  // диалог "Сохранить как" через плагины dialog/fs (см. storage.js).
  async function exportReflectionsForYear(y) {
    const md = await exportReflectionsMarkdown(y);
    if (!md || md.split("\n").length <= 3) { showToast(`За ${y} год рефлексий пока нет`); return; }
    const ok = await saveTextFile(`Рефлексии ${y}.md`, md).catch(() => false);
    showToast(ok ? `Сохранено: Рефлексии ${y}.md` : "Экспорт отменён или не удался");
  }

  // Выбор подкатегории прямо в клетке - цвет категории проставляется
  // здесь ЕЩЁ РАЗ явно (а не только унаследуется), чтобы заливка гарантированно
  // соответствовала цвету категории, даже если что-то пошло не так при заливке.
  const setCellSub = useCallback((iso, d, r, category, subId) => {
    const sub = category.subs.find((s) => s.id === subId);
    if (!sub) return;
    setCellPatch(iso, d, r, {
      subId,
      text: `${category.name} - ${sub.name}`,
      color: category.color,
      catId: category.id,
    });
  }, [setCellPatch]);

  const setCellDone = useCallback((iso, d, r, done) => {
    setCellPatch(iso, d, r, { done });
    // Трекер открыт - сразу пересчитываем, чтобы цифры не расходились
    // с тем, что реально отмечено в клетках (а не только по кнопке "Обновить").
    if (trackerOpenRef.current && refreshTrackerRef.current) refreshTrackerRef.current();
  }, [setCellPatch]);

  // Только у самой первой клетки в мазке проставляется название категории -
  // остальные просто получают цвет, как будто закрашивается один диапазон,
  // а не повторяется текст в каждой клетке. Цвет берётся напрямую из
  // выбранной категории (active.color), поэтому заливка всегда совпадает
  // с цветом категории, который виден в панели категорий.
  //
  // Две дополнительные особенности:
  //  - повторный клик ТОЙ ЖЕ кистью (та же категория+подкатегория) по уже
  //    закрашенной ею клетке - очищает клетку (клетка становится белой),
  //    вместо того чтобы просто закрасить её ещё раз тем же цветом;
  //  - если перекрашиваем клетку-ЗАГОЛОВОК блока (isFirst) в другую
  //    категорию, все клетки ПОСЛЕ неё в том же блоке - закрашенные, но
  //    без своего текста ("продолжение") - тоже перекрашиваются в новый
  //    цвет, чтобы блок остался целостным, а не распался на половины
  //    разных цветов. Останавливаемся на первой пустой клетке или на
  //    клетке с собственным текстом (там начинается уже другой блок).
  // Этап 2: один клик/одна клетка при протягивании = один setCellPatch,
  // тот же приём, что и у текстовых полей - но с одной особенностью, уже
  // существовавшей в старой модели и сохранённой здесь: если красится
  // САМАЯ ПЕРВАЯ клетка протягивания (isFirst) и следом идут уже
  // закрашенные, но без текста клетки (видимое продолжение того же
  // блока) - цвет/категория "протягиваются" и на них тоже, чтобы клик по
  // одной клетке блока перекрашивал блок целиком, а не только её саму.
  // Читаем для этого локальный, ещё не изменённый снимок дня (как и
  // раньше читали newCells ДО собственной правки).
  const applyPaint = useCallback((iso, d, r, isFirst) => {
    const cellMin = weekCellMin(iso);
    const label = active ? active.label : null;
    const useColor = active ? active.color : manualColor;
    const catId = active ? active.catId : null;
    const subId = active ? active.subId : null;

    const dayIntervals = ((weeksDataRef.current[iso] || {}).days || [])[d] || [];
    const rowStart = weekDayStart(iso) + r * cellMin;
    const existing = readCellValue(dayIntervals, rowStart);
    const sameBrush = active && existing.color
      && existing.catId === catId && (existing.subId || null) === (subId || null);

    if (sameBrush) {
      clearCellPatch(iso, d, r);
      return;
    }

    const patch = { color: useColor, catId, subId };
    if (isFirst && label) patch.text = label;
    setCellPatch(iso, d, r, patch);

    if (isFirst) {
      let nr = r + 1;
      while (nr < rowCountForWeek(iso)) {
        const nextRowStart = weekDayStart(iso) + nr * cellMin;
        const nextVal = readCellValue(dayIntervals, nextRowStart);
        if (!nextVal.color || nextVal.text) break; // конец блока или заголовок следующего
        setCellPatch(iso, d, nr, { color: useColor, catId, subId });
        nr++;
      }
    }
  }, [active, manualColor, setCellPatch, clearCellPatch, weekCellMin, weekDayStart, rowCountForWeek]);

  // Ластик: протягивание мышью по клеткам одного дня очищает их полностью
  // (текст, цвет, категория, галочка) - по аналогии с заливкой, только
  // "стирает" вместо "красит".
  const applyErase = useCallback((iso, d, r) => {
    clearCellPatch(iso, d, r);
  }, [clearCellPatch]);

  // Пипетка (хоткей I, как в Photoshop) - следующий клик по любой
  // закрашенной клетке берёт её "краску" (категория+подкатегория, или
  // просто цвет+текст для дела без категории) и сразу включает Заливку
  // с этой краской - без лишнего похода в панель категорий.
  const sampleAndActivateBrush = useCallback((iso, d, r) => {
    setEyedropperActive(false);
    const dayIntervals = ((weeksDataRef.current[iso] || {}).days || [])[d] || [];
    const val = readCellValue(dayIntervals, weekDayStart(iso) + r * weekCellMin(iso));
    if (!val.color) { showToast("Пустая клетка - нечего взять пипеткой"); return; }
    if (val.catId) {
      const cat = categories.find((c) => c.id === val.catId);
      if (cat) {
        const sub = val.subId ? cat.subs.find((s2) => s2.id === val.subId) : null;
        setActive({ catId: cat.id, subId: sub ? sub.id : null, label: sub ? `${cat.name} - ${sub.name}` : cat.name, color: cat.color });
      }
    } else {
      setManualColor(val.color);
      setActive({ catId: null, subId: null, label: val.text || "", color: val.color });
    }
    setMode("paint");
    showToast("Пипетка: краска взята, включена Заливка");
  }, [categories, showToast, weekCellMin, weekDayStart]);

  const handleCellDown = useCallback((iso, d, r) => {
    if (eyedropperActiveRef.current) { sampleAndActivateBrush(iso, d, r); return; }
    pendingMoveRef.current = null; // новое взаимодействие мышью отменяет незавершённый клавиатурный перенос (без записи)
    if (mode === "paint") {
      snapshot(iso);
      dragRef.current = { type: "paint", iso, col: d, startRow: r };
      applyPaint(iso, d, r, true);
    } else if (mode === "erase") {
      snapshot(iso);
      dragRef.current = { type: "erase", iso, col: d };
      applyErase(iso, d, r);
    } else if (mode === "select") {
      const sel = selRef.current;
      const inside = sel && sel.iso === iso && d >= sel.dMin && d <= sel.dMax && r >= sel.rMin && r <= sel.rMax;
      if (inside) {
        snapshot(iso);
        dragRef.current = { type: "move", iso, startD: d, startR: r, origSel: { ...sel }, lastD: d, lastR: r };
      } else {
        dragRef.current = { type: "select", iso, startD: d, startR: r };
        const next = { iso, dMin: d, dMax: d, rMin: r, rMax: r };
        selRef.current = next;
        setSelection(next);
      }
    }
  }, [mode, snapshot, applyPaint, applyErase, sampleAndActivateBrush]);

  // Перенос через границу недели: пока выделение перетаскивают, курсор
  // физически не может выйти за пределы 7 колонок текущей карточки-недели
  // (соседних дней там просто нет). Поэтому если задержаться на крайней
  // колонке (Пн слева или Вс справа), выделение продолжает "подталкиваться"
  // дальше в ту же сторону по таймеру - ровно как автопрокрутка к краю
  // экрана в других приложениях. Реальный перенос данных в другую неделю
  const recomputeMoveSelection = useCallback(() => {
    const ds = dragRef.current;
    if (!ds || ds.type !== "move") return;
    const dCol = ds.lastD - ds.startD;
    const dRow = ds.lastR - ds.startR;
    const o = ds.origSel;
    const w = o.dMax - o.dMin, h = o.rMax - o.rMin;
    // По вертикали (время суток) выход за пределы дня по-прежнему запрещён -
    // перенести дело на 3 часа ночи следующей недели, если сетка начинается
    // позже, всё равно было бы некуда. По горизонтали (дни) больше НЕ
    // ограничиваем 0..6 - именно это разрешает переносить через границу недели.
    const nd0 = o.dMin + dCol;
    const nr0 = clamp(o.rMin + dRow, 0, rowCountForWeek(o.iso) - 1 - h);
    const next = { iso: ds.iso, dMin: nd0, dMax: nd0 + w, rMin: nr0, rMax: nr0 + h };
    selRef.current = next;
    setSelection(next);
  }, [rowCountForWeek]);

  const handleCellEnter = useCallback((iso, d, r) => {
    const ds = dragRef.current;
    if (!ds || ds.iso !== iso) return;
    if (ds.type === "paint" && ds.col === d) applyPaint(iso, d, r, r === ds.startRow);
    else if (ds.type === "erase" && ds.col === d) applyErase(iso, d, r);
    else if (ds.type === "select") {
      const next = { iso, dMin: Math.min(ds.startD, d), dMax: Math.max(ds.startD, d), rMin: Math.min(ds.startR, r), rMax: Math.max(ds.startR, r) };
      selRef.current = next;
      setSelection(next);
    } else if (ds.type === "move") {
      ds.lastD = d; ds.lastR = r;
      recomputeMoveSelection();
    }
  }, [applyPaint, applyErase, recomputeMoveSelection]);

  const performMove = useCallback((o, dCol, dRow) => {
    if (dCol === 0 && dRow === 0) return;
    const sourceMonday = new Date(o.iso + "T00:00:00");
    const targetWeekSet = new Set([o.iso]);
    for (let d = o.dMin; d <= o.dMax; d++) {
      const targetDate = addDays(sourceMonday, d + dCol);
      targetWeekSet.add(toISO(getMonday(targetDate)));
    }

    (async () => {
      await Promise.all([...targetWeekSet].map((iso) => ensureLoadedData(iso)));
      const srcWk = weeksDataRef.current[o.iso] || { days: [[], [], [], [], [], [], []] };
      const sourceStep = weekCellMin(o.iso);
      const sourceDayStart = weekDayStart(o.iso);
      const moves = [];
      for (let d = o.dMin; d <= o.dMax; d++) {
        const dayIntervals = srcWk.days[d] || [];
        for (let r = o.rMin; r <= o.rMax; r++) {
          const sourceStart = sourceDayStart + r * sourceStep;
          const val = readCellValue(dayIntervals, sourceStart);
          if (!(val.text || val.color || val.task)) continue;
          const targetStart = sourceStart + dRow * sourceStep;
          const targetDate = addDays(sourceMonday, d + dCol);
          const targetIso = toISO(getMonday(targetDate));
          const targetDayStart = weekDayStart(targetIso);
          const targetDayEnd = weekDayEnd(targetIso);
          if (targetStart < targetDayStart || targetStart >= targetDayEnd) continue;
          const targetDayIdx = (targetDate.getDay() + 6) % 7;
          moves.push({
            fromD: d,
            fromR: r,
            toIso: targetIso,
            toD: targetDayIdx,
            toStartMin: targetStart,
            toEndMin: Math.min(targetDayEnd, targetStart + sourceStep),
            val,
          });
        }
      }
      if (moves.length === 0) return;
      const affectedIsos = [...new Set([o.iso, ...moves.map((m) => m.toIso)])];
      affectedIsos.forEach((iso) => snapshot(iso));

      // 1) очистить ВЕСЬ источник (прямоугольник целиком, включая пустые
      //    клетки внутри него - как и раньше: вся область, а не только
      //    непустые позиции).
      for (let d = o.dMin; d <= o.dMax; d++) {
        for (let r = o.rMin; r <= o.rMax; r++) clearCellPatch(o.iso, d, r);
      }
      // 2) записать в цель - категориям проставляем moved:true (как и
      //    раньше - "это дело когда-то перенесли", для трекера), для
      //    некатегоризированных клеток moved остаётся как было у источника.
      moves.forEach((m) => {
        const patch = {
          text: m.val.text, color: m.val.color, task: m.val.task, description: m.val.description,
          catId: m.val.catId, subId: m.val.subId, done: m.val.done,
          moved: m.val.catId ? true : m.val.moved,
        };
        applyLocalCellPatch(m.toIso, m.toD, m.toStartMin, m.toEndMin, patch);
        scheduleCellWrite(m.toIso, m.toD, m.toStartMin, m.toEndMin, patch);
      });

      affectedIsos.forEach((iso) => setMountedWeeks((prev) => ({ ...prev, [iso]: true })));
      maybeRefreshTracker();
      const primaryTargetIso = moves.length ? moves[moves.length - 1].toIso : o.iso;
      const crossedWeek = affectedIsos.length > 1 || affectedIsos[0] !== o.iso;
      if (crossedWeek) {
        // Перенос ушёл в другую неделю - переносим и рамку выделения туда
        // же (нормализуя её обратно в 0..6), чтобы было видно, куда именно
        // переехали клетки, плюс явный тост (переход между неделями не
        // так очевиден на глаз, как перенос внутри одной недели).
        const w = o.dMax - o.dMin;
        const wrappedD0 = ((o.dMin + dCol) % 7 + 7) % 7;
        const nd0 = Math.min(wrappedD0, 6 - Math.min(w, 6));
        const targetStep = weekCellMin(primaryTargetIso);
        const shiftedStart = sourceDayStart + o.rMin * sourceStep + dRow * sourceStep;
        const targetRow = Math.floor((shiftedStart - weekDayStart(primaryTargetIso)) / targetStep);
        const rowSpan = Math.ceil(((o.rMax - o.rMin + 1) * sourceStep) / targetStep);
        const nextRMin = clamp(targetRow, 0, rowCountForWeek(primaryTargetIso) - rowSpan);
        const nextSel = { iso: primaryTargetIso, dMin: nd0, dMax: nd0 + w, rMin: nextRMin, rMax: nextRMin + rowSpan - 1 };
        selRef.current = nextSel;
        setSelection(nextSel);
        const targetYear = new Date(primaryTargetIso + "T00:00:00").getFullYear();
        if (targetYear !== year) setYear(targetYear);
        showToast(dCol !== 0 || affectedIsos.length > 1 ? "Перенесено в другую неделю" : "Перенесено");
        requestAnimationFrame(() => requestAnimationFrame(() => {
          const el = weekRefs.current[primaryTargetIso];
          if (el) el.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }));
      }
    })();
  }, [weekCellMin, weekDayStart, weekDayEnd, rowCountForWeek, snapshot, ensureLoadedData, applyLocalCellPatch, scheduleCellWrite, clearCellPatch, maybeRefreshTracker, year, showToast]);

  useEffect(() => {
    function onUp() {
      const ds = dragRef.current;
      if (ds && ds.type === "move") {
        const finalSel = selRef.current;
        const o = ds.origSel;
        const dCol = finalSel.dMin - o.dMin, dRow = finalSel.rMin - o.rMin;
        performMove(o, dCol, dRow);
      }
      if (ds) maybeRefreshTracker();
      dragRef.current = null;
    }
    window.addEventListener("pointerup", onUp);
    return () => window.removeEventListener("pointerup", onUp);
  }, [maybeRefreshTracker, performMove]);

  // Клавиатурный перенос выделения (Shift+стрелки, режим "Выбор") - в
  // отличие от более раннего варианта, теперь НЕ пишет данные сразу на
  // каждое нажатие: Shift+стрелки только двигают РАМКУ выделения
  // (предпросмотр), а реальная запись (с переносом клеток и разрешением
  // накладываться на что-то существующее) происходит только по Enter.
  // Esc - отменить незавершённый перенос, вернуть рамку на место. Так
  // случайно наложенное на другое дело не стирает его исподтишка на
  // полпути - подтверждение обязательно.
  const pendingMoveRef = useRef(null); // { origSel, dCol, dRow } - накопленный, ещё не записанный сдвиг

  const previewMoveBy = useCallback((dCol, dRow) => {
    const sel = selRef.current;
    if (!sel || mode !== "select") return;
    const pending = pendingMoveRef.current;
    if (!pending) showToast("Enter - подтвердить перенос, Esc - отменить");
    const base = pending ? pending.origSel : sel;
    const prevDCol = pending ? pending.dCol : 0;
    const prevDRow = pending ? pending.dRow : 0;
    const w = base.dMax - base.dMin, h = base.rMax - base.rMin;
    const nr0 = clamp(base.rMin + prevDRow + dRow, 0, rowCountForWeek(base.iso) - 1 - h);
    const nextDRow = nr0 - base.rMin;
    const nextDCol = prevDCol + dCol;
    pendingMoveRef.current = { origSel: base, dCol: nextDCol, dRow: nextDRow };
    const wrappedD0 = ((base.dMin + nextDCol) % 7 + 7) % 7;
    const nd0 = Math.min(wrappedD0, 6 - Math.min(w, 6));
    const nextSel = { iso: base.iso, dMin: nd0, dMax: nd0 + w, rMin: base.rMin + nextDRow, rMax: base.rMax + nextDRow };
    selRef.current = nextSel;
    setSelection(nextSel);
  }, [mode, rowCountForWeek, showToast]);

  const cancelPendingMove = useCallback(() => {
    const pending = pendingMoveRef.current;
    if (!pending) return false;
    pendingMoveRef.current = null;
    selRef.current = pending.origSel;
    setSelection(pending.origSel);
    return true;
  }, []);

  // Этап 2: перенос прямоугольника выделения, возможно через несколько
  // недель. Нет отдельной bulk Rust-команды под это (как и для copy/paste) -
  // используем тот же setCellPatch/clearCellPatch по одной клетке, что и
  // paint/erase. Важен ПОРЯДОК: сначала читаем ВСЁ старое состояние целиком
  // (moves[]) - источник и цель могут перекрываться при сдвиге на 1 строку/
  // колонку - и только потом чистим источник и пишем цель. Если делать это
  // вперемешку, можно затереть ещё не прочитанный кусок выделения.
  // Этап 2: общее ядро переноса прямоугольника выделения - вызывается и из
  // клавиатурного commitPendingMove (Shift+стрелки → Enter), и из onUp ниже
  // (перенос мышью, перетаскиванием). Раньше это были два почти одинаковых
  // куска кода - вынес один раз, чтобы не чинить (и не держать синхронными
  // вручную) одну и ту же логику дважды. Порядок важен: сначала читаем ВСЁ
  // старое состояние целиком (moves[]) - источник и цель могут
  // перекрываться при сдвиге на 1 строку/колонку - и только потом чистим
  // источник и пишем цель.

  const commitPendingMove = useCallback(() => {
    const pending = pendingMoveRef.current;
    if (!pending) return false;
    pendingMoveRef.current = null;
    performMove(pending.origSel, pending.dCol, pending.dRow);
    return true;
  }, [performMove]);

  // Копирование/вставка выделения. В некоторых окружениях (например, в
  // системном WebView2 внутри pywebview-приложения) сочетания Ctrl+C/Ctrl+V
  // перехватываются самим окном и не доходят до страницы, поэтому основной
  // способ - кнопки «Копировать»/«Вставить». Дополнительно работает
  // сочетание Ctrl+Alt+C / Ctrl+Alt+V (обычно ничем не занято).
  const copySelection = useCallback(() => {
    const sel = selRef.current;
    if (!sel) return;
    const wk = weeksDataRef.current[sel.iso] || { days: [[], [], [], [], [], [], []] };
    const relCells = [];
    for (let d = sel.dMin; d <= sel.dMax; d++) {
      const dayIntervals = wk.days[d] || [];
      for (let r = sel.rMin; r <= sel.rMax; r++) {
        const val = readCellValue(dayIntervals, weekDayStart(sel.iso) + r * weekCellMin(sel.iso));
        if (val.text || val.color || val.task) relCells.push({ dc: d - sel.dMin, dr: r - sel.rMin, val });
      }
    }
    clipboardRef.current = relCells;
    setClipboardCount(relCells.length);
    showToast(relCells.length ? "Скопировано" : "Выделенные клетки пусты");
  }, [showToast, weekDayStart, weekCellMin]);

  const pasteSelection = useCallback(() => {
    const sel = selRef.current;
    if (!sel || !clipboardRef.current.length) return;
    snapshot(sel.iso);
    clipboardRef.current.forEach(({ dc, dr, val }) => {
      const d = sel.dMin + dc, r = sel.rMin + dr;
      if (d >= 0 && d <= 6 && r >= 0 && r < rowCountForWeek(sel.iso)) {
        setCellPatch(sel.iso, d, r, {
          text: val.text, color: val.color, task: val.task, description: val.description,
          catId: val.catId, subId: val.subId, done: val.done, moved: val.moved,
        });
      }
    });
    showToast("Вставлено");
  }, [snapshot, setCellPatch, showToast, weekCellMin, rowCountForWeek]);

  /* ---------- Прокрутка -----------------------------------------------
     Проблема: у каждой недели свой внутренний скролл (высокие недели не
     помещаются целиком), и колесо мыши над ним крутит именно эту неделю,
     а не всю страницу - чтобы добраться до соседней недели, приходится
     либо прокрутить эту до конца, либо специально уводить курсор в
     узкий зазор между карточками. Решения:
       - автопрокрутка ТОЛЬКО по наведению на саму стрелочку-квадратик
         сверху/снизу окна (появляется, только когда там правда есть
         куда крутить) - раньше срабатывало от наведения в любую точку
         у края целиком, из-за чего задевало случайно (например, при
         переносе дела к крайнему дню недели) - теперь только сам
         квадратик, за пределами него - ничего;
       - двойной клик по той же стрелочке - "запирает" автопрокрутку,
         чтобы она продолжалась и без удержания курсора (удобно на
         тачпаде) - до повторного двойного клика, обычного клика куда
         угодно или Escape;
       - зажатый Space (как в Figma/Photoshop) - на время удержания
         колесо мыши крутит только страницу целиком, что бы ни было под
         курсором - недельные карточки временно "не перехватывают" скролл;
       - Shift+колесо - штатная горизонтальная прокрутка браузера, тут
         ничего специально не переопределялось;
       - стрелки/PageUp/PageDown - хоткеи ниже, в общем обработчике
         keydown (там же остальные хоткеи инструментов);
       - режим "по неделям" (Q) - см. отдельный блок ниже.
     ---------------------------------------------------------------- */
  useEffect(() => {
    function update() {
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
      setCanScrollUp(window.scrollY > 4);
      setCanScrollDown(window.scrollY < maxScroll - 4);
    }
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    // Недели подгружаются лениво по мере прокрутки - scrollHeight может
    // вырасти сам по себе, без scroll-события, поэтому подстраховываемся
    // редким опросом, а не только событиями.
    const id = setInterval(update, 1000);
    return () => { window.removeEventListener("scroll", update); window.removeEventListener("resize", update); clearInterval(id); };
  }, []);

  const stepAutoscroll = useCallback(() => {
    const dir = lockedScrollDirRef.current || manualHoverDirRef.current;
    if (!dir) { autoscrollRafRef.current = null; return; }
    const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    if ((dir === "up" && window.scrollY <= 0) || (dir === "down" && window.scrollY >= maxScroll - 1)) {
      if (lockedScrollDirRef.current) setLockedScrollDir(null);
      manualHoverDirRef.current = null;
      autoscrollRafRef.current = null;
      return;
    }
    window.scrollBy(0, dir === "up" ? -16 : 16);
    autoscrollRafRef.current = requestAnimationFrame(stepAutoscroll);
  }, []);

  const ensureAutoscrollLoop = useCallback(() => {
    if (autoscrollRafRef.current == null) autoscrollRafRef.current = requestAnimationFrame(stepAutoscroll);
  }, [stepAutoscroll]);

  const cancelLockTimerRef = useRef(null);
  useEffect(() => {
    // Одиночный клик выключает "запертую" автопрокрутку - но клик сюда
    // приходит и как часть двойного клика по стрелочке (click, click,
    // dblclick), а тот, наоборот, может ВКЛЮЧАТЬ прокрутку. Поэтому
    // решение откладывается: если следом придёт dblclick по стрелочке,
    // он сам отменит этот таймер (см. onScrollSquareDblClick ниже).
    function onClickAnywhere() {
      if (!lockedScrollDirRef.current) return;
      if (cancelLockTimerRef.current) clearTimeout(cancelLockTimerRef.current);
      cancelLockTimerRef.current = setTimeout(() => {
        cancelLockTimerRef.current = null;
        if (lockedScrollDirRef.current) setLockedScrollDir(null);
      }, 280);
    }
    window.addEventListener("click", onClickAnywhere);
    return () => {
      window.removeEventListener("click", onClickAnywhere);
      if (cancelLockTimerRef.current) clearTimeout(cancelLockTimerRef.current);
      if (autoscrollRafRef.current != null) { cancelAnimationFrame(autoscrollRafRef.current); autoscrollRafRef.current = null; }
    };
  }, []);

  function onScrollSquareEnter(dir) {
    manualHoverDirRef.current = dir;
    ensureAutoscrollLoop();
  }
  function onScrollSquareLeave(dir) {
    if (manualHoverDirRef.current === dir) manualHoverDirRef.current = null;
  }
  function onScrollSquareDblClick(dir) {
    if (cancelLockTimerRef.current) { clearTimeout(cancelLockTimerRef.current); cancelLockTimerRef.current = null; }
    setLockedScrollDir((d) => (d === dir ? null : dir));
    requestAnimationFrame(ensureAutoscrollLoop);
  }

  // Зажатый Space - блокируем обычную прокрутку недель, колесо крутит
  // только всё окно (см. wheel-перехватчик ниже).
  const spaceScrollLockRef = useRef(false);
  useEffect(() => { spaceScrollLockRef.current = spaceScrollLock; }, [spaceScrollLock]);
  useEffect(() => {
    function isTypingTarget(el) {
      if (!el) return false;
      const tag = el.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
    }
    function onSpaceDown(e) {
      if (e.code !== "Space" || isTypingTarget(document.activeElement)) return;
      e.preventDefault(); // и от прокрутки браузера "по умолчанию", и от клика по кнопке в фокусе
      if (!e.repeat) setSpaceScrollLock(true);
    }
    function onSpaceUp(e) {
      if (e.code === "Space") setSpaceScrollLock(false);
    }
    window.addEventListener("keydown", onSpaceDown);
    window.addEventListener("keyup", onSpaceUp);
    window.addEventListener("blur", onSpaceUp);
    return () => {
      window.removeEventListener("keydown", onSpaceDown);
      window.removeEventListener("keyup", onSpaceUp);
      window.removeEventListener("blur", onSpaceUp);
    };
  }, []);
  useEffect(() => {
    function onWheel(e) {
      if (weekSnapLockRef.current || !spaceScrollLockRef.current) return;
      e.preventDefault();
      window.scrollBy(0, e.deltaY);
    }
    window.addEventListener("wheel", onWheel, { passive: false, capture: true });
    return () => window.removeEventListener("wheel", onWheel, { capture: true });
  }, []);

  // Зажатый Alt - показываем бейджи-подсказки с буквами/цифрами прямо над
  // рельсом инструментов и панелью режимов (как KeyTips в Excel: зажал -
  // увидел, куда жать; отпустил - подсказки исчезли). Сама буква, которая
  // сработает при нажатии - это ровно тот же хоткей, что уже описан в
  // switch ниже, тут только его отображение.
  useEffect(() => {
    function isTypingTarget(el) {
      if (!el) return false;
      const tag = el.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
    }
    function onAltDown(e) {
      if (e.key !== "Alt" || isTypingTarget(document.activeElement)) return;
      e.preventDefault();
      if (!e.repeat) setKeyTipsVisible(true);
    }
    function onAltUp(e) {
      if (e.key === "Alt") setKeyTipsVisible(false);
    }
    window.addEventListener("keydown", onAltDown);
    window.addEventListener("keyup", onAltUp);
    window.addEventListener("blur", onAltUp);
    return () => {
      window.removeEventListener("keydown", onAltDown);
      window.removeEventListener("keyup", onAltUp);
      window.removeEventListener("blur", onAltUp);
    };
  }, []);
  function keyTip(letter) {
    return keyTipsVisible ? <span className="keytip-badge">{letter}</span> : null;
  }

  // Режим "прокрутка по неделям" (Q) - колесо мыши не крутит пиксель за
  // пикселем, а перелистывает целыми карточками недель, как страницы.
  // Полезно, когда просто листаешь недели вперёд/назад и не хочется
  // застревать во внутренней прокрутке высокой недели.
  function snapToAdjacentWeek(dir) {
    const isos = yearList.map((m) => toISO(m));
    let currentIdx = 0;
    for (let i = 0; i < isos.length; i++) {
      const el = weekRefs.current[isos[i]];
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      if (rect.top <= 80) currentIdx = i; else break;
    }
    const targetIdx = clamp(currentIdx + dir, 0, isos.length - 1);
    const targetIso = isos[targetIdx];
    const el = weekRefs.current[targetIso];
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    // неделя ещё не смонтирована (виртуализация списка) - подгружаем и
    // прокручиваем к ней на следующем кадре
    ensureLoadedData(targetIso).then(() => {
      setMountedWeeks((prev) => ({ ...prev, [targetIso]: true }));
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const el2 = weekRefs.current[targetIso];
        if (el2) el2.scrollIntoView({ behavior: "smooth", block: "start" });
      }));
    });
  }

  useEffect(() => {
    function onWheel(e) {
      if (!weekSnapLockRef.current) return;
      e.preventDefault();
      if (snapCooldownRef.current) return;
      snapCooldownRef.current = true;
      snapToAdjacentWeek(e.deltaY > 0 ? 1 : -1);
      setTimeout(() => { snapCooldownRef.current = false; }, 450);
    }
    window.addEventListener("wheel", onWheel, { passive: false, capture: true });
    return () => window.removeEventListener("wheel", onWheel, { capture: true });
  }, [yearList, ensureLoadedData]);

  /* ---------- Scheduled native reminders ------------------------------ */
  useEffect(() => {
    if (!settings.notificationsEnabled) return;
    let active = true;
    let checking = false;
    async function checkDue() {
      if (checking) return;
      checking = true;
      try {
        if (!(await isPermissionGranted())) return;
        if (!active) return;
        const now = new Date();
        const todayIso = toISO(now);
        const dayIdx = (now.getDay() + 6) % 7;
        const nowMin = now.getHours() * 60 + now.getMinutes();
        const lead = settingsRef.current.notifyLeadMin || 10;
        const weekIso = toISO(getMonday(now));

        await ensureLoadedData(weekIso);
        if (!active) return;
        const week = weeksDataRef.current[weekIso];
        const dayIntervals = week?.days?.[dayIdx] || [];
        for (const event of buildAgendaEventsFromIntervals(dayIntervals)) {
          if (!active) return;
          const minutesUntilStart = event.start - nowMin;
          if (minutesUntilStart < 0 || minutesUntilStart > lead) continue;
          const key = `${todayIso}_${dayIdx}_${event.start}`;
          if (notifiedKeysRef.current.has(key)) continue;
          try {
            await sendNotification({
              title: event.text || t("Событие в ежедневнике", language),
              body: `${minToTime(event.start)}-${minToTime(event.end)}${event.task ? ` · ${event.task}` : ""}`,
            });
            notifiedKeysRef.current.add(key);
          } catch (error) {
            console.error("Could not send a timed reminder", error);
          }
        }

        if (!active || !allDayEventsLoadedRef.current || lastAllDayNotifyDateRef.current === todayIso) return;
        if (!allDayNotifiedInSessionRef.current.has(todayIso)) {
          const todaysEvents = allDayEventsRef.current.filter((event) => event.startIso <= todayIso && event.endIso >= todayIso);
          if (todaysEvents.length) {
            await sendNotification({
              title: t("Сегодня в ежедневнике", language),
              body: todaysEvents.map((event) => event.text).join(", "),
            });
            allDayNotifiedInSessionRef.current.add(todayIso);
            try {
              await updateSettingsRemote({ lastAllDayNotifyDate: todayIso });
              lastAllDayNotifyDateRef.current = todayIso;
            } catch (error) {
              console.error("Could not persist the all-day reminder date", error);
            }
          }
        }
      } catch (error) {
        console.error("Notification scheduler failed", error);
      } finally {
        checking = false;
      }
    }

    checkDue();
    const id = setInterval(checkDue, 30000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [language, settings.notificationsEnabled, settings.notifyLeadMin, settings.dayStart, settings.dayEnd, ensureLoadedData]);


  useEffect(() => {
    // Сочетания проверяются по e.code (физическая клавиша на клавиатуре),
    // а не по e.key (символ раскладки) - иначе на русской раскладке
    // Ctrl+C/Ctrl+V не срабатывают, так как e.key там даёт "с"/"м", а не "c"/"v".
    // Все горячие клавиши ниже (переключение инструментов и панелей дока)
    // построены точно так же - по коду физической клавиши, поэтому
    // одинаково работают что на русской, что на английской раскладке.
    function isTypingTarget(el) {
      if (!el) return false;
      const tag = el.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
    }
    function toggleDock(name) {
      setActiveDockPanel((p) => (p === name ? null : name));
    }
    function onKey(e) {
      const code = e.code; // "KeyC", "KeyV", "KeyZ" - не зависит от раскладки
      const mod = e.ctrlKey || e.metaKey;
      if (mod && code === "KeyZ" && mode !== "text") { e.preventDefault(); undo(); return; }
      if (mod && code === "KeyK") { e.preventDefault(); setCommandPaletteOpen((v) => !v); return; }
      if (e.key === "Escape" && lockedScrollDirRef.current) { setLockedScrollDir(null); return; }
      if (e.key === "Escape" && activeDockPanel === "clearRange" && !clearRangeBusy) { setActiveDockPanel(null); return; }
      if (e.key === "Escape" && weekSnapLockRef.current) { setWeekSnapLock(false); return; }
      if (e.key === "Escape" && pendingMoveRef.current) { cancelPendingMove(); return; }
      if (e.key === "Escape" && eyedropperActiveRef.current) { setEyedropperActive(false); return; }
      if (e.key === "Escape" && selRef.current) { setSelection(null); selRef.current = null; return; }
      if (e.key === "Escape" && fullscreenWeekIso) { setFullscreenWeekIso(null); return; }
      if (e.key === "Enter" && pendingMoveRef.current && !isTypingTarget(document.activeElement)) { e.preventDefault(); commitPendingMove(); return; }
      if (mode === "select" && selRef.current) {
        const altCombo = mod && e.altKey;
        if ((mod && code === "KeyC") || (altCombo && code === "KeyC")) { e.preventDefault(); copySelection(); return; }
        if (((mod && code === "KeyV") || (altCombo && code === "KeyV")) && clipboardRef.current.length) { e.preventDefault(); pasteSelection(); return; }
      }
      // Shift+стрелки в режиме "Выбор" - подвинуть РАМКУ выделения на один
      // шаг, без записи (см. previewMoveBy) - запись произойдёт только по
      // Enter (commitPendingMove) или отменится по Esc (cancelPendingMove).
      // Проверяется раньше обычных стрелок, чтобы не конфликтовать с
      // прокруткой окна на голых стрелках.
      if (e.shiftKey && !mod && !e.altKey && mode === "select" && selRef.current && !isTypingTarget(document.activeElement)) {
        if (code === "ArrowDown") { e.preventDefault(); previewMoveBy(0, 1); return; }
        if (code === "ArrowUp") { e.preventDefault(); previewMoveBy(0, -1); return; }
        if (code === "ArrowLeft") { e.preventDefault(); previewMoveBy(-1, 0); return; }
        if (code === "ArrowRight") { e.preventDefault(); previewMoveBy(1, 0); return; }
      }
      // Прокрутка стрелками/PageUp/PageDown - работает независимо от
      // общего "однокнопочного" блока ниже, поэтому проверяется раньше
      // и с собственной обработкой модификаторов: Ctrl+стрелка крутит
      // ту неделю, в которую последней заходил курсор (hoveredWeekIsoRef),
      // а стрелка без Ctrl и PageUp/PageDown - всё окно.
      if (!isTypingTarget(document.activeElement) && !e.altKey && !e.shiftKey) {
        if (code === "ArrowDown" || code === "ArrowUp") {
          const dirSign = code === "ArrowDown" ? 1 : -1;
          if (mod) {
            const targetIso = hoveredWeekIsoRef.current;
            const wrap = targetIso && weekRefs.current[targetIso];
            const scrollEl = wrap && wrap.querySelector && wrap.querySelector(".week-grid-scroll");
            if (scrollEl) { e.preventDefault(); scrollEl.scrollBy({ top: dirSign * 140, behavior: "smooth" }); }
          } else {
            e.preventDefault();
            window.scrollBy({ top: dirSign * 90, behavior: "smooth" });
          }
          return;
        }
        if (code === "PageDown" || code === "PageUp") {
          e.preventDefault();
          const dirSign = code === "PageDown" ? 1 : -1;
          window.scrollBy({ top: dirSign * Math.round(window.innerHeight * 0.9), behavior: "smooth" });
          return;
        }
      }
      // Alt+Y / Alt+M - перейти фокусом к выбору года/месяца (единственные
      // хоткеи в приложении именно с Alt - не конфликтуют с обычными
      // однобуквенными, те без модификатора вообще).
      if (e.altKey && !mod && !e.shiftKey) {
        const select = code === "KeyY" ? yearSelectRef.current : code === "KeyM" ? monthSelectRef.current : null;
        if (select) {
          e.preventDefault();
          if (document.activeElement === select) {
            select.blur();
            return;
          }
          select.focus();
          try {
            if (typeof select.showPicker === "function") select.showPicker();
            else select.click();
          } catch (error) {
            console.error("Could not open the year/month selector", error);
          }
          return;
        }
      }
      // Дальше - однокнопочные хоткеи инструментов и панелей дока. Не
      // срабатывают, если модификаторы зажаты (чтобы не мешать обычным
      // сочетаниям браузера/ОС) или если сейчас печатают в поле ввода
      // (клетка, поиск, форма) - иначе, например, буква "т" при наборе
      // текста задачи переключала бы режим "Текст".
      if (mod || e.altKey || e.shiftKey) return;
      if (isTypingTarget(document.activeElement)) return;
      switch (code) {
        case "Digit1": setMode("text"); break;
        case "Digit2": setMode("paint"); break;
        case "Digit3": setMode("erase"); break;
        case "Digit4": setMode("select"); break;
        case "KeyC": toggleDock("categories"); break;
        case "KeyL": toggleDock("todo"); break;
        case "KeyD": toggleDock("agenda"); break;
        case "KeyT": toggleDock("tracker"); break;
        case "KeyM": toggleDock("templates"); break;
        case "KeyP": toggleDock("recurring"); break;
        case "KeyX": toggleDock("script"); break;
        case "KeyG": toggleDock("glossary"); break;
        case "KeyS": toggleDock("settings"); break;
        case "KeyF": toggleDock("search"); break;
        case "KeyE": activeDockPanel === "clearRange" ? setActiveDockPanel(null) : openClearRangeDialog(); break;
        case "KeyQ": setWeekSnapLock((v) => !v); break;
        case "KeyI": setEyedropperActive((v) => !v); break;
        case "Home": goToCurrentWeek(); break;
        case "BracketRight": jumpToRelativeWeek(1); break;
        case "BracketLeft": jumpToRelativeWeek(-1); break;
        case "Equal": case "NumpadAdd": zoomBy(1); break;
        case "Minus": case "NumpadSubtract": zoomBy(-1); break;
        default: break;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, undo, copySelection, pasteSelection, goToCurrentWeek, zoomBy, previewMoveBy, commitPendingMove, cancelPendingMove, jumpToRelativeWeek, fullscreenWeekIso, activeDockPanel, clearRangeBusy, openClearRangeDialog]);

  function updateSettings(patch) {
    const prev = settingsRef.current;
    const next = { ...prev, ...patch };
    if ("dayStart" in patch) next.dayStart = clamp(snap5(next.dayStart), 0, 1435);
    if ("dayEnd" in patch) next.dayEnd = next.dayEnd === 1440 ? 1440 : clamp(snap5(next.dayEnd), 5, 1440);
    if (next.dayStart >= next.dayEnd) {
      showToast("Начало дня должно быть раньше конца");
      return;
    }
    const invalidWeek = Object.entries(weeksDataRef.current).find(([, week]) =>
      (week.dayStart ?? next.dayStart) >= (week.dayEnd ?? next.dayEnd),
    );
    if (invalidWeek) {
      showToast(`Изменение нарушит границы недели ${invalidWeek[0]}; сначала скорректируйте её часы`);
      return;
    }
    // settingsRef обновляем сразу и синхронно - остальной код (обработчики
    // кликов по клеткам и т.п.) читает именно его, ему без разницы,
    // когда именно перерисуется сама сетка.
    settingsRef.current = next;
    // В Rust уходят уже ОТКЛЭМПЛЕННЫЕ значения (не сырой patch) - иначе
    // сервер хранил бы нескорректированный dayStart/dayEnd, а локальный
    // state - скорректированный, и они бы разошлись.
    const remotePatch = { ...patch };
    if ("dayStart" in patch) remotePatch.dayStart = next.dayStart;
    if ("dayEnd" in patch) remotePatch.dayEnd = next.dayEnd;
    updateSettingsRemote(remotePatch).catch((error) => {
      console.error("Could not save global settings", error);
      showToast(`Не удалось сохранить настройки: ${error instanceof Error ? error.message : String(error)}`);
    });
    startSettingsTransition(() => { setSettings(next); });
  }

  function zoomBy(dir) {
    const curKey = viewMode === "weeks" ? (settings.zoom || 1) : viewMode;
    const idx = VIEW_ZOOM_STEPS.indexOf(curKey);
    const curIdx = idx === -1 ? VIEW_ZOOM_STEPS.indexOf(1) : idx;
    const nextIdx = clamp(curIdx + dir, 0, VIEW_ZOOM_STEPS.length - 1);
    const next = VIEW_ZOOM_STEPS[nextIdx];
    if (next === "years" || next === "months" || next === "weekTiles") {
      setViewMode(next);
    } else {
      setViewMode("weeks");
      updateSettings({ zoom: next });
    }
  }

  async function jumpToDate(date) {
    const targetYear = date.getFullYear();
    const monday = getMonday(date);
    const iso = toISO(monday);
    // Запоминаем, куда именно прыгнули, тем же рефом, что использует
    // наведение мыши (hoveredWeekIsoRef) - иначе повторные [ / ] считали бы
    // каждый раз от той недели, где мышь физически стоит на экране (а после
    // скролла курсор туда не переезжает сам), и дальше одной недели уйти
    // было нельзя. Теперь второе, третье, ...-е нажатие продолжает от
    // предыдущего прыжка, а не от исходной позиции курсора.
    hoveredWeekIsoRef.current = iso;
    if (targetYear !== year) setYear(targetYear);
    await ensureLoadedData(iso);
    setMountedWeeks((prev) => ({ ...prev, [iso]: true }));
    const dayIdx = (date.getDay() + 6) % 7;
    setDayHighlight({ iso, d: dayIdx });
    setTimeout(() => setDayHighlight(null), 2600);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const el = weekRefs.current[iso];
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }));
    showToast(`Перешли к ${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}`);
  }

  // След./пред. неделя - от той недели, куда последней заходил курсор ИЛИ
  // куда последний раз прыгнули (jumpToDate сам обновляет тот же реф - см.
  // там) - или от текущей реальной недели, если ничего из этого ещё не было.
  // Благодаря этому несколько подряд [ / ] продолжают друг друга, а не
  // прыгают каждый раз на одну и ту же следующую неделю от старой позиции.
  function jumpToRelativeWeek(deltaWeeks) {
    const baseIso = hoveredWeekIsoRef.current || isoCur;
    const baseMonday = new Date(baseIso + "T00:00:00");
    jumpToDate(addDays(baseMonday, deltaWeeks * 7));
  }

  // Завести новый год - добавляет его в список "заведённых" (createdYears,
  // персистится под ключом "years") и сразу переключается на него. Просто
  // открыть произвольный год без него теперь нельзя - см. YearsGrid/select
  // ниже, они показывают только этот список + опцию "Завести год".
  function addYear(rawInput) {
    const num = Math.trunc(Number(rawInput));
    if (!Number.isFinite(num) || String(rawInput).trim() === "") {
      showToast("Введите год числом, например 2027");
      return;
    }
    if (num < 1 || num > 9999) {
      showToast("Год вне разумного диапазона (1-9999)");
      return;
    }
    setCreateYearModalOpen(false);
    setCreateYearInput("");
    if (createdYears.includes(num)) {
      setYear(num);
      return;
    }
    setCreatedYears((prev) => [...prev, num].sort((a, b) => a - b));
    addCreatedYear(num).catch(() => {});
    setYear(num);
    showToast(`Год ${num} заведён`);
  }

  // Быстрый переход к первой неделе месяца (используется селектором месяца
  // в шапке и кликом по плитке месяца в уменьшенном масштабе).
  async function jumpToMonth(monthIdx, targetYear) {
    if (targetYear && targetYear !== year) { setYear(targetYear); }
    const list = targetYear && targetYear !== year ? weeksOfYear(targetYear) : yearList;
    const target = list.find((m) => m.getMonth() === monthIdx);
    if (!target) return;
    const iso = toISO(target);
    await ensureLoadedData(iso);
    setMountedWeeks((prev) => ({ ...prev, [iso]: true }));
    setViewMode("weeks");
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const el = weekRefs.current[iso];
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }));
  }

  async function runTextSearch() {
    const raw = searchQuery.trim();
    if (!raw) return;
    const parsedDate = parseDateQuery(raw);
    if (parsedDate) {
      setSearchResults(null);
      await jumpToDate(parsedDate);
      return;
    }
    const q = raw.toLowerCase();
    setSearching(true);
    try {
      await ensureLoadedWeeks(yearList.map(toISO));
      const results = [];
      const seen = new Set();
      yearList.forEach((m) => {
        const iso = toISO(m);
        const wk = weeksDataRef.current[iso];
        if (!wk) return;
        const step = weekCellMin(iso);
        (wk.days || []).forEach((dayIntervals, day) => {
          dayIntervals.forEach((val) => {
            const textMatch = val.text && val.text.toLowerCase().includes(q);
            const taskMatch = val.task && val.task.toLowerCase().includes(q);
            if (!textMatch && !taskMatch) return;
            const r = Math.floor((val.startMin - weekDayStart(iso)) / step);
            const dedupKey = `${iso}|${day}|${r}`;
            if (seen.has(dedupKey)) return;
            seen.add(dedupKey);
            results.push({ iso, monday: m, d: day, r, text: val.task ? `${val.text} - ${val.task}` : val.text });
          });
        });
      });
      setSearchResults(results);
    } catch (error) {
      console.error("Could not load weeks for text search", error);
      showToast(`Не удалось загрузить недели для поиска: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setSearching(false);
    }
  }

  function goToResult(res) {
    setMountedWeeks((prev) => ({ ...prev, [res.iso]: true }));
    setHighlight({ iso: res.iso, d: res.d, r: res.r });
    setTimeout(() => setHighlight(null), 2200);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const el = weekRefs.current[res.iso];
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }));
  }

  async function exportData() {
    setBusyIO(true);
    try {
      const backup = await exportDatabaseBackup();
      const content = typeof backup === "string" ? backup : JSON.stringify(backup, null, 2);
      const filename = getLanguage() === "en" ? "fmn-backup.json" : "незабудка-резервная-копия.json";
      if (await saveJsonFile(filename, content)) showToast(t("Резервная копия сохранена"));
    } catch (error) {
      console.error("Could not export database backup", error);
      showToast(t("Не удалось экспортировать резервную копию"));
    } finally {
      setBusyIO(false);
    }
  }

  async function importData(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (!window.confirm(t("Импортировать резервную копию? Текущие данные будут заменены."))) {
      e.target.value = "";
      return;
    }
    let imported = false;
    setBusyIO(true);
    try {
      const payload = JSON.parse(await file.text());
      await importDatabaseBackup(payload);
      imported = true;
      showToast(t("Данные импортированы"));
    } catch (error) {
      console.error("Could not import database backup", error);
      showToast(t("Не удалось импортировать резервную копию"));
    } finally {
      setBusyIO(false);
      e.target.value = "";
    }
    if (imported) window.location.reload();
  }

  async function exportAllReflections() {
    setBusyIO(true);
    try {
      await flushReflectionSave();
      const language = getLanguage();
      const markdown = await exportAllReflectionsMarkdown(language);
      const filename = language === "en" ? "all-reflections.md" : "все-рефлексии.md";
      if (await saveTextFile(filename, markdown)) showToast(t("Экспорт рефлексий сохранён"));
    } catch (error) {
      console.error("Could not export reflections", error);
      showToast(t("Не удалось экспортировать рефлексии"));
    } finally {
      setBusyIO(false);
    }
  }

  /* ---------- Экспорт/импорт .ics (стандартный формат календаря) -----
     Для экспорта переиспользуем buildAgendaEvents (определена ниже) -
     он и так умеет собирать блок закрашенных клеток в одно "событие"
     с началом/концом, а не по одной клетке. ---------- */
  function icsPad2(n) { return String(n).padStart(2, "0"); }
  function icsFmtDT(date, minutes) {
    const h = Math.floor(minutes / 60), m = minutes % 60;
    return `${date.getFullYear()}${icsPad2(date.getMonth() + 1)}${icsPad2(date.getDate())}T${icsPad2(h)}${icsPad2(m)}00`;
  }
  function icsEscape(s) {
    return String(s || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
  }
  function icsUnescape(s) {
    return String(s || "").replace(/\\n/g, "\n").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\");
  }
  function parseICSDate(raw) {
    const m = String(raw || "").match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2}))?/);
    if (!m) return null;
    const [, Y, Mo, D, H, Mi] = m;
    if (H === undefined) return null; // событие "весь день" - формат клеток пока такого не поддерживает
    return { date: new Date(Number(Y), Number(Mo) - 1, Number(D)), minutes: Number(H) * 60 + Number(Mi) };
  }
  function parseICS(text) {
    const rawLines = text.split(/\r\n|\n|\r/);
    const lines = [];
    rawLines.forEach((l) => {
      if ((l.startsWith(" ") || l.startsWith("\t")) && lines.length) lines[lines.length - 1] += l.slice(1);
      else lines.push(l);
    });
    const events = [];
    let cur = null;
    lines.forEach((line) => {
      if (line === "BEGIN:VEVENT") { cur = {}; return; }
      if (line === "END:VEVENT") { if (cur) events.push(cur); cur = null; return; }
      if (!cur) return;
      const idx = line.indexOf(":");
      if (idx === -1) return;
      const key = line.slice(0, idx).split(";")[0].toUpperCase();
      const value = line.slice(idx + 1);
      if (key === "SUMMARY") cur.summary = icsUnescape(value);
      else if (key === "LOCATION") cur.location = icsUnescape(value);
      else if (key === "DTSTART") cur.dtstart = value;
      else if (key === "DTEND") cur.dtend = value;
    });
    return events;
  }

  async function exportICS() {
    setBusyIO(true);
    try {
      await ensureLoadedWeeks(yearList.map(toISO));
      const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Ezhednevnik//RU", "CALSCALE:GREGORIAN"];
      let count = 0;
      yearList.forEach((monday) => {
        const iso = toISO(monday);
        const wk = weeksDataRef.current[iso];
        if (!wk) return;
        for (let d = 0; d < 7; d++) {
          const dayDate = addDays(monday, d);
          buildAgendaEvents(wk.days, d).forEach((ev) => {
            const cat = ev.catId ? categories.find((c) => c.id === ev.catId) : null;
            const sub = cat && ev.subId ? cat.subs.find((s) => s.id === ev.subId) : null;
            const summary = ev.text || (cat && sub ? `${cat.name} - ${sub.name}` : cat ? cat.name : "Событие");
            lines.push("BEGIN:VEVENT");
            lines.push(`UID:${uid()}-${dayDate.getTime()}-${ev.start}@ezhednevnik`);
            lines.push(`DTSTAMP:${icsFmtDT(new Date(), 0)}Z`);
            lines.push(`DTSTART:${icsFmtDT(dayDate, ev.start)}`);
            lines.push(`DTEND:${icsFmtDT(dayDate, ev.end)}`);
            lines.push(`SUMMARY:${icsEscape(summary)}`);
            if (ev.task) lines.push(`LOCATION:${icsEscape(ev.task)}`);
            lines.push("END:VEVENT");
            count++;
          });
        }
      });
      lines.push("END:VCALENDAR");
      const blob = new Blob([lines.join("\r\n")], { type: "text/calendar;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `ежедневник-${year}.ics`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast(count ? `Экспортировано событий: ${count}` : "Нет событий для экспорта в этом году");
    } catch (error) {
      console.error("Could not load weeks for calendar export", error);
      showToast(`Не удалось экспортировать календарь: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusyIO(false);
    }
  }

  function importICS(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      let imported = 0;
      let skipped = 0;
      try {
        const events = parseICS(String(reader.result));
        setBusyIO(true);
        const touchedIso = new Set();
        const snapshottedIso = new Set();
        for (const ev of events) {
          const start = parseICSDate(ev.dtstart);
          if (!start) { skipped++; continue; } // событие "весь день" или не распозналось
          let eventEndMin = start.minutes + 30;
          const end = ev.dtend ? parseICSDate(ev.dtend) : null;
          if (end && toISO(end.date) === toISO(start.date)) eventEndMin = end.minutes;
          if (eventEndMin <= start.minutes) eventEndMin = start.minutes + BASE_UNIT;
          const monday = getMonday(start.date);
          const iso = toISO(monday);
          const dayIdx = (start.date.getDay() + 6) % 7;
          // eslint-disable-next-line no-await-in-loop
          await ensureLoadedData(iso);
          const startMin = Math.max(snap5(start.minutes), Math.ceil(weekDayStart(iso) / BASE_UNIT) * BASE_UNIT);
          const endMin = Math.min(snap5(eventEndMin), Math.floor(weekDayEnd(iso) / BASE_UNIT) * BASE_UNIT);
          if (endMin <= startMin) { skipped++; continue; }
          touchedIso.add(iso);
          if (!snapshottedIso.has(iso)) {
            snapshot(iso);
            snapshottedIso.add(iso);
          }
          const date = toISO(start.date);
          const patch = {
            text: ev.summary || "Импорт",
            color: "#3B5AA6",
            task: ev.location || "",
            catId: null,
            subId: null,
            done: false,
            moved: false,
          };
          applyLocalCellPatch(iso, dayIdx, startMin, endMin, patch);
          scheduleCellWrite(iso, dayIdx, startMin, endMin, patch);
          imported++;
        }
        await Promise.all([...touchedIso].map(flushPendingWeekWrites));
        setMountedWeeks((prev) => { const p = { ...prev }; touchedIso.forEach((iso2) => { p[iso2] = true; }); return p; });
        maybeRefreshTracker();
        setBusyIO(false);
        showToast(`Импортировано событий: ${imported}${skipped ? `, пропущено без времени: ${skipped}` : ""}`);
      } catch (error) {
        setBusyIO(false);
        showToast(`Не удалось импортировать .ics файл: ${error instanceof Error ? error.message : String(error)}`);
      }
    };
    reader.onerror = () => {
      setBusyIO(false);
      showToast("Не удалось прочитать .ics файл");
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  /* ---------- Трекер: подсчёт по дням/месяцам/категориям ----------
     Три независимых счётчика на (категория, день):
       - planned - в этот день есть хотя бы одна клетка этой категории
       - moved   - среди них есть хотя бы одна, которую переносили мышью
       - done    - среди них есть хотя бы одна, отмеченная галочкой
     Дедупликация по дню (а не по отдельной 5-минутной ячейке) сохранена
     из исходной версии - трекер считает "было ли это в этот день", а не
     сумму по всем крошечным ячейкам одного и того же блока времени. */
  // Этап 2: SQL-агрегат (tracker_stats_by_month, GROUP BY cat_id/date/
  // sub_id - та же "уникальная единица = категория+дата+подкатегория",
  // что была в plannedSet/movedSet/doneSet) вместо загрузки всех 52 недель
  // года в JS и обхода их построчно. Категории без единого интервала в
  // этом году Rust не вернёт вообще - достраиваем для них нулевые строки
  // здесь же, чтобы в таблице трекера они всё равно были видны как "0".
  async function refreshTracker() {
    setTrackerLoading(true);
    const rows = await fetchTrackerStatsByMonth(year);
    const byCat = Object.fromEntries(rows.map((r) => [r.catId, r]));
    const sum = (arr) => arr.reduce((a, b) => a + b, 0);
    const stats = categories.map((cat) => {
      const r = byCat[cat.id];
      const plannedCounts = r ? r.planned : new Array(12).fill(0);
      const movedCounts = r ? r.moved : new Array(12).fill(0);
      const doneCounts = r ? r.done : new Array(12).fill(0);
      return {
        cat, plannedCounts, movedCounts, doneCounts,
        plannedTotal: sum(plannedCounts), movedTotal: sum(movedCounts), doneTotal: sum(doneCounts),
      };
    });
    setTrackerStats(stats);
    setTrackerLoading(false);
  }

  /* ---------- Счётчик по произвольному интервалу недель (Этап 2: тот же
     SQL-агрегат, что и в трекере - tracker_stats_range, без разбивки по
     месяцам). Диапазон дат - от понедельника первой отмеченной недели до
     воскресенья последней, а не просто "между датами отметок". ---------- */
  function mondaysBetween(startIso, endIso) {
    const start = getMonday(new Date(startIso + "T00:00:00"));
    const end = getMonday(new Date(endIso + "T00:00:00"));
    const list = [];
    let cur = start;
    while (cur <= end) { list.push(cur); cur = addDays(cur, 7); }
    return list;
  }

  async function computeCounterStats(range) {
    let startIso;
    let endIso;
    let dateFrom;
    let dateTo;
    if (range) {
      ({ dateFrom, dateTo } = range);
      if (!dateFrom || !dateTo || dateFrom > dateTo) {
        showToast("Укажите корректный диапазон дат: начало не позже конца");
        return;
      }
      startIso = dateFrom;
      endIso = dateTo;
    } else {
      if (markedWeeks.size === 0) { showToast("Отметьте недели или выберите диапазон дат"); return; }
      const isos = [...markedWeeks].sort();
      startIso = isos[0];
      endIso = isos[isos.length - 1];
      dateFrom = startIso;
      dateTo = toISO(addDays(getMonday(new Date(endIso + "T00:00:00")), 6));
    }
    const mondays = mondaysBetween(startIso, endIso);
    setCounterLoading(true);
    try {
      const rows = await fetchTrackerStatsRange(dateFrom, dateTo);
      const byCat = Object.fromEntries(rows.map((r) => [r.catId, r]));
      const stats = categories
        .map((cat) => {
          const r = byCat[cat.id];
          return { cat, planned: r ? r.planned : 0, moved: r ? r.moved : 0, done: r ? r.done : 0 };
        })
        .filter((s) => s.planned > 0 || s.moved > 0 || s.done > 0);
      setCounterResult({ startIso, endIso, weeks: mondays.length, stats });
    } catch (error) {
      showToast(`Не удалось посчитать трекер: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setCounterLoading(false);
    }
  }

  function resetCounter() {
    setMarkedWeeks(new Set());
    setCounterResult(null);
  }

  async function savePlanScriptDraft(draft) {
    const now = Date.now();
    const existing = planScripts.find((item) => item.id === draft.id);
    const script = {
      id: draft.id || uid(),
      name: draft.name,
      code: draft.code,
      version: 1,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      lastRunAt: existing?.lastRunAt ?? null,
    };
    await savePlanScriptRemote(script);
    setPlanScripts((prev) => [script, ...prev.filter((item) => item.id !== script.id)]);
    setScriptError("");
    showToast("Скрипт сохранён");
    return script;
  }

  async function removePlanScript(id) {
    await deletePlanScriptRemote(id);
    setPlanScripts((prev) => prev.filter((item) => item.id !== id));
    setScriptPreview(null);
    showToast("Скрипт удалён");
  }

  async function loadPlanScriptContext(code) {
    const dateValues = [...code.matchAll(/\b(\d{1,2})\.(\d{1,2})\.(\d{4})\b/g)].map((match) => {
        const date = new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
        if (date.getFullYear() !== Number(match[3]) || date.getMonth() !== Number(match[2]) - 1 || date.getDate() !== Number(match[1])) {
          throw new Error(`Некорректная дата ${match[0]}`);
        }
        return date;
      });
    const start = dateValues.length ? new Date(Math.min(...dateValues)) : new Date();
    let end = dateValues.length ? new Date(Math.max(...dateValues)) : new Date(start);
    const counts = [...code.matchAll(/\bcount\s*=\s*(\d+)/g)].map((match) => Number(match[1]));
    const count = counts.length ? Math.max(...counts) : 1;
    const extension = code.includes("weeks(") ? Math.max(6, (count - 1) * 7) : code.includes("days(") ? Math.max(6, count - 1) : 6;
    end = addDays(end, extension);
    const firstMonday = getMonday(start);
    const lastMonday = getMonday(end);
    const weekStarts = [];
    for (let monday = firstMonday; monday <= lastMonday; monday = addDays(monday, 7)) {
      weekStarts.push(toISO(monday));
      if (weekStarts.length > 260) throw new Error("Загрузка данных ограничена пятью годами за один запуск");
    }

    const loaded = [];
    for (let i = 0; i < weekStarts.length; i += 8) {
      const batch = weekStarts.slice(i, i + 8);
      loaded.push(...await Promise.all(batch.map((weekIso) => ensureLoadedData(weekIso))));
    }
    const daysByDate = {};
    weekStarts.forEach((weekIso, weekIndex) => {
      const monday = new Date(`${weekIso}T00:00:00`);
      loaded[weekIndex].days.forEach((day, dayIndex) => {
        daysByDate[toISO(addDays(monday, dayIndex))] = day;
      });
    });
    return {
      categories: categories.map((category) => ({ ...category, subs: (category.subs || []).map((sub) => ({ ...sub })) })),
      settings,
      createdYears,
      daysByDate,
      allDayEvents: allDayEvents.map((event) => ({ ...event, startDate: event.startIso, endDate: event.endIso })),
      todos,
      templates,
      weekLabels: weekNumbers,
    };
  }

  async function loadPlanScriptWeeksIntoContext(context, mondays) {
    const loadedMondays = new Set(Object.keys(context.daysByDate).map((date) =>
      toISO(getMonday(new Date(`${date}T00:00:00`))),
    ));
    const missingMondays = [...new Set(mondays)].filter((monday) => !loadedMondays.has(monday));
    if (loadedMondays.size + missingMondays.length > 260) {
      throw new Error("Загрузка данных ограничена пятью годами за один запуск");
    }

    const loaded = [];
    for (let i = 0; i < missingMondays.length; i += 8) {
      const batch = missingMondays.slice(i, i + 8);
      loaded.push(...await Promise.all(batch.map((monday) => ensureLoadedData(monday))));
    }
    missingMondays.forEach((weekIso, weekIndex) => {
      const monday = new Date(`${weekIso}T00:00:00`);
      loaded[weekIndex].days.forEach((day, dayIndex) => {
        context.daysByDate[toISO(addDays(monday, dayIndex))] = day;
      });
    });
  }

  async function runPlanScriptWithLoadedContext(code, options = {}) {
    const context = await loadPlanScriptContext(code);
    for (let pass = 0; pass <= 260; pass++) {
      const result = runPlanScript(code, { ...context, ...options });
      const missingDates = result.unloadedDates.filter((date) => !Object.hasOwn(context.daysByDate, date));
      console.log("PlanScript context pass", pass, result.unloadedDates, missingDates, Object.keys(context.daysByDate).length);
      if (!missingDates.length) return result;
      const mondays = [...new Set(missingDates.map((date) =>
        toISO(getMonday(new Date(`${date}T00:00:00`))),
      ))];
      await loadPlanScriptWeeksIntoContext(context, mondays);
    }
    throw new Error("Не удалось загрузить весь диапазон данных PlanScript за 260 недель");
  }

  async function previewPlanScript(draft) {
    setScriptBusy(true);
    setScriptError("");
    setScriptPreview(null);
    try {
      const result = await runPlanScriptWithLoadedContext(draft.code);
      console.log("PlanScript preview result", result.operations.length);
      const touched = new Set();
      result.operations.forEach((operation) => {
        const dates = operation.date ? [operation.date]
          : operation.event ? [operation.event.startDate, operation.event.endDate] : [];
        dates.forEach((value) => touched.add(toISO(getMonday(new Date(`${value}T00:00:00`)))));
      });
      const weeks = [...touched].sort();
      setScriptPreview({
        ...result,
        draft,
        result,
        weeks,
        originalAllDayEvents: allDayEvents.map((event) => ({ ...event, startDate: event.startIso, endDate: event.endIso })),
      });
      console.log("PlanScript preview state queued", weeks);
    } catch (error) {
      setScriptError(error instanceof Error ? error.message : String(error));
    } finally {
      console.log("PlanScript preview finished");
      setScriptBusy(false);
    }
  }

  async function runPlanScriptTerminal(code) {
    setTerminalBusy(true);
    setTerminalError("");
    setTerminalOutput("");
    try {
      const result = await runPlanScriptWithLoadedContext(code, { readOnly: true });
      const lines = result.log.slice();
      if (result.result !== undefined) lines.push(formatPlanScriptValue(result.result));
      setTerminalOutput(lines.length ? lines.join("\n") : "Команда выполнена. Для вывода используйте log(...) или оставьте выражение последней строкой.");
    } catch (error) {
      setTerminalError(error instanceof Error ? error.message : String(error));
    } finally {
      setTerminalBusy(false);
    }
  }

  async function runWatchersForWeek(weekIso) {
    if (watcherRunLocksRef.current.has(weekIso)) {
      watcherRerunRef.current.add(weekIso);
      return;
    }
    watcherRunLocksRef.current.add(weekIso);
    try {
      const monday = new Date(`${weekIso}T00:00:00`);
      const weekStarts = Array.from({ length: 9 }, (_, index) => toISO(addDays(monday, (index - 4) * 7)));
      const weeks = await Promise.all(weekStarts.map((start) => fetchWeekIntervals(start)));
      const daysByDate = {};
      weekStarts.forEach((start, weekIndex) => {
        const startDate = new Date(`${start}T00:00:00`);
        weeks[weekIndex].forEach((day, dayIndex) => {
          daysByDate[toISO(addDays(startDate, dayIndex))] = day;
        });
      });
      const context = {
        categories,
        settings,
        createdYears,
        daysByDate,
        allDayEvents: allDayEvents.map((event) => ({ ...event, startDate: event.startIso, endDate: event.endIso })),
        todos,
        templates,
        weekLabels: weekNumbers,
      };
      const dates = Array.from({ length: 7 }, (_, index) => toISO(addDays(monday, index)));
      for (const watcher of planWatchers.filter((item) => item.enabled)) {
        const targets = watcher.scope === "day"
          ? dates.map((date) => ({ scope: "day", ownerKey: date, target: { scope: "day", date, monday: weekIso } }))
          : [{ scope: "week", ownerKey: weekIso, target: { scope: "week", monday: weekIso } }];
        for (const item of targets) {
          try {
            const result = runPlanWatch(watcher.code, context, item.target);
            await saveWatchResult(watcher.id, item.scope, item.ownerKey, result.indicator, result.dependencies);
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error(`Наблюдатель «${watcher.name}» не выполнен для ${item.ownerKey}:`, error);
            setScriptError(`Наблюдатель «${watcher.name}» (${item.ownerKey}): ${message}`);
          }
        }
      }
      const [daily, weekly] = await Promise.all([
        listWatchIndicators("day", dates[0], dates[6]),
        listWatchIndicators("week", weekIso, weekIso),
      ]);
      setWatchIndicators((prev) => {
        const next = { ...prev, [`week:${weekIso}`]: weekly };
        for (const date of dates) next[`day:${date}`] = daily.filter((row) => row.ownerKey === date);
        return next;
      });
    } finally {
      watcherRunLocksRef.current.delete(weekIso);
      if (watcherRerunRef.current.delete(weekIso)) {
        runWatchersForWeek(weekIso).catch((error) => {
          const message = error instanceof Error ? error.message : String(error);
          console.error(`Не удалось пересчитать наблюдатели для ${weekIso}:`, error);
          setScriptError(`Не удалось пересчитать наблюдатели для ${weekIso}: ${message}`);
        });
      }
    }
  }

  useEffect(() => {
    const previous = lastWatchWeeksRef.current;
    const watchersChanged = previous.watchers !== planWatchers;
    const loadedWeeks = Object.entries(weeksData).filter(([iso, value]) => previous[iso] !== value);
    lastWatchWeeksRef.current = { ...weeksData, watchers: planWatchers };
    if (!planWatchers.some((watcher) => watcher.enabled)) return;
    const changedIsos = watchersChanged
      ? Object.keys(weeksData)
      : loadedWeeks.map(([iso]) => iso);
    (async () => {
      const affectedWeeks = new Set(changedIsos);
      if (!watchersChanged) {
        for (const changedWeek of changedIsos) {
          const monday = new Date(`${changedWeek}T00:00:00`);
          for (let day = 0; day < 7; day++) {
            const date = toISO(addDays(monday, day));
            const instances = await listAffectedWatchInstances(date);
            for (const instance of instances) {
              const targetWeek = instance.scope === "week"
                ? instance.ownerKey
                : toISO(getMonday(new Date(`${instance.ownerKey}T00:00:00`)));
              affectedWeeks.add(targetWeek);
            }
          }
        }
      }
      for (const iso of affectedWeeks) await runWatchersForWeek(iso);
    })().catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error("Не удалось пересчитать PlanScript-наблюдатели:", error);
      setScriptError(`Не удалось пересчитать PlanScript-наблюдатели: ${message}`);
    });
  }, [weeksData, planWatchers]);

  async function savePlanScriptWatcher(draft) {
    try {
      const ast = parsePlanScript(draft.code);
      if (ast.body.length !== 1 || ast.body[0].type !== "Watch") {
        throw new Error("Сохраните ровно один блок watch every day или watch every week");
      }
      const now = Date.now();
      const existing = planWatchers.find((item) => item.id === draft.id);
      const watcher = {
        id: draft.id || uid(),
        name: draft.name,
        scope: ast.body[0].scope,
        code: draft.code,
        enabled: existing?.enabled ?? true,
        version: 1,
        createdAt: existing?.createdAt || now,
        updatedAt: now,
      };
      await savePlanScriptWatcher(watcher);
      setPlanWatchers((prev) => [watcher, ...prev.filter((item) => item.id !== watcher.id)]);
      showToast("Наблюдатель сохранён");
      return watcher;
    } catch (error) {
      setScriptError(error instanceof Error ? error.message : String(error));
      return null;
    }
  }

  async function removePlanScriptWatcher(id) {
    try {
      await deletePlanScriptWatcher(id);
      setPlanWatchers((prev) => prev.filter((watcher) => watcher.id !== id));
      setWatchIndicators((prev) => Object.fromEntries(Object.entries(prev).map(([key, rows]) => [
        key, rows.filter((row) => row.watcherId !== id),
      ])));
    } catch (error) {
      setScriptError(`Не удалось удалить наблюдатель: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async function togglePlanScriptWatcher(watcher) {
    const updated = { ...watcher, enabled: !watcher.enabled, updatedAt: Date.now() };
    try {
      await savePlanScriptWatcher(updated);
      setPlanWatchers((prev) => prev.map((item) => item.id === watcher.id ? updated : item));
      if (!updated.enabled) {
        setWatchIndicators((prev) => Object.fromEntries(Object.entries(prev).map(([key, rows]) => [
          key, rows.filter((row) => row.watcherId !== watcher.id),
        ])));
      }
    } catch (error) {
      setScriptError(`Не удалось изменить наблюдатель: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async function applyPlanScriptPreview() {
    if (!scriptPreview) return;
    setScriptBusy(true);
    setScriptError("");
    const { result, draft, weeks, originalAllDayEvents } = scriptPreview;
    const beforeWeeks = Object.fromEntries(weeks.map((iso) => [
      iso,
      weeksDataRef.current[iso]?.days || [[], [], [], [], [], [], []],
    ]));
    const beforeCategories = categories;
    const beforeTodos = todos;
    const beforeAllDayEvents = allDayEvents;
    const beforeCreatedYears = createdYears;
    const addedYears = result.changedYears.filter((y) => !createdYears.includes(y));
    const operations = [
      ...result.operations,
      ...addedYears.map((yearValue) => ({ type: "AddCreatedYear", year: yearValue })),
    ];
    const inverseOperations = [
      ...Object.entries(beforeWeeks).map(([monday, days]) => ({ type: "RestoreWeek", monday, days })),
      ...operations.slice().reverse().flatMap((operation) => {
        if (operation.type === "AddCategory") return [{ type: "DeleteCategory", id: operation.category.id }];
        if (operation.type === "AddSubcategory") return [{ type: "DeleteSubcategory", id: operation.subcategory.id }];
        if (operation.type === "AddTodo") return [{ type: "DeleteTodo", id: operation.todo.id }];
        if (operation.type === "SetAllDay") return [{ type: "ClearAllDay", id: operation.event.id }];
        if (operation.type === "ClearAllDay") {
          const event = originalAllDayEvents.find((item) => item.id === operation.id);
          return event ? [{ type: "SetAllDay", event }] : [];
        }
        if (operation.type === "AddCreatedYear") return [{ type: "DeleteCreatedYear", year: operation.year }];
        return [];
      }),
    ];

    try {
      await applyPlanScriptOperations(operations);
      updateWeeksData((prev) => {
        const next = { ...prev };
        for (const monday of weeks) {
          const days = (prev[monday]?.days || [[], [], [], [], [], [], []]).slice();
          for (let dayIdx = 0; dayIdx < 7; dayIdx++) {
            const date = toISO(addDays(new Date(`${monday}T00:00:00`), dayIdx));
            if (Object.hasOwn(result.daysByDate, date)) days[dayIdx] = result.daysByDate[date];
          }
          next[monday] = { ...prev[monday], days };
        }
        return next;
      });
      let nextCategories = [...categories];
      for (const operation of result.operations) {
        if (operation.type === "AddCategory") {
          nextCategories.push({ ...operation.category, subs: [] });
        } else if (operation.type === "AddSubcategory") {
          nextCategories = nextCategories.map((category) => category.id === operation.categoryId
            ? { ...category, subs: [...category.subs, operation.subcategory] }
            : category);
        }
      }
      if (nextCategories !== categories) {
        prevCategoriesRef.current = nextCategories;
        setCategories(nextCategories);
      }
      setTodos((prev) => [...prev, ...result.operations.filter((operation) => operation.type === "AddTodo").map((operation) => ({
        ...operation.todo, done: false,
      }))]);
      setAllDayEvents((prev) => {
        let next = [...prev];
        for (const operation of result.operations) {
          if (operation.type === "SetAllDay") {
            const event = operation.event;
            next.push({ id: event.id, text: event.text, catId: event.catId, color: event.color, startIso: event.startDate, endIso: event.endDate });
          } else if (operation.type === "ClearAllDay") {
            next = next.filter((event) => event.id !== operation.id);
          }
        }
        return next;
      });
      setCreatedYears((prev) => [...new Set([...prev, ...addedYears])].sort((a, b) => a - b));
      historyRef.current.push({
        kind: "planscript",
        inverseOperations,
        weeks: Object.fromEntries(Object.entries(beforeWeeks).map(([iso, days]) => [iso, { days }])),
        categories: beforeCategories,
        todos: beforeTodos,
        allDayEvents: beforeAllDayEvents,
        createdYears: beforeCreatedYears,
      });
      if (historyRef.current.length > 40) historyRef.current.shift();
      setHistoryCount(historyRef.current.length);
      if (draft.id) {
        const ranAt = Date.now();
        try {
          await markPlanScriptRun(draft.id, ranAt);
          setPlanScripts((prev) => prev.map((script) => script.id === draft.id ? { ...script, lastRunAt: ranAt } : script));
        } catch (error) {
          console.error("Скрипт применён, но не удалось обновить lastRunAt:", error);
        }
      }
      setScriptPreview(null);
      maybeRefreshTracker();
      showToast(`PlanScript применён: ${result.operations.length} операций`);
    } catch (error) {
      setScriptError(`Не удалось применить скрипт: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setScriptBusy(false);
    }
  }

  /* ---------- Дашборд: часы по категориям за ТЕКУЩУЮ неделю - суммируем
     реальные минуты (каждый закрашенный 5-минутный слот = 5 минут), а не
     дедуплицированные "единицы", как в трекере/счётчике - тут важна
     именно занятость по времени, а не количество разных дел. ---------- */
  // Этап 2: минуты по категории за текущую неделю - statsHours уже
  // реализована и протестирована (SUM(end_min-start_min) по диапазону
  // дат), просто зовём её на каждую категорию для [isoCur..+6 дней].
  // Этап 2: один SQL-агрегат на все категории сразу (minutes_by_category),
  // а не N отдельных statsHours-запросов (по одному на категорию).
  async function computeWeekStats() {
    setWeekStatsLoading(true);
    const sunday = toISO(addDays(new Date(isoCur + "T00:00:00"), 6));
    const rows = await fetchMinutesByCategory(isoCur, sunday);
    const minutesByCat = Object.fromEntries(rows);
    const stats = categories
      .map((cat) => ({ cat, minutes: minutesByCat[cat.id] || 0 }))
      .filter((s) => s.minutes > 0)
      .sort((a, b) => b.minutes - a.minutes);
    setWeekStats(stats);
    setSelectedDashCats(new Set(stats.map((s) => s.cat.id)));
    setWeekStatsLoading(false);
  }

  function toggleSelectedDashCat(catId) {
    setSelectedDashCats((prev) => {
      const next = new Set(prev);
      next.has(catId) ? next.delete(catId) : next.add(catId);
      return next;
    });
  }

  /* ---------- Агенда: события одного дня (сгруппированные из 5-минутных
     базовых ячеек в блоки - так пара на 90 минут с текстом только на
     первых 30 остаётся ОДНОЙ строкой в списке, а не тремя). ---------- */
  // Этап 2: интервалы уже готовые прогоны - см. intervals.js (с тестами).
  function buildAgendaEvents(days, dayIdx) { return buildAgendaEventsFromIntervals((days || [])[dayIdx]); }

  const agendaIso = toISO(getMonday(agendaDate));
  const agendaDayIdx = (agendaDate.getDay() + 6) % 7;
  const agendaDays = (weeksData[agendaIso] || { days: null }).days;
  const agendaEvents = useMemo(
    () => buildAgendaEvents(agendaDays, agendaDayIdx),
    [agendaDays, agendaDayIdx]
  );
  const agendaAllDay = useMemo(() => {
    const dIso = toISO(agendaDate);
    return allDayEvents.filter((ev) => ev.startIso <= dIso && ev.endIso >= dIso);
  }, [allDayEvents, agendaDate]);

  function agendaPrevDay() { setAgendaDate((d) => addDays(d, -1)); }
  function agendaNextDay() { setAgendaDate((d) => addDays(d, 1)); }
  function agendaToday() { setAgendaDate(new Date()); }
  function agendaPickDate(d) { setAgendaDate(d); }

  // Этап 2: событие агенды может охватывать несколько строк сетки (ряд
  // интервалов, склеенных buildAgendaEventsFromIntervals - см. intervals.js) -
  // переключаем done на каждой строке в его диапазоне, но только там, где
  // что-то реально есть (как и раньше - пустые строки не трогаем, иначе
  // создали бы пустую "галочку без дела" там, где сейчас ничего нет).
  // Шаг теперь cellMin (строка), а не BASE_UNIT (старый 5-минутный квант) -
  // в новой модели квантов меньше строки просто не существует.
  function onAgendaToggleDone(ev) {
    const iso = agendaIso;
    const dayIdx = agendaDayIdx;
    const nextDone = !ev.done;
    const dayIntervals = ((weeksDataRef.current[iso] || {}).days || [])[dayIdx] || [];
    snapshot(iso);
    for (const interval of dayIntervals) {
      const startMin = Math.max(ev.start, interval.startMin);
      const endMin = Math.min(ev.end, interval.endMin);
      if (startMin >= endMin) continue;
      const patch = { done: nextDone };
      applyLocalCellPatch(iso, dayIdx, startMin, endMin, patch);
      scheduleCellWrite(iso, dayIdx, startMin, endMin, patch);
    }
    maybeRefreshTracker();
  }

  function onAgendaJump(ev) {
    const iso = agendaIso;
    const r = Math.floor((ev.start - weekDayStart(agendaIso)) / weekCellMin(agendaIso));
    setMountedWeeks((prev) => ({ ...prev, [iso]: true }));
    setHighlight({ iso, d: agendaDayIdx, r });
    setTimeout(() => setHighlight(null), 2200);
    const targetYear = new Date(iso + "T00:00:00").getFullYear();
    if (targetYear !== year) setYear(targetYear);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const el = weekRefs.current[iso];
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }));
  }

  /* ---------- Повторяющиеся события: заводят регулярное дело сразу на
     несколько недель вперёд, по шаблону (все недели / чётные / нечётные /
     свои диапазоны, например "2-17,20"). Работает как разовое применение
     заливки ко многим неделям, а не как "живая" связь - изменить время
     уже размеченных недель можно только повторной разметкой правила
     ("Разметить ещё раз") или руками через обычную заливку. ---------- */
  /* ---------- Повторяющиеся события (Этап 2: bulk Rust-команда) ----------
     Раньше подбор недель по паттерну (all/even/odd/custom) и запись клеток
     на каждую подходящую неделю делал JS сам, циклом. Теперь всё это -
     одна транзакция на Rust-стороне (applyRecurringRule, см. lib.rs) -
     JS только передаёт спецификацию правила и получает число размеченных
     недель обратно. "Первая клетка - заголовок, остальное без текста" тоже
     больше не нужно городить вручную - см. комментарий в lib.rs у
     apply_recurring_rule: один повтор = один ряд в intervals, а не
     россыпь 5-минутных квантов, которым надо было имитировать заголовок. */
  async function materializeRule(rule, skipConfirmation = false) {
    let weeks;
    try {
      weeks = recurringWeekNumbers(rule.patternType, rule.customRanges, rule.weeksCount);
      if (weeks.length === 0) {
        showToast(t("Ни одна неделя не подошла под шаблон"));
        return false;
      }
      const anchor = new Date(`${rule.anchorIso}T00:00:00`);
      if (Number.isNaN(anchor.getTime()) || toISO(anchor) !== rule.anchorIso) {
        throw new Error(t("Укажите корректную дату начала повтора"));
      }
      const lastWeek = weeks[weeks.length - 1];
      const firstDate = toISO(addDays(anchor, (weeks[0] - 1) * 7 + rule.dayIdx));
      const lastDate = toISO(addDays(anchor, (lastWeek - 1) * 7 + rule.dayIdx));
      const conflictMode = rule.conflictMode || "keepExisting";
      if (!skipConfirmation && !window.confirm(t(
        `Повторно разметить «${rule.name}»? Будет обработано ${weeks.length} событий с ${firstDate} по ${lastDate}.`
      ))) return false;

      setRecurringBusy(true);
      const decisions = [];
      if (conflictMode === "interactivePerCell") {
        const occurrences = weeks.map((week) => toISO(addDays(anchor, (week - 1) * 7 + rule.dayIdx)));
        const days = await Promise.all(occurrences.map(async (date) => [date, await fetchDayIntervals(date)]));
        for (const [date, intervals] of days) {
          const endMin = rule.startMin + rule.durationMin;
          const conflicts = intervals.filter((interval) => interval.startMin < endMin && interval.endMin > rule.startMin);
          if (conflicts.length === 0) continue;
          const details = conflicts.map((interval) => `${minToTime(interval.startMin)}-${minToTime(interval.endMin)} ${interval.text || "(без названия)"}`).join("\n");
          const overwrite = window.confirm(t(
            `${date}: «${rule.name}» ${minToTime(rule.startMin)}-${minToTime(endMin)} пересекается с:\n${details}\n\nЗаменить конфликтующие записи?`
          ));
          decisions.push({ date, startMin: rule.startMin, endMin, overwrite });
        }
      }

      const applied = await applyRecurringRuleRemote({
        dayIdx: rule.dayIdx, startMin: rule.startMin, durationMin: rule.durationMin,
        patch: { text: rule.name, color: rule.color, task: rule.task || "", catId: rule.catId, subId: rule.subId },
        patternType: rule.patternType, customRanges: rule.customRanges || "",
        anchorMonday: rule.anchorIso, weeksCount: rule.weeksCount, conflictMode, decisions,
      });
      // Refresh only loaded weeks that could have changed.
      const refreshes = [];
      for (let idx = 0; idx < rule.weeksCount; idx++) {
        const iso = toISO(addDays(anchor, idx * 7));
        if (weeksDataRef.current[iso]) refreshes.push(refreshWeekFromBackend(iso));
      }
      try {
        await Promise.all(refreshes);
      } catch (error) {
        showToast(`Повтор применён, но не удалось обновить календарь: ${error instanceof Error ? error.message : String(error)}`);
        return true;
      }
      maybeRefreshTracker();
      showToast(applied ? `Обработано недель: ${applied}` : "Ни одна неделя не подошла под шаблон");
      return true;
    } catch (error) {
      showToast(`Не удалось разметить повторяющееся событие: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    } finally {
      setRecurringBusy(false);
    }
  }

  async function createRecurringRule(rule) {
    const createdAt = Date.now();
    setRecurringBusy(true);
    try {
      await addRecurringRuleRemote({
        id: rule.id, name: rule.name, dayIdx: rule.dayIdx, startMin: rule.startMin, durationMin: rule.durationMin,
        catId: rule.catId, subId: rule.subId, color: rule.color, task: rule.task || "",
        patternType: rule.patternType, customRanges: rule.customRanges || "", anchorMonday: rule.anchorIso, weeksCount: rule.weeksCount,
        conflictMode: rule.conflictMode || "keepExisting",
      }, createdAt);
      setRecurringRules((prev) => [...prev, rule]);
    } catch (error) {
      showToast(`Не удалось сохранить правило повтора: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    } finally {
      setRecurringBusy(false);
    }
    await materializeRule(rule, true);
    return true;
  }

  async function deleteRecurringRule(id) {
    setRecurringBusy(true);
    try {
      await deleteRecurringRuleRemote(id);
      setRecurringRules((prev) => prev.filter((r) => r.id !== id));
    } catch (error) {
      showToast(`Не удалось удалить правило повтора: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setRecurringBusy(false);
    }
  }

  async function reapplyRecurringRule(rule) {
    await materializeRule(rule);
  }

  /* ---------- Дела без времени (todo) - отдельное хранилище, никак не
     связанное с cells недель. ---------- */
  // Этап 2: todos уже были разбиты по действиям 1:1 с Rust-командами
  // (addTodo/toggleTodo/deleteTodo) - в отличие от категорий, диффить
  // тут нечего, просто зовём соответствующую команду + меняем локальный
  // React state сразу же (оптимистично, без ожидания ответа).
  function addTodo(text) {
    const id = uid();
    const createdAt = Date.now();
    const sortOrder = todos.reduce((max, todo) => Math.max(max, todo.sortOrder ?? -1), -1) + 1;
    setTodos((prev) => [...prev, { id, text, done: false, createdAt, sortOrder }]);
    addTodoRemote(id, text, createdAt, sortOrder).catch((error) => {
      setTodos((prev) => prev.filter((todo) => todo.id !== id));
      showToast(`Не удалось добавить дело: ${error instanceof Error ? error.message : String(error)}`);
    });
  }
  function toggleTodo(id) {
    setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
    toggleTodoRemote(id).catch(() => {});
  }
  const deleteTodo = useCallback((id) => {
    const removed = todos.find((todo) => todo.id === id);
    setTodos((prev) => prev.filter((todo) => todo.id !== id));
    return deleteTodoRemote(id).catch((error) => {
      if (removed) setTodos((prev) => [...prev, removed].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)));
      showToast(`Не удалось удалить дело: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    });
  }, [todos, showToast]);

  const moveTodo = useCallback((id, offset) => {
    const pending = todos.filter((todo) => !todo.done);
    const done = todos.filter((todo) => todo.done);
    const index = pending.findIndex((todo) => todo.id === id);
    const target = index + offset;
    if (index < 0 || target < 0 || target >= pending.length) return;
    [pending[index], pending[target]] = [pending[target], pending[index]];
    const reordered = [...pending, ...done].map((todo, sortOrder) => ({ ...todo, sortOrder }));
    setTodos(reordered);
    reorderTodosRemote(reordered.map((todo) => todo.id)).catch((error) => {
      showToast(`Не удалось сохранить приоритет дел: ${error instanceof Error ? error.message : String(error)}`);
      listTodos().then(setTodos).catch((loadError) => showToast(`Не удалось обновить список дел: ${loadError instanceof Error ? loadError.message : String(loadError)}`));
    });
  }, [todos, showToast]);

  // Перетащили дело из "Дела без времени" прямо на клетку недели -
  // назначаем ему это конкретное время (заливка на одну строку текущего
  // номинала клетки, своим цветом) и убираем из списка дел без времени -
  // теперь оно расписано.
  const handleDropTodo = useCallback((iso, dayIdx, rowIdx, todoId) => {
    const todo = todos.find((t) => t.id === todoId);
    if (!todo) return;
    setTodoToScheduleId(null);
    const week = weeksDataRef.current[iso] || { days: [[], [], [], [], [], [], []] };
    const entry = {
      kind: "todoDrop",
      iso,
      days: week.days,
      todo: { ...todo, sortOrder: todo.sortOrder ?? todos.indexOf(todo) },
      deletePromise: null,
    };
    historyRef.current.push(entry);
    if (historyRef.current.length > 40) historyRef.current.shift();
    setHistoryCount(historyRef.current.length);
    // task НЕ упомянут в патче - setCellPatch (как и Rust SetInterval)
    // оставляет его как было, не нужно отдельно читать existing.task.
    setCellPatch(iso, dayIdx, rowIdx, {
      text: todo.text,
      color: active?.color || manualColor,
      catId: active?.catId || null,
      subId: active?.subId || null,
      done: false,
      moved: false,
    });
    setTodos((prev) => prev.filter((item) => item.id !== todoId));
    entry.deletePromise = deleteTodoRemote(todoId).then(() => true).catch((error) => {
      setTodos((prev) => prev.some((item) => item.id === todoId)
        ? prev
        : [...prev, entry.todo].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)));
      showToast(`Не удалось назначить дело: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    });
    showToast(`«${todo.text}» назначено на это время`);
  }, [todos, active, manualColor, setCellPatch, showToast]);

  /* ---------- Весь день / несколько дней (дедлайны и многодневные
     события) - отдельное хранилище ("allDayEvents"), не привязанное к
     конкретной клетке/времени. Каждая запись - {startIso, endIso}
     (для однодневного/дедлайна startIso === endIso). ---------- */
  // Этап 2: тот же приём, что и todos - add/delete 1:1 с Rust-командами
  // (setAllDay сам меняет местами startDate/endDate, если перепутаны -
  // см. lib.rs: set_all_day - поэтому здесь эту логику не дублирую).
  function addAllDayEvent({ text, catId, color, startIso, endIso }) {
    const id = uid();
    const createdAt = Date.now();
    const s = startIso <= endIso ? startIso : endIso;
    const e = startIso <= endIso ? endIso : startIso;
    const ev = { id, text, catId: catId || null, color: catId ? null : color, startIso: s, endIso: e, createdAt };
    setAllDayEvents((prev) => [...prev, ev]);
    setAllDayRemote(id, text, catId || null, catId ? null : color, startIso, endIso, createdAt).catch(() => {});
  }
  const deleteAllDayEvent = useCallback((id) => {
    setAllDayEvents((prev) => prev.filter((ev) => ev.id !== id));
    clearAllDayRemote(id).catch(() => {});
  }, []);

  /* ---------- Шаблоны недели/дня (Этап 2: bulk Rust-команды) ----------
     Раньше слияние (overwrite/keepExisting/templateWins) считал JS сам,
     перебирая ключи cells. Теперь это делает Rust одной транзакцией
     (applyWeekTemplate/applyDayTemplate, см. lib.rs) - фронтенду достаточно
     передать template.data (уже в форме TemplateInterval[] - см. intervals.js:
     daysToTemplateIntervals/dayToTemplateIntervals) и список целей. */
  const APPLY_MODE_LABELS = {
    auto: "авто: пустые для короткого шаблона, иначе заменить всё",
    overwrite: "заменить всё",
    keepExisting: "только в пустые клетки",
    templateWins: "наложить поверх",
    interactivePerCell: "спросить по каждой конфликтующей клетке",
  };
  function getTemplateApplyMode(tpl) {
    if (templateApplyMode !== "auto") return templateApplyMode;
    const totalMinutes = tpl.data.reduce((sum, item) => sum + item.endMin - item.startMin, 0);
    return tpl.data.length <= 2 && totalMinutes <= 120 ? "keepExisting" : "overwrite";
  }
  // JS-имена режимов ("overwrite"/"keepExisting"/"templateWins") ->
  // Rust-enum ApplyMode ("overwrite"/"keepExisting"/"templateWins" -
  // совпадают текстуально, serde сам разберёт по этим же строкам).

  async function refreshWeekFromBackend(iso) {
    const days = await fetchWeekIntervals(iso);
    updateWeeksData((prev) => ({ ...prev, [iso]: { ...prev[iso], days } }));
  }

  async function saveWeekTemplate(sourceIso, name) {
    const iso = sourceIso || isoCur;
    await ensureLoadedData(iso);
    const wk = weeksDataRef.current[iso] || { days: [[], [], [], [], [], [], []] };
    const flat = daysToTemplateIntervals(wk.days);
    const id = uid();
    const createdAt = Date.now();
    const tpl = { id, name, type: "week", data: flat, createdAt };
    setTemplates((prev) => [...prev, tpl]);
    addTemplateRemote(id, name, "week", JSON.stringify(flat), createdAt).catch(() => {});
    showToast("Шаблон недели сохранён");
  }

  async function applyWeekTemplateTargets(tpl, targets, exceptions = []) {
    if (targets.length === 0) return;
    try {
      await Promise.all(targets.map((iso) => flushPendingWeekWrites(iso)));
      await Promise.all(targets.map((iso) => ensureLoadedData(iso)));
    } catch (error) {
      showToast(`Не удалось подготовить недели: ${error instanceof Error ? error.message : String(error)}`);
      return;
    }
    const excluded = new Set(exceptions);
    const conflictCount = targets.reduce((count, iso) => {
      const monday = new Date(`${iso}T00:00:00`);
      const week = weeksDataRef.current[iso];
      return count + tpl.data.filter((item) => {
        const date = toISO(addDays(monday, item.dayIdx));
        if (excluded.has(date)) return false;
        return (week.days[item.dayIdx] || []).some((interval) =>
          interval.startMin < item.endMin && interval.endMin > item.startMin
        );
      }).length;
    }, 0);
    const label = targets.length === 1
      ? formatRange(new Date(`${targets[0]}T00:00:00`))
      : `${targets.length} недель`;
    const applyMode = getTemplateApplyMode(tpl);
    const modeLabel = templateApplyMode === "auto"
      ? `${APPLY_MODE_LABELS.auto} (${APPLY_MODE_LABELS[applyMode]})`
      : APPLY_MODE_LABELS[applyMode];
    const preview = `Применить «${tpl.name}» к ${label}?\n\n` +
      `Записей шаблона: ${tpl.data.length * targets.length}\n` +
      `Пересечений с существующими данными: ${conflictCount}\n` +
      `Исключённых дат: ${excluded.size}\n` +
      `Режим: ${modeLabel}\n` +
      `Вся операция отменяется одним Undo.`;
    if (!window.confirm(t(preview))) return;

    const decisions = [];
    if (applyMode === "interactivePerCell") {
      for (const iso of targets) {
        const monday = new Date(`${iso}T00:00:00`);
        const week = weeksDataRef.current[iso];
        for (const item of tpl.data) {
          const date = toISO(addDays(monday, item.dayIdx));
          if (excluded.has(date)) continue;
          const conflict = (week.days[item.dayIdx] || []).find((interval) =>
            interval.startMin < item.endMin && interval.endMin > item.startMin
          );
          if (!conflict) continue;
          const replace = window.confirm(t(
            `${date}, ${minToTime(item.startMin)}-${minToTime(item.endMin)}: ` +
            `уже занято (${conflict.text || conflict.task || "запись без названия"}). Заменить содержимое этой клетки?`
          ));
          decisions.push({ date, startMin: item.startMin, endMin: item.endMin, overwrite: replace });
        }
      }
    }

    const snapshots = targets.map((monday) => ({
      monday,
      days: weeksDataRef.current[monday].days.map((day) => day.slice()),
    }));
    targets.forEach(cancelPendingWeekWrites);
    try {
      await applyWeekTemplateRemote(tpl.data, targets, applyMode, settingsRef.current.dayStart, settingsRef.current.dayEnd, exceptions, decisions);
      historyRef.current.push({ kind: "multiWeek", snapshots });
      if (historyRef.current.length > 40) historyRef.current.shift();
      setHistoryCount(historyRef.current.length);
      await Promise.all(targets.map((iso) => refreshWeekFromBackend(iso)));
      setMarkedWeeks(new Set());
      maybeRefreshTracker();
      showToast(`Шаблон «${tpl.name}» применён к ${label}`);
    } catch (error) {
      showToast(`Не удалось применить шаблон: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Применить шаблон недели сразу ко всем отмеченным неделям - ОДНИМ
  // вызовом Rust-команды на весь список целей (одна транзакция), а не
  // циклом отдельных applyWeekTemplate, как раньше.
  async function applyWeekTemplateToMarked(tpl) {
    const targets = [...markedWeeks];
    if (targets.length === 0) return;
    await applyWeekTemplateTargets(tpl, targets);
  }

  async function applyWeekTemplateToRange(tpl, targets, exceptions) {
    await applyWeekTemplateTargets(tpl, targets, exceptions);
  }

  function applyWeekTemplateFromRange(tpl, spec) {
    try {
      const targets = expandWeekRange(spec);
      const exceptions = String(spec.exceptions || "").split(",").map((date) => date.trim()).filter(Boolean);
      for (const date of exceptions) {
        const parsed = new Date(`${date}T00:00:00`);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(parsed.getTime()) || toISO(parsed) !== date) {
          throw new Error(`Некорректная дата исключения: ${date}`);
        }
      }
      void applyWeekTemplateToRange(tpl, targets, exceptions).catch((error) => {
        showToast(`Не удалось применить диапазон: ${error instanceof Error ? error.message : String(error)}`);
      });
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error));
    }
  }

  function deleteTemplate(id) {
    setTemplates((prev) => prev.filter((t) => t.id !== id));
    deleteTemplateRemote(id).catch(() => {});
  }

  async function saveDayTemplate(sourceIso, dayIdx, name) {
    const iso = sourceIso || isoCur;
    await ensureLoadedData(iso);
    const wk = weeksDataRef.current[iso] || { days: [[], [], [], [], [], [], []] };
    const flat = dayToTemplateIntervals(wk.days[dayIdx]);
    const id = uid();
    const createdAt = Date.now();
    const tpl = { id, name, type: "day", data: flat, createdAt };
    setTemplates((prev) => [...prev, tpl]);
    addTemplateRemote(id, name, "day", JSON.stringify(flat), createdAt).catch(() => {});
    showToast("Шаблон дня сохранён");
  }

  // targets - массив { iso, d } - конкретные (неделя, день), куда вставить
  // шаблон. Переводим в абсолютные даты и зовём Rust ОДНИМ вызовом на весь
  // список (было: группировка по неделе + перебор ключей cells в JS).
  async function applyDayTemplate(tpl, targets) {
    if (!targets || targets.length === 0) { showToast("Сначала отметьте день(-и) в календаре"); return; }
    const daysLabel = targets.length === 1
      ? `${WEEKDAYS_SHORT[targets[0].d]} (${formatRange(new Date(targets[0].iso + "T00:00:00"))})`
      : `${targets.length} отмеченных дней`;
    const targetDates = targets.map(({ iso, d }) => toISO(addDays(new Date(iso + "T00:00:00"), d)));
    const isoList = [...new Set(targets.map((t) => t.iso))];
    try {
      await Promise.all(isoList.map((iso) => flushPendingWeekWrites(iso)));
      await Promise.all(isoList.map((iso) => ensureLoadedData(iso)));
    } catch (error) {
      showToast(`Не удалось подготовить недели: ${error instanceof Error ? error.message : String(error)}`);
      return;
    }
    const conflictCount = targets.reduce((count, target) => {
      const intervals = weeksDataRef.current[target.iso]?.days[target.d] || [];
      return count + tpl.data.filter((item) => intervals.some((interval) =>
        interval.startMin < item.endMin && interval.endMin > item.startMin
      )).length;
    }, 0);
    const applyMode = getTemplateApplyMode(tpl);
    const modeLabel = templateApplyMode === "auto"
      ? `${APPLY_MODE_LABELS.auto} (${APPLY_MODE_LABELS[applyMode]})`
      : APPLY_MODE_LABELS[applyMode];
    if (!window.confirm(t(`Применить шаблон «${tpl.name}» к ${daysLabel}?\n\nЗаписей шаблона: ${tpl.data.length * targets.length}\nПересечений: ${conflictCount}\nРежим: ${modeLabel}\nВся операция отменяется одним Undo.`))) return;

    const decisions = [];
    if (applyMode === "interactivePerCell") {
      for (const target of targets) {
        const date = toISO(addDays(new Date(`${target.iso}T00:00:00`), target.d));
        const intervals = weeksDataRef.current[target.iso]?.days[target.d] || [];
        for (const item of tpl.data) {
          const conflict = intervals.find((interval) =>
            interval.startMin < item.endMin && interval.endMin > item.startMin
          );
          if (!conflict) continue;
          const replace = window.confirm(t(
            `${date}, ${minToTime(item.startMin)}-${minToTime(item.endMin)}: ` +
            `уже занято (${conflict.text || conflict.task || "запись без названия"}). Заменить содержимое этой клетки?`
          ));
          decisions.push({ date, startMin: item.startMin, endMin: item.endMin, overwrite: replace });
        }
      }
    }

    const snapshots = isoList.map((monday) => ({
      monday,
      days: weeksDataRef.current[monday].days.map((day) => day.slice()),
    }));
    isoList.forEach(cancelPendingWeekWrites);
    const s = settingsRef.current;
    try {
      await applyDayTemplateRemote(tpl.data, targetDates, applyMode, s.dayStart, s.dayEnd, decisions);
      historyRef.current.push({ kind: "multiWeek", snapshots });
      if (historyRef.current.length > 40) historyRef.current.shift();
      setHistoryCount(historyRef.current.length);
      await Promise.all(isoList.map((iso) => refreshWeekFromBackend(iso)));
      maybeRefreshTracker();
      showToast(`Шаблон «${tpl.name}» применён к ${daysLabel}`);
    } catch (error) {
      showToast(`Не удалось применить шаблон: ${error instanceof Error ? error.message : String(error)}`);
      return;
    }
    const lastIso = targets[targets.length - 1].iso;
    const lastYear = new Date(lastIso + "T00:00:00").getFullYear();
    if (lastYear !== year) setYear(lastYear);
    isoList.forEach((iso) => setMountedWeeks((prev) => ({ ...prev, [iso]: true })));
    setMarkedDays(new Set());
  }

  const legendOptions = useMemo(
    () => categories.flatMap((c) => [c.name, ...c.subs.map((s) => `${c.name} - ${s.name}`)]),
    [categories]
  );

  // Список действий для командной палитры (Ctrl+K) - придуман сам по
  // частым сценариям: переходы по неделям/дням, режимы, панели дока,
  // масштаб, экспорт. У панелей дока уже есть свои буквенные хоткеи
  // (см. KeyTips по Alt) - тут они просто продублированы для поиска.
  const commands = [
    { id: "today", label: "К текущей неделе", hotkey: "Home", action: goToCurrentWeek },
    { id: "clear-range", label: t("Инструмент очистки периода"), hotkey: "E", keywords: "удалить стереть month year range", action: () => openClearRangeDialog() },
    { id: "next-week", label: "Следующая неделя", hotkey: "]", action: () => jumpToRelativeWeek(1) },
    { id: "prev-week", label: "Предыдущая неделя", hotkey: "[", action: () => jumpToRelativeWeek(-1) },
    { id: "mode-text", label: "Режим: Текст", hotkey: "1", action: () => setMode("text") },
    { id: "mode-paint", label: "Режим: Заливка", hotkey: "2", action: () => setMode("paint") },
    { id: "mode-erase", label: "Режим: Ластик", hotkey: "3", action: () => setMode("erase") },
    { id: "mode-select", label: "Режим: Выбор", hotkey: "4", action: () => setMode("select") },
    { id: "undo", label: "Отменить последнее действие", hotkey: "Ctrl+Z", action: undo },
    { id: "copy-sel", label: "Копировать выделение", hotkey: "Ctrl+C", keywords: "copy", action: copySelection },
    { id: "paste-sel", label: "Вставить выделение", hotkey: "Ctrl+V", keywords: "paste", action: pasteSelection },
    { id: "zoom-in", label: "Увеличить масштаб", hotkey: "+", action: () => zoomBy(1) },
    { id: "zoom-out", label: "Уменьшить масштаб", hotkey: "-", action: () => zoomBy(-1) },
    { id: "week-snap", label: "Прокрутка по неделям (вкл/выкл)", hotkey: "Q", action: () => setWeekSnapLock((v) => !v) },
    { id: "eyedropper", label: "Пипетка (вкл/выкл)", hotkey: "I", keywords: "цвет краска", action: () => setEyedropperActive((v) => !v) },
    { id: "open-categories", label: "Открыть: Категории", hotkey: "C", action: () => setActiveDockPanel("categories") },
    { id: "open-todo", label: "Открыть: Дела без времени", hotkey: "L", action: () => setActiveDockPanel("todo") },
    { id: "open-agenda", label: "Открыть: Агенда дня", hotkey: "D", action: () => setActiveDockPanel("agenda") },
    { id: "open-tracker", label: "Открыть: Трекер", hotkey: "T", action: () => setActiveDockPanel("tracker") },
    { id: "open-counter", label: "Открыть: Счётчик по интервалу (вкладка Трекера)", action: () => { setActiveDockPanel("tracker"); setTrackerTab("interval"); } },
    { id: "open-templates", label: "Открыть: Шаблоны", hotkey: "M", action: () => setActiveDockPanel("templates") },
    { id: "open-recurring", label: "Открыть: Повторяющиеся события", hotkey: "P", action: () => setActiveDockPanel("recurring") },
    { id: "open-script", label: "Открыть: PlanScript", hotkey: "X", keywords: "скрипт сценарий автоматизация", action: () => setActiveDockPanel("script") },
    { id: "open-glossary", label: "Открыть: Глоссарий и хоткеи", hotkey: "G", action: () => setActiveDockPanel("glossary") },
    { id: "open-settings", label: "Открыть: Настройки", hotkey: "S", action: () => setActiveDockPanel("settings") },
    { id: "open-search", label: "Открыть: Поиск / экспорт", hotkey: "F", action: () => setActiveDockPanel("search") },
    { id: "export-json", label: "Экспорт всех данных в JSON", keywords: "скачать бэкап", action: exportData },
    { id: "export-ics", label: "Экспорт событий года в .ics", keywords: "календарь ical", action: exportICS },
    { id: "theme-light", label: "Тема: Спокойная", action: () => updateSettings({ theme: "light" }) },
    { id: "theme-calm", label: "Тема: Светлая", action: () => updateSettings({ theme: "calm" }) },
    { id: "theme-dark", label: "Тема: Тёмная", action: () => updateSettings({ theme: "dark" }) },
  ];

  if (loading) {
    return (
      <div className={`planner-root ${spaceScrollLock ? "space-scroll-lock" : ""} ${eyedropperActive ? "eyedropper-active" : ""}`} data-theme={settings.theme}>
        <GlobalStyles />
        <div className="startup-loading" role="status" aria-label="Загрузка календаря">
          <div className="startup-loading-brand">
            <img src={forgetMeNotIcon} className="startup-flower-spin" alt="" />
            <div className="startup-loading-copy">
              <strong>Незабудка</strong>
              <span>Готовим календарь...</span>
            </div>
          </div>
          <div className="startup-skeleton-card" aria-hidden="true">
            <div className="startup-skeleton-title">
              <span className="startup-skeleton-shimmer startup-skeleton-title-mark" />
              <span className="startup-skeleton-shimmer startup-skeleton-title-text" />
              <span className="startup-skeleton-shimmer startup-skeleton-title-date" />
            </div>
            <div className="startup-skeleton-grid">
              <div className="startup-skeleton-row startup-skeleton-days">
                <span />
                {Array.from({ length: 7 }, (_, index) => <span key={index}><i className="startup-skeleton-shimmer" /></span>)}
              </div>
              {Array.from({ length: 8 }, (_, row) => (
                <div className="startup-skeleton-row" key={row}>
                  <span><i className="startup-skeleton-shimmer" /></span>
                  {Array.from({ length: 7 }, (_, day) => (
                    <span key={day}>{(row + day) % 4 === 0 && <i className="startup-skeleton-shimmer" />}</span>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (startupError) {
    return (
      <div className={`planner-root ${spaceScrollLock ? "space-scroll-lock" : ""}`} data-theme={settings.theme}>
        <GlobalStyles />
        <div className="loading-state">
          Не удалось загрузить данные приложения: {startupError}
        </div>
      </div>
    );
  }

  return (
    <div className={`planner-root ${spaceScrollLock ? "space-scroll-lock" : ""} ${eyedropperActive ? "eyedropper-active" : ""}`} data-theme={settings.theme}>
      <GlobalStyles />
      <datalist id="planner-legend">
        {legendOptions.map((l) => <option key={l} value={l} />)}
      </datalist>

      <div className="scroll-rail scroll-rail-top" />
      <div className="scroll-rail scroll-rail-bottom" />
      {canScrollUp && (
        <button
          type="button"
          className="scroll-hover-square scroll-hover-square-up"
          onMouseEnter={() => onScrollSquareEnter("up")}
          onMouseLeave={() => onScrollSquareLeave("up")}
          onDoubleClick={() => onScrollSquareDblClick("up")}
          title="Наведите - прокрутка вверх. Двойной клик - без удержания курсора."
        >
          <ChevronUp size={16} />
        </button>
      )}
      {canScrollDown && (
        <button
          type="button"
          className="scroll-hover-square scroll-hover-square-down"
          onMouseEnter={() => onScrollSquareEnter("down")}
          onMouseLeave={() => onScrollSquareLeave("down")}
          onDoubleClick={() => onScrollSquareDblClick("down")}
          title="Наведите - прокрутка вниз. Двойной клик - без удержания курсора."
        >
          <ChevronDown size={16} />
        </button>
      )}
      {toast && <div className="toast">{toast}</div>}
      {lockedScrollDir && (
        <div className={`autoscroll-indicator autoscroll-indicator-${lockedScrollDir}`} onClick={() => setLockedScrollDir(null)}>
          {t(`Автопрокрутка ${lockedScrollDir === "up" ? "вверх" : "вниз"} - клик, чтобы остановить`)}
        </div>
      )}
      {weekSnapLock && (
        <div className="autoscroll-indicator autoscroll-indicator-snap" onClick={() => setWeekSnapLock(false)}>
          {t("Прокрутка по неделям - Q или клик, чтобы выключить")}
        </div>
      )}
      {commandPaletteOpen && (
        <CommandPalette commands={commands} onClose={() => setCommandPaletteOpen(false)} />
      )}
      {hoverDescTooltip && (
        <div className="hover-desc-tooltip" style={{ left: hoverDescTooltip.x, top: hoverDescTooltip.y }}>
          {hoverDescTooltip.text}
        </div>
      )}
      {templateModalOpen && (
        <TemplateEditorModal
          markedWeeks={markedWeeks}
          markedDays={markedDays}
          onSaveWeek={saveWeekTemplate}
          onSaveDay={saveDayTemplate}
          onClose={() => setTemplateModalOpen(false)}
        />
      )}
      {reflectionModalIso && (
        <div className="modal-backdrop" onClick={closeReflectionModal}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <span>{t(`Рефлексия дня - ${reflectionModalIso}`)}</span>
              <button onClick={closeReflectionModal} className="icon-btn subtle modal-close-button" title="Закрыть"><X size={18} /></button>
            </div>
            <div className="modal-body">
              {reflectionLoading ? (
                <div className="hint-text pad-sm">Загружаю...</div>
              ) : (
                <textarea
                  className="sub-desc-textarea"
                  style={{ minHeight: 220, width: "100%" }}
                  value={reflectionText}
                  onChange={(e) => { setReflectionText(e.target.value); scheduleReflectionSave(reflectionModalIso, e.target.value); }}
                  placeholder="Как прошёл день? Что получилось, что не получилось, что запомнилось..."
                  autoFocus
                />
              )}
              <div className="hint-text" style={{ marginTop: 6 }}>{reflectionSaving ? "Сохраняю..." : "Сохранено"}</div>
            </div>
            <div className="modal-actions">
              <button onClick={closeReflectionModal} className="btn btn-primary btn-sm">Готово</button>
            </div>
          </div>
        </div>
      )}
      {createYearModalOpen && (
        <div className="modal-backdrop" onClick={() => { setCreateYearModalOpen(false); setCreateYearInput(""); }}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <span>Завести год</span>
              <button onClick={() => { setCreateYearModalOpen(false); setCreateYearInput(""); }} className="icon-btn subtle modal-close-button" title="Закрыть"><X size={18} /></button>
            </div>
            <div className="modal-body">
              <div className="field-label">Год</div>
              <input
                type="number"
                value={createYearInput}
                onChange={(e) => setCreateYearInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addYear(createYearInput)}
                className="time-input modal-name-input"
                placeholder={String(REAL_YEAR)}
                autoFocus
              />
            </div>
            <div className="modal-actions">
              <button onClick={() => { setCreateYearModalOpen(false); setCreateYearInput(""); }} className="btn btn-ghost btn-sm">Отмена</button>
              <button onClick={() => addYear(createYearInput)} disabled={!createYearInput.trim()} className="btn btn-primary btn-sm">Завести</button>
            </div>
          </div>
        </div>
      )}
      <div className="planner-header">
        <div className="titlebar">
          <div className="titlebar-left">
            <span className="select-wrap">
              <select
                ref={yearSelectRef}
                className="year-select"
                value={year}
                onChange={(e) => {
                  if (e.target.value === "__create__") { setCreateYearModalOpen(true); return; }
                  setYear(Number(e.target.value));
                }}
                title="Год листа (Alt+Y)"
              >
                {createdYears.map((y) => <option key={y} value={y}>{y}</option>)}
                <option value="__create__">+ Завести год</option>
              </select>
              {keyTip("Alt+Y")}
            </span>
            <button
              onClick={() => exportReflectionsForYear(year)}
              className="icon-btn subtle"
              title={`Выгрузить все рефлексии за ${year} год одним .md-файлом`}
            >
              <NotebookPen size={13} />
              <Download size={10} style={{ marginLeft: -4 }} />
            </button>
            <span className="select-wrap">
              <select
                ref={monthSelectRef}
                className="year-select"
                value=""
                onChange={(e) => { if (e.target.value !== "") jumpToMonth(Number(e.target.value), year); }}
                title="Быстрый переход к месяцу (Alt+M)"
              >
                <option value="">Месяц...</option>
                {MONTHS_NOM.map((mo, i) => <option key={i} value={i}>{mo}</option>)}
              </select>
              {keyTip("Alt+M")}
            </span>
          </div>
          <div className="titlebar-actions">
            <button onClick={() => setCommandPaletteOpen(true)} className="btn btn-ghost" title="Список действий с поиском (Ctrl+K)">{keyTip("Ctrl+K")}Команды</button>
            <button onClick={goToCurrentWeek} className="btn btn-primary" title="Клавиша Home">{keyTip("Home")}<CalendarClock size={14} /> К текущей неделе</button>
            <button
              onClick={undo}
              disabled={historyCount === 0}
              title={historyCount === 0 ? "Пока нечего отменять" : "Отменить последнее действие (Ctrl+Z)"}
              className={`icon-btn ${historyCount === 0 ? "icon-btn-disabled" : ""}`}
            >
              {keyTip("Ctrl+Z")}<Undo2 size={14} />
            </button>
          </div>
        </div>

        <div className="toolbar-body">
          <div className="mode-row">
            <div className="segmented">
              <button onClick={() => setMode("text")} className={`segmented-option ${mode === "text" ? "active" : ""}`} title="Клавиша 1">{keyTip("1")}<Type size={13} /> {t("Текст")}</button>
              <button onClick={() => setMode("paint")} className={`segmented-option ${mode === "paint" ? "active" : ""}`} title="Клавиша 2">{keyTip("2")}<PaintBucket size={13} /> Заливка</button>
              <button onClick={() => setMode("erase")} className={`segmented-option ${mode === "erase" ? "active" : ""}`} title="Клавиша 3 - протяните мышью по клеткам, очистит их">{keyTip("3")}<Eraser size={13} /> Ластик</button>
              <button onClick={() => setMode("select")} className={`segmented-option ${mode === "select" ? "active" : ""}`} title="Клавиша 4">{keyTip("4")}<MousePointer2 size={13} /> Выбор</button>
            </div>
            <button
              onClick={() => setEyedropperActive((v) => !v)}
              className={`icon-btn ${eyedropperActive ? "icon-btn-active" : ""}`}
              title="Пипетка (I) - кликните по закрашенной клетке, чтобы взять её категорию/подкатегорию или цвет+текст, и сразу включить Заливку этим"
            >
              {keyTip("I")}<Pipette size={15} />
            </button>
            {mode === "paint" && (
              active ? (
                <div className="active-paint-chip" title="Сейчас заливка красит выбранной категорией">
                  <span className="active-paint-swatch" style={{ background: active.color }} />
                  <span className="active-paint-label" data-no-translate>{active.label}</span>
                  <button onClick={() => setActive(null)} className="icon-btn subtle icon-action-button" title="Снять категорию - вернуться к своему цвету" aria-label="Снять категорию">
                    <X size={16} />
                  </button>
                </div>
              ) : (
                <input type="color" value={manualColor} onChange={(e) => setManualColor(e.target.value)} title="Свой цвет для заливки без категории" className="manual-color" />
              )
            )}
            {mode === "select" && (
              <div className="select-actions">
                <button onClick={copySelection} disabled={!selection} className="btn btn-ghost" title="Скопировать выделенные клетки (Ctrl+Alt+C)"><Copy size={13} /> Копировать</button>
                <button onClick={pasteSelection} disabled={!selection || clipboardCount === 0} className="btn btn-ghost" title="Вставить в выделенную область (Ctrl+Alt+V)"><ClipboardPaste size={13} /> Вставить</button>
              </div>
            )}
            <div className="zoom-group">
              <button onClick={() => zoomBy(-1)} className="icon-btn tiny-wrap" title="Уменьшить масштаб (дальше - недели плитками, затем месяцы, затем годы)" style={{ width: 26, height: 26 }}>{keyTip("-")}<ZoomOut size={13} /></button>
              <span className="zoom-label">
                {viewMode === "months" ? "Месяцы" : viewMode === "years" ? "Годы" : viewMode === "weekTiles" ? "Недели плитками" : `${Math.round((settings.zoom || 1) * 100)}%`}
              </span>
              <button onClick={() => zoomBy(1)} className="icon-btn tiny-wrap" title="Увеличить масштаб" style={{ width: 26, height: 26 }}>{keyTip("+")}<ZoomIn size={13} /></button>
            </div>
            <span className="mode-hint">
              {mode === "text" && "кликните клетку и печатайте"}
              {mode === "paint" && (active ? `протяните мышью - закрасит в цвет «${active.label}»` : "протяните мышью по клеткам одного дня")}
              {mode === "erase" && "протяните мышью по клеткам одного дня - очистит их"}
              {mode === "select" && "тащите - выделить; тащите по выделению - перенести; Esc - снять выделение"}
            </span>
          </div>
        </div>
      </div>

      {viewMode === "months" && (
        <MonthsGrid year={year} yearList={yearList} weeksData={weeksData} onOpenMonth={(mi) => jumpToMonth(mi, year)} />
      )}
      {viewMode === "years" && (
        <YearsGrid
          years={createdYears}
          currentYear={year}
          onOpenYear={(y) => { setYear(y); setViewMode("months"); }}
          onCreateYear={() => setCreateYearModalOpen(true)}
        />
      )}
      {viewMode === "weekTiles" && (
        <WeekTiles
          yearList={yearList}
          weekNumberLabels={weekNumberLabels}
          markedWeeks={markedWeeks}
          onToggleMark={toggleWeekMark}
          onSetWeekNumber={setWeekNumber}
          onOpenWeek={(iso) => { setViewMode("weeks"); jumpToDate(new Date(iso + "T00:00:00")); }}
          selectionMode={activeDockPanel === "clearRange" && clearRangeScope === "week"}
          selectedWeekIso={clearRangeAnchor}
          onSelectWeek={(iso) => setClearRangeAnchor(iso)}
        />
      )}
      {viewMode === "weeks" && (
        <div className={`weeks-list ${fullscreenWeekIso ? "week-fullscreen-active" : ""}`} style={{ "--week-min-width": `${Math.round(600 * (settings.zoom || 1))}px` }}>
          {(() => {
            let lastMonth = -1;
            return yearList.map((monday) => {
              const iso = toISO(monday);
              const monthIdx = monday.getMonth();
              const showMonthHeader = monthIdx !== lastMonth;
              lastMonth = monthIdx;
              return (
                <Fragment key={iso}>
                  {showMonthHeader && <div className="month-divider">{MONTHS_NOM[monthIdx]}</div>}
                  <LazyWeek
                    monday={monday}
                    settings={{ ...settings, cellMin: weekCellMin(iso), dayStart: weekDayStart(iso), dayEnd: weekDayEnd(iso) }}
                    mode={mode}
                    iso={iso}
                    fullscreen={fullscreenWeekIso === iso}
                    onToggleFullscreen={() => setFullscreenWeekIso((current) => current === iso ? null : iso)}
                    categories={categories}
                    weekData={weeksData[iso]}
                    onCellDown={handleCellDown}
                    onCellEnter={handleCellEnter}
                    onCellText={setCellText}
                    onCellTask={setCellTask}
                    onCellSubPick={setCellSub}
                    onCellDone={setCellDone}
                    onCellDescription={setCellDescription}
                    onHoverDescription={setHoverDescTooltip}
                    onLeaveDescription={handleLeaveDescription}
                    onDropTodo={handleDropTodo}
                    todoToScheduleId={todoToScheduleId}
                    onCancelTodoSchedule={() => setTodoToScheduleId(null)}
                    selection={selection}
                    highlight={highlight}
                    dayHighlight={dayHighlight}
                    mounted={!!mountedWeeks[iso]}
                    onVisible={handleWeekVisible}
                    onHidden={handleWeekHidden}
                    registerRef={(k, el) => { weekRefs.current[k] = el; }}
                    onClearWeek={clearWeek}
                    onWeekQuantumChange={changeWeekQuantum}
                    onWeekDayBoundsChange={changeWeekDayBounds}
                    onResetWeekDayBounds={resetWeekDayBounds}
                    markingMode={activeDockPanel === "templates" || (activeDockPanel === "tracker" && trackerTab === "interval")}
                    weekMarked={markedWeeks.has(iso)}
                    markedDays={markedDays}
                    onToggleWeekMark={toggleWeekMark}
                    onToggleDayMark={toggleDayMark}
                    allDayEvents={allDayEvents}
                    onDeleteAllDay={deleteAllDayEvent}
                    onHoverWeek={handleHoverWeek}
                    onOpenReflection={openReflection}
                    watchIndicators={{
                      week: watchIndicators[`week:${iso}`] || [],
                      days: Array.from({ length: 7 }, (_, index) => watchIndicators[`day:${toISO(addDays(monday, index))}`] || []),
                    }}
                  />
                </Fragment>
              );
            });
          })()}
        </div>
      )}

      <div
        className="dock-hover-zone"
        onMouseEnter={() => setDockHover(true)}
        onMouseLeave={() => setDockHover(false)}
      >
        <div className={`tool-dock ${dockHover || activeDockPanel || keyTipsVisible ? "tool-dock-visible" : ""}`}>
          {activeDockPanel && (
            <div className="dock-flyout">
              <div className="dock-flyout-head">
                <span className="hint-text">Инструменты</span>
                <button className="icon-btn subtle dock-close-button" onClick={() => setActiveDockPanel(null)} title="Закрыть панель"><X size={18} /></button>
              </div>
              <div className={`dock-flyout-body ${activeDockPanel === "categories" ? "dock-category-body" : ""}`}>
                {activeDockPanel === "categories" && (
                  <CategoryPanel categories={categories} setCategories={setCategories} active={active} setActive={setActive} onPickCategory={() => setMode("paint")} />
                )}
                {activeDockPanel === "todo" && (
                  <TodoPanel
                    todos={todos}
                    onAdd={addTodo}
                    onToggle={toggleTodo}
                    onDelete={deleteTodo}
                    onMove={moveTodo}
                    onSchedule={handleDropTodo}
                    todoToScheduleId={todoToScheduleId}
                    onStartSchedule={(todoId) => setTodoToScheduleId((current) => current === todoId ? null : todoId)}
                  />
                )}
                {activeDockPanel === "agenda" && (
                  <AgendaPanel
                    date={agendaDate}
                    events={agendaEvents}
                    allDayEvents={agendaAllDay}
                    categories={categories}
                    onPrevDay={agendaPrevDay}
                    onNextDay={agendaNextDay}
                    onToday={agendaToday}
                    onPickDate={agendaPickDate}
                    onToggleDone={onAgendaToggleDone}
                    onJump={onAgendaJump}
                    onCreateAllDay={addAllDayEvent}
                    onDeleteAllDay={deleteAllDayEvent}
                  />
                )}
                {activeDockPanel === "tracker" && (
                  <TrackerPanel
                    tab={trackerTab}
                    onTabChange={setTrackerTab}
                    year={year}
                    categories={categories}
                    loading={trackerLoading}
                    stats={trackerStats}
                    onRefresh={refreshTracker}
                    weekLabel={formatRange(new Date(isoCur + "T00:00:00"))}
                    weekStats={weekStats}
                    weekLoading={weekStatsLoading}
                    onRefreshWeek={computeWeekStats}
                    selectedCats={selectedDashCats}
                    onToggleSelectedCat={toggleSelectedDashCat}
                    markedWeeks={markedWeeks}
                    counterLoading={counterLoading}
                    counterResult={counterResult}
                    onComputeCounter={computeCounterStats}
                    onResetCounter={resetCounter}
                  />
                )}
                {activeDockPanel === "templates" && (
                  <TemplatesPanel
                    templates={templates}
                    markedWeeks={markedWeeks}
                    markedDays={markedDays}
                    onApplyWeekToMarked={applyWeekTemplateToMarked}
                    onApplyWeekRange={applyWeekTemplateFromRange}
                    onApplyDayToMarked={(t) => applyDayTemplate(t, [...markedDays].map((key) => { const [iso, d] = key.split("_"); return { iso, d: Number(d) }; }))}
                    onDeleteTemplate={deleteTemplate}
                    onOpenCreateModal={() => setTemplateModalOpen(true)}
                    applyMode={templateApplyMode}
                    onApplyModeChange={setTemplateApplyMode}
                    weekTileView={viewMode === "weekTiles"}
                    onToggleWeekTileView={() => setViewMode((v) => (v === "weekTiles" ? "weeks" : "weekTiles"))}
                  />
                )}
                {activeDockPanel === "clearRange" && (
                  <div className="clear-range-panel">
                    <div className="dock-panel-title-row">
                      <CalendarRange size={15} />
                      <span>{t("Очистка календаря")}</span>
                    </div>
                    <div className="hint-text">{t("Выберите масштаб календаря и период, затем нажмите «Очистить».")}</div>
                    {clearRangeScope === "week" && <div className="hint-text">{t("Выберите неделю на плитках календаря.")}</div>}
                    <div className="clear-range-mode-grid" role="group" aria-label={t("Масштаб и период очистки")}>
                      {[
                        ["week", "Неделя"],
                        ["month", "Месяц"],
                        ["year", "Год"],
                        ["custom", "Произвольный"],
                      ].map(([scope, label]) => (
                        <button
                          key={scope}
                          type="button"
                          className={`segmented-option ${clearRangeScope === scope ? "active" : ""}`}
                          aria-pressed={clearRangeScope === scope}
                          onClick={() => setClearRangeMode(scope)}
                        >
                          {t(label)}
                        </button>
                      ))}
                    </div>
                    {(clearRangeScope === "month" || clearRangeScope === "year") && (
                      <div className="clear-range-period-fields">
                        {clearRangeScope === "month" && (
                          <label className="clear-range-field">
                            <span className="field-label">{t("Месяц")}</span>
                            <select className="time-input" value={clearRangeMonth} onChange={(e) => setClearRangeMonth(Number(e.target.value))}>
                              {MONTHS_NOM.map((month, index) => <option key={month} value={index}>{t(month)}</option>)}
                            </select>
                          </label>
                        )}
                        <label className="clear-range-field">
                          <span className="field-label">{t("Год")}</span>
                          <input
                            type="number"
                            min="1"
                            max="9999"
                            className="time-input"
                            value={clearRangeYear}
                            onChange={(e) => {
                              const nextYear = e.target.value === "" ? 0 : Number(e.target.value);
                              setClearRangeYear(nextYear);
                              if (clearRangeScope === "month" && nextYear >= 1 && nextYear <= 9999) setYear(nextYear);
                            }}
                          />
                        </label>
                      </div>
                    )}
                    {clearRangeScope === "custom" && (
                      <div className="clear-range-custom-ranges">
                        {[{ start: clearRangeStart, end: clearRangeEnd }, ...clearRangeAdditional].map((range, index) => (
                          <div className="clear-range-custom-row" key={`range-${index}`}>
                            <label className="clear-range-field">
                              <span className="field-label">{t("С даты")}</span>
                              <input
                                type="date"
                                className="time-input"
                                value={range.start}
                                onChange={(e) => {
                                  if (index === 0) setClearRangeStart(e.target.value);
                                  else setClearRangeAdditional((previous) => previous.map((item, itemIndex) => itemIndex === index - 1 ? { ...item, start: e.target.value } : item));
                                }}
                              />
                            </label>
                            <label className="clear-range-field">
                              <span className="field-label">{t("По дату включительно")}</span>
                              <input
                                type="date"
                                className="time-input"
                                value={range.end}
                                onChange={(e) => {
                                  if (index === 0) setClearRangeEnd(e.target.value);
                                  else setClearRangeAdditional((previous) => previous.map((item, itemIndex) => itemIndex === index - 1 ? { ...item, end: e.target.value } : item));
                                }}
                              />
                            </label>
                            {index > 0 && (
                              <button
                                type="button"
                                className="icon-btn subtle clear-range-remove"
                                title={t("Удалить этот интервал")}
                                aria-label={t("Удалить этот интервал")}
                                onClick={() => setClearRangeAdditional((previous) => previous.filter((_, itemIndex) => itemIndex !== index - 1))}
                              >
                                <X size={15} />
                              </button>
                            )}
                          </div>
                        ))}
                        <button type="button" className="btn btn-ghost btn-sm clear-range-add" onClick={() => setClearRangeAdditional((previous) => [...previous, { start: "", end: "" }])}>
                          <CalendarPlus size={14} /> {t("Добавить интервал")}
                        </button>
                      </div>
                    )}
                    <div className="clear-range-summary">
                      <CalendarRange size={16} aria-hidden="true" />
                      <div>
                        {clearRangeDates.map((range, index) => (
                          <div key={`preview-${index}`}>{clearRangeDates.length > 1 ? `${index + 1}. ` : ""}{range.start || "—"} — {range.end || "—"}</div>
                        ))}
                      </div>
                    </div>
                    <div className="clear-range-warning">{t("Удаляются только записи в клетках календаря. События на весь день и дела без времени не затрагиваются. Операцию можно отменить через Ctrl+Z.")}</div>
                    {clearRangeError && <div className="clear-range-error" role="alert">{clearRangeError}</div>}
                    <button type="button" onClick={clearCalendarRange} disabled={clearRangeBusy} className="btn btn-danger btn-sm clear-range-apply">
                      <Eraser size={14} /> {clearRangeBusy ? t("Очищаем...") : t("Очистить выбранные периоды")}
                    </button>
                  </div>
                )}
                {activeDockPanel === "recurring" && (
                  <RecurringPanel
                    categories={categories}
                    rules={recurringRules}
                    busy={recurringBusy}
                    onCreate={createRecurringRule}
                    onDelete={deleteRecurringRule}
                    onReapply={reapplyRecurringRule}
                  />
                )}
                {activeDockPanel === "script" && (
                  <ScriptPanel
                    scripts={planScripts}
                    onSave={savePlanScriptDraft}
                    onDelete={removePlanScript}
                    onPreview={previewPlanScript}
                    onApply={applyPlanScriptPreview}
                    onCancelPreview={() => setScriptPreview(null)}
                    preview={scriptPreview}
                    busy={scriptBusy}
                    error={scriptError}
                    onRunTerminal={runPlanScriptTerminal}
                    terminalOutput={terminalOutput}
                    terminalError={terminalError}
                    terminalBusy={terminalBusy}
                    watchers={planWatchers}
                    onSaveWatcher={savePlanScriptWatcher}
                    onDeleteWatcher={removePlanScriptWatcher}
                    onToggleWatcher={togglePlanScriptWatcher}
                  />
                )}
                {activeDockPanel === "glossary" && <GlossaryPanel />}
                {activeDockPanel === "settings" && (
                  <div className="dock-settings-panel">
                    <div className="dock-panel-title-row">
                      <span>{t("Настройки")}</span>
                      {isSettingsPending && <span className="hint-text" style={{ marginLeft: 8 }}>{t("пересчитываю сетку...")}</span>}
                    </div>
                    <div className="settings-col">
                      <LanguageSelector />
                      <label className="field-inline">начало дня <input type="time" value={minToTime(settings.dayStart)} onChange={(e) => updateSettings({ dayStart: timeToMin(e.target.value) })} className="time-input" /></label>
                      <label className="field-inline">конец дня <input type="time" value={minToTime(settings.dayEnd === 1440 ? 0 : settings.dayEnd)} onChange={(e) => { const v = timeToMin(e.target.value); updateSettings({ dayEnd: v === 0 ? 1440 : v }); }} className="time-input" /></label>
                      <label className="field-inline">шаг клетки
                        <select value={settings.cellMin} onChange={(e) => updateSettings({ cellMin: Number(e.target.value) })} className="time-input">
                          {[5, 10, 15, 30, 60].map((m) => <option key={m} value={m}>{m} мин</option>)}
                        </select>
                      </label>
                      <div className="field-label">Тема</div>
                      <div className="segmented theme-segmented">
                        <button onClick={() => updateSettings({ theme: "light" })} className={`segmented-option ${settings.theme === "light" ? "active" : ""}`}>Спокойная</button>
                        <button onClick={() => updateSettings({ theme: "calm" })} className={`segmented-option ${settings.theme === "calm" ? "active" : ""}`}>Светлая</button>
                        <button onClick={() => updateSettings({ theme: "dark" })} className={`segmented-option ${settings.theme === "dark" ? "active" : ""}`}>Тёмная</button>
                      </div>
                      <div className="hint-text">Размер окна приложение запоминает само - просто перетащите край окна, при следующем запуске он восстановится.</div>
                      <NotificationsSettings
                        language={language}
                        enabled={settings.notificationsEnabled}
                        leadMin={settings.notifyLeadMin}
                        onToggle={(v) => updateSettings({ notificationsEnabled: v })}
                        onLeadChange={(v) => updateSettings({ notifyLeadMin: v })}
                      />
                      <div className="template-group-title">Резервная копия и экспорт</div>
                      <div className="dock-io-row">
                        <button onClick={exportData} disabled={busyIO} title="Скачать полную резервную копию базы данных в JSON" className="btn btn-ghost btn-sm"><Download size={13} /> Экспорт JSON</button>
                        <button onClick={() => fileInputRef.current?.click()} disabled={busyIO} title="Импортировать и заменить данные из резервной копии JSON" className="btn btn-ghost btn-sm"><Upload size={13} /> Импорт JSON</button>
                        <input ref={fileInputRef} type="file" accept="application/json" onChange={importData} style={{ display: "none" }} />
                      </div>
                      <div className="dock-io-row">
                        <button onClick={exportAllReflections} disabled={busyIO} title="Экспортировать рефлексии за все годы в формате Markdown" className="btn btn-ghost btn-sm"><Download size={13} /> Экспорт рефлексий (.md)</button>
                      </div>
                    </div>
                  </div>
                )}
                {activeDockPanel === "search" && (
                  <div className="dock-search-panel">
                    <div className="dock-panel-title-row"><span>Поиск и переходы</span></div>
                    <div className="search-row">
                      <Search size={14} className="search-icon" />
                      <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && runTextSearch()} placeholder="текст записи или дата 24.08.2026" className="search-input" />
                      <button onClick={runTextSearch} className="btn btn-ghost btn-sm">{searching ? "Ищу..." : "Найти"}</button>
                    </div>
                    {searchResults && searchResults.length > 0 && (
                      <div className="search-results">
                        {searchResults.map((res, i) => (
                          <div key={i} onClick={() => goToResult(res)} className="search-result-item">
                            <span data-no-translate>{res.text}</span>
                            <span className="hint-text">{WEEKDAYS_SHORT[res.d]}, {formatRange(res.monday)}, {minToTime(weekDayStart(res.iso) + res.r * weekCellMin(res.iso))}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {searchResults && searchResults.length === 0 && (
                      <div className="hint-text pad-sm">Ничего не найдено за {year} год.</div>
                    )}

                    <div className="template-group-title">Перейти к дате</div>
                    <div className="date-jump-row">
                      <CalendarDays size={14} className="search-icon" />
                      <input type="date" value={jumpDate} onChange={(e) => setJumpDate(e.target.value)} className="time-input" />
                      <button onClick={() => jumpDate && jumpToDate(new Date(jumpDate + "T00:00:00"))} disabled={!jumpDate} className="btn btn-ghost btn-sm">Перейти</button>
                    </div>

                    <div className="template-group-title">Календарь (.ics)</div>
                    <div className="hint-text" style={{ marginBottom: 6 }}>Стандартный формат календаря - чтобы забрать события в Google/Apple Calendar или наоборот подтянуть их сюда.</div>
                    <div className="dock-io-row">
                      <button onClick={exportICS} disabled={busyIO} title="Скачать все события года в .ics" className="btn btn-ghost btn-sm"><CalendarPlus size={13} /> Экспорт .ics</button>
                      <button onClick={() => icsInputRef.current?.click()} disabled={busyIO} title="Загрузить события из .ics-файла" className="btn btn-ghost btn-sm"><Upload size={13} /> Импорт .ics</button>
                      <input ref={icsInputRef} type="file" accept=".ics,text/calendar" onChange={importICS} style={{ display: "none" }} />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
          <div className="dock-rail">
            <button onClick={() => setActiveDockPanel((p) => (p === "categories" ? null : "categories"))} className={`dock-rail-btn ${activeDockPanel === "categories" ? "active" : ""}`} title="Категории (C)">
              {keyTip("C")}<Palette size={17} />
            </button>
            <button onClick={() => setActiveDockPanel((p) => (p === "todo" ? null : "todo"))} className={`dock-rail-btn ${activeDockPanel === "todo" ? "active" : ""}`} title="Дела без времени (L)">
              {keyTip("L")}<ListTodo size={17} />
            </button>
            <button onClick={() => setActiveDockPanel((p) => (p === "agenda" ? null : "agenda"))} className={`dock-rail-btn ${activeDockPanel === "agenda" ? "active" : ""}`} title="Агенда дня (D)">
              {keyTip("D")}<ListChecks size={17} />
            </button>
            <button onClick={() => setActiveDockPanel((p) => (p === "tracker" ? null : "tracker"))} className={`dock-rail-btn ${activeDockPanel === "tracker" ? "active" : ""}`} title="Трекер выполнения по категориям, часы за неделю и счётчик по интервалу (T)">
              {keyTip("T")}<ClipboardCheck size={17} />
            </button>
            <button onClick={() => setActiveDockPanel((p) => (p === "templates" ? null : "templates"))} className={`dock-rail-btn ${activeDockPanel === "templates" ? "active" : ""}`} title="Шаблоны (M)">
              {keyTip("M")}<LayoutTemplate size={17} />
            </button>
            <button onClick={() => setActiveDockPanel((p) => (p === "recurring" ? null : "recurring"))} className={`dock-rail-btn ${activeDockPanel === "recurring" ? "active" : ""}`} title="Повторяющиеся события (P)">
              {keyTip("P")}<Repeat size={17} />
            </button>
            <button onClick={() => setActiveDockPanel((p) => (p === "script" ? null : "script"))} className={`dock-rail-btn ${activeDockPanel === "script" ? "active" : ""}`} title="PlanScript (X)">
              {keyTip("X")}<Code2 size={17} />
            </button>
            <button onClick={() => setActiveDockPanel((p) => (p === "glossary" ? null : "glossary"))} className={`dock-rail-btn ${activeDockPanel === "glossary" ? "active" : ""}`} title="Глоссарий и горячие клавиши (G)">
              {keyTip("G")}<BookOpen size={17} />
            </button>
            <button onClick={() => setActiveDockPanel((p) => (p === "search" ? null : "search"))} className={`dock-rail-btn ${activeDockPanel === "search" ? "active" : ""}`} title="Поиск и календарь (F)">
              {keyTip("F")}<Search size={17} />
            </button>
            <button onClick={() => activeDockPanel === "clearRange" ? setActiveDockPanel(null) : openClearRangeDialog()} className={`dock-rail-btn ${activeDockPanel === "clearRange" ? "active" : ""}`} title={`${t("Инструмент очистки периода")} (E)`}>
              {keyTip("E")}<CalendarRange size={17} />
            </button>
            <button onClick={() => setActiveDockPanel((p) => (p === "settings" ? null : "settings"))} className={`dock-rail-btn ${activeDockPanel === "settings" ? "active" : ""}`} title={`${t("Настройки")} (S)`}>
              {keyTip("S")}<Settings2 size={17} />
            </button>
            <div className="dock-rail-peek" title="Инструменты (наведите)"><ChevronsLeft size={12} /></div>
          </div>
        </div>
      </div>
    </div>

  );
}

export default function Planner() {
  return <I18nProvider><PlannerContent /></I18nProvider>;
}
