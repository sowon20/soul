#!/usr/bin/env python3
"""
Apple TV Bridge for Node.js integration
pyatv 라이브러리를 사용하여 Apple TV를 제어합니다.
"""

import json
import sys
import os
import asyncio
import logging

# 디버그 모드 설정
DEBUG = os.environ.get("APPLETV_DEBUG", "").lower() in ("1", "true", "yes")
if DEBUG:
    logging.basicConfig(level=logging.DEBUG)

# 자격증명 파일 경로
CREDENTIALS_PATH = os.path.join(os.path.dirname(__file__), "appletv-credentials.json")

try:
    import pyatv
    from pyatv.const import Protocol, DeviceState, InputAction
    PYATV_VERSION = pyatv.__version__
except ImportError:
    print(json.dumps({
        "error": "pyatv 패키지가 설치되지 않았습니다. pip install pyatv 를 실행하세요."
    }))
    sys.exit(1)


def load_credentials():
    """저장된 자격증명 로드"""
    try:
        if os.path.exists(CREDENTIALS_PATH):
            with open(CREDENTIALS_PATH, 'r') as f:
                return json.load(f)
    except Exception as e:
        print(f"[appletv] 자격증명 로드 실패: {e}", file=sys.stderr)
    return {}


def save_credentials(credentials):
    """자격증명 저장"""
    try:
        with open(CREDENTIALS_PATH, 'w') as f:
            json.dump(credentials, f, indent=2)
        return True
    except Exception as e:
        print(f"[appletv] 자격증명 저장 실패: {e}", file=sys.stderr)
        return False


async def discover_devices(timeout=5):
    """네트워크에서 Apple TV 기기 검색"""
    print(f"[appletv] Apple TV 검색 중... ({timeout}초)", file=sys.stderr)

    atvs = await pyatv.scan(asyncio.get_event_loop(), timeout=timeout)

    devices = []
    credentials = load_credentials()

    for atv in atvs:
        device = {
            "identifier": atv.identifier,
            "name": atv.name,
            "address": str(atv.address),
            "services": [],
            "paired": atv.identifier in credentials
        }

        for service in atv.services:
            device["services"].append({
                "protocol": str(service.protocol),
                "port": service.port
            })

        devices.append(device)
        print(f"  📺 발견: {atv.name} ({atv.address})", file=sys.stderr)

    print(f"[appletv] 검색 완료: {len(devices)}개 기기 발견", file=sys.stderr)
    return devices


async def get_device_config(identifier):
    """특정 기기의 설정 가져오기"""
    atvs = await pyatv.scan(asyncio.get_event_loop(), identifier=identifier, timeout=5)
    if not atvs:
        return None

    config = atvs[0]
    credentials = load_credentials()

    # 저장된 자격증명 적용
    if identifier in credentials:
        for protocol_str, cred in credentials[identifier].items():
            try:
                protocol = Protocol[protocol_str]
                config.set_credentials(protocol, cred)
            except Exception as e:
                print(f"[appletv] 자격증명 적용 실패 ({protocol_str}): {e}", file=sys.stderr)

    return config


async def connect_device(identifier):
    """Apple TV에 연결"""
    config = await get_device_config(identifier)
    if not config:
        raise ValueError(f"기기를 찾을 수 없습니다: {identifier}")

    atv = await pyatv.connect(config, asyncio.get_event_loop())
    return atv


async def start_pairing(identifier, protocol_name="MRP"):
    """페어링 시작"""
    config = await get_device_config(identifier)
    if not config:
        raise ValueError(f"기기를 찾을 수 없습니다: {identifier}")

    protocol = Protocol[protocol_name]
    pairing = await pyatv.pair(config, protocol, asyncio.get_event_loop())
    await pairing.begin()

    return {
        "device_provides_pin": pairing.device_provides_pin,
        "message": "Apple TV 화면에 표시된 PIN을 입력하세요" if pairing.device_provides_pin else "기기에 1234를 입력하세요"
    }


async def finish_pairing(identifier, pin, protocol_name="MRP"):
    """페어링 완료"""
    config = await get_device_config(identifier)
    if not config:
        raise ValueError(f"기기를 찾을 수 없습니다: {identifier}")

    protocol = Protocol[protocol_name]
    pairing = await pyatv.pair(config, protocol, asyncio.get_event_loop())
    await pairing.begin()

    pairing.pin(int(pin))
    await pairing.finish()

    if pairing.has_paired:
        # 자격증명 저장
        credentials = load_credentials()
        if identifier not in credentials:
            credentials[identifier] = {}
        credentials[identifier][protocol_name] = pairing.service.credentials
        save_credentials(credentials)

        return {
            "success": True,
            "message": "페어링 성공!"
        }
    else:
        return {
            "success": False,
            "message": "페어링 실패"
        }


