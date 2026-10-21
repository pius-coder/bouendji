# Telechargeur segmente, style IDM, pour Windows. Aucune dependance externe :
# PowerShell 5.1 + curl.exe (present dans System32 depuis Windows 10).
#
# Pourquoi : ce reseau coupe chaque connexion au bout de quelques dizaines de
# Mo. Une seule connexion ne peut donc pas terminer un fichier de 190 Mo. Le
# remede n'est pas de reessayer plus fort, c'est de decouper : N workers tirent
# chacun leur plage d'octets en parallele, chacun reprend ou il s'est arrete.
#
# Principe :
#   1. on demande la taille au serveur (plus grand content-length rencontre,
#      avec essais, et valeur de secours si la sonde reste muette) ;
#   2. on coupe en N plages contigues ;
#   3. chaque plage est telechargee par un processus worker, en sous-tranches
#      de 2 Mo, ecrites a la suite dans son propre fichier ;
#   4. chaque sous-tranche est verifiee a l'octet pres ; un echec ne coute que
#      la sous-tranche, jamais la plage ;
#   5. quand tous les workers ont fini, on recolle dans l'ordre, on verifie que
#      l'archive s'ouvre, et seulement alors on la met en place.
#
# Reprise : relancer la meme commande reprend chaque plage ou elle en etait.
# Les fichiers `.segN` sont l'etat. Ne pas lancer deux instances du meme
# telechargement : un seul ecrivain par fichier.
#
# Aucun accent dans ce fichier : PowerShell 5.1 lit un .ps1 sans BOM en ANSI.
#
# Usage parent :
#   powershell -File tools/fetch-segmented.ps1 -Url <url> -Target <fichier> [-Workers 8] [-Total <octets>]
# Le worker est le meme script, appele avec -SegmentIndex/-SegmentCount : c'est
# l'appelant qui le lance, on ne l'appelle pas a la main.

param(
    [Parameter(Mandatory = $true)][string]$Url,
    [Parameter(Mandatory = $true)][string]$Target,
    [Parameter(Mandatory = $false)][int]$Workers = 8,
    [Parameter(Mandatory = $false)][int]$ChunkBytes = 2097152,     # 2 Mo
    [Parameter(Mandatory = $false)][int64]$Floor = 1000000,
    [Parameter(Mandatory = $false)][int64]$Total = 0,
    [Parameter(Mandatory = $false)][int]$SegmentIndex = -1,
    [Parameter(Mandatory = $false)][int]$SegmentCount = 0,
    [Parameter(Mandatory = $false)][int64]$SegmentStart = 0,
    [Parameter(Mandatory = $false)][int64]$SegmentEnd = 0
)

# `Continue` et non `Stop` : sous PowerShell 5.1, une sortie sur stderr d'une
# commande native leve une erreur FATALE quand la preference vaut Stop. curl en
# produit sans arret sur ce reseau. Les echecs sont traites par comptage
# d'octets, pas par la preference globale.
$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'
Add-Type -AssemblyName System.IO.Compression.FileSystem

$curl = Join-Path $env:SystemRoot 'System32\curl.exe'
if (-not (Test-Path $curl)) { throw "curl.exe introuvable : $curl" }
$name = Split-Path $Target -Leaf

function Test-ZipOpening($path) {
    if (-not (Test-Path $path)) { return $false }
    try {
        $zip = [System.IO.Compression.ZipFile]::OpenRead($path)
        $ok = $zip.Entries.Count -gt 0
        $zip.Dispose()
        return $ok
    } catch { return $false }
}

# Taille annoncee par le serveur. On garde le PLUS GRAND content-length : un
# serveur peut repondre `Content-Length: 0` a un HEAD, et prendre le dernier
# ferait conclure a tort que le fichier est vide.
function Get-RemoteSize($url) {
    $best = 0
    for ($t = 1; $t -le 6; $t++) {
        $lines = & $curl -sIL --max-time 60 --connect-timeout 20 $url 2>&1
        foreach ($line in @($lines)) {
            if ($line -match '^(?i)content-length:\s*(\d+)') {
                $v = [int64]$Matches[1]
                if ($v -gt $best) { $best = $v }
            }
        }
        if ($best -ge 1000000) { return $best }
        Start-Sleep -Seconds 2
    }
    return $best
}

function Add-FileToStream($stream, $path) {
    $in = [System.IO.File]::OpenRead($path)
    try {
        $buffer = New-Object byte[] 1048576
        while (($read = $in.Read($buffer, 0, $buffer.Length)) -gt 0) {
            $stream.Write($buffer, 0, $read)
        }
    } finally { $in.Close() }
}

