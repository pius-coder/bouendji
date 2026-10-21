# Telechargement par tranches verifiees, cote Windows, sans WSL.
#
# Pourquoi par tranches : ce reseau coupe les gros transferts (EOF, handshake
# TLS). Une reprise classique (`curl -C -`) recolle des morceaux decales et
# produit une archive de bonne taille mais illisible. Ici on demande au serveur
# une plage precise (`Range: bytes=a-b`), on verifie que le nombre d'octets recus
# est EXACTEMENT celui demande, et seulement alors on l'ajoute au fichier. Aucun
# decalage n'est possible : les offsets sont imposes par le client.
#
# Le fichier `.part` sert d'etat : relancer le script reprend ou il s'est arrete.
# L'archive n'est mise en place qu'apres ouverture reussie (test du zip).
#
# Aucun accent dans ce fichier : PowerShell 5.1 lit un .ps1 sans BOM en ANSI.

param(
    [Parameter(Mandatory = $true)][string]$Url,
    [Parameter(Mandatory = $true)][string]$Target,
    [Parameter(Mandatory = $false)][int64]$Floor = 100000000,
    [Parameter(Mandatory = $false)][int]$ChunkBytes = 8388608,   # 8 Mo
    # Secours si la sonde de taille echoue : la taille annoncee par le serveur,
    # mesuree a la main. Elle n'est pas crue sur parole : l'archive doit s'ouvrir
    # et faire exactement cette taille a la fin.
    [Parameter(Mandatory = $false)][int64]$Total = 0
)

# `Continue` et non `Stop` : sous PowerShell 5.1, une sortie sur stderr d'une
# commande native leve une erreur *fatale* quand la preference vaut Stop. Un
# avertissement TLS transitoire de curl (que ce script sait pourtant reprendre)
# tuait donc tout le telechargement. Les echecs sont traites par comptage
# d'octets et par `throw` explicites, pas par la preference globale.
$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'
Add-Type -AssemblyName System.IO.Compression.FileSystem

$curl = Join-Path $env:SystemRoot 'System32\curl.exe'
if (-not (Test-Path $curl)) { throw "curl.exe introuvable : $curl" }

$name = Split-Path $Target -Leaf
$part = "$Target.part"
$tmpChunk = "$Target.chunk"

function Write-Step($m) { Write-Host $m }

function Test-ZipOpening($path) {
    if (-not (Test-Path $path)) { return $false }
    try {
        $zip = [System.IO.Compression.ZipFile]::OpenRead($path)
        $ok = $zip.Entries.Count -gt 0
        $zip.Dispose()
        return $ok
    } catch { return $false }
}

# --- 1. taille totale annoncee (on garde le DERNIER content-length, celui du
#        fichier apres redirections) -------------------------------------------
Write-Step "=== $name"
# La taille : on garde le PLUS GRAND content-length rencontre. Prendre le
# dernier est faux — un serveur peut repondre `Content-Length: 0` a un HEAD
# (constate), et on conclurait alors a tort que le fichier est vide.
$probe = 0
for ($tentative = 1; $tentative -le 6; $tentative++) {
    $headLines = & $curl -sIL --max-time 90 $Url 2>&1
    foreach ($line in @($headLines)) {
        if ($line -match '^(?i)content-length:\s*(\d+)') {
            $valeur = [int64]$Matches[1]
            if ($valeur -gt $probe) { $probe = $valeur }
        }
    }
    if ($probe -ge 1000000) { break }
    Write-Step "    sonde de taille : essai $tentative sans resultat"
    Start-Sleep -Seconds 3
}

$total = $probe
if ($total -lt 1000000) {
    if ($Total -ge 1000000) {
        $total = $Total
        Write-Step "    sonde muette : taille mesuree retenue ($total octets)"
    } else {
        throw "taille introuvable pour $Url (sonde muette, aucun secours fourni)"
    }
}
Write-Step ("    taille annoncee : {0:N0} octets" -f $total)

# --- 2. tranches ------------------------------------------------------------
$maxFailures = 80
$failures = 0
$lastReport = 0

while ($true) {
    $have = if (Test-Path $part) { (Get-Item $part).Length } else { 0 }
    if ($have -ge $total) { break }

    $end = [Math]::Min($have + $ChunkBytes - 1, $total - 1)
    $want = [int64]($end - $have + 1)

    Remove-Item $tmpChunk -Force -ErrorAction SilentlyContinue
    # `2>&1 | Out-Null` : la sortie d'erreur de curl est avalee. Sous PS 5.1,
    # une ligne sur stderr suffit a faire croire a un echec fatal.
    & $curl -L --max-time 300 --silent --show-error --retry 2 `
        -H "Range: bytes=$have-$end" -o $tmpChunk $Url 2>&1 | Out-Null

    $got = if (Test-Path $tmpChunk) { (Get-Item $tmpChunk).Length } else { 0 }
    if ($got -ne $want) {
        $failures++
        Write-Step ("    tranche a {0:N0} : {1}/{2} octets (echec {3})" -f $have, $got, $want, $failures)
        if ($failures -ge $maxFailures) { throw "trop d'echecs consecutifs sur $name" }
        Start-Sleep -Seconds 2
        continue
    }

    # Ajout en fin de fichier : l'ordre est garanti, la taille aussi.
    $bytes = [System.IO.File]::ReadAllBytes($tmpChunk)
    $fs = [System.IO.File]::Open($part, [System.IO.FileMode]::Append, [System.IO.FileAccess]::Write)
    $fs.Write($bytes, 0, $bytes.Length)
    $fs.Close()
    Remove-Item $tmpChunk -Force

    $failures = 0
    $have = $have + $want
    if (($have - $lastReport) -ge 20971520) {
        $lastReport = $have
        $pct = [Math]::Round(100 * $have / $total, 1)
        Write-Step ("    {0} : {1:N0} / {2:N0} octets ({3} %)" -f $name, $have, $total, $pct)
    }
}

# --- 3. verification de l'archive avant mise en place -----------------------
$size = (Get-Item $part).Length
Write-Step ("    recu : {0:N0} octets" -f $size)
if (-not (Test-ZipOpening $part)) {
    Write-Step "    ARCHIVE ILLISIBLE malgre le bon nombre d'octets : ECHEC"
    exit 1
}
if ($size -lt $Floor) {
    Write-Step ("    {0:N0} < plancher {1:N0} : ECHEC" -f $size, $Floor)
    exit 1
}

Move-Item -Force $part $Target
Write-Step "    OK, verifie, en place : $Target"