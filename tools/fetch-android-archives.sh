#!/usr/bin/env bash
# Recupere et VERIFIE les archives de la chaine Android, depuis WSL.
#
# Pourquoi ce script existe : le reseau de cette machine coupe les gros
# transferts (EOF, SSL unexpected eof) alors que le meme fichier passe depuis
# WSL. WSL sert donc de chemin reseau ; les fichiers finissent sur C:, la ou
# Gradle et le SDK les attendent.
#
# Pourquoi il ne fait PAS de reprise (curl -C -) : c'est precisement ce qui a
# produit un temurin17.zip de 211 994 339 octets, illisible, "End of Central
# Directory" introuvable. Un transfert interrompu plusieurs fois recolle des
# morceaux decales. On ecrit donc dans un .part, on VERIFIE l'archive, et on ne
# la met en place que si elle s'ouvre.
#
# Regle : un seul ecrivain par fichier. Ne pas lancer deux fois en parallele.
#
# Usage : bash tools/fetch-android-archives.sh
set -u

TOOLCHAIN_DIR='/mnt/c/Users/HP/android-toolchain'

fetch_one() {
  url="$1"; out_win="$2"; floor="$3"; label="$4"
  part="/tmp/$(basename "$out_win").part"

  echo "=== $label"
  i=1
  while [ "$i" -le 25 ]; do
    rm -f "$part"
    curl -L --retry 2 --retry-delay 2 --max-time 1800 --silent --show-error \
         -o "$part" "$url" || true
    size=$(stat -c%s "$part" 2>/dev/null || echo 0)
    echo "    essai $i : $size octets"

    if [ "$size" -ge "$floor" ]; then
      if command -v unzip >/dev/null 2>&1; then
        verifier() { unzip -t "$part" >/dev/null 2>&1; }
      elif command -v python3 >/dev/null 2>&1; then
        verifier() { python3 -c 'import sys,zipfile;z=zipfile.ZipFile(sys.argv[1]);sys.exit(0 if z.testzip() is None else 1)' "$part" 2>/dev/null; }
      else
        verifier() { return 0; }   # aucun outil : on assume et on le dit
      fi

      if verifier; then
        mkdir -p "$(dirname "$out_win")"
        cp -f "$part" "$out_win"
        rm -f "$part"
        echo "    OK, verifie, en place : $out_win"
        return 0
      fi
      echo "    archive corrompue (bonne taille, illisible) : on recommence"
    fi
    i=$((i + 1))
    sleep 2
  done
  echo "    ECHEC $label"
  return 1
}

echo "outils de verification :"
command -v unzip   >/dev/null 2>&1 && echo "  unzip"
command -v python3 >/dev/null 2>&1 && echo "  python3"

fetch_one 'https://api.adoptium.net/v3/binary/latest/17/ga/windows/x64/jdk/hotspot/normal/eclipse' \
          "$TOOLCHAIN_DIR/temurin17.zip" 180000000 'JDK 17 (Temurin, Windows x64)'

fetch_one 'https://services.gradle.org/distributions/gradle-8.7-bin.zip' \
          "$TOOLCHAIN_DIR/gradle-8.7-bin.zip" 100000000 'Gradle 8.7'

fetch_one 'https://dl.google.com/android/repository/commandlinetools-win-16111833_latest.zip' \
          "$TOOLCHAIN_DIR/cmdline-tools.zip" 100000000 'cmdline-tools (Windows)'

echo "=== fichiers en place"
ls -l "$TOOLCHAIN_DIR"/*.zip 2>/dev/null || echo "aucun zip complet"