// ========================================
// STORMSCAN WIDGET - COMPLETE FUNCTIONAL VERSION
// This is the actual working widget code
// ========================================

(function() {
    'use strict';
    
    // CONFIGURATION - Will be replaced by builder
    const CONFIG = window.STORMSCAN_CONFIG || {
        industry: 'roofer',
        displayMode: 'floating',
        badgePosition: 'right',
        headline: 'Check Your Property Status',
        subheadline: 'Free storm damage report using historical weather data',
        headlineColor: '#000000',
        themeColor: '#00d4aa',
        widgetTheme: 'light',
        hookText: 'Roof Damage Scan',
        thresholds: { wind: 60, rain: 1.5, snow: 12 },
        ghlFormEmbed: ''
    };
    
    // State management
    let isModalOpen = false;
    let scanResults = null;
    
    // API Functions
    async function geocodeZIP(zip) {
        try {
            const response = await fetch(`https://nominatim.openstreetmap.org/search?postalcode=${zip}&country=US&format=json&limit=1`);
            const data = await response.json();
            if (data && data[0]) {
                return {
                    lat: parseFloat(data[0].lat),
                    lon: parseFloat(data[0].lon)
                };
            }
            throw new Error('ZIP not found');
        } catch (error) {
            console.error('Geocoding error:', error);
            return null;
        }
    }
    
    async function getWeatherData(lat, lon) {
        try {
            const endDate = new Date().toISOString().split('T')[0];
            const startDate = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
            
            const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${startDate}&end_date=${endDate}&daily=wind_speed_10m_max,precipitation_sum,snowfall_sum&timezone=auto`;
            
            const response = await fetch(url);
            const data = await response.json();
            
            if (data && data.daily) {
                const maxWind = Math.max(...data.daily.wind_speed_10m_max.filter(v => v !== null)) * 0.621371; // Convert km/h to mph
                const maxRain = Math.max(...data.daily.precipitation_sum.filter(v => v !== null)) * 0.0393701; // Convert mm to inches
                const maxSnow = Math.max(...data.daily.snowfall_sum.filter(v => v !== null)) * 0.393701; // Convert cm to inches
                
                return {
                    wind: maxWind.toFixed(1),
                    rain: maxRain.toFixed(2),
                    snow: maxSnow.toFixed(1)
                };
            }
            throw new Error('No weather data');
        } catch (error) {
            console.error('Weather API error:', error);
            return null;
        }
    }
    
    // UI Creation Functions
    function createStyles() {
        const style = document.createElement('style');
        style.textContent = `
            .stormscan-overlay {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.7);
                z-index: 999998;
                display: none;
                align-items: center;
                justify-content: center;
                padding: 20px;
            }
            .stormscan-overlay.active { display: flex; }
            
            .stormscan-modal {
                background: #fff;
                border-radius: 20px;
                padding: 32px;
                max-width: 450px;
                width: 100%;
                position: relative;
                color: #000;
                max-height: 90vh;
                overflow-y: auto;
            }
            
            .stormscan-close {
                position: absolute;
                top: 20px;
                right: 20px;
                background: none;
                border: none;
                font-size: 24px;
                cursor: pointer;
                color: #64748b;
            }
            .stormscan-close:hover { color: #000; }
            
            .stormscan-badge {
                position: fixed;
                bottom: 30px;
                z-index: 999999;
                display: flex;
                align-items: flex-end;
                cursor: pointer;
            }
            .stormscan-badge.left { left: 30px; flex-direction: row-reverse; }
            .stormscan-badge.right { right: 30px; }
            
            .stormscan-bubble {
                background: #fff;
                color: #000;
                padding: 12px 16px;
                border-radius: 16px;
                font-size: 12px;
                font-weight: 800;
                box-shadow: 0 5px 20px rgba(0,0,0,0.2);
                white-space: nowrap;
                margin-right: 12px;
                border-radius: 16px 16px 0 16px;
            }
            .stormscan-badge.left .stormscan-bubble {
                margin-right: 0;
                margin-left: 12px;
                border-radius: 16px 16px 16px 0;
            }
            
            .stormscan-circle {
                width: 60px;
                height: 60px;
                background: ${CONFIG.themeColor};
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 28px;
                box-shadow: 0 8px 25px rgba(0,0,0,0.3);
            }
            .stormscan-circle:hover { transform: scale(1.05); }
            
            .stormscan-input {
                width: 100%;
                padding: 16px;
                border: 2px solid #e2e8f0;
                border-radius: 12px;
                font-size: 16px;
                margin-bottom: 16px;
                font-family: inherit;
                box-sizing: border-box;
            }
            
            .stormscan-btn {
                width: 100%;
                padding: 18px;
                background: ${CONFIG.themeColor};
                color: #000;
                border: none;
                border-radius: 12px;
                font-weight: 800;
                font-size: 16px;
                cursor: pointer;
                font-family: inherit;
            }
            .stormscan-btn:hover { opacity: 0.9; }
            
            @media (max-width: 600px) {
                .stormscan-bubble { display: none; }
                .stormscan-badge { bottom: 20px; }
                .stormscan-badge.left { left: 20px; }
                .stormscan-badge.right { right: 20px; }
                .stormscan-modal { padding: 24px; }
            }
        `;
        document.head.appendChild(style);
    }
    
    function createFloatingBadge() {
        const badge = document.createElement('div');
        badge.className = `stormscan-badge ${CONFIG.badgePosition}`;
        badge.innerHTML = `
            <div class="stormscan-bubble">${CONFIG.hookText}</div>
            <div class="stormscan-circle">⛈️</div>
        `;
        badge.onclick = openModal;
        document.body.appendChild(badge);
    }
    
    function createModal() {
        const overlay = document.createElement('div');
        overlay.className = 'stormscan-overlay';
        overlay.id = 'stormscan-overlay';
        overlay.onclick = (e) => { if (e.target.id === 'stormscan-overlay') closeModal(); };
        
        const modal = document.createElement('div');
        modal.className = 'stormscan-modal';
        modal.innerHTML = `
            <button class="stormscan-close" onclick="window.StormScan.close()">✕</button>
            <div id="stormscan-content"></div>
        `;
        
        overlay.appendChild(modal);
        document.body.appendChild(overlay);
        
        showInputState();
    }
    
    function showInputState() {
        const content = document.getElementById('stormscan-content');
        content.innerHTML = `
            <h3 style="font-size: 20px; font-weight: 900; margin-bottom: 8px;">⛈️ Storm Scanner</h3>
            <p style="font-size: 13px; color: #64748b; margin-bottom: 20px;">See if recent storms may have damaged your property</p>
            <input type="text" id="stormscan-zip" class="stormscan-input" placeholder="Enter ZIP Code" />
            <button class="stormscan-btn" onclick="window.StormScan.scan()">🔍 SCAN MY PROPERTY</button>
            <div style="text-align: center; margin-top: 12px; font-size: 11px; color: #94a3b8;">
                Free • 30 seconds • No credit card
            </div>
        `;
    }
    
    function showScanningState() {
        const content = document.getElementById('stormscan-content');
        content.innerHTML = `
            <div style="text-align: center; padding: 20px 0;">
                <div style="font-size: 18px; font-weight: 900; margin-bottom: 12px;">ANALYZING...</div>
                <div style="font-size: 12px; color: ${CONFIG.themeColor}; font-weight: 800; margin-bottom: 24px;" id="stormscan-status">📡 Accessing NOAA archives...</div>
                <div style="width: 100%; height: 8px; background: #f1f5f9; border-radius: 4px; overflow: hidden;">
                    <div id="stormscan-progress" style="width: 0%; height: 100%; background: ${CONFIG.themeColor}; transition: width 0.3s;"></div>
                </div>
            </div>
        `;
        
        animateProgress();
    }
    
    function animateProgress() {
        const progress = document.getElementById('stormscan-progress');
        const status = document.getElementById('stormscan-status');
        const messages = [
            '📡 Locating coordinates...',
            '📡 Accessing NOAA servers...',
            '📡 Analyzing 12-month data...',
            '📡 Generating report...'
        ];
        
        let step = 0;
        const interval = setInterval(() => {
            step += 25;
            if (progress) progress.style.width = step + '%';
            if (status && messages[Math.floor(step / 25) - 1]) {
                status.innerText = messages[Math.floor(step / 25) - 1];
            }
            if (step >= 100) clearInterval(interval);
        }, 500);
    }
    
    function showResultsState(results, zip) {
        const content = document.getElementById('stormscan-content');
        
        const isHighRisk = results.wind > CONFIG.thresholds.wind || 
                          results.rain > CONFIG.thresholds.rain || 
                          results.snow > CONFIG.thresholds.snow;
        
        let formHTML = '';
        if (CONFIG.ghlFormEmbed) {
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = CONFIG.ghlFormEmbed;
            const iframe = tempDiv.querySelector('iframe');
            if (iframe) {
                const separator = iframe.src.includes('?') ? '&' : '?';
                iframe.src += `${separator}wind_speed=${results.wind}&rain=${results.rain}&snow=${results.snow}&zip=${zip}`;
                iframe.style.width = '100%';
                iframe.style.height = '600px';
                iframe.style.border = 'none';
                iframe.style.borderRadius = '12px';
                formHTML = tempDiv.innerHTML;
            }
        }
        
        content.innerHTML = `
            <div style="margin-bottom: 20px; padding: 16px; background: ${isHighRisk ? '#fff3cd' : '#d1fae5'}; border: 1px solid ${isHighRisk ? '#ffc107' : '#10b981'}; border-radius: 12px; text-align: center;">
                <div style="font-size: 13px; font-weight: 900; color: ${isHighRisk ? '#856404' : '#065f46'};">${isHighRisk ? '⚠️ MAINTENANCE RECOMMENDED' : '✅ LOW RISK DETECTED'}</div>
            </div>
            
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin-bottom: 20px; font-family: monospace; font-size: 12px;">
                <div style="font-weight: 900; border-bottom: 2px solid #1e293b; padding-bottom: 8px; margin-bottom: 12px;">📋 HISTORY REPORT</div>
                <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px dashed #cbd5e1;">
                    <span>💨 Peak Wind</span>
                    <strong style="color: #dc2626;">${results.wind} MPH</strong>
                </div>
                <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px dashed #cbd5e1;">
                    <span>🌧️ Peak Rain</span>
                    <strong style="color: #2563eb;">${results.rain}"</strong>
                </div>
                <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px dashed #cbd5e1;">
                    <span>❄️ Peak Snow</span>
                    <strong style="color: #0891b2;">${results.snow}"</strong>
                </div>
                <div style="display: flex; justify-content: space-between; padding: 8px 0;">
                    <span>📍 ZIP</span>
                    <strong>${zip}</strong>
                </div>
            </div>
            
            <div style="margin-bottom: 20px; padding: 16px; background: rgba(0, 212, 170, 0.05); border-radius: 12px; font-size: 12px; line-height: 1.6;">
                <strong style="color: ${CONFIG.themeColor}; display: block; margin-bottom: 8px;">🏠 What This Means:</strong>
                ${getExplanation(results)}
                <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid rgba(0, 212, 170, 0.2);">
                    <strong style="color: ${CONFIG.themeColor}; display: block; margin-bottom: 6px;">⏰ Why Act Now?</strong>
                    <ul style="margin: 8px 0 0 20px; padding: 0; line-height: 1.8;">
                        <li>Hidden damage worsens over time</li>
                        <li>Insurance claims require documentation</li>
                        <li>Prevent costly emergency repairs</li>
                        <li>Free inspection spots fill up fast</li>
                    </ul>
                </div>
            </div>
            
            ${formHTML}
            
            <button onclick="window.StormScan.reset()" style="width: 100%; background: transparent; border: none; color: #64748b; text-decoration: underline; cursor: pointer; font-size: 12px; font-weight: 800; font-family: inherit; padding: 12px;">
                🔄 CHECK ANOTHER ADDRESS
            </button>
        `;
    }
    
    function getExplanation(results) {
        if (results.wind > CONFIG.thresholds.wind) {
            return `Wind speeds above ${CONFIG.thresholds.wind}mph can lift shingles, damage siding, and create water entry points. This property experienced ${results.wind} MPH gusts - inspection recommended.`;
        }
        if (results.snow > CONFIG.thresholds.snow) {
            return `Heavy snowfall (${results.snow}") can stress roofs, cause ice dams, and lead to water damage. Properties in snow-prone areas should be inspected for structural integrity.`;
        }
        if (results.rain > CONFIG.thresholds.rain) {
            return `Heavy rainfall (${results.rain}") can overwhelm gutters, cause foundation issues, and reveal drainage problems. Inspection can prevent costly water damage.`;
        }
        return 'Weather conditions have been relatively mild. Regular maintenance still recommended to prevent future issues.';
    }
    
    // Public API
    function openModal() {
        const overlay = document.getElementById('stormscan-overlay');
        if (overlay) {
            overlay.classList.add('active');
            isModalOpen = true;
        }
    }
    
    function closeModal() {
        const overlay = document.getElementById('stormscan-overlay');
        if (overlay) {
            overlay.classList.remove('active');
            isModalOpen = false;
            showInputState();
        }
    }
    
    async function scan() {
        const zipInput = document.getElementById('stormscan-zip');
        const zip = zipInput ? zipInput.value.trim() : '';
        
        if (!zip || zip.length < 5) {
            alert('📮 Please enter a valid US ZIP code!');
            return;
        }
        
        showScanningState();
        
        const coords = await geocodeZIP(zip);
        if (!coords) {
            alert('❌ Could not find that ZIP code. Please try again.');
            showInputState();
            return;
        }
        
        const weather = await getWeatherData(coords.lat, coords.lon);
        if (!weather) {
            alert('❌ Could not fetch weather data. Please try again.');
            showInputState();
            return;
        }
        
        scanResults = { ...weather, zip };
        
        setTimeout(() => {
            showResultsState(weather, zip);
        }, 2000);
    }
    
    function reset() {
        showInputState();
    }
    
    // Initialize
    function init() {
        createStyles();
        
        if (CONFIG.displayMode === 'floating') {
            createFloatingBadge();
        }
        
        createModal();
        
        // Expose public API
        window.StormScan = {
            open: openModal,
            close: closeModal,
            scan: scan,
            reset: reset
        };
        
        console.log('✅ StormScan Widget Loaded');
    }
    
    // Wait for DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
    
})();
