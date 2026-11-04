/**
 * SENTINEL AI SURVEILLANCE & REASONING AGENT
 * Re-architected High-Performance Frontend Controller
 * Minimalist Editorial White & Grey Architecture
 */

const API_BASE = window.location.origin;
let authToken = localStorage.getItem("sentinel_jwt") || null;
let currentCamera = "cam-01-times-square";
let allEvents = [];
let camerasData = [];
let currentOffsetSec = 142.2;
let hlsInstance = null;
let streamEngine = "nvdec"; // Default to hardware-accelerated NVDEC with 2-4s buffer
let currentView = "landing"; // 'landing' | 'stream'

const CAM_EARTHCAM_KEYS = {
  "cam-01-times-square": "tsrobo1",
  "cam-02-abbey-road": "abbeyroad_uk",
  "cam-03-liberty-bell": "libertybell",
};

const CAM_TITLES = {
  "cam-01-times-square": "Times Square South & Broadway (NYC)",
  "cam-02-abbey-road": "Abbey Road Crossing (London, UK)",
  "cam-03-liberty-bell": "The Liberty Bell & Independence Hall (Philadelphia)",
};

const CAM_CODES = {
  "cam-01-times-square": "CAM-01",
  "cam-02-abbey-road": "CAM-02",
  "cam-03-liberty-bell": "CAM-03",
};

// DOM Elements
const authModal = document.getElementById("auth-modal");
const appContainer = document.getElementById("app");
const loginForm = document.getElementById("login-form");
const loginError = document.getElementById("login-error");
const quickFillCreds = document.getElementById("quick-fill-creds");
const userDisplayName = document.getElementById("user-display-name");
const logoutBtn = document.getElementById("logout-btn");
const navBrandLogo = document.getElementById("nav-brand-logo");

// Views
const landingView = document.getElementById("landing-view");
const streamView = document.getElementById("stream-view");
const btnBackToLanding = document.getElementById("btn-back-to-landing");

// Landing Page Elements
const cameraCardsGrid = document.getElementById("camera-cards-grid");
const landingClockBig = document.getElementById("landing-clock-big");
const landingDateDisplay = document.getElementById("landing-date-display");
const systemClockNav = document.getElementById("system-clock-nav");
const insightTotalPersons = document.getElementById("insight-total-persons");
const insightTotalVehicles = document.getElementById("insight-total-vehicles");
const insightTotalParcels = document.getElementById("insight-total-parcels");
const pastAlertsList = document.getElementById("past-alerts-list");
const landingChatForm = document.getElementById("landing-chat-form");
const landingChatInput = document.getElementById("landing-chat-input");
const landingChatSubmit = document.getElementById("landing-chat-submit");
const landingChatResult = document.getElementById("landing-chat-result");

// Stream View Elements
const nativeHlsVideo = document.getElementById("native-hls-video");
const liveAiStream = document.getElementById("live-ai-stream");
const cctvCanvas = document.getElementById("cctv-canvas");
const ctx = cctvCanvas ? cctvCanvas.getContext("2d") : null;
const streamEngineToggle = document.getElementById("stream-engine-toggle");
const mlEngineModeToggle = document.getElementById("ml-engine-mode-toggle");
const streamStatusTag = document.getElementById("stream-status-tag");
const streamCamId = document.getElementById("stream-cam-id");
const streamCamTitle = document.getElementById("stream-cam-title");
const streamChannelSelector = document.getElementById("stream-channel-selector");
const hudStatsTelemetry = document.getElementById("hud-stats-telemetry");
const hudDetectionCount = document.getElementById("hud-detection-count");
const hudFeedSource = document.getElementById("hud-feed-source");
const hudCamTime = document.getElementById("hud-cam-time");
const topHwChip = document.getElementById("top-hw-chip");
window.mlInferenceEngine = "server";
let mlInferenceEngine = "server"; // 'server' | 'webgpu'

// Stream Analytics & Telemetry Elements
const streamCountPersons = document.getElementById("stream-count-persons");
const streamCountVehicles = document.getElementById("stream-count-vehicles");
const streamCountParcels = document.getElementById("stream-count-parcels");
const streamActiveTracksList = document.getElementById("stream-active-tracks-list");
const streamTotalTracksBadge = document.getElementById("stream-total-tracks-badge");
const streamMetricLatency = document.getElementById("stream-metric-latency");
const streamMetricFps = document.getElementById("stream-metric-fps");
const streamMetricPrecision = document.getElementById("stream-metric-precision");
const streamMetricTracker = document.getElementById("stream-metric-tracker");
const streamAnalyticsHeading = document.getElementById("stream-analytics-heading");

// Stream Chat Elements (Bottom Right)
const streamChatForm = document.getElementById("stream-chat-form");
const streamChatInput = document.getElementById("stream-chat-input");
const streamChatSubmit = document.getElementById("stream-chat-submit");
const streamChatResult = document.getElementById("stream-chat-result");

// Scrubber Elements
const timelineTrack = document.getElementById("timeline-track");
const timelineProgress = document.getElementById("timeline-progress");
const timelineScrubber = document.getElementById("timeline-scrubber");
const eventMarkersContainer = document.getElementById("event-markers");
const playbackTimeLabel = document.getElementById("playback-time-label");

