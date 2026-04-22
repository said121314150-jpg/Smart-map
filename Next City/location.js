/**
 * location.js — Smart Locator AI Search Engine
 *
 * Core exported functions:
 *   requestLocation()            — get browser GPS coords
 *   initMap(lat, lng)            — render Leaflet map
 *   handlePermissionDenied()     — graceful fallback
 *   parseQuery(text)             — NLP intent extraction
 *   searchNearby(lat, lng, type) — Overpass API place search
 *   renderResults(places)        — display result cards + markers
 */

'use strict';

/* ═══════════════════════════════════════════════════════════════
   NLP — MULTILINGUAL INTENT DICTIONARY
   (English + Uzbek + Russian common terms)
═══════════════════════════════════════════════════════════════ */
const INTENT_MAP = [
    // Stadiums / Sports
    { patterns: ['stadium','stadion','sport','futbol','football','soccer','arena','sports complex'], type: 'stadium', icon: 'fa-futbol', label: 'Stadium' },
    // Restaurants / Food
    { patterns: ['restaurant','restoran','eatery','food','eat','taom','ovqat','lunch','dinner','breakfast','nonushta','tushlik','kafe','restorant'], type: 'restaurant', icon: 'fa-utensils', label: 'Restaurant' },
    // Cafes
    { patterns: ['cafe','café','coffee','qahvaxona','coffeeshop','tea','choy','choyxona','tea house','kafe'], type: 'cafe', icon: 'fa-mug-hot', label: 'Café' },
    // Hospitals
    { patterns: ['hospital','shifoxona','clinic','klinika','emergency','tez yordam','doctor','shifokor','health','doktor','med','tibbiy'], type: 'hospital', icon: 'fa-hospital', label: 'Hospital' },
    // Pharmacy
    { patterns: ['pharmacy','dorixona','drug','medicine','dori','apteka','chemist'], type: 'pharmacy', icon: 'fa-pills', label: 'Pharmacy' },
    // ATM / Bank
    { patterns: ['atm','bankomat','cash','naxt pul','money','pul','withdraw'], type: 'atm', icon: 'fa-money-bill-wave', label: 'ATM' },
    { patterns: ['bank','bank','financial','moliya'], type: 'bank', icon: 'fa-building-columns', label: 'Bank' },
    // School
    { patterns: ['school','maktab','college','university','university','institut','education','talim','akademiya','academy','kindergarten'], type: 'school', icon: 'fa-school', label: 'School' },
    // Fuel / Gas
    { patterns: ['fuel','gas','petrol','benzin','gasoline','yoqilg\'i','filling','oil'], type: 'fuel', icon: 'fa-gas-pump', label: 'Fuel Station' },
    // Hotel
    { patterns: ['hotel','mehmonxona','motel','hostel','accommodation','stay','inn'], type: 'hotel', icon: 'fa-hotel', label: 'Hotel' },
    // Mosque
    { patterns: ['mosque','masjid','jome','namoz','prayer','church','cathedral','temple','ibodatxona'], type: 'place_of_worship', icon: 'fa-mosque', label: 'Place of Worship' },
    // Supermarket / Shop
    { patterns: ['supermarket','bozor','market','do\'kon','shop','store','grocery','magazin','bazaar'], type: 'supermarket', icon: 'fa-cart-shopping', label: 'Market' },
    // Parking
    { patterns: ['parking','parkovka','park','garaj','garage'], type: 'parking', icon: 'fa-square-parking', label: 'Parking' },
    // Police
    { patterns: ['police','politsiya','militsiya','security','xavfsizlik','cop'], type: 'police', icon: 'fa-shield-halved', label: 'Police' },
    // Bus / Transport
    { patterns: ['bus','avtobus','bus stop','bus station','transport','marshrutka','metro','train','poezd','taxi'], type: 'bus_station', icon: 'fa-bus', label: 'Bus Station' },
    // Park / Nature
    { patterns: ['park','bog\'','garden','nature','recreation','dam','ko\'l','lake','river','daryo'], type: 'park', icon: 'fa-tree', label: 'Park' },
];

