// ── Preguntas ──────────────────────────────────────────────────────────────

const answerHistory = [];

async function runAsk() {
  const input        = document.getElementById('pregunta-input');
  const loading      = document.getElementById('ask-loading');
  const errorBox     = document.getElementById('ask-error');
  const currentEl    = document.getElementById('current-answer');
  const historyEl    = document.getElementById('ask-history');
  const historyPanel = document.getElementById('history-panel');

  const pregunta = input.value.trim();
  if (!pregunta) { input.focus(); return; }

  show(loading);
  hide(errorBox);

  try {
    const res  = await fetch('/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pregunta })
    });
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || 'Error desconocido');

    // Pregunta fuera del ámbito del reglamento
    if (json.data.fuera_ambito) {
      showOutOfScope();
      input.value = '';
      return;
    }

    // Mover respuesta actual al historial
    if (!currentEl.classList.contains('hidden') && currentEl.firstChild) {
      const clone = currentEl.firstChild.cloneNode(true);
      clone.classList.add('history-item');
      const amendPanel = clone.querySelector('.amendment-panel');
      if (amendPanel) amendPanel.remove();
      historyEl.prepend(clone);
      answerHistory.unshift(null);
      show(historyPanel);
    }

    // Mostrar nueva respuesta
    currentEl.innerHTML = '';
    currentEl.appendChild(buildAnswerBlock(pregunta, json.data));
    show(currentEl);
    input.value = '';
  } catch (err) {
    errorBox.textContent = 'Error: ' + err.message;
    show(errorBox);
  } finally {
    hide(loading);
  }
}

function showOutOfScope() {
  const el = document.getElementById('out-of-scope-msg');
  show(el);
  clearTimeout(el._timer);
  el._timer = setTimeout(() => hide(el), 6000);
}

function clearHistory() {
  answerHistory.length = 0;
  document.getElementById('ask-history').innerHTML = '';
  hide(document.getElementById('history-panel'));
}


// ── Bloque de respuesta ────────────────────────────────────────────────────

let blockCounter = 0;

function buildAnswerBlock(pregunta, data) {
  const id  = ++blockCounter;
  const div = document.createElement('div');
  div.className = 'answer-block';

  const textoEnmienda = data.respuesta_nuevo || data.raw || '';

  if (data.raw) {
    div.innerHTML = `
      <div class="answer-question">❓ ${esc(pregunta)}</div>
      <div class="raw-box" style="margin:1rem">${esc(data.raw)}</div>
      <div class="answer-footer">
        <button class="btn btn-amend" onclick="toggleAmendPanel(${id})">✏️ Realizar enmienda</button>
      </div>
      ${buildAmendPanelHTML(id, pregunta, textoEnmienda)}
    `;
    return div;
  }

  div.innerHTML = `
    <div class="answer-question">❓ ${esc(pregunta)}</div>
    <div class="answer-cols">
      <div class="answer-col nuevo">
        <h5>🆕 Alcañiz — Nuevo</h5>
        <p>${esc(data.respuesta_nuevo || '')}</p>
      </div>
      <div class="answer-col viejo">
        <h5>📜 Alcañiz — Viejo</h5>
        <p>${esc(data.respuesta_viejo || '')}</p>
      </div>
      <div class="answer-col cordoba">
        <h5>🏛️ Córdoba</h5>
        <p>${esc(data.respuesta_cordoba || '')}</p>
      </div>
      <div class="answer-col sagunto">
        <h5>⚓ Sagunto</h5>
        <p>${esc(data.respuesta_sagunto || '')}</p>
      </div>
    </div>
    <div class="answer-diff">
      <strong>Análisis comparativo:</strong> ${esc(data.diferencias || '')}
    </div>
    <div class="answer-footer">
      <button class="btn btn-amend" onclick="toggleAmendPanel(${id})">✏️ Realizar enmienda</button>
    </div>
    ${buildAmendPanelHTML(id, pregunta, textoEnmienda)}
  `;
  return div;
}


// ── Panel de enmienda (cliente) ────────────────────────────────────────────

