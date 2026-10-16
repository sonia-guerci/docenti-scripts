// ==UserScript==
// @name         ClasseViva - Copia Studenti per Excel
// @namespace    https://github.com/sonia-guerci/docenti-scripts
// @version      1.0.0
// @description  Aggiunge un pulsante nel registro di classe per copiare i nomi in Capital Case pronti per Excel
// @author       Sonia Guerci
// @match        https://web.spaggiari.eu/cvv/app/default/regclasse.php*
// @updateURL    https://raw.githubusercontent.com/sonia-guerci/docenti-scripts/main/classeviva/copia-studenti-excel.user.js
// @downloadURL  https://raw.githubusercontent.com/sonia-guerci/docenti-scripts/main/classeviva/copia-studenti-excel.user.js
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // Seleziona il primo td dell'ultimo tr presente nel thead
    const targetTd = document.querySelector('thead tr:last-child > td:first-child');
    if (!targetTd || document.getElementById('btn-excel-spag')) return;

    targetTd.style.padding = '4px 8px';
    targetTd.style.verticalAlign = 'middle';

    const btn = document.createElement('button');
    btn.id = 'btn-excel-spag';
    btn.type = 'button';
    btn.innerHTML = '📋 Copia Studenti Excel';
    btn.style.cssText = `
        padding: 5px 12px;
        background-color: #28a745;
        color: #fff;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-weight: bold;
        font-size: 12px;
        transition: background-color 0.2s;
    `;

    btn.onmouseover = () => btn.style.backgroundColor = '#218838';
    btn.onmouseout = () => btn.style.backgroundColor = '#28a745';

    btn.onclick = async () => {
        const nodi = document.querySelectorAll('td.elenco_studenti > div:first-child');
        
        if (nodi.length === 0) {
            alert('Nessun studente trovato!');
            return;
        }

        const testi = Array.from(nodi, el => 
            el.innerText
                .trim()
                .toLowerCase()
                .replace(/(^|\s)\S/g, l => l.toUpperCase())
        ).join('\n');

        try {
            await navigator.clipboard.writeText(testi);
            const orig = btn.innerHTML;
            btn.innerHTML = `✅ Copiati ${nodi.length}!`;
            btn.style.backgroundColor = '#007bff';
            setTimeout(() => {
                btn.innerHTML = orig;
                btn.style.backgroundColor = '#28a745';
            }, 2500);
        } catch (err) {
            alert('Errore copia: ' + err);
        }
    };

    targetTd.appendChild(btn);
})();
