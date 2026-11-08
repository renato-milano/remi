# @openmate/scene3d

Modelli 3D che Remi costruisce durante la conversazione.

Il modello scrive nella risposta una frase e poi un blocco
`<scene3d>{…}</scene3d>` con una scena JSON: materiali con nome e nodi fatti di
forme semplici (box, cilindri, solidi di rivoluzione, lastre, schiere di pale…),
con ripetizioni, specchiature, etichette, sezione e parti rotanti.

- `src/guide.ts`: la guida per il modello (va nel prompt di sistema) ed è la
  specifica del formato.
- `src/schema.ts`: validazione con il percorso JSON di ogni errore.
- `src/stream.ts`: parser in streaming. Emette l'intestazione appena inizia
  `nodes` e ogni nodo appena è chiuso; scarta i nodi non validi.
- `examples/`: jet e scheda elettronica scritti a mano nel formato.

Il percorso completo: il core (`CognitiveLoop`) passa il testo del modello al
parser, toglie il blocco dalla risposta ed emette eventi `scene3d`; il daemon li
inoltra; Electron li manda alla finestra 3D (`apps/ui/scene3d/`, bundle in
`renderer/build/scene3d.js`), che costruisce il modello parte per parte.

Prove: `pnpm --filter @openmate/scene3d test` e, per la finestra,
`pnpm --filter @openmate/ui test:scene3d` (richiede Google Chrome).
