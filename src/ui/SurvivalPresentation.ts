/** Original line icons. Labels carry meaning independently of shape or colour. */
function lampIcon(): string {
  return '<svg class="survival-icon lamp-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4h6M12 2v2M7 6h10l-1.5 3v8l1.5 3H7l1.5-3V9Z"/><path class="lamp-flame" d="M12 10.5c-1.8 1.7-2 3.6 0 5.5 2-1.9 1.8-3.8 0-5.5Z"/></svg>';
}

export function roundMarks(round: number): string {
  const count = round > 10 ? 3 : Math.max(0, Math.floor(round));
  return `<span class="round-scratches" aria-hidden="true">${'<i></i>'.repeat(count)}</span>${round > 10 ? `<span class="round-number">${round}</span>` : ''}`;
}

/** `lamps[i]` is true once that lamp is completely filled. */
export function lampProgress(lamps: readonly boolean[], compact = false): string {
  const full = lamps.filter(Boolean).length;
  return `<div class="lamp-heading"><span>FAROLES</span><strong>${full} / ${lamps.length}</strong></div>
    <div class="lamp-icons">${lamps.map((filled, index) => `<span class="lamp ${filled ? 'lit' : 'unlit'}" aria-label="Farol ${index + 1}: ${filled ? 'lleno' : 'sin llenar'}">${lampIcon()}${compact ? '' : `<small>${index + 1}</small>`}</span>`).join('')}</div>`;
}
