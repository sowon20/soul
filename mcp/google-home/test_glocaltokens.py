#!/usr/bin/env python3
"""
glocaltokens 테스트 스크립트
Raspberry Pi에서 직접 실행하여 문제를 진단합니다.

사용법:
  source ~/glocal-env/bin/activate
  python3 test_glocaltokens.py
"""

import sys
import json

print("=" * 60)
print("glocaltokens 진단 테스트")
print("=" * 60)

# 1. glocaltokens 임포트 테스트
print("\n[1] glocaltokens 패키지 확인...")
try:
    import glocaltokens
    from glocaltokens.client import GLocalAuthenticationTokens
    version = getattr(glocaltokens, '__version__', 'unknown')
    print(f"    ✅ glocaltokens 버전: {version}")

    # 최신 버전 권장
    if version != 'unknown':
        major, minor, patch = map(int, version.split('.'))
        if major == 0 and minor < 7:
            print(f"    ⚠️  버전 0.7.x 이상을 권장합니다. 업그레이드: pip install --upgrade glocaltokens")
except ImportError as e:
    print(f"    ❌ glocaltokens 임포트 실패: {e}")
    print("    설치: pip install glocaltokens")
    sys.exit(1)

# 2. 저장된 인증 정보 확인
print("\n[2] 저장된 인증 정보 확인...")
import os
script_dir = os.path.dirname(os.path.abspath(__file__))
auth_file = os.path.join(script_dir, 'user-auth.json')

username = None
master_token = None

if os.path.exists(auth_file):
    try:
        with open(auth_file, 'r') as f:
            auth_data = json.load(f)
        username = auth_data.get('username')
        master_token = auth_data.get('master_token')
        print(f"    ✅ 인증 파일 발견: {auth_file}")
        print(f"    - username: {username}")
        print(f"    - master_token: {'있음 (' + master_token[:20] + '...)' if master_token else '없음'}")
        print(f"    - 인증 시간: {auth_data.get('authenticated_at', '알 수 없음')}")
    except Exception as e:
        print(f"    ❌ 인증 파일 읽기 실패: {e}")
else:
    print(f"    ❌ 인증 파일 없음: {auth_file}")
    print("    Admin UI에서 Master Token을 설정하세요.")

# 3. 환경 변수 확인
print("\n[3] 환경 변수 확인...")
env_username = os.environ.get('GOOGLE_USERNAME')
env_master_token = os.environ.get('GOOGLE_MASTER_TOKEN')
print(f"    GOOGLE_USERNAME: {env_username or '(설정 안됨)'}")
print(f"    GOOGLE_MASTER_TOKEN: {'있음' if env_master_token else '(설정 안됨)'}")

# 최종 사용할 값 결정
final_username = env_username or username
final_master_token = env_master_token or master_token

if not final_username or not final_master_token:
    print("\n❌ username과 master_token이 모두 필요합니다.")
    print("\n해결 방법:")
    print("  1. Docker로 토큰 획득:")
    print("     docker run --rm -it breph/ha-google-home_get-token")
    print("  2. 환경 변수 설정:")
    print(f'     export GOOGLE_USERNAME="your@gmail.com"')
    print(f'     export GOOGLE_MASTER_TOKEN="aas_et/..."')
    sys.exit(1)

# 4. GLocalAuthenticationTokens 테스트
print("\n[4] GLocalAuthenticationTokens 클라이언트 테스트...")
print(f"    사용할 username: {final_username}")
print(f"    사용할 master_token: {final_master_token[:30]}...")

try:
    # verbose=True로 상세 로그 확인
    import logging
    logging.basicConfig(level=logging.DEBUG)

    client = GLocalAuthenticationTokens(
        username=final_username,
        master_token=final_master_token,
        verbose=True
    )
    print("    ✅ 클라이언트 생성 성공")

    # Master Token 확인
    retrieved_token = client.get_master_token()
    if retrieved_token:
        print(f"    ✅ Master Token 확인됨: {retrieved_token[:30]}...")
    else:
        print("    ❌ Master Token을 가져올 수 없습니다.")

    # Access Token 확인 (Google 서버 인증 필요)
    print("\n[5] Access Token 획득 시도...")
    try:
        access_token = client.get_access_token()
        if access_token:
            print(f"    ✅ Access Token 획득: {access_token[:30]}...")
        else:
            print("    ❌ Access Token을 가져올 수 없습니다.")
    except Exception as e:
        print(f"    ❌ Access Token 획득 실패: {e}")

    # 기기 목록 조회 (로컬 네트워크 필요)
    print("\n[6] Google Home 기기 검색 (로컬 네트워크)...")
    try:
        devices_json = client.get_google_devices_json()
        if devices_json:
            devices = json.loads(devices_json)
            print(f"    ✅ 발견된 기기: {len(devices)}개")
            for i, device in enumerate(devices, 1):
                name = device.get('device_name', '이름 없음')
                hw = device.get('hardware', 'unknown')
                ip = device.get('ip', 'IP 없음')
                token = device.get('local_auth_token', '')
                print(f"       {i}. {name} ({hw})")
                print(f"          IP: {ip}")
                print(f"          Token: {'있음' if token else '없음'}")
        else:
            print("    ❌ 기기를 찾을 수 없습니다.")
            print("    가능한 원인:")
            print("      - 같은 네트워크에 Google Home 기기가 없음")
            print("      - mDNS/Avahi 서비스가 작동하지 않음")
            print("      - Master Token이 만료됨")
    except Exception as e:
        print(f"    ❌ 기기 검색 실패: {e}")

except Exception as e:
    print(f"    ❌ 클라이언트 생성 실패: {e}")
    import traceback
    traceback.print_exc()

print("\n" + "=" * 60)
print("테스트 완료")
print("=" * 60)