<# ------------------------------------------------------------------- worker #>

if ($SegmentIndex -ge 0) {
    $segFile = "$Target.seg$SegmentIndex"
    $have = 0
    if (Test-Path $segFile) { $have = (Get-Item $segFile).Length }
    $pos = $SegmentStart + $have

    $failures = 0
    while ($pos -le $SegmentEnd) {
        $end = [Math]::Min($pos + $ChunkBytes - 1, $SegmentEnd)
        $want = [int64]($end - $pos + 1)
        $tmp = "$Target.seg$SegmentIndex.chunk"

        Remove-Item $tmp -Force -ErrorAction SilentlyContinue
        # stderr de curl avale : sous PS 5.1 il ferait croire a un echec fatal.
        & $curl -L --silent --show-error --connect-timeout 20 --max-time 240 `
            --retry 2 --retry-delay 2 `
            -H "Range: bytes=$pos-$end" -o $tmp $Url 2>&1 | Out-Null

        $got = 0
        if (Test-Path $tmp) { $got = (Get-Item $tmp).Length }
        if ($got -ne $want) {
            $failures++
            if ($failures -ge 60) { Remove-Item $tmp -Force -ErrorAction SilentlyContinue; exit 1 }
            Start-Sleep -Seconds 2
            continue
        }

        $bytes = [System.IO.File]::ReadAllBytes($tmp)
        $fs = [System.IO.File]::Open($segFile, [System.IO.FileMode]::Append, [System.IO.FileAccess]::Write)
        $fs.Write($bytes, 0, $bytes.Length)
        $fs.Close()
        Remove-Item $tmp -Force -ErrorAction SilentlyContinue

        $failures = 0
        $pos = $end + 1
    }
    exit 0
}

<# ------------------------------------------------------------------- parent #>

Write-Host "=== $name"
$taille = Get-RemoteSize $Url
if ($taille -lt 1000000) {
    if ($Total -ge 1000000) {
        $taille = $Total
        Write-Host ("    sonde muette : taille mesuree retenue ({0:N0} octets)" -f $taille)
    } else {
        throw "taille introuvable pour $Url"
    }
} else {
    Write-Host ("    taille annoncee par le serveur : {0:N0} octets" -f $taille)
}

if ($Workers -lt 1) { $Workers = 1 }
if ($Workers -gt 16) { $Workers = 16 }   # au dela, on sature le lien et le serveur

# Reprise : ce qui est deja dans `.part` est un PREFIXE valide du fichier, parce
# que l'ecriture y est purement sequentielle. On ne le retelecharge donc pas :
# les workers ne couvrent que la suite. C'est ce qui permet de passer d'un
# telechargement a une connexion a un telechargement segmente sans rien perdre.
$deja = 0
if (Test-Path "$Target.part") { $deja = (Get-Item "$Target.part").Length }
if ($deja -gt $taille) {
    Write-Host "    .part plus grand que le fichier annonce : on le jette"
    Remove-Item "$Target.part" -Force -ErrorAction SilentlyContinue
    $deja = 0
}
if ($deja -gt 0) {
    Write-Host ("    deja telecharge : {0:N0} octets ({1} %) - on ne reprend que la suite" -f `
        $deja, [Math]::Round(100 * $deja / $taille, 1))
}

# Plages contigues sur ce qui RESTE : la somme couvre exactement [deja, taille-1].
$restant = $taille - $deja
$plages = @()
if ($restant -gt 0) {
    $per = [Math]::Floor($restant / $Workers)
    if ($per -lt 1) { $per = 1 }
    for ($i = 0; $i -lt $Workers; $i++) {
        $start = [int64]($deja + $i * $per)
        $end = if ($i -eq ($Workers - 1)) { [int64]($taille - 1) } else { [int64]($deja + ($i + 1) * $per - 1) }
        if ($start -gt $end) { continue }
        $plages += [pscustomobject]@{ Index = $i; Start = $start; End = $end }
    }
}

$scriptPath = $PSCommandPath
if (-not $scriptPath) { $scriptPath = $MyInvocation.MyCommand.Path }

Write-Host ("    {0} workers, plages de ~{1:N0} octets" -f $Workers, $per)

# Relance des workers deja complets : on ne retelecharge pas une plage terminee.
$procs = @()
foreach ($p in $plages) {
    $segFile = "$Target.seg$($p.Index)"
    $attendu = $p.End - $p.Start + 1
    $present = 0
    if (Test-Path $segFile) { $present = (Get-Item $segFile).Length }
    if ($present -ge $attendu) { continue }

    $args = @(
        '-NoProfile', '-ExecutionPolicy', 'Bypass',
        '-File', "`"$scriptPath`"",
        '-Url', "`"$Url`"",
        '-Target', "`"$Target`"",
        '-ChunkBytes', $ChunkBytes,
        '-SegmentIndex', $p.Index,
        '-SegmentCount', $Workers,
        '-SegmentStart', $p.Start,
        '-SegmentEnd', $p.End
    )
    $procs += Start-Process -FilePath 'powershell.exe' -ArgumentList $args -NoNewWindow -PassThru
}

