# 📜 Script & Utility Web per Docenti

![License](https://img.shields.io/badge/license-MIT-purple.svg)
![Type](https://img.shields.io/badge/Tipo-UserScripts%20%26%20Bookmarklets-blue.svg)

Una raccolta di script gratuiti e Open Source per velocizzare le operazioni quotidiane sulle piattaforme scolastiche e sui registri elettronici (**ClasseViva**, **Unica**, **Google Classroom**, ecc.).

---

## 🛠️ Come utilizzare gli script

Puoi scegliere tra **3 modalità** in base ai permessi del tuo browser e al computer utilizzato:

### ⚡ Opzione A: Con Tampermonkey (Consigliata per uso quotidiano)
* **Vantaggi**: Gli script si eseguono automaticamente all'apertura della pagina e si aggiornano da soli.
1. Installa l'estensione gratuita **[Tampermonkey](https://www.tampermonkey.net/)** sul tuo browser (Chrome, Edge, Firefox, Brave).
2. Clicca su **"⚡ Installa Script"** nella tabella del catalogo.
3. Conferma cliccando su **"Installa"** nella scheda di Tampermonkey.

### 🔖 Opzione B: Bookmarklet (Barra Preferiti — Zero installazioni)
* **Vantaggi**: Funziona su qualsiasi PC (anche sui computer della scuola con blocchi alle estensioni).
1. Mostra la **Barra dei Segnalibri/Preferiti** del tuo browser (`Ctrl+Shift+B` o `Cmd+Shift+B`).
2. Crea un nuovo segnalibro, chiamalo (es. *📋 Copia Studenti*) e incolla il codice `javascript:` fornito nello script.
3. Quando sei sulla pagina del registro o di Unica, fai un click sul segnalibro per attivarlo.

### 🛠️ Opzione C: Snippet DevTools (Console del Browser)
* **Vantaggi**: Ideale per test rapidi o per chi vuole eseguire il codice una tantum senza installazioni visibili.
1. Apri la pagina target e premi **F12** (o click destro -> *Ispeziona*).
2. Vai nella scheda **Sorgenti / Sources** -> **Snippet** (o *Frammenti*).
3. Clicca su **"+ Nuovo snippet"**, incolla il codice JavaScript completo dello script e premi **Ctrl + Invio** (o l'icona Play ▶️) per eseguirlo.

---

## 🧰 Catalogo Script Disponibili

### 🎓 1. Unica Ministero (`/unica`)

| Script | Descrizione | Pagina Target | Tampermonkey | Bookmarklet / Snippet |
| :--- | :--- | :--- | :---: | :---: |
| **Estrazione Esiti e Dashboard CSV** | Inietta una toolbar nella sezione Studenti per estrarre in automatico esiti di Terza Media, stato Capolavori, autovalutazione, bocciature e storico scuole, generando un report `.csv` compatibile con Excel. | Tab Studenti Unica (`unica.istruzione.gov.it`) | [⚡ Installa Script](https://raw.githubusercontent.com/sonia-guerci/docenti-scripts/main/unica/riepiloga-esporta-csv.user.js) | [📜 Codice Sorgente](https://github.com/sonia-guerci/docenti-scripts/blob/main/unica/riepiloga-esporta-csv.user.js) |

*(Nota: Se preferisci l'estensione integrata con icona ufficiale per Chrome al posto dello script, trovi [UnicaExt sul Chrome Web Store](https://chromewebstore.google.com/detail/faofjmakfckhdjmhlkbkgpcfhgkdpepe)).*

---

### 📊 2. Spaggiari / ClasseViva (`/classeviva`)


| Script | Descrizione | Pagina Target | Tampermonkey | Bookmarklet / Snippet |
| :--- | :--- | :--- | :---: | :---: |
| **Copia Studenti Excel** | Aggiunge un pulsante nell'intestazione del registro per copiare l'elenco della classe in Capital Case (`Cognome Nome`) pronto per essere incollato su Excel. | **Registro di Classe** (`*.spaggiari.eu/cvv/app/default/regclasse.php`) | [⚡ Installa Script](https://raw.githubusercontent.com/sonia-guerci/docenti-scripts/main/classeviva/copia-studenti-excel.user.js) | [📜 Codice Sorgente](https://github.com/sonia-guerci/docenti-scripts/blob/main/classeviva/copia-studenti-excel.user.js) |
| **Estrazione Dati Lezioni** | Aggiunge un pannello per esportare tutte le lezioni di tutte le classi. La materia viene scelta da un elenco creato in automatico. Viene generato un report `.csv` compatibile con Excel con data, ora di inizio, durata, tipo di attività e argomento. | **Le mie classi** (`*.spaggiari.eu/cvv/app/default/gioprof_selezione.php`) <br> **Tutte le classi** (`*.spaggiari.eu/cvv/app/default/selezione_classi.php`)| [⚡ Installa Script](https://raw.githubusercontent.com/sonia-guerci/docenti-scripts/main/classeviva/estrazione-lezioni.user.js) | [📜 Codice Sorgente](https://github.com/sonia-guerci/docenti-scripts/blob/main/classeviva/estrazione-lezioni.user.js) |
| **Privacy Mode** | Oscura voti, note e avvisi per la proiezione in classe con un click e memorizza lo stato (`ON/OFF`) durante la navigazione. | **Registro di Classe** (`*.spaggiari.eu/cvv/app/default/regclasse.php`) <br> **Valutazioni** <br> (`*.spaggiari.eu/cvv/app/default/regvoti.php`) | [⚡ Installa Script](https://raw.githubusercontent.com/sonia-guerci/docenti-scripts/main/classeviva/privacy-mode.user.js) | [📜 Codice Sorgente](https://github.com/sonia-guerci/docenti-scripts/blob/main/classeviva/privacy-mode.user.js) |


*(Nota: Funzionano anche sugli anni scolastici precedenti (`web25`, `web24`, ecc.)*

---

### 🏫 3. Google Classroom (`/classroom`)

| Script | Descrizione | Pagina Target | Installazione |
| :--- | :--- | :--- | :---: |
| *[In arrivo]* | *Prossime utility in sviluppo...* | `classroom.google.com` | - |

---

## 🔒 Privacy e Sicurezza
* **100% Client-Side**: Tutti gli script eseguono l'elaborazione esclusivamente all'interno del browser dell'utente.
* **Zero Tracciamento**: Nessun dato personale (PII), codice fiscale o dato scolastico viene salvato o inviato a server terzi.
* **Open Source**: Il codice è interamente consultabile, trasparentemente ispezionabile e modificabile prima dell'uso.
