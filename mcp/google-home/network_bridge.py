#!/usr/bin/env python3
"""
Network Bridge for Node.js integration
mDNS 서비스 검색, ARP 스캔, Wake-on-LAN 기능을 제공합니다.
"""

import json
import sys
import os
import socket
import time
import logging

# 디버그 모드 설정
DEBUG = os.environ.get("NETWORK_DEBUG", "").lower() in ("1", "true", "yes")
if DEBUG:
    logging.basicConfig(level=logging.DEBUG)

try:
    from zeroconf import Zeroconf, ServiceBrowser, ServiceListener
    ZEROCONF_AVAILABLE = True
except ImportError:
    ZEROCONF_AVAILABLE = False
    print("[network] zeroconf 패키지가 설치되지 않았습니다.", file=sys.stderr)

try:
    from wakeonlan import send_magic_packet
    WAKEONLAN_AVAILABLE = True
except ImportError:
    WAKEONLAN_AVAILABLE = False
    print("[network] wakeonlan 패키지가 설치되지 않았습니다.", file=sys.stderr)


# 일반적인 스마트홈 서비스 타입
DEFAULT_SERVICE_TYPES = [
    "_airplay._tcp.local.",      # AirPlay 기기
    "_raop._tcp.local.",         # AirPlay 오디오
    "_googlecast._tcp.local.",   # Google Cast/Home
    "_hap._tcp.local.",          # HomeKit
    "_matter._tcp.local.",       # Matter
    "_companion-link._tcp.local.", # Apple 기기 연동
    "_sleep-proxy._udp.local.",  # Apple Sleep Proxy
]


class DeviceListener(ServiceListener):
    """mDNS 서비스 리스너"""

    def __init__(self):
        self.devices = []

    def add_service(self, zc: Zeroconf, type_: str, name: str) -> None:
        info = zc.get_service_info(type_, name)
        if info:
            addresses = []
            for addr in info.addresses:
                try:
                    addresses.append(socket.inet_ntoa(addr))
                except:
                    pass

            # 속성 파싱
            properties = {}
            for k, v in info.properties.items():
                try:
                    key = k.decode('utf-8') if isinstance(k, bytes) else str(k)
                    val = v.decode('utf-8') if isinstance(v, bytes) else str(v)
                    properties[key] = val
                except:
                    pass

            device = {
                "name": name,
                "type": type_,
                "addresses": addresses,
                "port": info.port,
                "hostname": info.server,
                "properties": properties
            }

            # 친근한 이름 추출
            friendly_name = properties.get('fn') or properties.get('name') or name.split('.')[0]
            device["friendly_name"] = friendly_name

            # 모델 정보 추출
            model = properties.get('md') or properties.get('model') or properties.get('am')
            if model:
                device["model"] = model

            self.devices.append(device)
            print(f"  📡 발견: {friendly_name} ({addresses[0] if addresses else 'no IP'}) - {type_}", file=sys.stderr)

    def remove_service(self, zc: Zeroconf, type_: str, name: str) -> None:
        pass

    def update_service(self, zc: Zeroconf, type_: str, name: str) -> None:
        pass


def scan_mdns(service_types=None, timeout=5):
    """mDNS 서비스 스캔"""
    if not ZEROCONF_AVAILABLE:
        return None, "zeroconf 패키지가 필요합니다: pip install zeroconf"

    if not service_types:
        service_types = DEFAULT_SERVICE_TYPES

    print(f"[network] mDNS 스캔 시작 ({timeout}초)...", file=sys.stderr)
    print(f"[network] 검색할 서비스: {len(service_types)}개", file=sys.stderr)

    zc = Zeroconf()
    listener = DeviceListener()
    browsers = []

    for service_type in service_types:
        try:
            browser = ServiceBrowser(zc, service_type, listener)
            browsers.append(browser)
        except Exception as e:
            print(f"[network] 서비스 타입 {service_type} 브라우저 생성 실패: {e}", file=sys.stderr)

    time.sleep(timeout)
    zc.close()

    # 중복 제거 (같은 IP 주소)
    unique_devices = {}
    for device in listener.devices:
        key = f"{device['addresses'][0] if device['addresses'] else device['name']}-{device['type']}"
        if key not in unique_devices:
            unique_devices[key] = device

    devices = list(unique_devices.values())
    print(f"[network] 스캔 완료: {len(devices)}개 고유 기기 발견", file=sys.stderr)

    return devices, None


def scan_airplay(timeout=5):
    """AirPlay 기기만 스캔"""
    airplay_types = [
        "_airplay._tcp.local.",
        "_raop._tcp.local.",
    ]
    return scan_mdns(airplay_types, timeout)


def scan_homekit(timeout=5):
    """HomeKit 기기만 스캔"""
    homekit_types = [
        "_hap._tcp.local.",
    ]
    return scan_mdns(homekit_types, timeout)


def scan_google(timeout=5):
    """Google Cast 기기만 스캔"""
    google_types = [
        "_googlecast._tcp.local.",
    ]
    return scan_mdns(google_types, timeout)


