# Homebrew cask di Remi

Distribuisce l'app macOS (non firmata) via Homebrew, rimuovendo la quarantena
così si apre al doppio clic senza il blocco Gatekeeper.

Il tap **`renato-milano/homebrew-remi`** è già creato (`Casks/remi.rb`); questo
file è la **template sorgente** tenuta nel repo principale. `remi.rb` è la copia
usata dal tap ed è aggiornata automaticamente a ogni release (vedi sotto).

## Aggiornamento automatico (CI)

Il workflow **`.github/workflows/update-homebrew.yml`** parte a ogni Release
**pubblicata**: scarica i due `.dmg` mac, calcola gli sha256 e aggiorna
`version` + `sha256` nel cask del tap, poi fa push. Niente da fare a mano.

**Setup una tantum:** crea un **Personal Access Token** con permesso di scrittura
sul repo `homebrew-remi` (fine-grained: Contents → Read/Write; oppure classic con
scope `repo`) e salvalo come secret **`HOMEBREW_TAP_TOKEN`** nel repo `remi`
(Settings → Secrets and variables → Actions). Senza il secret il job si salta.
Il `GITHUB_TOKEN` di default NON basta perché il tap è un repo separato.

Aggiornamento manuale (fallback): `shasum -a 256 Remi-mac-arm64.dmg Remi-mac-x64.dmg`,
poi aggiorna `version`/`sha256` in `Casks/remi.rb` sul tap e fai push.

## Uso lato utente

```sh
brew tap renato-milano/remi
brew trust --cask renato-milano/remi/remi
brew install --cask remi
```

Il passo `brew trust` è richiesto da Homebrew perché il cask esegue un comando
(`xattr`, per rimuovere la quarantena dell'app non firmata). Con la
notarizzazione (futura) il postflight si può togliere e `brew trust` non serve più.

Poi `Remi` compare in Applicazioni e si apre al doppio clic.