/* ================= 1. AUTHENTICATION ================= */
async function checkAuth() {
  if (!authToken) {
    showAuthModal();
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/api/auth/me`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });

    if (res.ok) {
      const data = await res.json();
      if (userDisplayName && data.user) {
        userDisplayName.textContent = data.user.full_name || data.user.username;
      }
      hideAuthModal();
      initApp();
    } else {
      logout();
    }
  } catch (err) {
    showAuthModal();
  }
}

function showAuthModal() {
  if (authModal) authModal.classList.remove("hidden");
  if (appContainer) appContainer.classList.add("hidden");
}

function hideAuthModal() {
  if (authModal) authModal.classList.add("hidden");
  if (appContainer) appContainer.classList.remove("hidden");
}

// Quick fill credentials chip
if (quickFillCreds) {
  quickFillCreds.addEventListener("click", () => {
    const uInput = document.getElementById("login-username");
    const pInput = document.getElementById("login-password");
    if (uInput) uInput.value = "admin";
    if (pInput) pInput.value = "sentinel123";
  });
}

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (loginError) loginError.classList.add("hidden");

  const usernameInput = document.getElementById("login-username");
  const passwordInput = document.getElementById("login-password");
  const username = usernameInput ? usernameInput.value.trim() : "admin";
  const password = passwordInput ? passwordInput.value.trim() : "sentinel123";

  try {
    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    if (res.ok) {
      const data = await res.json();
      authToken = data.access_token;
      localStorage.setItem("sentinel_jwt", authToken);
      if (userDisplayName && data.user) {
        userDisplayName.textContent = data.user.full_name || data.user.username;
      }
      hideAuthModal();
      initApp();
    } else {
      if (loginError) {
        loginError.textContent = "Invalid credentials. Use admin / sentinel123";
        loginError.classList.remove("hidden");
      }
    }
  } catch (err) {
    if (loginError) {
      loginError.textContent = "Server unreachable. Ensure Sentinel backend is active.";
      loginError.classList.remove("hidden");
    }
  }
});

function logout() {
  authToken = null;
  localStorage.removeItem("sentinel_jwt");
  if (hlsInstance) {
    try { hlsInstance.destroy(); } catch (e) {}
    hlsInstance = null;
  }
  showAuthModal();
}

if (logoutBtn) logoutBtn.addEventListener("click", logout);

/* ================= 2. VIEW NAVIGATION ================= */
function showLandingView() {
  currentView = "landing";
  if (landingView) landingView.classList.remove("hidden");
  if (streamView) streamView.classList.add("hidden");

  // Pause stream when returning to hub to save bandwidth & GPU
  if (nativeHlsVideo && !nativeHlsVideo.paused) {
    try { nativeHlsVideo.pause(); } catch (e) {}
  }

  // Refresh camera stats
  fetchCameras();
}

function showStreamView(camId) {
  currentView = "stream";
  if (landingView) landingView.classList.add("hidden");
  if (streamView) streamView.classList.remove("hidden");

  if (camId) {
    switchCameraChannel(camId);
  } else {
    switchCameraChannel(currentCamera);
  }
}

if (btnBackToLanding) {
  btnBackToLanding.addEventListener("click", showLandingView);
}

if (navBrandLogo) {
  navBrandLogo.addEventListener("click", showLandingView);
}

/* ================= 3. INITIALIZATION ================= */
function initApp() {
  startClock();
  fetchCameras();
  fetchEvents();
  setupStreamEngineToggle();
  setupMlEngineModeToggle();
  setupStreamPills();
  setupLandingChat();
  setupStreamChat();
  setupTimelineScrubbing();
  startCctvRenderLoop();
  startFrameInferenceLoop();
}

/* ================= 4. REAL-TIME CLOCK ================= */
function startClock() {
  function updateClock() {
    const now = new Date();
    
    // Format hours, minutes, seconds, am/pm
    let hours = now.getHours();
    const ampm = hours >= 12 ? "PM" : "AM";
    hours = hours % 12 || 12;
    const hoursStr = String(hours).padStart(2, "0");
    const minsStr = String(now.getMinutes()).padStart(2, "0");
    const secsStr = String(now.getSeconds()).padStart(2, "0");
    const fullTimeStr = `${hoursStr}:${minsStr}:${secsStr} ${ampm}`;

    // Update Nav Clock
    if (systemClockNav) {
      systemClockNav.textContent = fullTimeStr;
    }

    // Update Landing Big Chronometer
    if (landingClockBig) {
      landingClockBig.innerHTML = `${hoursStr}:${minsStr}:${secsStr} <span class="ampm">${ampm}</span>`;
    }

    // Update Date Display
    if (landingDateDisplay) {
      const options = { weekday: "long", year: "numeric", month: "long", day: "numeric" };
      landingDateDisplay.textContent = now.toLocaleDateString("en-US", options);
    }

    // Update HUD Cam Time
    if (hudCamTime) {
      hudCamTime.textContent = fullTimeStr;
    }
  }

  updateClock();
  setInterval(updateClock, 1000);
}

/* ================= 5. CAMERAS & LANDING HUB ================= */
async function fetchCameras() {
  try {
    const res = await fetch(`${API_BASE}/api/cameras`);
    if (res.ok) {
      const data = await res.json();
      camerasData = data.cameras || [];
      renderCameraCards(camerasData);

      if (data.summary) {
        if (insightTotalPersons) insightTotalPersons.textContent = data.summary.total_persons || "28";
        if (insightTotalVehicles) insightTotalVehicles.textContent = data.summary.total_vehicles || "14";
        if (insightTotalParcels) insightTotalParcels.textContent = data.summary.total_parcels || "3";
      }
    }
  } catch (err) {
    console.warn("Failed to fetch cameras:", err);
  }
}

function renderCameraCards(cameras) {
  if (!cameraCardsGrid) return;
  cameraCardsGrid.innerHTML = "";

  cameras.forEach((cam, idx) => {
    const card = document.createElement("div");
    card.className = "cam-card";
    card.dataset.cam = cam.id;

    const pCount = cam.counts ? cam.counts.person : 0;
    const vCount = cam.counts ? cam.counts.vehicle : 0;
    const iCount = cam.counts ? cam.counts.parcel : 0;
    const camCode = CAM_CODES[cam.id] || `CAM-0${idx + 1}`;

    card.innerHTML = `
      <div>
        <div class="cam-card-top">
          <span class="cam-id-tag">${camCode}</span>
          <span class="cam-status-pill">
            <span class="pulse-dot"></span>
            ${cam.status || "ONLINE"} &bull; ${cam.resolution || "4K HDR"}
          </span>
        </div>

        <h3 class="cam-card-title">${cam.name}</h3>
        <p class="cam-card-location">${cam.location} &bull; ${cam.stream_provider || 'EarthCam Live'}</p>

        <div class="cam-detections-row">
          <div class="det-pill human">
            <span>&#128100;</span>
            <span><strong>${pCount}</strong> Humans</span>
          </div>
          <div class="det-pill vehicle">
            <span>&#128663;</span>
            <span><strong>${vCount}</strong> Vehicles</span>
          </div>
          <div class="det-pill parcel">
            <span>&#128230;</span>
            <span><strong>${iCount}</strong> Items</span>
          </div>
        </div>
      </div>

      <div class="cam-card-cta">
        <span>Open Stream &amp; YOLO Pipeline</span>
        <span class="cta-arrow">&rarr;</span>
      </div>
    `;

    card.addEventListener("click", () => {
      showStreamView(cam.id);
    });

    cameraCardsGrid.appendChild(card);
  });
}

// Switch Camera in Stream View
async function switchCameraChannel(camId) {
  currentCamera = camId;

  // Clear tracks immediately to prevent visual ghosting
  persistentTracks.clear();
  if (typeof webgpuEngine !== "undefined") webgpuEngine.resetTracks();
  if (ctx && cctvCanvas) ctx.clearRect(0, 0, cctvCanvas.width, cctvCanvas.height);

  // Update Header UI
  if (streamCamId) streamCamId.textContent = CAM_CODES[camId] || "CAM-01";
  if (streamCamTitle) streamCamTitle.textContent = CAM_TITLES[camId] || camId;
  if (streamAnalyticsHeading) streamAnalyticsHeading.textContent = `${CAM_CODES[camId]} Current Detections`;
  if (hudFeedSource) {
    if (mlInferenceEngine === "webgpu") {
      hudFeedSource.textContent = `${(CAM_TITLES[camId] || camId).toUpperCase()} // YOLOv8 CLIENT WEBGPU (IN-BROWSER)`;
    } else {
      hudFeedSource.textContent = `${(CAM_TITLES[camId] || camId).toUpperCase()} // YOLOv8 FP16 (RTX 3050)`;
    }
  }

  // Update Active Pills in Stream Top Bar
  document.querySelectorAll(".stream-pill").forEach((pill) => {
    if (pill.dataset.cam === camId) {
      pill.classList.add("active");
    } else {
      pill.classList.remove("active");
    }
  });

  // Call Backend to switch channel & reset ByteTrack
  try {
    await fetch(`${API_BASE}/api/stream/channel/switch`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authToken ? `Bearer ${authToken}` : "",
      },
      body: JSON.stringify({ channel_id: camId }),
    });
  } catch (e) {
    console.warn("Backend channel switch notify:", e);
  }

  // Load HLS Stream
  initHlsPlayer(CAM_EARTHCAM_KEYS[camId] || "tsrobo1");
}

