#!/usr/bin/env python3
"""Tiny local receiver: let the browser hand week.json straight to Termux.

Why this exists
---------------
The phone browser writes downloads into its own private dir (Android/data/...),
which Termux cannot read on Android 11+. Copy/paste works but is manual.
So: run this in Termux, tap the export button in FitCheck, file lands at
~/ai-coach/week.json. Nothing else is served, nothing is executed.

Usage
-----
    python receiver.py            # listens on 127.0.0.1:8099
    WEEK_OUT=/tmp/w.json python receiver.py 8099   # override target/port

Security notes
--------------
- Binds 127.0.0.1 only: reachable from this device, not from the network.
- Validates JSON before writing; refuses to store garbage.
- Writes to <target>.new then os.replace(): atomic, never a half-written file.
"""
import json
import os
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8099
OUT = os.environ.get("WEEK_OUT") or os.path.expanduser("~/ai-coach/week.json")
MAX_BYTES = 4 * 1024 * 1024


class Handler(BaseHTTPRequestHandler):
    # HTTP/1.1 requires an explicit Content-Length on every response, otherwise
    # the browser keeps waiting for a body that will never be delimited.
    protocol_version = "HTTP/1.1"

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def _reply(self, code, msg):
        self.send_response(code)
        self._cors()
        self.send_header("Content-Type", "text/plain")
        self.send_header("Content-Length", str(len(msg)))
        self.end_headers()
        self.wfile.write(msg)

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_POST(self):
        try:
            n = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            n = -1
        if n < 0:
            self._reply(400, b"bad content-length")
            return
        if n > MAX_BYTES:
            # Must drain the body before replying: closing while the client is
            # still sending gives the browser a connection reset instead of a
            # clean 413, which looks like "network error" to the user.
            left = n
            while left > 0:
                chunk = self.rfile.read(min(left, 65536))
                if not chunk:
                    break
                left -= len(chunk)
            self._reply(413, b"too large")
            print("REJECT size=%d (drained)" % n)
            return
        body = self.rfile.read(n)
        try:
            data = json.loads(body.decode("utf-8"))
        except Exception as exc:
            self._reply(400, b"invalid json")
            print("REJECT invalid json: %s" % exc)
            return
        if not isinstance(data, dict) or not isinstance(data.get("days"), list):
            self._reply(422, b"missing days[]")
            print("REJECT schema: no days[]")
            return
        os.makedirs(os.path.dirname(OUT), exist_ok=True)
        tmp = OUT + ".new"
        with open(tmp, "wb") as fh:
            fh.write(body)
        os.replace(tmp, OUT)
        self._reply(200, b"ok")
        print("OK %d bytes -> %s (days=%d)" % (len(body), OUT, len(data["days"])))

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    print("listening on 127.0.0.1:%d -> %s" % (PORT, OUT))
    sys.stdout.flush()
    HTTPServer(("127.0.0.1", PORT), Handler).serve_forever()