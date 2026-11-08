import { t } from "../i18n.js";

const NAME_START = /[\p{L}_]/u;
const NAME_CONTINUE = /[\p{L}\p{N}_]/u;
const CONTROL_WORDS = new Set(["for", "in", "if", "elif", "else", "and", "or", "not", "def", "return", "break", "continue", "assert", "watch", "every"]);

export class ScriptSyntaxError extends Error {
  constructor(message, line, column) {
    super(`${t(message)} (${t("строка")} ${line}, ${t("столбец")} ${column})`);
    this.name = "ScriptSyntaxError";
    this.line = line;
    this.column = column;
  }
}

export function lex(source) {
  const tokens = [];
  const indents = [0];
  const lines = String(source).replace(/\r\n?/g, "\n").split("\n");
  const nextCodeLine = new Array(lines.length).fill(-1);
  let nextCodeLineIndex = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    nextCodeLine[i] = nextCodeLineIndex;
    if (lines[i].trim() && !lines[i].trimStart().startsWith("#")) nextCodeLineIndex = i;
  }
  let indentWidth = null;
  let bracketDepth = 0;

  const emit = (type, value, line, column) => tokens.push({ type, value, line, column });

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const text = lines[lineIndex];
    let pos = 0;
    const chainedLine = /^\s*\./.test(text);
    if (bracketDepth === 0) {
      while (text[pos] === " " || text[pos] === "\t") {
        if (text[pos] === "\t") throw new ScriptSyntaxError("Табы в отступах не поддерживаются", lineIndex + 1, pos + 1);
        pos++;
      }
      if (pos === text.length || text[pos] === "#") continue;
      if (!chainedLine) {
        if (indentWidth === null && pos > 0) indentWidth = pos;
        if (indentWidth !== null && pos % indentWidth !== 0) {
          throw new ScriptSyntaxError("Отступ должен быть кратен ширине первого уровня", lineIndex + 1, 1);
        }
        const currentIndent = indents[indents.length - 1];
        if (pos > currentIndent) {
          indents.push(pos);
          emit("INDENT", pos, lineIndex + 1, 1);
        } else if (pos < currentIndent) {
          while (pos < indents[indents.length - 1]) {
            indents.pop();
            emit("DEDENT", pos, lineIndex + 1, 1);
          }
          if (pos !== indents[indents.length - 1]) {
            throw new ScriptSyntaxError("Несогласованный уровень отступа", lineIndex + 1, 1);
          }
        }
      }
    }

    while (pos < text.length) {
      const ch = text[pos];
      if (/\s/.test(ch)) { pos++; continue; }
      if (ch === "#") {
        const color = text.slice(pos).match(/^#[\da-fA-F]{6}\b/);
        if (color) {
          emit("COLOR", color[0].toUpperCase(), lineIndex + 1, pos + 1);
          pos += color[0].length;
          continue;
        }
        break;
      }
      if (ch === "'" || ch === '"') {
        const quote = ch;
        const start = pos++;
        let value = "";
        let closed = false;
        while (pos < text.length) {
          const c = text[pos++];
          if (c === quote) { closed = true; break; }
          if (c === "\\") {
            if (pos >= text.length) break;
            const escaped = text[pos++];
            value += ({ n: "\n", r: "\r", t: "\t", "\\": "\\", "'": "'", '"': '"' })[escaped] ?? escaped;
          } else {
            value += c;
          }
        }
        if (!closed) throw new ScriptSyntaxError("Строка не закрыта", lineIndex + 1, start + 1);
        emit("STRING", value, lineIndex + 1, start + 1);
        continue;
      }
      const date = text.slice(pos).match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?!\d)/);
      if (date) {
        emit("DATE", `${date[1]}.${date[2]}.${date[3]}`, lineIndex + 1, pos + 1);
        pos += date[0].length;
        continue;
      }
      const time = text.slice(pos).match(/^(\d{1,2}):(\d{2})/);
      if (time) {
        emit("TIME", `${time[1]}:${time[2]}`, lineIndex + 1, pos + 1);
        pos += time[0].length;
        continue;
      }
      const number = text.slice(pos).match(/^\d+(?:\.\d+)?/);
      if (number) {
        pos += number[0].length;
        const duration = text.slice(pos).match(/^(?:h(?:\d+m?)?|m)\b/);
        if (duration) {
          emit("DURATION", `${number[0]}${duration[0]}`, lineIndex + 1, pos - number[0].length + 1);
          pos += duration[0].length;
        } else {
          emit("NUMBER", Number(number[0]), lineIndex + 1, pos - number[0].length + 1);
        }
        continue;
      }
      if (NAME_START.test(ch)) {
        const start = pos++;
        while (pos < text.length && NAME_CONTINUE.test(text[pos])) pos++;
        const value = text.slice(start, pos);
        emit(CONTROL_WORDS.has(value) ? value : "NAME", value, lineIndex + 1, start + 1);
        continue;
      }
      const operator = ["+=", "-=", "*=", "/=", "==", "!=", "<=", ">=", ".."].find((item) => text.startsWith(item, pos));
      if (operator) {
        emit(operator, operator, lineIndex + 1, pos + 1);
        pos += operator.length;
        continue;
      }
      if ("+-*/%=<>():,.[]".includes(ch)) {
        emit(ch, ch, lineIndex + 1, pos + 1);
        if ("([{".includes(ch)) bracketDepth++;
        if (")]}".includes(ch)) bracketDepth--;
        if (bracketDepth < 0) throw new ScriptSyntaxError("Лишняя закрывающая скобка", lineIndex + 1, pos + 1);
        pos++;
        continue;
      }
      throw new ScriptSyntaxError(`Неизвестный символ «${ch}»`, lineIndex + 1, pos + 1);
    }
    if (bracketDepth === 0) {
      const nextIndex = nextCodeLine[lineIndex];
      const next = nextIndex < 0 ? null : lines[nextIndex];
      if (!next || !/^\s*\./.test(next)) emit("NEWLINE", "\n", lineIndex + 1, text.length + 1);
    }
  }
  if (bracketDepth !== 0) throw new ScriptSyntaxError("Не закрыта скобка", lines.length, 1);
  while (indents.length > 1) {
    indents.pop();
    emit("DEDENT", 0, lines.length, 1);
  }
  emit("EOF", null, lines.length, 1);
  return tokens;
}
