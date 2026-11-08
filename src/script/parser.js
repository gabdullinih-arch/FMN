import { lex, ScriptSyntaxError } from "./lexer.js";

const KEYWORDS = new Set(["for", "in", "if", "elif", "else", "and", "or", "not", "true", "false", "none", "def", "return", "break", "continue", "assert", "watch", "every"]);

export function parse(source) {
  const tokens = lex(source);
  let current = 0;
  const peek = () => tokens[current];
  const at = (type) => peek().type === type;
  const advance = () => tokens[current++];
  const fail = (message) => {
    const token = peek();
    throw new ScriptSyntaxError(message, token.line, token.column);
  };
  const expect = (type, message = `Ожидалось «${type}»`) => {
    if (!at(type)) fail(message);
    return advance();
  };
  const match = (...types) => {
    if (!types.includes(peek().type)) return false;
    advance();
    return true;
  };

  function parseProgram(stopAtDedent = false) {
    const body = [];
    while (!at("EOF") && !(stopAtDedent && at("DEDENT"))) {
      if (match("NEWLINE")) continue;
      body.push(parseStatement());
    }
    return body;
  }

  function parseStatement() {
    if (match("for")) return parseFor(previous());
    if (match("if")) return parseIf(previous());
    if (match("def")) return parseFunction(previous());
    if (match("watch")) return parseWatch();
    if (match("return")) {
      const value = at("NEWLINE") ? null : parseExpression();
      expect("NEWLINE");
      return { type: "Return", value };
    }
    if (match("break")) { expect("NEWLINE"); return { type: "Break" }; }
    if (match("continue")) { expect("NEWLINE"); return { type: "Continue" }; }
    if (match("assert")) {
      expect("(");
      const test = parseExpression();
      expect(",");
      const message = parseExpression();
      expect(")");
      expect("NEWLINE");
      return { type: "Assert", test, message };
    }

    const expression = parseExpression();
    const targets = [expression];
    if (expression.type === "Name" && match(",")) {
      do { targets.push({ type: "Name", name: expect("NAME", "Ожидалось имя переменной").value }); } while (match(","));
    }
    if (["=", "+=", "-=", "*=", "/="].includes(peek().type)) {
      const operator = advance().type;
      const value = parseExpression();
      expect("NEWLINE");
      if (targets.length > 1 && operator !== "=") fail("Распаковка списка поддерживает только «=»");
      if (expression.type !== "Name" && expression.type !== "Index") fail("Слева от присваивания должно быть имя или индекс списка");
      return { type: "Assign", target: targets.length > 1 ? targets : expression, operator, value };
    }
    if (targets.length > 1) fail("Ожидался оператор «=» после списка переменных");
    expect("NEWLINE");
    return { type: "ExpressionStatement", expression };
  }

  function previous() { return tokens[current - 1]; }

  function parseBlock() {
    expect(":", "После заголовка блока ожидалось «:»");
    expect("NEWLINE", "После «:» ожидался перевод строки");
    expect("INDENT", "Тело блока должно иметь отступ");
    const body = parseProgram(true);
    expect("DEDENT");
    if (body.length === 0) fail("Блок не может быть пустым");
    return body;
  }

  function parseFor() {
    const targets = [expect("NAME", "Ожидалось имя переменной цикла").value];
    while (match(",")) targets.push(expect("NAME").value);
    expect("in");
    const iterable = parseExpression();
    const body = parseBlock();
    return { type: "For", targets, iterable, body };
  }

  function parseIf() {
    const branches = [{ test: parseExpression(), body: parseBlock() }];
    while (match("elif")) branches.push({ test: parseExpression(), body: parseBlock() });
    const alternate = match("else") ? parseBlock() : null;
    return { type: "If", branches, alternate };
  }

  function parseFunction() {
    const name = expect("NAME", "Ожидалось имя функции").value;
    expect("(");
    const params = [];
    if (!at(")")) {
      do { params.push(expect("NAME", "Ожидалось имя параметра").value); } while (match(","));
    }
    expect(")");
    return { type: "Function", name, params, body: parseBlock() };
  }

  function parseWatch() {
    expect("every", "После watch ожидалось every");
    const scope = advance();
    if (scope.type !== "NAME" || !["day", "week"].includes(scope.value)) fail("Ожидалось watch every day или watch every week");
    return { type: "Watch", scope: scope.value, body: parseBlock() };
  }

  function parseExpression() { return parseOr(); }
  function parseOr() {
    let expr = parseAnd();
    while (match("or")) expr = { type: "Binary", operator: "or", left: expr, right: parseAnd() };
    return expr;
  }
  function parseAnd() {
    let expr = parseNot();
    while (match("and")) expr = { type: "Binary", operator: "and", left: expr, right: parseNot() };
    return expr;
  }
  function parseNot() {
    if (match("not")) return { type: "Unary", operator: "not", value: parseNot() };
    return parseComparison();
  }
  function parseComparison() {
    let expr = parseRange();
    while (["==", "!=", "<", "<=", ">", ">=", "in"].includes(peek().type) ||
      (at("not") && tokens[current + 1]?.type === "in")) {
      const operator = match("not") ? "not in" : advance().type;
      if (operator === "not in") advance();
      expr = { type: "Binary", operator, left: expr, right: parseRange() };
    }
    return expr;
  }
  function parseRange() {
    let expr = parseAdditive();
    if (match("..")) expr = { type: "Range", start: expr, end: parseAdditive() };
    return expr;
  }
  function parseAdditive() {
    let expr = parseTerm();
    while (at("+") || at("-")) {
      const operator = advance().type;
      expr = { type: "Binary", operator, left: expr, right: parseTerm() };
    }
    return expr;
  }
  function parseTerm() {
    let expr = parseUnary();
    while (at("*") || at("/") || at("%")) {
      const operator = advance().type;
      expr = { type: "Binary", operator, left: expr, right: parseUnary() };
    }
    return expr;
  }
  function parseUnary() {
    if (match("-")) return { type: "Unary", operator: "-", value: parseUnary() };
    return parsePostfix();
  }
  function parsePostfix() {
    let expr = parsePrimary();
    while (true) {
      if (match(".")) {
        expr = { type: "Member", object: expr, property: expect("NAME", "После точки ожидалось имя свойства").value };
      } else if (match("(")) {
        const args = [];
        if (!at(")")) {
          do {
            if (at("NAME") && tokens[current + 1]?.type === "=") {
              const name = advance().value;
              advance();
              args.push({ name, value: parseExpression() });
            } else {
              args.push({ name: null, value: parseExpression() });
            }
          } while (match(",") && !at(")"));
        }
        expect(")");
        expr = { type: "Call", callee: expr, args };
      } else if (match("[")) {
        const index = parseExpression();
        expect("]");
        expr = { type: "Index", object: expr, index };
      } else break;
    }
    return expr;
  }
  function parsePrimary() {
    const token = advance();
    if (token.type === "NUMBER") return { type: "Literal", value: token.value };
    if (token.type === "STRING") {
      return token.value.includes("${")
        ? { type: "TemplateString", value: token.value }
        : { type: "Literal", value: token.value };
    }
    if (token.type === "COLOR") return { type: "Literal", value: token.value };
    if (token.type === "DATE") return { type: "Literal", value: { kind: "Date", value: token.value } };
    if (token.type === "TIME") return { type: "Literal", value: { kind: "Time", value: token.value } };
    if (token.type === "DURATION") return { type: "Literal", value: { kind: "Duration", value: token.value } };
    if (token.type === "NAME") {
      if (KEYWORDS.has(token.value)) {
        if (token.value === "true") return { type: "Literal", value: true };
        if (token.value === "false") return { type: "Literal", value: false };
        if (token.value === "none") return { type: "Literal", value: null };
        if (["mon", "tue", "wed", "thu", "fri", "sat", "sun"].includes(token.value)) return { type: "Literal", value: { kind: "Weekday", value: token.value } };
        fail(`Недопустимое ключевое слово «${token.value}» в выражении`);
      }
      return { type: "Name", name: token.value };
    }
    if (token.type === "(") {
      const expr = parseExpression();
      expect(")");
      return expr;
    }
    if (token.type === "[") {
      const items = [];
      if (!at("]")) items.push(parseExpression());
      if (match("for")) {
        const target = expect("NAME", "Ожидалось имя переменной включения").value;
        expect("in");
        const iterable = parseExpression();
        const condition = match("if") ? parseExpression() : null;
        expect("]");
        return { type: "ListComprehension", expression: items[0], target, iterable, condition };
      }
      while (match(",") && !at("]")) items.push(parseExpression());
      expect("]");
      return { type: "List", items };
    }
    throw new ScriptSyntaxError("Ожидалось выражение", token.line, token.column);
  }

  return { type: "Program", body: parseProgram() };
}
