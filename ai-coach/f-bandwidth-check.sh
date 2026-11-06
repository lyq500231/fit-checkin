#!/data/data/com.termux/files/usr/bin/bash
# =====================================================================
# Experiment F : bandwidth accounting
# Model   : Qwen3-4B-Q4_K_M.gguf on iQOO 12 (Snapdragon 8 Gen 3, LPDDR5X)
# Question: is "decode reaches 58% of DRAM bandwidth" defensible, or 42%?
#   numerator   BW_eff = tokens_per_sec * weight_bytes   (fixed, no dispute)
#   denominator ??? theory (68.3 GB/s) or measured stream-read ceiling?
# So F is not "run llama-bench again". F is: MEASURE THE DENOMINATOR.
#
# Usage (run in order, f3 last):
#   bash f-bandwidth-check.sh f0     # sanity + thermal guard + flag list
#   bash f-bandwidth-check.sh f1     # thread scan + ctx sensitivity -> tg.auto.txt
#   bash f-bandwidth-check.sh f2     # stream-read ceiling per thread count
#   bash f-bandwidth-check.sh f3     # reconciliation + verdict
#
# House rules baked in (all learned the hard way on this device):
#   - pure ASCII file, no heredoc quirks: inner delimiters are QUOTED
#   - never pipe into tail/head/wc: they swallowed output here. redirect + cat.
#   - '>' truncates the target BEFORE the command runs: results only in $OUT.
#   - zero results must have a positive control (see f2 sink= and f1 raw table).
#   - tool names may be prefixed (gobjdump etc), so we test executability first.
#   - no gawk-only features (strtonum/ENVIRON tricks) - plain awk arithmetic only.
#   - /tmp is NOT writable in Termux; $TMPDIR or $HOME/f only.
#   - dumpsys is unavailable in Termux; read thermal/cpufreq straight from sysfs.
#   - never use aligned_alloc on Android/Termux: use posix_memalign (API 21+).
#   - DO NOT sum per-worker MAX to get aggregate bandwidth (measured 97.99 GB/s
#     against a 68.3 GB/s theoretical peak -> double counting, obviously wrong).
#   - keep first-touch OUT of the timed loop (cold pages gave 0.53 GB/s vs 29).
# =====================================================================
set -u
MODEL="${MODEL:-$HOME/models/Qwen3-4B-Q4_K_M.gguf}"
BIN="${BIN:-$HOME/llama.cpp/build/bin}"
OUT="${OUT:-$HOME/f-bandwidth}"
THEORY=68.3
BENCH="$BIN/llama-bench"
mkdir -p "$OUT"
say(){ printf '\n===== %s =====\n' "$1"; }

sanity(){
  say "F0 sanity"
  [ -x "$BENCH" ] || { echo "MISSING $BENCH"; exit 1; }
  [ -f "$MODEL" ] || { echo "MISSING $MODEL"; exit 1; }
  ls -l "$MODEL" | cat
  sha256sum "$MODEL" | cat
  echo "expect 2497280256 B / sha256 7485fe6f...4fdf5 (mismatch => different quant, stop)"
  grep -i memtotal /proc/meminfo | cat
  cat /sys/devices/system/cpu/possible | cat
  say "F0 thermal/power guard"
  echo "Unplug the charger, close battery-saver, let the phone idle 5 min before f1/f2."
  # dumpsys is NOT available in Termux (no Android system-service access).
  echo "--- thermal zones ---"; cat /sys/class/thermal/thermal_zone*/temp 2>/dev/null
  echo "--- cpu scaling_cur_freq ---"; cat /sys/devices/system/cpu/cpu*/cpufreq/scaling_cur_freq 2>/dev/null
  say "F0 flags supported by THIS llama-bench (do not trust memory)"
  "$BENCH" --help > "$OUT/help.txt" 2>&1
  sed -n '1,45p' "$OUT/help.txt"
}

