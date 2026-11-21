"""生成安卓启动图标（旧版 mipmap PNG + 自适应图标前景）。

用法：python scripts/make-icons.py
风格：品牌蓝底 + 白色圆角气泡 + 三个蓝点，和网页端的品牌色一致。
"""

from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
RES = ROOT / "android/app/src/main/res"
BLUE = (57, 100, 254, 255)  # --dsw-static-blue-500
WHITE = (255, 255, 255, 255)

LEGACY = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}
FOREGROUND = {"mdpi": 108, "hdpi": 162, "xhdpi": 216, "xxhdpi": 324, "xxxhdpi": 432}


def bubble(draw: ImageDraw.ImageDraw, box: tuple[float, float, float, float], color, radius: int, dots: bool):
    left, top, right, bottom = box
    draw.rounded_rectangle((left, top, right, bottom), radius=radius, fill=color)
    # 左下角的对话小尾巴
    tail = [
        (left + (right - left) * 0.18, bottom - (bottom - top) * 0.05),
        (left + (right - left) * 0.10, bottom + (bottom - top) * 0.30),
        (left + (right - left) * 0.42, bottom - (bottom - top) * 0.05),
    ]
    draw.polygon(tail, fill=color)
    if not dots:
        return
    dot_r = (bottom - top) * 0.085
    cy = (top + bottom) / 2
    for ratio in (0.32, 0.5, 0.68):
        cx = left + (right - left) * ratio
        draw.ellipse((cx - dot_r, cy - dot_r, cx + dot_r, cy + dot_r), fill=BLUE)


def make(size: int, rounded: bool, with_bg: bool) -> Image.Image:
    scale = 4  # 先画大图再缩，边缘更干净
    canvas = Image.new("RGBA", (size * scale, size * scale), (0, 0, 0, 0))
    draw = ImageDraw.Draw(canvas)
    full = (0, 0, size * scale, size * scale)
    if with_bg:
        if rounded:
            draw.ellipse(full, fill=BLUE)
        else:
            draw.rounded_rectangle(full, radius=int(size * scale * 0.22), fill=BLUE)
    inset = size * scale * (0.235 if with_bg else 0.28)
    bubble(
        draw,
        (inset, inset * 1.06, size * scale - inset, size * scale - inset * 1.16),
        WHITE,
        radius=int(size * scale * 0.09),
        dots=with_bg,
    )
    return canvas.resize((size, size), Image.LANCZOS)


for density, size in LEGACY.items():
    folder = RES / f"mipmap-{density}"
    folder.mkdir(parents=True, exist_ok=True)
    make(size, rounded=False, with_bg=True).save(folder / "ic_launcher.png")
    make(size, rounded=True, with_bg=True).save(folder / "ic_launcher_round.png")

for density, size in FOREGROUND.items():
    folder = RES / f"mipmap-{density}"
    folder.mkdir(parents=True, exist_ok=True)
    make(size, rounded=False, with_bg=False).save(folder / "ic_launcher_foreground.png")

print("icons written")
