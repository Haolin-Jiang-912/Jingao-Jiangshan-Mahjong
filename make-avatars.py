from PIL import Image, ImageEnhance, ImageFilter
import sys, os

srcs = [
    ("C:/Users/Jiang_Haolin/Downloads/免冠证件照.jpg", "avatar-linlin.png"),
    ("D:/QQ_Cache/Tencent Files/1375244100/nt_qq/nt_data/Pic/2026-08/Ori/0b26f24f3a9e68fb105bd34567e39e7e.jpg", "avatar-chaochao.png"),
    ("C:/Users/Jiang_Haolin/.workbuddy/clipboard-images/clipboard-2026-08-21T19-10-15-895Z-20374c49.jpg", "avatar-hanhan.png"),
    ("D:/QQ_Cache/Tencent Files/1375244100/nt_qq/nt_data/Pic/2026-08/Ori/d5dd1b9519f9b67fd7386643aa65e1cc.png", "avatar-zhengzheng.png"),
]
out_dir = "C:/Users/Jiang_Haolin/Documents/Codex/2026-08-22/nen/outputs/jw-mahjong-hall"

def pixel_avatar(path, out, size=(64, 80)):
    im = Image.open(path).convert("RGB")
    # 先按短边居中裁切成 4:5
    w, h = im.size
    target_ratio = 4/5
    ratio = w/h
    if ratio > target_ratio:
        nw = int(h * target_ratio)
        left = (w - nw)//2
        im = im.crop((left, 0, left+nw, h))
    else:
        nh = int(w / target_ratio)
        top = (h - nh)//2
        im = im.crop((0, top, w, top+nh))
    # 轻微对比度增强，让像素块更明显
    im = ImageEnhance.Contrast(im).enhance(1.25)
    im = ImageEnhance.Sharpness(im).enhance(1.4)
    # 缩小到很小的像素尺寸，再放大（最近邻）
    small = im.resize((16, 20), Image.Resampling.LANCZOS)
    # 减少颜色数 -> 像素调色板感
    small = small.quantize(colors=24).convert("RGB")
    pixel = small.resize(size, Image.Resampling.NEAREST)
    # 加一点边缘暗角/复古色调
    pixel.save(out, "PNG")
    print("saved", out)

for s, o in srcs:
    pixel_avatar(s, os.path.join(out_dir, o))
