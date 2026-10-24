"""Rewrite a .tflite so every dynamic batch dimension (-1) becomes 1.
LiteRT.js (browser) needs static input shapes; weights and ops are untouched."""
import sys, flatbuffers
from ai_edge_litert import schema_py_generated as S
src, dst = sys.argv[1], sys.argv[2]
buf = bytearray(open(src, 'rb').read())
m = S.ModelT.InitFromObj(S.Model.GetRootAsModel(buf, 0))
changed = 0
for sg in m.subgraphs:
    for t in sg.tensors:
        sig = t.shapeSignature
        if sig is not None and len(sig) and any(int(v) < 0 for v in sig):
            t.shapeSignature = [1 if int(v) < 0 else int(v) for v in sig]
            if t.shape is not None and len(t.shape):
                t.shape = [1 if int(v) < 0 else int(v) for v in t.shape]
            changed += 1
b = flatbuffers.Builder(len(buf) + 1024)
b.Finish(m.Pack(b), file_identifier=b'TFL3')
open(dst, 'wb').write(b.Output())
print('tensors made static:', changed, '| bytes', len(buf), '->', len(b.Output()))