// Enmiendas almacenadas en localStorage del navegador
const STORAGE_KEY = 'reglamento_enmiendas';

function loadAmendments() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
  catch { return []; }
}

function saveAmendmentsToStorage(list) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

function buildAmendPanelHTML(id, pregunta, textoInicial) {
  return `
    <div class="amendment-panel hidden" id="amend-panel-${id}">
      <div class="amend-header">
        <span>✏️ Editor de enmienda</span>
        <button class="btn-icon-close" onclick="toggleAmendPanel(${id})" title="Cerrar">✕</button>
      </div>
      <div class="amend-body">
        <label class="amend-label">Título / Consulta</label>
        <input type="text" id="amend-title-${id}" class="amend-input" value="${escAttr(pregunta)}" />
        <label class="amend-label">Texto enmendado <span class="amend-hint">(edita libremente)</span></label>
        <textarea id="amend-text-${id}" class="amend-textarea" rows="10">${escText(textoInicial)}</textarea>
        <div class="amend-actions">
          <div id="amend-msg-${id}" class="amend-msg hidden"></div>
          <button class="btn btn-primary" onclick="saveAmendment(${id})">💾 Guardar enmienda</button>
          <button class="btn btn-secondary" onclick="toggleAmendPanel(${id})">Cancelar</button>
        </div>
      </div>
    </div>
  `;
}

function toggleAmendPanel(id) {
  const panel = document.getElementById(`amend-panel-${id}`);
  if (panel) panel.classList.toggle('hidden');
}

function saveAmendment(id) {
  const titulo = document.getElementById(`amend-title-${id}`).value.trim();
  const texto  = document.getElementById(`amend-text-${id}`).value.trim();
  const msgEl  = document.getElementById(`amend-msg-${id}`);

  if (!texto) { showAmendMsg(msgEl, 'error', 'El texto no puede estar vacío.'); return; }

  const list = loadAmendments();
  list.push({
    num:    list.length + 1,
    titulo,
    texto,
    fecha:  new Date().toLocaleString('es-ES')
  });
  saveAmendmentsToStorage(list);

  showAmendMsg(msgEl, 'ok', `✅ Enmienda ${list.length} guardada`);
  updateFab(list.length);
}

function showAmendMsg(el, type, text) {
  el.textContent = text;
  el.className   = 'amend-msg ' + (type === 'ok' ? 'amend-msg-ok' : 'amend-msg-err');
  show(el);
  if (type === 'ok') setTimeout(() => hide(el), 4000);
}


// ── Botón flotante + descarga ──────────────────────────────────────────────

function updateFab(count) {
  document.getElementById('fab-count').textContent = count;
  show(document.getElementById('download-fab'));
}

function downloadAmendments() {
  const list = loadAmendments();
  if (!list.length) return;

  const sep  = '='.repeat(55);
  const dash = '-'.repeat(55);
  let txt = `ENMIENDAS AL REGLAMENTO DEL AGUA\n`;
  txt += `Generado: ${new Date().toLocaleString('es-ES')}\n${sep}\n\n`;

  list.forEach(e => {
    txt += `ENMIENDA ${e.num}\n`;
    txt += `Consulta: ${e.titulo}\n`;
    txt += `Fecha:    ${e.fecha}\n`;
    txt += `${dash}\n${e.texto}\n${sep}\n\n`;
  });

  const blob = new Blob([txt], { type: 'text/plain;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `enmiendas_reglamento_${new Date().toISOString().slice(0,10)}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

// Inicializar FAB si hay enmiendas guardadas de sesiones anteriores
(function initFab() {
  const saved = loadAmendments();
  if (saved.length) updateFab(saved.length);
})();


// ── Utilidades ─────────────────────────────────────────────────────────────

function show(el) { if (el) el.classList.remove('hidden'); }
function hide(el) { if (el) el.classList.add('hidden'); }

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    .replace(/\n/g, '<br>');
}
function escAttr(str) {
  return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function escText(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

document.getElementById('pregunta-input').addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); runAsk(); }
});