function setupStreamPills() {
  document.querySelectorAll(".stream-pill").forEach((pill) => {
    pill.addEventListener("click", () => {
      switchCameraChannel(pill.dataset.cam);
    });
  });
}

/* ================= 6. HLS VIDEO STREAMING ================= */
function initHlsPlayer(camKey = "tsrobo1") {
  if (!nativeHlsVideo) return;
  const streamUrl = `${API_BASE}/api/stream/earthcam/live.m3u8?cam=${camKey}`;

  if (hlsInstance) {
    try { hlsInstance.destroy(); } catch (e) {}
    hlsInstance = null;
  }

  if (window.Hls && Hls.isSupported()) {
    hlsInstance = new Hls({
      enableWorker: true,
      lowLatencyMode: false,
      // 2-4 second jitter buffer configuration
      backBufferLength: 10,
      maxBufferLength: 4,              // Max 4-second buffer
      maxMaxBufferLength: 8,
      liveSyncDurationCount: 3,        // 3-segment buffer (approx 2-4s)
      liveMaxLatencyDurationCount: 5,  // Catch up if lagging
      liveDurationInfinity: true,
      highBufferWatchdogPeriod: 2,
    });

    hlsInstance.loadSource(streamUrl);
    hlsInstance.attachMedia(nativeHlsVideo);

    hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
      nativeHlsVideo.play().catch((e) => console.log("HLS video ready to play:", e));
    });

    hlsInstance.on(Hls.Events.ERROR, (event, data) => {
      if (data.fatal) {
        switch (data.type) {
          case Hls.ErrorTypes.NETWORK_ERROR:
            hlsInstance.startLoad();
            break;
          case Hls.ErrorTypes.MEDIA_ERROR:
            hlsInstance.recoverMediaError();
            break;
          default:
            hlsInstance.destroy();
            break;
        }
      }
    });
  } else if (nativeHlsVideo.canPlayType("application/vnd.apple.mpegurl")) {
    nativeHlsVideo.src = streamUrl;
    nativeHlsVideo.play().catch((e) => console.log(e));
  }
}

function setupStreamEngineToggle() {
  if (!streamEngineToggle) return;

  streamEngineToggle.addEventListener("click", () => {
    if (streamEngine === "nvdec") {
      streamEngine = "mjpeg";
      nativeHlsVideo.classList.add("hidden");
      try { nativeHlsVideo.pause(); } catch (e) {}
      cctvCanvas.classList.add("hidden");
      liveAiStream.classList.remove("hidden");
      liveAiStream.src = `${API_BASE}/api/stream/live/detected.mjpg?channel=${currentCamera}&t=${Date.now()}`;
      streamEngineToggle.textContent = "DECODE: MJPEG (0s)";
      streamEngineToggle.classList.remove("badge-orange");
    } else {
      streamEngine = "nvdec";
      liveAiStream.classList.add("hidden");
      liveAiStream.src = "";
      nativeHlsVideo.classList.remove("hidden");
      cctvCanvas.classList.remove("hidden");
      initHlsPlayer(CAM_EARTHCAM_KEYS[currentCamera]);
      streamEngineToggle.textContent = "DECODE: NVDEC";
      streamEngineToggle.classList.add("badge-orange");
    }
  });
}

/* ================= 6B. CLIENT-SIDE WEBGPU INFERENCE ENGINE ================= */
const WEBGPU_TARGET_CLASSES = {
  0: "person",
  2: "car",
  3: "motorcycle",
  5: "bus",
  7: "truck",
  24: "backpack",
  26: "handbag",
  28: "suitcase",
};
const WEBGPU_TARGET_IDS = [0, 2, 3, 5, 7, 24, 26, 28];

class SentinelWebGPUEngine {
  constructor() {
    this.session = null;
    this.isInitializing = false;
    this.provider = "Uninitialized";
    this.activeTracks = new Map();
    this.trackIdCounter = 1;

    // Fast off-screen pre-processing canvas (480x480)
    this.canvas = document.createElement("canvas");
    this.canvas.width = 480;
    this.canvas.height = 480;
    this.ctx = this.canvas.getContext("2d", { willReadFrequently: true });

    // Pre-allocated LUT (Lookup Table) for 0-255 -> 0.0-1.0 float normalization
    this.lut = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
      this.lut[i] = i * 0.00392156862745098; // 1 / 255
    }

