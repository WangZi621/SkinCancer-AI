"""Shrink the dequantized float ONNX model (from `tf2onnx --tflite --dequantize`)
by storing Conv / MatMul / Gemm weights as per-channel int8 with DequantizeLinear.
Activations stay float32, so the GeM pooling and attention keep full precision.
The weights came from the INT8 TFLite, so re-quantizing them is close to lossless.

Usage: python3 tools/make_weight_only_onnx.py deq.onnx skinscan-v3.onnx
"""
import sys, numpy as np, onnx
from onnx import numpy_helper, helper, TensorProto

src, dst = sys.argv[1], sys.argv[2]
m = onnx.load(src)
g = m.graph
inits = {i.name: i for i in g.initializer}
consumers = {}
for n in g.node:
    for k, name in enumerate(n.input):
        consumers.setdefault(name, []).append((n, k))

new_inits, new_nodes, done, saved = [], [], set(), 0
for name, init in list(inits.items()):
    w = numpy_helper.to_array(init)
    if w.dtype != np.float32 or w.ndim < 2 or w.size < 1024:
        continue
    uses = consumers.get(name, [])
    if not uses or not all(n.op_type in ('Conv', 'MatMul', 'Gemm') and k == 1 for n, k in uses):
        continue
    n0 = uses[0][0]
    if n0.op_type == 'Conv':
        axis = 0
    elif n0.op_type == 'Gemm':
        tb = next((a.i for a in n0.attribute if a.name == 'transB'), 0)
        axis = 0 if tb else 1
    else:
        axis = w.ndim - 1
    red = tuple(i for i in range(w.ndim) if i != axis)
    scale = np.abs(w).max(axis=red) / 127.0
    scale[scale == 0] = 1e-8
    shape = [1] * w.ndim; shape[axis] = -1
    q = np.clip(np.round(w / scale.reshape(shape)), -127, 127).astype(np.int8)
    qn, sn, zn = name + '_q', name + '_scale', name + '_zp'
    new_inits += [numpy_helper.from_array(q, qn), numpy_helper.from_array(scale.astype(np.float32), sn),
                  numpy_helper.from_array(np.zeros(scale.shape, np.int8), zn)]
    new_nodes.append(helper.make_node('DequantizeLinear', [qn, sn, zn], [name], axis=axis, name=name + '_dq'))
    done.add(name); saved += w.nbytes - q.nbytes

keep = [i for i in g.initializer if i.name not in done]
del g.initializer[:]
g.initializer.extend(keep + new_inits)
nodes = list(g.node)
del g.node[:]
g.node.extend(new_nodes + nodes)
onnx.checker.check_model(m)
onnx.save(m, dst)
print(f'quantized {len(done)} weight tensors, saved {saved / 1e6:.1f} MB -> {dst}')
