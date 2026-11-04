/**
 * SENTINEL AI SURVEILLANCE & REASONING AGENT
 * Frontend Controller
 */

const API_BASE = window.location.origin;
let authToken = localStorage.getItem("sentinel_jwt") || null;
let currentCamera = "cam-01-times-square";
let allEvents = [];
let currentOffsetSec = 142.2;
let hlsInstance = null;
let streamEngine = "nvdec"; // Default to hardware-accelerated NVDEC with 2-4s buffer
let activeDetections = [];

const CAM_EARTHCAM_KEYS = {
  "cam-01-times-square": "tsrobo1",
  "cam-02-abbey-road": "abbeyroad_uk",
  "cam-03-liberty-bell": "libertybell",
};

// Elements
const authModal = document.getElementById("auth-modal");
const appContainer = document.getElementById("app");
const loginForm = document.getElementById("login-form");
const loginError = document.getElementById("login-error");
const userDisplayName = document.getElementById("user-display-name");
const logoutBtn = document.getElementById("logout-btn");

const nativeHlsVideo = document.getElementById("native-hls-video");
const streamEngineToggle = document.getElementById("stream-engine-toggle");
const liveAiStream = document.getElementById("live-ai-stream");
const hudStatsTelemetry = document.getElementById("hud-stats-telemetry");
const hudDetectionCount = document.getElementById("hud-detection-count");
const cctvCanvas = document.getElementById("cctv-canvas");
const ctx = cctvCanvas.getContext("2d");
const currentCamId = document.getElementById("current-cam-id");
const currentCamTitle = document.getElementById("current-cam-title");
const streamStatusTag = document.getElementById("stream-status-tag");
const hudFeedSource = document.getElementById("hud-feed-source");
const hudCamTime = document.getElementById("hud-cam-time");
const playbackTimeLabel = document.getElementById("playback-time-label");
const systemClock = document.getElementById("system-clock");

const timelineTrack = document.getElementById("timeline-track");
const timelineProgress = document.getElementById("timeline-progress");
const timelineScrubber = document.getElementById("timeline-scrubber");
const eventMarkersContainer = document.getElementById("event-markers");
const incidentsTbody = document.getElementById("incidents-tbody");

const agentForm = document.getElementById("agent-query-form");
const agentInput = document.getElementById("agent-query-input");
const btnAskSubmit = document.getElementById("btn-ask-submit");
const welcomeCard = document.getElementById("welcome-card");
const agentResultCard = document.getElementById("agent-result-card");

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
        loginError.textContent = "Invalid credentials. Try admin / sentinel123";
        loginError.classList.remove("hidden");
      }
    }
  } catch (err) {
    if (loginError) {
      loginError.textContent = "Server unreachable. Ensure FastAPI backend is running.";
      loginError.classList.remove("hidden");
    }
  }
});

function logout() {
  authToken = null;
  localStorage.removeItem("sentinel_jwt");
  showAuthModal();
}

logoutBtn.addEventListener("click", logout);

/* ================= 2. INITIALIZATION ================= */
function initApp() {
  try { startClock(); } catch (e) { console.error("startClock error:", e); }
  try { fetchEvents(); } catch (e) { console.error("fetchEvents error:", e); }
  try { setupCameraSelector(); } catch (e) { console.error("setupCameraSelector error:", e); }
  try { setupTimelineScrubbing(); } catch (e) { console.error("setupTimelineScrubbing error:", e); }
  try { setupAgent(); } catch (e) { console.error("setupAgent error:", e); }
  try { setupStreamEngineToggle(); } catch (e) { console.error("setupStreamEngineToggle error:", e); }
  try { initHlsPlayer(CAM_EARTHCAM_KEYS[currentCamera]); } catch (e) { console.error("initHlsPlayer error:", e); }
  try { startStatsPolling(); } catch (e) { console.error("startStatsPolling error:", e); }
  try { startCctvRenderLoop(); } catch (e) { console.error("startCctvRenderLoop error:", e); }
}

