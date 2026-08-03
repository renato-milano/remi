cask "remi" do
  arch arm: "arm64", intel: "x64"

  version "0.1.0"
  # Riempi gli sha256 a ogni release (o automatizzali dalla CI, vedi README).
  sha256 arm:   "REPLACE_WITH_ARM64_DMG_SHA256",
         intel: "REPLACE_WITH_X64_DMG_SHA256"

  url "https://github.com/renato-milano/remi/releases/download/v#{version}/Remi-#{version}-#{arch}.dmg",
      verified: "github.com/renato-milano/remi/"
  name "Remi"
  desc "Compagno AI personale local-first e autonomo"
  homepage "https://github.com/renato-milano/remi"

  app "Remi.app"

  # L'app non è firmata/notarizzata: Homebrew di default mette in quarantena.
  # Rimuoviamo l'attributo così Gatekeeper non la blocca e si apre al doppio clic.
  postflight do
    system_command "/usr/bin/xattr",
                   args: ["-dr", "com.apple.quarantine", "#{appdir}/Remi.app"],
                   sudo: false
  end

  uninstall quit: "com.holyn.remi"

  zap trash: [
    "~/Library/Application Support/Remi",
    "~/Library/Preferences/com.holyn.remi.plist",
    "~/Library/Saved Application State/com.holyn.remi.savedState",
  ]
end
