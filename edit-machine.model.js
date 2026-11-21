window.loadTranscriber = async (onProgress) => {
  const { pipeline, env } = await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.3.1');
  env.allowLocalModels = false;
  return await pipeline('automatic-speech-recognition',
    'onnx-community/whisper-tiny.en_timestamped', {
      dtype: 'q8',
      device: 'wasm',
      progress_callback: onProgress
    });
};
