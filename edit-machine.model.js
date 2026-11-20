window.loadTranscriber = async (onProgress) => {
  const { pipeline, env } = await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.3.1');
  env.allowLocalModels = false;
  const make = (id) => pipeline('automatic-speech-recognition', id, { dtype: 'q8', progress_callback: onProgress });
  try { return await make('onnx-community/whisper-tiny.en'); }
  catch (e) { return await make('Xenova/whisper-tiny.en'); }
};
