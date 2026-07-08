// ==UserScript==
// @name         POE2 Search Bridge KoEn
// @author       thething99
// @namespace    http://tampermonkey.net/
// @version      1.53.0
// @description  Automatically converts Korean/Global Path of Exile 2 trade filters
// @match        https://poe.kakaogames.com/trade2*
// @match        https://www.pathofexile.com/trade2*
// @run-at       document-idle
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @connect      cdn.jsdelivr.net
// @connect      www.pathofexile.com
// @connect      poe.kakaogames.com
// @updateURL    https://raw.githubusercontent.com/thething99/POE2KoToEnSearch/main/userscript/poe2-search-bridge-koEn.user.js
// @downloadURL  https://raw.githubusercontent.com/thething99/POE2KoToEnSearch/main/userscript/poe2-search-bridge-koEn.user.js
// ==/UserScript==

(function () {
    'use strict';

    const IS_KAKAO = location.hostname === 'poe.kakaogames.com';
    const IS_GLOBAL = location.hostname === 'www.pathofexile.com';

    let itemDict = {};
    let isGlobalLoggedIn = false;
    let isKakaoLoggedIn = false;

    // Load dictionary and check login status
    async function init() {
        const cached = localStorage.getItem('poe2_item_dict_v2');
        if (cached) {
            itemDict = JSON.parse(cached);
        } else {
            GM_xmlhttpRequest({
                method: 'GET',
                url: 'https://cdn.jsdelivr.net/gh/thething99/POE2_ItemDict@main/item_dict.json',
                onload: (res) => {
                    const nested = JSON.parse(res.responseText);
                    itemDict = {};
                    for (const category of Object.values(nested)) Object.assign(itemDict, category);
                    localStorage.setItem('poe2_item_dict_v2', JSON.stringify(itemDict));
                }
            });
        }
        if (IS_KAKAO) {
            isGlobalLoggedIn = await checkLoggin('https://www.pathofexile.com/api/trade2/settings');
        } else {
            isKakaoLoggedIn = await checkLoggin('https://poe.kakaogames.com/api/trade2/settings');
        }
    }

    init();

    // Check login status via API
    function checkLoggin(settingsUrl) {
        return new Promise((resolve) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: settingsUrl,
                onload: (res) => {
                    try {
                        const data = JSON.parse(res.responseText);
                        resolve('language' in data && 'status' in data);
                    } catch (e) { resolve(false); }
                },
                onerror: () => resolve(false)
            });
        });
    }

    // Helpers
    function lookupItem(krKey) { return itemDict[krKey] || null; }
    function buildSort(state) { return state.tab === 'exchange' ? { have: 'asc' } : { price: 'asc' }; }
    function hasQueryContent(query) { return !!(query.name || query.type || query.term || query.stats?.length || query.filters?.length || query.disc || query.exchange); }

    let reverseName = null;
    let reverseType = null;

    // Build reverse dictionary for English to Korean conversion
    function buildReverseDict() {
        reverseName = {};
        reverseType = {};

        for (const [krKey, [enName, enType]] of Object.entries(itemDict)) {
            if (enName) {
                reverseName[enName] = krKey;
            }
            if (enType && !(enType in reverseType)) {
                reverseType[enType] = krKey;
            }
        }
    }

    // Convert Korean state to English API payload
    function buildPayloadFromKorean(state) {
        if (state.tab === 'exchange' && state.exchange) throw new Error('EXCHANGE');
        const query = {};
        if (state.status) query.status = structuredClone(state.status);
        if (state.filters) query.filters = structuredClone(state.filters);
        if (state.stats?.length) query.stats = structuredClone(state.stats);
        if (state.disc) query.disc = structuredClone(state.disc);
        if (state.term) { const found = lookupItem(state.term); if (!found || !found[0]) throw new Error('TERM'); query.term = found[0]; }
        if (state.name) { const found = lookupItem(state.name); if (!found) throw new Error('NAME'); if (found[0]) query.name = found[0]; if (found[1] && !state.type) query.type = found[1]; }
        if (state.type) { const found = lookupItem(state.type); if (!found) throw new Error('TYPE'); if (found[1]) query.type = found[1]; }
        if (!hasQueryContent(query)) throw new Error('EMPTY');
        return { query, sort: buildSort(state) };
    }

    // Convert English state to Korean API payload
    function buildPayloadFromGlobal(state) {
        if (!reverseName) buildReverseDict();

        if (state.tab === 'exchange' && state.exchange) {
            throw new Error('EXCHANGE');
        }

        const query = {};

        if (state.status) query.status = structuredClone(state.status);
        if (state.filters) query.filters = structuredClone(state.filters);
        if (state.stats?.length) query.stats = structuredClone(state.stats);
        if (state.disc) query.disc = structuredClone(state.disc);

        if (state.name) {
            const krName = reverseName[state.name];
            if (!krName) throw new Error(`NAME_REVERSE: ${state.name}`);
            query.name = krName;
        }

        if (state.type) {
            const krType = reverseType[state.type];
            if (!krType) throw new Error(`TYPE_REVERSE: ${state.type}`);
            query.type = krType;
        }

        if (state.term) {
            const krTerm = reverseName[state.term];
            if (!krTerm) throw new Error(`TERM_REVERSE: ${state.term}`);
            query.term = krTerm;
        }

        if (!hasQueryContent(query)) throw new Error('EMPTY');

        return { query, sort: buildSort(state) };
    }

    // POST search payload to API
    function fetchSearchId(full, league, apiBase) {
        return new Promise((resolve, reject) => {
            console.log('[PoE] Payload', full);
            GM_xmlhttpRequest({
                method: 'POST',
                url: `${apiBase}/api/trade2/search/poe2/${league}`,
                headers: { 'Content-Type': 'application/json' },
                data: JSON.stringify(full),
                onload: (res) => { try { resolve(JSON.parse(res.responseText).id); } catch { reject(); } },
                onerror: reject
            });
        });
    }

    // Create bridge button in UI
    function createBridgeButton() {
        if (document.getElementById('manual-global-btn')) return;
        const searchBtn = Array.from(document.querySelectorAll('button')).find(b => /^검색$|^Search$/u.test(b.innerText.trim()));
        if (!searchBtn) return;

        const btn = document.createElement('button');
        btn.id = 'manual-global-btn';
        btn.innerHTML = `<span>${IS_KAKAO ? '영문 검색' : '한글 검색'}</span>`;
        btn.className = searchBtn.className;
        btn.style.cssText = 'width:18%; margin-left:8px; cursor:pointer; background:radial-gradient(circle, #fff 30%, #dbe6f5 100%); color:#002566; font-weight:600; font-size:14px;';

        btn.onclick = async () => {
            try {
                const app = unsafeWindow.app || window.app;
                const currentState = app?.$store?.state?.persistent;
                const league = currentState.league || unsafeWindow.location.pathname.split('/')[4];

                const full = IS_KAKAO
                    ? buildPayloadFromKorean(currentState)
                    : buildPayloadFromGlobal(currentState);

                const searchApiBase = IS_KAKAO
                    ? 'https://www.pathofexile.com'
                    : 'https://poe.kakaogames.com';

                const id = await fetchSearchId(full, league, searchApiBase);
                const relativePath = `/trade2/search/poe2/${league}/${id}`;

                if (IS_KAKAO) {
                    const resultUrl = `https://www.pathofexile.com${relativePath}`;
                    if (isGlobalLoggedIn) {
                        window.open(resultUrl, '_blank');
                    } else {
                        window.open(`https://poe.kakaogames.com/login/transfer?redir=${encodeURIComponent(relativePath)}`, '_blank');
                    }
                } else {
                    const resultUrl = `https://poe.kakaogames.com${relativePath}`;
                    if (isKakaoLoggedIn) {
                        window.open(resultUrl, '_blank');
                    } else {
                        window.open(resultUrl, '_blank');
                    }
                }
            } catch (err) {
                alert('Search failed: ' + err.message);
            }
        };
        searchBtn.insertAdjacentElement('afterend', btn);
    }

    const observer = new MutationObserver(() => createBridgeButton());
    observer.observe(document.body, { childList: true, subtree: true });
})();
