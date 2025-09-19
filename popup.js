const currencies = [
  'USD','EUR','GBP','JPY','INR','ZAR','CAD','AUD','CHF','CNY','HKD','SGD','BRL','RUB','KRW','MXN','IDR','TRY','SAR','AED','BTC'
];

function populate() {
  const sel = document.getElementById('targetCurrency');
  currencies.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c;
    opt.textContent = c;
    sel.appendChild(opt);
  });

  // load stored
  chrome.storage.sync.get({targetCurrency: 'USD', precision: 2}, (cfg) => {
    sel.value = cfg.targetCurrency || 'USD';
    document.getElementById('precision').value = cfg.precision || 2;
  });

  document.getElementById('saveBtn').addEventListener('click', () => {
    const targetCurrency = document.getElementById('targetCurrency').value;
    const precision = parseInt(document.getElementById('precision').value) || 2;
    chrome.storage.sync.set({targetCurrency, precision}, () => {
      // give quick feedback
      document.getElementById('saveBtn').textContent = 'Saved ✓';
      setTimeout(() => document.getElementById('saveBtn').textContent = 'Save', 900);
    });
  });
}

document.addEventListener('DOMContentLoaded', populate);