    // Pre-allocated planar Float32Array [3, 480, 480]
    this.floatArr = new Float32Array(3 * 480 * 480);
  }

  async init() {
    if (this.session) return true;
    if (this.isInitializing) {
      // Wait for in-flight initialization to complete
      while (this.isInitializing) {
        await new Promise((r) => setTimeout(r, 80));
      }
      return Boolean(this.session);
    }
    this.isInitializing = true;

    try {
      if (typeof ort === "undefined") {
        console.warn("[WebGPU Engine] ONNX Runtime Web library not detected yet.");
        this.isInitializing = false;
        return false;
      }

      ort.env.wasm.wasmPaths = "/static/vendor/";
      ort.env.wasm.numThreads = 1;

      // Check if WebGPU is supported by the client browser
      const hasWebGPU = typeof navigator !== "undefined" && Boolean(navigator.gpu);
      console.log(`[WebGPU Engine] WebGPU hardware support: ${hasWebGPU}`);

      const sessionOptions = {
        executionProviders: hasWebGPU
          ? [
              {
                name: "webgpu",
                deviceType: "gpu",
                powerPreference: "high-performance",
              },
              "wasm",
            ]
          : ["wasm"],
        graphOptimizationLevel: "all",
      };

      this.session = await ort.InferenceSession.create("/static/models/yolov8n.onnx", sessionOptions);
      this.provider = hasWebGPU ? "WebGPU" : "WASM";
      console.log(`[WebGPU Engine] Loaded successfully with ${this.provider} backend.`);

      // Warm up model pipeline with a zero tensor
      const dummyInput = new ort.Tensor("float32", new Float32Array(3 * 480 * 480), [1, 3, 480, 480]);
      await this.session.run({ images: dummyInput });
      console.log("[WebGPU Engine] Pipeline warmed up and ready.");

      this.isInitializing = false;
      return true;
    } catch (err) {
      console.warn("[WebGPU Engine] Primary WebGPU init failed, attempting pure WASM fallback:", err);
      try {
        this.session = await ort.InferenceSession.create("/static/models/yolov8n.onnx", {
          executionProviders: ["wasm"],
        });
        this.provider = "WASM";
        this.isInitializing = false;
        return true;
      } catch (fallbackErr) {
        console.error("[WebGPU Engine] Failed to initialize in-browser ONNX model:", fallbackErr);
        this.isInitializing = false;
        return false;
      }
    }
  }

  async detectFrame(videoEl) {
    if (!this.session || !videoEl || videoEl.paused || videoEl.readyState < 2) return null;

    // 1. Draw frame to 480x480 offscreen canvas
    this.ctx.drawImage(videoEl, 0, 0, 480, 480);
    const imgData = this.ctx.getImageData(0, 0, 480, 480).data;

    // 2. Preprocess to CHW planar format using pre-computed LUT
    const numPixels = 480 * 480;
    let p1 = 0, p2 = numPixels, p3 = numPixels * 2;
    const lut = this.lut;
    const floatArr = this.floatArr;
    for (let i = 0; i < imgData.length; i += 4) {
      floatArr[p1++] = lut[imgData[i]];
      floatArr[p2++] = lut[imgData[i + 1]];
      floatArr[p3++] = lut[imgData[i + 2]];
    }

    const inputTensor = new ort.Tensor("float32", floatArr, [1, 3, 480, 480]);

    // 3. Run Inference on Client Device
    const t0 = performance.now();
    const feeds = { images: inputTensor };
    const results = await this.session.run(feeds);
    const latencyMs = performance.now() - t0;

    // 4. Parse YOLOv8 Output [1, 84, 4725]
    const outputName = this.session.outputNames[0];
    const output = results[outputName].data; // Flat Float32Array

    const candidates = [];
    const NUM_ANCHORS = 4725;
    const CONF_THRESHOLD = 0.35;

    for (let a = 0; a < NUM_ANCHORS; a++) {
      let bestScore = 0;
      let bestClassId = -1;

      for (let k = 0; k < WEBGPU_TARGET_IDS.length; k++) {
        const clsId = WEBGPU_TARGET_IDS[k];
        const score = output[(4 + clsId) * NUM_ANCHORS + a];
        if (score > bestScore) {
          bestScore = score;
          bestClassId = clsId;
        }
      }

      if (bestScore >= CONF_THRESHOLD) {
        const cx = output[a];
        const cy = output[NUM_ANCHORS + a];
        const w = output[2 * NUM_ANCHORS + a];
        const h = output[3 * NUM_ANCHORS + a];

        const x1 = Math.max(0.0, Math.min(1.0, (cx - w / 2) / 480.0));
        const y1 = Math.max(0.0, Math.min(1.0, (cy - h / 2) / 480.0));
        const x2 = Math.max(0.0, Math.min(1.0, (cx + w / 2) / 480.0));
        const y2 = Math.max(0.0, Math.min(1.0, (cy + h / 2) / 480.0));

        if (x2 - x1 >= 0.015 && y2 - y1 >= 0.015) {
          candidates.push({
            classId: bestClassId,
            className: WEBGPU_TARGET_CLASSES[bestClassId],
            score: bestScore,
            bbox: [x1, y1, x2, y2],
          });
        }
      }
    }

    // 5. Non-Maximum Suppression (NMS)
    candidates.sort((a, b) => b.score - a.score);
    const selected = [];
    const IOU_THRESHOLD = 0.45;

    for (let i = 0; i < candidates.length && selected.length < 35; i++) {
      const cand = candidates[i];
      let discard = false;
      for (let j = 0; j < selected.length; j++) {
        if (this.computeIoU(cand.bbox, selected[j].bbox) > IOU_THRESHOLD) {
          discard = true;
          break;
        }
      }
      if (!discard) {
        selected.push(cand);
      }
    }

    // 6. Persistent Spatial Tracking Association
    const tracks = this.associateTracks(selected);

    // 7. Entity Counts
    let pCount = 0, vCount = 0, parcelCount = 0;
    for (const t of tracks) {
      if (t.class === "person") pCount++;
      else if (["car", "bus", "truck", "motorcycle"].includes(t.class)) vCount++;
      else parcelCount++;
    }

    const fps = Math.round(1000 / Math.max(latencyMs, 1));

    return {
      tracks: tracks,
      detections: tracks,
      counts: {
        person: pCount,
        vehicle: vCount,
        parcel: parcelCount,
      },
      latency_ms: Math.round(latencyMs * 10) / 10,
      fps: fps,
      device: `Client ${this.provider}`,
    };
  }

  computeIoU(boxA, boxB) {
    const xA = Math.max(boxA[0], boxB[0]);
    const yA = Math.max(boxA[1], boxB[1]);
    const xB = Math.min(boxA[2], boxB[2]);
    const yB = Math.min(boxA[3], boxB[3]);

    const interWidth = Math.max(0, xB - xA);
    const interHeight = Math.max(0, yB - yA);
    const interArea = interWidth * interHeight;

    const areaA = (boxA[2] - boxA[0]) * (boxA[3] - boxA[1]);
    const areaB = (boxB[2] - boxB[0]) * (boxB[3] - boxB[1]);
    const unionArea = areaA + areaB - interArea;

    return unionArea <= 0 ? 0 : interArea / unionArea;
  }

  associateTracks(detections) {
    const now = Date.now();
    const matchedTrackIds = new Set();
    const resultTracks = [];

    for (const det of detections) {
      let bestId = null;
      let bestDist = 0.16; // Max centroid distance threshold (16% of frame)

      const detCx = (det.bbox[0] + det.bbox[2]) / 2;
      const detCy = (det.bbox[1] + det.bbox[3]) / 2;

      for (const [id, prevTrack] of this.activeTracks.entries()) {
        if (matchedTrackIds.has(id)) continue;
        if (prevTrack.class !== det.className) continue;

        const prevCx = (prevTrack.bbox_norm[0] + prevTrack.bbox_norm[2]) / 2;
        const prevCy = (prevTrack.bbox_norm[1] + prevTrack.bbox_norm[3]) / 2;
        const dist = Math.hypot(detCx - prevCx, detCy - prevCy);

        if (dist < bestDist) {
          bestDist = dist;
          bestId = id;
        }
      }

      let trackId;
      if (bestId !== null) {
        trackId = bestId;
      } else {
        trackId = this.trackIdCounter++;
        if (this.trackIdCounter > 9999) this.trackIdCounter = 1;
      }

      matchedTrackIds.add(trackId);

      let category = "parcel";
      if (det.className === "person") category = "person";
      else if (["car", "bus", "truck", "motorcycle"].includes(det.className)) category = "vehicle";

      const trackObj = {
        id: trackId,
        class: det.className,
        category: category,
        conf: Math.round(det.score * 100) / 100,
        bbox_norm: [
          Math.round(det.bbox[0] * 10000) / 10000,
          Math.round(det.bbox[1] * 10000) / 10000,
          Math.round(det.bbox[2] * 10000) / 10000,
          Math.round(det.bbox[3] * 10000) / 10000,
        ],
        lastSeen: now,
      };

      this.activeTracks.set(trackId, trackObj);
      resultTracks.push(trackObj);
    }

    // Expire tracks lost for > 600ms
    for (const [id, t] of this.activeTracks.entries()) {
      if (now - t.lastSeen > 600) {
        this.activeTracks.delete(id);
      }
    }

    return resultTracks;
  }

  resetTracks() {
    this.activeTracks.clear();
    this.trackIdCounter = 1;
  }
}

