// ==UserScript==
// @name         PoE2 완벽 전송기 (글로벌 즉시 검색)
// @namespace    http://tampermonkey.net/
// @version      51.2
// @description  Vue store 기반 글로벌 거래 검색 (한→영 name/type 변환)
// @match        https://poe.kakaogames.com/trade2*
// @grant        GM_xmlhttpRequest
// @connect      cdn.jsdelivr.net
// @connect      www.pathofexile.com
// @updateURL    https://raw.githubusercontent.com/thething99/POE2KoToEnSearch/main/userscript/poe2-ko-to-en-search.user.js
// @downloadURL  https://raw.githubusercontent.com/thething99/POE2KoToEnSearch/main/userscript/poe2-ko-to-en-search.user.js
// ==/UserScript==

(function () {
    'use strict';

    const BASE_URL =
        'https://cdn.jsdelivr.net/gh/thething99/POE2_ItemDict@20260707_a1';
    const DATA_VERSION = '2';
    const DICT_CACHE_KEY = 'poe2_item_dict_v2';

    let itemDict = {};
    let dictReady = null;
    let vueReady = null;
    let isSending = false;

    function gmGet(url) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url,
                onload: resolve,
                onerror: reject
            });
        });
    }

    function waitVue() {
        if (vueReady) return vueReady;
        vueReady = new Promise((resolve) => {
            const timer = setInterval(() => {
                if (window.app && window.app.$store) {
                    clearInterval(timer);
                    resolve(window.app);
                }
            }, 100);
        });
        return vueReady;
    }

    function loadItemDict() {
        if (dictReady) return dictReady;
        dictReady = (async () => {
            const cached = sessionStorage.getItem(DICT_CACHE_KEY);
            if (cached) {
                itemDict = JSON.parse(cached);
                console.log('[PoE2] 세션 딕셔너리:', Object.keys(itemDict).length);
                return;
            }

            const res = await gmGet(
                `${BASE_URL}/item_dict.json?v=${DATA_VERSION}`
            );
            if (res.status !== 200) {
                throw new Error(`DICT_HTTP_${res.status}`);
            }

            const nested = JSON.parse(res.responseText);
            itemDict = {};
            for (const category of Object.values(nested)) {
                Object.assign(itemDict, category);
            }

            sessionStorage.setItem(DICT_CACHE_KEY, JSON.stringify(itemDict));
            console.log('[PoE2] 딕셔너리 로드:', Object.keys(itemDict).length);
        })();
        return dictReady;
    }

    function lookupItem(krKey) {
        return itemDict[krKey] || null;
    }

    function buildSort(state) {
        return state.tab === 'exchange'
            ? { have: 'asc' }
            : { price: 'asc' };
    }

    function hasQueryContent(query) {
        return !!(
            query.name ||
            query.type ||
            query.term ||
            query.stats?.length ||
            query.filters?.length ||
            query.disc ||
            query.exchange
        );
    }

    function buildGlobalPayload(state) {
        if (state.tab === 'exchange' && state.exchange) {
            throw new Error('EXCHANGE');
        }

        const query = {};

        if (state.status) {
            query.status = structuredClone(state.status);
        }

        if (state.stats?.length) {
            query.stats = structuredClone(state.stats);
        }

        if (state.filters?.length) {
            query.filters = structuredClone(state.filters);
        }

        if (state.disc) {
            query.disc = structuredClone(state.disc);
        }

        if (state.term) {
            const found = lookupItem(state.term);
            if (!found || !found[0]) {
                throw new Error('TERM');
            }
            query.term = found[0];
        }

        if (state.name) {
            const found = lookupItem(state.name);
            if (!found) {
                throw new Error('NAME');
            }
            if (found[0]) {
                query.name = found[0];
            }
            if (found[1] && !state.type) {
                query.type = found[1];
            }
        }

        if (state.type) {
            const found = lookupItem(state.type);
            if (!found) {
                throw new Error('TYPE');
            }
            if (found[1]) {
                query.type = found[1];
            }
        }

        if (!hasQueryContent(query)) {
            throw new Error('EMPTY');
        }

        return {
            query,
            sort: buildSort(state)
        };
    }

    function resolveLeague(state) {
        return state.league || location.pathname.split('/')[4];
    }

    function sendGlobalSearch(full, state) {
        const league = resolveLeague(state);

        GM_xmlhttpRequest({
            method: 'POST',
            url: `https://www.pathofexile.com/api/trade2/search/poe2/${league}`,
            headers: { 'Content-Type': 'application/json' },
            data: JSON.stringify(full),
            onload(res) {
                isSending = false;
                resetGlobalButton();

                if (res.status === 429) {
                    alert('검색 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.');
                    return;
                }

                try {
                    const data = JSON.parse(res.responseText);
                    if (data.id) {
                        window.open(
                            `https://www.pathofexile.com/trade2/search/poe2/${league}/${data.id}`,
                            '_blank'
                        );
                    } else {
                        alert(res.responseText);
                    }
                } catch {
                    alert('응답 파싱 실패');
                }
            },
            onerror() {
                isSending = false;
                resetGlobalButton();
                alert('글로벌 검색 요청 실패');
            }
        });
    }

    function resetGlobalButton() {
        const btn = document.getElementById('manual-global-btn');
        if (!btn) return;
        btn.disabled = false;
        const label = btn.querySelector('span');
        if (label) label.textContent = '글로벌 검색';
    }

    function createGlobalButton() {
        const searchBtn = [...document.querySelectorAll('button')].find(
            (b) => b.innerText.trim() === '검색'
        );
        if (!searchBtn || document.getElementById('manual-global-btn')) {
            return;
        }

        const btn = document.createElement('button');
        btn.id = 'manual-global-btn';
        btn.type = 'button';
        btn.className = searchBtn.className;
        btn.innerHTML = '<span>글로벌 검색</span>';

        btn.style.marginLeft = '8px';
        btn.style.height = searchBtn.offsetHeight + 'px';
        btn.style.minWidth = '120px';
        btn.style.width = searchBtn.getBoundingClientRect().width / 2 + 'px';
        btn.style.fontSize = '14px';
        btn.style.background = '#fff';
        btn.style.color = '#b8860b';
        btn.style.border = '2px solid #b8860b';
        btn.style.fontWeight = 'bold';
        btn.style.borderRadius = '6px';
        btn.style.cursor = 'pointer';
        btn.style.boxShadow = '0 0 6px rgba(212,175,55,0.6)';
        btn.style.transition = 'all 0.2s ease';

        btn.onmouseenter = () => {
            btn.style.background = '#fff8dc';
            btn.style.boxShadow = '0 0 12px rgba(212,175,55,0.9)';
        };
        btn.onmouseleave = () => {
            btn.style.background = '#fff';
            btn.style.boxShadow = '0 0 6px rgba(212,175,55,0.6)';
        };

        searchBtn.insertAdjacentElement('afterend', btn);

        btn.onclick = async () => {
            if (isSending) return;

            const label = btn.querySelector('span');
            const prevText = label.textContent;

            try {
                await loadItemDict();
                const app = await waitVue();
                const state = app.$store.state.persistent;
                const full = buildGlobalPayload(state);

                console.log('[PoE2] GLOBAL POST', full);
                isSending = true;
                btn.disabled = true;
                label.textContent = '검색 중...';
                sendGlobalSearch(full, state);
            } catch (err) {
                if (err.message === 'EXCHANGE') {
                    alert('환 exchange(통화) 검색은 아직 지원하지 않습니다.');
                } else if (err.message === 'EMPTY' || err.message === 'TERM' ||
                    err.message === 'NAME' || err.message === 'TYPE') {
                    alert('아이템 이름이나 베이스 이름만 검색됩니다.');
                } else if (err.message?.startsWith('DICT_HTTP_')) {
                    alert('아이템 딕셔너리를 불러오지 못했습니다. POE2_ItemDict CDN을 확인하세요.');
                } else {
                    console.error('[PoE2]', err);
                    alert('글로벌 검색 준비 실패');
                }
            } finally {
                if (!isSending) {
                    btn.disabled = false;
                    label.textContent = prevText;
                }
            }
        };
    }

    waitVue().then(() => {
        createGlobalButton();
        new MutationObserver(createGlobalButton).observe(document.body, {
            childList: true,
            subtree: true
        });
    });
})();