/* Category-to-Overpass tag mapping */
const OSM_TAGS = {
    stadium:          '["leisure"="stadium"]',
    restaurant:       '["amenity"="restaurant"]',
    cafe:             '["amenity"="cafe"]',
    hospital:         '["amenity"~"hospital|clinic"]',
    pharmacy:         '["amenity"="pharmacy"]',
    atm:              '["amenity"="atm"]',
    bank:             '["amenity"="bank"]',
    school:           '["amenity"~"school|college|university|kindergarten"]',
    fuel:             '["amenity"="fuel"]',
    hotel:            '["tourism"~"hotel|motel|hostel|guest_house"]',
    place_of_worship: '["amenity"="place_of_worship"]',
    supermarket:      '["shop"~"supermarket|convenience|grocery|bakery|butcher"]',
    parking:          '["amenity"="parking"]',
    police:           '["amenity"="police"]',
    bus_station:      '["amenity"~"bus_station|bus_stop"]',
    park:             '["leisure"~"park|garden|nature_reserve"]',
};

/* Icon map for markers */
const ICON_MAP = {};
INTENT_MAP.forEach(i => ICON_MAP[i.type] = { icon: i.icon, label: i.label });

/* Autocomplete suggestions */
const SUGGESTIONS = {
    en: [
        'Find the nearest restaurant',
        'Nearest hospital to me',
        'Closest ATM nearby',
        'Find a café near me',
        'Nearest pharmacy',
        'Show fuel stations near me',
        'Find nearby parking',
        'Nearest bus station',
        'Closest mosque',
        'Find a hotel near me',
    ],
    uz: [
        'Yaqin restoran toping',
        'Eng yaqin shifoxona',
        'Yaqin dorixona toping',
        'Bankomat qani?',
        'Eng yaqin maktab',
        'Kafe toping',
        'Yaqin benzin quyish',
        'Eng yaqin masjid',
        'Yaqin mehmonxona',
        'Avtobus bekati qani?',
    ],
};

/* ═══════════════════════════════════════════════════════════════
   STATE
═══════════════════════════════════════════════════════════════ */
let map           = null;
let userMarker    = null;
let resultMarkers = [];
let userLat       = null;
let userLng       = null;
let activeTileLayer = null;
let currentResults  = [];
let selectedResult  = null;
let searchTimeout   = null;
let autoCompleteIdx = -1;

/* ═══════════════════════════════════════════════════════════════
   DOM REFS
═══════════════════════════════════════════════════════════════ */
const $ = id => document.getElementById(id);
const elInput          = $('sl-input');
const elSearchBtn      = $('sl-search-btn');
const elAutocomplete   = $('sl-autocomplete');
const elStatus         = $('sl-status');
const elStatusProgress = $('sl-status-progress');
const elStatusText     = $('sl-status-text');
const elResults        = $('sl-results');
const elResultsTitle   = $('sl-results-title');
const elResultsList    = $('sl-results-list');
const elResultsClear   = $('sl-results-clear');
const elEmpty          = $('sl-empty');
const elEmptyText      = $('sl-empty-text');
const elError          = $('sl-error');
const elErrorText      = $('sl-error-text');
const elErrorRetry     = $('sl-error-retry');
const elGeoFallback    = $('sl-geo-fallback');
const elFallbackInput  = $('sl-fallback-input');
const elFallbackGo     = $('sl-fallback-go');
const elMyLoc          = $('sl-my-loc');
const elDetail         = $('sl-detail');
const elDetailClose    = $('sl-detail-close');
const elDetailIcon     = $('sl-detail-icon');
const elDetailName     = $('sl-detail-name');
const elDetailType     = $('sl-detail-type');
const elDetailDistance = $('sl-detail-distance');
const elDetailAddress  = $('sl-detail-address');
const elDetailAddressRow = $('sl-detail-address-row');
const elDetailPhone    = $('sl-detail-phone');
const elDetailPhoneRow = $('sl-detail-phone-row');
const elDetailHours    = $('sl-detail-hours');
const elDetailHoursRow = $('sl-detail-hours-row');
const elDetailGmaps    = $('sl-detail-gmaps');
const elDetailCenter   = $('sl-detail-center');

