#!/data/data/com.termux/files/usr/bin/bash
# FitCheck 端侧教练：一键启动 + 预热（待办 W）
#
# 为什么必须预热：§8.8 实测冷启动 prefill 只有 1.25 tok/s，稳态 39.62 tok/s（差 32 倍），
# decode 也从 9.83 涨到 13.88 t/s。原因不是 attention 二次方（prompt 只有 9~17 个 token），
# 而是 mmap 缺页：第一个请求要把 2.5GB 权重页从闪存读进来。
# 不预热的话，用户第一次点「开始」会替所有人付这笔税，还会以为"端侧模型慢得不能用"。
#
# 用法：bash ~/start-coach.sh
set -u
MODEL="$HOME/models/Qwen3-4B-Q4_K_M.gguf"
BIN="$HOME/llama.cpp/build/bin/llama-server"
DIR="$HOME/ai-coach"
PORT=8080

[ -f "$MODEL" ] || { echo "MISSING model: $MODEL"; exit 1; }
[ -x "$BIN" ]   || { echo "MISSING binary: $BIN （先按 README §11 编译，别用发行版包）"; exit 1; }
[ -d "$DIR" ]   || { echo "MISSING dir: $DIR"; exit 1; }

# 1) 清掉旧实例：Termux 不一定有 pkill，用 /proc 扫 cmdline（注意 tr 要用空格替换，不能删掉）
for d in /proc/[0-9]*; do
  c=$(tr '\0' ' ' < "$d/cmdline" 2>/dev/null || true)
  case "$c" in
    *llama-server*) echo "killing ${d#/proc/}"; kill "${d#/proc/}" 2>/dev/null || true ;;
  esac
done
sleep 2

# 2) 防止被系统休眠拖走（注意：这【不能】防"后台冻结"，冻结要去系统设置里放行，§10 第 27 条）
command -v termux-wake-lock >/dev/null 2>&1 && termux-wake-lock

# 3) 启动（日志一律 >> 追加，绝不 > 覆盖 —— §10 第 1 条，我们丢过一次 print_timing 证据）
nohup "$BIN" -m "$MODEL" --host 127.0.0.1 --port "$PORT" -c 4096 -t 4 -np 1 --path "$DIR" >> "$HOME/server.log" 2>&1 &
echo "starting llama-server (pid $!) ..."

# 4) 等健康检查通过
code=000
i=1
while [ "$i" -le 40 ]; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:$PORT/health" || echo 000)
  [ "$code" = "200" ] && break
  sleep 1
  i=$((i + 1))
done
if [ "$code" != "200" ]; then
  echo "FAILED to start (health=$code)，看 ~/server.log 最后 20 行"
  exit 1
fi

# 5) 预热：把缺页税付在启动阶段，而不是付在用户第一次点击上
t0=$(date +%s%N)
curl -s -o /dev/null -X POST "http://127.0.0.1:$PORT/completion" \
  -H 'Content-Type: application/json' \
  -d '{"prompt":"warmup","n_predict":16,"temperature":0}'
t1=$(date +%s%N)
echo "warmup: $(( (t1 - t0) / 1000000 )) ms  （冷启动缺页税已在这里付掉）"

# 6) 再测一次，让你看到热态是多少
t2=$(date +%s%N)
curl -s -o /dev/null -X POST "http://127.0.0.1:$PORT/completion" \
  -H 'Content-Type: application/json' \
  -d '{"prompt":"warmup","n_predict":16,"temperature":0}'
t3=$(date +%s%N)
echo "warm : $(( (t3 - t2) / 1000000 )) ms  （这两个数的差就是 §8.8 那 32 倍的账单）"
echo "OK: 浏览器打开 http://127.0.0.1:$PORT/coach.html"