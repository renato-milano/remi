# Homebrew cask di Remi

Distribuisce l'app macOS (non firmata) via Homebrew, rimuovendo la quarantena
così si apre al doppio clic senza il blocco Gatekeeper.

## Setup una tantum del tap

1. Crea un repo pubblico GitHub chiamato **`homebrew-remi`** sotto l'utente `renato-milano`
   (il prefisso `homebrew-` è obbligatorio per i tap).
2. Copiaci dentro questo file come `Casks/remi.rb`.

## A ogni release

Dopo che la CI ha pubblicato i `.dmg` sulla Release `vX.Y.Z`:

1. Aggiorna `version` nel cask.
2. Calcola gli sha256 dei due DMG e mettili in `sha256 arm:/intel:`:
   ```sh
   shasum -a 256 Remi-X.Y.Z-arm64.dmg Remi-X.Y.Z-x64.dmg
   ```
3. Commit + push sul tap.

> Automazione (consigliata): un job CI che, a release pubblicata, scarica i DMG,
> calcola gli sha256 e apre una PR sul repo `homebrew-remi`.

## Uso lato utente

```sh
brew tap renato-milano/remi
brew install --cask remi
```

Poi `Remi` compare in Applicazioni e si apre al doppio clic.
