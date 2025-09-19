// Cache for exchange rates to avoid excessive API calls
let exchangeRatesCache = {};
let lastCacheUpdate = 0;
const CACHE_DURATION = 10 * 60 * 1000; // 10 minutes

// Free API key - you should replace with your own from exchangerate-api.com
const API_KEY = 'your-api-key-here';
const API_URL = 'https://api.exchangerate-api.com/v4/latest/';

// Listen for messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'convertCurrency') {
        convertCurrency(request.amount, request.fromCurrency, request.toCurrency)
            .then(result => sendResponse({success: true, result: result}))
            .catch(error => sendResponse({success: false, error: error.message}));
        return true; // Will respond asynchronously
    }
});

async function convertCurrency(amount, fromCurrency, toCurrency) {
    if (fromCurrency === toCurrency) {
        return {
            convertedAmount: amount,
            rate: 1,
            fromCurrency: fromCurrency,
            toCurrency: toCurrency
        };
    }

    try {
        const rates = await getExchangeRates(fromCurrency);
        const rate = rates[toCurrency];
        
        if (!rate) {
            throw new Error(`Conversion rate not available for ${fromCurrency} to ${toCurrency}`);
        }

        const convertedAmount = amount * rate;
        
        return {
            convertedAmount: convertedAmount,
            rate: rate,
            fromCurrency: fromCurrency,
            toCurrency: toCurrency
        };
    } catch (error) {
        console.error('Currency conversion error:', error);
        throw error;
    }
}

async function getExchangeRates(baseCurrency) {
    const now = Date.now();
    const cacheKey = baseCurrency;
    
    // Check if we have cached rates that are still fresh
    if (exchangeRatesCache[cacheKey] && 
        (now - lastCacheUpdate) < CACHE_DURATION) {
        return exchangeRatesCache[cacheKey];
    }

    try {
        // Use free API without key for demo (limited requests)
        const response = await fetch(`${API_URL}${baseCurrency}`);
        
        if (!response.ok) {
            throw new Error(`API request failed: ${response.status}`);
        }

        const data = await response.json();
        
        if (data.error) {
            throw new Error(data.error);
        }

        // Cache the rates
        exchangeRatesCache[cacheKey] = data.rates;
        lastCacheUpdate = now;
        
        return data.rates;
    } catch (error) {
        // Fallback to cached data if available
        if (exchangeRatesCache[cacheKey]) {
            console.warn('Using stale exchange rates due to API error:', error);
            return exchangeRatesCache[cacheKey];
        }
        throw error;
    }
}

// Clear cache when extension starts
chrome.runtime.onStartup.addListener(() => {
    exchangeRatesCache = {};
    lastCacheUpdate = 0;
});

// Handle installation
chrome.runtime.onInstalled.addListener(() => {
    // Set default settings
    chrome.storage.sync.set({
        targetCurrency: 'USD',
        enableExtension: true
    });
});