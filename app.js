const ROWS = 100;
const COLS = 100;
let sheetData = JSON.parse(localStorage.getItem('gridsheet_data')) || {};
let selectedCell = 'A1';

// Converte indice colonna (0 -> A, 25 -> Z, 26 -> AA)
function getColName(index) {
  let name = '';
  while (index >= 0) {
    name = String.fromCharCode((index % 26) + 65) + name;
    index = Math.floor(index / 26) - 1;
  }
  return name;
}

// Converte nome colonna in indice (A -> 0, AA -> 26)
function getColIndex(name) {
  let index = 0;
  for (let i = 0; i < name.length; i++) {
    index = index * 26 + (name.charCodeAt(i) - 64);
  }
  return index - 1;
}

// Genera la tabella 100x100 usando DocumentFragment per alte prestazioni
function initGrid() {
  const container = document.getElementById('grid-container');
  const table = document.createElement('table');
  const thead = document.createElement('thead');
  const tbody = document.createElement('tbody');

  // Intestazione colonne
  const headerRow = document.createElement('tr');
  headerRow.appendChild(document.createElement('th')); // Angolo in alto a sinistra
  for (let c = 0; c < COLS; c++) {
    const th = document.createElement('th');
    th.textContent = getColName(c);
    headerRow.appendChild(th);
  }
  thead.appendChild(headerRow);

  // Righe e celle
  for (let r = 1; r <= ROWS; r++) {
    const tr = document.createElement('tr');
    const rowHeader = document.createElement('th');
    rowHeader.textContent = r;
    tr.appendChild(rowHeader);

    for (let c = 0; c < COLS; c++) {
      const td = document.createElement('td');
      const cellId = `${getColName(c)}${r}`;
      td.id = cellId;
      td.dataset.id = cellId;
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }

  table.appendChild(thead);
  table.appendChild(tbody);
  container.appendChild(table);

  // Event delegation per gestire click e doppio click su 10.000 celle
  tbody.addEventListener('click', (e) => {
    if (e.target.tagName === 'TD') selectCell(e.target.dataset.id);
  });

  tbody.addEventListener('dblclick', (e) => {
    if (e.target.tagName === 'TD') {
      selectCell(e.target.dataset.id);
      document.getElementById('formula-input').focus();
    }
  });

  updateAllCells();
  selectCell('A1');
}

function selectCell(cellId) {
  document.querySelectorAll('td.selected').forEach(td => td.classList.remove('selected'));
  const cell = document.getElementById(cellId);
  if (cell) {
    cell.classList.add('selected');
    selectedCell = cellId;
    document.getElementById('cell-address').textContent = cellId;
    document.getElementById('formula-input').value = sheetData[cellId] || '';
  }
}

// Espande intervalli tipo A1:A5 in array di celle ['A1', 'A2', ...]
function expandRange(start, end) {
  const startMatch = start.match(/^([A-Z]+)(\d+)$/);
  const endMatch = end.match(/^([A-Z]+)(\d+)$/);
  if (!startMatch || !endMatch) return [];

  const c1 = getColIndex(startMatch[1]);
  const r1 = parseInt(startMatch[2], 10);
  const c2 = getColIndex(endMatch[1]);
  const r2 = parseInt(endMatch[2], 10);

  const cells = [];
  for (let c = Math.min(c1, c2); c <= Math.max(c1, c2); c++) {
    for (let r = Math.min(r1, r2); r <= Math.max(r1, r2); r++) {
      cells.push(`${getColName(c)}${r}`);
    }
  }
  return cells;
}

// Motore di valutazione formule
function evaluateCell(cellId, visited = new Set()) {
  if (visited.has(cellId)) return '#RIF!'; // Previene loop infiniti
  visited.add(cellId);

  const raw = sheetData[cellId];
  if (raw === undefined || raw === '') return '';
  if (!raw.toString().startsWith('=')) {
    return isNaN(Number(raw)) ? raw : Number(raw);
  }

  let expr = raw.substring(1).toUpperCase().trim();

  try {
    // Supporto SOMMA(A1:B5)
    expr = expr.replace(/SOMMA\(([A-Z]+\d+):([A-Z]+\d+)\)/g, (_, s, e) => {
      const cells = expandRange(s, e);
      return cells.reduce((acc, id) => acc + (Number(evaluateCell(id, new Set(visited))) || 0), 0);
    });

    // Supporto MEDIA(A1:B5)
    expr = expr.replace(/MEDIA\(([A-Z]+\d+):([A-Z]+\d+)\)/g, (_, s, e) => {
      const cells = expandRange(s, e);
      if (cells.length === 0) return 0;
      const sum = cells.reduce((acc, id) => acc + (Number(evaluateCell(id, new Set(visited))) || 0), 0);
      return sum / cells.length;
    });

    // Sostituisce riferimenti singoli (es. A1, C12) con i loro valori
    expr = expr.replace(/\b([A-Z]+\d+)\b/g, (match) => {
      const val = evaluateCell(match, new Set(visited));
      return val === '' ? 0 : Number(val);
    });

    // Valuta l'espressione aritmetica in modo sicuro (solo numeri e operatori base)
    if (!/^[0-9+\-*/().\s]+$/.test(expr)) return '#ERRORE!';
    const result = Function(`"use strict"; return (${expr})`)();
    return Number.isFinite(result) ? Math.round(result * 10000) / 10000 : '#DIV/0!';
  } catch {
    return '#ERRORE!';
  }
}

function updateAllCells() {
  for (let r = 1; r <= ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const cellId = `${getColName(c)}${r}`;
      const td = document.getElementById(cellId);
      if (td) {
        const val = sheetData[cellId] ? evaluateCell(cellId) : '';
        td.textContent = val;
      }
    }
  }
  localStorage.setItem('gridsheet_data', JSON.stringify(sheetData));
}

// Gestione input dalla barra delle formule
const formulaInput = document.getElementById('formula-input');
formulaInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const val = formulaInput.value.trim();
    if (val === '') {
      delete sheetData[selectedCell];
    } else {
      sheetData[selectedCell] = val;
    }
    updateAllCells();
  }
});

document.getElementById('clear-btn').addEventListener('click', () => {
  if (confirm('Vuoi cancellare tutti i dati del foglio?')) {
    sheetData = {};
    localStorage.removeItem('gridsheet_data');
    updateAllCells();
    selectCell('A1');
  }
});

initGrid();