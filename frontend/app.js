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

// Elements
const authModal = document.getElementById("auth-modal");
const appContainer = document.getElementById("app");
const loginForm = document.getElementById("login-form");
const loginError = document.getElementById("login-error");
const userDisplayName = document.getElementById("user-display-name");
const logoutBtn = document.getElementById("logout-btn");

const liveVideo = document.getElementById("live-video");
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
      userDisplayName.textContent = data.user.full_name || data.user.username;
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
  authModal.classList.remove("hidden");
  appContainer.classList.add("hidden");
}

function hideAuthModal() {
  authModal.classList.add("hidden");
  appContainer.classList.remove("hidden");
}

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  loginError.classList.add("hidden");

  const username = document.getElementById("login-username").value.trim();
  const password = document.getElementById("login-password").value.trim();

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
      userDisplayName.textContent = data.user.full_name;
      hideAuthModal();
      initApp();
    } else {
      loginError.textContent = "Invalid credentials. Try admin / sentinel123";
      loginError.classList.remove("hidden");
    }
  } catch (err) {
    loginError.textContent = "Server unreachable. Ensure FastAPI backend is running.";
    loginError.classList.remove("hidden");
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
  startClock();
  fetchEvents();
  setupCameraSelector();
  setupTimelineScrubbing();
  setupAgent();
  initHlsStream();
  startCctvRenderLoop();
}

function initHlsStream() {
  const streamUrl = `${API_BASE}/api/stream/earthcam/live.m3u8`;
  if (typeof Hls !== "undefined" && Hls.isSupported()) {
    if (hlsInstance) hlsInstance.destroy();
    hlsInstance = new Hls({
      enableWorker: true,
      lowLatencyMode: true,
      backBufferLength: 30,
    });
    hlsInstance.loadSource(streamUrl);
    hlsInstance.attachMedia(liveVideo);
    hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
      liveVideo.play().catch((e) => console.log("Live stream waiting for interaction:", e));
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
  } else if (liveVideo && liveVideo.canPlayType("application/vnd.apple.mpegurl")) {
    liveVideo.src = streamUrl;
    liveVideo.addEventListener("loadedmetadata", () => {
      liveVideo.play().catch(() => {});
    });
  }
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
    pill.addEventListener("click", () => {
      pills.forEach((p) => p.classList.remove("active"));
      pill.classList.add("active");
      currentCamera = pill.dataset.cam;

      if (currentCamera === "cam-01-times-square") {
        currentCamId.textContent = "CAM-01";
        currentCamTitle.textContent = "Times Square South & Broadway";
        streamStatusTag.textContent = "PEDESTRIAN DENSITY: HIGH";
        hudFeedSource.textContent = "EARTHCAM 4K • TIMES SQUARE NYC";
        if (liveVideo) liveVideo.style.display = "block";
        initHlsStream();
      } else if (currentCamera === "cam-02-airspace") {
        currentCamId.textContent = "CAM-02";
        currentCamTitle.textContent = "Perimeter North & Airspace";
        streamStatusTag.textContent = "AERIAL RADAR: SCANNING";
        hudFeedSource.textContent = "PERIMETER SENSOR • AIRSPACE NORTH";
        if (liveVideo) liveVideo.style.display = "none";
      } else {
        currentCamId.textContent = "CAM-03";
        currentCamTitle.textContent = "Driveway & Main Gate";
        streamStatusTag.textContent = "VEHICLE RECOGNITION: ACTIVE";
        hudFeedSource.textContent = "BARRIER CAM • GATE SENSOR";
        if (liveVideo) liveVideo.style.display = "none";
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
  let frameTicker = 0;

  function render() {
    frameTicker++;
    ctx.clearRect(0, 0, cctvCanvas.width, cctvCanvas.height);

    if (currentCamera === "cam-01-times-square") {
      // 1. Transparent canvas overlay on top of Live EarthCam video
      // Simulated live pedestrian & vehicle tracking in Times Square
      const p1x = 320 + Math.sin(frameTicker * 0.02) * 45;
      const p1y = 360 + Math.cos(frameTicker * 0.015) * 15;
      drawTargetBox(ctx, p1x, p1y, 35, 75, "PERSON [0.93] #412", "#00E676");

      const p2x = 540 - Math.cos(frameTicker * 0.018) * 40;
      const p2y = 340 + Math.sin(frameTicker * 0.02) * 12;
      drawTargetBox(ctx, p2x, p2y, 32, 70, "PERSON [0.89] #418", "#00E676");

      const p3x = 420 + Math.sin(frameTicker * 0.012) * 30;
      drawTargetBox(ctx, p3x, 380, 40, 80, "PERSON [0.91] #425", "#00E676");

      // Traffic flow tracking on 7th Ave
      const carX = (frameTicker * 3) % 1100 - 150;
      if (carX > -100 && carX < 980) {
        drawTargetBox(ctx, carX, 410, 140, 70, "VEHICLE [0.95] #209", "#29B6F6");
      }

      // Parcel / Drop detection near curb at 02:00 PM
      if (currentOffsetSec >= 120 && currentOffsetSec <= 180) {
        drawTargetBox(ctx, 470, 425, 55, 45, "PARCEL [0.88] #301", "#FF4E00", true);
      }

    } else {
      // 2. Simulated Environment for Other Camera Channels
      const grad = ctx.createLinearGradient(0, 0, 0, cctvCanvas.height);
      if (currentCamera === "cam-02-airspace") {
        grad.addColorStop(0, "#2B3238");
        grad.addColorStop(0.7, "#424D56");
        grad.addColorStop(1, "#1E2226");
      } else {
        grad.addColorStop(0, "#22252A");
        grad.addColorStop(0.5, "#30343C");
        grad.addColorStop(1, "#181A1D");
      }
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, cctvCanvas.width, cctvCanvas.height);

      // Grid
      ctx.strokeStyle = "rgba(255, 255, 255, 0.04)";
      ctx.lineWidth = 1;
      for (let x = 0; x < cctvCanvas.width; x += 60) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, cctvCanvas.height); ctx.stroke();
      }
      for (let y = 0; y < cctvCanvas.height; y += 60) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(cctvCanvas.width, y); ctx.stroke();
      }

      if (currentCamera === "cam-02-airspace") {
        const hoverX = 480 + Math.sin(frameTicker * 0.04) * 30;
        const hoverY = 160 + Math.cos(frameTicker * 0.05) * 15;
        drawTargetBox(ctx, hoverX, hoverY, 160, 90, "DRONE [0.94] #101", "#FF1744", true);
      } else if (currentCamera === "cam-03-driveway") {
        drawTargetBox(ctx, 240, 260, 480, 210, "VEHICLE [0.96] #310", "#90CAF9");
      }
    }

    // Micro scan-line effect
    ctx.fillStyle = "rgba(255, 255, 255, 0.015)";
    for (let i = 0; i < cctvCanvas.height; i += 4) {
      ctx.fillRect(0, i, cctvCanvas.width, 1.5);
    }

    requestAnimationFrame(render);
  }

  requestAnimationFrame(render);
}

function drawTargetBox(ctx, x, y, w, h, label, color, isAlert = false) {
  ctx.save();
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
