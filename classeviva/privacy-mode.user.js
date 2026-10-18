// ==UserScript==
// @name         ClasseViva - Privacy mode
// @namespace    https://github.com/sonia-guerci/docenti-scripts
// @version      1.1.0
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

    const CLASSE = 'cv-privacy-on';
    const STORAGE_KEY = 'cv_privacy_active';

    // L'oscuramento è solo CSS: nessuno stile inline sui singoli voti, quindi nessun cursore alterato
    const style = document.createElement('style');
    style.textContent = `
        .${CLASSE} td[evento_codice].registro_voti_riga_studente p,
        .${CLASSE} #nota_scorr_agenda:not([data-stato="visibile"]),
        #nota_scorr_agenda[data-stato="nascosto"] {
            -webkit-text-security: square;
            filter: blur(3px);
        }
        #nota_scorr_agenda { cursor: zoom-out; }
        .${CLASSE} #nota_scorr_agenda:not([data-stato="visibile"]),
        #nota_scorr_agenda[data-stato="nascosto"] { cursor: zoom-in; }
    `;
    document.head.appendChild(style);

    function isPrivacyAttiva() {
        return localStorage.getItem(STORAGE_KEY) !== 'false';
    }

    function setPrivacyAttiva(valore) {
        localStorage.setItem(STORAGE_KEY, valore);
        document.documentElement.classList.toggle(CLASSE, valore);
    }

    document.documentElement.classList.toggle(CLASSE, isPrivacyAttiva());

    // Oscura le note e gli avvisi presenti nel banner scorrevole
    function oscuraAvvisi() {
        const notaScorr = document.querySelector('p#nota_classe_scorr>span');
        if (!notaScorr || document.getElementById('nota_scorr_agenda')) return;

        const comunicazioni = notaScorr.querySelector(':scope>a');
        const posAgenda = comunicazioni ? 1 : 0;

        const text = notaScorr.textContent;
        const parti = text.split('---\n');
        if (text === '' || parti.length <= posAgenda) return;

        notaScorr.innerHTML = '';
        if (comunicazioni) notaScorr.appendChild(comunicazioni);

        const span = document.createElement('span');
        span.id = 'nota_scorr_agenda';
        span.className = 'bluetext';
        span.textContent = parti[posAgenda];
        // Il click inverte lo stato corrente dell'avviso, in entrambe le modalità, senza toccare quello globale
        span.addEventListener('click', () => {
            const oscurato = getComputedStyle(span).filter !== 'none';
            span.dataset.stato = oscurato ? 'visibile' : 'nascosto';
        });

        notaScorr.parentNode.insertBefore(span, notaScorr.nextSibling);
    }

    // Pulsante per mostrare/nascondere tutti i dati
    function aggiungiPulsantePrivacy() {
        if (document.getElementById('btn-privacy-toggle')) return;
        const targetTd = document.querySelector('thead tr:last-child > td:first-child') || document.querySelector('thead tr:nth-last-child(2) > th:first-child');
        if (!targetTd) return;

        const btn = document.createElement('button');
        btn.id = 'btn-privacy-toggle';
        btn.type = 'button';
        btn.style.cssText = `
            padding: 5px 12px;
            color: #fff;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-weight: bold;
            font-size: 12px;
            margin-left: 5px;
            transition: background-color 0.2s;
        `;

        const aggiorna = attivo => {
            btn.textContent = attivo ? '🔒 Privacy ON' : '👁️ Privacy OFF';
            btn.style.backgroundColor = attivo ? '#6c757d' : '#dc3545';
        };
        aggiorna(isPrivacyAttiva());

        btn.addEventListener('click', () => {
            const attivo = !isPrivacyAttiva();
            setPrivacyAttiva(attivo);
            aggiorna(attivo);
            // Azzera eventuali rivelazioni manuali dell'avviso
            const agenda = document.getElementById('nota_scorr_agenda');
            if (agenda) delete agenda.dataset.stato;
        });

        targetTd.appendChild(btn);
    }

    function applicaPrivacy() {
        oscuraAvvisi();
        aggiungiPulsantePrivacy();
    }

    // Debounce: una sola esecuzione per frame anche con molte mutazioni
    let pianificato = false;
    new MutationObserver(() => {
        if (pianificato) return;
        pianificato = true;
        requestAnimationFrame(() => {
            pianificato = false;
            applicaPrivacy();
        });
    }).observe(document.body, { childList: true, subtree: true });

    applicaPrivacy();
})();