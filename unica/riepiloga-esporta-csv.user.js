// ==UserScript==
// @name         Piattaforma Unica - Riepiloga classe ed esporta CSV
// @namespace    https://github.com/sonia-guerci/docenti-scripts
// @version      1.0.0
// @description  Riepiloga classe e scarica in CSV i dati degli studenti di una intera classe con un click, direttamente sulla piattaforma Unica
// @author       Sonia Guerci
// @match        https://unica.istruzione.gov.it/*
// @updateURL    https://raw.githubusercontent.com/sonia-guerci/docenti-scripts/main/unica/riepiloga-esporta-csv.user.js
// @downloadURL  https://raw.githubusercontent.com/sonia-guerci/docenti-scripts/main/unica/riepiloga-esporta-csv.user.js
// @grant        none
// ==/UserScript==
(function() {
    'use strict';

    let authToken = null;
    let classStudentsList = [];
    let collectedClassData = [];

    function log(step, msg, details = null) {
        let tag = `%c[UNICA-DASHBOARD] [${step}]`;
        let style = 'background: #059669; color: #ffffff; font-weight: bold; padding: 2px 6px; border-radius: 3px;';
        if (details !== null) {
            console.log(tag, style, msg, details);
        } else {
            console.log(tag, style, msg);
        }
    }

    function checkAndSaveToken(headers) {
        if (!headers || authToken) return false;
        let auth = null;

        try {
            if (typeof headers.get === 'function') {
                auth = headers.get('Authorization') || headers.get('authorization');
            } else if (typeof headers === 'object') {
                auth = headers.Authorization || headers.authorization || headers.AUTHORIZATION;
            }
        } catch (e) {}

        if (auth && auth.startsWith('Bearer ')) {
            authToken = auth;
            log('TOKEN', '🔑 Token Bearer salvato!', authToken.substring(0, 30) + '...');
            return true;
        }
        return false;
    }

    function getBearerTokenFromStorage() {
        if (authToken) return authToken;

        for (let storage of [sessionStorage, localStorage]) {
            try {
                for (let i = 0; i < storage.length; i++) {
                    let key = storage.key(i);
                    let val = storage.getItem(key);
                    if (typeof val === 'string') {
                        if (val.startsWith('Bearer ')) {
                            authToken = val;
                            return authToken;
                        }
                        let match = val.match(/eyJ[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.?[A-Za-z0-9-_.+/=]*/);
                        if (match) {
                            authToken = 'Bearer ' + match[0];
                            return authToken;
                        }
                    }
                }
            } catch (e) {}
        }
        return null;
    }

    function getCurrentSchoolCode() {
        let url = window.location.href;
        let match = url.match(/(?:institutes|schools)\/([A-Za-z0-9]+)/i);
        return match ? match[1] : 'UDTD010004';
    }

    function formatAnnoScolastico(annoRaw) {
        if (!annoRaw) return '';
        let str = String(annoRaw);
        if (str.length === 6) {
            return `${str.substring(0, 4)}-${str.substring(4)}`;
        }
        return str;
    }

    log('INIT', 'Estensione v4.0 (Final UI) avviata.');

    // 1. INTERCETTAZIONE FETCH
    const originalFetch = window.fetch;
    window.fetch = async function(...args) {
        let [resource, config] = args;
        let url = typeof resource === 'string' ? resource : (resource ? resource.url : '');

        if (resource && typeof resource === 'object' && resource.headers) checkAndSaveToken(resource.headers);
        if (config && config.headers) checkAndSaveToken(config.headers);

        let response = await originalFetch.apply(this, args);

        try {
            if (url.includes('studenti-classe') || url.includes('studentiClasse')) {
                let clone = response.clone();
                let data = await clone.json();

                if (data && data.studentiClasse && Array.isArray(data.studentiClasse)) {
                    classStudentsList = data.studentiClasse.map(s => ({
                        cf: s.codiceFiscaleStudente,
                        nome: s.nome,
                        cognome: s.cognome,
                        fullName: `${s.cognome} ${s.nome}`.toUpperCase().trim()
                    }));

                    log('API_MATCH', `🎯 CATTURATI ${classStudentsList.length} STUDENTI!`, classStudentsList);
                    updateButtonState();
                }
            }
        } catch (e) {}

        return response;
    };

    // 2. INTERCETTAZIONE XHR
    const origSetHeader = XMLHttpRequest.prototype.setRequestHeader;
    XMLHttpRequest.prototype.setRequestHeader = function(header, value) {
        if (header && header.toLowerCase() === 'authorization' && value.startsWith('Bearer ')) {
            authToken = value;
        }
        return origSetHeader.apply(this, arguments);
    };

    // 3. API CALLS
    async function fetchStoricoScuole(cf) {
        let token = authToken || getBearerTokenFromStorage();
        if (!token) throw new Error("Token Bearer mancante.");
        let url = `https://unica.istruzione.gov.it/services/e-portfolio/api/v2.0/private/ep/info-studente/storico-scuole`;
        let resp = await fetch(url, { method: 'GET', headers: { 'Accept': 'application/json, text/plain, */*', 'Authorization': token, 'Cfstudente': cf } });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        return await resp.json();
    }

    async function fetchEsitiEsameMedie(cf, codForteScuolaMM, codScuolaCorrente) {
        let token = authToken || getBearerTokenFromStorage();
        if (!token) throw new Error("Token Bearer mancante.");
        let query = `?codiceForteScuolaCorrenteStudente=${codScuolaCorrente}&codiceForteScuolaDaEsaminare=${codForteScuolaMM}&gradoScuolaDaEsaminare=MM`;
        let url = `https://unica.istruzione.gov.it/services/e-portfolio/api/v2.0/private/ep/esami/esito-esami-crediti${query}`;
        let resp = await fetch(url, { method: 'GET', headers: { 'Accept': 'application/json, text/plain, */*', 'Authorization': token, 'Cfstudente': cf } });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        return await resp.json();
    }

    async function fetchDatiSintesi(cf) {
        let token = authToken || getBearerTokenFromStorage();
        if (!token) throw new Error("Token Bearer mancante.");
        let url = `https://unica.istruzione.gov.it/services/e-portfolio/api/v1.0/private/ep/info-studente/dati-sintesi`;
        let resp = await fetch(url, { method: 'GET', headers: { 'Accept': 'application/json, text/plain, */*', 'Authorization': token, 'Cfstudente': cf } });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        return await resp.json();
    }

    async function fetchInfoDocumenti(cf) {
        let token = authToken || getBearerTokenFromStorage();
        if (!token) throw new Error("Token Bearer mancante.");
        let url = `https://unica.istruzione.gov.it/services/e-portfolio/api/v1.0/private/ep/documento-cv/infoDocumenti`;
        let resp = await fetch(url, { method: 'GET', headers: { 'Accept': 'application/json, text/plain, */*', 'Authorization': token, 'Cfstudente': cf } });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        return await resp.json();
    }

    // 4. ESPORTAZIONE CSV
    function exportToCSV() {
        if (!collectedClassData || collectedClassData.length === 0) return;

        let headers = [
            "Cognome", "Nome", "Codice Fiscale", "Scuola Media",
            "Voto Licenza Media", "Capolavoro Stato", "Autovalutazione",
            "Certificazione Competenze Medie", "Bocciature Superiori", "N. Scuole Superiori"
        ];

        let rows = collectedClassData.map(d => [
            `"${d.cognome.replace(/"/g, '""')}"`,
            `"${d.nome.replace(/"/g, '""')}"`,
            `"${d.cf}"`,
            `"${d.scuolaMedia.replace(/"/g, '""')}"`,
            `"${d.votoMedieClean}"`,
            `"${d.capolavoro}"`,
            `"${d.autovalutazione}"`,
            `"${d.certMedie}"`,
            `"${d.bocciatureSup}"`,
            `"${d.numScuoleSup}"`
        ]);

        let csvContent = "\uFEFF" + [headers.join(";"), ...rows.map(e => e.join(";"))].join("\n");
        let blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        let url = URL.createObjectURL(blob);

        let className = (document.querySelector('h1')?.innerText || 'Classe').replace(/[^a-zA-Z0-9]/g, '_');
        let link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `Unica_Dashboard_${className}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    // 5. CARICAMENTO DASHBOARD
    async function loadMassiveDashboard() {
        let btn = document.getElementById('btn-load-dashboard');
        let btnCsv = document.getElementById('btn-export-csv');

        let token = authToken || getBearerTokenFromStorage();
        if (!token) {
            alert("⚠️ Token non intercettato. Clicca prima su uno studente qualsiasi per attivare la sessione.");
            return;
        }

        if (classStudentsList.length === 0) {
            alert("⚠️ Elenco studenti non ancora intercettato. Ricarica la pagina (F5).");
            return;
        }

        let currentSchoolCode = getCurrentSchoolCode();
        if (btn) btn.innerText = "⏳ Download Dati...";
        collectedClassData = [];

        let studentLinks = Array.from(document.querySelectorAll('a[href*="e-portfolio/detail"]')).filter(link => {
            let text = link.innerText.trim();
            return text.length > 0 && !text.toLowerCase().includes('homepage');
        });

        for (let [idx, link] of studentLinks.entries()) {
            let linkText = link.innerText.toUpperCase().trim().replace(/\s+/g, ' ');

            let matchedStudent = classStudentsList.find(s => {
                return linkText.includes(s.nome.toUpperCase()) && linkText.includes(s.cognome.toUpperCase());
            }) || classStudentsList[idx];

            let parentContainer = link.closest('div') || link.parentElement;
            let containerBadge = parentContainer.querySelector('.unica-badge-container');

            if (!containerBadge) {
                containerBadge = document.createElement('div');
                containerBadge.className = 'unica-badge-container';
                containerBadge.style.cssText = `margin-top: 8px !important; display: flex !important; flex-wrap: wrap !important; gap: 6px !important; align-items: center !important; width: 100% !important;`;
                parentContainer.appendChild(containerBadge);
            }

            if (!matchedStudent || !matchedStudent.cf) {
                containerBadge.innerHTML = `<span style="padding: 3px 8px; border-radius: 4px; font-size: 11px; background: #f59e0b; color: white; font-weight: bold;">⚠️ CF Assente</span>`;
                continue;
            }

            containerBadge.innerHTML = `<span style="padding: 3px 8px; border-radius: 4px; font-size: 11px; background: #0284c7; color: white; font-weight: bold;">⏳ Download...</span>`;

            try {
                let [storico, sintesi, documenti] = await Promise.all([
                    fetchStoricoScuole(matchedStudent.cf).catch(() => null),
                    fetchDatiSintesi(matchedStudent.cf).catch(() => null),
                    fetchInfoDocumenti(matchedStudent.cf).catch(() => null)
                ]);

                let scuoleArray = Array.isArray(storico) ? storico : (storico && Array.isArray(storico.listaScuola) ? storico.listaScuola : []);
                let scuoleMM = scuoleArray.filter(s => s.codiceOrdineScuola === 'MM').sort((a, b) => Number(a.annoScolastico) - Number(b.annoScolastico));
                let ultimaScuolaMedia = scuoleMM.length > 0 ? scuoleMM[scuoleMM.length - 1] : null;
                let nomeScuolaMedia = ultimaScuolaMedia ? (ultimaScuolaMedia.denominazioneScuola || 'Media Sconosciuta') : 'N.D.';

                let esami = null;
                if (ultimaScuolaMedia) {
                    let codForteMM = ultimaScuolaMedia.codiceForteScuola || ultimaScuolaMedia.codiceDeboleScuola;
                    esami = await fetchEsitiEsameMedie(matchedStudent.cf, codForteMM, currentSchoolCode).catch(() => null);
                }

                let votoMedieClean = 'N.D.';
                let votoMedieDisplay = 'N.D.';
                if (esami && esami.listaValutazioneEsameFinali && esami.listaValutazioneEsameFinali.esitoFinale !== undefined) {
                    let esitoFinale = esami.listaValutazioneEsameFinali.esitoFinale;
                    let lode = (esami.listaValutazioneEsameFinali.flagLode === 'S' || esami.listaValutazioneEsameFinali.flagLode === 'Y') ? ' e Lode' : '';
                    votoMedieClean = `${esitoFinale}${lode}`;
                    votoMedieDisplay = `${esitoFinale}/10${lode}`;
                } else if (ultimaScuolaMedia) {
                    votoMedieClean = ultimaScuolaMedia.descrizioneEsito || 'Ammesso';
                    votoMedieDisplay = votoMedieClean;
                }

                let scuoleSuperiori = scuoleArray.filter(s => s.codiceOrdineScuola !== 'EE' && s.codiceOrdineScuola !== 'MM');
                let bocciatureSuperiori = scuoleSuperiori.filter(s => {
                    let esito = (s.descrizioneEsito || '').toUpperCase();
                    return esito.includes('NON AMMESS') || esito.includes('RESPINT');
                });
                let numBocciatureSuperiori = bocciatureSuperiori.length;

                let htmlBocciatureHover = bocciatureSuperiori.map(b => `
                    <div style="margin-bottom: 4px; border-bottom: 1px solid #fee2e2; padding-bottom: 2px;">
                        <strong>Anno: ${formatAnnoScolastico(b.annoScolastico)}</strong><br>${b.denominazioneScuola || 'Scuola Superiore'}<br>
                        <span style="color: #ef4444; font-weight: bold;">${b.descrizioneEsito || 'NON AMMESSO'}</span>
                    </div>
                `).join('');

                let nomiScuoleSuperiori = Array.from(new Set(scuoleSuperiori.map(s => s.denominazioneScuola).filter(Boolean)));
                let numScuoleSuperiori = nomiScuoleSuperiori.length;

                let capConfermati = sintesi ? (sintesi.totaleCapolavoroConfermato || 0) : 0;
                let capBozza = sintesi ? ((sintesi.totaleCapolavoroBozza || 0) + (sintesi.totaleCapolavoroDaVisionare || 0) + (sintesi.totaleCapolavoroRimessoInBozza || 0)) : 0;

                let capTitle = 'Capolavoro: In attesa'; let capBg = '#94a3b8';
                if (capConfermati > 0) { capTitle = `Capolavoro: Confermato (${capConfermati})`; capBg = '#059669'; }
                else if (capBozza > 0) { capTitle = `Capolavoro: In Bozza (${capBozza})`; capBg = '#0284c7'; }

                let isAutovalutato = sintesi && (sintesi.flagAutovalutazione === 1 || (sintesi.statoAutovalutazione && sintesi.statoAutovalutazione !== 'NON_COMPILATA' && sintesi.statoAutovalutazione !== null));
                let autoValTitle = isAutovalutato ? 'Autovalutazione: Compilata' : 'Autovalutazione: Non compilata';
                let autoValBg = isAutovalutato ? '#059669' : '#94a3b8';

                let docsList = (documenti && Array.isArray(documenti.listaDocumenti)) ? documenti.listaDocumenti : [];
                let certMedieDoc = docsList.find(d => d.codiceFunzionalita === 'CERT_COMP' && d.ordineGradoDoc === 8);
                let isCertPresente = (certMedieDoc && certMedieDoc.statoDocumento !== 'ND');
                let certMedieTitle = isCertPresente ? 'Certificazione Competenze Medie: Presente' : 'Certificazione Competenze Medie: Assente';
                let certMedieBg = isCertPresente ? '#059669' : '#94a3b8';

                collectedClassData.push({
                    cognome: matchedStudent.cognome || '',
                    nome: matchedStudent.nome || '',
                    cf: matchedStudent.cf || '',
                    scuolaMedia: nomeScuolaMedia,
                    votoMedieClean: votoMedieClean,
                    capolavoro: capConfermati > 0 ? `Confermato (${capConfermati})` : (capBozza > 0 ? `Bozza (${capBozza})` : 'In attesa'),
                    autovalutazione: isAutovalutato ? 'Compilata' : 'Non compilata',
                    certMedie: isCertPresente ? 'Presente' : 'Assente',
                    bocciatureSup: numBocciatureSuperiori,
                    numScuoleSup: numScuoleSuperiori
                });

                let listaSuperioriHTML = scuoleSuperiori.map(s => `
                    <div style="margin-bottom: 4px; border-bottom: 1px solid #e2e8f0; padding-bottom: 2px;">
                        <strong>Anno ${formatAnnoScolastico(s.annoScolastico)}</strong> - ${s.denominazioneScuola || 'Scuola Superiori'}<br>
                        <span style="color: ${ (s.descrizioneEsito || '').includes('NON') ? '#ef4444' : '#10b981' }; font-weight: bold;">${s.descrizioneEsito || 'Esito non specificato'}</span>
                    </div>
                `).join('');

                let badgeStyle = "padding: 4px 8px; border-radius: 6px; font-size: 11px; font-family: system-ui, -apple-system, sans-serif; font-weight: 600; color: white; display: inline-flex; align-items: center; white-space: nowrap; box-shadow: 0 1px 2px rgba(0,0,0,0.08); cursor: pointer;";

                containerBadge.innerHTML = `
                    <span style="${badgeStyle} background: #059669;" title="Scuola Media: ${nomeScuolaMedia}">🎓 Medie: ${votoMedieDisplay} (${nomeScuolaMedia})</span>
                    <span style="${badgeStyle} background: ${capBg}; font-size: 13px;" title="${capTitle}">🎨</span>
                    <span style="${badgeStyle} background: ${autoValBg}; font-size: 13px;" title="${autoValTitle}">📝</span>
                    <span style="${badgeStyle} background: ${certMedieBg}; font-size: 13px;" title="${certMedieTitle}">📜</span>
                    <span class="unica-bocciature-hover" style="${badgeStyle} background: ${numBocciatureSuperiori > 0 ? '#dc2626' : '#64748b'}; position: relative;" title="Bocciature Scuola Superiore">
                        ${numBocciatureSuperiori > 0 ? `⚠️ Bocciature Sup.: ${numBocciatureSuperiori}` : `✅ 0 Bocciature Sup.`}
                        ${numBocciatureSuperiori > 0 ? `<div class="unica-tooltip-bocciature" style="display: none; position: absolute; bottom: 28px; left: 0; width: 250px; background: #ffffff; color: #0f172a; border: 2px solid #dc2626; padding: 10px; border-radius: 8px; box-shadow: 0 10px 25px rgba(0,0,0,0.25); z-index: 9999; font-weight: normal; font-size: 11px; max-height: 180px; overflow-y: auto;"><strong style="color: #dc2626; font-size: 12px;">Dettaglio Bocciature:</strong><br><br>${htmlBocciatureHover}</div>` : ''}
                    </span>
                    <span class="unica-school-hover" style="${badgeStyle} background: #0284c7; position: relative;">🏫 ${numScuoleSuperiori} Scuole Sup. ℹ️
                        <div class="unica-tooltip-box" style="display: none; position: absolute; bottom: 28px; left: 0; width: 280px; background: #ffffff; color: #0f172a; border: 2px solid #0284c7; padding: 10px; border-radius: 8px; box-shadow: 0 10px 25px rgba(0,0,0,0.25); z-index: 9999; font-weight: normal; font-size: 11px; max-height: 200px; overflow-y: auto;"><strong style="color: #0284c7; font-size: 12px;">Storico Scuole Superiori:</strong><br><br>${listaSuperioriHTML || 'Nessuno storico superiori reperito.'}</div>
                    </span>
                `;

                let hoverEl = containerBadge.querySelector('.unica-school-hover');
                let tooltipEl = containerBadge.querySelector('.unica-tooltip-box');
                if (hoverEl && tooltipEl) {
                    hoverEl.onmouseenter = () => tooltipEl.style.display = 'block';
                    hoverEl.onmouseleave = () => tooltipEl.style.display = 'none';
                }

                let hoverBoccEl = containerBadge.querySelector('.unica-bocciature-hover');
                let tooltipBoccEl = containerBadge.querySelector('.unica-tooltip-bocciature');
                if (hoverBoccEl && tooltipBoccEl) {
                    hoverBoccEl.onmouseenter = () => tooltipBoccEl.style.display = 'block';
                    hoverBoccEl.onmouseleave = () => tooltipBoccEl.style.display = 'none';
                }

            } catch (err) {
                log('ERR', `Errore per ${matchedStudent.fullName}`, err);
                containerBadge.innerHTML = `<span style="padding: 3px 8px; border-radius: 4px; font-size: 10px; background: #ef4444; color: white; font-weight: bold;">❌ Errore API</span>`;
            }
        }

        if (btn) btn.innerText = "✅ Dati Completati";
        if (btnCsv) {
            btnCsv.disabled = false;
            btnCsv.style.background = "#0d9488";
            btnCsv.style.opacity = "1";
            btnCsv.style.cursor = "pointer";
            btnCsv.title = "Scarica il file CSV formattato per Excel";
            btnCsv.innerText = `📥 Esporta CSV (${collectedClassData.length})`;
        }
    }

    function updateButtonState() {
        let btn = document.getElementById('btn-load-dashboard');
        if (btn && classStudentsList.length > 0) {
            btn.innerHTML = `⚡ Carica Esiti (${classStudentsList.length})`;
            btn.style.background = '#059669';
        }
    }

    function injectDashboardToolbar() {
        let cleanPath = window.location.pathname.replace(/\/$/, '');
        let isClassPage = /\/class\/[^\/]+$/.test(cleanPath) ||/\/classes\/[^\/]+$/.test(cleanPath);

        if (!isClassPage) return;

        let studentTabBtn = document.getElementById('class-details-tabs_tab_1') ||
                            document.querySelector('button[id*="class-details-tabs_tab_1"]') ||
                            Array.from(document.querySelectorAll('button')).find(b => (b.innerText || '').toLowerCase().includes('studenti'));

        let isStudentTabActive = studentTabBtn && (
            studentTabBtn.getAttribute('aria-selected') === 'true' ||
            studentTabBtn.classList.contains('active') ||
            studentTabBtn.getAttribute('data-state') === 'active'
        );

        let existingToolbar = document.getElementById('unica-toolbar-container');

        if (!isStudentTabActive) {
            if (existingToolbar) existingToolbar.remove();
            return;
        }

        if (!existingToolbar && studentTabBtn) {
            let toolbar = document.createElement('div');
            toolbar.id = 'unica-toolbar-container';
            toolbar.style.cssText = `display: inline-flex !important; align-items: center !important; gap: 8px !important; margin-left: 12px !important; vertical-align: middle !important;`;

            let btnLoad = document.createElement('button');
            btnLoad.id = 'btn-load-dashboard';
            btnLoad.innerHTML = classStudentsList.length > 0 ? `⚡ Carica Esiti (${classStudentsList.length})` : '⚡ Carica Esiti';
            btnLoad.style.cssText = `display: inline-flex !important; align-items: center !important; justify-content: center !important; background: ${classStudentsList.length > 0 ? '#059669' : '#0284c7'} !important; color: white !important; border: none !important; padding: 5px 12px !important; font-size: 12px !important; font-weight: bold !important; border-radius: 6px !important; box-shadow: 0 2px 4px rgba(0,0,0,0.12) !important; cursor: pointer !important; font-family: system-ui, -apple-system, sans-serif !important; height: 30px !important; line-height: 1 !important;`;
            btnLoad.onclick = (e) => { e.stopPropagation(); loadMassiveDashboard(); };

            let btnCsv = document.createElement('button');
            btnCsv.id = 'btn-export-csv';
            btnCsv.innerHTML = '📥 Esporta CSV';
            let hasData = collectedClassData.length > 0;
            btnCsv.disabled = !hasData;

            btnCsv.style.cssText = `display: inline-flex !important; align-items: center !important; justify-content: center !important; background: ${hasData ? '#0d9488' : '#94a3b8'} !important; color: white !important; border: none !important; padding: 5px 12px !important; font-size: 12px !important; font-weight: bold !important; border-radius: 6px !important; box-shadow: 0 2px 4px rgba(0,0,0,0.12) !important; cursor: ${hasData ? 'pointer' : 'not-allowed'} !important; opacity: ${hasData ? '1' : '0.65'} !important; font-family: system-ui, -apple-system, sans-serif !important; height: 30px !important; line-height: 1 !important;`;
            btnCsv.title = hasData ? "Scarica il file CSV formattato per Excel" : "⚠️ Fai prima click su 'Carica Esiti' per scaricare il report CSV";
            btnCsv.onclick = (e) => { e.stopPropagation(); if (!btnCsv.disabled) exportToCSV(); };

            toolbar.appendChild(btnLoad);
            toolbar.appendChild(btnCsv);
            studentTabBtn.appendChild(toolbar);
            log('UI', '✅ Toolbar iniettata!');
        }
    }

    setInterval(injectDashboardToolbar, 500);
})();