# parse a llama-bench markdown table: | model | size | params | backend | threads | test | t/s |
# prints "<threads> <t/s>" for every tg* row; keeps raw file for eyeball control.
parse_tg(){
  # locate columns from the header instead of trusting $6/$8: llama-bench
  # column order differs between builds, a hardcoded index silently yields 0 rows.
  awk -F'|' '
    !ti && /threads/ && /t\/s/ {
      for (i = 1; i <= NF; i++) { c = $i; gsub(/[ \t]/, "", c)
        if (c == "threads") ti = i
        if (c == "t/s")     si = i }
      next
    }
    /tg[0-9]+/ {
      if (ti && si) {
        th = $ti; ts = $si
        gsub(/^[ \t]+|[ \t]+$/, "", th); gsub(/^[ \t]+|[ \t]+$/, "", ts)
        split(ts, a, " ")
        if (th + 0 > 0 && a[1] + 0 > 0) print th + 0, a[1] + 0
      }
    }
  ' "$1"
}

f1(){
  say "F1 thread scan (this is where the 58% number came from)"
  echo "cold machine, charger unplugged? press ENTER when ready (Ctrl-C to abort)"
  read _
  "$BENCH" -m "$MODEL" -p 0 -n 128 -t 1,4,8 -r 5 > "$OUT/tg_scan.txt" 2>&1
  sed -n '1,16p' "$OUT/tg_scan.txt"
  parse_tg "$OUT/tg_scan.txt" > "$OUT/tg.auto.txt"
  say "F1 parsed tg.auto.txt (POSITIVE CONTROL: raw table above must contain these rows)"
  cat "$OUT/tg.auto.txt"
  [ -s "$OUT/tg.auto.txt" ] || echo "!! parse produced 0 rows -> fill $OUT/tg.txt by hand from the table above"
  say "F1 does ctx length change t/s? (if not, bytes/token is constant = weight dominated)"
  for c in 2048 8192 16384; do
    echo "--- ctx=$c ---"
    "$BENCH" -m "$MODEL" -c "$c" -p 0 -n 128 -t 4 -r 3 > "$OUT/tg_c$c.txt" 2>&1
    parse_tg "$OUT/tg_c$c.txt" | cat
    sleep 15
  done
  echo "DONE f1 -> $OUT/tg_scan.txt tg.auto.txt tg_c*.txt"
}

f2(){
  say "F2 stream-read ceiling = the denominator (T=4 measured 50.47 / 49.36 GB/s on iQOO 12)"
  cat > "$OUT/bw.c" <<'CEOF'
#include <stdio.h>
#include <stdlib.h>
#include <stdint.h>
#include <time.h>
#include <omp.h>
/* Stream READ bandwidth. Pages are first-touched by a parallel write, so the
   timed loop never measures page faults. sink= is the positive control: if it
   is non-zero the loop really ran and was not optimized away. */
int main(int argc, char **argv){
  long long MB = argc > 1 ? atoll(argv[1]) : 1024;
  int T        = argc > 2 ? atoi(argv[2]) : 4;
  size_t n     = (size_t)MB * 1024 * 1024 / sizeof(int64_t);
  void *p = NULL;   /* posix_memalign, NOT aligned_alloc: bionic only declares
                       aligned_alloc under API>=28 && C11, which broke on Termux. */
  if (posix_memalign(&p, 64, n * sizeof(int64_t)) != 0 || p == NULL){
    printf("alloc fail %lld MB\n", MB); return 1;
  }
  int64_t *a = (int64_t *)p;
  #pragma omp parallel for num_threads(T) schedule(static)
  for(size_t i = 0; i < n; i++) a[i] = (int64_t)i;
  double best = 0;
  for(int r = 0; r < 6; r++){
    struct timespec t0, t1; int64_t s = 0;
    clock_gettime(CLOCK_MONOTONIC, &t0);
    #pragma omp parallel for num_threads(T) schedule(static) reduction(+:s)
    for(size_t i = 0; i < n; i++) s += a[i];
    clock_gettime(CLOCK_MONOTONIC, &t1);
    double sec = (t1.tv_sec - t0.tv_sec) + (t1.tv_nsec - t0.tv_nsec) / 1e9;
    double gbs = (double)n * 8.0 / sec / 1e9;
    printf("T=%d rep=%d %.2f GB/s sink=%lld\n", T, r, gbs, (long long)s);
    if(gbs > best) best = gbs;
  }
  printf("MAX T=%d %.2f GB/s\n", T, best);
  fflush(stdout);
  free(a); return 0;
}
CEOF
  cd "$OUT" || exit 1
  rm -f build.log
  clang -O2 -std=gnu11 -fopenmp bw.c -o bw >> build.log 2>&1 \
    || clang -O2 -std=gnu11 -Xclang -fopenmp bw.c -o bw -L"$PREFIX/lib" -lomp -I"$PREFIX/include" >> build.log 2>&1 \
    || { say "F2 compile failed - build.log"; cat build.log; exit 1; }
  echo "bw built ok"
  for T in 1 4 8; do
    say "F2 threads=$T array=1024MB"
    OMP_NUM_THREADS=$T ./bw 1024 $T > "$OUT/bw_t$T.txt" 2>&1
    cat "$OUT/bw_t$T.txt"
    sleep 20
  done
  say "F2 larger array 2048MB (must NOT collapse; if it does, L3 was flattering you)"
  OMP_NUM_THREADS=4 ./bw 2048 4 > "$OUT/bw_t4_big.txt" 2>&1
  cat "$OUT/bw_t4_big.txt"
  echo "DONE f2 -> $OUT/bw_t*.txt"
}

