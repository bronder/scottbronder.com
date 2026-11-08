#!/usr/bin/env python3
"""Capture hero screenshots of the setlist sites into img/work/*.webp.

Usage: python scripts/capture-work.py [slug ...]   (default: all)
Needs Microsoft Edge (or Chrome) and Pillow (pip install pillow).
"""
import os
import subprocess
import sys
import tempfile

from PIL import Image

SITES = {
    "dc-custom-guitars": "https://dccustomguitars.com",
    "dc-guitar-builder": "https://dccustomguitars.com/builder-v2/",
    "dean-cascione": "https://deancascione.com",
    "bello-automotive": "https://belloautomotive.com",
    "double-slop": "https://doubleslop.com",
}

# Optional crop per site, as fractions of the capture: (left, top, right, bottom).
CROPS = {
    "double-slop": (0.0, 0.08, 0.46, 0.9),  # moon and skeletons, not the headline
}

BROWSERS = [
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
]

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "img", "work")
WIDTH, HEIGHT = 1280, 800  # capture size
SAVE_WIDTH = 720  # cards are never wider than ~720px; 2x covers a 360px phone card


def browser():
    for path in BROWSERS:
        if os.path.exists(path):
            return path
    sys.exit("No Edge or Chrome found.")


def capture(exe, slug, url):
    with tempfile.TemporaryDirectory() as tmp:
        png = os.path.join(tmp, "shot.png")
        subprocess.run(
            [
                exe,
                "--headless=new",
                "--disable-gpu",
                "--hide-scrollbars",
                "--mute-audio",
                "--no-first-run",
                f"--user-data-dir={os.path.join(tmp, 'profile')}",
                f"--window-size={WIDTH},{HEIGHT}",
                "--virtual-time-budget=8000",
                f"--screenshot={png}",
                url,
            ],
            check=True,
            timeout=90,
            capture_output=True,
        )
        img = Image.open(png).convert("RGB")
        if slug in CROPS:
            l, t, r, b = CROPS[slug]
            img = img.crop((round(l * img.width), round(t * img.height), round(r * img.width), round(b * img.height)))
        width = min(SAVE_WIDTH, img.width)
        img = img.resize((width, round(width * img.height / img.width)), Image.LANCZOS)
        dest = os.path.join(OUT, f"{slug}.webp")
        img.save(dest, "WEBP", quality=72, method=6)
        print(f"{slug}: {os.path.getsize(dest) // 1024} KB")


def main():
    os.makedirs(OUT, exist_ok=True)
    exe = browser()
    slugs = sys.argv[1:] or list(SITES)
    for slug in slugs:
        capture(exe, slug, SITES[slug])


if __name__ == "__main__":
    main()