$dejaSegments = 0
foreach ($p in $plages) {
    $segFile = "$Target.seg$($p.Index)"
    if (Test-Path $segFile) { $dejaSegments += (Get-Item $segFile).Length }
}
if ($dejaSegments -gt 0) {
    Write-Host ("    plages deja entamees : {0:N0} octets" -f $dejaSegments)
}

# Suivi : on additionne les plages, sans jamais relire le fichier final (il
# n'existe pas encore).
$lastReport = 0
while ($true) {
    $running = @($procs | Where-Object { -not $_.HasExited })
    $somme = $deja
    foreach ($p in $plages) {
        $segFile = "$Target.seg$($p.Index)"
        if (Test-Path $segFile) { $somme += (Get-Item $segFile).Length }
    }
    if (($somme - $lastReport) -ge 20971520 -or $running.Count -eq 0) {
        $lastReport = $somme
        Write-Host ("    {0:N0} / {1:N0} octets ({2} %) - {3} workers actifs" -f `
            $somme, $taille, [Math]::Round(100 * $somme / $taille, 1), $running.Count)
    }
    if ($running.Count -eq 0) { break }
    Start-Sleep -Seconds 3
}

# On recolte les processus (WaitForExit sans condition : sur un processus deja
# termine, `.ExitCode` reste vide sinon). Mais on ne juge PAS sur le code de
# sortie : `Start-Process -PassThru` le rend peu fiable sous PS 5.1, et un
# worker qui abandonne laisse de toute facon une plage trop courte. C'est la
# verification des tailles juste en dessous qui fait foi.
foreach ($pr in $procs) {
    try { $pr.WaitForExit() } catch { }
}

# Verification des plages avant recollage.
foreach ($p in $plages) {
    $segFile = "$Target.seg$($p.Index)"
    $attendu = $p.End - $p.Start + 1
    $present = 0
    if (Test-Path $segFile) { $present = (Get-Item $segFile).Length }
    if ($present -ne $attendu) {
        Write-Host ("    plage {0} incomplete : {1}/{2}" -f $p.Index, $present, $attendu)
        exit 1
    }
}

# Recollage dans l'ordre, en flux (pas de gros tableau en memoire). On assemble
# dans un fichier neuf : le `.part` existant sert de prefixe, il n'est donc
# jamais reecrit, et une coupure pendant le recollage ne detruit rien.
$assembling = "$Target.assembling"
Remove-Item $assembling -Force -ErrorAction SilentlyContinue
$out = [System.IO.File]::Open($assembling, [System.IO.FileMode]::Create, [System.IO.FileAccess]::Write)
try {
    if (Test-Path "$Target.part") { Add-FileToStream $out "$Target.part" }
    foreach ($p in ($plages | Sort-Object Index)) {
        Add-FileToStream $out "$Target.seg$($p.Index)"
    }
} finally { $out.Close() }

$size = (Get-Item $assembling).Length
if ($size -ne $taille) {
    Write-Host ("    taille finale {0:N0} au lieu de {1:N0} : ECHEC" -f $size, $taille)
    exit 1
}
if (-not (Test-ZipOpening $assembling)) {
    Write-Host "    archive illisible : ECHEC"
    exit 1
}
if ($size -lt $Floor) {
    Write-Host ("    {0:N0} < plancher {1:N0} : ECHEC" -f $size, $Floor)
    exit 1
}

Move-Item -Force $assembling $Target
Remove-Item "$Target.part" -Force -ErrorAction SilentlyContinue
foreach ($p in $plages) { Remove-Item "$Target.seg$($p.Index)" -Force -ErrorAction SilentlyContinue }
Write-Host ("    OK, verifie, en place : {0} ({1:N0} octets)" -f $Target, $size)