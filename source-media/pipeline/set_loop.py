"""Set an animated WebP's loop count in place.

The count lives in the ANIM chunk: fourcc(4) + size(4) + background(4), then
a 2-byte little-endian loop count (0 = forever, N = play N times). Patching
those two bytes avoids a lossy re-encode of frames that are already lossy.
"""
import sys, struct, pathlib

def set_loop(path, count):
    data = bytearray(pathlib.Path(path).read_bytes())
    i = data.find(b'ANIM')
    if i < 0:
        raise SystemExit(f'{path}: no ANIM chunk (not an animated WebP)')
    off = i + 4 + 4 + 4
    before = struct.unpack_from('<H', data, off)[0]
    struct.pack_into('<H', data, off, count)
    pathlib.Path(path).write_bytes(bytes(data))
    return before, count

if __name__ == '__main__':
    count = int(sys.argv[1])
    for p in sys.argv[2:]:
        b, a = set_loop(p, count)
        print(f'{p}: loop {b} -> {a}')
