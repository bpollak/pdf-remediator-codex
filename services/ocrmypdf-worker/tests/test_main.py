"""Worker tests with a fake ocrmypdf on PATH.

Run from services/ocrmypdf-worker (needs fastapi, python-multipart and httpx):

    PYTHONDONTWRITEBYTECODE=1 python -m unittest discover -s tests
"""

import asyncio
import os
import stat
import sys
import tempfile
import unittest
from pathlib import Path

os.environ["OCR_WORKER_API_KEY"] = "secret"
os.environ["OCR_MAX_UPLOAD_MB"] = "1"
os.environ.pop("OCR_WORKER_ALLOW_UNAUTHENTICATED", None)
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient  # noqa: E402

from app.main import OCR_SLOTS, app  # noqa: E402

AUTH = {"x-api-key": "secret"}
PDF = b"%PDF-1.4\n%fake\n"


def write_fake_ocrmypdf(directory: Path, body: str) -> None:
    script = directory / "ocrmypdf"
    script.write_text("#!/bin/sh\n" + body)
    script.chmod(script.stat().st_mode | stat.S_IEXEC)


class WorkerTests(unittest.TestCase):
    def setUp(self) -> None:
        self.client = TestClient(app, raise_server_exceptions=False)
        self.bin_dir = tempfile.TemporaryDirectory()
        self.original_path = os.environ["PATH"]
        os.environ["PATH"] = f"{self.bin_dir.name}{os.pathsep}{self.original_path}"
        # Copies the input (second to last argument) to the output (last).
        write_fake_ocrmypdf(Path(self.bin_dir.name), 'for last; do :; done\neval "input=\\${$(($#-1))}"\ncp "$input" "$last"\n')

    def tearDown(self) -> None:
        os.environ["PATH"] = self.original_path
        os.environ["OCR_WORKER_API_KEY"] = "secret"
        os.environ.pop("OCR_WORKER_ALLOW_UNAUTHENTICATED", None)
        self.bin_dir.cleanup()

    def post_pdf(self, headers=None, content=PDF):
        return self.client.post("/ocr", files={"file": ("a.pdf", content, "application/pdf")}, headers=headers or AUTH)

    def test_returns_the_ocr_output(self) -> None:
        response = self.post_pdf()
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.headers["content-type"], "application/pdf")
        self.assertEqual(response.content, PDF)

    def test_refuses_unauthenticated_chunked_upload_without_reading_it(self) -> None:
        consumed = 0

        def body():
            nonlocal consumed
            yield b'--XyZ\r\nContent-Disposition: form-data; name="file"; filename="a.pdf"\r\n\r\n'
            for _ in range(20):
                consumed += 1
                yield b"A" * (1024 * 1024)
            yield b"\r\n--XyZ--\r\n"

        response = self.client.post("/ocr", content=body(), headers={"content-type": "multipart/form-data; boundary=XyZ"})
        self.assertEqual(response.status_code, 401)
        self.assertLessEqual(consumed, 1)

    def test_requires_content_length(self) -> None:
        def body():
            yield b'--XyZ\r\nContent-Disposition: form-data; name="file"; filename="a.pdf"\r\n\r\n%PDF\r\n--XyZ--\r\n'

        response = self.client.post(
            "/ocr", content=body(), headers={**AUTH, "content-type": "multipart/form-data; boundary=XyZ"}
        )
        self.assertEqual(response.status_code, 411)
        self.assertEqual(response.json()["code"], "length_required")

    def test_refuses_oversized_upload_by_content_length(self) -> None:
        response = self.post_pdf(content=b"A" * (3 * 1024 * 1024))
        self.assertEqual(response.status_code, 413)
        self.assertNotIn("OCR_MAX_UPLOAD_MB", response.text)

    def test_missing_binary_returns_json_503(self) -> None:
        os.environ["PATH"] = self.bin_dir.name + "-missing"
        response = self.post_pdf()
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json()["code"], "ocr_unavailable")
        self.assertEqual(self.client.get("/healthz").status_code, 503)

    def test_failure_detail_is_logged_not_returned(self) -> None:
        write_fake_ocrmypdf(Path(self.bin_dir.name), 'echo "error in /tmp/ocr-worker-abc/input.pdf" >&2\nexit 4\n')
        with self.assertLogs("ocr-worker", level="WARNING"):
            response = self.post_pdf()
        self.assertEqual(response.status_code, 502)
        self.assertNotIn("/tmp", response.text)
        self.assertEqual(response.json()["exit_code"], 4)

    def test_fails_closed_without_a_key(self) -> None:
        os.environ["OCR_WORKER_API_KEY"] = ""
        response = self.post_pdf(headers={})
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json()["code"], "not_configured")
        self.assertEqual(self.client.get("/healthz").status_code, 503)

        os.environ["OCR_WORKER_ALLOW_UNAUTHENTICATED"] = "true"
        self.assertEqual(self.post_pdf(headers={}).status_code, 200)

    def test_busy_worker_answers_503_before_reading_the_upload(self) -> None:
        os.environ["OCR_QUEUE_WAIT_SECONDS"] = "1"
        asyncio.run(OCR_SLOTS.acquire())  # another job holds the only slot
        consumed = 0
        head = b'--XyZ\r\nContent-Disposition: form-data; name="file"; filename="a.pdf"\r\n\r\n'
        tail = b"\r\n--XyZ--\r\n"

        def body():
            nonlocal consumed
            consumed += 1
            yield head + PDF + tail

        try:
            response = self.client.post(
                "/ocr",
                content=body(),
                headers={
                    **AUTH,
                    "content-type": "multipart/form-data; boundary=XyZ",
                    "content-length": str(len(head + PDF + tail)),
                },
            )
        finally:
            OCR_SLOTS.release()
            os.environ.pop("OCR_QUEUE_WAIT_SECONDS", None)
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json()["code"], "busy")
        self.assertEqual(consumed, 0)
        self.assertEqual(self.post_pdf().status_code, 200)

    def test_docs_and_schema_are_disabled(self) -> None:
        for path in ("/docs", "/redoc", "/openapi.json"):
            self.assertEqual(self.client.get(path).status_code, 404, path)

    def test_healthz_ok_when_configured(self) -> None:
        response = self.client.get("/healthz")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ok"})


if __name__ == "__main__":
    unittest.main()
