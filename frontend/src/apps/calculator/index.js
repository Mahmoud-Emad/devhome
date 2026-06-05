// Calculator — a standard four-function calculator with keyboard support. Pure
// UI, no persistence: the running total lives in a small state machine below.
// Keyboard: digits, + - * /, Enter or = to evaluate, Backspace, Esc/c to clear.

const ACCENT = '#2dd4bf';

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

const SYMBOL = { '+': '+', '-': '−', '*': '×', '/': '÷' };

function compute(a, op, b) {
  switch (op) {
    case '+': return a + b;
    case '-': return a - b;
    case '*': return a * b;
    case '/': return b === 0 ? NaN : a / b;
    default: return b;
  }
}

// Trim floating-point noise to something a calculator would show, without
// dropping precision the user actually entered. NaN/Infinity → "Error".
function format(n) {
  if (!Number.isFinite(n)) return 'Error';
  const rounded = Number(n.toPrecision(12));
  return String(rounded);
}

// Button layout. `key` matches what we accept from the keyboard; `kind` styles
// the tile (operator / function / equals / digit). `span` widens the zero key.
const KEYS = [
  { label: 'AC', act: 'clear', kind: 'fn' },
  { label: '±', act: 'negate', kind: 'fn' },
  { label: '%', act: 'percent', kind: 'fn' },
  { label: '÷', act: 'op', op: '/', kind: 'op' },
  { label: '7', act: 'digit', d: '7' },
  { label: '8', act: 'digit', d: '8' },
  { label: '9', act: 'digit', d: '9' },
  { label: '×', act: 'op', op: '*', kind: 'op' },
  { label: '4', act: 'digit', d: '4' },
  { label: '5', act: 'digit', d: '5' },
  { label: '6', act: 'digit', d: '6' },
  { label: '−', act: 'op', op: '-', kind: 'op' },
  { label: '1', act: 'digit', d: '1' },
  { label: '2', act: 'digit', d: '2' },
  { label: '3', act: 'digit', d: '3' },
  { label: '+', act: 'op', op: '+', kind: 'op' },
  { label: '0', act: 'digit', d: '0', span: true },
  { label: '.', act: 'dot' },
  { label: '=', act: 'equals', kind: 'equals' },
];

const app = {
  id: 'calculator',
  name: 'Calculator',
  description: 'A quick four-function calculator',
  accent: ACCENT,
  order: 2,
  dialog: { size: 'sm' },

  render(body) {
    // --- state machine -----------------------------------------------------
    let acc = null; // running total (number) or null
    let op = null; // pending operator
    let cur = '0'; // the number being typed (string)
    let fresh = true; // next digit replaces `cur` rather than appending
    let last = null; // { op, b } for repeat-equals
    let expr = ''; // the secondary "history" line

    const root = el('div', 'calc');
    root.tabIndex = 0; // so it can receive keyboard input

    const exprLine = el('div', 'calc-expr');
    const display = el('div', 'calc-display');
    const pad = el('div', 'calc-pad');

    const draw = () => {
      exprLine.textContent = expr;
      display.textContent = cur;
    };

    const clearAll = () => {
      acc = null; op = null; cur = '0'; fresh = true; last = null; expr = '';
    };

    const inputDigit = (d) => {
      if (cur === 'Error') clearAll();
      if (fresh) { cur = d; fresh = false; }
      else cur = cur === '0' ? d : cur + d;
    };

    const inputDot = () => {
      if (cur === 'Error') clearAll();
      if (fresh) { cur = '0.'; fresh = false; }
      else if (!cur.includes('.')) cur += '.';
    };

    const negate = () => {
      if (cur === '0' || cur === 'Error') return;
      cur = cur.startsWith('-') ? cur.slice(1) : `-${cur}`;
    };

    const percent = () => {
      if (cur === 'Error') return;
      cur = format(parseFloat(cur) / 100);
      fresh = true;
    };

    const backspace = () => {
      if (fresh || cur === 'Error') return;
      cur = cur.length > 1 && !(cur.length === 2 && cur.startsWith('-')) ? cur.slice(0, -1) : '0';
      if (cur === '0') fresh = true;
    };

    const chooseOp = (next) => {
      if (cur === 'Error') return;
      if (op !== null && !fresh) {
        acc = compute(acc, op, parseFloat(cur));
        cur = format(acc);
      } else if (acc === null) {
        acc = parseFloat(cur);
      }
      op = next;
      last = null;
      fresh = true;
      expr = `${format(acc)} ${SYMBOL[op]}`;
    };

    const equals = () => {
      if (cur === 'Error') return;
      if (op !== null) {
        const b = parseFloat(cur);
        const a = acc;
        const result = compute(a, op, b);
        expr = `${format(a)} ${SYMBOL[op]} ${format(b)} =`;
        cur = format(result);
        last = { op, b };
        acc = null; op = null; fresh = true;
      } else if (last) {
        // Pressing = again repeats the last operation.
        const a = parseFloat(cur);
        const result = compute(a, last.op, last.b);
        expr = `${format(a)} ${SYMBOL[last.op]} ${format(last.b)} =`;
        cur = format(result);
        fresh = true;
      }
    };

    const handle = (item) => {
      switch (item.act) {
        case 'digit': inputDigit(item.d); break;
        case 'dot': inputDot(); break;
        case 'op': chooseOp(item.op); break;
        case 'equals': equals(); break;
        case 'clear': clearAll(); break;
        case 'negate': negate(); break;
        case 'percent': percent(); break;
      }
      draw();
    };

    for (const item of KEYS) {
      const btn = el('button', `calc-key${item.kind ? ` is-${item.kind}` : ''}${item.span ? ' is-wide' : ''}`, item.label);
      btn.type = 'button';
      btn.addEventListener('click', () => { handle(item); root.focus(); });
      pad.append(btn);
    }

    // Keyboard support — scoped to this window (listener lives on the focused
    // root, so it never interferes with other open app windows).
    root.addEventListener('keydown', (e) => {
      const k = e.key;
      if (k >= '0' && k <= '9') handle({ act: 'digit', d: k });
      else if (k === '.' || k === ',') handle({ act: 'dot' });
      else if (k === '+' || k === '-' || k === '*' || k === '/') handle({ act: 'op', op: k });
      else if (k === 'Enter' || k === '=') { e.preventDefault(); handle({ act: 'equals' }); }
      else if (k === 'Backspace') { backspace(); draw(); }
      else if (k === 'Escape' || k === 'c' || k === 'C') handle({ act: 'clear' });
      else if (k === '%') handle({ act: 'percent' });
      else return;
      e.stopPropagation();
    });

    root.append(exprLine, display, pad);
    body.replaceChildren(root);
    draw();
    requestAnimationFrame(() => root.focus());
  },
};

export default app;
