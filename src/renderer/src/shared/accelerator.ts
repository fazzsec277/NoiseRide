export function codeToAccelerator(code: string): string | null {
  if (/^Key[A-Z]$/.test(code)) return code[3]
  if (/^Digit\d$/.test(code)) return code[5]
  if (/^F\d{1,2}$/.test(code)) return code
  if (/^Numpad\d$/.test(code)) return `num${code[6]}`
  const map: Record<string, string> = {
    Space: 'Space', Enter: 'Return', NumpadEnter: 'Return',
    Backspace: 'Backspace', Delete: 'Delete', Escape: 'Escape', Tab: 'Tab',
    ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right',
    Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown', Insert: 'Insert',
    NumpadDecimal: 'numdec', NumpadAdd: 'numadd', NumpadSubtract: 'numsub',
    NumpadMultiply: 'nummult', NumpadDivide: 'numdiv',
    Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']',
    Backslash: '\\', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/',
    Backquote: '`'
  }
  return map[code] ?? null
}

export function eventToAccelerator(e: KeyboardEvent): string {
  const parts: string[] = []
  if (e.ctrlKey) parts.push('Ctrl')
  if (e.altKey) parts.push('Alt')
  if (e.shiftKey) parts.push('Shift')
  const keyPart = codeToAccelerator(e.code)
  if (!keyPart) return ''
  parts.push(keyPart)
  return parts.join('+')
}
