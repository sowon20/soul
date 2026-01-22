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


def get_devices(username=None, password=None, master_token=None, android_id=None):
    """Google Home 기기 목록과 로컬 토큰 조회

    참고: master_token을 사용할 때도 username이 필요할 수 있습니다.
    """
    print(f"[glocaltokens] 기기 검색 시작...", file=sys.stderr)
    print(f"[glocaltokens] username: {username}", file=sys.stderr)
    print(f"[glocaltokens] master_token: {'있음' if master_token else '없음'}", file=sys.stderr)

    # master_token이 있으면 password 없이 사용
    kwargs = {
        "username": username,
        "master_token": master_token,
        "verbose": True
    }
    # password는 master_token 없을 때만 추가
    if password and not master_token:
        kwargs["password"] = password
    if android_id:
        kwargs["android_id"] = android_id

    client = GLocalAuthenticationTokens(**kwargs)

    print(f"[glocaltokens] 클라이언트 생성됨, 기기 검색 중...", file=sys.stderr)

    # get_google_devices_json()은 JSON 문자열을 반환하므로 파싱 필요
    devices_json = client.get_google_devices_json()
    devices = json.loads(devices_json) if devices_json else []

    print(f"[glocaltokens] 검색 완료: {len(devices)}개 기기 발견", file=sys.stderr)
    for d in devices:
        print(f"  - {d.get('device_name', 'unknown')}: {d.get('local_auth_token', 'no token')[:20]}...", file=sys.stderr)

    return {
        "master_token": client.get_master_token(),
        "access_token": client.get_access_token(),
        "devices": devices
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
