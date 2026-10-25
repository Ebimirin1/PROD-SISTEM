// Utilitários gerais do sistema

export function formatWeight(val, unit = 'kg') {
  if (val === null || val === undefined || isNaN(val)) return `0,000 ${unit}`;
  const num = Number(val);
  return `${num.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} ${unit}`;
}

export function formatDate(dateStr) {
  if (!dateStr) return '—';
  // Datas puras (YYYY-MM-DD) são lidas como data local; new Date() as leria em UTC e mostraria o dia anterior no Brasil
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(dateStr)) ? parseLocalDate(dateStr) : new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;
  return date.toLocaleDateString('pt-BR');
}

export function formatDateTime(dateStr) {
  if (!dateStr) return '—';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;
  return date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

export function showNotification(message, type = 'info') {
  let toast = document.getElementById('system-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'system-toast';
    toast.className = 'fixed bottom-4 right-4 left-4 sm:left-auto z-50 max-w-md px-4 py-3 rounded-lg shadow-lg text-white font-body-md transition-all duration-300 transform translate-y-full opacity-0';
    document.body.appendChild(toast);
  }

  const bgClasses = {
    success: 'bg-status-success',
    error: 'bg-alert-critical',
    warning: 'bg-amber-warning text-ink-text',
    info: 'bg-status-info'
  };

  toast.className = `fixed bottom-4 right-4 left-4 sm:left-auto z-50 max-w-md px-4 py-3 rounded-lg shadow-lg text-white font-body-md transition-all duration-300 ${bgClasses[type] || bgClasses.info}`;
  toast.innerText = message;

  requestAnimationFrame(() => {
    toast.classList.remove('translate-y-full', 'opacity-0');
  });

  setTimeout(() => {
    toast.classList.add('translate-y-full', 'opacity-0');
  }, 4000);
}

export function renderEmptyState({ icon = 'inbox', title, description, actionText, onAction }) {
  const container = document.createElement('div');
  container.className = 'flex flex-col items-center justify-center p-12 text-center bg-surface-card rounded-xl border border-border-subtle shadow-sm my-4';

  container.innerHTML = `
    <span class="material-symbols-outlined text-[48px] text-text-muted mb-3">${icon}</span>
    <h3 class="font-headline-sm text-headline-sm text-ink-text mb-1">${title}</h3>
    <p class="font-body-md text-body-md text-text-muted max-w-md mb-6">${description}</p>
    ${actionText ? `<button class="empty-state-action min-h-[44px] px-5 rounded-lg bg-bordeaux-primary hover:bg-wine-deep text-on-primary font-title-md transition-colors shadow-sm">${actionText}</button>` : ''}
  `;

  if (actionText && onAction) {
    container.querySelector('.empty-state-action')?.addEventListener('click', onAction);
  }

  return container;
}

// ---- Datas e código da OP ----

// Data local de hoje em YYYY-MM-DD (toISOString usa UTC e erra o dia à noite no Brasil)
export function todayLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Converte 'YYYY-MM-DD' em Date local, sem deslocamento de fuso
export function parseLocalDate(str) {
  const [y, m, d] = String(str).slice(0, 10).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

// Dia da semana em português, ex.: 'Terça-feira'
export function weekdayName(str) {
  if (!str) return '';
  const d = parseLocalDate(str);
  if (isNaN(d.getTime())) return '';
  const name = d.toLocaleDateString('pt-BR', { weekday: 'long' });
  return name.charAt(0).toUpperCase() + name.slice(1);
}

// Código da OP a partir da data de produção: 2026-10-13 -> '13102026'
export function buildOrderCode(str) {
  const [y, m, d] = String(str).slice(0, 10).split('-');
  return `${d}${m}${y}`;
}
