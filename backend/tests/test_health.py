from fastapi.testclient import TestClient

from main import app


def test_health_shape() -> None:
    client = TestClient(app)
    response = client.get("/health")
    assert response.status_code == 200

    payload = response.json()
    assert payload["ok"] is True
    assert isinstance(payload["supabase_connected"], bool)
    assert isinstance(payload["model_loaded"], bool)