/* ═══════════════════════════════════════════════════════════════
   NLP — parseQuery(text) → { type, icon, label } | null
═══════════════════════════════════════════════════════════════ */
function parseQuery(text) {
    const lower = text.toLowerCase().trim();

    for (const intent of INTENT_MAP) {
        for (const pattern of intent.patterns) {
            if (lower.includes(pattern)) {
                return { type: intent.type, icon: intent.icon, label: intent.label };
            }
        }
    }
    return null;
}

/* ═══════════════════════════════════════════════════════════════
   GEOLOCATION — requestLocation()
═══════════════════════════════════════════════════════════════ */
function requestLocation() {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            reject(new Error('NO_SUPPORT'));
            return;
        }
        navigator.geolocation.getCurrentPosition(
            pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
            err => reject(err),
            { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 }
        );
    });
}

/* ═══════════════════════════════════════════════════════════════
   handlePermissionDenied()
═══════════════════════════════════════════════════════════════ */
function handlePermissionDenied() {
    hideAll();
    elGeoFallback.hidden = false;
    elGeoFallback.classList.add('sl-visible');
    setStatus(false);
}

/* ═══════════════════════════════════════════════════════════════
   MAP — initMap(lat, lng)
═══════════════════════════════════════════════════════════════ */
function initMap(lat, lng, isUserLocation = true) {
    if (map) {
        map.flyTo([lat, lng], 14, { duration: 1.2 });
        if (isUserLocation) placeUserMarker(lat, lng);
        return;
    }

    map = L.map('sl-map', {
        center: [lat, lng],
        zoom: isUserLocation ? 14 : 12,
        zoomControl: false,
        attributionControl: false,
    });

    // Attribution — bottom right
    L.control.attribution({ prefix: false, position: 'bottomright' })
        .addAttribution('© <a href="https://www.openstreetmap.org/copyright">OSM</a> · © <a href="https://carto.com/">CARTO</a>')
        .addTo(map);

    applyTileTheme();

    // Watch theme changes
    new MutationObserver(applyTileTheme)
        .observe(document.body, { attributes: true, attributeFilter: ['class'] });

    if (isUserLocation) placeUserMarker(lat, lng);

    // Invalidate on panel resize (mobile accordion)
    setTimeout(() => map.invalidateSize(), 400);
}

/* ── Tile theme sync ── */
function applyTileTheme() {
    if (!map) return;
    const isLight = document.body.classList.contains('light-mode');
    const url = isLight
        ? 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png'
        : 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png';

    if (activeTileLayer) map.removeLayer(activeTileLayer);
    activeTileLayer = L.tileLayer(url, {
        subdomains: 'abcd',
        maxZoom: 20,
    }).addTo(map);
}

/* ── User location marker ── */
function placeUserMarker(lat, lng) {
    if (userMarker) map.removeLayer(userMarker);

    const icon = L.divIcon({
        className: '',
        html: `<div class="sl-user-marker"><div class="sl-user-pulse"></div><div class="sl-user-dot"></div></div>`,
        iconSize: [36, 36],
        iconAnchor: [18, 18],
    });

    userMarker = L.marker([lat, lng], { icon, zIndexOffset: 1000 })
        .addTo(map)
        .bindPopup('<div class="sl-popup"><strong>📍 You are here</strong></div>',
            { className: 'sl-leaflet-popup', maxWidth: 160 });
}

