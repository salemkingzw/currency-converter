class PriceDetector {
  constructor() {
    this.tooltip = null;
    this.preferredCurrency = 'USD';
    this.isProcessing = false;
    this.currencySymbols = {
      '$': 'USD',
      '€': 'EUR',
      '£': 'GBP',
      'R': 'ZAR',
      'USD': 'USD',
      'EUR': 'EUR',
      'GBP': 'GBP',
      'ZAR': 'ZAR'
    };
    
    this.init();
  }

  async init() {
    await this.loadSettings();
    this.createTooltip();
    this.attachEventListeners();
  }

  async loadSettings() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: 'getSettings' }, (response) => {
        if (response) {
          this.preferredCurrency = response.preferredCurrency;
        }
        resolve();
      });
    });
  }

  createTooltip() {
    this.tooltip = document.createElement('div');
    this.tooltip.id = 'currency-converter-tooltip';
    this.tooltip.style.display = 'none';
    document.body.appendChild(this.tooltip);
  }

  attachEventListeners() {
    document.addEventListener('mouseover', this.handleMouseOver.bind(this));
    document.addEventListener('mouseout', this.handleMouseOut.bind(this));
    document.addEventListener('mousemove', this.handleMouseMove.bind(this));
  }

  detectPrice(text) {
    // Enhanced regex patterns for different price formats
    const patterns = [
  /(?:[$£€R]|\bUSD\b|\bEUR\b|\bGBP\b|\bZAR\b)\s*([\d\s,]+(?:\.\d+)?)/gi,
  /([\d\s,]+(?:\.\d+)?)\s*(?:[$£€R]|\bUSD\b|\bEUR\b|\bGBP\b|\bZAR\b)/gi,
  /(?:price|cost|total):\s*(?:[$£€R]|\bUSD\b|\bEUR\b|\bGBP\b|\bZAR\b)?\s*([\d\s,]+(?:\.\d+)?)/gi
];



    for (const pattern of patterns) {
      const matches = [...text.matchAll(pattern)];
      for (const match of matches) {
        const fullMatch = match[0];
        const amount = parseFloat(match[1].replace(/[,\s]/g, ''));
        
        if (amount > 0) {
          // Detect currency from the full match
          let currency = 'USD'; // default
          for (const [symbol, code] of Object.entries(this.currencySymbols)) {
            if (fullMatch.includes(symbol)) {
              currency = code;
              break;
            }
          }
          
          return { amount, currency, fullMatch };
        }
      }
    }
    return null;
  }

  async handleMouseOver(event) {
    if (this.isProcessing) return;
    
    const element = event.target;
    const text = element.textContent || element.innerText || '';
    
    const priceData = this.detectPrice(text);
    if (!priceData) return;

    // Don't show tooltip if already showing the preferred currency
    if (priceData.currency === this.preferredCurrency) return;

    this.isProcessing = true;

    try {
      const response = await new Promise((resolve) => {
        chrome.runtime.sendMessage({
          action: 'convertCurrency',
          amount: priceData.amount,
          fromCurrency: priceData.currency,
          toCurrency: this.preferredCurrency
        }, resolve);
      });

      if (response && response.convertedAmount !== null) {
        this.showTooltip(
          event.pageX,
          event.pageY,
          priceData.amount,
          priceData.currency,
          response.convertedAmount,
          this.preferredCurrency
        );
      }
    } catch (error) {
      console.error('Conversion error:', error);
    }

    this.isProcessing = false;
  }

  handleMouseOut(event) {
    this.hideTooltip();
  }

  handleMouseMove(event) {
    if (this.tooltip.style.display === 'block') {
      this.tooltip.style.left = (event.pageX + 10) + 'px';
      this.tooltip.style.top = (event.pageY - 10) + 'px';
    }
  }

  showTooltip(x, y, originalAmount, originalCurrency, convertedAmount, targetCurrency) {
    const currencySymbolMap = {
      'USD': '$',
      'EUR': '€',
      'GBP': '£',
      'ZAR': 'R'
    };

    const originalSymbol = currencySymbolMap[originalCurrency] || originalCurrency;
    const targetSymbol = currencySymbolMap[targetCurrency] || targetCurrency;

    this.tooltip.innerHTML = `
      <div class="currency-conversion">
        <div class="original-price">${originalSymbol}${originalAmount.toLocaleString()}</div>
        <div class="converted-price">${targetSymbol}${convertedAmount.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
      </div>
    `;
    
    this.tooltip.style.left = (x + 10) + 'px';
    this.tooltip.style.top = (y - 10) + 'px';
    this.tooltip.style.display = 'block';
  }

  hideTooltip() {
    this.tooltip.style.display = 'none';
  }
}

// Initialize the price detector
new PriceDetector();
