class AudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = [];
    this.bufferSize = 2400;
    this.port.onmessage = (event) => {
      if (event.data.type === "setSampleRate") {
        this.bufferSize = event.data.bufferSize || 2400;
        this.port.postMessage({ type: "ready" });
      }
    };
  }

  process(inputs) {
    const inputData = inputs[0]?.[0];
    if (!inputData) return true;

    this.buffer.push(...inputData);

    while (this.buffer.length >= this.bufferSize) {
      const chunk = new Float32Array(this.buffer.slice(0, this.bufferSize));
      this.buffer = this.buffer.slice(this.bufferSize);
      this.port.postMessage({ type: "audioData", data: chunk });
    }
    return true;
  }
}

registerProcessor("audioProcessorWorklet", AudioProcessor);