async def send_remote_command(identifier, button):
    """리모컨 명령 전송"""
    atv = await connect_device(identifier)
    try:
        rc = atv.remote_control

        commands = {
            "up": rc.up,
            "down": rc.down,
            "left": rc.left,
            "right": rc.right,
            "select": rc.select,
            "menu": rc.menu,
            "home": rc.home,
            "play": rc.play,
            "pause": rc.pause,
            "play_pause": rc.play_pause,
            "stop": rc.stop,
            "next": rc.next,
            "previous": rc.previous,
            "volume_up": rc.volume_up,
            "volume_down": rc.volume_down,
            "skip_forward": rc.skip_forward,
            "skip_backward": rc.skip_backward,
        }

        if button not in commands:
            raise ValueError(f"알 수 없는 버튼: {button}")

        await commands[button]()
        return {"success": True, "button": button}
    finally:
        atv.close()


async def get_power_state(identifier):
    """전원 상태 확인"""
    atv = await connect_device(identifier)
    try:
        state = atv.power.power_state
        return {
            "power_state": str(state),
            "is_on": state != pyatv.const.PowerState.Off
        }
    finally:
        atv.close()


async def power_control(identifier, command):
    """전원 제어"""
    atv = await connect_device(identifier)
    try:
        if command == "on":
            await atv.power.turn_on()
        elif command == "off":
            await atv.power.turn_off()
        else:
            raise ValueError(f"알 수 없는 전원 명령: {command}")

        return {"success": True, "command": command}
    finally:
        atv.close()


async def get_now_playing(identifier):
    """현재 재생 정보"""
    atv = await connect_device(identifier)
    try:
        playing = await atv.metadata.playing()

        result = {
            "title": playing.title,
            "artist": playing.artist,
            "album": playing.album,
            "genre": playing.genre,
            "position": playing.position,
            "total_time": playing.total_time,
            "device_state": str(playing.device_state),
            "media_type": str(playing.media_type) if playing.media_type else None,
            "repeat": str(playing.repeat) if playing.repeat else None,
            "shuffle": str(playing.shuffle) if playing.shuffle else None,
        }

        return result
    finally:
        atv.close()


async def set_volume(identifier, level):
    """볼륨 설정"""
    atv = await connect_device(identifier)
    try:
        await atv.audio.set_volume(float(level))
        return {"success": True, "volume": level}
    finally:
        atv.close()


async def stream_url(identifier, url):
    """URL 스트리밍 (AirPlay)"""
    atv = await connect_device(identifier)
    try:
        await atv.stream.play_url(url)
        return {"success": True, "url": url}
    finally:
        atv.close()


def run_async(coro):
    """비동기 함수 실행"""
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "명령어가 필요합니다: discover, pair, remote, power, now_playing, stream"}))
        sys.exit(1)

    command = sys.argv[1]

    # 환경변수에서 설정 읽기
    identifier = os.environ.get("APPLETV_IDENTIFIER")
    button = os.environ.get("APPLETV_BUTTON")
    pin = os.environ.get("APPLETV_PIN")
    power_cmd = os.environ.get("APPLETV_POWER_CMD")
    volume = os.environ.get("APPLETV_VOLUME")
    url = os.environ.get("APPLETV_URL")
    protocol = os.environ.get("APPLETV_PROTOCOL", "MRP")
    timeout = int(os.environ.get("APPLETV_TIMEOUT", "5"))

    try:
        if command == "discover":
            devices = run_async(discover_devices(timeout))
            print(json.dumps({
                "success": True,
                "devices": devices
            }))

        elif command == "pair_start":
            if not identifier:
                raise ValueError("APPLETV_IDENTIFIER 환경변수가 필요합니다.")
            result = run_async(start_pairing(identifier, protocol))
            print(json.dumps({
                "success": True,
                **result
            }))

        elif command == "pair_finish":
            if not identifier or not pin:
                raise ValueError("APPLETV_IDENTIFIER와 APPLETV_PIN 환경변수가 필요합니다.")
            result = run_async(finish_pairing(identifier, pin, protocol))
            print(json.dumps(result))

        elif command == "remote":
            if not identifier or not button:
                raise ValueError("APPLETV_IDENTIFIER와 APPLETV_BUTTON 환경변수가 필요합니다.")
            result = run_async(send_remote_command(identifier, button))
            print(json.dumps(result))

        elif command == "power":
            if not identifier:
                raise ValueError("APPLETV_IDENTIFIER 환경변수가 필요합니다.")
            if power_cmd:
                result = run_async(power_control(identifier, power_cmd))
            else:
                result = run_async(get_power_state(identifier))
            print(json.dumps(result))

        elif command == "now_playing":
            if not identifier:
                raise ValueError("APPLETV_IDENTIFIER 환경변수가 필요합니다.")
            result = run_async(get_now_playing(identifier))
            print(json.dumps({
                "success": True,
                **result
            }))

        elif command == "volume":
            if not identifier or not volume:
                raise ValueError("APPLETV_IDENTIFIER와 APPLETV_VOLUME 환경변수가 필요합니다.")
            result = run_async(set_volume(identifier, volume))
            print(json.dumps(result))

        elif command == "stream":
            if not identifier or not url:
                raise ValueError("APPLETV_IDENTIFIER와 APPLETV_URL 환경변수가 필요합니다.")
            result = run_async(stream_url(identifier, url))
            print(json.dumps(result))

        elif command == "test":
            print(json.dumps({
                "success": True,
                "message": "Apple TV bridge가 정상 작동합니다.",
                "pyatv_version": PYATV_VERSION,
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
