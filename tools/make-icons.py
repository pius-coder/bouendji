"""
Variantes d'icône Android d'une marque, à partir de **son** icône source
(PNG carré, 512 px conseillés, fond plein — p. ex. `icon-512.png` du prototype).

Rien n'est dessiné ici : l'image est recadrée, redimensionnée et découpée.

Produit dans <res> :
  mipmap-<densité>/ic_launcher.png             icône classique (carré arrondi d'origine)
  mipmap-<densité>/ic_launcher_round.png       disque
  mipmap-<densité>/ic_launcher_foreground.png  avant-plan adaptatif (108 dp)
  mipmap-<densité>/ic_launcher_monochrome.png  silhouette (icônes à thème, Android 13+)
  mipmap-anydpi-v26/ic_launcher(.xml|_round.xml)
  values/ic_launcher_colors.xml               fond adaptatif = teinte du bord de l'icône
  drawable-nodpi/brand_icon.png               icône affichée dans l'application

Usage :
  python tools/make-icons.py --src tools/brands/<marque>/icon.png --res apps/android/app/src/main/res
  [--mascot tools/brands/<marque>/mascot.png]   (copiée en drawable-nodpi/brand_mascot.png)

Dépendance : Pillow.
"""
import argparse
import os
import shutil

from PIL import Image, ImageChops, ImageDraw, ImageFilter

DENSITIES = {"mdpi": 1.0, "hdpi": 1.5, "xhdpi": 2.0, "xxhdpi": 3.0, "xxxhdpi": 4.0}


def edge_color(icon: Image.Image) -> tuple:
    """Teinte moyenne d'une bande intérieure du bord (hors coins transparents)."""
    w, h = icon.size
    samples = []
    for i in range(int(w * .15), int(w * .85), max(1, w // 64)):
        for x, y in ((i, int(h * .06)), (i, int(h * .94)), (int(w * .06), i), (int(w * .94), i)):
            r, g, b, a = icon.getpixel((x, y))
            if a > 200:
                samples.append((r, g, b))
    if not samples:
        return (11, 19, 34)
    n = len(samples)
    return tuple(sum(c[k] for c in samples) // n for k in range(3))


def flattened(icon: Image.Image, color: tuple) -> Image.Image:
    """
    Icône pleine : l'intérieur semi-transparent est composé sur blanc (c'est ainsi
    que le prototype l'affiche), seuls les coins extérieurs du carré arrondi
    prennent la teinte du bord.
    """
    w, h = icon.size
    white = Image.new("RGBA", icon.size, (255, 255, 255, 255))
    white.alpha_composite(icon)
    corners = Image.new("L", icon.size, 0)
    band = int(w * .2)
    alpha = icon.getchannel("A")
    for y in list(range(band)) + list(range(h - band, h)):
        for x in list(range(band)) + list(range(w - band, w)):
            if alpha.getpixel((x, y)) < 250:
                corners.putpixel((x, y), 255 - alpha.getpixel((x, y)))
    fill = Image.new("RGBA", icon.size, color + (255,))
    white.paste(fill, (0, 0), corners)
    return white


def circle(img: Image.Image) -> Image.Image:
    size = img.size[0]
    mask = Image.new("L", (size * 4, size * 4), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, size * 4 - 1, size * 4 - 1), fill=255)
    mask = mask.resize((size, size), Image.LANCZOS)
    out = img.copy()
    out.putalpha(ImageChops.multiply(out.getchannel("A"), mask))
    return out


def foreground(full: Image.Image, px: int, scale: float = 78 / 108) -> Image.Image:
    """Calque 108 dp : l'icône pleine occupe 78 dp, le masque en montre les 72 du centre."""
    canvas = Image.new("RGBA", (px, px), (0, 0, 0, 0))
    inner = int(round(px * scale))
    art = full.resize((inner, inner), Image.LANCZOS)
    offset = (px - inner) // 2
    canvas.alpha_composite(art, (offset, offset))
    return canvas


def monochrome(full: Image.Image, color: tuple) -> Image.Image:
    """Silhouette blanche : ce qui se détache nettement du fond (luminosité > fond)."""
    gray = full.convert("L")
    bg = sum(color) // 3
    alpha = gray.point(lambda v: 0 if v < bg + 40 else min(255, int((v - bg - 40) * 3)))
    alpha = alpha.filter(ImageFilter.GaussianBlur(radius=max(1, full.size[0] // 256)))
    out = Image.new("RGBA", full.size, (255, 255, 255, 0))
    out.putalpha(alpha)
    return out


ADAPTIVE = """<?xml version="1.0" encoding="utf-8"?>
<!-- Généré par tools/make-icons.py -->
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background" />
    <foreground android:drawable="@mipmap/ic_launcher_foreground" />
    <monochrome android:drawable="@mipmap/ic_launcher_monochrome" />
</adaptive-icon>
"""


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--src", required=True)
    parser.add_argument("--res", required=True)
    parser.add_argument("--mascot")
    args = parser.parse_args()

    icon = Image.open(args.src).convert("RGBA")
    if icon.size[0] != icon.size[1]:
        raise SystemExit("icône non carrée")
    color = edge_color(icon)
    full = flattened(icon, color)

    for name, factor in DENSITIES.items():
        folder = os.path.join(args.res, f"mipmap-{name}")
        os.makedirs(folder, exist_ok=True)
        launcher = int(48 * factor)
        layer = int(108 * factor)
        icon.resize((launcher, launcher), Image.LANCZOS).save(os.path.join(folder, "ic_launcher.png"), optimize=True)
        circle(full.resize((launcher, launcher), Image.LANCZOS)).save(os.path.join(folder, "ic_launcher_round.png"), optimize=True)
        foreground(full, layer).save(os.path.join(folder, "ic_launcher_foreground.png"), optimize=True)
        foreground(monochrome(full, color), layer).save(os.path.join(folder, "ic_launcher_monochrome.png"), optimize=True)

    anydpi = os.path.join(args.res, "mipmap-anydpi-v26")
    os.makedirs(anydpi, exist_ok=True)
    for name in ("ic_launcher.xml", "ic_launcher_round.xml"):
        with open(os.path.join(anydpi, name), "w", encoding="utf-8") as handle:
            handle.write(ADAPTIVE)

    values = os.path.join(args.res, "values")
    os.makedirs(values, exist_ok=True)
    with open(os.path.join(values, "ic_launcher_colors.xml"), "w", encoding="utf-8") as handle:
        handle.write(
            '<?xml version="1.0" encoding="utf-8"?>\n<!-- Généré par tools/make-icons.py : teinte du bord de l\'icône. -->\n'
            f'<resources>\n    <color name="ic_launcher_background">#{color[0]:02X}{color[1]:02X}{color[2]:02X}</color>\n</resources>\n'
        )

    nodpi = os.path.join(args.res, "drawable-nodpi")
    os.makedirs(nodpi, exist_ok=True)
    icon.save(os.path.join(nodpi, "brand_icon.png"), optimize=True)
    if args.mascot:
        shutil.copyfile(args.mascot, os.path.join(nodpi, "brand_mascot.png"))
    print(f"icônes écrites ; fond adaptatif #{color[0]:02X}{color[1]:02X}{color[2]:02X}")


if __name__ == "__main__":
    main()
