class CurrencyConverter {
  constructor() {
    this.exchangeRates = {};
    this.lastUpdate = 0;
    this.updateInterval = 3600000; 
    this.apiKey = 'YOUR_API_KEY'; 
  }

  async getExchangeRates() {
    const now = Date.now();
    if (now - this.lastUpdate < this.updateInterval && Object.keys(this.exchangeRates).length > 0) {
      return this.exchangeRates;
    }

    try {
      
      const response = await fetch(`https://api.exchangerate-api.com/v4/latest/USD`);
      const data = await response.json();
      
      this.exchangeRates = {
        USD: 1,
        EUR: 1 / data.rates.EUR,
        GBP: 1 / data.rates.GBP,
        ZAR: 1 / data.rates.ZAR
      };
      
      this.lastUpdate = now;
      
     
      chrome.storage.local.set({ 
        exchangeRates: this.exchangeRates,
        lastUpdate: this.lastUpdate 
      });
      
      return this.exchangeRates;
    } catch (error) {
      console.error('Failed to fetch exchange rates:', error);
      
      
      const stored = await chrome.storage.local.get(['exchangeRates']);
      return stored.exchangeRates || {
        USD: 1, EUR: 0.85, GBP: 0.73, ZAR: 18.5 // Fallback rates
      };
    }
  }

  convertCurrency(amount, fromCurrency, toCurrency, rates) {
    if (!rates[fromCurrency] || !rates[toCurrency]) {
      return null;
    }
    
    // Convert to USD first, then to target currency
    const usdAmount = amount * rates[fromCurrency];
    return usdAmount / rates[toCurrency];
  }
}

const converter = new CurrencyConverter();

// Initialize rates on startup
converter.getExchangeRates();

// Handle messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'convertCurrency') {
    converter.getExchangeRates().then(rates => {
      const converted = converter.convertCurrency(
        request.amount,
        request.fromCurrency,
        request.toCurrency,
        rates
      );
      sendResponse({ convertedAmount: converted, rates });
    });
    return true; // Keep channel open for async response
  }
  
  if (request.action === 'getSettings') {
    chrome.storage.sync.get(['preferredCurrency'], (result) => {
      sendResponse({ preferredCurrency: result.preferredCurrency || 'USD' });
    });
    return true;
  }
});
