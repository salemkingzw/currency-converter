// Global variables
let isExtensionEnabled = true;
let targetCurrency = 'USD';
let tooltip = null;
let currentHoveredElement = null;
let conversionCache = new Map();

// Currency symbols and patterns
const currencyPatterns = {
    // Symbol-based patterns
    '$': { regex: /\$\s?(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?)/g, currency: 'USD' },
    '€': { regex: /€\s?(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?)/g, currency: 'EUR' },
    '£': { regex: /£\s?(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?)/g, currency: 'GBP' },
    '¥': { regex: /¥\s?(\d{1,3}(?:,\d{3})*(?:\.\d{0,2})?)/g, currency: 'JPY' },
    '₹': { regex: /₹\s?(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?)/g, currency: 'INR' },
    'C$': { regex: /C\$\s?(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?)/g, currency: 'CAD' },
    'A$': { regex: /A\$\s?(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?)/g, currency: 'AUD' },
    
    // Text-based patterns
    'USD': { regex: /(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?)\s?USD/gi, currency: 'USD' },
    'EUR': { regex: /(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?)\s?EUR/gi, currency: 'EUR' },
    'GBP': { regex: /(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?)\s?GBP/gi, currency: 'GBP' },
    'JPY': { regex: /(\d{1,3}(?:,\d{3})*(?:\.\d{0,2})?)\s?JPY/gi, currency: 'JPY' },
    'CAD': { regex: /(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?)\s?CAD/gi, currency: 'CAD' },
    'AUD': { regex: /(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?)\s?AUD/gi, currency: 'AUD' },
    'CHF': { regex: /(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?)\s?CHF/gi, currency: 'CHF' },
    'CNY': { regex: /(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?)\s?CNY/gi, currency: 'CNY' },
    'INR': { regex: /(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?)\s?INR/gi, currency: 'INR' },
    'BTC': { regex: /(\d+(?:\.\d{1,8})?)\s?BTC/gi, currency: 'BTC' }
};

// Initialize the extension
function init() {
    // Load settings
    chrome.storage.sync.get(['targetCurrency', 'enableExtension'], (result) => {
        targetCurrency = result.targetCurrency || 'USD';
        isExtensionEnabled = result.enableExtension !== false;
        
        if (isExtensionEnabled) {
            scanAndWrapCurrencies();
            setupEventListeners();
        }
    });
}

// Scan the page for currencies and wrap them
function scanAndWrapCurrencies() {
    const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
        {
            acceptNode: function(node) {
                // Skip script and style elements
                const parent = node.parentElement;
                if (!parent) return NodeFilter.FILTER_REJECT;
                
                const tagName = parent.tagName.toLowerCase();
                if (['script', 'style', 'noscript'].includes(tagName)) {
                    return NodeFilter.FILTER_REJECT;
                }
                
                // Only process text nodes with currency-like content
                return /[\$€£¥₹]|\b(USD|EUR|GBP|JPY|CAD|AUD|CHF|CNY|INR|BTC)\b/i.test(node.textContent) 
                    ? NodeFilter.FILTER_ACCEPT 
                    : NodeFilter.FILTER_REJECT;
            }
        }
    );

    const textNodes = [];
    let node;
    while (node = walker.nextNode()) {
        textNodes.push(node);
    }

    textNodes.forEach(processTextNode);
}

function processTextNode(textNode) {
    if (textNode.parentElement.classList.contains('currency-converter-wrapped')) {
        return; // Already processed
    }

    let html = textNode.textContent;
    let hasMatches = false;

    // Check each currency pattern
    for (const [symbol, pattern] of Object.entries(currencyPatterns)) {
        html = html.replace(pattern.regex, (match, amount) => {
            hasMatches = true;
            const cleanAmount = parseFloat(amount.replace(/,/g, ''));
            const wrappedText = `<span class="currency-amount" data-amount="${cleanAmount}" data-currency="${pattern.currency}" data-original="${match}">${match}</span>`;
            return wrappedText;
        });
    }

    if (hasMatches) {
        const wrapper = document.createElement('span');
        wrapper.className = 'currency-converter-wrapped';
        wrapper.innerHTML = html;
        textNode.parentNode.replaceChild(wrapper, textNode);
    }
}

function setupEventListeners() {
    // Use event delegation for hover events
    document.addEventListener('mouseover', handleMouseOver);
    document.addEventListener('mouseout', handleMouseOut);
    document.addEventListener('mousemove', handleMouseMove);
}

function handleMouseOver(event) {
    if (!isExtensionEnabled) return;
    
    const element = event.target.closest('.currency-amount');
    if (element && element !== currentHoveredElement) {
        currentHoveredElement = element;
        showTooltip(element, event);
    }
}

function handleMouseOut(event) {
    const element = event.target.closest('.currency-amount');
    if (element && element === currentHoveredElement) {
        currentHoveredElement = null;
        hideTooltip();
    }
}

function handleMouseMove(event) {
    if (tooltip && tooltip.style.display !== 'none') {
        positionTooltip(event);
    }
}

