/**
 * Numeric-equivalence comparison for short math answers: "9√2π", "9π√2" and
 * "9*sqrt(2)*pi" are the same value in different notations, but the plain
 * token/string matcher `gradeShortDeterministic` uses (see baremGrader.ts)
 * can't see that without every variant spelled out by hand in
 * `acceptedAnswers` — which is exactly what src/data/exams/math-sb26.ts had
 * to do before this module existed, and doesn't scale past one hand-authored
 * paper (see the "как формализуются дисциплины" analysis).
 *
 * This is deliberately NOT a symbolic CAS — it evaluates both sides to a
 * float and compares within a tight relative tolerance, so `evaluateExpression`
 * only recognizes what a short numeric final-answer actually needs: `+ - * /
 * ^`, parens, unary minus, `pi`, `sqrt(...)`/`√` (tight-binding prefix, so
 * `9√2π` parses as `9 * sqrt(2) * π`, matching how it's written in the real
 * ANCE barem). Anything else it can't evaluate (an inequality like "t>3", an
 * interval like "(3;+∞)") returns `undefined` and `answersEquivalent` falls
 * back to a normalized string comparison — never worse than plain string
 * matching, sometimes (numbers) much better.
 */

type Token =
  | { kind: 'num'; value: number }
  | { kind: 'ident'; name: 'pi' | 'sqrt' }
  | { kind: 'sqrt' }
  | { kind: 'lparen' }
  | { kind: 'rparen' }
  | { kind: 'op'; op: '+' | '-' | '*' | '/' | '^' }

const LETTER_RE = /[a-zA-Zа-яА-Я]/

/** Tokenizes as much of `s` as it recognizes, then stops — trailing content it
 * doesn't understand (a unit like " см", a stray word) is simply left
 * untokenized rather than erroring, so callers can still evaluate the
 * meaningful prefix. */
function tokenize(s: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  while (i < s.length) {
    const ch = s[i]!
    if (ch === ' ' || ch === '\t') {
      i++
      continue
    }
    if ((ch >= '0' && ch <= '9') || ch === '.') {
      let j = i
      while (j < s.length && ((s[j]! >= '0' && s[j]! <= '9') || s[j] === '.')) j++
      const value = Number(s.slice(i, j))
      if (!Number.isFinite(value)) break
      tokens.push({ kind: 'num', value })
      i = j
      continue
    }
    if (ch === '√') {
      tokens.push({ kind: 'sqrt' })
      i++
      continue
    }
    if (ch === 'π') {
      tokens.push({ kind: 'ident', name: 'pi' })
      i++
      continue
    }
    if (ch === '(') {
      tokens.push({ kind: 'lparen' })
      i++
      continue
    }
    if (ch === ')') {
      tokens.push({ kind: 'rparen' })
      i++
      continue
    }
    if (ch === '+') {
      tokens.push({ kind: 'op', op: '+' })
      i++
      continue
    }
    if (ch === '-' || ch === '−' || ch === '–') {
      tokens.push({ kind: 'op', op: '-' })
      i++
      continue
    }
    if (ch === '*' || ch === '×' || ch === '·') {
      tokens.push({ kind: 'op', op: '*' })
      i++
      continue
    }
    if (ch === '/' || ch === '÷') {
      tokens.push({ kind: 'op', op: '/' })
      i++
      continue
    }
    if (ch === '^') {
      tokens.push({ kind: 'op', op: '^' })
      i++
      continue
    }
    if (LETTER_RE.test(ch)) {
      const rest = s.slice(i)
      if (/^pi(?![a-zа-я])/i.test(rest)) {
        tokens.push({ kind: 'ident', name: 'pi' })
        i += 2
        continue
      }
      if (/^sqrt(?![a-zа-я])/i.test(rest)) {
        tokens.push({ kind: 'ident', name: 'sqrt' })
        i += 4
        continue
      }
      // An unrecognized word (a unit like "см", stray text) — not part of the
      // expression; stop here rather than guessing.
      break
    }
    // Any other unrecognized character — same reasoning.
    break
  }
  return tokens
}

/** Inserts an explicit `*` between adjacent tokens that have no operator
 * between them ("9π" -> "9 * π", "9√2" -> "9 * √2"), matching how these
 * answers are actually typeset. */
function insertImplicitMultiplication(tokens: Token[]): Token[] {
  const endsValue = (t: Token) => t.kind === 'num' || t.kind === 'rparen' || (t.kind === 'ident' && t.name === 'pi')
  const startsValue = (t: Token) => t.kind === 'num' || t.kind === 'lparen' || t.kind === 'sqrt' || t.kind === 'ident'

  const out: Token[] = []
  for (const cur of tokens) {
    const prev = out[out.length - 1]
    if (prev && endsValue(prev) && startsValue(cur)) {
      out.push({ kind: 'op', op: '*' })
    }
    out.push(cur)
  }
  return out
}

interface ParseResult {
  value: number
  next: number
}