function initHlsPlayer(camKey = "tsrobo1") {
  if (!nativeHlsVideo) return;
  const streamUrl = `${API_BASE}/api/stream/earthcam/live.m3u8?cam=${camKey}`;

  if (hlsInstance) {
    try {
      hlsInstance.destroy();
    } catch (e) {}
    hlsInstance = null;
  }

  if (window.Hls && Hls.isSupported()) {
    hlsInstance = new Hls({
      enableWorker: true,
      lowLatencyMode: false,
      // Exact 2-4 second jitter buffer configuration requested (NVDEC Hardware accelerated)
      backBufferLength: 10,
      maxBufferLength: 4,              // Max 4-second buffer
      maxMaxBufferLength: 8,
      liveSyncDurationCount: 3,        // 3-segment buffer (approx 2-4s buffer)
      liveMaxLatencyDurationCount: 5,  // Catch up if falling behind
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
  } else {
    // Graceful fallback to composite MJPEG stream if Hls.js not available
    console.warn("HLS.js not detected; falling back to composite stream.");
    streamEngine = "mjpeg";
    if (nativeHlsVideo) nativeHlsVideo.classList.add("hidden");
    if (cctvCanvas) cctvCanvas.classList.add("hidden");
    if (liveAiStream) {
      liveAiStream.classList.remove("hidden");
      liveAiStream.src = `${API_BASE}/api/stream/live/detected.mjpg?channel=${currentCamera}&t=${Date.now()}`;
    }
    if (streamEngineToggle) {
      streamEngineToggle.textContent = "DECODE: COMPOSITE MJPEG (0s BUFFER)";
      streamEngineToggle.classList.remove("badge-orange");
    }
  }
}

function setupStreamEngineToggle() {
  if (!streamEngineToggle) return;

  streamEngineToggle.addEventListener("click", () => {
    if (streamEngine === "nvdec") {
      // Switch to composite MJPEG mode
      streamEngine = "mjpeg";
      nativeHlsVideo.classList.add("hidden");
      try { nativeHlsVideo.pause(); } catch (e) {}
      cctvCanvas.classList.add("hidden");
      liveAiStream.classList.remove("hidden");
      liveAiStream.src = `${API_BASE}/api/stream/live/detected.mjpg?channel=${currentCamera}&t=${Date.now()}`;
      streamEngineToggle.textContent = "DECODE: COMPOSITE MJPEG (0s BUFFER)";
      streamEngineToggle.classList.remove("badge-orange");
    } else {
      // Switch to NVDEC hardware mode with 2-4s buffer
      streamEngine = "nvdec";
      liveAiStream.classList.add("hidden");
      liveAiStream.src = "";
      nativeHlsVideo.classList.remove("hidden");
      cctvCanvas.classList.remove("hidden");
      initHlsPlayer(CAM_EARTHCAM_KEYS[currentCamera]);
      streamEngineToggle.textContent = "DECODE: NVDEC (2-4s BUFFER)";
      streamEngineToggle.classList.add("badge-orange");
    }
  });
}

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
  const cw = cctvCanvas.width || 960;
  const ch = cctvCanvas.height || 540;

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
  if (isDetecting || streamEngine !== "nvdec" || !nativeHlsVideo) return;
  if (nativeHlsVideo.paused || nativeHlsVideo.ended || nativeHlsVideo.readyState < 2) return;

  isDetecting = true;
  try {
    // Capture the exact video frame currently displayed on the website
    captureCtx.drawImage(nativeHlsVideo, 0, 0, 640, 360);

    const blob = await new Promise((resolve) => {
      captureCanvas.toBlob(resolve, "image/jpeg", 0.70);
    });

    if (!blob) {
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

      if (hudStatsTelemetry) {
        hudStatsTelemetry.textContent = `LATENCY: ${data.latency_ms}ms • ${data.fps} FPS (YOLOv8 FP16 BYTETRACK ON FEED)`;
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
    console.warn("Feed detection error:", err);
  } finally {
    isDetecting = false;
  }
}

function scheduleNextDetection() {
  if (streamEngine === "nvdec" && nativeHlsVideo && !nativeHlsVideo.paused && nativeHlsVideo.readyState >= 2) {
    detectCurrentFeedFrame().then(() => {
      setTimeout(scheduleNextDetection, 30);
    }).catch(() => {
      setTimeout(scheduleNextDetection, 50);
    });
  } else {
    setTimeout(scheduleNextDetection, 80);
  }
}

function startStatsPolling() {
  // 1. Adaptive, non-overlapping frame inference directly on website feed
  scheduleNextDetection();

  // 2. Secondary telemetry polling for composite mode
  async function poll() {
    if (streamEngine !== "mjpeg") return;
    try {
      const res = await fetch(`${API_BASE}/api/stream/live/stats`);
      if (res.ok) {
        const stats = await res.json();
        if (hudStatsTelemetry) {
          hudStatsTelemetry.textContent = `LATENCY: ${stats.latency_ms}ms • ${stats.fps} FPS (COMPOSITE MJPEG)`;
        }
        if (hudDetectionCount && stats.counts) {
          const total = stats.counts.person + stats.counts.vehicle + stats.counts.parcel;
          hudDetectionCount.textContent = `DETECTED: ${stats.counts.person} HUMANS, ${stats.counts.vehicle} VEHICLES`;
        }
      }
    } catch (e) {}
  }

  setInterval(poll, 1000);
}

function startClock() {
  setInterval(() => {
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    systemClock.textContent = timeStr;
  }, 1000);
}

/* ================= 3. CAMERA CHANNELS ================= */
function setupCameraSelector() {
  const pills = document.querySelectorAll(".channel-pill");
  pills.forEach((pill) => {
    pill.addEventListener("click", async () => {
      pills.forEach((p) => p.classList.remove("active"));
      pill.classList.add("active");
      currentCamera = pill.dataset.cam;

      // Update UI Header
      if (currentCamera === "cam-01-times-square") {
        currentCamId.textContent = "CAM-01";
        currentCamTitle.textContent = "Times Square South & Broadway (NYC)";
        streamStatusTag.textContent = "YOLO LIVE: ACTIVE";
        hudFeedSource.textContent = "TIMES SQUARE // YOLOv8 REAL-TIME (RTX 3050)";
      } else if (currentCamera === "cam-02-abbey-road") {
        currentCamId.textContent = "CAM-02";
        currentCamTitle.textContent = "Abbey Road Crossing (London, UK)";
        streamStatusTag.textContent = "YOLO LIVE: ACTIVE";
        hudFeedSource.textContent = "ABBEY ROAD CROSSING // LONDON (RTX 3050)";
      } else {
        currentCamId.textContent = "CAM-03";
        currentCamTitle.textContent = "The Liberty Bell & Independence Hall (Philadelphia)";
        streamStatusTag.textContent = "YOLO LIVE: ACTIVE";
        hudFeedSource.textContent = "LIBERTY BELL // PHILADELPHIA (RTX 3050)";
      }

      // Clear old camera detection tracks immediately to prevent visual ghosting
      persistentTracks.clear();
      if (ctx) ctx.clearRect(0, 0, cctvCanvas.width, cctvCanvas.height);

      // Notify Backend to Offload Old Channel & Onload New Channel
      try {
        await fetch(`${API_BASE}/api/stream/channel/switch`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({ channel_id: currentCamera }),
        });
        
        if (streamEngine === "nvdec") {
          initHlsPlayer(CAM_EARTHCAM_KEYS[currentCamera]);
        } else if (liveAiStream) {
          liveAiStream.src = `${API_BASE}/api/stream/live/detected.mjpg?channel=${currentCamera}&t=${Date.now()}`;
        }
      } catch (err) {
        console.error("Channel switch failed:", err);
      }

      renderIncidentsTable();
    });
  });
}

/* ================= 4. SURVEILLANCE EVENTS ================= */
async function fetchEvents() {
  try {
    const res = await fetch(`${API_BASE}/api/events`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    if (res.ok) {
      const data = await res.json();
      allEvents = data.events;
      renderIncidentsTable();
      renderTimelineMarkers();
    }
  } catch (err) {
    console.error("Failed to fetch events:", err);
  }
}

function renderIncidentsTable(filter = "all") {
  incidentsTbody.innerHTML = "";

  const filtered = allEvents.filter((ev) => {
    if (filter === "all") return true;
    return ev.object_class.toLowerCase() === filter.toLowerCase();
  });

  filtered.forEach((ev) => {
    const tr = document.createElement("tr");
    const tagClass = `tag-${ev.object_class.toLowerCase()}`;

    tr.innerHTML = `
      <td style="font-family: var(--font-mono); font-size: 11px;">${ev.time_display}</td>
      <td style="font-weight: 500;">${ev.camera_name}</td>
      <td><span class="tag-entity ${tagClass}">${ev.object_class}</span></td>
      <td style="font-family: var(--font-mono); font-size: 11px;">${Math.round(ev.confidence * 100)}%</td>
      <td>${ev.alert_title || ev.description}</td>
      <td>
        <button class="btn-proof" onclick="jumpToEvent(${ev.video_offset_sec}, '${ev.camera_id}')">
          View &rarr;
        </button>
      </td>
    `;
    incidentsTbody.appendChild(tr);
  });
}

// Filter tabs
document.querySelectorAll(".filter-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".filter-tab").forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    renderIncidentsTable(tab.dataset.filter);
  });
});

