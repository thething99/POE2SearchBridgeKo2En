// ==UserScript==
// ==UserScript==
// @name         POE2 거래소 한영 서치 브릿지(POE2 Search Bridge Ko2En)
// @author       thething99
// @namespace    http://tampermonkey.net/
// @version      0.52.7
// @description  Automatically converts Korean Path of Exile 2 trade filters into English API queries
// @match        https://poe.kakaogames.com/trade2*
// @run-at       document-idle
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @connect      cdn.jsdelivr.net
// @connect      www.pathofexile.com
// @updateURL    https://raw.githubusercontent.com/thething99/POE2KoToEnSearch/main/userscript/poe2-search-bridge-ko2en.user.js
// @downloadURL  https://raw.githubusercontent.com/thething99/POE2KoToEnSearch/main/userscript/poe2-search-bridge-ko2en.user.js
// ==/UserScript==

(function () {
    'use strict';

    let itemDict = {};
    let isLoggedIn = false;

    // 1. 초기화: 딕셔너리 로드 및 로그인 상태 확인
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
        isLoggedIn = await checkLoggin();
    }

    init();

    // 2. 로그인 여부 확인 (API 호출)
    function checkLoggin() {
        return new Promise((resolve) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: 'https://www.pathofexile.com/api/trade2/settings',
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

    // 3. 데이터 변환 및 API 통신 헬퍼
    function lookupItem(krKey) { return itemDict[krKey] || null; }
    function buildSort(state) { return state.tab === 'exchange' ? { have: 'asc' } : { price: 'asc' }; }
    function hasQueryContent(query) { return !!(query.name || query.type || query.term || query.stats?.length || query.filters?.length || query.disc || query.exchange); }

    function buildGlobalPayload(state) {
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

    function fetchSearchId(full, league) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'POST',
                url: `https://www.pathofexile.com/api/trade2/search/poe2/${league}`,
                headers: { 'Content-Type': 'application/json' },
                data: JSON.stringify(full),
                onload: (res) => { try { resolve(JSON.parse(res.responseText).id); } catch { reject(); } },
                onerror: reject
            });
        });
    }

    // 4. UI: 영문 검색 버튼 생성 및 이벤트
    function createGlobalButton() {
        if (document.getElementById('manual-global-btn')) return;
        const searchBtn = Array.from(document.querySelectorAll('button')).find(b => /^검색$/u.test(b.innerText.trim()));
        if (!searchBtn) return;

        const btn = document.createElement('button');
        btn.id = 'manual-global-btn';
        btn.innerHTML = '<span>영문 검색</span>';
        btn.className = searchBtn.className;
        btn.style.cssText = 'width:18%; margin-left:8px; cursor:pointer; background:radial-gradient(circle, #fff 30%, #dbe6f5 100%); color:#002566; font-weight:600; font-size:14px;';

        btn.onclick = async () => {
            try {
                const app = unsafeWindow.app || window.app;
                const currentState = app?.$store?.state?.persistent;
                const league = currentState.league || unsafeWindow.location.pathname.split('/')[4];

                const id = await fetchSearchId(buildGlobalPayload(currentState), league);
                const relativePath = `/trade2/search/poe2/${league}/${id}`;
                const resultUrl = `https://www.pathofexile.com${relativePath}`;

                if (isLoggedIn) {
                    window.open(resultUrl, '_blank');
                } else {
                    window.open(`https://poe.kakaogames.com/login/transfer?redir=${encodeURIComponent(relativePath)}`, '_blank');
                }
            } catch (err) {
                alert('검색 실패: ' + err.message);
            }
        };
        searchBtn.insertAdjacentElement('afterend', btn);
    }

    const observer = new MutationObserver(() => createGlobalButton());
    observer.observe(document.body, { childList: true, subtree: true });
})();
