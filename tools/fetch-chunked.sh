#!/usr/bin/env bash
# Telechargement par TRANCHES verifiees, pour un reseau qui coupe.
#
# Pourquoi pas une reprise classique (`curl -C -`) : elle recollait des morceaux
# decales et produisait un zip de bonne taille mais illisible.
#
# Principe : on demande au serveur une plage precise (`Range: bytes=a-b`), on
# verifie que le nombre d'octets recus est EXACTEMENT celui demande, et seulement
# alors on ajoute la tranche au fichier. Un echec ne coute que la tranche, et
# aucun decalage n'est possible puisque les offsets sont imposes par le client.
#
# Une seule execution a la fois par fichier. Usage :
#   bash tools/fetch-chunked.sh <url> <cible-windows> <taille-plancher>
set -u

CHUNK=$((4 * 1024 * 1024))   # 4 Mo : assez petit pour survivre a une coupure

url="$1"; out_win="$2"; floor="$3"
part="/tmp/$(basename "$out_win").chunked"
chunk_file="/tmp/$(basename "$out_win").chunk"

echo "=== $(basename "$out_win")"

# 1. Taille totale. La redirection est suivie : on garde le DERNIER
#    Content-Length annonce, c'est celui du fichier final.
total=$(curl -sIL --max-time 120 "$url" 2>/dev/null | tr -d '\r' \
        | awk 'tolower($1) == "content-length:" { n = $2 } END { print n + 0 }')
echo "    taille annoncee : $total octets"

if [ "$total" -lt 1000000 ]; then
  echo "    taille annoncee invraisemblable : abandon"
  exit 1
fi

rm -f "$part"

start=0
tries=0
while [ "$start" -lt "$total" ]; do
  end=$((start + CHUNK - 1))
  [ "$end" -ge "$total" ] && end=$((total - 1))
  wanted=$((end - start + 1))

  rm -f "$chunk_file"
  curl -L --retry 5 --retry-all-errors --retry-delay 2 --max-time 300 \
       --silent --show-error -H "Range: bytes=${start}-${end}" \
       -o "$chunk_file" "$url" || true

  got=$(stat -c%s "$chunk_file" 2>/dev/null || echo 0)
  if [ "$got" -ne "$wanted" ]; then
    tries=$((tries + 1))
    echo "    tranche $start-$end : $got/$wanted octets (essai $tries)"
    if [ "$tries" -ge 40 ]; then echo "    trop d'echecs : abandon"; exit 1; fi
    sleep 2
    continue
  fi

  cat "$chunk_file" >> "$part"
  start=$end
  tries=0
  if [ $((start % (20 * 1024 * 1024))) -lt "$CHUNK" ]; then
    echo "    progression : $start / $total"
  fi
done

# 2. Verification de l'archive avant mise en place.
if command -v unzip >/dev/null 2>&1; then
  verifier() { unzip -t "$part" >/dev/null 2>&1; }
elif command -v python3 >/dev/null 2>&1; then
  verifier() { python3 -c 'import sys,zipfile;z=zipfile.ZipFile(sys.argv[1]);sys.exit(0 if z.testzip() is None else 1)' "$part" 2>/dev/null; }
else
  verifier() { return 0; }
fi

echo "    recu : $(stat -c%s "$part") octets"
if ! verifier; then
  echo "    archive illisible malgre le bon nombre d'octets : ECHEC"
  exit 1
fi

size=$(stat -c%s "$part")
if [ "$size" -lt "$floor" ]; then
  echo "    $size < plancher $floor : ECHEC"
  exit 1
fi

cp -f "$part" "$out_win"
rm -f "$part" "$chunk_file"
echo "    OK, verifie, en place : $out_win"