/* ================= 5. TIMELINE SCRUBBING ================= */
function renderTimelineMarkers() {
  eventMarkersContainer.innerHTML = "";
  // Map 0 to 240 seconds to 0% to 100% of the timeline
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
  if (camId) {
    const pill = document.querySelector(`.channel-pill[data-cam="${camId}"]`);
    if (pill) pill.click();
  }

  const pct = (currentOffsetSec / 240) * 100;
  timelineProgress.style.width = `${pct}%`;
  timelineScrubber.style.left = `${pct}%`;

  // Calculate simulated time
  const baseMinutes = 11 * 60 + 30 + Math.floor(currentOffsetSec / 2);
  const hours = Math.floor(baseMinutes / 60) % 12 || 12;
  const mins = baseMinutes % 60;
  const ampm = baseMinutes >= 12 * 60 ? "PM" : "AM";
  const timeFormatted = `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}:22 ${ampm}`;

  playbackTimeLabel.textContent = `${timeFormatted} (${Math.round(currentOffsetSec)}s)`;
  hudCamTime.textContent = timeFormatted;
};

/* ================= 6. CCTV CANVAS RENDERER ================= */
function startCctvRenderLoop() {
  function render() {
    ctx.clearRect(0, 0, cctvCanvas.width, cctvCanvas.height);

    if (streamEngine === "nvdec") {
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
          color = "#29B6F6"; // Cyan for vehicles
        } else if (["parcel", "suitcase", "backpack", "handbag"].includes(t.class)) {
          color = "#FF4E00"; // Orange for parcels
        }

        const label = `${t.class.toUpperCase()} #${id} ${Math.round(t.conf * 100)}%`;
        drawTargetBox(ctx, x, y, w, h, label, color, false, t.alpha);
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
  const corner = 16;
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

/* ================= 7. AI REASONING AGENT ================= */
function setupAgent() {
  // Query submission
  agentForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const query = agentInput.value.trim();
    if (query) runAgentQuery(query);
  });

  // Suggestion chips
  document.querySelectorAll(".suggest-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      const q = chip.dataset.query;
      agentInput.value = q;
      runAgentQuery(q);
    });
  });
}

