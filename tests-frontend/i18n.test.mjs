import assert from "node:assert/strict";
import { t } from "../src/i18n.js";

assert.equal(t("Номера недель повтора", "en"), "Recurring week numbers");
assert.equal(t("Текст", "en"), "Text");
assert.equal(t("Время начала", "en"), "Start time");
assert.equal(t("Команды", "en"), "Actions");
assert.equal(t("Месяц...", "en"), "Month...");
assert.equal(t("Неделя", "en"), "Week");
assert.equal(t("Очистка календаря", "en"), "Clear calendar");
assert.equal(t("Панель PlanScript: скрипты, наблюдатели и терминал только для чтения", "en"), "PlanScript panel: scripts, watchers, and a read-only terminal");
assert.equal(
  t("Встроенный язык приложения для автоматизации календаря. Скрипты помогают размечать недели и дни; перед применением можно посмотреть предварительный результат. Наблюдатели автоматически рассчитывают индикаторы, а терминал позволяет выполнять только команды чтения данных.", "en"),
  "The app's built-in language for calendar automation. Scripts can schedule weeks and days, with a preview available before applying changes. Watchers calculate indicators automatically, and the terminal only allows read-only commands.",
);
assert.equal(
  t("Инструмент на правом рельсе (клавиша E): очищает записи в клетках одной или нескольких недель, одного или нескольких месяцев выбранного года, одного или нескольких годов либо нескольких произвольных диапазонов дат. Недели, месяцы и годы выбираются чекбоксами прямо на плитках календаря; названия недель во время очистки недоступны для редактирования. Перед очисткой показывается сводка. События на весь день и дела без времени не затрагиваются. Операцию можно отменить через Ctrl+Z.", "en"),
  "Tool on the right rail (E): clears cell entries in one or more weeks, one or more months in the selected year, one or more years, or multiple custom date ranges. Weeks, months, and years are selected with checkboxes directly on the calendar tiles; week names cannot be edited while clearing. A summary is shown before clearing. All-day events and untimed tasks are not affected. Press Ctrl+Z to undo.",
);
assert.equal(t("Настройки", "en"), "Settings");
assert.equal(t("Настройки (S)", "en"), "Settings (S)");
assert.equal(t("Месяц", "en"), "Month");
assert.equal(t("Произвольный интервал", "en"), "Custom date range");
assert.equal(t("Очистить дни", "en"), "Clear days");
assert.equal(t("Очистить календарный диапазон", "en"), "Clear calendar date range");
assert.equal(t("Отметьте галочками годы, которые нужно очистить.", "en"), "Check the years you want to clear.");
assert.equal(t("Отметьте один или несколько месяцев в календаре.", "en"), "Check one or more months in the calendar.");
assert.equal(t("Название недели", "en"), "Week name");
assert.equal(t("Введите название недели (например, «Учебная неделя 1»)", "en"), "Enter a week name (for example, “Study week 1”)");
assert.equal(t("Отметьте одну или несколько недель на плитках календаря; названия недель во время очистки не редактируются.", "en"), "Check one or more weeks on the calendar tiles; week names cannot be edited while clearing.");
assert.equal(t("Кнопка выбора цвета заливки", "en"), "Fill color picker button");
assert.equal(t("В режиме «Заливка» округлая кнопка с образцом цвета открывает выбор произвольного цвета без категории.", "en"), "In Paint mode, the rounded color swatch button opens the picker for a custom color without a category.");
assert.equal(t("Название недели на плитке", "en"), "Week name on a tile");
assert.equal(t("Введите название в поле на плитке недели в режиме «Недели плитками»; оно сохраняется отдельно от клеток календаря. Во время очистки редактирование названий заблокировано, а недели выбираются чекбоксами.", "en"), "Enter a name in the week tile field in Week tiles view; it is stored separately from calendar cells. Names are locked while clearing, and checkboxes select the weeks.");
assert.equal(t("Добавьте категории в частые, нажав на звёздочку.", "en"), "Add categories to Frequent by clicking the star.");
assert.equal(t("Удалить все записи в этой строке недели на все 7 дней?", "en"), "Delete all entries in this time row across all 7 days?");
assert.equal(t("Ctrl+Shift+1: недели; 2: недели плитками; 3: месяцы; 4: годы", "en"), "Ctrl+Shift+1: weeks; 2: week tiles; 3: months; 4: years");
assert.equal(t("Прокрутка по неделям - Q или клик, чтобы выключить", "en"), "Scroll by weeks — press Q or click to turn off");
assert.equal(t("Автопрокрутка вверх - клик, чтобы остановить", "en"), "Auto-scroll up — click to stop");
assert.equal(t("«Позвонить врачу» назначено на это время", "en"), "“Позвонить врачу” scheduled for this time");
assert.equal(t("Не удалось назначить дело: database is locked", "en"), "Could not schedule task: database is locked");
assert.equal(t("Шаблон «Мой шаблон» применён к неделе", "en"), "Template “Мой шаблон” applied to неделе");
assert.equal(t("Интервал", "en"), "Range");
assert.equal(t("Год", "en"), "Year");
assert.equal(t("Шаблоны недели", "en"), "Week templates");
assert.equal(t("Шаблоны дня", "en"), "Day templates");
assert.equal(t("Пока нет сохранённых шаблонов недели.", "en"), "No saved week templates yet.");
assert.equal(t("Пока нет сохранённых шаблонов дня.", "en"), "No saved day templates yet.");
assert.equal(t("пусто", "en"), "Empty");
assert.equal(t("+ Завести год", "en"), "+ Create year");
assert.equal(t("запланировано", "en"), "planned");
assert.equal(t("перенесено", "en"), "moved");
assert.equal(t("Трекер по категориям - 2026", "en"), "Category tracker — 2026");
assert.equal(t("выполнено (22%)", "en"), "completed (22%)");
assert.equal(t("Рефлексия дня - 2025-12-29", "en"), "Daily reflection — 2025-12-29");
assert.equal(t("Повторяющиеся события (P)", "en"), "Recurring events (P)");
assert.equal(
  t("Заводит регулярное дело (пары, тренировки, созвоны) сразу на несколько недель вперёд, по шаблону недель. Первая клетка блока — заголовок, остальное просто закрашено, как при заливке.", "en"),
  "Schedule a recurring task (classes, workouts, calls) for multiple weeks using a weekly pattern. The first cell is the heading; the rest are filled as with Paint.",
);
assert.equal(t("Untimed tasks panel", "en"), "Untimed tasks panel");
assert.equal(
  t("Для того, что не привязано к конкретному часу - «купить подарок», «позвонить в поликлинику». Можно перетащить прямо на клетку недели, чтобы назначить время.", "en"),
  "For tasks without a fixed time, such as “buy a gift” or “call the clinic.” Drag one onto a week cell to schedule it.",
);
assert.equal(t("Шаг сетки", "en"), "Grid interval");
assert.equal(t("Начало", "en"), "Start");
assert.equal(t("Конец", "en"), "End");
assert.equal(t("Общие часы", "en"), "Default hours");
assert.equal(t("Общий: 30 мин", "en"), "Default: 30 min");
assert.equal(t("Шаг сетки недели 2026-11-02", "en"), "Grid interval for week 2026-11-02");
assert.equal(t("Показать настройки времени недели", "en"), "Show week time settings");
assert.equal(t("Скрыть настройки времени недели", "en"), "Hide week time settings");
assert.equal(t("Открыть рефлексию за 2026-11-08", "en"), "Open reflection for 2026-11-08");
assert.equal(t("протяните мышью - закрасит в цвет «Работа»", "en"), "drag to paint with “Работа”");
assert.equal(
  t("Повторов: 4. День и время: Tue, 08:30-10:00.", "en"),
  "Occurrences: 4. Day and time: Tue, 08:30–10:00.",
);
assert.equal(
  t("Создать правило «Тренировка»? Будет размечено Повторов: 4. Первый: 2026-10-06; последний: 2026-10-27. Конфликты: Заменять только время события.", "en"),
  "Create rule “Тренировка”? Schedule 4 occurrences from 2026-10-06 through 2026-10-27; replace only overlapping time ranges.",
);
assert.equal(
  t("Повторно разметить «Тренировка»? Будет обработано 4 событий с 2026-10-06 по 2026-10-27.", "en"),
  "Apply “Тренировка” again? 4 occurrences will be processed from 2026-10-06 through 2026-10-27.",
);

console.log("i18n scenario tests passed");
