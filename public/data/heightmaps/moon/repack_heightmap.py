# repack_heightmap.py — run once against your existing global.png
from osgeo import gdal
import numpy as np
from PIL import Image

ds = gdal.Open("global.png")
arr = ds.GetRasterBand(1).ReadAsArray().astype(np.uint16)

rg = np.zeros((*arr.shape, 3), dtype=np.uint8)
rg[:, :, 0] = (arr >> 8) & 0xFF   # high byte -> R
rg[:, :, 1] = arr & 0xFF          # low byte  -> G
# B unused, stays 0

Image.fromarray(rg, mode='RGB').save("global_rg.png")