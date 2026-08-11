# repack_heightmap.py — run once against your existing global.png
import numpy as np
from osgeo import gdal
from PIL import Image

ds = gdal.Open("public/data/heightmaps/jupiter/global.png")
arr = ds.GetRasterBand(1).ReadAsArray().astype(np.uint16)

rg = np.zeros((*arr.shape, 3), dtype=np.uint8)
rg[:, :, 0] = (arr >> 8) & 0xFF  # high byte -> R
rg[:, :, 1] = arr & 0xFF  # low byte  -> G
# B unused, stays 0

Image.fromarray(rg, mode="RGB").save("public/data/heightmaps/jupiter/global_rg.png")