window.webgpuEngine = new SentinelWebGPUEngine();
const webgpuEngine = window.webgpuEngine;

// Pre-cache in-browser model during idle time (non-blocking)
if (typeof window !== "undefined") {
  setTimeout(() => {
    if (window.webgpuEngine && !window.webgpuEngine.session) {
      console.log("[Sentinel] Background pre-caching client model into browser memory...");
      window.webgpuEngine.init().catch((e) => console.log("[Sentinel] Background model prewarm:", e));
    }
  }, 2500);
}

function setupMlEngineModeToggle() {
  if (!mlEngineModeToggle) return;

  mlEngineModeToggle.addEventListener("click", async () => {
    if (mlInferenceEngine === "server") {
      // Switch from Server GPU to Client WebGPU
      mlInferenceEngine = "webgpu";
      window.mlInferenceEngine = "webgpu";
      mlEngineModeToggle.textContent = "ENGINE: CLIENT WEBGPU";
      mlEngineModeToggle.classList.add("badge-webgpu-active");

      if (streamStatusTag) {
        streamStatusTag.textContent = "WEBGPU: INITIALIZING...";
        streamStatusTag.classList.add("badge-webgpu-tag");
      }
      if (hudFeedSource) {
        hudFeedSource.textContent = `${(CAM_TITLES[currentCamera] || "CCTV").toUpperCase()} // YOLOv8 CLIENT WEBGPU (IN-BROWSER)`;
      }
      if (streamMetricPrecision) streamMetricPrecision.textContent = "FP32 / FP16 WEBGPU";
      if (streamMetricTracker) streamMetricTracker.textContent = "In-Browser ONNX";
      if (topHwChip) topHwChip.textContent = "CLIENT WEBGPU • IN-BROWSER INFERENCE • 0% HOST LOAD";

      // Initialize session if not loaded
      const ready = await webgpuEngine.init();
      console.log("[Toggle Click] Engine init returned:", ready, "Session:", Boolean(webgpuEngine.session));
      if (!ready) {
        if (streamStatusTag) streamStatusTag.textContent = "WEBGPU: UNAVAILABLE";
        setTimeout(() => {
          // Revert cleanly if WebGPU unavailable on this client
          mlInferenceEngine = "server";
          window.mlInferenceEngine = "server";
          mlEngineModeToggle.textContent = "ENGINE: SERVER GPU";
          mlEngineModeToggle.classList.remove("badge-webgpu-active");
          if (streamStatusTag) {
            streamStatusTag.textContent = "YOLO ON FEED: ACTIVE";
            streamStatusTag.classList.remove("badge-webgpu-tag");
          }
        }, 1500);
      } else {
        if (streamStatusTag) streamStatusTag.textContent = "WEBGPU ON FEED: ACTIVE";
      }
    } else {
      // Switch back to Server GPU (RTX 3050 FP16)
      mlInferenceEngine = "server";
      window.mlInferenceEngine = "server";
      mlEngineModeToggle.textContent = "ENGINE: SERVER GPU";
      mlEngineModeToggle.classList.remove("badge-webgpu-active");

      if (streamStatusTag) {
        streamStatusTag.textContent = "YOLO ON FEED: ACTIVE";
        streamStatusTag.classList.remove("badge-webgpu-tag");
      }
      if (hudFeedSource) {
        hudFeedSource.textContent = `${(CAM_TITLES[currentCamera] || "CCTV").toUpperCase()} // YOLOv8 REAL-TIME (RTX 3050)`;
      }
      if (streamMetricPrecision) streamMetricPrecision.textContent = "FP16 CUDA";
      if (streamMetricTracker) streamMetricTracker.textContent = "ByteTrack v2";
      if (topHwChip) topHwChip.textContent = "RTX 3050 • FP16 TENSOR CORES • BYTETRACK";
    }
  });
}

/* ================= 7. ML INFERENCE ON FEED & BYTETRACK ================= */
let isDetecting = false;
const captureCanvas = document.createElement("canvas");
captureCanvas.width = 640;
captureCanvas.height = 360;
const captureCtx = captureCanvas.getContext("2d", { willReadFrequently: true });

// Persistent track dictionary keyed by ByteTrack persistent track ID
const persistentTracks = new Map();

