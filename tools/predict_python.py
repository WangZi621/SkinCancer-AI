"""Reference predictions with the Python LiteRT interpreter, using the same
preprocessing as the training notebook (cv2 bilinear resize to 380x380, RGB 0-255)
and the same 17 metadata features as docs/js/model.js.
Usage: python3 tools/predict_python.py MODEL.tflite samples.json IMAGE_DIR OUT.json"""
import json, sys
import numpy as np, cv2
from ai_edge_litert.interpreter import Interpreter

AGE_MEAN, AGE_SD, AGE_FILL, SIZE_FILL = 58.41137842150485, 16.797384722992433, 60, 6.1
SITES = ['anterior torso', 'head/neck', 'lateral torso', 'lower extremity', 'oral/genital', 'palms/soles', 'posterior torso', 'upper extremity']

def encode(p):
    age = p.get('age', AGE_FILL)
    v = np.zeros(17, np.float32)
    v[0] = 1.0 if p.get('sex') == 'male' else 0.0
    v[1] = (age - AGE_MEAN) / AGE_SD
    v[2], v[3], v[4], v[5] = age < 35, 35 <= age < 50, 50 <= age < 65, age >= 65
    if p.get('site') in SITES: v[6 + SITES.index(p['site'])] = 1
    v[14] = (p.get('diameterMm') or SIZE_FILL) / 50
    f = p.get('fitzpatrick'); v[15] = (f if f in (1, 2, 3, 4, 5, 6) else 3) / 6
    m = p.get('melanocytic'); v[16] = 1.0 if m == 'yes' else 0.0 if m == 'no' else 0.5
    return v

def main(model, samples_json, img_dir, out):
    it = Interpreter(model_path=model); it.allocate_tensors()
    ins = it.get_input_details(); outd = it.get_output_details()[0]
    img_d = next(d for d in ins if len(d['shape']) == 4); meta_d = next(d for d in ins if len(d['shape']) == 2)
    size = int(img_d['shape'][1])
    data = json.load(open(samples_json))
    items = data['samples'] if isinstance(data, dict) else data
    res = {}
    for s in items:
        img = cv2.cvtColor(cv2.imread(f"{img_dir}/{s['id']}.jpg"), cv2.COLOR_BGR2RGB)
        x = cv2.resize(img, (size, size), interpolation=cv2.INTER_LINEAR).astype(np.float32)[None]
        it.set_tensor(img_d['index'], x)
        out_p = {}
        for tag, meta in (('with', encode(s['patient'])), ('photo_only', encode({'sex': 'unknown', 'melanocytic': 'unsure'}))):
            it.set_tensor(meta_d['index'], meta[None]); it.invoke()
            out_p[tag] = it.get_tensor(outd['index'])[0].tolist()
        res[s['id']] = {'truth': s.get('truth'), 'diagnosis': s.get('diagnosis'), **out_p}
    json.dump(res, open(out, 'w'), indent=1)
    print('wrote', len(res), 'predictions to', out)

if __name__ == '__main__':
    main(*sys.argv[1:5])
