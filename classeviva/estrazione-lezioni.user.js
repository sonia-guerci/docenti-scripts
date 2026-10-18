// ==UserScript==
// @name         ClasseViva - Estrazione Dati Lezioni
// @namespace    https://github.com/sonia-guerci/docenti-scripts
// @version      1.2.0
// @description  Estrae le lezioni di tutte le classi per la materia scelta (materie lette dalla pagina firma) ed esporta un CSV con ora inizio e durata
// @author       Sonia Guerci
// @match        https://*.spaggiari.eu/cvv/app/default/gioprof_selezione.php*
// @match        https://*.spaggiari.eu/cvv/app/default/selezione_classi.php*
// @updateURL    https://raw.githubusercontent.com/sonia-guerci/docenti-scripts/main/classeviva/estrazione-lezioni.user.js
// @downloadURL  https://raw.githubusercontent.com/sonia-guerci/docenti-scripts/main/classeviva/estrazione-lezioni.user.js
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // ==============================================================================
    // 0. ESTRAZIONE MATERIE DALLA PAGINA FIRMA (regclasse.php) DI UNA CLASSE QUALSIASI
    // ==============================================================================
    function trovaPrimaClasseId() {
        const a = document.querySelector('a[href*="regclasse.php?classe_id="]');
        if (!a) return null;
        try {
            return new URL(a.href, window.location.href).searchParams.get('classe_id');
        } catch (e) { return null; }
    }

    async function caricaMaterie(classeId) {
        const url = `https://${window.location.hostname}/cvv/app/default/regclasse.php?classe_id=${classeId}&quad=`;
        const resp = await fetch(url, { credentials: 'include' });
        const html = await resp.text();
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const materie = [];
        doc.querySelectorAll('select#materia option').forEach(opt => {
            const id = (opt.getAttribute('value') || '').trim();
            const nome = opt.textContent.trim();
            if (id) materie.push({ id, nome });
        });
        return materie;
    }

    // ==============================================================================
    // 1. CREAZIONE INTERFACCIA UTENTE (UI)
    // ==============================================================================
    const panel = document.createElement('div');
    panel.style.position = 'fixed';
    panel.style.top = '10px';
    panel.style.right = '10px';
    panel.style.backgroundColor = '#ffffff';
    panel.style.border = '2px solid #cc0000';
    panel.style.padding = '15px';
    panel.style.zIndex = '9999';
    panel.style.boxShadow = '0 4px 8px rgba(0,0,0,0.2)';
    panel.style.borderRadius = '8px';
    panel.style.fontFamily = 'Arial, sans-serif';

    panel.innerHTML = `
        <h3 style="margin-top:0; color:#cc0000; font-size:14px;">Estrazione Dati Lezioni</h3>
        <label style="font-size:12px;">Seleziona Materia:</label><br>
        <select id="tm-materie" style="width:100%; margin:5px 0; padding:4px;">
            <option value="">Caricamento materie...</option>
        </select><br>
        <button id="tm-start-btn" disabled style="background-color:#cc0000; color:white; border:none; padding:8px 12px; cursor:pointer; width:100%; border-radius:4px; font-weight:bold; margin-top:5px;">Avvia Scansione</button>
        <p id="tm-status" style="font-size:11px; margin-bottom:0; margin-top:8px; color:#666;"></p>
    `;

    document.body.appendChild(panel);

    (async () => {
        const selMat = document.getElementById('tm-materie');
        const btnStart = document.getElementById('tm-start-btn');
        const st = document.getElementById('tm-status');
        const cid = trovaPrimaClasseId();
        if (!cid) {
            selMat.innerHTML = '<option value="">Nessuna classe trovata</option>';
            st.innerText = "Errore: nessun link a regclasse.php trovato nella pagina.";
            return;
        }
        try {
            const materie = await caricaMaterie(cid);
            if (materie.length === 0) {
                selMat.innerHTML = '<option value="">Nessuna materia rilevata</option>';
                st.innerText = "Nessuna materia trovata nella pagina firma.";
                return;
            }
            selMat.innerHTML = materie.map(m => `<option value="${m.id}">${m.nome}</option>`).join('');
            st.innerText = `${materie.length} materie caricate.`;
            btnStart.disabled = false;
        } catch (e) {
            console.error(e);
            selMat.innerHTML = '<option value="">Errore caricamento</option>';
            st.innerText = "Errore nel caricamento delle materie.";
        }
    })();

    // ==============================================================================
    // 2. FUNZIONE PRINCIPALE DI ESTRAZIONE E SCRAPING
    // ==============================================================================
    document.getElementById('tm-start-btn').addEventListener('click', async () => {
        const btn = document.getElementById('tm-start-btn');
        const status = document.getElementById('tm-status');
        const materiaSelezionata = document.getElementById('tm-materie').value;
        const nomeMateriaSelezionata = document.getElementById('tm-materie').options[document.getElementById('tm-materie').selectedIndex].text;

        if (!materiaSelezionata) {
            alert("Nessuna materia valida selezionata!");
            return;
        }

        btn.disabled = true;
        btn.style.backgroundColor = '#999';

        // Estrazione dinamica classi (ID e Nome)
        const linksClassi = document.querySelectorAll('a[href^="regclasse.php?classe_id="]');
        const classiMap = new Map();
        const ELENCO_CLASSI = [];

        linksClassi.forEach(a => {
            try {
                const urlObj = new URL(a.href, window.location.href);
                const cid = urlObj.searchParams.get("classe_id");
                if (cid && !classiMap.has(cid)) {
                    // Prendi i primi 5 caratteri del nome classe
                    const nomeClasse = a.textContent.trim().substring(0, 5);
                    classiMap.set(cid, nomeClasse);
                    ELENCO_CLASSI.push(cid);
                }
            } catch (e) {}
        });

        if (ELENCO_CLASSI.length === 0) {
            status.innerText = "Errore: Nessuna classe trovata.";
            btn.disabled = false;
            btn.style.backgroundColor = '#cc0000';
            return;
        }

        status.innerText = `Trovate ${ELENCO_CLASSI.length} classi. Avvio...`;

        const generaUrl = (classeId, materiaId) =>
            `https://${window.location.hostname}/cvv/app/default/gioprof.php?classe_id=${classeId}&materia=${materiaId}&ope=LEZ&codocenza=1&gruppo_id=`;

        // Modificata l'intestazione CSV (divisa Ora Inizio e Durata)
        let risultati = [
            ["Classe ID", "Materia ID", "Classe", "Materia", "Data", "Ora Inizio", "Durata", "Docente", "Tipo Attivita", "Argomento"]
        ];

        for (let c of ELENCO_CLASSI) {
            const url = generaUrl(c, materiaSelezionata);
            const nomeClasseBreve = classiMap.get(c) || c;

            // Mostra prime 5 lettere nel progresso
            status.innerText = `Scansione: ${nomeClasseBreve} | ${nomeMateriaSelezionata.substring(0, 10)}...`;

            try {
                const response = await fetch(url);
                const htmlText = await response.text();

                const parser = new DOMParser();
                const doc = parser.parseFromString(htmlText, 'text/html');
                const tabella = doc.querySelector("#sort_table");

                if (!tabella) continue;

                const righe = tabella.querySelectorAll("tr");

                righe.forEach(riga => {
                    const celle = riga.querySelectorAll("td, th");
                    if (celle.length >= 6) {
                        const classeTxt = celle[0].textContent.trim();
                        const materiaTxt = celle[1].textContent.trim();
                        const giornoTxt = celle[2].textContent.trim();
                        const docenteTxt = celle[4].textContent.trim();
                        const oraGrezzaTxt = celle[3].textContent.trim();

                        // Divisione Ora Inizio e Durata (es. "1^(5)" -> Inizio: 1, Durata: 5)
                        let oraInizio = oraGrezzaTxt;
                        let durata = "1"; // Default 1 ora
                        const matchOra = oraGrezzaTxt.match(/^(\d+)(?:\^\((\d+)\))?/);
                        if (matchOra) {
                            oraInizio = matchOra[1];
                            if (matchOra[2]) {
                                durata = matchOra[2];
                            }
                        }

                        const cellaArg = celle[5];
                        const spanNota = cellaArg.querySelector(".nota_1");
                        const argomentoTxt = spanNota ? spanNota.textContent.trim() : cellaArg.textContent.trim();

                        const spanAttivita = cellaArg.querySelector(".attivita");
                        const attivitaTxt = spanAttivita ? spanAttivita.textContent.trim() : "";

                        if(classeTxt != 'Classe') {
                            risultati.push([
                                c, materiaSelezionata, classeTxt, materiaTxt, giornoTxt, oraInizio, durata, docenteTxt, attivitaTxt, argomentoTxt
                            ]);
                        }
                    }
                });
            } catch (e) {
                console.error(`[!] Errore Classe ${c}:`, e);
            }

            // Pausa anti-blocco
            await new Promise(resolve => setTimeout(resolve, 300));
        }

        // ==============================================================================
        // 3. GENERAZIONE E DOWNLOAD CSV
        // ==============================================================================
        if (risultati.length > 1) {
            const csvContent = risultati.map(riga =>
                riga.map(val => `"${String(val).replace(/\r?\n|\r/g, " ").replace(/"/g, '""')}"`).join(";")
            ).join("\r\n");

            const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
            const blobUrl = URL.createObjectURL(blob);

            let link = document.createElement("a");
            link.setAttribute("href", blobUrl);
            link.setAttribute("download", `Report_Lezioni_${nomeMateriaSelezionata}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(blobUrl);

            status.innerText = `Download CSV pronto (${risultati.length - 1} righe).`;
        } else {
            status.innerText = "⚠️ Nessun dato trovato per questa materia.";
        }

        btn.disabled = false;
        btn.style.backgroundColor = '#cc0000';
    });
})();
