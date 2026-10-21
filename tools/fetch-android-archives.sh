#!/usr/bin/env bash
# Recupere et VERIFIE les archives de la chaine Android, depuis WSL.
#
# Pourquoi WSL : le reseau de cette machine coupe les gros transferts cote
# Windows (EOF, SSL unexpected eof) alors que le meme fichier passe depuis WSL.
# WSL sert donc de chemin reseau ; les fichiers finissent sur C:, la ou Gradle
# et le SDK les attendent. Rien ne s'installe dans WSL.
#
# Pourquoi par tranches de 4 Mo (tools/fetch-chunked.sh) : une reprise classique
# (`curl -C -`) a produit un temurin17.zip de 211 994 339 octets, illisible
# ("End of Central Directory" introuvable). Ici chaque tranche est demandee par
# plage d'octets et verifiee a l'octet pres, donc aucun decalage n'est possible.
#
# Regle : un seul ecrivain par fichier. Ne pas lancer deux fois en parallele.
#
# Usage : bash tools/fetch-android-archives.sh
set -u

TOOLCHAIN_DIR='/mnt/c/Users/HP/android-toolchain'
ICI="$(cd "$(dirname "$0")" && pwd)"

echo "outils de verification :"
command -v unzip   >/dev/null 2>&1 && echo "  unzip"
command -v python3 >/dev/null 2>&1 && echo "  python3"

code=0

bash "$ICI/fetch-chunked.sh" \
  'https://api.adoptium.net/v3/binary/latest/17/ga/windows/x64/jdk/hotspot/normal/eclipse' \
  "$TOOLCHAIN_DIR/temurin17.zip" 180000000 || code=1

bash "$ICI/fetch-chunked.sh" \
  'https://services.gradle.org/distributions/gradle-8.7-bin.zip' \
  "$TOOLCHAIN_DIR/gradle-8.7-bin.zip" 100000000 || code=1

bash "$ICI/fetch-chunked.sh" \
  'https://dl.google.com/android/repository/commandlinetools-win-16111833_latest.zip' \
  "$TOOLCHAIN_DIR/cmdline-tools.zip" 100000000 || code=1

echo "=== fichiers en place"
ls -l "$TOOLCHAIN_DIR"/*.zip 2>/dev/null || echo "aucun zip"
echo "=== code de sortie global : $code"
exit $code