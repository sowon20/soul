#!/usr/bin/env python3
"""
glocaltokens bridge for Node.js integration
사용자 Google 계정으로 Google Home 기기 목록과 로컬 토큰을 가져옵니다.
"""

import json
import sys
import os
import logging

# 디버그 모드 설정
DEBUG = os.environ.get("GLOCAL_DEBUG", "").lower() in ("1", "true", "yes")
if DEBUG:
    logging.basicConfig(level=logging.DEBUG)

try:
    from glocaltokens.client import GLocalAuthenticationTokens
    import glocaltokens
    GLOCALTOKENS_VERSION = getattr(glocaltokens, '__version__', 'unknown')
except ImportError:
    print(json.dumps({
        "error": "glocaltokens 패키지가 설치되지 않았습니다. pip install glocaltokens 를 실행하세요."
    }))
    sys.exit(1)


def get_master_token(username, password, android_id=None):
    """사용자 인증으로 master token 획득"""
    client = GLocalAuthenticationTokens(
        username=username,
        password=password,
        android_id=android_id,
        verbose=DEBUG
    )
    return client.get_master_token()


def discover_devices_mdns(timeout=5):
    """mDNS/Zeroconf로 Google Cast 기기 검색 (인증 불필요)"""
    try:
        from zeroconf import Zeroconf, ServiceBrowser
        import socket
        import time
    except ImportError:
        return None, "zeroconf 패키지가 필요합니다: pip install zeroconf"

    devices = []

    class CastListener:
        def add_service(self, zc, type_, name):
            info = zc.get_service_info(type_, name)
            if info:
                device_name = name.replace("._googlecast._tcp.local.", "")
                ip = socket.inet_ntoa(info.addresses[0]) if info.addresses else None
                devices.append({
                    "device_name": info.properties.get(b'fn', b'').decode('utf-8') or device_name,
                    "device_id": info.properties.get(b'id', b'').decode('utf-8'),
                    "model": info.properties.get(b'md', b'').decode('utf-8'),
                    "ip": ip,
                    "port": info.port
                })
                print(f"  📡 발견: {devices[-1]['device_name']} ({ip})", file=sys.stderr)

        def remove_service(self, zc, type_, name):
            pass

        def update_service(self, zc, type_, name):
            pass

    print(f"[mDNS] Google Cast 기기 검색 중... ({timeout}초)", file=sys.stderr)
    zc = Zeroconf()
    listener = CastListener()
    browser = ServiceBrowser(zc, "_googlecast._tcp.local.", listener)

    time.sleep(timeout)
    zc.close()

    print(f"[mDNS] 검색 완료: {len(devices)}개 기기 발견", file=sys.stderr)
    return devices, None


def get_devices(username=None, password=None, master_token=None, android_id=None):
    """Google Home 기기 목록과 로컬 토큰 조회 (패치된 버전)"""
    import gpsoauth
    from datetime import datetime

    print(f"[glocaltokens] 기기 검색 시작...", file=sys.stderr)
    print(f"[glocaltokens] username: {username}", file=sys.stderr)
    print(f"[glocaltokens] master_token: {'있음' if master_token else '없음'}", file=sys.stderr)

    # 먼저 mDNS로 기기 검색 시도
    mdns_devices, mdns_error = discover_devices_mdns()
    if mdns_devices:
        print(f"[mDNS] {len(mdns_devices)}개 기기를 mDNS로 발견", file=sys.stderr)

    # master_token이 있으면 패치된 방식으로 시도
    if master_token and username:
        try:
            # android_id 기본값 설정
            if not android_id:
                android_id = 'abcdef1234567890'

            # 라이브러리 메서드 패치
            def patched_get_master(self):
                return master_token

            def patched_get_access(self):
                result = gpsoauth.perform_oauth(
                    username,
                    master_token,
                    android_id=android_id,
                    service='oauth2:https://www.google.com/accounts/OAuthLogin',
                    app='com.google.android.apps.chromecast.app',
                    client_sig='24bb24c05e47e0aefa68a58a766179d9b613a600'
                )
                if 'Auth' in result:
                    self._access_token = result['Auth']
                    self._access_token_date = datetime.now()
                    return result['Auth']
                return None

            # 패치 적용
            GLocalAuthenticationTokens.get_master_token = patched_get_master
            GLocalAuthenticationTokens.get_access_token = patched_get_access

            client = GLocalAuthenticationTokens(username=username)
            client._master_token = master_token
            client._android_id = android_id

            print(f"[glocaltokens] 패치된 클라이언트로 토큰 조회 중...", file=sys.stderr)
            devices_json = client.get_google_devices_json()
            glocal_devices = json.loads(devices_json) if devices_json else []

            print(f"[glocaltokens] {len(glocal_devices)}개 기기 (토큰 포함)", file=sys.stderr)

            if glocal_devices:
                return {
                    "success": True,
                    "master_token": master_token,
                    "access_token": client._access_token,
                    "devices": glocal_devices
                }
        except Exception as e:
            print(f"[glocaltokens] 패치된 방식 실패: {e}", file=sys.stderr)

    # glocaltokens 실패시 mDNS 결과만 반환
    if mdns_devices:
        return {
            "success": True,
            "master_token": master_token,
            "access_token": None,
            "devices": mdns_devices,
            "note": "mDNS로 기기 발견됨 (로컬 토큰 없음)"
        }

    return {
        "success": True,
        "master_token": master_token,
        "access_token": None,
        "devices": []
    }


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "명령어가 필요합니다: get_master_token, get_devices"}))
        sys.exit(1)

    command = sys.argv[1]

    # 환경변수에서 인증 정보 읽기
    username = os.environ.get("GOOGLE_USERNAME")
    password = os.environ.get("GOOGLE_PASSWORD")
    master_token = os.environ.get("GOOGLE_MASTER_TOKEN")
    android_id = os.environ.get("ANDROID_ID")

    try:
        if command == "get_master_token":
            if not username or not password:
                raise ValueError("GOOGLE_USERNAME과 GOOGLE_PASSWORD 환경변수가 필요합니다.")

            token = get_master_token(username, password, android_id)
            print(json.dumps({
                "success": True,
                "master_token": token
            }))

        elif command == "get_devices":
            if not master_token and (not username or not password):
                raise ValueError("GOOGLE_MASTER_TOKEN 또는 GOOGLE_USERNAME/PASSWORD가 필요합니다.")

            result = get_devices(
                username=username,
                password=password,
                master_token=master_token,
                android_id=android_id
            )
            print(json.dumps({
                "success": True,
                **result
            }))

        elif command == "test":
            # 연결 테스트 및 버전 정보
            print(json.dumps({
                "success": True,
                "message": "glocaltokens bridge가 정상 작동합니다.",
                "glocaltokens_version": GLOCALTOKENS_VERSION,
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
