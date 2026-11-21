"""生成安卓启动图标（旧版 mipmap PNG + 自适应图标前景）。

用法：python scripts/make-icons.py
图形来自设计稿的像素级矢量化：品牌蓝圆角方块 + 白色对话气泡，气泡左下角伸出渐细的鲸尾，
尾鳍朝右张开，气泡右上角一个与底色同色的圆点当眼睛。
"""

from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
RES = ROOT / "android/app/src/main/res"
BLUE = (59, 130, 246, 255)  # #3B82F6
WHITE = (255, 255, 255, 255)

LEGACY = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}
FOREGROUND = {"mdpi": 108, "hdpi": 162, "xhdpi": 216, "xxhdpi": 324, "xxxhdpi": 432}

SUPERSAMPLE = 4
CANVAS = 512.0  # 轮廓坐标所在的画布尺寸
CORNER = 105.49  # 蓝底圆角半径（CANVAS 坐标系）
EYE = (559 * 512 / 728, 190 * 512 / 728, 43.6 * 512 / 728)

# 白色气泡 + 鲸尾合并后的一条闭合轮廓（CANVAS 坐标系）
OUTLINE = [
    (106.2, 66.81), (410.73, 66.81), (426.9, 71.74), (436.75, 78.77),
    (446.59, 92.84), (450.11, 106.2), (450.11, 291.16), (446.59, 304.53),
    (436.75, 318.59), (426.9, 325.63), (410.73, 330.55), (137.85, 330.55),
    (139.25, 345.32), (142.77, 355.87), (147.69, 363.6), (151.21, 369.93),
    (162.46, 381.19), (176.53, 389.63), (180.75, 389.63), (184.97, 387.52),
    (187.08, 379.78), (194.11, 367.12), (201.14, 359.38), (208.88, 353.76),
    (220.13, 348.13), (229.27, 345.32), (248.97, 345.32), (248.97, 350.24),
    (243.34, 353.76), (237.71, 359.38), (235.6, 363.6), (233.49, 379.08),
    (230.68, 386.11), (224.35, 393.14), (219.43, 395.96), (227.16, 398.77),
    (231.38, 402.99), (232.79, 402.99), (237.71, 409.32), (242.64, 421.98),
    (248.97, 427.6), (260.92, 431.82), (261.63, 436.75), (258.81, 439.56),
    (245.45, 443.08), (222.24, 443.08), (208.88, 438.15), (198.33, 430.42),
    (191.3, 421.27), (190.59, 418.46), (187.08, 415.65), (186.37, 412.13),
    (168.79, 414.95), (157.54, 414.95), (143.47, 412.84), (130.11, 408.62),
    (115.34, 400.88), (105.49, 392.44), (104.09, 392.44), (86.51, 372.75),
    (76.66, 355.16), (68.92, 330.55), (66.81, 313.67), (66.81, 105.49),
    (70.33, 92.84), (79.47, 79.47), (91.43, 71.03),
]


def chaikin(points, rounds=3):
    """Chaikin 切角平滑：反复把每条边切成 1/4、3/4 两点，得到圆润且不过冲的曲线。"""
    for _ in range(rounds):
        smooth = []
        count = len(points)
        for index in range(count):
            x0, y0 = points[index]
            x1, y1 = points[(index + 1) % count]
            smooth.append((0.75 * x0 + 0.25 * x1, 0.75 * y0 + 0.25 * y1))
            smooth.append((0.25 * x0 + 0.75 * x1, 0.25 * y0 + 0.75 * y1))
        points = smooth
    return points


SHAPE = chaikin(OUTLINE)


def draw_art(draw: ImageDraw.ImageDraw, size: int, scale: float, offset: float, color, with_eye: bool) -> None:
    """在 (offset, offset) 起点按 scale 缩放画白色图形和眼睛。"""
    points = [((x * scale + offset) * size / CANVAS, (y * scale + offset) * size / CANVAS) for x, y in SHAPE]
    draw.polygon(points, fill=color)
    if not with_eye:
        return
    cx, cy, r = EYE
    draw.ellipse(
        (
            ((cx - r) * scale + offset) * size / CANVAS,
            ((cy - r) * scale + offset) * size / CANVAS,
            ((cx + r) * scale + offset) * size / CANVAS,
            ((cy + r) * scale + offset) * size / CANVAS,
        ),
        fill=BLUE,
    )


def make(size: int, rounded: bool, with_bg: bool) -> Image.Image:
    """rounded 用圆形底；with_bg=False 时留空背景，给自适应图标当前景层。"""
    canvas_size = size * SUPERSAMPLE
    canvas = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(canvas)
    full = (0, 0, canvas_size - 1, canvas_size - 1)
    if with_bg:
        if rounded:
            draw.ellipse(full, fill=BLUE)
            # 圆形图标把图形收进圆内，避免四角被裁
            art_scale = 0.84
            draw_art(draw, canvas_size, art_scale, CANVAS * (1 - art_scale) / 2, WHITE, with_eye=True)
        else:
            draw.rounded_rectangle(full, radius=round(CORNER * canvas_size / CANVAS), fill=BLUE)
            draw_art(draw, canvas_size, 1.0, 0.0, WHITE, with_eye=True)
    else:
        # 自适应图标前景：图形缩到安全区内，背景色由 ic_launcher_background 提供
        inset = 0.20 * CANVAS
        inner = CANVAS - inset * 2
        draw_art(draw, canvas_size, inner / CANVAS, inset, WHITE, with_eye=False)
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