async function runAgentQuery(query) {
  welcomeCard.classList.add("hidden");
  agentResultCard.classList.remove("hidden");
  btnAskSubmit.disabled = true;
  btnAskSubmit.innerHTML = `<span>Reasoning...</span>`;

  agentResultCard.innerHTML = `
    <div style="font-family: var(--font-mono); font-size: 12px; color: var(--text-muted); display: flex; align-items: center; gap: 8px;">
      <span class="pulse-dot"></span> Consulting security metadata & verifying visual keyframes...
    </div>
  `;

  try {
    const res = await fetch(`${API_BASE}/api/agent/query`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ query }),
    });

    if (res.ok) {
      const data = await res.json();
      renderAgentAnswer(data);
    } else {
      agentResultCard.innerHTML = `<div class="login-error">Failed to complete reasoning query.</div>`;
    }
  } catch (err) {
    agentResultCard.innerHTML = `<div class="login-error">Agent network error. Verify server is online.</div>`;
  } finally {
    btnAskSubmit.disabled = false;
    btnAskSubmit.innerHTML = `<span>Analyze</span> <span class="arrow">&rarr;</span>`;
  }
}

function renderAgentAnswer(data) {
  const isConfirmed = data.status.includes("CONFIRMED");
  const isAlert = data.status.includes("ALERT");
  const badgeClass = isAlert ? "badge-alert" : isConfirmed ? "badge-confirmed" : "badge-notfound";

  const stepsHtml = (data.reasoning_steps || [])
    .map((s) => `<li>${s}</li>`)
    .join("");

  const snapshotHtml = data.snapshot_path
    ? `
      <div class="snapshot-preview-box">
        <img src="${API_BASE}/api/${data.snapshot_path}" alt="Surveillance Proof" />
      </div>
    `
    : "";

  const seekBtn = data.seek_offset_sec !== undefined
    ? `
      <div class="jump-btn-overlay">
        <span class="jump-time-tag">TIMESTAMP: ${data.timestamp || 'Verified'}</span>
        <button class="btn-jump" onclick="jumpToEvent(${data.seek_offset_sec}, '${data.camera ? (data.camera.includes('Airspace') ? 'cam-02-airspace' : 'cam-01-entrance') : 'cam-01-entrance'}')">
          <span>Jump to CCTV Footage</span> &rarr;
        </button>
      </div>
    `
    : "";

  agentResultCard.innerHTML = `
    <div class="result-status-row">
      <span class="verdict-badge ${badgeClass}">${data.status.replace('_', ' ')}</span>
      <span class="certainty-label">${data.confidence ? `Certainty: ${data.confidence}` : ''}</span>
    </div>

    <div class="result-answer">
      &ldquo;${data.answer}&rdquo;
    </div>

    ${
      stepsHtml
        ? `
      <div class="reasoning-steps">
        <div class="steps-title">Agent Reasoning Trace</div>
        <ul class="steps-list">${stepsHtml}</ul>
      </div>
    `
        : ""
    }

    ${snapshotHtml}
    ${seekBtn}
  `;
}

// Start
checkAuth();
