import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

Image.MAX_IMAGE_PIXELS = None


def build(source_dir: Path, out_dir: Path) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)

    day = Image.open(source_dir / "world.topo.bathy.200412.3x5400x2700.jpg").convert("RGB")
    day.save(out_dir / "earth_day.jpg", quality=92)

    flat = np.asarray(Image.open(source_dir / "world.200412.3x5400x2700.jpg").convert("RGB")).astype(np.int16)
    r, g, b = flat[..., 0], flat[..., 1], flat[..., 2]
    water = (b > r + 8) & (b > g + 6) & (r < 40) & (g < 60)
    mask = Image.fromarray((water * 255).astype(np.uint8)).resize((2700, 1350), Image.LANCZOS)
    mask.filter(ImageFilter.GaussianBlur(1.2)).save(out_dir / "earth_water.png")

    night = Image.open(source_dir / "BlackMarble_2016_01deg.jpg").convert("RGB")
    night.save(out_dir / "earth_night.jpg", quality=92)

    clouds = Image.open(source_dir / "cloud_combined_2048.jpg").convert("L")
    clouds.resize((4096, 2048), Image.BICUBIC).save(out_dir / "earth_clouds.jpg", quality=92)


if __name__ == "__main__":
    build(Path(sys.argv[1]), Path(sys.argv[2]))
