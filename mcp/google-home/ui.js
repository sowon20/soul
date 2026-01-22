// Google Home UI

let devices = [];
let authStatus = { authenticated: false };

async function init() {
    await checkAuthStatus();
    window.addEventListener("message", (e) => {
        if (e.data?.type === "oauth_success") {
            checkAuthStatus();
            loadDevices();
        }
    });
}

// ========== 인증 관련 ==========
async function checkAuthStatus() {
    try {
        const res = await fetch("/api/auth/status");
        authStatus = await res.json();
        updateAuthUI();

        if (authStatus.authenticated && !authStatus.expired) {
            await loadDevices();
        } else if (!authStatus.authenticated) {
            showConfigPanel();
        }
    } catch (e) {
        console.error("인증 상태 확인 실패:", e);
        showConfigPanel();
    }
}

function updateAuthUI() {
    const statusEl = document.getElementById("auth-status");
    const btnAuth = document.getElementById("btn-auth");

    if (authStatus.authenticated) {
        if (authStatus.expired) {
            statusEl.textContent = "토큰 만료";
            statusEl.className = "status-badge status-expired";
            btnAuth.textContent = "토큰 갱신";
            btnAuth.onclick = refreshToken;
        } else {
            statusEl.textContent = "연결됨";
            statusEl.className = "status-badge status-connected";
            btnAuth.textContent = "로그아웃";
            btnAuth.onclick = logout;
        }
        document.getElementById("config-panel").style.display = "none";
    } else {
        statusEl.textContent = "연결 안됨";
        statusEl.className = "status-badge status-disconnected";
        btnAuth.textContent = "로그인";
        btnAuth.onclick = handleAuth;
    }
}

function showConfigPanel() {
    document.getElementById("config-panel").style.display = "block";
    document.getElementById("devices-area").innerHTML = `
        <div class="empty-state">
            <div class="icon">🔐</div>
            <p>Google 계정에 로그인하여<br>스마트 홈 기기를 제어하세요.</p>
        </div>
    `;
}

async function saveConfig() {
    const clientId = document.getElementById("client-id").value;
    const clientSecret = document.getElementById("client-secret").value;
    const redirectUri = document.getElementById("redirect-uri").value;

    if (!clientId || !clientSecret) {
        alert("Client ID와 Secret을 입력하세요.");
        return;
    }

    try {
        await fetch("/api/config", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ clientId, clientSecret, redirectUri })
        });
        alert("설정 저장됨! 이제 로그인하세요.");
    } catch (e) {
        alert("설정 저장 실패: " + e.message);
    }
}

async function handleAuth() {
    try {
        const res = await fetch("/api/auth/url");
        const data = await res.json();

        if (data.error) {
            alert(data.error);
            showConfigPanel();
            return;
        }

        // 팝업으로 OAuth 진행
        window.open(data.url, "google-auth", "width=500,height=600");
    } catch (e) {
        alert("로그인 URL 생성 실패: " + e.message);
    }
}

async function refreshToken() {
    try {
        const res = await fetch("/api/auth/refresh", { method: "POST" });
        const data = await res.json();

        if (data.error) {
            alert("토큰 갱신 실패: " + data.error);
            return;
        }

        alert("토큰 갱신 성공!");
        await checkAuthStatus();
        await loadDevices();
    } catch (e) {
        alert("토큰 갱신 실패: " + e.message);
    }
}

async function logout() {
    if (!confirm("로그아웃 하시겠습니까?")) return;

    try {
        await fetch("/api/auth/logout", { method: "POST" });
        authStatus = { authenticated: false };
        updateAuthUI();
        showConfigPanel();
    } catch (e) {
        alert("로그아웃 실패: " + e.message);
    }
}

