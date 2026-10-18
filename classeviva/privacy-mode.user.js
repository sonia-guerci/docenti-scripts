// ==UserScript==
// @name         ClasseViva - Privacy mode
// @namespace    https://github.com/sonia-guerci/docenti-scripts
// @version      1.0.0
// @description  Oscura voti, note e avvisi nel registro ClasseViva con memoria dello stato ON/OFF tra le pagine.
// @author       Sonia Guerci
// @match        https://*.spaggiari.eu/cvv/app/default/regvoti.php?*
// @match        https://*.spaggiari.eu/cvv/app/default/regclasse.php?*
// @updateURL    https://raw.githubusercontent.com/sonia-guerci/docenti-scripts/main/classeviva/privacy-mode.user.js
// @downloadURL  https://raw.githubusercontent.com/sonia-guerci/docenti-scripts/main/classeviva/privacy-mode.user.js
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // Gestione della memoria dello stato
    function isPrivacyAttiva() {
        const saved = localStorage.getItem('cv_privacy_active');
        return saved === null ? true : saved === 'true';
    }

    function setPrivacyAttiva(valore) {
        localStorage.setItem('cv_privacy_active', valore);
    }

    // Funzione per alternare lo stato di oscuramento di un elemento
    function toggleSecurity(el) {
        if (!el) return;
        const currentStyle = el.style.webkitTextSecurity;
        if (currentStyle === '' || currentStyle !== 'square') {
            el.style.webkitTextSecurity = 'square';
            el.style.filter = 'blur(3px)';
            el.style.cursor = 'zoom-in';
        } else {
            el.style.webkitTextSecurity = 'none';
            el.style.filter = 'none';
            el.style.cursor = 'zoom-out';
        }
    }

    // Oscura le note e gli avvisi presenti nel banner scorrevole
    function oscuraAvvisi() {
        try {
            let posAgenda = 0;
            const notaScorr = document.querySelector("p#nota_classe_scorr>span");
            if (notaScorr && !document.getElementById('nota_scorr_agenda')) {
                const comunicazioni = document.querySelector("p#nota_classe_scorr>span>a");
                if (comunicazioni) posAgenda++;

                const text = notaScorr.textContent;
                const parti = text.split("---\n");
                if (text !== '' && parti.length > posAgenda) {
                    notaScorr.innerHTML = '';
                    if (comunicazioni) notaScorr.appendChild(comunicazioni);

                    const span = document.createElement('span');
                    span.id = 'nota_scorr_agenda';
                    span.className = 'bluetext';

                    const attivo = isPrivacyAttiva();
                    span.style.cssText = attivo
                        ? 'cursor: zoom-in; -webkit-text-security: square; filter: blur(3px);'
                        : 'cursor: zoom-out; -webkit-text-security: none; filter: none;';

                    span.textContent = parti[posAgenda];
                    span.onclick = function() { toggleSecurity(this); };

                    notaScorr.parentNode.insertBefore(span, notaScorr.nextSibling);
                }
            }
        } catch (e) {
            console.error('Errore durante l\'oscuramento degli avvisi:', e);
        }
    }

    // Oscura i voti della griglia di valutazione
    function oscuraVoti() {
        try {
            const attivo = isPrivacyAttiva();
            const voti = document.querySelectorAll('td[evento_codice].registro_voti_riga_studente p');
            voti.forEach(voto => {
                if (!voto.dataset.privacyInit) {
                    voto.dataset.privacyInit = "true";
                    if (attivo) {
                        toggleSecurity(voto);
                    } else {
                        voto.style.webkitTextSecurity = 'none';
                        voto.style.filter = 'none';
                        voto.style.cursor = 'zoom-out';
                    }
                    //voto.onclick = function() { toggleSecurity(this); };
                }
            });
        } catch (e) {
            console.error('Errore durante l\'oscuramento dei voti:', e);
        }
    }

    // Inserisce un pulsante nell'intestazione per mostrare/nascondere tutti i dati in un click
    function aggiungiPulsantePrivacy() {
        const targetTd = document.querySelector('thead tr:last-child > td:first-child') || document.querySelector('thead tr:nth-last-child(2) > th:first-child');
        if (!targetTd || document.getElementById('btn-privacy-toggle')) return;

        const btn = document.createElement('button');
        btn.id = 'btn-privacy-toggle';
        btn.type = 'button';

        let attivo = isPrivacyAttiva();
        btn.innerHTML = attivo ? '🔒 Privacy ON' : '👁️ Privacy OFF';
        btn.style.cssText = `
            padding: 5px 12px;
            background-color: ${attivo ? '#6c757d' : '#dc3545'};
            color: #fff;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-weight: bold;
            font-size: 12px;
            margin-left: 5px;
            transition: background-color 0.2s;
        `;

        btn.onclick = () => {
            attivo = !attivo;
            setPrivacyAttiva(attivo);

            const elementi = document.querySelectorAll('td[evento_codice].registro_voti_riga_studente p, #nota_scorr_agenda');
            elementi.forEach(el => {
                if (attivo) {
                    el.style.webkitTextSecurity = 'square';
                    el.style.filter = 'blur(3px)';
                    el.style.cursor = 'zoom-in';
                } else {
                    el.style.webkitTextSecurity = 'none';
                    el.style.filter = 'none';
                    el.style.cursor = 'zoom-out';
                }
            });
            btn.innerHTML = attivo ? '🔒 Privacy ON' : '👁️ Privacy OFF';
            btn.style.backgroundColor = attivo ? '#6c757d' : '#dc3545';
        };

        targetTd.appendChild(btn);
    }

    // Esecuzione iniziale
    function applicaPrivacy() {
        oscuraAvvisi();
        oscuraVoti();
        aggiungiPulsantePrivacy();
    }

    window.addEventListener('load', applicaPrivacy);

    // Osserva eventuali aggiornamenti dinamici della pagina
    const observer = new MutationObserver(() => {
        applicaPrivacy();
    });

    observer.observe(document.body, { childList: true, subtree: true });
})();