def wake_on_lan(mac_address, broadcast_ip='255.255.255.255', port=9):
    """Wake-on-LAN 매직 패킷 전송"""
    if WAKEONLAN_AVAILABLE:
        try:
            send_magic_packet(mac_address, ip_address=broadcast_ip, port=port)
            print(f"[network] WoL 패킷 전송: {mac_address}", file=sys.stderr)
            return {"success": True, "mac": mac_address, "broadcast": broadcast_ip}
        except Exception as e:
            return {"success": False, "error": str(e)}
    else:
        # 수동 구현
        try:
            # MAC 주소 정규화
            mac = mac_address.replace(':', '').replace('-', '').replace('.', '').upper()
            if len(mac) != 12:
                return {"success": False, "error": f"잘못된 MAC 주소: {mac_address}"}

            # 매직 패킷 생성
            mac_bytes = bytes.fromhex(mac)
            magic_packet = b'\xff' * 6 + mac_bytes * 16

            # UDP 브로드캐스트
            sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
            sock.sendto(magic_packet, (broadcast_ip, port))
            sock.close()

            print(f"[network] WoL 패킷 전송 (수동): {mac_address}", file=sys.stderr)
            return {"success": True, "mac": mac_address, "broadcast": broadcast_ip}
        except Exception as e:
            return {"success": False, "error": str(e)}


def get_local_ip():
    """로컬 IP 주소 가져오기"""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except:
        return "127.0.0.1"


def get_network_info():
    """네트워크 정보 가져오기"""
    local_ip = get_local_ip()
    hostname = socket.gethostname()

    # 서브넷 추정 (일반적인 /24 가정)
    ip_parts = local_ip.split('.')
    subnet = f"{ip_parts[0]}.{ip_parts[1]}.{ip_parts[2]}.0/24"
    broadcast = f"{ip_parts[0]}.{ip_parts[1]}.{ip_parts[2]}.255"

    return {
        "local_ip": local_ip,
        "hostname": hostname,
        "subnet": subnet,
        "broadcast": broadcast
    }


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "명령어가 필요합니다: scan_mdns, scan_airplay, scan_homekit, scan_google, wol, info"}))
        sys.exit(1)

    command = sys.argv[1]

    # 환경변수에서 설정 읽기
    timeout = int(os.environ.get("NETWORK_TIMEOUT", "5"))
    mac_address = os.environ.get("WOL_MAC")
    broadcast_ip = os.environ.get("WOL_BROADCAST", "255.255.255.255")
    service_types_str = os.environ.get("SERVICE_TYPES", "")

    try:
        if command == "scan_mdns":
            service_types = service_types_str.split(',') if service_types_str else None
            if service_types:
                # 확장자 추가
                service_types = [s if s.endswith('.local.') else f"{s}.local." for s in service_types]
            devices, error = scan_mdns(service_types, timeout)
            if error:
                print(json.dumps({"success": False, "error": error}))
                sys.exit(1)
            print(json.dumps({
                "success": True,
                "devices": devices,
                "count": len(devices)
            }))

        elif command == "scan_airplay":
            devices, error = scan_airplay(timeout)
            if error:
                print(json.dumps({"success": False, "error": error}))
                sys.exit(1)
            print(json.dumps({
                "success": True,
                "devices": devices,
                "count": len(devices)
            }))

        elif command == "scan_homekit":
            devices, error = scan_homekit(timeout)
            if error:
                print(json.dumps({"success": False, "error": error}))
                sys.exit(1)
            print(json.dumps({
                "success": True,
                "devices": devices,
                "count": len(devices)
            }))

        elif command == "scan_google":
            devices, error = scan_google(timeout)
            if error:
                print(json.dumps({"success": False, "error": error}))
                sys.exit(1)
            print(json.dumps({
                "success": True,
                "devices": devices,
                "count": len(devices)
            }))

        elif command == "wol":
            if not mac_address:
                raise ValueError("WOL_MAC 환경변수가 필요합니다.")
            result = wake_on_lan(mac_address, broadcast_ip)
            print(json.dumps(result))

        elif command == "info":
            info = get_network_info()
            print(json.dumps({
                "success": True,
                **info,
                "zeroconf_available": ZEROCONF_AVAILABLE,
                "wakeonlan_available": WAKEONLAN_AVAILABLE
            }))

        elif command == "test":
            print(json.dumps({
                "success": True,
                "message": "Network bridge가 정상 작동합니다.",
                "zeroconf_available": ZEROCONF_AVAILABLE,
                "wakeonlan_available": WAKEONLAN_AVAILABLE,
                "python_version": sys.version
            }))

        else:
            print(json.dumps({"error": f"알 수 없는 명령어: {command}"}))
            sys.exit(1)

    except Exception as e:
        print(json.dumps({
            "success": False,
            "error": str(e)
        }))
        sys.exit(1)


if __name__ == "__main__":
    main()
