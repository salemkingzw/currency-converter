document.addEventListener('DOMContentLoaded', function() {
  const preferredCurrencySelect = document.getElementById('preferredCurrency');
  const status = document.getElementById('status');
  
  // Load current settings
  chrome.storage.sync.get(['preferredCurrency'], function(result) {
    preferredCurrencySelect.value = result.preferredCurrency || 'USD';
  });
  
  // Save settings when changed
  preferredCurrencySelect.addEventListener('change', function() {
    const selectedCurrency = preferredCurrencySelect.value;
    
    chrome.storage.sync.set({
      preferredCurrency: selectedCurrency
    }, function() {
      showStatus('Settings saved!', 'success');
      
      // Notify all tabs to reload settings
      chrome.tabs.query({}, function(tabs) {
        tabs.forEach(tab => {
          chrome.tabs.sendMessage(tab.id, {
            action: 'settingsChanged',
            preferredCurrency: selectedCurrency
          }).catch(() => {
            // Ignore errors for tabs that don't have content script
          });
        });
      });
    });
  });
  
  function showStatus(message, type) {
    status.textContent = message;
    status.className = `status ${type}`;
    status.style.display = 'block';
    
    setTimeout(() => {
      status.style.display = 'none';
    }, 2000);
  }
});
