#!/usr/bin/env python3
import json
import os
import sys
import time
import urllib.error
import urllib.request
from dataclasses import asdict, dataclass

BASE_URL = os.environ.get("THETOWER_TEST_BASE_URL", "http://127.0.0.1:8080/api/v1")
REQUEST_ID_HEADER = "X-Request-Id"
REQUEST_ID = "test-0.0.9-backend"
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
    req_headers = {"Content-Type": "application/json", REQUEST_ID_HEADER: REQUEST_ID}
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
        with urllib.request.urlopen(req, timeout=20) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
            return resp.status, dict(resp.headers), payload
    except urllib.error.HTTPError as exc:
        payload = json.loads(exc.read().decode("utf-8")) if exc.fp else {}
        return exc.code, dict(exc.headers), payload


def wait_for_run(run_id: str, timeout_seconds: int = 30):
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


def summarize_and_exit() -> int:
    passed = sum(1 for result in results if result.passed)
    total = len(results)
    summary = {
        "passCount": passed,
        "total": total,
        "results": [asdict(result) for result in results],
    }
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0 if passed == total else 1


def main() -> int:
    template_id = None
    run_id = None
    restart_run_id = None

    html_url = "data:text/html,<html><body><h1 id='title'>TheTower 0.0.9</h1></body></html>"

    try:
        status, headers, payload = request_json("GET", "/health")
        add_result(
            "health response wrapper",
            status == 200 and payload.get("data", {}).get("status") == "ok",
            f"status={status}, data.status={payload.get('data', {}).get('status')}",
        )
        add_result(
            "requestId echo",
            payload.get("requestId") == REQUEST_ID and headers.get(REQUEST_ID_HEADER) == REQUEST_ID,
            f"body.requestId={payload.get('requestId')}, header={headers.get(REQUEST_ID_HEADER)}",
        )

        template_body = {
            "name": "v0.0.9-backend-template",
            "description": "backend automation for 0.0.9",
            "schemaVersion": "0.0.8",
            "steps": [
                {
                    "id": "open-1",
                    "type": "openUrl",
                    "position": {"x": 10, "y": 10},
                    "data": {"label": "open", "config": {"url": html_url}},
                },
                {
                    "id": "extract-1",
                    "type": "extract",
                    "position": {"x": 20, "y": 20},
                    "data": {
                        "label": "extract title",
                        "config": {"selector": "#title", "saveAs": "title", "extractType": "text"},
                    },
                },
                {
                    "id": "shot-1",
                    "type": "screenshotPage",
                    "position": {"x": 30, "y": 30},
                    "data": {
                        "label": "shot",
                        "config": {"name": "backend-0.0.9-shot", "format": "png", "fullPage": False},
                    },
                },
            ],
            "otherStep": {"nodes": [], "edges": []},
        }
        status, _, payload = request_json("POST", "/templates", body=template_body)
        template_data = payload.get("data") or {}
        template_id = template_data.get("id")
        add_result(
            "template create 0.0.8 baseline",
            status == 201 and bool(template_id) and template_data.get("schemaVersion") == "0.0.8",
            f"status={status}, templateId={template_id}, schemaVersion={template_data.get('schemaVersion')}",
        )
        add_result(
            "template step count",
            template_data.get("stats", {}).get("stepCount") == 3,
            f"stepCount={template_data.get('stats', {}).get('stepCount')}",
        )

        if not template_id:
            add_result("template detail", False, "template create failed, skipped")
            return summarize_and_exit()

        status, _, payload = request_json("GET", f"/templates/{template_id}")
        add_result(
            "template detail",
            status == 200 and (payload.get("data") or {}).get("id") == template_id,
            f"status={status}, id={(payload.get('data') or {}).get('id')}",
        )

        status, _, payload = request_json("GET", f"/templates?includeLastRun=true")
        items = (payload.get("data") or {}).get("items") or []
        add_result(
            "template list query",
            status == 200 and any(item.get("id") == template_id for item in items),
            f"status={status}, itemCount={len(items)}",
        )

        status, _, payload = request_json(
            "PATCH",
            f"/templates/{template_id}",
            body={"name": "v0.0.9-backend-template-renamed", "description": "patched"},
        )
        add_result(
            "template patch",
            status == 200 and (payload.get("data") or {}).get("name") == "v0.0.9-backend-template-renamed",
            f"status={status}, name={(payload.get('data') or {}).get('name')}",
        )

        status, _, payload = request_json(
            "POST",
            "/runs",
            body={
                "templateId": template_id,
                "dryRun": False,
                "debug": {
                    "enabled": True,
                    "previewFps": 5,
                    "previewQuality": 60,
                },
            },
        )
        error = payload.get("error") or {}
        add_result(
            "debug options validation",
            status == 400 and error.get("code") == "TT-0400-301",
            f"status={status}, code={error.get('code')}, message={error.get('message')}",
        )

        status, _, payload = request_json("POST", "/runs", body={"templateId": template_id, "dryRun": False})
        run_data = (payload.get("data") or {}).get("run") or {}
        run_id = run_data.get("id")
        add_result(
            "run start",
            status == 200 and bool(run_id) and (payload.get("data") or {}).get("wsUrl", "").startswith("/ws/v1/runs/"),
            f"status={status}, runId={run_id}, wsUrl={(payload.get('data') or {}).get('wsUrl')}",
        )

        if run_id:
            final_status, final_payload = wait_for_run(run_id)
        else:
            final_status, final_payload = None, None
        final_run = (final_payload or {}).get("data") or {}
        artifacts = final_run.get("artifacts") or []
        add_result(
            "run terminal success",
            final_status == 200 and final_run.get("status") == "SUCCEEDED",
            f"http={final_status}, runStatus={final_run.get('status')}, error={(final_run.get('error') or {}).get('message')}",
        )
        add_result(
            "run outputs persisted",
            final_run.get("outputs", {}).get("title") == "TheTower 0.0.9",
            f"outputs.title={final_run.get('outputs', {}).get('title')}",
        )
        add_result(
            "run artifacts persisted",
            len(artifacts) >= 1 and any(artifact.get("kind") == "screenshot" for artifact in artifacts),
            f"artifactCount={len(artifacts)}",
        )

        status, _, payload = request_json("GET", f"/runs?templateId={template_id}")
        items = (payload.get("data") or {}).get("items") or []
        add_result(
            "run list query",
            status == 200 and any(item.get("id") == run_id for item in items),
            f"status={status}, total={(payload.get('data') or {}).get('total')}",
        )

        if run_id:
            status, _, payload = request_json("POST", f"/runs/{run_id}/restart")
            restart_data = (payload.get("data") or {}).get("run") or {}
            restart_run_id = restart_data.get("id")
            add_result(
                "run restart",
                status == 200 and bool(restart_run_id) and restart_run_id != run_id,
                f"status={status}, restartRunId={restart_run_id}",
            )

        if restart_run_id:
            final_status, final_payload = wait_for_run(restart_run_id)
            restarted_run = (final_payload or {}).get("data") or {}
            add_result(
                "restarted run terminal success",
                final_status == 200 and restarted_run.get("status") == "SUCCEEDED",
                f"http={final_status}, runStatus={restarted_run.get('status')}",
            )

            status, _, payload = request_json("DELETE", f"/runs/{restart_run_id}")
            add_result(
                "run delete",
                status == 200 and (payload.get("data") or {}).get("deleted") is True,
                f"status={status}, deleted={(payload.get('data') or {}).get('deleted')}",
            )
            restart_run_id = None

        status, _, payload = request_json("DELETE", f"/templates/{template_id}")
        add_result(
            "template delete",
            status == 200 and (payload.get("data") or {}).get("deleted") is True,
            f"status={status}, deleted={(payload.get('data') or {}).get('deleted')}",
        )
        template_id = None
    finally:
        if restart_run_id:
            request_json("DELETE", f"/runs/{restart_run_id}")
        if run_id:
            request_json("DELETE", f"/runs/{run_id}")
        if template_id:
            request_json("DELETE", f"/templates/{template_id}")

    return summarize_and_exit()


if __name__ == "__main__":
    sys.exit(main())