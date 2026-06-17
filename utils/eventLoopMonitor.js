let lastCheck = Date.now();
let currentLag = 0;
let peakLag = 0;
const samples = [];
const MAX_SAMPLES = 100;

const startMonitoring = () => {
  lastCheck = Date.now();
  const check = () => {
    const now = Date.now();
    // Expected delay was 200ms, lag is the difference
    const lag = Math.max(0, now - lastCheck - 200);
    currentLag = lag;
    if (lag > peakLag) {
      peakLag = lag;
    }
    samples.push(lag);
    if (samples.length > MAX_SAMPLES) {
      samples.shift();
    }
    lastCheck = now;
    const t = setTimeout(check, 200);
    if (t && t.unref) t.unref();
  };
  const t = setTimeout(check, 200);
  if (t && t.unref) t.unref();
};

const getEventLoopData = () => {
  const sum = samples.reduce((a, b) => a + b, 0);
  const averageLag = samples.length ? (sum / samples.length) : 0;
  
  let status = "Healthy";
  if (currentLag >= 50 || averageLag >= 50) {
    status = "Critical";
  } else if (currentLag >= 15 || averageLag >= 15) {
    status = "Warning";
  }

  return {
    currentLag: Number(currentLag.toFixed(2)),
    averageLag: Number(averageLag.toFixed(2)),
    peakLag: Number(peakLag.toFixed(2)),
    status
  };
};

module.exports = {
  startMonitoring,
  getEventLoopData
};
