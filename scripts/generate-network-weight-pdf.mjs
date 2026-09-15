import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const commands = [];

function color(hex) {
  const value = Number.parseInt(hex.slice(1), 16);
  return [value >> 16, (value >> 8) & 255, value & 255]
    .map((channel) => (channel / 255).toFixed(3))
    .join(' ');
}

function pdfString(value) {
  let result = '';
  for (const character of value) {
    const code = character.codePointAt(0);
    if (character === '(' || character === ')' || character === '\\') {
      result += `\\${character}`;
    } else if (code >= 32 && code <= 126) {
      result += character;
    } else if (code <= 255) {
      result += `\\${code.toString(8).padStart(3, '0')}`;
    } else {
      result += '?';
    }
  }
  return result;
}

function rect(x, y, width, height, fill) {
  commands.push(`${color(fill)} rg ${x} ${y} ${width} ${height} re f`);
}

function line(x1, y1, x2, y2, stroke, width = 1) {
  commands.push(`${color(stroke)} RG ${width} w ${x1} ${y1} m ${x2} ${y2} l S`);
}

function text(value, x, y, size, options = {}) {
  const font = options.bold ? 'F2' : 'F1';
  const fill = options.fill ?? '#172033';
  commands.push(`BT /${font} ${size} Tf ${color(fill)} rg 1 0 0 1 ${x} ${y} Tm (${pdfString(value)}) Tj ET`);
}

function paragraph(lines, x, y, size = 9.5, leading = 14, options = {}) {
  lines.forEach((value, index) => text(value, x, y - index * leading, size, options));
}

rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT, '#f5f7fb');
rect(0, 718, PAGE_WIDTH, 124, '#10182a');
rect(38, 744, 5, 58, '#8f6bff');
text('ZEROED / INFORME TÉCNICO', 55, 792, 9, { bold: true, fill: '#b9a8ff' });
text('Peso de red al abrir el juego', 55, 765, 22, { bold: true, fill: '#ffffff' });
text('Medición, interpretación y control del tamaño descargado', 55, 741, 10.5, { fill: '#c9d1e2' });
text('15 SEP 2026', 482, 792, 8, { bold: true, fill: '#8f9bb3' });

rect(38, 650, 519, 48, '#e8e2ff');
text('CARGA LIMPIA ESTIMADA', 52, 680, 8, { bold: true, fill: '#6545d5' });
text('~8.1 MiB', 52, 658, 18, { bold: true, fill: '#251653' });
text('antes de audios y recursos PWA menores', 151, 662, 9.5, { fill: '#4b4264' });

text('DESGLOSE ACTUAL', 38, 622, 9, { bold: true, fill: '#6545d5' });
const rows = [
  ['JavaScript', '933 KB', '255 KB gzip'],
  ['CSS + HTML', '26.3 KB', '7.2 KB gzip'],
  ['12 texturas precargadas', '6.93 MiB', 'principal coste'],
  ['2 modelos de zombis', '0.83 MiB', 'precargados'],
  ['Modelo L96', '0.09 MiB', 'precargado'],
];
rect(38, 586, 519, 22, '#dce2ed');
text('RECURSO', 50, 593, 8, { bold: true, fill: '#4e596d' });
text('TAMAÑO', 346, 593, 8, { bold: true, fill: '#4e596d' });
text('NOTA', 442, 593, 8, { bold: true, fill: '#4e596d' });
rows.forEach((row, index) => {
  const y = 565 - index * 25;
  if (index % 2 === 0) rect(38, y - 6, 519, 24, '#ffffff');
  text(row[0], 50, y, 9);
  text(row[1], 346, y, 9, { bold: true });
  text(row[2], 442, y, 8.5, { fill: '#596579' });
});

text('CÓMO MEDIR EL TRÁFICO REAL', 38, 423, 9, { bold: true, fill: '#6545d5' });
paragraph([
  '1. Abrir la versión publicada de Zeroed en Chrome o Edge.',
  '2. Abrir DevTools > Network y activar Disable cache.',
  '3. En Application > Storage, ejecutar Clear site data para limpiar también la PWA.',
  '4. Volver a Network, recargar y esperar a que finalicen todas las solicitudes.',
  '5. Leer Transferred en la barra inferior: son los bytes enviados realmente por la red.',
  '6. Entrar en cada mapa y jugar unos minutos para incluir recursos diferidos y audio.',
], 48, 400, 9.5, 18);

rect(38, 265, 250, 90, '#ffffff');
rect(307, 265, 250, 90, '#ffffff');
text('QUÉ SIGNIFICA CADA VALOR', 50, 335, 8.5, { bold: true, fill: '#6545d5' });
paragraph([
  'Transferred: tráfico real, tras compresión y caché.',
  'Resources: tamaño descomprimido usado por el cliente.',
  'Content Download: tiempo dedicado a transferir datos.',
  'Un recurso desde cache puede transferir 0 bytes.',
], 50, 315, 8.5, 14);
text('POR QUÉ ZEROED CARGA ~8.1 MiB', 319, 335, 8.5, { bold: true, fill: '#6545d5' });
paragraph([
  'main.ts construye un manifiesto global al arrancar.',
  'AssetManager.loadAll descarga texturas, zombis y L96',
  'antes de mostrar el selector de mapa. Las texturas',
  'representan aproximadamente el 86% de esa carga.',
], 319, 315, 8.5, 14);

text('CONTROL RECOMENDADO', 38, 234, 9, { bold: true, fill: '#6545d5' });
paragraph([
  '• Registrar tres cifras por versión: selector limpio, Classic y Burned Mansion.',
  '• Exportar Network > Save all as HAR para comparar solicitudes entre versiones.',
  '• Definir un presupuesto máximo de carga inicial y comprobarlo antes de publicar.',
  '• Optimizar primero texturas; son el coste dominante. Cargar por mapa reduciría el arranque.',
  '• Usar npm run build para vigilar JS/CSS, pero no confundir el resumen de Vite con el total.',
], 48, 211, 9.5, 17);

line(38, 103, 557, 103, '#ccd3df');
text('REFERENCIAS DE CÓDIGO', 38, 84, 8, { bold: true, fill: '#667085' });
text('src/main.ts:54  ·  src/assets/AssetManager.ts:48  ·  docs/PWA.md', 157, 84, 8.5, { fill: '#4e596d' });
text('La cifra exacta depende de la compresión HTTP, caché y recursos solicitados durante la sesión.', 38, 58, 8, { fill: '#778195' });

const stream = commands.join('\n');
const objects = [
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
  `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>`,
  `<< /Length ${Buffer.byteLength(stream, 'ascii')} >>\nstream\n${stream}\nendstream`,
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
  `<< /Title (${pdfString('Zeroed - Peso de red')}) /Author (${pdfString('Zeroed')}) /Subject (${pdfString('Guía técnica para medir el peso descargado por el cliente')}) >>`,
];

let pdf = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
const offsets = [0];
objects.forEach((object, index) => {
  offsets.push(Buffer.byteLength(pdf, 'latin1'));
  pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
});
const xrefOffset = Buffer.byteLength(pdf, 'latin1');
pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
for (const offset of offsets.slice(1)) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 7 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

writeFileSync(resolve('docs/zeroed-peso-red.pdf'), Buffer.from(pdf, 'latin1'));