function parseExpr(tokens: Token[], pos: number): ParseResult | undefined {
  let left = parseTerm(tokens, pos)
  if (!left) return undefined
  for (;;) {
    const t: Token | undefined = tokens[left.next]
    if (t?.kind === 'op' && (t.op === '+' || t.op === '-')) {
      const right = parseTerm(tokens, left.next + 1)
      if (!right) return undefined
      left = { value: t.op === '+' ? left.value + right.value : left.value - right.value, next: right.next }
    } else {
      break
    }
  }
  return left
}

function parseTerm(tokens: Token[], pos: number): ParseResult | undefined {
  let left = parseUnary(tokens, pos)
  if (!left) return undefined
  for (;;) {
    const t: Token | undefined = tokens[left.next]
    if (t?.kind === 'op' && (t.op === '*' || t.op === '/')) {
      const right = parseUnary(tokens, left.next + 1)
      if (!right) return undefined
      left = { value: t.op === '*' ? left.value * right.value : left.value / right.value, next: right.next }
    } else {
      break
    }
  }
  return left
}

function parseUnary(tokens: Token[], pos: number): ParseResult | undefined {
  const t = tokens[pos]
  if (t?.kind === 'op' && (t.op === '-' || t.op === '+')) {
    const inner = parseUnary(tokens, pos + 1)
    if (!inner) return undefined
    return { value: t.op === '-' ? -inner.value : inner.value, next: inner.next }
  }
  return parsePower(tokens, pos)
}

function parsePower(tokens: Token[], pos: number): ParseResult | undefined {
  const base = parseAtom(tokens, pos)
  if (!base) return undefined
  const t = tokens[base.next]
  if (t?.kind === 'op' && t.op === '^') {
    const exp = parseUnary(tokens, base.next + 1)
    if (!exp) return undefined
    return { value: Math.pow(base.value, exp.value), next: exp.next }
  }
  return base
}

function parseAtom(tokens: Token[], pos: number): ParseResult | undefined {
  const t = tokens[pos]
  if (!t) return undefined
  if (t.kind === 'num') return { value: t.value, next: pos + 1 }
  if (t.kind === 'ident' && t.name === 'pi') return { value: Math.PI, next: pos + 1 }
  if (t.kind === 'ident' && t.name === 'sqrt') {
    if (tokens[pos + 1]?.kind !== 'lparen') return undefined
    const inner = parseExpr(tokens, pos + 2)
    if (!inner || inner.value < 0 || tokens[inner.next]?.kind !== 'rparen') return undefined
    return { value: Math.sqrt(inner.value), next: inner.next + 1 }
  }
  if (t.kind === 'sqrt') {
    // Tight-binding prefix: grabs only the next atom, so "√2π" is
    // sqrt(2)*π — not sqrt(2π) — matching the real barem's plain-text style.
    const inner = parseAtom(tokens, pos + 1)
    if (!inner || inner.value < 0) return undefined
    return { value: Math.sqrt(inner.value), next: inner.next }
  }
  if (t.kind === 'lparen') {
    const inner = parseExpr(tokens, pos + 1)
    if (!inner || tokens[inner.next]?.kind !== 'rparen') return undefined
    return { value: inner.value, next: inner.next + 1 }
  }
  return undefined
}

/** Strips a leading "k = " / "x=" style variable label so "k=14" compares
 * equal to "14" — symmetric, applied to both sides in `answersEquivalent`. */
function stripLeadingLabel(s: string): string {
  return s.replace(/^\s*[a-zA-Zа-яА-Я]+\s*=\s*/, '')
}

/** "3,5" -> "3.5" (Russian decimal comma) without touching digit-comma-digit
 * sequences that aren't decimals (none expected in these short answers). */
function normalizeCommaDecimals(s: string): string {
  return s.replace(/(\d),(\d)/g, '$1.$2')
}

/** Evaluates a short math expression to a number, or `undefined` if it isn't
 * one (contains an inequality, an interval, unresolvable text, ...). */
export function evaluateExpression(raw: string): number | undefined {
  const prepped = normalizeCommaDecimals(stripLeadingLabel(raw))
  const tokens = insertImplicitMultiplication(tokenize(prepped))
  if (tokens.length === 0) return undefined
  const result = parseExpr(tokens, 0)
  if (!result || result.next !== tokens.length || !Number.isFinite(result.value)) return undefined
  return result.value
}

function normalizeLoose(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, '') // spacing never carries meaning in a short math answer
    .replace(/[−–]/g, '-')
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
}

/** True if two short-answer strings represent the same value — numerically
 * (any notation) when both parse as expressions, otherwise as a normalized
 * string match (handles non-numeric answers like "t>3" or "(3;+∞)"). */
export function answersEquivalent(accepted: string, given: string, tolerance = 1e-6): boolean {
  const av = evaluateExpression(accepted)
  const gv = evaluateExpression(given)
  if (av !== undefined && gv !== undefined) {
    const scale = Math.max(1, Math.abs(av), Math.abs(gv))
    return Math.abs(av - gv) <= tolerance * scale
  }
  return normalizeLoose(accepted) === normalizeLoose(given)
}
