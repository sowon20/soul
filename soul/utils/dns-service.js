/**
 * 네트워크 서비스 - mDNS로 soul.local 자동 검색
 *
 * 프로덕션(Pi): avahi-daemon이 호스트네임 기반으로 soul.local 자동 광고
 *   → hostname을 'soul'로 설정하면 끝 (sudo hostnamectl set-hostname soul)
 *   → bonjour-service 사용 안 함 (avahi와 충돌)
 *
 * 개발(Mac): mDNS 광고 안 함 (Pi의 soul.local과 충돌 방지)
 */

const os = require('os');

const HOSTNAME = 'soul';

/**
 * 서버의 로컬 IP 주소 가져오기
 */
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

/**
 * 네트워크 정보 출력
 * mDNS는 OS의 avahi-daemon이 담당 (Node에서 직접 광고 안 함)
 */
function startFromConfig() {
  const port = parseInt(process.env.PORT) || 5041;
  const localIP = getLocalIP();

  if (process.env.NODE_ENV === 'production') {
    // Pi: avahi-daemon이 soul.local 광고
    console.log(`[Network] mDNS: http://${HOSTNAME}.local:${port} (avahi)`);
  } else {
    console.log(`[Network] mDNS 비활성 (개발 모드)`);
  }
  console.log(`[Network] IP:   http://${localIP}:${port}`);
}

function stop() {
  // avahi는 OS 서비스이므로 별도 정리 불필요
}

module.exports = { startFromConfig, stop, getLocalIP };
