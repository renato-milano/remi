# Asset del personaggio

## Placeholder attuale
Il PoC gira con un **personaggio SVG procedurale** (`renderer/character.js`): respira, sbatte
le palpebre e cambia posa/aura in base allo stato dell'agente. Non serve alcun asset.

## Passare a Rive (drop-in)
1. Installa il runtime:
   ```sh
   pnpm --filter @openmate/ui add @rive-app/canvas
   ```
2. In `renderer/index.html` scommenta lo script:
   ```html
   <script src="../node_modules/@rive-app/canvas/rive.js"></script>
   ```
3. Metti il tuo file qui: **`assets/character.riv`**.

Al riavvio, l'app rileva l'asset (via preload) e usa Rive al posto dell'SVG — senza
altre modifiche al codice.

## Contratto di stato del file `.riv`
Il file deve esporre:
- una **state machine** chiamata `State`;
- un **input numerico** `state` con la mappatura:

| valore | stato agente |
|---|---|
| 0 | idle |
| 1 | thinking |
| 2 | acting |
| 3 | sleeping |
| 4 | waiting_approval |

`renderer/character-rive.js` imposta `state` ad ogni evento `state` ricevuto dal daemon.
Puoi trovare file `.riv` di esempio nella community di [rive.app](https://rive.app).
