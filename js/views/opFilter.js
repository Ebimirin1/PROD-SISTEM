// Filtro "Por Ordem de Produção" — apoio compartilhado pelas telas que têm a barra
// Visão Geral / Por Dia / Por Período / Por Ordem de Produção.
import { weekdayName, formatDate } from '../utils.js';

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function opButtonClass(active) {
  return `px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${active ? 'bg-bordeaux-primary text-on-primary shadow-sm' : 'bg-surface-canvas text-ink-text hover:bg-surface-container'}`;
}

// Lista de OPs únicas ({ id, order_code, production_date }), da mais recente para a mais antiga
export function buildOpOptions(refs) {
  const map = new Map();
  (refs || []).forEach(o => {
    if (o && o.id && !map.has(o.id)) {
      map.set(o.id, { id: o.id, order_code: o.order_code, production_date: o.production_date });
    }
  });
  return [...map.values()].sort((a, b) =>
    String(b.production_date || '').localeCompare(String(a.production_date || '')) ||
    String(b.order_code || '').localeCompare(String(a.order_code || '')));
}

// Mantém a OP escolhida se ela ainda existir; senão usa a mais recente
export function resolveSelectedOp(options, selectedId) {
  return options.some(o => o.id === selectedId) ? selectedId : (options[0]?.id || null);
}

function optionsHtml(options, selectedId) {
  if (!options.length) return '<option value="">Nenhuma OP disponível</option>';
  return options.map(o =>
    `<option value="${esc(o.id)}" ${o.id === selectedId ? 'selected' : ''}>${esc(o.order_code)}${o.production_date ? ` — ${esc(weekdayName(o.production_date))}, ${esc(formatDate(o.production_date))}` : ''}</option>`
  ).join('');
}

export function opSelectHtml(selectId, options, selectedId) {
  return `
    <div class="flex items-center gap-2 max-w-full min-w-0">
      <label for="${selectId}" class="text-xs font-bold text-ink-text">Ordem de Produção:</label>
      <select id="${selectId}" class="min-w-0 max-w-full min-h-[36px] px-3 rounded-lg border border-border-subtle bg-surface-card text-xs font-bold text-ink-text focus:outline-none focus:border-bordeaux-primary">${optionsHtml(options, selectedId)}</select>
    </div>`;
}

// Atualiza a lista do seletor (se ele estiver na tela) depois que os dados são carregados
export function refreshOpSelect(selectId, options, selectedId) {
  const el = document.getElementById(selectId);
  if (el) el.innerHTML = optionsHtml(options, selectedId);
}