async function showTooltip(element, event) {
    const amount = parseFloat(element.dataset.amount);
    const fromCurrency = element.dataset.currency;
    const original = element.dataset.original;

    if (fromCurrency === targetCurrency) {
        return; // No need to convert to same currency
    }

    // Check cache first
    const cacheKey = `${amount}-${fromCurrency}-${targetCurrency}`;
    if (conversionCache.has(cacheKey)) {
        displayTooltip(conversionCache.get(cacheKey), event);
        return;
    }

    // Show loading tooltip
    displayTooltip({ loading: true, original }, event);

    try {
        // Request conversion from background script
        chrome.runtime.sendMessage({
            action: 'convertCurrency',
            amount: amount,
            fromCurrency: fromCurrency,
            toCurrency: targetCurrency
        }, (response) => {
            if (response.success) {
                const result = {
                    ...response.result,
                    original: original,
                    loading: false
                };
                
                // Cache the result
                conversionCache.set(cacheKey, result);
                
                // Update tooltip if still hovering the same element
                if (currentHoveredElement === element) {
                    displayTooltip(result, event);
                }
            } else {
                displayTooltip({ 
                    error: response.error || 'Conversion failed',
                    original: original 
                }, event);
            }
        });
    } catch (error) {
        displayTooltip({ 
            error: 'Network error', 
            original: original 
        }, event);
    }
}

function displayTooltip(data, event) {
    if (!tooltip) {
        createTooltip();
    }

    let content = '';
    
    if (data.loading) {
        content = `
            <div class="tooltip-header">${data.original}</div>
            <div class="tooltip-body">
                <div class="loading">Converting...</div>
            </div>
        `;
    } else if (data.error) {
        content = `
            <div class="tooltip-header">${data.original}</div>
            <div class="tooltip-body error">
                ${data.error}
            </div>
        `;
    } else {
        const formatted = formatCurrency(data.convertedAmount, data.toCurrency);
        content = `
            <div class="tooltip-header">${data.original}</div>
            <div class="tooltip-body">
                <div class="converted-amount">${formatted}</div>
                <div class="rate">Rate: 1 ${data.fromCurrency} = ${data.rate.toFixed(4)} ${data.toCurrency}</div>
            </div>
        `;
    }

    tooltip.innerHTML = content;
    tooltip.style.display = 'block';
    positionTooltip(event);
}

function formatCurrency(amount, currency) {
    try {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: currency,
            minimumFractionDigits: currency === 'JPY' ? 0 : 2,
            maximumFractionDigits: currency === 'BTC' ? 8 : 2
        }).format(amount);
    } catch (error) {
        // Fallback formatting
        const symbol = getCurrencySymbol(currency);
        return `${symbol}${amount.toLocaleString()}`;
    }
}

function getCurrencySymbol(currency) {
    const symbols = {
        'USD': '$', 'EUR': '€', 'GBP': '£', 'JPY': '¥', 
        'INR': '₹', 'CAD': 'C$', 'AUD': 'A$', 'CHF': 'CHF',
        'CNY': '¥', 'BTC': '₿'
    };
    return symbols[currency] || currency;
}

function createTooltip() {
    tooltip = document.createElement('div');
    tooltip.className = 'currency-converter-tooltip';
    tooltip.style.display = 'none';
    document.body.appendChild(tooltip);
}

function positionTooltip(event) {
    if (!tooltip) return;

    const padding = 10;
    const tooltipRect = tooltip.getBoundingClientRect();
    
    let left = event.pageX + padding;
    let top = event.pageY - tooltipRect.height - padding;

    // Adjust if tooltip would go off screen
    if (left + tooltipRect.width > window.innerWidth + window.pageXOffset) {
        left = event.pageX - tooltipRect.width - padding;
    }
    
    if (top < window.pageYOffset) {
        top = event.pageY + padding;
    }

    tooltip.style.left = left + 'px';
    tooltip.style.top = top + 'px';
}

function hideTooltip() {
    if (tooltip) {
        tooltip.style.display = 'none';
    }
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'settingsChanged') {
        targetCurrency = request.targetCurrency;
        // Clear cache when target currency changes
        conversionCache.clear();
    } else if (request.action === 'toggleExtension') {
        isExtensionEnabled = request.enabled;
        if (!isExtensionEnabled) {
            hideTooltip();
        }
    }
});

// Handle dynamic content changes
const observer = new MutationObserver((mutations) => {
    if (!isExtensionEnabled) return;
    
    let shouldRescan = false;
    mutations.forEach((mutation) => {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
            for (let node of mutation.addedNodes) {
                if (node.nodeType === Node.TEXT_NODE || 
                    (node.nodeType === Node.ELEMENT_NODE && node.innerText)) {
                    shouldRescan = true;
                    break;
                }
            }
        }
    });

    if (shouldRescan) {
        // Debounce rescanning
        clearTimeout(observer.rescanTimeout);
        observer.rescanTimeout = setTimeout(() => {
            scanAndWrapCurrencies();
        }, 500);
    }
});

observer.observe(document.body, {
    childList: true,
    subtree: true
});

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}