function updatePersistentTracks(newDetections) {
  const now = Date.now();
  const seenIds = new Set();
  const cw = cctvCanvas ? cctvCanvas.width : 960;
  const ch = cctvCanvas ? cctvCanvas.height : 540;

  for (const det of newDetections) {
    const id = det.id;
    seenIds.add(id);

    const targetBbox = det.bbox_norm
      ? [
          det.bbox_norm[0] * cw,
          det.bbox_norm[1] * ch,
          det.bbox_norm[2] * cw,
          det.bbox_norm[3] * ch,
        ]
      : (det.bbox || [0, 0, 0, 0]);

    if (persistentTracks.has(id)) {
      const t = persistentTracks.get(id);
      t.targetBbox = targetBbox;
      t.class = det.class;
      t.conf = det.conf;
      t.lastSeen = now;
      t.alpha = 1.0;
    } else {
      persistentTracks.set(id, {
        id: id,
        bbox: [...targetBbox],
        targetBbox: [...targetBbox],
        class: det.class,
        conf: det.conf,
        lastSeen: now,
        alpha: 1.0,
      });
    }
  }

  // Gracefully retire tracks not detected for > 450ms (prevents single-frame blinking)
  for (const [id, t] of persistentTracks.entries()) {
    if (!seenIds.has(id)) {
      const age = now - t.lastSeen;
      if (age > 450) {
        persistentTracks.delete(id);
      } else {
        t.alpha = Math.max(0.1, 1.0 - (age / 450));
      }
    }
  }
}

async function detectCurrentFeedFrame() {
  if (isDetecting || currentView !== "stream" || streamEngine !== "nvdec" || !nativeHlsVideo) return;
  if (nativeHlsVideo.paused || nativeHlsVideo.ended || nativeHlsVideo.readyState < 2) return;

  isDetecting = true;
  try {
    // Capture the exact video frame currently displayed on the website
    captureCtx.drawImage(nativeHlsVideo, 0, 0, 640, 360);

    const blob = await new Promise((resolve) => {
      captureCanvas.toBlob(resolve, "image/jpeg", 0.70);
    });

    if (!blob) {
      isDetecting = false;
      return;
    }

    const formData = new FormData();
    formData.append("file", blob, "feed_frame.jpg");

    const res = await fetch(`${API_BASE}/api/ml/detect`, {
      method: "POST",
      body: formData,
    });

    if (res.ok) {
      const data = await res.json();
      const tracks = data.tracks || data.detections || [];
      updatePersistentTracks(tracks);
      updateStreamAnalytics(data, tracks);

      if (hudStatsTelemetry) {
        hudStatsTelemetry.textContent = `LATENCY: ${data.latency_ms}ms • ${data.fps} FPS (YOLOv8 FP16 BYTETRACK)`;
      }

      if (hudDetectionCount && data.counts) {
        const total = data.counts.person + data.counts.vehicle + data.counts.parcel;
        hudDetectionCount.textContent = `DETECTED: ${data.counts.person} HUMANS, ${data.counts.vehicle} VEHICLES`;
        if (streamStatusTag) {
          streamStatusTag.textContent = `YOLO ON FEED: ${total} DETECTED`;
        }
      }
    }
  } catch (err) {
    // network retry
  } finally {
    isDetecting = false;
  }
}

function updateStreamAnalytics(data, tracks) {
  if (currentView !== "stream") return;

  if (data.counts) {
    if (streamCountPersons) streamCountPersons.textContent = data.counts.person || 0;
    if (streamCountVehicles) streamCountVehicles.textContent = data.counts.vehicle || 0;
    if (streamCountParcels) streamCountParcels.textContent = data.counts.parcel || 0;
  }

  if (streamMetricLatency && data.latency_ms !== undefined) {
    streamMetricLatency.textContent = `${data.latency_ms}ms`;
  }

  if (streamMetricFps && data.fps !== undefined) {
    streamMetricFps.textContent = `${data.fps} FPS`;
  }

  if (streamTotalTracksBadge) {
    streamTotalTracksBadge.textContent = `${tracks.length} Objects`;
  }

  if (streamActiveTracksList) {
    if (tracks.length === 0) {
      streamActiveTracksList.innerHTML = `<span style="font-size: 10px; color: var(--text-muted); font-style: italic;">No active objects in frame</span>`;
    } else {
      streamActiveTracksList.innerHTML = tracks.map((t) => {
        let chipClass = "track-chip-person";
        let icon = "&#128100;";
        if (["vehicle", "car", "bus", "truck", "motorcycle"].includes(t.class)) {
          chipClass = "track-chip-vehicle";
          icon = "&#128663;";
        } else if (["parcel", "suitcase", "backpack", "handbag"].includes(t.class)) {
          chipClass = "track-chip-parcel";
          icon = "&#128230;";
        }
        return `<span class="track-chip ${chipClass}">${icon} ${t.class.toUpperCase()} #${t.id} (${Math.round(t.conf * 100)}%)</span>`;
      }).join("");
    }
  }
}

function startFrameInferenceLoop() {
  function loop() {
    if (currentView === "stream" && streamEngine === "nvdec" && nativeHlsVideo && !nativeHlsVideo.paused && nativeHlsVideo.readyState >= 2) {
      if (mlInferenceEngine === "webgpu") {
        if (!isDetecting) {
          isDetecting = true;
          (async () => {
            try {
              if (!webgpuEngine.session) {
                await webgpuEngine.init();
              }
              const data = await webgpuEngine.detectFrame(nativeHlsVideo);
              if (data && mlInferenceEngine === "webgpu") {
                const tracks = data.tracks || [];
                updatePersistentTracks(tracks);
                updateStreamAnalytics(data, tracks);
                if (hudStatsTelemetry) {
                  hudStatsTelemetry.textContent = `LATENCY: ${data.latency_ms}ms • ${data.fps} FPS (${data.device.toUpperCase()})`;
                }
                if (hudDetectionCount && data.counts) {
                  const total = data.counts.person + data.counts.vehicle + data.counts.parcel;
                  hudDetectionCount.textContent = `DETECTED: ${data.counts.person} HUMANS, ${data.counts.vehicle} VEHICLES`;
                  if (streamStatusTag) {
                    streamStatusTag.textContent = `WEBGPU: ${total} ACTIVE`;
                  }
                }
              }
            } catch (err) {
              console.warn("[WebGPU] Detection loop warning:", err);
            } finally {
              isDetecting = false;
            }
          })();
        }
        setTimeout(loop, 25);
      } else {
        // SERVER GPU MODE (100% UNCHANGED)
        detectCurrentFeedFrame().then(() => {
          setTimeout(loop, 30);
        }).catch(() => {
          setTimeout(loop, 50);
        });
      }
    } else {
      setTimeout(loop, 80);
    }
  }

  loop();
}

