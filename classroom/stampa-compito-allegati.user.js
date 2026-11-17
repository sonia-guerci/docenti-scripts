// ==UserScript==
// @name         Google Classroom - Stampa Compito e Download Allegati
// @namespace    https://github.com/sonia-guerci/docenti-scripts
// @version      1.8.4
// @description  Aggiunge il download diretto con 1 click sugli allegati (Stream, Compiti, Materiali) e una vista pulita per stampare compiti e post dello Stream
// @author       Sonia Guerci
// @match        https://classroom.google.com/*
// @updateURL    https://raw.githubusercontent.com/sonia-guerci/docenti-scripts/main/classroom/stampa-compito-allegati.user.js
// @downloadURL  https://raw.githubusercontent.com/sonia-guerci/docenti-scripts/main/classroom/stampa-compito-allegati.user.js
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const PRINT_BTN_ID = 'gc-clean-print-btn';
    const DL_BTN_CLASS = 'gc-direct-dl-btn';
    const POST_PRINT_BTN_CLASS = 'gc-post-print-btn';
    const courseNameCache = new Map();

    // Verifica se un elemento appartiene alla vista attualmente visibile (esclude viste SPA nascoste o off-screen)
    function isElementVisible(el) {
        if (!el || !el.isConnected) return false;
        if (el.closest('[aria-hidden="true"], [hidden], [inert]')) return false;
        if (el.tagName === 'BR' || el.tagName === 'WBR') {
            return el.parentElement ? isElementVisible(el.parentElement) : false;
        }
        const rect = el.getBoundingClientRect();
        if (rect.width < 1 || rect.height < 1) return false;
        if (rect.right <= 0 || rect.left >= window.innerWidth) return false;
        const style = getComputedStyle(el);
        return style.display !== 'none' && style.visibility !== 'hidden';
    }

    // Restituisce il contenitore <main> della vista attiva corrente
    function getActiveMainRoot() {
        const mains = Array.from(document.querySelectorAll('main, [role="main"]')).filter(
            isElementVisible
        );
        if (mains.length > 0) {
            return mains[mains.length - 1];
        }
        return document.body;
    }

    // Ricava l'indice dell'account Google attivo (/u/0/, /u/1/, ecc.)
    function getAccountIndex(url) {
        if (url) {
            const linkMatch = url.match(/[?&]authuser=(\d+)/) || url.match(/\/u\/(\d+)\//);
            if (linkMatch) return linkMatch[1];
        }
        const pageMatch = window.location.pathname.match(/\/u\/(\d+)\//);
        return pageMatch ? pageMatch[1] : '0';
    }

    // Estrae l'ID univoco del corso dall'URL corrente
    function getCurrentCourseId() {
        const m = window.location.pathname.match(/\/c\/([^/]+)/);
        return m ? m[1] : '';
    }

    // Estrae l'ID univoco di un file Google Drive / Docs dall'URL
    function extractFileId(rawUrl) {
        if (!rawUrl) return null;
        if (rawUrl.includes('docs.google.com/forms')) return null;

        const isDriveOrDocs =
            rawUrl.includes('drive.google.com') || rawUrl.includes('docs.google.com');
        if (!isDriveOrDocs) return null;

        const idMatch =
            rawUrl.match(/\/d\/([a-zA-Z0-9_-]{15,})/) ||
            rawUrl.match(/[?&]id=([a-zA-Z0-9_-]{15,})/);
        return idMatch ? idMatch[1] : null;
    }

    // Converte qualsiasi link di Google Drive / Docs nel rispettivo URL di download diretto
    function getDirectDownloadUrl(rawUrl) {
        const fileId = extractFileId(rawUrl);
        if (!fileId) return null;

        const u = getAccountIndex(rawUrl);

        if (rawUrl.includes('docs.google.com/document')) {
            return `https://docs.google.com/u/${u}/document/d/${fileId}/export?format=pdf`;
        }
        if (rawUrl.includes('docs.google.com/spreadsheets')) {
            return `https://docs.google.com/u/${u}/spreadsheets/d/${fileId}/export?format=pdf`;
        }
        if (rawUrl.includes('docs.google.com/presentation')) {
            return `https://docs.google.com/u/${u}/presentation/d/${fileId}/export?format=pdf`;
        }
        if (rawUrl.includes('docs.google.com/drawings')) {
            return `https://docs.google.com/u/${u}/drawings/d/${fileId}/export/pdf`;
        }

        return `https://drive.google.com/uc?export=download&id=${fileId}&authuser=${u}`;
    }

    // Avvia il download di un file tramite iframe nascosto (non attiva popup blocker e non chiude la scheda)
    function triggerBackgroundDownload(targetDoc, url) {
        const iframe = targetDoc.createElement('iframe');
        iframe.style.display = 'none';
        iframe.src = url;
        targetDoc.body.appendChild(iframe);
        setTimeout(() => {
            if (iframe.parentNode) iframe.remove();
        }, 60000);
    }

    // Risale dal link <a> fino al riquadro esterno della card allegato
    function findAttachmentCard(linkEl) {
        let el = linkEl.parentElement;
        let outermostValid = null;
        let outermostBordered = null;

        for (let i = 0; i < 10 && el && el !== document.body; i++) {
            if (
                el.hasAttribute('data-stream-item-id') ||
                el.classList.contains('ez0Kgd') ||
                el.classList.contains('Q0kCGe') ||
                el.getAttribute('role') === 'tabpanel' ||
                el.getAttribute('role') === 'main' ||
                el.tagName === 'MAIN'
            ) {
                break;
            }

            const rect = el.getBoundingClientRect();
            if (
                rect.width >= 160 &&
                rect.width <= 1100 &&
                rect.height >= 44 &&
                rect.height <= 220
            ) {
                const fileIds = new Set(
                    Array.from(
                        el.querySelectorAll('a[href*="drive.google.com"], a[href*="docs.google.com"]')
                    )
                        .map(x => extractFileId(x.href))
                        .filter(Boolean)
                );

                if (fileIds.size === 1) {
                    outermostValid = el;
                    const style = getComputedStyle(el);
                    const hasBorder =
                        style.borderTopStyle !== 'none' &&
                        parseFloat(style.borderTopWidth || '0') > 0;
                    if (hasBorder) {
                        outermostBordered = el;
                    }
                } else if (fileIds.size > 1) {
                    break;
                }
            }
            el = el.parentElement;
        }

        return outermostBordered || outermostValid;
    }

    // Restituisce il contenitore di ambito del post/sezione per evitare pulsanti duplicati sullo stesso file
    function getAttachmentScope(el) {
        return (
            el.closest('[data-stream-item-id], .ez0Kgd, [role="tabpanel"], main, [role="main"]') ||
            document.body
        );
    }

    // Inietta esattamente UN pulsante "Scarica" per ogni allegato (Stream espanso, Compiti, Materiali)
    function injectDirectDownloadButtons() {
        const activeRoot = getActiveMainRoot();
        const links = activeRoot.querySelectorAll(
            'a[href*="drive.google.com"], a[href*="docs.google.com"]'
        );

        links.forEach(a => {
            if (!isElementVisible(a)) return;
            if (a.closest('header, nav, [role="navigation"], [role="banner"]')) return;

            const dlUrl = getDirectDownloadUrl(a.href);
            if (!dlUrl) return;

            const scope = getAttachmentScope(a);
            const card = findAttachmentCard(a);

            if (card) {
                card.dataset.gcAttachmentCard = 'true';

                scope
                    .querySelectorAll(`.${DL_BTN_CLASS}[data-gc-inline="true"]`)
                    .forEach(inlineBtn => {
                        if (inlineBtn.dataset.gcDlUrl === dlUrl) {
                            inlineBtn.remove();
                        }
                    });

                const alreadyInScope = Array.from(
                    scope.querySelectorAll(`.${DL_BTN_CLASS}:not([data-gc-inline="true"])`)
                ).some(b => b.dataset.gcDlUrl === dlUrl);

                if (alreadyInScope || card.querySelector(`.${DL_BTN_CLASS}`)) {
                    if (getComputedStyle(card).position === 'static') {
                        card.style.position = 'relative';
                    }
                    return;
                }

                if (getComputedStyle(card).position === 'static') {
                    card.style.position = 'relative';
                }

                const btn = createDownloadButton('⬇️ Scarica', true);
                btn.dataset.gcDlUrl = dlUrl;

                const stopAll = e => {
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                };
                btn.addEventListener('pointerdown', stopAll);
                btn.addEventListener('mousedown', stopAll);
                btn.addEventListener('mouseup', stopAll);
                btn.addEventListener('click', e => {
                    e.preventDefault();
                    stopAll(e);
                    triggerBackgroundDownload(document, dlUrl);
                });

                card.appendChild(btn);
            } else {
                const alreadyInScope = Array.from(scope.querySelectorAll(`.${DL_BTN_CLASS}`)).some(
                    b => b.dataset.gcDlUrl === dlUrl
                );
                if (alreadyInScope) return;

                if (a.nextElementSibling && a.nextElementSibling.classList.contains(DL_BTN_CLASS)) {
                    return;
                }

                const btn = createDownloadButton('⬇️ Scarica', false);
                btn.dataset.gcInline = 'true';
                btn.dataset.gcDlUrl = dlUrl;
                btn.addEventListener('click', e => {
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                    triggerBackgroundDownload(document, dlUrl);
                });
                a.insertAdjacentElement('afterend', btn);
            }
        });
    }

    function createDownloadButton(label, isCard) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = DL_BTN_CLASS;
        btn.title = 'Scarica subito senza aprire l’anteprima';
        btn.textContent = label;

        if (isCard) {
            Object.assign(btn.style, {
                position: 'absolute',
                bottom: '6px',
                right: '8px',
                zIndex: '100',
                pointerEvents: 'auto',
                backgroundColor: '#e8f0fe',
                color: '#1967d2',
                border: '1px solid #1a73e8',
                borderRadius: '14px',
                padding: '3px 9px',
                fontSize: '11px',
                fontWeight: '600',
                fontFamily: 'Google Sans, Roboto, Arial, sans-serif',
                boxShadow: '0 1px 3px rgba(0, 0, 0, 0.18)',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                lineHeight: '1.3',
                transition: 'background-color 0.15s, color 0.15s'
            });

            btn.addEventListener('mouseenter', () => {
                btn.style.backgroundColor = '#1a73e8';
                btn.style.color = '#ffffff';
            });
            btn.addEventListener('mouseleave', () => {
                btn.style.backgroundColor = '#e8f0fe';
                btn.style.color = '#1967d2';
            });
        } else {
            Object.assign(btn.style, {
                marginLeft: '6px',
                backgroundColor: '#e8f0fe',
                color: '#1967d2',
                border: '1px solid #1a73e8',
                borderRadius: '12px',
                padding: '2px 8px',
                fontSize: '11px',
                fontWeight: '600',
                cursor: 'pointer',
                verticalAlign: 'middle'
            });
        }

        return btn;
    }

    // Riconoscimento tipologia di pagina Classroom
    function isDetailPage() {
        const path = window.location.pathname;
        // Esclude la scheda "Lavori degli studenti" (/submissions/)
        if (/\/submissions(\/|$)/.test(path)) return false;
        // Compiti (/a/), Materiali (/m/), Domande (/sa/, /q/), Post singoli (/p/)
        return /\/c\/[^/]+\/(a|m|sa|q|p)\/[^/]+(\/(details|instructions))?\/?$/.test(path);
    }

    function isSinglePostDetailPage() {
        return /\/c\/[^/]+\/p\/[^/]+\/?$/.test(window.location.pathname);
    }

    function isStreamPage() {
        const path = window.location.pathname;
        if (/\/(a|m|sa|q|p|w|t|r|gb)\//.test(path)) return false;
        return /\/c\/[^/]+\/?$/.test(path);
    }

    // Riconosce se un elemento dello Stream è in modalità compatta ("Mostra notifiche ridotte")
    function isCompactStreamCard(card) {
        if (!card) return true;
        if (card.querySelector('.ez0Kgd')) return false;
        if (card.querySelector('a[href*="drive.google.com"], a[href*="docs.google.com"]')) return false;
        if (card.querySelector('textarea, [contenteditable="true"]')) return false;
        return true;
    }

    // Risale da qualsiasi nodo interno [data-stream-item-id] fino all'unica card esterna del post
    function getStreamPostCard(streamItemEl) {
        const ez = streamItemEl.closest('.ez0Kgd');
        if (ez && ez.parentElement && ez.parentElement !== document.body) {
            return ez.parentElement;
        }

        let outermost = streamItemEl;
        let parent = outermost.parentElement;
        while (parent && parent !== document.body) {
            if (parent.hasAttribute('data-stream-item-id')) {
                outermost = parent;
            }
            parent = parent.parentElement;
        }
        return outermost;
    }

    // Restituisce tutte le card visibili dello Stream (escludendo quelle compatte se richiesto)
    function getAllStreamPostCards(includeCompact = false) {
        const activeRoot = getActiveMainRoot();
        const cards = new Set();
        activeRoot.querySelectorAll('[data-stream-item-id]').forEach(el => {
            if (!isElementVisible(el)) return;
            const card = getStreamPostCard(el);
            if (!card || !isElementVisible(card)) return;
            if (!includeCompact && isCompactStreamCard(card)) return;
            cards.add(card);
        });
        return Array.from(cards);
    }

    // Restituisce l'elenco deduplicato delle sole card ESPANSE dello Stream
    function getUniqueStreamPostCards() {
        return getAllStreamPostCards(false);
    }

    // Inserisce il pulsante "Stampa" solo sui post espansi dello Stream (mai sulle righe compatte)
    function injectStreamPostPrintButtons() {
        if (!isStreamPage()) return;

        const cards = getUniqueStreamPostCards();
        cards.forEach(card => {
            if (card.querySelector(`.${POST_PRINT_BTN_CLASS}`)) {
                return;
            }

            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = POST_PRINT_BTN_CLASS;
            btn.textContent = '🖨️ Stampa';
            btn.title = 'Stampa questo elemento dello Stream';

            Object.assign(btn.style, {
                backgroundColor: '#f1f3f4',
                color: '#3c4043',
                border: '1px solid #dadce0',
                borderRadius: '16px',
                padding: '4px 10px',
                fontSize: '11px',
                fontWeight: '600',
                fontFamily: 'Google Sans, Roboto, Arial, sans-serif',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                flexShrink: '0',
                zIndex: '50',
                transition: 'background-color 0.15s, color 0.15s, border-color 0.15s'
            });

            btn.addEventListener('mouseenter', () => {
                btn.style.backgroundColor = '#e8f0fe';
                btn.style.color = '#1967d2';
                btn.style.borderColor = '#1a73e8';
            });
            btn.addEventListener('mouseleave', () => {
                btn.style.backgroundColor = '#f1f3f4';
                btn.style.color = '#3c4043';
                btn.style.borderColor = '#dadce0';
            });

            btn.addEventListener('mousedown', e => {
                e.stopPropagation();
                e.stopImmediatePropagation();
            });

            btn.addEventListener('click', e => {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                openStreamPrintPreview([card]);
            });

            const menuBtn = card.querySelector(
                'button[aria-label*="Altre opzioni"], button[aria-label*="More options"]'
            );
            let insertedInFlex = false;

            if (menuBtn) {
                let menuSlot = menuBtn;
                while (menuSlot.parentElement && menuSlot.parentElement !== card) {
                    const parentStyle = getComputedStyle(menuSlot.parentElement);
                    if (parentStyle.display === 'flex' && menuSlot.parentElement.children.length >= 2) {
                        btn.style.marginRight = '6px';
                        btn.style.alignSelf = 'center';
                        menuSlot.parentElement.insertBefore(btn, menuSlot);
                        insertedInFlex = true;
                        break;
                    }
                    menuSlot = menuSlot.parentElement;
                }
            }

            if (!insertedInFlex) {
                if (getComputedStyle(card).position === 'static') {
                    card.style.position = 'relative';
                }
                const headerRow = card.querySelector('.Gw0ytd') || card.firstElementChild;
                if (headerRow) {
                    headerRow.style.paddingRight = '135px';
                }
                Object.assign(btn.style, {
                    position: 'absolute',
                    top: '12px',
                    right: '48px'
                });
                card.appendChild(btn);
            }
        });
    }

    // Pulsante flottante principale in basso a destra
    function updatePrintButton() {
        const existingBtn = document.getElementById(PRINT_BTN_ID);
        const onDetail = isDetailPage();
        const onStream = isStreamPage();

        // Nello Stream compatto (nessuna card espansa visibile) il pulsante compare solo nel dettaglio
        const expandedStreamCards = onStream ? getUniqueStreamPostCards() : [];
        const showOnStream = onStream && expandedStreamCards.length > 0;

        if (!onDetail && !showOnStream) {
            if (existingBtn) existingBtn.remove();
            return;
        }

        const isAssignmentUrl = /\/c\/[^/]+\/a\//.test(window.location.pathname);
        const label = onDetail
            ? isAssignmentUrl
                ? '🖨️ Stampa Compito'
                : '🖨️ Stampa Scheda'
            : '🖨️ Stampa Stream';
        const mode = onDetail ? 'detail' : 'stream';

        if (existingBtn) {
            if (existingBtn.dataset.gcMode !== mode || existingBtn.textContent !== label) {
                existingBtn.textContent = label;
                existingBtn.dataset.gcMode = mode;
            }
            return;
        }

        const btn = document.createElement('button');
        btn.id = PRINT_BTN_ID;
        btn.type = 'button';
        btn.textContent = label;
        btn.dataset.gcMode = mode;
        Object.assign(btn.style, {
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            zIndex: '9999',
            backgroundColor: '#1a73e8',
            color: '#ffffff',
            border: 'none',
            borderRadius: '24px',
            padding: '12px 20px',
            fontSize: '14px',
            fontWeight: '600',
            fontFamily: 'Google Sans, Roboto, Arial, sans-serif',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.25)',
            cursor: 'pointer',
            transition: 'background-color 0.2s, transform 0.1s'
        });

        btn.addEventListener('mouseenter', () => {
            btn.style.backgroundColor = '#1557b0';
            btn.style.transform = 'translateY(-1px)';
        });
        btn.addEventListener('mouseleave', () => {
            btn.style.backgroundColor = '#1a73e8';
            btn.style.transform = 'translateY(0)';
        });

        btn.addEventListener('click', () => {
            if (isDetailPage()) {
                openDetailPrintPreview();
            } else {
                openStreamPrintPreview(getUniqueStreamPostCards());
            }
        });

        document.body.appendChild(btn);
    }

    function detectLinkType(url) {
        if (url.includes('docs.google.com/document')) return 'Documento Google (PDF)';
        if (url.includes('docs.google.com/spreadsheets')) return 'Fogli Google (PDF)';
        if (url.includes('docs.google.com/presentation')) return 'Presentazioni Google (PDF)';
        if (url.includes('docs.google.com/drawings')) return 'Disegni Google (PDF)';
        if (url.includes('docs.google.com/forms')) return 'Moduli Google';
        if (url.includes('drive.google.com')) return 'File Google Drive';
        if (url.includes('youtube.com') || url.includes('youtu.be')) return 'Video YouTube';
        return 'Link / File esterno';
    }

    // Ricava e memorizza il nome reale del corso (evitando di confonderlo con il titolo del compito su /details)
    function getCourseName() {
        const courseId = getCurrentCourseId();

        // 1. Cerca nella barra superiore/navigazione il link diretto al corso (/c/<id> senza /a/ o /m/)
        const navCourseLinks = Array.from(
            document.querySelectorAll('header a[href*="/c/"], nav a[href*="/c/"]')
        ).filter(a => {
            if (!isElementVisible(a)) return false;
            try {
                const p = new URL(a.href).pathname;
                return /\/c\/[^/]+(\/p\/[^/]+)?\/?$/.test(p);
            } catch {
                return false;
            }
        });

        for (const link of navCourseLinks) {
            const lines = link.innerText
                .split('\n')
                .map(s => s.trim())
                .filter(s => s && !/^(classroom|menu|home)$/i.test(s));
            if (lines.length > 0) {
                const clean = lines.join(' - ');
                if (courseId) courseNameCache.set(courseId, clean);
                return clean;
            }
        }

        // 2. Se siamo sullo Stream, usa l'intestazione principale del corso
        if (isStreamPage()) {
            const activeRoot = getActiveMainRoot();
            const h1 = Array.from(activeRoot.querySelectorAll('h1')).find(isElementVisible);
            if (h1 && h1.innerText.trim()) {
                const clean = h1.innerText.trim();
                if (courseId) courseNameCache.set(courseId, clean);
                return clean;
            }
            if (document.title) {
                const cleanedTitle = document.title.replace(/\s*-\s*Classroom\s*$/i, '').trim();
                if (cleanedTitle && !/^classroom$/i.test(cleanedTitle)) {
                    if (courseId) courseNameCache.set(courseId, cleanedTitle);
                    return cleanedTitle;
                }
            }
        }

        // 3. Usa il nome corso memorizzato in precedenza per questo corso
        if (courseId && courseNameCache.has(courseId)) {
            return courseNameCache.get(courseId);
        }

        return 'Corso Google Classroom';
    }

    // Verifica se un URL è un link di servizio dell'interfaccia di Classroom (App Google, Calendario corso, Cartella Drive corso)
    function isClassroomUiServiceLink(href, label) {
        if (
            href.includes('google.it/intl/') ||
            href.includes('google.com/intl/') ||
            href.includes('about.google/products') ||
            href.includes('calendar.google.com/render?cid=c_classroom')
        ) {
            return true;
        }
        if (
            href.includes('drive.google.com/drive/folders/') &&
            /^(cartella drive del corso|class drive folder)$/i.test(label.trim())
        ) {
            return true;
        }
        return false;
    }

    // Estrae gli allegati visibili all'interno di un contenitore (deduplicando per ID file Drive/Docs o URL)
    function extractAttachmentsFromContainer(container, globalSeenKeys) {
        const list = [];
        const seen = globalSeenKeys || new Set();

        container.querySelectorAll('a[href]').forEach(a => {
            if (!isElementVisible(a)) return;
            if (a.closest('header, nav, [role="navigation"], [role="banner"]')) return;

            const href = a.href;
            if (
                !href ||
                href.startsWith('javascript:') ||
                (href.includes('classroom.google.com') && !href.includes('/forms/'))
            ) {
                return;
            }

            const rawAriaOrText = (a.getAttribute('aria-label') || a.innerText || '').trim();
            if (isClassroomUiServiceLink(href, rawAriaOrText)) {
                return;
            }

            const fileId = extractFileId(href);
            const dedupeKey = fileId || href;
            if (seen.has(dedupeKey)) return;
            seen.add(dedupeKey);

            const card = findAttachmentCard(a);
            let name = '';
            let type = '';

            if (card) {
                const cardLines = card.innerText
                    .split('\n')
                    .map(l => l.trim())
                    .filter(l => l && !l.includes('Scarica'));
                name = cardLines[0] || '';
                type = cardLines[1] || '';
            }

            if (!name) {
                const lines = rawAriaOrText.split('\n').map(l => l.trim()).filter(Boolean);
                name = (lines[0] || href).replace(/^(allegato|attachment):\s*(?:[^:]+:\s*)?/i, '');
                type = type || lines[1];
            }

            list.push({
                name,
                type: type || detectLinkType(href),
                url: href,
                downloadUrl: getDirectDownloadUrl(href)
            });
        });

        return list;
    }

    // Crea un'icona SVG vettoriale nitida al posto delle ligature Material Icons (es. "book")
    function createSvgResourceIcon(doc, iconName) {
        const svgNS = 'http://www.w3.org/2000/svg';
        const svg = doc.createElementNS(svgNS, 'svg');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('width', '20');
        svg.setAttribute('height', '20');
        svg.style.verticalAlign = 'middle';
        svg.style.marginRight = '8px';
        svg.style.fill = '#1a73e8';
        svg.style.flexShrink = '0';

        const path = doc.createElementNS(svgNS, 'path');
        if (iconName === 'book' || iconName === 'menu_book') {
            path.setAttribute(
                'd',
                'M18 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 4h5v8l-2.5-1.5L6 12V4z'
            );
        } else if (iconName === 'quiz' || iconName === 'help_outline') {
            path.setAttribute(
                'd',
                'M11 18h2v-2h-2v2zm1-16C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm0-14c-2.21 0-4 1.79-4 4h2c0-1.1.9-2 2-2s2 .9 2 2c0 2-3 1.75-3 5h2c0-2.25 3-2.5 3-5 0-2.21-1.79-4-4-4z'
            );
        } else {
            path.setAttribute(
                'd',
                'M19 3h-4.18C14.4 1.84 13.3 1 12 1c-1.3 0-2.4.84-2.82 2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm2 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z'
            );
        }
        svg.appendChild(path);
        return svg;
    }

    const RESOURCE_ICON_NAMES = new Set([
        'book',
        'menu_book',
        'assignment',
        'assignment_ind',
        'quiz',
        'help_outline',
        'description',
        'article'
    ]);

    const UI_ONLY_ICON_NAMES = new Set([
        'more_vert',
        'close',
        'expand_more',
        'expand_less',
        'send',
        'campaign',
        'announcement',
        'attach_file',
        'link',
        'schedule',
        'event',
        'people',
        'person',
        'edit',
        'delete',
        'content_copy'
    ]);

    const ALLOWED_TAGS = new Set([
        'P', 'DIV', 'SPAN', 'BR', 'B', 'STRONG', 'I', 'EM', 'U', 'S',
        'UL', 'OL', 'LI', 'A', 'CODE', 'PRE', 'BLOCKQUOTE',
        'H2', 'H3', 'H4', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TH', 'TD', 'HR'
    ]);

    function isNoiseText(text) {
        const t = text.trim();
        if (!t) return false;
        return (
            /^(altre opzioni|more options|mostra altro|mostra meno|stampa|🖨️\s*stampa)$/i.test(t) ||
            /^(istruzioni|lavori degli studenti|instructions|student work)$/i.test(t) ||
            /^(commenti sul corso|nessun commento sul corso|class comments|no class comments|aggiungi un commento|aggiungi commento|\d+\s+comment[io])$/i.test(
                t
            ) ||
            /^(consegnati|assegnati|consegnato|assegnato|non consegnato|senza voto)$/i.test(t) ||
            /^il materiale è visibile a tutti gli insegnanti/i.test(t) ||
            /^verrà eliminato in modo definitivo tra \d+ giorni/i.test(t) ||
            /ha pubblicato un nuovo (materiale|compito|argomento):/i.test(t) ||
            /ha pubblicato una nuova (domanda|comunicazione):/i.test(t) ||
            /posted a new (material|assignment|question):/i.test(t)
        );
    }

    function appendCleanNodes(sourceNode, targetParent, targetDoc, options = {}) {
        sourceNode.childNodes.forEach(node => {
            if (node.nodeType === Node.TEXT_NODE) {
                const raw = node.textContent;
                const trimmed = raw.trim();
                if (!trimmed) {
                    targetParent.appendChild(targetDoc.createTextNode(raw));
                    return;
                }
                if (isNoiseText(trimmed)) return;
                if (options.skipTexts && options.skipTexts.has(trimmed)) return;
                targetParent.appendChild(targetDoc.createTextNode(raw));
                return;
            }

            if (node.nodeType !== Node.ELEMENT_NODE) return;
            if (!isElementVisible(node)) return;

            const tag = node.tagName.toUpperCase();

            // Esclude gli elementi di interfaccia, la navigazione, i contatori submissions e le card allegato
            if (
                tag === 'BUTTON' ||
                tag === 'SVG' ||
                tag === 'INPUT' ||
                tag === 'TEXTAREA' ||
                tag === 'SCRIPT' ||
                tag === 'STYLE' ||
                tag === 'HEADER' ||
                tag === 'NAV' ||
                tag === 'ASIDE' ||
                tag === 'FOOTER' ||
                (tag === 'A' &&
                    /\/submissions(\/|$|\?)/i.test(node.getAttribute('href') || node.href || '')) ||
                (options.skipH1 && (tag === 'H1' || tag === 'H2')) ||
                (options.excludeStreamItems &&
                    (node.hasAttribute('data-stream-item-id') ||
                        node.classList.contains('ez0Kgd'))) ||
                node.getAttribute('role') === 'button' ||
                node.getAttribute('role') === 'menu' ||
                node.getAttribute('role') === 'tooltip' ||
                node.getAttribute('role') === 'tablist' ||
                node.getAttribute('role') === 'navigation' ||
                node.getAttribute('role') === 'banner' ||
                node.getAttribute('role') === 'complementary' ||
                node.hasAttribute('data-is-menu-dynamic') ||
                node.classList.contains('s2g3Xd') ||
                node.getAttribute('jsname') === 'EQPzXb' ||
                node.hasAttribute('data-gc-attachment-card') ||
                node.classList.contains(DL_BTN_CLASS) ||
                node.classList.contains(POST_PRINT_BTN_CLASS)
            ) {
                return;
            }

            const isIconFontEl =
                node.classList.contains('google-material-icons') ||
                node.classList.contains('material-icons') ||
                node.classList.contains('material-symbols-outlined') ||
                node.classList.contains('DPvwYc');

            const ownText = (node.textContent || '').trim().toLowerCase();
            if (
                (isIconFontEl || node.children.length === 0) &&
                (RESOURCE_ICON_NAMES.has(ownText) || UI_ONLY_ICON_NAMES.has(ownText))
            ) {
                return;
            }

            const blockText = (node.innerText || '').trim();
            if (
                blockText &&
                (isNoiseText(blockText) || (options.skipTexts && options.skipTexts.has(blockText)))
            ) {
                return;
            }

            if (
                (tag === 'DIV' || tag === 'SECTION') &&
                /^\d+\s*(consegnati|assegnati|turned in|assigned)$/i.test(
                    blockText.replace(/\s+/g, ' ')
                )
            ) {
                return;
            }

            const cs = getComputedStyle(node);
            const rect = node.getBoundingClientRect();
            const isBlockInSource = cs.display === 'block' || cs.display === 'list-item';
            const preservesNewlines =
                cs.whiteSpace === 'pre-wrap' ||
                cs.whiteSpace === 'pre-line' ||
                cs.whiteSpace === 'pre';

            // Preserva le righe vuote del testo originale (paragrafi/span vuoti con altezza di riga)
            if (
                node.children.length === 0 &&
                (node.textContent || '').trim() === '' &&
                isBlockInSource &&
                !node.hasAttribute('role') &&
                rect.height >= 12 &&
                rect.height <= 60 &&
                rect.width >= 80
            ) {
                const blankDiv = targetDoc.createElement('div');
                blankDiv.className = 'gc-blank-line';
                targetParent.appendChild(blankDiv);
                return;
            }

            if (ALLOWED_TAGS.has(tag)) {
                const newEl = targetDoc.createElement(tag.toLowerCase());
                if (tag === 'A' && node.href && !node.href.startsWith('javascript:')) {
                    newEl.href = node.href;
                    newEl.target = '_blank';
                    newEl.rel = 'noopener noreferrer';
                }
                if (tag === 'SPAN' && isBlockInSource) {
                    newEl.style.display = 'block';
                }
                if (preservesNewlines) {
                    newEl.style.whiteSpace = cs.whiteSpace;
                }
                appendCleanNodes(node, newEl, targetDoc, options);
                if (
                    newEl.childNodes.length > 0 ||
                    tag === 'BR' ||
                    tag === 'HR' ||
                    tag === 'TD' ||
                    tag === 'TH'
                ) {
                    targetParent.appendChild(newEl);
                }
            } else if (
                preservesNewlines ||
                (isBlockInSource &&
                    node.children.length === 0 &&
                    (node.textContent || '').trim().length > 0)
            ) {
                const wrapperDiv = targetDoc.createElement('div');
                if (preservesNewlines) {
                    wrapperDiv.style.whiteSpace = cs.whiteSpace;
                }
                appendCleanNodes(node, wrapperDiv, targetDoc, options);
                if (wrapperDiv.childNodes.length > 0) {
                    targetParent.appendChild(wrapperDiv);
                }
            } else {
                appendCleanNodes(node, targetParent, targetDoc, options);
            }
        });
    }

    // Estrae titolo vero, tipo risorsa, autore e metadati da una card dello Stream
    function extractStreamItemData(cardEl, index) {
        const attachments = extractAttachmentsFromContainer(cardEl, new Set());

        const rawLines = cardEl.innerText
            .split('\n')
            .map(l => l.trim())
            .filter(
                l =>
                    l &&
                    l !== '🖨️ Stampa' &&
                    l !== 'Stampa' &&
                    !l.includes('Scarica') &&
                    !/^(altre opzioni|more options|mostra altro|mostra meno)$/i.test(l) &&
                    !RESOURCE_ICON_NAMES.has(l.toLowerCase()) &&
                    !UI_ONLY_ICON_NAMES.has(l.toLowerCase())
            );

        let mainTitle = '';
        let subMeta = '';
        let iconType = '';
        const skipTexts = new Set();

        const publishRegex =
            /^(.+?)\s+(?:ha pubblicato un nuovo (materiale|compito|argomento)|ha pubblicato una nuova (domanda)|posted a new (material|assignment|question)):\s*(.+)$/i;

        for (const line of rawLines) {
            const m = line.match(publishRegex);
            if (m) {
                const author = m[1].trim();
                const kindRaw = (m[2] || m[3] || m[4] || '').toLowerCase();
                mainTitle = m[5].trim();
                skipTexts.add(line);
                skipTexts.add(mainTitle);

                if (kindRaw.includes('material')) {
                    iconType = 'book';
                    subMeta = `${author} • Materiale`;
                } else if (kindRaw.includes('domanda') || kindRaw.includes('question')) {
                    iconType = 'quiz';
                    subMeta = `${author} • Domanda`;
                } else {
                    iconType = 'assignment';
                    subMeta = `${author} • Compito`;
                }
                break;
            }
        }

        const dateLine = rawLines.find(l =>
            /^(pubblicazione:|created|ultima modifica|consegna:|scadenza:)/i.test(l)
        );
        if (dateLine) {
            skipTexts.add(dateLine);
            subMeta = subMeta ? `${subMeta} • ${dateLine}` : dateLine;
        }

        const dueLine = rawLines.find(
            l => l !== dateLine && /^(consegna:|scadenza:|due )/i.test(l)
        );
        if (dueLine) {
            skipTexts.add(dueLine);
            subMeta = subMeta ? `${subMeta} • ${dueLine}` : dueLine;
        }

        if (!mainTitle) {
            const candidateLines = rawLines.filter(
                l =>
                    !skipTexts.has(l) &&
                    !isNoiseText(l) &&
                    !/^\d+$/.test(l)
            );
            const authorOrFirst = candidateLines[0] || `Post #${index + 1}`;
            if (candidateLines.length >= 2 && authorOrFirst.length <= 45) {
                mainTitle = candidateLines[1];
                subMeta = subMeta ? `${authorOrFirst} • ${subMeta}` : authorOrFirst;
                skipTexts.add(authorOrFirst);
                skipTexts.add(mainTitle);
            } else {
                mainTitle = authorOrFirst;
                skipTexts.add(mainTitle);
            }
        }

        const itemLinkEl = cardEl.querySelector('a[href*="/a/"], a[href*="/m/"]');
        const classroomItemUrl = itemLinkEl ? itemLinkEl.href : '';

        return {
            mainTitle,
            subMeta,
            iconType,
            skipTexts,
            sourceEl: cardEl,
            classroomItemUrl,
            attachments
        };
    }

    // Estrae i dati dalla vista attiva di dettaglio (Compito, Materiale, Domanda)
    function extractAssignmentData() {
        const activeRoot = getActiveMainRoot();
        const visibleTabPanels = Array.from(
            activeRoot.querySelectorAll('[role="tabpanel"]')
        ).filter(isElementVisible);
        const searchRoot =
            visibleTabPanels.length > 0
                ? visibleTabPanels[visibleTabPanels.length - 1]
                : activeRoot;

        const fromDocTitle = document.title
            ? document.title.replace(/\s*-\s*(Google\s+)?Classroom\s*$/i, '').trim()
            : '';
        const cleanDocTitle =
            fromDocTitle && !/^(dettagli compito|classroom)$/i.test(fromDocTitle)
                ? fromDocTitle
                : '';

        const headingCandidates = Array.from(
            searchRoot.querySelectorAll(
                'h1, h2, [role="heading"], .N5dSp .IqHgie, .nl5VRd .IqHgie, .tLDEHd'
            )
        ).filter(
            el =>
                isElementVisible(el) &&
                !el.closest('[data-stream-item-id]') &&
                !el.closest('header, nav, [role="navigation"], aside') &&
                !isNoiseText(el.innerText || '') &&
                !/^(il tuo lavoro|your work)$/i.test((el.innerText || '').trim())
        );

        let titleEl = null;
        if (cleanDocTitle) {
            titleEl =
                headingCandidates.find(el => (el.innerText || '').trim() === cleanDocTitle) ||
                null;
        }
        if (!titleEl && headingCandidates.length > 0) {
            titleEl = headingCandidates[0];
        }

        const title =
            (titleEl ? titleEl.innerText.trim() : '') ||
            cleanDocTitle ||
            'Scheda Google Classroom';

        const path = window.location.pathname;
        let iconType = '';
        if (/\/c\/[^/]+\/m\//.test(path)) {
            iconType = 'book';
        } else if (/\/c\/[^/]+\/(sa|q)\//.test(path)) {
            iconType = 'quiz';
        } else if (/\/c\/[^/]+\/a\//.test(path)) {
            iconType = 'assignment';
        }

        const courseName = getCourseName();

        let assignmentCol = titleEl ? titleEl.parentElement : searchRoot;
        while (assignmentCol && assignmentCol.parentElement) {
            const parent = assignmentCol.parentElement;
            const hasAside = parent.querySelector('aside') !== null;
            const hasWorkHeading = Array.from(parent.querySelectorAll('h2')).some(h =>
                /il tuo lavoro|your work/i.test(h.textContent)
            );
            const hasStreamItems = parent.querySelector('[data-stream-item-id]') !== null;
            const hasNavOrHeader =
                parent.querySelector('nav, header, [role="navigation"]') !== null;
            const isContainerBoundary =
                parent === searchRoot ||
                parent.getAttribute('role') === 'tabpanel' ||
                parent.getAttribute('role') === 'main' ||
                parent.tagName === 'MAIN' ||
                parent === document.body;

            if (
                hasAside ||
                hasWorkHeading ||
                hasStreamItems ||
                hasNavOrHeader ||
                isContainerBoundary
            ) {
                break;
            }
            assignmentCol = parent;
        }

        const seenKeys = new Set();
        const attachments = assignmentCol
            ? extractAttachmentsFromContainer(assignmentCol, seenKeys)
            : [];

        const studentAttachments = [];
        const workContainer = Array.from(searchRoot.querySelectorAll('aside, div')).find(
            el =>
                isElementVisible(el) &&
                Array.from(el.querySelectorAll(':scope > div > h2, :scope > h2')).some(h =>
                    /il tuo lavoro|your work/i.test(h.textContent)
                )
        );

        if (workContainer) {
            studentAttachments.push(...extractAttachmentsFromContainer(workContainer, seenKeys));
        }

        return {
            title,
            iconType,
            courseName,
            assignmentCol,
            attachments,
            studentAttachments
        };
    }

    // Costruisce via DOM la tabella degli allegati nella finestra di stampa
    function buildAttachmentsTableDOM(doc, list, heading) {
        if (!list.length) return null;

        const fragment = doc.createDocumentFragment();

        const h2 = doc.createElement('h2');
        h2.textContent = `${heading} (${list.length})`;
        fragment.appendChild(h2);

        const table = doc.createElement('table');
        const thead = doc.createElement('thead');
        const headRow = doc.createElement('tr');

        [
            { text: '#', cls: '' },
            { text: 'Nome File / Link', cls: '' },
            { text: 'Tipo', cls: '' },
            { text: 'Azione', cls: 'no-print' }
        ].forEach(col => {
            const th = doc.createElement('th');
            th.textContent = col.text;
            if (col.cls) th.className = col.cls;
            headRow.appendChild(th);
        });

        thead.appendChild(headRow);
        table.appendChild(thead);

        const tbody = doc.createElement('tbody');
        list.forEach((item, idx) => {
            const tr = doc.createElement('tr');

            const tdNum = doc.createElement('td');
            tdNum.style.width = '30px';
            tdNum.style.textAlign = 'center';
            tdNum.textContent = String(idx + 1);
            tr.appendChild(tdNum);

            const tdName = doc.createElement('td');
            const strong = doc.createElement('strong');
            strong.textContent = item.name;
            tdName.appendChild(strong);
            tdName.appendChild(doc.createElement('br'));

            const urlSpan = doc.createElement('span');
            urlSpan.className = 'url-text';
            urlSpan.textContent = item.url;
            tdName.appendChild(urlSpan);
            tr.appendChild(tdName);

            const tdType = doc.createElement('td');
            tdType.style.width = '150px';
            tdType.textContent = item.type;
            tr.appendChild(tdType);

            const tdAct = doc.createElement('td');
            tdAct.className = 'no-print';
            tdAct.style.width = '115px';
            tdAct.style.textAlign = 'center';

            const linkBtn = doc.createElement('a');
            linkBtn.target = '_blank';
            linkBtn.rel = 'noopener noreferrer';
            if (item.downloadUrl) {
                linkBtn.className = 'dl-row-btn';
                linkBtn.href = item.downloadUrl;
                linkBtn.textContent = '⬇️ Scarica';
                linkBtn.addEventListener('click', e => {
                    e.preventDefault();
                    triggerBackgroundDownload(doc, item.downloadUrl);
                    const prev = linkBtn.textContent;
                    linkBtn.textContent = '✅ Avviato';
                    setTimeout(() => {
                        linkBtn.textContent = prev;
                    }, 2000);
                });
            } else {
                linkBtn.className = 'dl-row-btn secondary';
                linkBtn.href = item.url;
                linkBtn.textContent = '🔗 Apri';
            }
            tdAct.appendChild(linkBtn);
            tr.appendChild(tdAct);

            tbody.appendChild(tr);
        });

        table.appendChild(tbody);
        fragment.appendChild(table);
        return fragment;
    }

    // Crea una nuova scheda per l'anteprima di stampa
    function createBasePrintWindow(docTitle, printBtnLabel, downloadableUrls) {
        const printWin = window.open('', '_blank');

        if (!printWin) {
            alert(
                'Il browser ha bloccato l’apertura della scheda di stampa. Consenti i popup per classroom.google.com.'
            );
            return null;
        }

        const doc = printWin.document;
        doc.title = docTitle;

        const style = doc.createElement('style');
        style.textContent = `
            body {
                font-family: 'Segoe UI', Roboto, Arial, sans-serif;
                color: #202124;
                line-height: 1.55;
                margin: 0;
                padding: 0;
                background: #f8f9fa;
            }
            .toolbar {
                background: #202124;
                color: #fff;
                padding: 12px 24px;
                display: flex;
                gap: 12px;
                align-items: center;
                position: sticky;
                top: 0;
                z-index: 100;
            }
            .toolbar button {
                background: #1a73e8;
                color: white;
                border: none;
                padding: 8px 16px;
                border-radius: 6px;
                font-size: 14px;
                font-weight: 600;
                cursor: pointer;
            }
            .toolbar button.secondary { background: #188038; }
            .toolbar button:disabled { opacity: 0.7; cursor: wait; }
            .toolbar button:hover:not(:disabled) { opacity: 0.9; }
            .page {
                max-width: 840px;
                margin: 24px auto;
                background: #ffffff;
                padding: 40px 44px;
                box-shadow: 0 1px 4px rgba(0,0,0,0.12);
                border-radius: 8px;
            }
            .course-badge {
                font-size: 12px;
                font-weight: 600;
                color: #5f6368;
                text-transform: uppercase;
                letter-spacing: 0.6px;
                margin-bottom: 6px;
            }
            h1 {
                font-size: 25px;
                font-weight: 700;
                line-height: 1.3;
                margin: 0 0 8px 0;
                color: #1a73e8;
                display: flex;
                align-items: center;
            }
            .title-divider {
                border: none;
                border-top: 2px solid #1a73e8;
                margin: 12px 0 18px 0;
            }
            .subtitle-meta {
                font-size: 13px;
                color: #5f6368;
                margin-bottom: 4px;
            }
            h2 {
                font-size: 15px;
                margin-top: 22px;
                margin-bottom: 8px;
                color: #202124;
                border-bottom: 1px solid #dadce0;
                padding-bottom: 4px;
            }
            .stream-post-block {
                border: 1px solid #dadce0;
                border-radius: 8px;
                padding: 18px 22px;
                margin-bottom: 20px;
                page-break-inside: avoid;
            }
            .post-header {
                font-size: 17px;
                font-weight: 700;
                color: #1967d2;
                margin-bottom: 4px;
                display: flex;
                align-items: center;
            }
            .post-meta {
                font-size: 12px;
                color: #5f6368;
                margin-bottom: 10px;
                padding-bottom: 8px;
                border-bottom: 1px solid #f1f3f4;
            }
            .compact-note {
                font-size: 12px;
                color: #5f6368;
                margin-top: 6px;
            }
            .instructions { font-size: 14px; margin-top: 10px; }
            .instructions * { max-width: 100% !important; position: static !important; }
            .instructions .gc-blank-line { height: 0.85em; }
            .instructions ul, .instructions ol { margin: 8px 0; padding-left: 24px; }
            .instructions li { margin: 3px 0; }
            table {
                width: 100%;
                border-collapse: collapse;
                margin-top: 8px;
                font-size: 13px;
            }
            th, td {
                border: 1px solid #dadce0;
                padding: 8px 10px;
                text-align: left;
                vertical-align: middle;
            }
            th { background-color: #f1f3f4; font-weight: 600; }
            .url-text { font-size: 11px; color: #5f6368; word-break: break-all; }
            .dl-row-btn {
                display: inline-block;
                background: #1a73e8;
                color: #fff;
                text-decoration: none;
                padding: 5px 10px;
                border-radius: 5px;
                font-size: 12px;
                font-weight: 600;
                cursor: pointer;
            }
            .dl-row-btn.secondary { background: #5f6368; }
            .footer-meta {
                margin-top: 32px;
                padding-top: 12px;
                border-top: 1px solid #dadce0;
                font-size: 11px;
                color: #5f6368;
            }
            @media print {
                body { background: #fff; }
                .toolbar, .no-print { display: none !important; }
                .page { box-shadow: none; margin: 0; padding: 0; max-width: 100%; }
                tr, .stream-post-block { page-break-inside: avoid; }
            }
        `;
        doc.head.appendChild(style);

        const toolbar = doc.createElement('div');
        toolbar.className = 'toolbar';

        const printBtn = doc.createElement('button');
        printBtn.type = 'button';
        printBtn.textContent = printBtnLabel;
        printBtn.addEventListener('click', () => printWin.print());
        toolbar.appendChild(printBtn);

        if (downloadableUrls.length > 0) {
            const dlAllBtn = doc.createElement('button');
            dlAllBtn.type = 'button';
            dlAllBtn.className = 'secondary';
            const defaultText = `⬇️ Scarica tutti i file (${downloadableUrls.length})`;
            dlAllBtn.textContent = defaultText;

            dlAllBtn.addEventListener('click', () => {
                dlAllBtn.disabled = true;
                downloadableUrls.forEach((u, i) => {
                    setTimeout(() => {
                        triggerBackgroundDownload(doc, u);
                        dlAllBtn.textContent = `⏳ Download ${i + 1}/${downloadableUrls.length}...`;
                        if (i === downloadableUrls.length - 1) {
                            setTimeout(() => {
                                dlAllBtn.textContent = `✅ Avviati tutti (${downloadableUrls.length})`;
                                dlAllBtn.disabled = false;
                                setTimeout(() => {
                                    dlAllBtn.textContent = defaultText;
                                }, 3000);
                            }, 400);
                        }
                    }, i * 350);
                });
            });
            toolbar.appendChild(dlAllBtn);
        }

        const hint = doc.createElement('span');
        hint.style.fontSize = '12px';
        hint.style.color = '#bdc1c6';
        hint.style.marginLeft = 'auto';
        hint.textContent = 'Anteprima di stampa';
        toolbar.appendChild(hint);

        doc.body.appendChild(toolbar);

        const page = doc.createElement('div');
        page.className = 'page';
        doc.body.appendChild(page);

        return { printWin, doc, page };
    }

    function appendFooterMeta(doc, page) {
        const footer = doc.createElement('div');
        footer.className = 'footer-meta';
        footer.textContent = `Stampato da Google Classroom • Link originale: ${window.location.href}`;
        page.appendChild(footer);
    }

    // Apre l'anteprima di stampa per la pagina di dettaglio (Compito / Materiale / Domanda / Singolo post)
    function openDetailPrintPreview() {
        injectDirectDownloadButtons();

        // Se siamo sulla vista di dettaglio di un singolo post (/c/<id>/p/<id>)
        if (isSinglePostDetailPage()) {
            const singleCards = getAllStreamPostCards(true);
            if (singleCards.length > 0) {
                openStreamPrintPreview([singleCards[0]]);
                return;
            }
        }

        const data = extractAssignmentData();
        const downloadableUrls = [...data.attachments, ...data.studentAttachments]
            .map(a => a.downloadUrl)
            .filter(Boolean);

        const winCtx = createBasePrintWindow(
            `Stampa - ${data.title}`,
            '🖨️ Stampa Scheda',
            downloadableUrls
        );
        if (!winCtx) return;

        const { doc, page } = winCtx;

        if (data.courseName) {
            const badge = doc.createElement('div');
            badge.className = 'course-badge';
            badge.textContent = data.courseName;
            page.appendChild(badge);
        }

        const h1 = doc.createElement('h1');
        if (data.iconType) {
            h1.appendChild(createSvgResourceIcon(doc, data.iconType));
        }
        const titleSpan = doc.createElement('span');
        titleSpan.textContent = data.title;
        h1.appendChild(titleSpan);
        page.appendChild(h1);

        const hr = doc.createElement('hr');
        hr.className = 'title-divider';
        page.appendChild(hr);

        const instrDiv = doc.createElement('div');
        instrDiv.className = 'instructions';
        const skipTexts = new Set([data.title, `${data.title} - Classroom`]);
        if (data.assignmentCol) {
            appendCleanNodes(data.assignmentCol, instrDiv, doc, {
                skipH1: true,
                excludeStreamItems: true,
                skipTexts
            });
        }
        if (!instrDiv.textContent.trim()) {
            const em = doc.createElement('em');
            em.textContent = 'Nessuna descrizione testuale presente.';
            instrDiv.appendChild(em);
        }
        page.appendChild(instrDiv);

        const attTable = buildAttachmentsTableDOM(doc, data.attachments, 'Allegati');
        if (attTable) page.appendChild(attTable);

        const studTable = buildAttachmentsTableDOM(
            doc,
            data.studentAttachments,
            'Il tuo lavoro (Allegati caricati)'
        );
        if (studTable) page.appendChild(studTable);

        appendFooterMeta(doc, page);
    }

    // Apre l'anteprima di stampa per uno (singola scheda) o più post (intero Stream)
    function openStreamPrintPreview(cardElements) {
        injectDirectDownloadButtons();
        const courseName = getCourseName();
        const items = cardElements.map((el, i) => extractStreamItemData(el, i));
        const isSingle = items.length === 1;

        const allDownloadUrls = [];
        const seenDl = new Set();
        items.forEach(it => {
            it.attachments.forEach(att => {
                if (att.downloadUrl && !seenDl.has(att.downloadUrl)) {
                    seenDl.add(att.downloadUrl);
                    allDownloadUrls.push(att.downloadUrl);
                }
            });
        });

        const docTitle = isSingle ? `Stampa - ${items[0].mainTitle}` : `Stampa Stream - ${courseName}`;
        const toolbarBtnLabel = isSingle ? '🖨️ Stampa Scheda' : '🖨️ Stampa Stream';

        const winCtx = createBasePrintWindow(docTitle, toolbarBtnLabel, allDownloadUrls);
        if (!winCtx) return;

        const { doc, page } = winCtx;

        const badge = doc.createElement('div');
        badge.className = 'course-badge';
        badge.textContent = courseName;
        page.appendChild(badge);

        if (!items.length) {
            const h1 = doc.createElement('h1');
            h1.textContent = 'Stream del Corso';
            page.appendChild(h1);

            const p = doc.createElement('p');
            const em = doc.createElement('em');
            em.textContent =
                'Nessun post espanso trovato nello Stream visibile. Apri il dettaglio del singolo elemento per stamparlo.';
            p.appendChild(em);
            page.appendChild(p);
            appendFooterMeta(doc, page);
            return;
        }

        // Caso 1: Stampa di UN SINGOLO post/materiale/compito dallo Stream
        if (isSingle) {
            const it = items[0];

            const h1 = doc.createElement('h1');
            if (it.iconType) {
                h1.appendChild(createSvgResourceIcon(doc, it.iconType));
            }
            const titleSpan = doc.createElement('span');
            titleSpan.textContent = it.mainTitle;
            h1.appendChild(titleSpan);
            page.appendChild(h1);

            if (it.subMeta) {
                const sub = doc.createElement('div');
                sub.className = 'subtitle-meta';
                sub.textContent = it.subMeta;
                page.appendChild(sub);
            }

            const hr = doc.createElement('hr');
            hr.className = 'title-divider';
            page.appendChild(hr);

            const bodyDiv = doc.createElement('div');
            bodyDiv.className = 'instructions';
            appendCleanNodes(it.sourceEl, bodyDiv, doc, {
                skipTexts: it.skipTexts
            });
            if (bodyDiv.textContent.trim()) {
                page.appendChild(bodyDiv);
            }

            const attTable = buildAttachmentsTableDOM(doc, it.attachments, 'Allegati');
            if (attTable) page.appendChild(attTable);

            appendFooterMeta(doc, page);
            return;
        }

        // Caso 2: Stampa dell'INTERO STREAM (più post)
        const h1 = doc.createElement('h1');
        h1.textContent = `Stream del Corso (${items.length} post)`;
        page.appendChild(h1);

        const hr = doc.createElement('hr');
        hr.className = 'title-divider';
        page.appendChild(hr);

        items.forEach(it => {
            const block = doc.createElement('div');
            block.className = 'stream-post-block';

            const postHeader = doc.createElement('div');
            postHeader.className = 'post-header';
            if (it.iconType) {
                postHeader.appendChild(createSvgResourceIcon(doc, it.iconType));
            }
            const titleSpan = doc.createElement('span');
            titleSpan.textContent = it.mainTitle;
            postHeader.appendChild(titleSpan);
            block.appendChild(postHeader);

            if (it.subMeta) {
                const metaDiv = doc.createElement('div');
                metaDiv.className = 'post-meta';
                metaDiv.textContent = it.subMeta;
                block.appendChild(metaDiv);
            }

            const bodyDiv = doc.createElement('div');
            bodyDiv.className = 'instructions';
            appendCleanNodes(it.sourceEl, bodyDiv, doc, {
                skipTexts: it.skipTexts
            });
            if (bodyDiv.textContent.trim()) {
                block.appendChild(bodyDiv);
            }

            const attTable = buildAttachmentsTableDOM(doc, it.attachments, 'Allegati');
            if (attTable) block.appendChild(attTable);

            page.appendChild(block);
        });

        appendFooterMeta(doc, page);
    }

    let scheduled = false;
    function runAll() {
        scheduled = false;
        getCourseName(); // Aggiorna la cache del nome corso mentre si naviga nello Stream
        updatePrintButton();
        injectStreamPostPrintButtons();
        injectDirectDownloadButtons();
    }

    function scheduleRun() {
        if (!scheduled) {
            scheduled = true;
            requestAnimationFrame(runAll);
        }
    }

    const observer = new MutationObserver(scheduleRun);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('popstate', scheduleRun);
    runAll();
})();