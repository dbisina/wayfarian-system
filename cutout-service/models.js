'use strict';
// The background-removal models the service can run, and how each one wants its input prepared.
// `isnet-general-use` (DIS, Apache-2.0) sees the photo at 1024 px and keeps thin parts such as spokes
// and mirrors; `silueta` (a compressed U2-Net, MIT) sees 320 px and is kept as a lighter fallback:
// set MODEL_NAME=silueta on the service to roll back without a code change.
// Normalisation and output handling follow rembg's sessions for these models.

const RELEASE = 'https://github.com/danielgatis/rembg/releases/download/v0.0.0';

const MODELS = {
  'isnet-general-use': {
    name: 'isnet-general-use',
    file: 'isnet-general-use.onnx',
    url: `${RELEASE}/isnet-general-use.onnx`,
    md5: 'fc16ebd8b0c10d971d3513d564d01e29',
    minBytes: 100 * 1024 * 1024,
    size: 1024,
    mean: [0.5, 0.5, 0.5],
    std: [1, 1, 1],
  },
  silueta: {
    name: 'silueta',
    file: 'silueta.onnx',
    url: `${RELEASE}/silueta.onnx`,
    md5: null,
    minBytes: 30 * 1024 * 1024,
    size: 320,
    mean: [0.485, 0.456, 0.406],
    std: [0.229, 0.224, 0.225],
  },
};

const DEFAULT_MODEL = 'isnet-general-use';

/** The model named by MODEL_NAME (or the default). An unknown name is an error, never a silent fallback. */
function resolveModel(name = process.env.MODEL_NAME || DEFAULT_MODEL) {
  const model = MODELS[name];
  if (!model) throw new Error(`Unknown MODEL_NAME "${name}". Use one of: ${Object.keys(MODELS).join(', ')}`);
  return model;
}

module.exports = { MODELS, DEFAULT_MODEL, resolveModel };