// ========== 기기 관련 ==========
async function loadDevices() {
    if (!authStatus.authenticated) return;

    document.getElementById("devices-area").innerHTML = `
        <div class="loading">
            <div class="spinner"></div>
            기기 불러오는 중...
        </div>
    `;

    try {
        const res = await fetch("/api/devices");
        const data = await res.json();

        if (data.error) {
            throw new Error(data.error);
        }

        devices = data.devices || [];
        renderDevices();
    } catch (e) {
        document.getElementById("devices-area").innerHTML = `
            <div class="empty-state">
                <div class="icon">⚠️</div>
                <p>기기 로드 실패: ${e.message}</p>
                <button class="btn btn-primary" onclick="loadDevices()" style="margin-top: 15px;">다시 시도</button>
            </div>
        `;
    }
}

function renderDevices() {
    if (devices.length === 0) {
        document.getElementById("devices-area").innerHTML = `
            <div class="empty-state">
                <div class="icon">📱</div>
                <p>연결된 기기가 없습니다.</p>
            </div>
        `;
        return;
    }

    const html = `
        <div class="devices-grid">
            ${devices.map((device, idx) => renderDeviceCard(device, idx)).join("")}
        </div>
    `;

    document.getElementById("devices-area").innerHTML = html;
}

function renderDeviceCard(device, idx) {
    const name = device.traits?.["sdm.devices.traits.Info"]?.customName ||
                 device.parentRelations?.[0]?.displayName ||
                 device.name?.split("/").pop() ||
                 "Unknown Device";

    const type = getDeviceType(device.type);
    const icon = getDeviceIcon(device.type);
    const traits = device.traits || {};

    // 상태 확인
    const isOnline = traits["sdm.devices.traits.Connectivity"]?.status === "ONLINE";
    const isOn = traits["sdm.devices.traits.Fan"]?.timerMode === "ON" ||
                 traits["sdm.devices.traits.ThermostatMode"]?.mode !== "OFF";

    // 온도 (온도조절기)
    const tempTrait = traits["sdm.devices.traits.Temperature"];
    const currentTemp = tempTrait?.ambientTemperatureCelsius;

    // 습도
    const humidity = traits["sdm.devices.traits.Humidity"]?.ambientHumidityPercent;

    return `
        <div class="device-card" data-id="${device.name}">
            <div class="device-header">
                <div>
                    <div class="device-name">${escapeHtml(name)}</div>
                    <div class="device-type">${type}</div>
                </div>
                <div class="device-icon">${icon}</div>
            </div>

            <div class="device-state">
                ${isOnline ? "🟢 온라인" : "🔴 오프라인"}
                ${currentTemp ? ` · ${currentTemp.toFixed(1)}°C` : ""}
                ${humidity ? ` · 💧 ${humidity}%` : ""}
            </div>

            ${renderDeviceControls(device, idx)}
        </div>
    `;
}

function renderDeviceControls(device, idx) {
    const traits = device.traits || {};
    let controls = "";

    // 온도조절기 모드
    if (traits["sdm.devices.traits.ThermostatMode"]) {
        const mode = traits["sdm.devices.traits.ThermostatMode"].mode || "OFF";
        controls += `
            <div class="slider-container">
                <div class="slider-label">
                    <span>모드</span>
                    <span>${mode}</span>
                </div>
                <select onchange="setThermostatMode('${device.name}', this.value)" style="width: 100%; padding: 8px; border-radius: 6px; background: #3a3a5a; color: #eee; border: none;">
                    <option value="OFF" ${mode === "OFF" ? "selected" : ""}>끄기</option>
                    <option value="HEAT" ${mode === "HEAT" ? "selected" : ""}>난방</option>
                    <option value="COOL" ${mode === "COOL" ? "selected" : ""}>냉방</option>
                    <option value="HEATCOOL" ${mode === "HEATCOOL" ? "selected" : ""}>자동</option>
                </select>
            </div>
        `;
    }

    // 온도 설정
    if (traits["sdm.devices.traits.ThermostatTemperatureSetpoint"]) {
        const setpoint = traits["sdm.devices.traits.ThermostatTemperatureSetpoint"];
        const heatTemp = setpoint.heatCelsius;
        const coolTemp = setpoint.coolCelsius;

        if (heatTemp) {
            controls += `
                <div class="slider-container">
                    <div class="slider-label">
                        <span>설정 온도</span>
                        <span id="temp-${idx}">${heatTemp.toFixed(1)}°C</span>
                    </div>
                    <input type="range" class="slider" min="15" max="30" step="0.5" value="${heatTemp}"
                        onchange="setTemperature('${device.name}', this.value, 'heat'); document.getElementById('temp-${idx}').textContent = this.value + '°C'">
                </div>
            `;
        }
    }

    // 팬
    if (traits["sdm.devices.traits.Fan"]) {
        const fan = traits["sdm.devices.traits.Fan"];
        const isOn = fan.timerMode === "ON";
        controls += `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 15px;">
                <span>팬</span>
                <div class="toggle-switch ${isOn ? "on" : ""}" onclick="toggleFan('${device.name}', ${!isOn})"></div>
            </div>
        `;
    }

    // 카메라
    if (traits["sdm.devices.traits.CameraLiveStream"]) {
        controls += `
            <button class="btn btn-secondary" style="width: 100%; margin-top: 15px;" onclick="getCameraStream('${device.name}')">
                📹 라이브 스트림
            </button>
        `;
    }

    return controls || `<div style="color: #666; font-size: 13px; margin-top: 10px;">제어 옵션 없음</div>`;
}

