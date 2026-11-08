import assert from "node:assert/strict";
import { recurringWeekNumbers } from "../src/utils.js";

assert.deepEqual(recurringWeekNumbers("all", "", 4), [1, 2, 3, 4]);
assert.deepEqual(recurringWeekNumbers("even", "", 5), [2, 4]);
assert.deepEqual(recurringWeekNumbers("odd", "", 5), [1, 3, 5]);
assert.deepEqual(recurringWeekNumbers("custom", "2-4,4,1", 5), [1, 2, 3, 4]);
assert.deepEqual(recurringWeekNumbers("custom", "5-3", 5), [3, 4, 5]);

assert.throws(() => recurringWeekNumbers("all", "", 0), /от 1 до 520/);
assert.throws(() => recurringWeekNumbers("all", "", 521), /от 1 до 520/);
assert.throws(() => recurringWeekNumbers("custom", "", 5), /формате 2-17,20/);
assert.throws(() => recurringWeekNumbers("custom", "1,,3", 5), /формате 2-17,20/);
assert.throws(() => recurringWeekNumbers("custom", "1-999999999", 5), /выбранный диапазон/);
assert.throws(() => recurringWeekNumbers("biweekly", "", 5), /Неизвестный тип повтора/);

console.log("recurring scenario tests passed");
