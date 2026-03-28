#!/usr/bin/env python3
import json
import sys
import time
import urllib.error
import urllib.request
from dataclasses import asdict, dataclass

BASE_URL = "http://localhost:8080/api/v1"
REQUEST_ID_HEADER = "X-Request-Id"
TERMINAL_STATUSES = {"SUCCEEDED", "FAILED", "CANCELED"}


@dataclass
class CaseResult:
    name: str
    passed: bool
    detail: str


results: list[CaseResult] = []


def add_result(name: str, passed: bool, detail: str) -> None:
    results.append(CaseResult(name=name, passed=passed, detail=detail))


def request_json(method: str, path: str, body: dict | None = None, headers: dict | None = None):
    req_headers = {"Content-Type": "application/json"}
    if headers:
        req_headers.update(headers)

    data = None
    if body is not None:
        data = json.dumps(body).encode("utf-8")

    req = urllib.request.Request(
        url=f"{BASE_URL}{path}",
        method=method,
        data=data,
        headers=req_headers,
    )

    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
            return resp.status, dict(resp.headers), payload
    except urllib.error.HTTPError as exc:
        payload = json.loads(exc.read().decode("utf-8")) if exc.fp else {}
        return exc.code, dict(exc.headers), payload


def wait_for_run(run_id: str, timeout_seconds: int = 40):
    deadline = time.time() + timeout_seconds
    last_payload = None
    while time.time() < deadline:
        status, _, payload = request_json("GET", f"/runs/{run_id}")
        last_payload = payload
        run_data = payload.get("data") or {}
        if status == 200 and run_data.get("status") in TERMINAL_STATUSES:
            return status, payload
        time.sleep(1)
    return None, last_payload


def main() -> int:
    request_id = "test-0.0.5-backend"
    template_id = None
    run_id = None

    try:
        status, headers, payload = request_json("GET", "/health", headers={REQUEST_ID_HEADER: request_id})
        add_result(
            "health response wrapper",
            status == 200 and payload.get("data", {}).get("status") == "ok",
            f"status={status}, data.status={payload.get('data', {}).get('status')}",
        )
        add_result(
            "requestId echo",
            payload.get("requestId") == request_id and headers.get(REQUEST_ID_HEADER) == request_id,
            f"body.requestId={payload.get('requestId')}, header={headers.get(REQUEST_ID_HEADER)}",
        )

        template_body = {
            "name": "v0.0.5-backend-template",
            "description": "backend automation for 0.0.5",
            "schemaVersion": "0.0.5",
            "steps": [
                {
                    "id": "open-1",
                    "type": "openUrl",
                    "position": {"x": 10, "y": 10},
                    "data": {"label": "open", "config": {"url": "https://example.com"}},
                },
                {
                    "id": "extract-1",
                    "type": "extract",
                    "position": {"x": 20, "y": 20},
                    "data": {
                        "label": "extract title",
                        "config": {"selector": "h1", "saveAs": "title", "extractType": "text"},
                    },
                },
                {
                    "id": "shot-1",
                    "type": "screenshotPage",
                    "position": {"x": 30, "y": 30},
                    "data": {
                        "label": "shot",
                        "config": {"name": "backend-0.0.5-shot", "format": "png", "fullPage": True},
                    },
                },
            ],
            "otherStep": {"nodes": [], "edges": []},
        }
        status, _, payload = request_json("POST", "/templates", body=template_body, headers={REQUEST_ID_HEADER: request_id})
        template_data = payload.get("data") or {}
        template_id = template_data.get("id")
        add_result(
            "template create 0.0.5",
            status == 201 and bool(template_id) and template_data.get("schemaVersion") == "0.0.5",
            f"status={status}, templateId={template_id}, schemaVersion={template_data.get('schemaVersion')}",
        )
        add_result(
            "template step count",
            template_data.get("stats", {}).get("stepCount") == 3,
            f"stepCount={template_data.get('stats', {}).get('stepCount')}",
        )

        if not template_id:
            add_result("run lifecycle", False, "template create failed, skipped")
            summary = {"passCount": sum(1 for r in results if r.passed), "total": len(results), "results": [asdict(r) for r in results]}
            print(json.dumps(summary, ensure_ascii=False, indent=2))
            return 1

        start_run_body = {"templateId": template_id, "dryRun": False}
        status, _, payload = request_json("POST", "/runs", body=start_run_body, headers={REQUEST_ID_HEADER: request_id})
        run_data = (payload.get("data") or {}).get("run") or {}
        run_id = run_data.get("id")
        add_result(
            "run start",
            status == 200 and bool(run_id),
            f"status={status}, runId={run_id}",
        )

        final_status, final_payload = wait_for_run(run_id) if run_id else (None, None)
        final_run = (final_payload or {}).get("data") or {}
        add_result(
            "run terminal success",
            final_status == 200 and final_run.get("status") == "SUCCEEDED",
            f"http={final_status}, runStatus={final_run.get('status')}, error={(final_run.get('error') or {}).get('message')}",
        )
        add_result(
            "run outputs persisted",
            final_run.get("outputs", {}).get("title") == "Example Domain",
            f"outputs.title={final_run.get('outputs', {}).get('title')}",
        )
        artifacts = final_run.get("artifacts") or []
        add_result(
            "run artifacts persisted",
            len(artifacts) >= 1 and artifacts[0].get("kind") == "screenshot",
            f"artifactCount={len(artifacts)}, firstKind={(artifacts[0].get('kind') if artifacts else None)}",
        )

        status, _, payload = request_json("GET", f"/runs?templateId={template_id}")
        items = (payload.get("data") or {}).get("items") or []
        add_result(
            "run list query",
            status == 200 and any(item.get("id") == run_id for item in items),
            f"status={status}, total={(payload.get('data') or {}).get('total')}",
        )

        if run_id:
            status, _, payload = request_json("DELETE", f"/runs/{run_id}")
            add_result(
                "run delete",
                status == 200 and (payload.get("data") or {}).get("deleted") is True,
                f"status={status}, deleted={(payload.get('data') or {}).get('deleted')}",
            )

        status, _, payload = request_json("DELETE", f"/templates/{template_id}")
        add_result(
            "template delete",
            status == 200 and (payload.get("data") or {}).get("deleted") is True,
            f"status={status}, deleted={(payload.get('data') or {}).get('deleted')}",
        )
    finally:
        if run_id:
            request_json("DELETE", f"/runs/{run_id}")
        if template_id:
            request_json("DELETE", f"/templates/{template_id}")

    passed = sum(1 for r in results if r.passed)
    total = len(results)
    summary = {
        "passCount": passed,
        "total": total,
        "results": [asdict(r) for r in results],
    }
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0 if passed == total else 1


if __name__ == "__main__":
    sys.exit(main())