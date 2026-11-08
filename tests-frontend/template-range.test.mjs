import assert from "node:assert/strict";
import { expandWeekRange } from "../src/utils.js";

assert.deepEqual(
  expandWeekRange({ startDate: "2026-10-28", endMode: "count", weeksCount: 5, filterType: "even" }),
  ["2026-11-02", "2026-11-16"],
);
assert.deepEqual(
  expandWeekRange({ startDate: "2026-10-28", endMode: "date", endDate: "2026-11-18", filterType: "cycle", cyclePeriod: 2 }),
  ["2026-10-26", "2026-11-09"],
);
assert.deepEqual(
  expandWeekRange({ startDate: "2026-10-26", endMode: "count", weeksCount: 4, filterType: "custom", customRanges: "2-3,4" }),
  ["2026-11-02", "2026-11-09", "2026-11-16"],
);
assert.throws(
  () => expandWeekRange({ startDate: "2026-02-31", endMode: "count", weeksCount: 1 }),
  /корректную дату начала/,
);
assert.throws(
  () => expandWeekRange({ startDate: "2026-10-26", endMode: "count", weeksCount: 0 }),
  /от 1 до 520/,
);
console.log("template range tests passed");
