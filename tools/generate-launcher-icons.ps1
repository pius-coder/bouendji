param(
    [string]$Src = "tools/brands/saitrix/icon.png",
    [string]$Res = "apps/android/app/src/main/res"
)

Add-Type -AssemblyName System.Drawing

$densities = @{
    "mdpi"    = 1.0
    "hdpi"    = 1.5
    "xhdpi"   = 2.0
    "xxhdpi"  = 3.0
    "xxxhdpi" = 4.0
}

$srcImg = [System.Drawing.Image]::FromFile((Resolve-Path $Src))

function Resize-Image($img, $w, $h) {
    $bmp = New-Object System.Drawing.Bitmap($w, $h, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.Clear([System.Drawing.Color]::Transparent)
    $g.DrawImage($img, 0, 0, $w, $h)
    $g.Dispose()
    return $bmp
}

function Create-Foreground($img, $size) {
    $bmp = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.Clear([System.Drawing.Color]::Transparent)
    
    $inner = [int]([Math]::Round($size * 0.666))
    $offset = [int](($size - $inner) / 2)
    $g.DrawImage($img, $offset, $offset, $inner, $inner)
    $g.Dispose()
    return $bmp
}

foreach ($entry in $densities.GetEnumerator()) {
    $name = $entry.Key
    $factor = $entry.Value
    $folder = Join-Path $Res "mipmap-$name"
    if (-not (Test-Path $folder)) { New-Item -ItemType Directory -Path $folder -Force | Out-Null }
    
    $launcherSize = [int](48 * $factor)
    $layerSize = [int](108 * $factor)
    
    $launcherBmp = Resize-Image $srcImg $launcherSize $launcherSize
    $launcherBmp.Save((Join-Path $folder "ic_launcher.png"), [System.Drawing.Imaging.ImageFormat]::Png)
    $launcherBmp.Save((Join-Path $folder "ic_launcher_round.png"), [System.Drawing.Imaging.ImageFormat]::Png)
    $launcherBmp.Dispose()
    
    $fgBmp = Create-Foreground $srcImg $layerSize
    $fgBmp.Save((Join-Path $folder "ic_launcher_foreground.png"), [System.Drawing.Imaging.ImageFormat]::Png)
    $fgBmp.Save((Join-Path $folder "ic_launcher_monochrome.png"), [System.Drawing.Imaging.ImageFormat]::Png)
    $fgBmp.Dispose()
}

$nodpi = Join-Path $Res "drawable-nodpi"
if (-not (Test-Path $nodpi)) { New-Item -ItemType Directory -Path $nodpi -Force | Out-Null }
$brandIcon = Resize-Image $srcImg 512 512
$brandIcon.Save((Join-Path $nodpi "brand_icon.png"), [System.Drawing.Imaging.ImageFormat]::Png)
$brandIcon.Dispose()

$srcImg.Dispose()
Write-Host "All launcher and brand icons generated for $Src"
