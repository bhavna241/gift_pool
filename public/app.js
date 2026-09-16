const state = {
  poolId: null,
  summary: null,
  participants: []
};

const $ = (selector) => document.querySelector(selector);
const money = (value) => new Intl.NumberFormat('en-IN', {
  style: 'currency', currency: 'INR', maximumFractionDigits: 2
}).format(Number(value) || 0);

function showMessage(message, isError = false) {
  const element = $('#flashMessage');
  element.textContent = message;
  element.classList.toggle('error', isError);
  if (message) window.setTimeout(() => { element.textContent = ''; }, 4000);
}

async function apiRequest(url, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (!(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';
  const response = await fetch(url, {
    ...options,
    headers
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Something went wrong.');
  return data;
}

function setBusy(button, busy, busyText = 'Working...') {
  if (!button) return;
  if (busy) {
    button.dataset.originalText = button.innerHTML;
    button.innerHTML = busyText;
    button.disabled = true;
  } else {
    button.innerHTML = button.dataset.originalText || button.innerHTML;
    button.disabled = false;
  }
}

async function createPool(event) {
  event.preventDefault();
  const name = $('#poolName').value.trim();
  const budget = Number($('#poolBudget').value);
  if (!name || !Number.isFinite(budget) || budget <= 0) {
    showMessage('Enter a pool name and a budget greater than zero.', true);
    return;
  }
  const button = $('#createPoolButton');
  setBusy(button, true, 'Creating...');
  try {
    const data = await apiRequest('/api/pools', {
      method: 'POST', body: JSON.stringify({ name, budget })
    });
    state.poolId = data.pool._id;
    $('#workspace').classList.remove('is-hidden');
    $('#poolIdLabel').textContent = `Pool ID: ${state.poolId}`;
    $('#workspaceLabel').textContent = data.pool.name;
    await refreshDashboard();
    showMessage('Pool created. Add your participants below.');
    $('#participantName').focus();
  } catch (error) {
    showMessage(error.message, true);
  } finally {
    setBusy(button, false);
  }
}

async function addParticipant(event) {
  event.preventDefault();
  const nameInput = $('#participantName');
  const name = nameInput.value.trim();
  if (!name) {
    showMessage('Enter a participant name.', true);
    return;
  }
  try {
    await apiRequest(`/api/pools/${state.poolId}/participants`, {
      method: 'POST', body: JSON.stringify({ name })
    });
    nameInput.value = '';
    await refreshDashboard();
    showMessage(`${name} was added to the pool.`);
  } catch (error) {
    showMessage(error.message, true);
  }
}

async function removeParticipant(participantId, name) {
  if (!window.confirm(`Remove ${name} from this pool?`)) return;
  try {
    await apiRequest(`/api/pools/${state.poolId}/participants/${participantId}`, { method: 'DELETE' });
    await refreshDashboard();
    showMessage(`${name} was removed.`);
  } catch (error) {
    showMessage(error.message, true);
  }
}

async function recordPayment(event) {
  event.preventDefault();
  const participantId = $('#paymentParticipant').value;
  const amount = Number($('#paymentAmount').value);
  const note = $('#paymentNote').value.trim();
  if (!participantId || !Number.isFinite(amount) || amount <= 0) {
    showMessage('Select a participant and enter an amount greater than zero.', true);
    return;
  }
  const button = event.submitter;
  setBusy(button, true, 'Recording...');
  try {
    await apiRequest(`/api/pools/${state.poolId}/payments`, {
      method: 'POST', body: JSON.stringify({ participantId, amount, note })
    });
    $('#paymentForm').reset();
    await refreshDashboard();
    showMessage('Payment recorded.');
  } catch (error) {
    showMessage(error.message, true);
  } finally {
    setBusy(button, false);
  }
}

function renderImportReport(report) {
  const element = $('#importReport');
  const rejected = report.rejectedRows.map((row) => `<li>Row ${row.row}: ${escapeHtml(row.reason)}</li>`).join('');
  const merged = report.mergedNames.map((merge) => `<li>${escapeHtml(merge.originalName)} → ${escapeHtml(merge.matchedParticipant)}</li>`).join('');
  element.className = 'import-report';
  element.innerHTML = `<strong>Import complete</strong><div class="report-grid"><span>Processed <b>${report.totalRowsProcessed}</b></span><span>Imported <b>${report.importedRows}</b></span><span>Duplicates skipped <b>${report.duplicateRowsSkipped}</b></span><span>Rejected <b>${report.rejectedRowCount}</b></span></div>${merged ? `<p><b>Merged names</b></p><ul>${merged}</ul>` : ''}${rejected ? `<p><b>Rejected rows</b></p><ul>${rejected}</ul>` : ''}`;
}

async function importContributions(event) {
  event.preventDefault();
  const file = $('#importFile').files[0];
  if (!file) {
    showMessage('Choose a CSV file to import.', true);
    return;
  }
  const button = $('#importButton');
  const formData = new FormData();
  formData.append('file', file);
  setBusy(button, true, 'Importing...');
  try {
    const data = await apiRequest(`/api/pools/${state.poolId}/import`, {
      method: 'POST',
      body: formData
    });
    renderImportReport(data.report);
    await refreshDashboard();
    showMessage(`Imported ${data.report.importedRows} contribution(s).`);
    $('#importForm').reset();
  } catch (error) {
    showMessage(error.message, true);
  } finally {
    setBusy(button, false);
  }
}

function renderParticipants(participants) {
  $('#participantCount').textContent = participants.length;
  const list = $('#participantList');
  if (!participants.length) {
    list.className = 'participant-list empty-state';
    list.textContent = 'Add participants to get started.';
  } else {
    list.className = 'participant-list';
    list.innerHTML = participants.map((participant) => `
      <div class="participant-item">
        <span>${escapeHtml(participant.name)}</span>
        <button type="button" data-remove-id="${participant._id}" data-remove-name="${escapeHtml(participant.name)}" aria-label="Remove ${escapeHtml(participant.name)}">×</button>
      </div>`).join('');
  }
  const select = $('#paymentParticipant');
  select.innerHTML = '<option value="">Select participant</option>' + participants.map((participant) =>
    `<option value="${participant._id}">${escapeHtml(participant.name)}</option>`).join('');
}

function renderSummary(summary) {
  const collectionLabel = summary.collectionStatus === 'complete' ? 'Complete' : summary.collectionStatus === 'surplus' ? 'Surplus' : 'Still collecting';
  const amountLabel = summary.collectionStatus === 'surplus' ? money(summary.surplus) : money(summary.remaining);
  $('#summaryCards').innerHTML = [
    ['Budget', money(summary.budget), ''],
    ['Collected', money(summary.totalCollected), 'accent'],
    ['Fair share', money(summary.fairShare), ''],
    [summary.collectionStatus === 'surplus' ? 'Surplus' : 'Remaining', amountLabel, summary.collectionStatus === 'complete' ? 'good' : 'warn'],
    ['Status', collectionLabel, summary.collectionStatus === 'complete' ? 'good' : 'warn']
  ].map(([label, value, className]) => `<div class="summary-card ${className}"><div class="card-label">${label}</div><div class="card-value ${label === 'Status' ? 'status' : ''}">${value}</div></div>`).join('');
  $('#poolTitle').textContent = summary.poolName;
  $('#workspaceLabel').textContent = summary.poolName;
  $('#balanceTableBody').innerHTML = summary.participants.length ? summary.participants.map((participant) => {
    const balanceClass = participant.balance > 0 ? 'balance-positive' : participant.balance < 0 ? 'balance-negative' : 'balance-zero';
    const status = participant.balance > 0 ? `Receives ${money(participant.balance)}` : participant.balance < 0 ? `Owes ${money(Math.abs(participant.balance))}` : 'Settled';
    const statusClass = participant.balance > 0 ? 'receives' : participant.balance < 0 ? 'owes' : 'settled';
    return `<tr><td>${escapeHtml(participant.name)}</td><td>${money(participant.fairShare)}</td><td>${money(participant.totalPaid)}</td><td class="${balanceClass}">${participant.balance > 0 ? '+' : ''}${money(participant.balance)}</td><td><span class="status-pill ${statusClass}">${status}</span></td></tr>`;
  }).join('') : '<tr><td colspan="5" class="empty-state">Add participants to see balances.</td></tr>';
}

function renderSettlements(settlement) {
  const content = $('#settlementContent');
  if (settlement.collectionStatus === 'remaining') {
    content.innerHTML = `<p class="settlement-note">The pool is still short of its target. Participant-to-participant settlement becomes available once the full budget is collected.</p><div class="settled-message">${money(settlement.remaining)} still to collect</div>`;
    return;
  }
  if (settlement.collectionStatus === 'surplus') {
    content.innerHTML = `<p class="settlement-note">The target has been exceeded. Review the surplus before deciding how to handle it.</p><div class="settled-message">${money(settlement.surplus)} surplus</div>`;
    return;
  }
  if (!settlement.transactions.length) {
    content.innerHTML = '<div class="settled-message">Everyone is settled.</div>';
    return;
  }
  content.innerHTML = settlement.transactions.map((transaction) => `<div class="transaction"><div class="transaction-route">${escapeHtml(transaction.from.name)} <span>→</span> ${escapeHtml(transaction.to.name)}</div><div class="transaction-amount">${money(transaction.amount)}</div></div>`).join('');
}

async function refreshDashboard() {
  if (!state.poolId) return;
  $('#summaryCards').innerHTML = '<div class="summary-card"><div class="card-label">Loading</div><div class="card-value">...</div></div>';
  try {
    const [poolData, summaryData, settlementData] = await Promise.all([
      apiRequest(`/api/pools/${state.poolId}`),
      apiRequest(`/api/pools/${state.poolId}/summary`),
      apiRequest(`/api/pools/${state.poolId}/settlements`)
    ]);
    state.participants = poolData.pool.participants;
    state.summary = summaryData.summary;
    renderParticipants(state.participants);
    renderSummary(state.summary);
    renderSettlements(settlementData.settlement);
  } catch (error) {
    showMessage(error.message, true);
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
}

$('#poolForm').addEventListener('submit', createPool);
$('#participantForm').addEventListener('submit', addParticipant);
$('#paymentForm').addEventListener('submit', recordPayment);
$('#importForm').addEventListener('submit', importContributions);
$('#refreshButton').addEventListener('click', refreshDashboard);
$('#participantList').addEventListener('click', (event) => {
  const button = event.target.closest('[data-remove-id]');
  if (button) removeParticipant(button.dataset.removeId, button.dataset.removeName);
});