// ==UserScript==
// @name         O OLX
// @namespace    http://tampermonkey.net/
// @version      20260012
// @description  Убирает ТОП объявления и позволяет фильтровать по ключевым фразам (белый/чёрный список) с привязкой шаблонов к URL (укрупнённый шрифт)
// @author       Ovolya
// @match        https://olx.ua/*
// @match        https://www.olx.ua/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_notification
// @updateURL    https://github.com/Ovolsan/O-OLX/raw/refs/heads/main/O%20OLX.user.js
// @downloadURL  https://github.com/Ovolsan/O-OLX/raw/refs/heads/main/O%20OLX.user.js
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    // ---------- Переводы ----------
    const translations = {
        ru: {
            hideTop: 'Скрывать "ТОП"',
            whitelistLabel: 'Белый список (слова через запятую)',
            blacklistLabel: 'Чёрный список (слова через запятую)',
            useWhitelist: 'Белый список',
            useBlacklist: 'Чёрный список',
            templates: 'Шаблоны',
            selectTemplate: '-- Выбрать шаблон --',
            templateName: 'Имя шаблона',
            saveTemplate: '+',
            deleteTemplate: '✖',
            apply: 'Применить',
            ready: '✔ Готово',
            settings: 'Настройки O OLX',
            language: 'Язык',
            close: 'Закрыть',
            toggleBtn: 'Фильтры',
            allTemplates: 'Все шаблоны',
            templateUrl: 'Ссылка',
            deleteBtn: 'Удалить'
        },
        uk: {
            hideTop: 'Приховати "ТОП"',
            whitelistLabel: 'Білий список (слова через кому)',
            blacklistLabel: 'Чорний список (слова через кому)',
            useWhitelist: 'Білий список',
            useBlacklist: 'Чорний список',
            templates: 'Шаблони',
            selectTemplate: '-- Оберіть шаблон --',
            templateName: 'Назва шаблону',
            saveTemplate: '+',
            deleteTemplate: '✖',
            apply: 'Застосувати',
            ready: '✔ Готово',
            settings: 'Налаштування O OLX',
            language: 'Мова',
            close: 'Закрити',
            toggleBtn: 'Фільтри',
            allTemplates: 'Усі шаблони',
            templateUrl: 'Посилання',
            deleteBtn: 'Видалити'
        }
    };

    // Загрузка настроек
    let savedSettings = JSON.parse(localStorage.getItem('olx_filters')) || {};
    let currentLang = savedSettings.lang || (window.location.pathname.startsWith('/uk') ? 'uk' : 'ru');
    if (!translations[currentLang]) currentLang = 'ru';

    // Миграция старых шаблонов (без поля url)
    if (savedSettings.templates) {
        for (let name in savedSettings.templates) {
            if (!savedSettings.templates[name].url) {
                savedSettings.templates[name].url = window.location.href;
            }
        }
        localStorage.setItem('olx_filters', JSON.stringify(savedSettings));
    }

    let settings = {
        hideTop: savedSettings.hideTop !== undefined ? savedSettings.hideTop : true,
        useWhitelist: savedSettings.useWhitelist !== undefined ? savedSettings.useWhitelist : true,
        whitelist: savedSettings.whitelist || '',
        useBlacklist: savedSettings.useBlacklist !== undefined ? savedSettings.useBlacklist : true,
        blacklist: savedSettings.blacklist || '',
        templates: savedSettings.templates || {},
        lang: currentLang
    };

    function t(key) {
        return translations[currentLang][key] || key;
    }

    function saveAllSettings() {
        localStorage.setItem('olx_filters', JSON.stringify(settings));
    }

    function setLanguage(lang) {
        if (lang === currentLang || !translations[lang]) return;
        currentLang = lang;
        settings.lang = lang;
        saveAllSettings();
        updateAllUITexts();
        const langSelect = document.getElementById('olx-lang-select');
        if (langSelect) langSelect.value = lang;
    }

    function updateAllUITexts() {
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            if (el.tagName === 'INPUT' && el.type === 'text') el.placeholder = t(key);
            else if (el.tagName === 'TEXTAREA') el.placeholder = t(key);
            else if (['saveTemplate','deleteTemplate','apply','ready','close','toggleBtn','deleteBtn'].includes(key)) {
                el.textContent = t(key);
            } else {
                el.textContent = t(key);
            }
        });
        const wl = document.getElementById('olx-whitelist');
        const bl = document.getElementById('olx-blacklist');
        if (wl) wl.placeholder = t('whitelistLabel');
        if (bl) bl.placeholder = t('blacklistLabel');
        const toggleBtn = document.getElementById('olx-toggle-btn');
        if (toggleBtn) toggleBtn.textContent = t('toggleBtn');
        const modalTitle = document.querySelector('#olx-settings-panel h3');
        if (modalTitle) modalTitle.textContent = t('settings');
        const allTemplatesTitle = document.querySelector('#olx-all-templates-title');
        if (allTemplatesTitle) allTemplatesTitle.textContent = t('allTemplates');
    }

    // ---------- UI ----------
    let isOpen = false;

    function createUI() {
        if (document.getElementById('olx-filter-ui')) return;

        // Плавающая панель фильтров
        const uiContainer = document.createElement('div');
        uiContainer.id = 'olx-filter-ui';
        uiContainer.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:999999;font-family:sans-serif;display:flex;flex-direction:column;align-items:flex-end;';

        const content = document.createElement('div');
        content.id = 'olx-content-panel';
        content.style.cssText = 'display:none;background:#1b1d1d;border:1px solid #00a49f;border-radius:6px;padding:12px;color:#cdcbc8;width:280px;box-shadow:0 4px 10px rgba(0,0,0,0.5);margin-bottom:8px;box-sizing:border-box;';

        content.innerHTML = `
            <div style="margin-bottom:12px;border-bottom:1px solid #333;padding-bottom:10px;">
                <div style="display:flex;gap:6px;margin-bottom:6px;">
                    <select id="olx-tpl-select" style="flex-grow:1;background:#222425;color:#fff;border:1px solid #4e5457;border-radius:3px;padding:6px;font-size:15px;outline:none;cursor:pointer;">
                        <option value="">${t('selectTemplate')}</option>
                    </select>
                    <button id="olx-tpl-del" data-i18n="deleteTemplate" style="background:#da2828;color:white;border:none;border-radius:3px;cursor:pointer;padding:0 8px;font-size:15px;">${t('deleteTemplate')}</button>
                </div>
                <div style="display:flex;gap:6px;">
                    <input type="text" id="olx-tpl-name" data-i18n="templateName" placeholder="${t('templateName')}" style="flex-grow:1;box-sizing:border-box;background:#222425;color:#fff;border:1px solid #4e5457;padding:6px;border-radius:3px;font-size:15px;outline:none;">
                    <button id="olx-tpl-save" data-i18n="saveTemplate" style="background:#00a49f;color:#02282c;border:none;border-radius:3px;cursor:pointer;padding:0 10px;font-weight:bold;font-size:17px;">${t('saveTemplate')}</button>
                </div>
            </div>

            <div style="margin-bottom:10px;">
                <label style="display:flex;align-items:center;margin-bottom:6px;font-size:15px;cursor:pointer;color:#fff;">
                    <input type="checkbox" id="olx-use-wl" ${settings.useWhitelist ? 'checked' : ''} style="margin:0 8px 0 0; width:16px; height:16px;">
                    <span data-i18n="useWhitelist">${t('useWhitelist')}</span>
                </label>
                <textarea id="olx-whitelist" rows="2" placeholder="${t('whitelistLabel')}" style="width:100%;box-sizing:border-box;background:#222425;color:#fff;border:1px solid #4e5457;padding:6px;border-radius:3px;font-size:15px;resize:vertical;min-height:40px;outline:none;">${settings.whitelist}</textarea>
            </div>

            <div style="margin-bottom:12px;">
                <label style="display:flex;align-items:center;margin-bottom:6px;font-size:15px;cursor:pointer;color:#fff;">
                    <input type="checkbox" id="olx-use-bl" ${settings.useBlacklist ? 'checked' : ''} style="margin:0 8px 0 0; width:16px; height:16px;">
                    <span data-i18n="useBlacklist">${t('useBlacklist')}</span>
                </label>
                <textarea id="olx-blacklist" rows="2" placeholder="${t('blacklistLabel')}" style="width:100%;box-sizing:border-box;background:#222425;color:#fff;border:1px solid #4e5457;padding:6px;border-radius:3px;font-size:15px;resize:vertical;min-height:40px;outline:none;">${settings.blacklist}</textarea>
            </div>

            <button id="olx-save-btn" data-i18n="apply" style="width:100%;padding:8px;background:#00a49f;color:#02282c;border:none;font-weight:bold;cursor:pointer;border-radius:3px;font-size:16px;">${t('apply')}</button>
        `;

        const toggleBtn = document.createElement('div');
        toggleBtn.id = 'olx-toggle-btn';
        toggleBtn.textContent = t('toggleBtn');
        toggleBtn.style.cssText = 'background:#00a49f;color:#02282c;font-size:17px;font-weight:bold;padding:10px 20px;border-radius:20px;cursor:pointer;box-shadow:0 2px 5px rgba(0,0,0,0.3);user-select:none;text-align:center;transition:background 0.2s;';

        uiContainer.appendChild(content);
        uiContainer.appendChild(toggleBtn);
        document.body.appendChild(uiContainer);

        // Модальное окно настроек
        const modalOverlay = document.createElement('div');
        modalOverlay.id = 'olx-settings-overlay';
        modalOverlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);z-index:10000000;display:none;justify-content:center;align-items:center;font-family:sans-serif;';
        modalOverlay.innerHTML = `
            <div id="olx-settings-panel" style="background:#1b1d1d;border:1px solid #00a49f;border-radius:8px;padding:24px;color:#cdcbc8;width:440px;max-height:90vh;overflow-y:auto;box-shadow:0 4px 20px rgba(0,0,0,0.7);">
                <h3 data-i18n="settings" style="margin:0 0 16px;font-size:22px;color:#fff;">${t('settings')}</h3>
                <label style="display:flex;align-items:center;margin-bottom:16px;font-size:17px;cursor:pointer;color:#fff;">
                    <input type="checkbox" id="olx-hide-top" ${settings.hideTop ? 'checked' : ''} style="margin:0 10px 0 0; width:18px; height:18px;">
                    <span data-i18n="hideTop">${t('hideTop')}</span>
                </label>
                <div style="margin-bottom:20px;">
                    <label style="font-size:17px;color:#fff;display:block;margin-bottom:6px;"><span data-i18n="language">${t('language')}</span>:</label>
                    <select id="olx-lang-select" style="width:100%;background:#222425;color:#fff;border:1px solid #4e5457;border-radius:3px;padding:8px;font-size:17px;outline:none;">
                        <option value="ru" ${currentLang === 'ru' ? 'selected' : ''}>Русский</option>
                        <option value="uk" ${currentLang === 'uk' ? 'selected' : ''}>Українська</option>
                    </select>
                </div>
                <div id="olx-all-templates-section" style="margin-bottom:20px;">
                    <h4 id="olx-all-templates-title" data-i18n="allTemplates" style="margin:0 0 10px;font-size:18px;color:#fff;border-bottom:1px solid #333;padding-bottom:6px;">${t('allTemplates')}</h4>
                    <div id="olx-all-templates-list" style="max-height:220px;overflow-y:auto;font-size:16px;"></div>
                </div>
                <button id="olx-settings-close" data-i18n="close" style="width:100%;padding:10px;background:#00a49f;color:#02282c;border:none;font-weight:bold;cursor:pointer;border-radius:4px;font-size:17px;">${t('close')}</button>
            </div>
        `;
        document.body.appendChild(modalOverlay);

        // Функции управления шаблонами
        function getCurrentUrl() {
            return window.location.href.split('#')[0];
        }

        function updateTplSelect() {
            const select = document.getElementById('olx-tpl-select');
            if (!select) return;
            const currentUrl = getCurrentUrl();
            select.innerHTML = `<option value="">${t('selectTemplate')}</option>`;
            const filtered = Object.entries(settings.templates)
                .filter(([name, tpl]) => tpl.url === currentUrl)
                .sort((a, b) => a[0].localeCompare(b[0]));
            for (let [name] of filtered) {
                let opt = document.createElement('option');
                opt.value = name;
                opt.textContent = name;
                select.appendChild(opt);
            }
        }

        function renderAllTemplatesList() {
            const listDiv = document.getElementById('olx-all-templates-list');
            if (!listDiv) return;
            const entries = Object.entries(settings.templates).sort((a,b) => a[0].localeCompare(b[0]));
            if (entries.length === 0) {
                listDiv.innerHTML = '<div style="color:#888;padding:10px 0;font-size:16px;">Нет сохранённых шаблонов</div>';
                return;
            }
            listDiv.innerHTML = entries.map(([name, tpl]) => `
                <div style="display:flex;justify-content:space-between;align-items:flex-start;padding:8px 0;border-bottom:1px solid #2a2a2a;">
                    <div style="flex:1;">
                        <div style="font-weight:bold;color:#fff;font-size:16px;">${escapeHTML(name)}</div>
                        <div style="color:#aaa;word-break:break-all;font-size:14px;" title="${escapeHTML(tpl.url)}">${escapeHTML(truncateUrl(tpl.url, 55))}</div>
                    </div>
                    <button class="olx-delete-template-btn" data-name="${escapeHTML(name)}" style="background:#da2828;color:white;border:none;border-radius:3px;padding:4px 12px;cursor:pointer;font-size:15px;margin-left:12px;">${t('deleteBtn')}</button>
                </div>
            `).join('');

            listDiv.querySelectorAll('.olx-delete-template-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const name = e.target.getAttribute('data-name');
                    if (name && settings.templates[name] && confirm(`Удалить шаблон "${name}"?`)) {
                        delete settings.templates[name];
                        saveAllSettings();
                        updateTplSelect();
                        renderAllTemplatesList();
                    }
                });
            });
        }

        function escapeHTML(str) {
            return String(str).replace(/[&<>"]/g, function(m) {
                if (m === '&') return '&amp;';
                if (m === '<') return '&lt;';
                if (m === '>') return '&gt;';
                if (m === '"') return '&quot;';
                return m;
            });
        }

        function truncateUrl(url, maxLen) {
            if (url.length <= maxLen) return url;
            return url.substring(0, maxLen - 3) + '...';
        }

        updateTplSelect();

        // Обработчики
        toggleBtn.addEventListener('click', () => {
            isOpen = !isOpen;
            content.style.display = isOpen ? 'block' : 'none';
            toggleBtn.style.background = isOpen ? '#008b87' : '#00a49f';
        });

        document.getElementById('olx-tpl-select').addEventListener('change', (e) => {
            const name = e.target.value;
            if (name && settings.templates[name]) {
                document.getElementById('olx-whitelist').value = settings.templates[name].whitelist;
                document.getElementById('olx-blacklist').value = settings.templates[name].blacklist;
                document.getElementById('olx-tpl-name').value = name;
            }
        });

        document.getElementById('olx-tpl-save').addEventListener('click', () => {
            const name = document.getElementById('olx-tpl-name').value.trim();
            if (!name) return alert(t('templateName'));
            settings.templates[name] = {
                whitelist: document.getElementById('olx-whitelist').value.toLowerCase(),
                blacklist: document.getElementById('olx-blacklist').value.toLowerCase(),
                url: getCurrentUrl()
            };
            saveAllSettings();
            updateTplSelect();
            document.getElementById('olx-tpl-select').value = name;
            const btn = document.getElementById('olx-tpl-save');
            btn.style.background = "#4caf50";
            setTimeout(() => btn.style.background = "#00a49f", 1000);
        });

        document.getElementById('olx-tpl-del').addEventListener('click', () => {
            const select = document.getElementById('olx-tpl-select');
            const name = select.value;
            if (!name) return;
            if (confirm(`Удалить шаблон "${name}"?`)) {
                delete settings.templates[name];
                saveAllSettings();
                updateTplSelect();
                document.getElementById('olx-tpl-name').value = '';
            }
        });

        document.getElementById('olx-save-btn').addEventListener('click', () => {
            settings.useWhitelist = document.getElementById('olx-use-wl').checked;
            settings.useBlacklist = document.getElementById('olx-use-bl').checked;
            settings.whitelist = document.getElementById('olx-whitelist').value.toLowerCase();
            settings.blacklist = document.getElementById('olx-blacklist').value.toLowerCase();
            saveAllSettings();
            applyFilters();
            const btn = document.getElementById('olx-save-btn');
            btn.textContent = t('ready');
            btn.style.background = "#4caf50";
            setTimeout(() => {
                btn.textContent = t('apply');
                btn.style.background = "#00a49f";
            }, 1500);
        });

        // Модалка
        const settingsOverlay = document.getElementById('olx-settings-overlay');
        document.getElementById('olx-settings-close').addEventListener('click', () => {
            settingsOverlay.style.display = 'none';
        });
        settingsOverlay.addEventListener('click', (e) => {
            if (e.target === settingsOverlay) settingsOverlay.style.display = 'none';
        });
        document.getElementById('olx-hide-top').addEventListener('change', (e) => {
            settings.hideTop = e.target.checked;
            saveAllSettings();
            applyFilters();
        });
        document.getElementById('olx-lang-select').addEventListener('change', (e) => {
            setLanguage(e.target.value);
        });

        window.openOlxSettings = () => {
            settingsOverlay.style.display = 'flex';
            document.getElementById('olx-hide-top').checked = settings.hideTop;
            document.getElementById('olx-lang-select').value = currentLang;
            renderAllTemplatesList();
        };
    }

    // ---------- Кнопка "O OLX" в хедере ----------
    function injectHeaderButton() {
        const logo = document.querySelector('[data-testid="olx-logo-link"]');
        if (logo) logo.style.display = 'none';

        const headerFlex = document.querySelector('header [class*="flex items-center"]') || document.querySelector('div.flex.items-center');
        if (!headerFlex || document.getElementById('olx-header-btn')) return;

        const btn = document.createElement('div');
        btn.id = 'olx-header-btn';
        btn.textContent = 'O OLX';
        btn.title = t('settings');
        btn.style.cssText = `
            display: inline-flex;
            align-items: center;
            justify-content: center;
            background: #00a49f;
            color: #02282c;
            font-size: 17px;
            font-weight: bold;
            padding: 8px 22px;
            border-radius: 20px;
            cursor: pointer;
            margin-left: 16px;
            user-select: none;
            transition: background 0.2s;
            white-space: nowrap;
        `;
        btn.addEventListener('mouseenter', () => btn.style.background = '#008b87');
        btn.addEventListener('mouseleave', () => btn.style.background = '#00a49f');
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            if (window.openOlxSettings) window.openOlxSettings();
        });

        headerFlex.appendChild(btn);
    }

    // ---------- Фильтрация объявлений ----------
    function parseList(str) {
        return str.split(',').map(s => s.trim()).filter(s => s.length > 0);
    }

    function applyFilters() {
        const ads = document.querySelectorAll('[data-cy="l-card"]');
        const whiteArr = parseList(settings.whitelist);
        const blackArr = parseList(settings.blacklist);

        ads.forEach(ad => {
            const titleEl = ad.querySelector('h6') || ad.querySelector('h4');
            const adText = titleEl ? titleEl.textContent.toLowerCase() : ad.textContent.toLowerCase();

            const hasTopAttr = ad.querySelector('[data-testid="adCard-featured"]');
            const hasTopBadgeText = Array.from(ad.querySelectorAll('div, span')).some(el => {
                const text = el.textContent.trim().toUpperCase();
                return text === 'ТОП' || text === 'TOP';
            });
            const hasPromotedLink = ad.querySelector('a[href*="promoted"]');
            const isTop = !!hasTopAttr || hasTopBadgeText || !!hasPromotedLink;

            let shouldHide = false;

            if (settings.hideTop && isTop) {
                shouldHide = true;
            }

            if (!shouldHide && settings.useBlacklist && blackArr.length > 0) {
                if (blackArr.some(word => adText.includes(word))) {
                    shouldHide = true;
                }
            }

            if (!shouldHide && settings.useWhitelist && whiteArr.length > 0) {
                if (!whiteArr.some(word => adText.includes(word))) {
                    shouldHide = true;
                }
            }

            if (shouldHide) {
                ad.style.setProperty('display', 'none', 'important');
            } else {
                ad.style.removeProperty('display');
            }
        });
    }

    window.addEventListener('load', () => {
        createUI();
        injectHeaderButton();
        setTimeout(applyFilters, 1000);

        const observer = new MutationObserver((mutations) => {
            let DOMChanged = false;
            for (let mutation of mutations) {
                if (mutation.addedNodes.length > 0) {
                    DOMChanged = true;
                    break;
                }
            }
            if (DOMChanged) {
                clearTimeout(window.olxFilterTimeout);
                window.olxFilterTimeout = setTimeout(() => {
                    applyFilters();
                    injectHeaderButton();
                }, 300);
            }
        });

        const container = document.querySelector('#root') || document.body;
        observer.observe(container, { childList: true, subtree: true });
    });
})();