f3(){
  say "F3 reconciliation"
  GBYTES=$(stat -c %s "$MODEL")
  echo "weight_bytes_per_token = $GBYTES (CPU-only, no GPU offload; compute-buffer/KV traffic not counted)"
  echo "theoretical peak       = $THEORY GB/s (LPDDR5X-8533, 4x32bit channel)"
  SRC="$OUT/tg.auto.txt"; [ -s "$SRC" ] || SRC="$OUT/tg.txt"
  [ -s "$SRC" ] || { echo "no tg data; run f1 or create $OUT/tg.txt with lines: <threads> <t/s>"; exit 1; }
  echo "using $SRC"
  cat "$SRC"
  printf '\n%-6s %-9s %-12s %-12s %-22s %s\n' thr t/s BW_eff /theory /measured verdict
  for T in 1 4 8; do
    TG=$(awk -v t="$T" '$1+0==t+0{print $2; exit}' "$SRC")
    [ -n "$TG" ] || continue
    CEIL=$(awk '$1=="MAX"{print $3; exit}' "$OUT/bw_t$T.txt" 2>/dev/null)
    [ -n "$CEIL" ] || CEIL=0
    awk -v t="$T" -v tg="$TG" -v b="$GBYTES" -v c="$CEIL" -v th="$THEORY" 'BEGIN{
      eff = tg * b / 1e9
      pm  = (c > 0) ? eff / c * 100 : 0
      v   = "undetermined"
      if (c > 0) {
        if (pm >= 50 && pm <= 72)      v = "old 58pct claim defensible (measured ceiling)"
        else if (pm > 72 && pm <= 100) v = "suspicious: above what gemv normally reaches"
        else if (pm > 100)             v = "measured ceiling too low: check array size / thermal"
        else                           v = "58pct NOT supported: publish ratio vs measured"
      } else v = "run f2 first"
      printf "%-6d %-9.2f %-12.2f %-12s %-22s %s\n", t, tg, eff,
             sprintf("%.1f%%", eff/th*100),
             (c>0 ? sprintf("%.1f%% (ceil %.2f)", pm, c) : "n/a"), v
    }'
  done
  say "F3 decision rule (fixed BEFORE measuring, so we cannot rationalise afterwards)"
  cat <<'REOF'
  1) ceiling(t4) in 45..52 GB/s  -> the 58% figure was ratio-vs-measured. Keep it,
     but ALWAYS state the denominator in write-ups: "58% of measured stream-read ceiling".
  2) ceiling(t4) >= 64 GB/s      -> 58% is wrong. Publish the measured ratio (~42% vs theory)
     and show the formula. It is a stronger claim, not a weaker one.
  3) Whatever the outcome, the honest sentence for the resume/blog is:
     "decode is bandwidth-bound: X tokens/s x 2.50 GB weights = Y GB/s = Z% of this
      platform's measured stream-read ceiling (W GB/s), i.e. near the mobile gemv ceiling."
  4) Do NOT publish a percentage without its denominator and its formula.
REOF
}

case "${1:-f0}" in
  f0) sanity ;; f1) f1 ;; f2) f2 ;; f3) f3 ;;
  parse) parse_tg "${2:?usage: $0 parse <llama-bench table file>}" ;;
  *) echo "usage: $0 [f0|f1|f2|f3|parse <file>]"; exit 1 ;;
esac