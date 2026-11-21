"""生成安卓启动图标（旧版 mipmap PNG + 自适应图标前景）。

用法：python scripts/make-icons.py
风格：品牌蓝底 + 白色圆角气泡，气泡下方的对话小尾巴画成鲸鱼尾鳍，呼应 DeepChat 的名字。
"""

from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
RES = ROOT / "android/app/src/main/res"
BLUE = (57, 100, 254, 255)  # --dsw-static-blue-500
WHITE = (255, 255, 255, 255)

LEGACY = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}
FOREGROUND = {"mdpi": 108, "hdpi": 162, "xhdpi": 216, "xxhdpi": 324, "xxxhdpi": 432}

# 尾鳍比例：长度、张开宽度、根部宽度、分叉深度、尾叶弧度
FIN_LENGTH = 0.50
FIN_SPREAD = 0.32
FIN_STEM = 0.045
FIN_NOTCH = 0.72
FIN_BULGE = 1.15


def curve(start, control, end, steps=22):
    """二次贝塞尔采样，用来画圆润的尾鳍轮廓。"""
    points = []
    for index in range(steps + 1):
        t = index / steps
        x = (1 - t) ** 2 * start[0] + 2 * (1 - t) * t * control[0] + t * t * end[0]
        y = (1 - t) ** 2 * start[1] + 2 * (1 - t) * t * control[1] + t * t * end[1]
        points.append((x, y))
    return points


def whale_bubble(draw: ImageDraw.ImageDraw, box: tuple[float, float, float, float], color, radius: int):
    """鲸鱼形对话框：圆角气泡当身体，下沿的对话尾巴画成分叉的鲸鱼尾鳍。"""
    left, top, right, bottom = box
    width = right - left
    height = bottom - top

    base = (left + width * 0.40, top + height * 0.95)
    length = height * FIN_LENGTH
    spread = width * FIN_SPREAD
    stem = width * FIN_STEM

    def at(along: float, side: float) -> tuple[float, float]:
        return (base[0] + side, base[1] + along)

    left_root = at(0, stem)
    left_tip = at(length, spread)
    notch = at(length * FIN_NOTCH, 0)
    right_tip = at(length, -spread)
    right_root = at(0, -stem)

    outline = (
        curve(left_root, at(length * 0.55, spread * FIN_BULGE), left_tip)
        + curve(left_tip, at(length * 0.92, spread * 0.1), notch)
        + curve(notch, at(length * 0.92, -spread * 0.1), right_tip)
        + curve(right_tip, at(length * 0.55, -spread * FIN_BULGE), right_root)
    )
    draw.polygon(outline, fill=color)
    draw.rounded_rectangle((left, top, right, bottom), radius=radius, fill=color)


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
    box = (inset, inset * 1.06, size * scale - inset, size * scale - inset * 1.16)
    whale_bubble(draw, box, WHITE, radius=int(size * scale * 0.09))
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
