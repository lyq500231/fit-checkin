#!/usr/bin/env python3
"""stream_test.py -- prove whether llama-server really streams, WITHOUT a browser.

Why this file exists: the streaming UI could never be accepted, because the vivo
browser hangs on fetch to 127.0.0.1 (README section 10, item 8). That left one
open question: is the server sending tokens incrementally, or does it buffer
everything and dump it at the end? This answers it from Termux alone.

Run (needs llama-server on port 8080):
  python ~/stream_test.py
  python ~/stream_test.py 0.0.0.0 8080

Read the last two lines, not the token spam:
  spread is close to wall  -> it really streams
  spread near zero, wall big -> the server buffered it
"""
import json
import socket
import sys
import time

HOST = sys.argv[1] if len(sys.argv) > 1 else "127.0.0.1"
PORT = int(sys.argv[2]) if len(sys.argv) > 2 else 8080

PROMPT = "system\nYou are a concise fitness coach. Answer in Chinese.\n" + \
         "user\nGive me three short tips for leg training.\n" + \
         "assistant\n"

body = json.dumps({
    "prompt": PROMPT,
    "n_predict": 48,
    "temperature": 0.3,
    "stream": True,
    "cache_prompt": False,
    "enable_thinking": False,
})

req = "POST /completion HTTP/1.1\r\n" + \
      "Host: " + HOST + "\r\n" + \
      "Content-Type: application/json\r\n" + \
      "Accept: text/event-stream\r\n" + \
      "Content-Length: " + str(len(body)) + "\r\n" + \
      "Connection: close\r\n\r\n" + body

t0 = time.time()
s = socket.create_connection((HOST, PORT), timeout=120)
s.sendall(req.encode("utf-8"))

buf = b""
while b"\r\n\r\n" not in buf:
    d = s.recv(4096)
    if not d:
        break
    buf += d
head, buf = buf.split(b"\r\n\r\n", 1)

marks = []
text = ""
while True:
    t1 = time.time()
    d = s.recv(4096)
    if not d:
        break
    now = t1 - t0
    buf += d
    while b"\n" in buf:
        line, buf = buf.split(b"\n", 1)
        line = line.strip()
        if not line.startswith(b"data:"):
            continue
        payload = line[5:].strip()
        if payload == b"[DONE]":
            break
        try:
            obj = json.loads(payload.decode("utf-8"))
        except Exception:
            continue
        piece = obj.get("content", "")
        if piece:
            marks.append(now)
            text += piece
            print("+%6.2fs  %s" % (now, piece.replace("\n", "\\n")))

wall = time.time() - t0
print("")
print("head      : " + head.split(b"\r\n")[0].decode("utf-8", "replace"))
print("chunks    : %d   chars=%d" % (len(marks), len(text)))
print("first     : %.2fs   last=%.2fs" % (marks[0] if marks else -1, marks[-1] if marks else -1))
print("wall      : %.2fs" % wall)
if len(marks) > 1:
    spread = marks[-1] - marks[0]
    print("spread    : %.2fs  = %.0f%% of wall" % (spread, 100.0 * spread / wall))
    print("VERDICT   : " + ("STREAMING" if spread > 0.5 * wall else "BUFFERED (server dumped at the end)"))
else:
    print("VERDICT   : not enough chunks, check the server log")
print("answer    : " + text.replace("\n", "\\n"))
