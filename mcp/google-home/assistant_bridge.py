#!/usr/bin/env python3
"""
Google Assistant API bridge for Node.js integration
텍스트 명령으로 Google Assistant를 호출하여 스마트홈 기기를 제어합니다.
"""

import json
import sys
import os

# 토큰 파일 경로
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
TOKEN_PATH = os.path.join(SCRIPT_DIR, "assistant-token.json")


def load_token():
    """저장된 토큰 로드"""
    if not os.path.exists(TOKEN_PATH):
        return None
    with open(TOKEN_PATH, "r") as f:
        return json.load(f)


def save_token(token_data):
    """토큰 저장"""
    with open(TOKEN_PATH, "w") as f:
        json.dump(token_data, f, indent=2)


def refresh_access_token():
    """refresh_token으로 access_token 갱신"""
    import urllib.request
    import urllib.parse

    token_data = load_token()
    if not token_data or not token_data.get("refresh_token"):
        raise Exception("refresh_token이 없습니다. 재인증이 필요합니다.")

    data = urllib.parse.urlencode({
        "client_id": token_data["client_id"],
        "client_secret": token_data["client_secret"],
        "refresh_token": token_data["refresh_token"],
        "grant_type": "refresh_token"
    }).encode()

    req = urllib.request.Request(
        "https://oauth2.googleapis.com/token",
        data=data,
        headers={"Content-Type": "application/x-www-form-urlencoded"}
    )

    with urllib.request.urlopen(req) as resp:
        result = json.loads(resp.read().decode())

    if "access_token" in result:
        token_data["access_token"] = result["access_token"]
        save_token(token_data)
        return result["access_token"]

    raise Exception(f"토큰 갱신 실패: {result}")


def get_access_token():
    """유효한 access_token 반환 (필요시 갱신)"""
    token_data = load_token()
    if not token_data:
        raise Exception("토큰이 없습니다. OAuth 인증이 필요합니다.")
    return token_data.get("access_token")


def send_text_query(query):
    """Google Assistant에 텍스트 쿼리 전송 (gRPC)"""
    try:
        import grpc
        from google.assistant.embedded.v1alpha2 import embedded_assistant_pb2
        from google.assistant.embedded.v1alpha2 import embedded_assistant_pb2_grpc
    except ImportError:
        # grpc 패키지가 없으면 대안 방식 시도
        return send_text_query_rest(query)

    access_token = get_access_token()

    # gRPC 채널 생성
    credentials = grpc.access_token_call_credentials(access_token)
    ssl_credentials = grpc.ssl_channel_credentials()
    composite_credentials = grpc.composite_channel_credentials(ssl_credentials, credentials)

    channel = grpc.secure_channel("embeddedassistant.googleapis.com", composite_credentials)
    stub = embedded_assistant_pb2_grpc.EmbeddedAssistantStub(channel)

    # 텍스트 쿼리 설정
    config = embedded_assistant_pb2.AssistConfig(
        audio_out_config=embedded_assistant_pb2.AudioOutConfig(
            encoding=embedded_assistant_pb2.AudioOutConfig.LINEAR16,
            sample_rate_hertz=16000,
            volume_percentage=100,
        ),
        device_config=embedded_assistant_pb2.DeviceConfig(
            device_id="soul-mcp-assistant",
            device_model_id="soul-mcp-model",
        ),
        text_query=query,
    )

    # 요청 전송
    def request_generator():
        yield embedded_assistant_pb2.AssistRequest(config=config)

    responses = []
    text_response = ""

    try:
        for response in stub.Assist(request_generator()):
            if response.dialog_state_out.supplemental_display_text:
                text_response = response.dialog_state_out.supplemental_display_text
            responses.append(response)
    except grpc.RpcError as e:
        if e.code() == grpc.StatusCode.UNAUTHENTICATED:
            # 토큰 만료 - 갱신 후 재시도
            refresh_access_token()
            return send_text_query(query)  # 재귀 호출
        raise Exception(f"gRPC 오류: {e.code()} - {e.details()}")

    return {
        "success": True,
        "query": query,
        "response": text_response or "명령이 실행되었습니다.",
    }


def send_text_query_rest(query):
    """REST API로 Google Assistant 호출 (대안)"""
    import urllib.request
    import urllib.error

    access_token = get_access_token()

    # Dialogflow나 다른 REST 엔드포인트 시도
    # Google Assistant는 기본적으로 gRPC만 지원하므로,
    # 여기서는 Home Graph API로 기기 상태를 확인하는 대안 제공

    return {
        "success": False,
        "error": "gRPC 패키지가 필요합니다. pip install grpcio google-assistant-grpc 를 실행하세요.",
        "query": query
    }


def list_devices_via_assistant():
    """Google Assistant로 기기 목록 조회"""
    return send_text_query("내 기기 목록 알려줘")


def control_device(device_name, action):
    """기기 제어 명령"""
    # 한국어 명령 생성
    if action == "on":
        query = f"{device_name} 켜줘"
    elif action == "off":
        query = f"{device_name} 꺼줘"
    elif action.startswith("brightness:"):
        level = action.split(":")[1]
        query = f"{device_name} 밝기 {level}퍼센트로 설정해줘"
    elif action.startswith("color:"):
        color = action.split(":")[1]
        query = f"{device_name} {color}색으로 바꿔줘"
    else:
        query = f"{device_name} {action}"

    return send_text_query(query)


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "명령어가 필요합니다: query, control, refresh_token, test"}))
        sys.exit(1)

    command = sys.argv[1]

    try:
        if command == "query":
            # 텍스트 쿼리
            if len(sys.argv) < 3:
                raise ValueError("쿼리 텍스트가 필요합니다.")
            query = " ".join(sys.argv[2:])
            result = send_text_query(query)
            print(json.dumps(result, ensure_ascii=False))

        elif command == "control":
            # 기기 제어
            if len(sys.argv) < 4:
                raise ValueError("기기 이름과 동작이 필요합니다.")
            device_name = sys.argv[2]
            action = sys.argv[3]
            result = control_device(device_name, action)
            print(json.dumps(result, ensure_ascii=False))

        elif command == "refresh_token":
            # 토큰 갱신
            new_token = refresh_access_token()
            print(json.dumps({
                "success": True,
                "message": "토큰이 갱신되었습니다.",
                "access_token": new_token[:20] + "..."
            }))

        elif command == "test":
            # 연결 테스트
            token_data = load_token()
            has_token = token_data is not None
            has_refresh = token_data.get("refresh_token") if token_data else False

            print(json.dumps({
                "success": True,
                "has_token": has_token,
                "has_refresh_token": bool(has_refresh),
                "message": "Assistant bridge 준비됨" if has_token else "토큰 설정 필요"
            }))

        else:
            print(json.dumps({"error": f"알 수 없는 명령어: {command}"}))
            sys.exit(1)

    except Exception as e:
        print(json.dumps({
            "success": False,
            "error": str(e)
        }, ensure_ascii=False))
        sys.exit(1)


if __name__ == "__main__":
    main()