/* ================= 8. CCTV CANVAS RENDERER ================= */
function startCctvRenderLoop() {
  function render() {
    if (ctx && cctvCanvas) {
      ctx.clearRect(0, 0, cctvCanvas.width, cctvCanvas.height);

      if (currentView === "stream" && streamEngine === "nvdec") {
        for (const [id, t] of persistentTracks.entries()) {
          // Smooth Exponential Moving Average position tracking
          t.bbox[0] += (t.targetBbox[0] - t.bbox[0]) * 0.35;
          t.bbox[1] += (t.targetBbox[1] - t.bbox[1]) * 0.35;
          t.bbox[2] += (t.targetBbox[2] - t.bbox[2]) * 0.35;
          t.bbox[3] += (t.targetBbox[3] - t.bbox[3]) * 0.35;

          const x = t.bbox[0];
          const y = t.bbox[1];
          const w = Math.max(12, t.bbox[2] - t.bbox[0]);
          const h = Math.max(12, t.bbox[3] - t.bbox[1]);

          let color = "#00E676"; // Emerald for persons
          if (["vehicle", "car", "bus", "truck", "motorcycle"].includes(t.class)) {
            color = "#0284C7"; // Cyan for vehicles
          } else if (["parcel", "suitcase", "backpack", "handbag"].includes(t.class)) {
            color = "#FF4E00"; // Orange for parcels
          }

          const label = `${t.class.toUpperCase()} #${id} ${Math.round(t.conf * 100)}%`;
          drawTargetBox(ctx, x, y, w, h, label, color, false, t.alpha);
        }
      }
    }

    requestAnimationFrame(render);
  }

  requestAnimationFrame(render);
}

function drawTargetBox(ctx, x, y, w, h, label, color, isAlert = false, alpha = 1.0) {
  ctx.save();
  ctx.globalAlpha = Math.max(0.05, alpha || 1.0);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;

  // Corner brackets style
  const corner = 14;
  ctx.beginPath();
  // Top-left
  ctx.moveTo(x, y + corner);
  ctx.lineTo(x, y);
  ctx.lineTo(x + corner, y);
  // Top-right
  ctx.moveTo(x + w - corner, y);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x + w, y + corner);
  // Bottom-right
  ctx.moveTo(x + w, y + h - corner);
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x + w - corner, y + h);
  // Bottom-left
  ctx.moveTo(x + corner, y + h);
  ctx.lineTo(x, y + h);
  ctx.lineTo(x, y + h - corner);
  ctx.stroke();

  // Box fill
  ctx.fillStyle = isAlert ? "rgba(255, 78, 0, 0.12)" : "rgba(255, 255, 255, 0.04)";
  ctx.fillRect(x, y, w, h);

  // Label tag
  ctx.font = "11px 'JetBrains Mono', monospace";
  const tagW = ctx.measureText(label).width + 12;
  ctx.fillStyle = color;
  ctx.fillRect(x, y - 20, tagW, 20);
  ctx.fillStyle = "#FFFFFF";
  ctx.fillText(label, x + 6, y - 6);

  ctx.restore();
}

/* ================= 9. SURVEILLANCE EVENTS & ALERTS ================= */
async function fetchEvents() {
  try {
    const res = await fetch(`${API_BASE}/api/events`);
    if (res.ok) {
      const data = await res.json();
      allEvents = data.events || [];
      renderPastAlerts();
      renderTimelineMarkers();
    }
  } catch (err) {
    console.warn("Failed to fetch events:", err);
  }
}

function renderPastAlerts(filter = "all") {
  if (!pastAlertsList) return;
  pastAlertsList.innerHTML = "";

  const filtered = allEvents.filter((ev) => {
    if (filter === "all") return true;
    return ev.object_class.toLowerCase() === filter.toLowerCase();
  });

  if (filtered.length === 0) {
    pastAlertsList.innerHTML = `<div style="color: var(--text-muted); font-size: 12px; padding: 12px; text-align: center;">No alerts matching filter.</div>`;
    return;
  }

  filtered.forEach((ev) => {
    const item = document.createElement("div");
    item.className = "alert-item";

    const tagClass = `tag-${ev.object_class.toLowerCase()}`;
    const camCode = CAM_CODES[ev.camera_id] || "CAM";

    item.innerHTML = `
      <span class="alert-time">${ev.time_display}</span>
      <span class="alert-cam">${camCode}</span>
      <span class="tag-entity ${tagClass}">${ev.object_class}</span>
      <span class="alert-desc" title="${ev.alert_title || ev.description}">${ev.alert_title || ev.description}</span>
      <button class="btn-inspect" onclick="inspectEvent('${ev.camera_id}', ${ev.video_offset_sec})">View &rarr;</button>
    `;

    pastAlertsList.appendChild(item);
  });
}

window.inspectEvent = function(camId, offsetSec) {
  showStreamView(camId);
  jumpToEvent(offsetSec, camId);
};

// Filter tabs in past alerts
document.querySelectorAll(".alert-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".alert-tab").forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    renderPastAlerts(tab.dataset.filter);
  });
});

/* ================= 10. TIMELINE SCRUBBING ================= */
function renderTimelineMarkers() {
  if (!eventMarkersContainer) return;
  eventMarkersContainer.innerHTML = "";
  allEvents.forEach((ev) => {
    const pct = Math.min(Math.max((ev.video_offset_sec / 240) * 100, 2), 98);
    const tick = document.createElement("div");
    tick.className = `event-tick tick-${ev.object_class.toLowerCase()}`;
    tick.style.left = `${pct}%`;
    tick.title = `${ev.time_display} - ${ev.object_class.toUpperCase()}: ${ev.alert_title || ''}`;
    tick.addEventListener("click", (e) => {
      e.stopPropagation();
      jumpToEvent(ev.video_offset_sec, ev.camera_id);
    });
    eventMarkersContainer.appendChild(tick);
  });
}

function setupTimelineScrubbing() {
  if (!timelineTrack) return;
  timelineTrack.addEventListener("click", (e) => {
    const rect = timelineTrack.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const pct = Math.max(0, Math.min(clickX / rect.width, 1));
    const targetOffset = pct * 240;
    jumpToEvent(targetOffset, currentCamera);
  });
}