function getDeviceType(type) {
    const types = {
        "sdm.devices.types.THERMOSTAT": "온도조절기",
        "sdm.devices.types.CAMERA": "카메라",
        "sdm.devices.types.DOORBELL": "도어벨",
        "sdm.devices.types.DISPLAY": "디스플레이",
    };
    return types[type] || type?.split(".").pop() || "기기";
}

function getDeviceIcon(type) {
    const icons = {
        "sdm.devices.types.THERMOSTAT": "🌡️",
        "sdm.devices.types.CAMERA": "📷",
        "sdm.devices.types.DOORBELL": "🔔",
        "sdm.devices.types.DISPLAY": "📺",
    };
    return icons[type] || "📱";
}

// ========== 기기 제어 ==========
async function sendCommand(deviceId, command, params) {
    try {
        const res = await fetch(`/api/devices/${encodeURIComponent(deviceId)}/command`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ command, params })
        });

        const data = await res.json();
        if (data.error) {
            throw new Error(data.error);
        }

        // 잠시 후 새로고침
        setTimeout(loadDevices, 1000);
    } catch (e) {
        alert("명령 실행 실패: " + e.message);
    }
}

window.setThermostatMode = (deviceId, mode) => {
    sendCommand(deviceId, "sdm.devices.commands.ThermostatMode.SetMode", { mode });
};

window.setTemperature = (deviceId, temp, type) => {
    const command = type === "heat"
        ? "sdm.devices.commands.ThermostatTemperatureSetpoint.SetHeat"
        : "sdm.devices.commands.ThermostatTemperatureSetpoint.SetCool";
    sendCommand(deviceId, command, { [type + "Celsius"]: parseFloat(temp) });
};

window.toggleFan = (deviceId, turnOn) => {
    sendCommand(deviceId, "sdm.devices.commands.Fan.SetTimer", {
        timerMode: turnOn ? "ON" : "OFF",
        duration: "3600s"
    });
};

window.getCameraStream = async (deviceId) => {
    try {
        const res = await fetch(`/api/devices/${encodeURIComponent(deviceId)}/command`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                command: "sdm.devices.commands.CameraLiveStream.GenerateRtspStream",
                params: {}
            })
        });

        const data = await res.json();
        if (data.results?.streamUrls?.rtspUrl) {
            prompt("RTSP 스트림 URL:", data.results.streamUrls.rtspUrl);
        } else {
            alert("스트림 URL을 가져올 수 없습니다.");
        }
    } catch (e) {
        alert("스트림 요청 실패: " + e.message);
    }
};

function escapeHtml(str) {
    return str?.replace(/[&<>"']/g, (m) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[m])) || "";
}

// 시작
init();
