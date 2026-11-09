#!/usr/bin/env bash
# Compila whisper-server (whisper.cpp) come binario unico per la trascrizione
# locale della voce. Output: apps/ui/build/whisper/whisper-server[.exe], che
# electron-builder include nell'app (extraResources) e il daemon avvia.
#
# Versione fissata: la v1.9.x non compila gli shader Metal su macOS 14
# (errore bfloat "constexpr" all'avvio → crash). La v1.8.2 funziona.
# Richiede: git, cmake, un compilatore C++ (Xcode CLT / MSVC / gcc).
set -euo pipefail

VERSION="${WHISPER_VERSION:-v1.8.2}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/apps/ui/build/whisper"
WORK="${TMPDIR:-/tmp}/remi-whisper-$VERSION"

if [ ! -d "$WORK" ]; then
  git clone --quiet --depth 1 --branch "$VERSION" https://github.com/ggml-org/whisper.cpp "$WORK"
fi

# statico: un solo file da distribuire; su macOS gli shader Metal sono incorporati.
# GGML_NATIVE=OFF: niente ottimizzazioni per la CPU di chi compila (il binario deve
# girare sui computer degli utenti). CMAKE_OSX_ARCHITECTURES="arm64;x86_64" → universale.
cmake -S "$WORK" -B "$WORK/build" -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_MSVC_RUNTIME_LIBRARY=MultiThreaded -DGGML_OPENMP=OFF -DBUILD_SHARED_LIBS=OFF -DWHISPER_BUILD_TESTS=OFF -DGGML_METAL_EMBED_LIBRARY=ON -DGGML_NATIVE=OFF \
  ${CMAKE_OSX_ARCHITECTURES:+-DCMAKE_OSX_ARCHITECTURES=$CMAKE_OSX_ARCHITECTURES} > /dev/null
cmake --build "$WORK/build" --config Release --target whisper-server -j > /dev/null

mkdir -p "$OUT"
BIN="$WORK/build/bin/whisper-server"
[ -f "$BIN" ] || BIN="$WORK/build/bin/Release/whisper-server.exe"
cp "$BIN" "$OUT/"
cp "$WORK/LICENSE" "$OUT/LICENSE-whisper.txt"
"$OUT/$(basename "$BIN")" --help > /dev/null 2>&1
echo "whisper-server $VERSION → $OUT/$(basename "$BIN")"