window.jumpToEvent = function (offsetSec, camId = null) {
  currentOffsetSec = offsetSec;
  if (camId && camId !== currentCamera) {
    switchCameraChannel(camId);
  }

  const pct = (currentOffsetSec / 240) * 100;
  if (timelineProgress) timelineProgress.style.width = `${pct}%`;
  if (timelineScrubber) timelineScrubber.style.left = `${pct}%`;

  const baseMinutes = 11 * 60 + 30 + Math.floor(currentOffsetSec / 2);
  const hours = Math.floor(baseMinutes / 60) % 12 || 12;
  const mins = baseMinutes % 60;
  const ampm = baseMinutes >= 12 * 60 ? "PM" : "AM";
  const timeFormatted = `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}:22 ${ampm}`;

  if (playbackTimeLabel) playbackTimeLabel.textContent = `${timeFormatted} (${Math.round(currentOffsetSec)}s)`;
  if (hudCamTime) hudCamTime.textContent = timeFormatted;
};

/* ================= 11. CHAT BAR FOR INSIGHTS ================= */
function setupLandingChat() {
  if (landingChatForm) {
    landingChatForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const q = landingChatInput ? landingChatInput.value.trim() : "";
      if (q) runSurveillanceQuery(q);
    });
  }

  document.querySelectorAll(".chat-suggest-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      const q = chip.dataset.query;
      if (landingChatInput) landingChatInput.value = q;
      runSurveillanceQuery(q);
    });
  });
}

async function runSurveillanceQuery(query) {
  if (!landingChatResult) return;
  
  landingChatResult.classList.remove("hidden");
  landingChatResult.innerHTML = `
    <div style="display: flex; align-items: center; gap: 8px; color: var(--text-muted);">
      <span class="pulse-dot"></span>
      <span>Neural reasoning agent analyzing surveillance index across all sectors...</span>
    </div>
  `;

  if (landingChatSubmit) landingChatSubmit.disabled = true;

  try {
    const res = await fetch(`${API_BASE}/api/agent/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    });

    if (res.ok) {
      const data = await res.json();
      renderChatResult(data);
    } else {
      landingChatResult.innerHTML = `<div style="color: #DC2626;">Error obtaining insights. Please retry.</div>`;
    }
  } catch (err) {
    landingChatResult.innerHTML = `<div style="color: #DC2626;">Server error querying reasoning engine.</div>`;
  } finally {
    if (landingChatSubmit) landingChatSubmit.disabled = false;
  }
}

function renderChatResult(data) {
  if (!landingChatResult) return;

  const answer = data.answer || data.synthesis || "Surveillance analysis complete.";
  const status = data.status || "ANALYSIS_COMPLETE";
  const events = data.evidence_events || data.findings || [];

  let evidenceHtml = "";
  if (events.length > 0) {
    evidenceHtml = `
      <div style="margin-top: 10px; display: flex; flex-direction: column; gap: 6px;">
        ${events.slice(0, 3).map((ev) => `
          <div style="display: flex; align-items: center; justify-content: space-between; font-size: 12px; background: #FFF; padding: 6px 10px; border-radius: 4px; border: 1px solid var(--border-subtle);">
            <div>
              <span style="font-family: var(--font-mono); font-weight: 600; color: var(--accent-orange); margin-right: 6px;">${ev.time_display || ev.timestamp}</span>
              <span style="font-weight: 600; margin-right: 6px;">[${ev.camera_name}]:</span>
              <span>${ev.alert_title || ev.description}</span>
            </div>
            <button class="btn-inspect" onclick="inspectEvent('${ev.camera_id}', ${ev.video_offset_sec})">View &rarr;</button>
          </div>
        `).join("")}
      </div>
    `;
  }

  landingChatResult.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
      <h4 class="chat-result-title">Surveillance Intelligence Assessment</h4>
      <span class="threat-pill"><span class="threat-dot"></span>${status}</span>
    </div>
    <p style="color: var(--text-obsidian); margin-bottom: 8px; line-height: 1.5;">${answer}</p>
    ${evidenceHtml}
    <div style="margin-top: 10px; font-size: 11px; font-family: var(--font-mono); color: var(--text-light); text-align: right;">
      Multi-Sector Spatial Verification &bull; Confidence: ${data.confidence || '96%'}
    </div>
  `;
}

/* ================= 12. STREAM VIEW CHAT BOX (BOTTOM RIGHT) ================= */
function setupStreamChat() {
  if (streamChatForm) {
    streamChatForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const q = streamChatInput ? streamChatInput.value.trim() : "";
      if (q) runStreamQuery(q);
    });
  }

  document.querySelectorAll(".stream-chat-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      const q = chip.dataset.query;
      if (streamChatInput) streamChatInput.value = q;
      runStreamQuery(q);
    });
  });
}

async function runStreamQuery(query) {
  if (!streamChatResult) return;
  streamChatResult.classList.remove("hidden");
  streamChatResult.innerHTML = `
    <div style="display: flex; align-items: center; gap: 6px; color: var(--text-muted); font-size: 11px;">
      <span class="pulse-dot"></span>
      <span>Reasoning across ${CAM_TITLES[currentCamera]} live stream...</span>
    </div>
  `;

  if (streamChatSubmit) streamChatSubmit.disabled = true;

  try {
    const res = await fetch(`${API_BASE}/api/agent/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: `${query} [Camera: ${currentCamera}]` }),
    });

    if (res.ok) {
      const data = await res.json();
      const answer = data.answer || data.synthesis || "Sector surveillance analysis complete.";
      const status = data.status || "ANALYSIS_COMPLETE";
      
      streamChatResult.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
          <h4 class="chat-result-title" style="font-size: 14px;">Stream Intelligence</h4>
          <span class="threat-pill" style="font-size: 9px;"><span class="threat-dot"></span>${status}</span>
        </div>
        <p style="color: var(--text-obsidian); font-size: 11px; line-height: 1.4;">${answer}</p>
        <div style="margin-top: 6px; font-size: 10px; font-family: var(--font-mono); color: var(--text-light); text-align: right;">
          ${CAM_CODES[currentCamera]} Spatial Verification &bull; Conf: ${data.confidence || '96%'}
        </div>
      `;
    } else {
      streamChatResult.innerHTML = `<div style="color: #DC2626; font-size: 11px;">Error obtaining insights. Please retry.</div>`;
    }
  } catch (err) {
    streamChatResult.innerHTML = `<div style="color: #DC2626; font-size: 11px;">Server error querying reasoning engine.</div>`;
  } finally {
    if (streamChatSubmit) streamChatSubmit.disabled = false;
  }
}

// Start Application on Load
window.addEventListener("DOMContentLoaded", () => {
  checkAuth();
});
