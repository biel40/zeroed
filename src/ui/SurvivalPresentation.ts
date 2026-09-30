/** Original line icons. Labels carry meaning independently of shape or colour. */
function lampIcon(): string {
  return '<svg class="survival-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 7V4a3 3 0 0 1 6 0v3M7 7h10l2 13H5ZM5 20h14M8 10h8l1 7H7Z"/></svg>';
}

export function roundMarks(round: number): string {
  const count = round > 10 ? 3 : Math.max(0, Math.floor(round));
  return `<span class="round-scratches" aria-hidden="true">${'<i></i>'.repeat(count)}</span>${round > 10 ? `<span class="round-number">${round}</span>` : ''}`;
}

export function lampProgress(lamps: readonly boolean[], compact = false): string {
  const on = lamps.filter(Boolean).length;
  return `<div class="lamp-heading"><span>${lampIcon()} FAROLES</span><strong>${on} / ${lamps.length}</strong></div>
    <div class="lamp-icons">${lamps.map((active, index) => `<span class="lamp ${active ? 'lit' : 'unlit'}" aria-label="Farol ${index + 1}: ${active ? 'encendido' : 'apagado'}">${lampIcon()}<small>${index + 1} ${active ? '✓' : '−'}</small></span>`).join('')}</div>
    ${compact ? '' : `<p class="lamp-summary">${on} encendidos · ${lamps.length - on} apagados</p>`}`;
}
