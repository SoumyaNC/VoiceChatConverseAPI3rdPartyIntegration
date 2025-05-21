

// public/processor.js

class AudioCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = [];
  }

  process(inputs) {
    const input = inputs[0][0];
    if (input) {
      const floatData = new Float32Array(input);
      const int16Data = new Int16Array(floatData.length);
      for (let i = 0; i < floatData.length; i++) {
        int16Data[i] = floatData[i] * 0x7FFF;
      }
      //this.port.postMessage(int16Data.buffer);
      this.port.postMessage(Int16Array.from(input.map(v => v * 32767)).buffer);

    }
    return true;
  }
}

registerProcessor('audio-capture', AudioCaptureProcessor);