/* ═══════════════════════════════════════════════════════════════
   OVERPASS API — searchNearby(lat, lng, osmTag, radius)
═══════════════════════════════════════════════════════════════ */
async function searchNearby(lat, lng, osmTag, radius = 3000) {
    const tagFilter = OSM_TAGS[osmTag] || `["amenity"="${osmTag}"]`;

    const query = `
[out:json][timeout:20];
(
  node${tagFilter}(around:${radius},${lat},${lng});
  way${tagFilter}(around:${radius},${lat},${lng});
);
out center 30;
`.trim();

    const url = 'https://overpass-api.de/api/interpreter';

    const resp = await fetch(url, {
        method: 'POST',
        body: query,
        headers: { 'Content-Type': 'text/plain' },
    });

    if (!resp.ok) throw new Error('Overpass API error: ' + resp.status);

    const data = await resp.json();

    // Normalise nodes + ways (ways have a `center` object)
    return (data.elements || []).map(el => {
        const lat2 = el.lat  ?? el.center?.lat;
        const lng2 = el.lon  ?? el.center?.lon;
        return {
            id:       el.id,
            lat:      lat2,
            lng:      lng2,
            name:     el.tags?.name || el.tags?.['name:en'] || el.tags?.['name:uz'] || 'Unnamed',
            address:  buildAddress(el.tags),
            phone:    el.tags?.phone || el.tags?.['contact:phone'] || null,
            hours:    el.tags?.opening_hours || null,
            website:  el.tags?.website || null,
            tags:     el.tags || {},
            distance: haversine(lat, lng, lat2, lng2),
        };
    })
    .filter(p => p.lat && p.lng)
    .sort((a, b) => a.distance - b.distance);
}

/* ── Build a readable address from OSM tags ── */
function buildAddress(tags) {
    if (!tags) return null;
    const parts = [
        tags['addr:street'],
        tags['addr:housenumber'],
        tags['addr:city'] || tags['addr:town'],
    ].filter(Boolean);
    return parts.length ? parts.join(', ') : (tags['addr:full'] || null);
}

