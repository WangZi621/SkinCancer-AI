"""Expose intermediate SkinScan tensors as extra ONNX graph outputs so the web app's
"Inside the model" page can show every stage of a real forward pass. Normal scans
fetch only the final output, so this adds no work to them.
Usage: python3 tools/add_explain_outputs.py skinscan-v3.onnx out.onnx"""
import sys, onnx
from onnx import helper, TensorProto
P = 'model_1/efficientnetb4_fbn/efficientnetb4/'
LAYERS = {'norm': P + 'tf.math.multiply_1/Mul_prequant', 'stem': P + 'stem_activation/mul_1_prequant',
          'b2': P + 'block2d_add/add_prequant', 'b3': P + 'block3d_add/add_prequant', 'b4': P + 'block4f_add/add_prequant',
          'b5': P + 'block5f_add/add_prequant', 'b6': P + 'block6h_add/add_prequant', 'top': P + 'top_activation/mul_1_prequant',
          'att': 'model_1/reshape_1/Reshape_prequant', 'gem': 'model_1/gem_pool/Pow_1',
          'imgbn': 'model_1/batch_normalization_5/batchnorm/add_1_prequant',
          'm1': 'model_1/dense_10/mul_1_prequant', 'm2': 'model_1/dense_11/mul_1_prequant', 'm3': 'model_1/dense_12/mul_1_prequant',
          'cat': 'model_1/concatenate_1/concat_prequant', 'h1': 'model_1/dense_13/mul_1_prequant',
          'h2': 'model_1/dense_14/mul_1_prequant', 'h3': 'model_1/dense_15/mul_1_prequant'}
m = onnx.load(sys.argv[1]); g = m.graph
LAYERS['logits'] = next(n for n in g.node if n.op_type == 'Softmax').input[0]
have = {o.name for o in g.output}
for name in LAYERS.values():
    if name not in have:
        g.output.append(helper.make_tensor_value_info(name, TensorProto.FLOAT, None))
onnx.save(m, sys.argv[2]); print('added', len(LAYERS), 'outputs')
