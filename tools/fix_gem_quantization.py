"""Fix the GeM pooling step in the INT8 SkinScan TFLite model.

The full-INT8 export quantizes x**p (GeM pooling, p ~ 3) to int8 before the
spatial mean, with a step of about 485. Nearly every image feature rounds to 0,
so the image branch stops mattering. This script reroutes that one MEAN to run
in float32 on the float POW output and removes the QUANTIZE / DEQUANTIZE pair
around it. All weights and every other op stay exactly as exported.

Usage: python3 tools/fix_gem_quantization.py in.tflite out.tflite
"""
import sys, flatbuffers
from ai_edge_litert import schema_py_generated as S

src, dst = sys.argv[1], sys.argv[2]
buf = bytearray(open(src, 'rb').read())
m = S.ModelT.InitFromObj(S.Model.GetRootAsModel(buf, 0))
sg = m.subgraphs[0]
names = {v: k for k, v in vars(S.BuiltinOperator).items() if not k.startswith('_')}
code = lambda op: names[max(m.operatorCodes[op.opcodeIndex].builtinCode, m.operatorCodes[op.opcodeIndex].deprecatedBuiltinCode)]
tname = lambda i: sg.tensors[i].name.decode()

mean_i = next(i for i, op in enumerate(sg.operators) if code(op) == 'MEAN' and 'gem_pool/Mean' in tname(op.outputs[0]))
mean = sg.operators[mean_i]
q_out = mean.inputs[0]                       # int8 x**p
quant_i = next(i for i, op in enumerate(sg.operators) if code(op) == 'QUANTIZE' and op.outputs[0] == q_out)
pow_out = sg.operators[quant_i].inputs[0]    # float x**p
deq_i = next(i for i, op in enumerate(sg.operators) if code(op) == 'DEQUANTIZE' and op.inputs[0] == mean.outputs[0])
float_mean = sg.operators[deq_i].outputs[0]  # float tensor consumed by POW(1/p)
assert sg.tensors[pow_out].type == S.TensorType.FLOAT32 and sg.tensors[float_mean].type == S.TensorType.FLOAT32

mean.inputs = [pow_out] + list(mean.inputs[1:])
mean.outputs = [float_mean]
sg.operators = [op for i, op in enumerate(sg.operators) if i not in (quant_i, deq_i)]

# make every dynamic batch dimension static (LiteRT.js needs static shapes)
for t in sg.tensors:
    if t.shapeSignature is not None and len(t.shapeSignature) and any(int(v) < 0 for v in t.shapeSignature):
        t.shapeSignature = [1 if int(v) < 0 else int(v) for v in t.shapeSignature]

b = flatbuffers.Builder(len(buf) + 1024)
b.Finish(m.Pack(b), file_identifier=b'TFL3')
open(dst, 'wb').write(b.Output())
print(f'rerouted {tname(mean.outputs[0])} to float; removed ops {quant_i} and {deq_i}; wrote {dst}')