/* ── Haversine distance in metres ── */
function haversine(lat1, lng1, lat2, lng2) {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/* ── Format distance nicely ── */
function fmtDist(m) {
    return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`;
}

/* ═══════════════════════════════════════════════════════════════
   RENDER RESULTS — markers + result cards
═══════════════════════════════════════════════════════════════ */
function renderResults(places, intent) {
    clearResultMarkers();

    if (!places.length) {
        hideAll();
        elEmptyText.textContent = `No ${intent.label.toLowerCase()}s found within 3 km. Try a wider area.`;
        elEmpty.hidden = false;
        elEmpty.classList.add('sl-visible');
        return;
    }

    currentResults = places;

    // Update results panel
    elResultsTitle.textContent = `${intent.label}s nearby (${places.length})`;
    elResultsList.innerHTML = '';

    const top5 = places.slice(0, 8);

    top5.forEach((place, idx) => {
        // Map marker
        const isFirst = idx === 0;
        const markerEl = document.createElement('div');
        markerEl.className = `sl-result-marker ${isFirst ? 'sl-result-marker--primary' : ''}`;
        markerEl.innerHTML = `<i class="fas ${intent.icon}"></i>`;

        const leafletIcon = L.divIcon({
            className: '',
            html: markerEl.outerHTML,
            iconSize: isFirst ? [42, 42] : [34, 34],
            iconAnchor: isFirst ? [21, 21] : [17, 17],
        });

        const m = L.marker([place.lat, place.lng], { icon: leafletIcon })
            .addTo(map)
            .bindPopup(`
                <div class="sl-popup">
                    <strong>${escHtml(place.name)}</strong><br>
                    <span>${fmtDist(place.distance)} away</span>
                </div>`, { className: 'sl-leaflet-popup', maxWidth: 200 });

        m.on('click', () => openDetail(place, intent));
        resultMarkers.push(m);

        // Result card in sidebar
        const li = document.createElement('li');
        li.className = `sl-result-item ${isFirst ? 'sl-result-item--top' : ''}`;
        li.dataset.idx = idx;
        li.innerHTML = `
            <div class="sl-result-rank">${isFirst ? '<i class="fas fa-trophy"></i>' : idx + 1}</div>
            <div class="sl-result-body">
                <span class="sl-result-name">${escHtml(place.name)}</span>
                ${place.address ? `<span class="sl-result-addr">${escHtml(place.address)}</span>` : ''}
            </div>
            <div class="sl-result-dist">${fmtDist(place.distance)}</div>
        `;
        li.addEventListener('click', () => {
            highlightResultItem(li);
            openDetail(place, intent);
            map.flyTo([place.lat, place.lng], 16, { duration: 1 });
            resultMarkers[idx]?.openPopup();
        });
        elResultsList.appendChild(li);
    });

    hideAll();
    elResults.hidden = false;
    elResults.classList.add('sl-visible');

    // Fly map to best result
    if (places.length === 1) {
        map.flyTo([places[0].lat, places[0].lng], 16, { duration: 1.2 });
    } else {
        const bounds = L.latLngBounds(
            top5.map(p => [p.lat, p.lng]).concat([[userLat, userLng]])
        );
        map.flyToBounds(bounds, { padding: [60, 60], maxZoom: 16, duration: 1.2 });
    }

    // Auto-open top result detail
    openDetail(places[0], intent);
}

/* ── Highlight selected list item ── */
function highlightResultItem(li) {
    elResultsList.querySelectorAll('.sl-result-item').forEach(el => el.classList.remove('sl-result-item--selected'));
    li.classList.add('sl-result-item--selected');
}

/* ── Open detail card ── */
function openDetail(place, intent) {
    selectedResult = place;

    elDetailIcon.innerHTML = `<i class="fas ${intent.icon}"></i>`;
    elDetailName.textContent = place.name;
    elDetailType.textContent = intent.label;
    elDetailDistance.textContent = fmtDist(place.distance) + ' from you';

    if (place.address) {
        elDetailAddress.textContent = place.address;
        elDetailAddressRow.hidden = false;
    } else {
        elDetailAddressRow.hidden = true;
    }

    if (place.phone) {
        elDetailPhone.textContent = place.phone;
        elDetailPhone.href = 'tel:' + place.phone.replace(/\s/g, '');
        elDetailPhoneRow.hidden = false;
    } else {
        elDetailPhoneRow.hidden = true;
    }

    if (place.hours) {
        elDetailHours.textContent = place.hours;
        elDetailHoursRow.hidden = false;
    } else {
        elDetailHoursRow.hidden = true;
    }

    elDetailGmaps.href = `https://www.google.com/maps/dir/?api=1&destination=${place.lat},${place.lng}`;
    elDetailCenter.onclick = () => map.flyTo([place.lat, place.lng], 16, { duration: 1 });

    elDetail.hidden = false;
    requestAnimationFrame(() => elDetail.classList.add('sl-visible'));
}

/* ── Clear old result markers ── */
function clearResultMarkers() {
    resultMarkers.forEach(m => map?.removeLayer(m));
    resultMarkers = [];
}

/* ═══════════════════════════════════════════════════════════════
   MAIN SEARCH FLOW
═══════════════════════════════════════════════════════════════ */
async function runSearch(queryText) {
    const intent = parseQuery(queryText);

    if (!intent) {
        showError('Could not understand your query. Try typing something like "find nearest hospital" or "eng yaqin kafe".');
        return;
    }

    // Step 1 — get user location if we don't have it
    if (!userLat) {
        setStatus(true, 'Requesting location…', 20);
        try {
            const pos = await requestLocation();
            userLat = pos.lat;
            userLng = pos.lng;
            initMap(userLat, userLng);
        } catch (err) {
            if (err.code === 1 || err.message === 'NO_SUPPORT') {
                handlePermissionDenied();
                return;
            }
            showError('Could not get your location: ' + (err.message || 'timeout'));
            return;
        }
    }

    // Step 2 — search
    try {
        setStatus(true, `Searching for ${intent.label.toLowerCase()}s…`, 45);
        const places = await searchNearby(userLat, userLng, intent.type);
        setStatus(true, 'Rendering results…', 90);
        await tick();
        renderResults(places, intent);
        setStatus(false);
    } catch (err) {
        console.error(err);
        showError('Search failed. Please check your internet connection and try again.');
    }
}

/* ═══════════════════════════════════════════════════════════════
   UI HELPERS
═══════════════════════════════════════════════════════════════ */
function hideAll() {
    [elEmpty, elError, elGeoFallback].forEach(el => {
        el.classList.remove('sl-visible');
        el.hidden = true;
    });
    [elResults, elDetail].forEach(el => el.classList.remove('sl-visible'));
    elDetail.hidden = true;
}

function setStatus(visible, text = '', pct = 0) {
    elStatus.hidden = !visible;
    if (visible) {
        elStatusText.textContent = text;
        elStatusProgress.style.width = pct + '%';
        elStatus.classList.add('sl-visible');
    } else {
        elStatus.classList.remove('sl-visible');
        setTimeout(() => { if (!elStatus.classList.contains('sl-visible')) elStatus.hidden = true; }, 350);
    }
}

function showError(msg) {
    setStatus(false);
    hideAll();
    elErrorText.textContent = msg;
    elError.hidden = false;
    requestAnimationFrame(() => elError.classList.add('sl-visible'));
}

function escHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function tick() {
    return new Promise(r => setTimeout(r, 16));
}

/* ═══════════════════════════════════════════════════════════════
   AUTOCOMPLETE
═══════════════════════════════════════════════════════════════ */
function buildAutocomplete(text) {
    if (!text || text.length < 2) {
        closeAutocomplete();
        return;
    }
    const lower = text.toLowerCase();
    const all = [...SUGGESTIONS.en, ...SUGGESTIONS.uz];
    const matches = all.filter(s => s.toLowerCase().includes(lower)).slice(0, 6);

    if (!matches.length) { closeAutocomplete(); return; }

    elAutocomplete.innerHTML = '';
    matches.forEach((s, i) => {
        const li = document.createElement('li');
        li.className = 'sl-ac-item';
        li.textContent = s;
        li.setAttribute('role', 'option');
        li.setAttribute('aria-selected', 'false');
        li.addEventListener('mousedown', e => {
            e.preventDefault();
            elInput.value = s;
            closeAutocomplete();
            runSearch(s);
        });
        elAutocomplete.appendChild(li);
    });

    elAutocomplete.hidden = false;
    autoCompleteIdx = -1;
}

function closeAutocomplete() {
    elAutocomplete.hidden = true;
    elAutocomplete.innerHTML = '';
    autoCompleteIdx = -1;
}

function navigateAutocomplete(dir) {
    const items = elAutocomplete.querySelectorAll('.sl-ac-item');
    if (!items.length) return;
    items[autoCompleteIdx]?.classList.remove('sl-ac-item--active');
    autoCompleteIdx = (autoCompleteIdx + dir + items.length) % items.length;
    const active = items[autoCompleteIdx];
    active.classList.add('sl-ac-item--active');
    active.setAttribute('aria-selected', 'true');
    elInput.value = active.textContent;
}

/* ═══════════════════════════════════════════════════════════════
   GEOCODE FALLBACK (city name → lat/lng via Nominatim)
═══════════════════════════════════════════════════════════════ */
async function geocodeCity(name) {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(name)}&format=json&limit=1`;
    const resp = await fetch(url, { headers: { 'Accept-Language': 'en', 'User-Agent': 'SmartCityLocator/1.0' } });
    if (!resp.ok) throw new Error('Geocode failed');
    const data = await resp.json();
    if (!data.length) throw new Error('NOT_FOUND');
    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon), display: data[0].display_name };
}

/* ═══════════════════════════════════════════════════════════════
   EVENT LISTENERS
═══════════════════════════════════════════════════════════════ */

// Search button
elSearchBtn.addEventListener('click', () => {
    const q = elInput.value.trim();
    if (q) { closeAutocomplete(); runSearch(q); }
});

// Enter key
elInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
        e.preventDefault();
        if (!elAutocomplete.hidden && autoCompleteIdx >= 0) {
            closeAutocomplete();
        }
        const q = elInput.value.trim();
        if (q) runSearch(q);
    } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        navigateAutocomplete(1);
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        navigateAutocomplete(-1);
    } else if (e.key === 'Escape') {
        closeAutocomplete();
    }
});

// Typing autocomplete (debounced)
elInput.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => buildAutocomplete(elInput.value.trim()), 200);
});

elInput.addEventListener('blur', () => setTimeout(closeAutocomplete, 200));

// Category chips
document.getElementById('sl-categories').addEventListener('click', e => {
    const chip = e.target.closest('.sl-chip');
    if (!chip) return;
    const type = chip.dataset.type;
    const info = INTENT_MAP.find(i => i.type === type || i.patterns.includes(type))
              || INTENT_MAP.find(i => i.type === type);
    const label = info?.label || type;
    elInput.value = `Find nearest ${label.toLowerCase()}`;
    closeAutocomplete();

    // Chip active state
    document.querySelectorAll('.sl-chip').forEach(c => c.classList.remove('sl-chip--active'));
    chip.classList.add('sl-chip--active');

    runSearch(elInput.value);
});

// Clear results
elResultsClear.addEventListener('click', () => {
    clearResultMarkers();
    hideAll();
    elResults.hidden = true;
    elInput.value = '';
    document.querySelectorAll('.sl-chip').forEach(c => c.classList.remove('sl-chip--active'));
});

// Error retry
elErrorRetry.addEventListener('click', () => {
    const q = elInput.value.trim();
    if (q) runSearch(q);
});

// My-location button
elMyLoc.addEventListener('click', async () => {
    elMyLoc.classList.add('sl-my-loc--loading');
    try {
        const pos = await requestLocation();
        userLat = pos.lat;
        userLng = pos.lng;
        initMap(userLat, userLng);
        map.flyTo([userLat, userLng], 15, { duration: 1 });
        userMarker?.openPopup();
    } catch {
        handlePermissionDenied();
    } finally {
        elMyLoc.classList.remove('sl-my-loc--loading');
    }
});

// Fallback geocoder
elFallbackGo.addEventListener('click', async () => {
    const city = elFallbackInput.value.trim();
    if (!city) return;
    setStatus(true, 'Locating "' + city + '"…', 30);
    elGeoFallback.hidden = true;
    try {
        const { lat, lng } = await geocodeCity(city);
        userLat = lat;
        userLng = lng;
        initMap(lat, lng);
        setStatus(false);
        const q = elInput.value.trim();
        if (q) runSearch(q);
    } catch (err) {
        showError('Could not find "' + city + '". Please try a different location name.');
    }
});

elFallbackInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') elFallbackGo.click();
});

// Detail close
elDetailClose.addEventListener('click', () => {
    elDetail.classList.remove('sl-visible');
    setTimeout(() => { elDetail.hidden = true; }, 350);
});

/* ═══════════════════════════════════════════════════════════════
   INIT — load map immediately with or without GPS
═══════════════════════════════════════════════════════════════ */
async function init() {
    // 1. Instantly initialise Leaflet at a default viewport so the map renders
    initMap(41.2995, 69.2401, false);

    try {
        // 2. Request user GPS
        const pos = await requestLocation();
        userLat = pos.lat;
        userLng = pos.lng;
        // Fly to GPS coords
        initMap(userLat, userLng, true);
    } catch {
        // GPS denied or timed out
        handlePermissionDenied();
    }
}

document.addEventListener('DOMContentLoaded', init);
