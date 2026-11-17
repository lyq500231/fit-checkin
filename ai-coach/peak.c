/* peak.c -- measure the arithmetic ceiling of THIS cpu, in three ISAs.

   Why this file exists: bw.c gave the memory denominator (measured GB/s).
   Nothing in this project has ever measured the compute denominator, so the
   sentence "prefill is compute bound" was resting on a guess. This closes it.

   Convention (same one used by the 2 x params rule): 1 multiply-add = 2 ops.
     vfmaq_f32  = 4 lanes x 2 ops            = 8  ops
     vdotq_s32  = 16 int8 products + 16 adds = 32 ops
     vmmlaq_s32 = 64 int8 products + 64 adds = 128 ops

   Build on Termux -- the flags matter more than the code:
     clang -O2 -fopenmp -march=armv8.2-a+dotprod+i8mm+fp16 peak.c -o peak
   If you build without +dotprod, the SDOT line measures your own compile flags
   instead of your hardware. That is the exact bug this whole project started
   from, so the program prints its own ISA before any number.

   Run (cold, charger unplugged):
     ./peak 3 1 ; ./peak 3 4 ; ./peak 3 8
*/

#include <stdio.h>
#include <stdlib.h>
#include <stdint.h>
#include <time.h>
#include <omp.h>
#include <arm_neon.h>

#ifdef __ARM_NEON
#define F_NEON 1
#else
#define F_NEON 0
#endif
/* clang calls the macro __ARM_FEATURE_DOTPROD, GCC/ACLE call it __ARM_FEATURE_DOT.
   v1 only checked __ARM_FEATURE_DOT, so a correctly built +dotprod binary reported
   DOTPROD=0 and silently dropped the SDOT kernel: a false negative in the very line
   that exists to prevent false readings. Accept both names. */
#ifdef __ARM_FEATURE_DOT
#define F_DOT_A 1
#else
#define F_DOT_A 0
#endif
#ifdef __ARM_FEATURE_DOTPROD
#define F_DOT_B 1
#else
#define F_DOT_B 0
#endif
#define F_DOT (F_DOT_A || F_DOT_B)
#ifdef __ARM_FEATURE_MATMUL_INT8
#define F_I8MM 1
#else
#define F_I8MM 0
#endif
#ifdef __ARM_FEATURE_FP16_VECTOR_ARITHMETIC
#define F_FP16 1
#else
#define F_FP16 0
#endif

/* inner chunk, amortizes the cost of reading the clock */
#define CH 200000

static double now_s(void) {
    struct timespec ts;
    clock_gettime(CLOCK_MONOTONIC, &ts);
    return (double) ts.tv_sec + (double) ts.tv_nsec / 1e9;
}

/* 4 independent chains so the pipes are not waiting on their own latency */
static double run_f32(double secs, long long *iters) {
    long long it = 0;
    double sink = 0.0;
    double deadline = now_s() + secs;
    #pragma omp parallel reduction(+:it) reduction(+:sink)
    {
        float32x4_t a = vdupq_n_f32(1.0000001f);
        float32x4_t b = vdupq_n_f32(0.9999999f);
        float32x4_t c0 = vdupq_n_f32(0.0f);
        float32x4_t c1 = vdupq_n_f32(1.0f);
        float32x4_t c2 = vdupq_n_f32(2.0f);
        float32x4_t c3 = vdupq_n_f32(3.0f);
        long long k;
        while (now_s() < deadline) {
            for (k = 0; k < CH; k++) {
                c0 = vfmaq_f32(c0, a, b);
                c1 = vfmaq_f32(c1, a, b);
                c2 = vfmaq_f32(c2, a, b);
                c3 = vfmaq_f32(c3, a, b);
            }
            it += CH;
        }
        sink += (double) vaddvq_f32(vaddq_f32(vaddq_f32(c0, c1), vaddq_f32(c2, c3)));
    }
    *iters = it;
    if (sink == 1234.5678) printf("unreachable\n");
    return 8.0 * 4.0;
}

#if F_DOT
static double run_sdot(double secs, long long *iters) {
    long long it = 0;
    double sink = 0.0;
    double deadline = now_s() + secs;
    #pragma omp parallel reduction(+:it) reduction(+:sink)
    {
        int8x16_t a = vdupq_n_s8(3);
        int8x16_t b = vdupq_n_s8(5);
        int32x4_t d0 = vdupq_n_s32(0);
        int32x4_t d1 = vdupq_n_s32(1);
        int32x4_t d2 = vdupq_n_s32(2);
        int32x4_t d3 = vdupq_n_s32(3);
        long long k;
        while (now_s() < deadline) {
            for (k = 0; k < CH; k++) {
                d0 = vdotq_s32(d0, a, b);
                d1 = vdotq_s32(d1, a, b);
                d2 = vdotq_s32(d2, a, b);
                d3 = vdotq_s32(d3, a, b);
            }
            it += CH;
        }
        sink += (double) vgetq_lane_s32(vaddq_s32(vaddq_s32(d0, d1), vaddq_s32(d2, d3)), 0);
    }
    *iters = it;
    if (sink == 1234.5678) printf("unreachable\n");
    return 32.0 * 4.0;
}
#endif

#if F_I8MM
static double run_smmla(double secs, long long *iters) {
    long long it = 0;
    double sink = 0.0;
    double deadline = now_s() + secs;
    #pragma omp parallel reduction(+:it) reduction(+:sink)
    {
        int8x16_t a = vdupq_n_s8(3);
        int8x16_t b = vdupq_n_s8(5);
        int32x4_t m0 = vdupq_n_s32(0);
        int32x4_t m1 = vdupq_n_s32(1);
        int32x4_t m2 = vdupq_n_s32(2);
        int32x4_t m3 = vdupq_n_s32(3);
        long long k;
        while (now_s() < deadline) {
            for (k = 0; k < CH; k++) {
                m0 = vmmlaq_s32(m0, a, b);
                m1 = vmmlaq_s32(m1, a, b);
                m2 = vmmlaq_s32(m2, a, b);
                m3 = vmmlaq_s32(m3, a, b);
            }
            it += CH;
        }
        sink += (double) vgetq_lane_s32(vaddq_s32(vaddq_s32(m0, m1), vaddq_s32(m2, m3)), 0);
    }
    *iters = it;
    if (sink == 1234.5678) printf("unreachable\n");
    return 128.0 * 4.0;
}
#endif

static void say(const char *name, double ops_per_iter, long long iters, double wall, int T) {
    double rate = (double) iters * ops_per_iter / wall;
    printf("T=%d %-6s iters=%lld  ops_s=%.4e  agg=%9.1f Gop/s  per_thread=%8.1f Gop/s\n",
           T, name, iters, rate, rate / 1e9, rate / 1e9 / (double) T);
}

int main(int argc, char **argv) {
    double secs = argc > 1 ? atof(argv[1]) : 3.0;
    int T = argc > 2 ? atoi(argv[2]) : 4;
    long long it;
    double t0, t1, w, r;
    int ran = 0;

    printf("ISA in this binary : NEON=%d DOTPROD=%d I8MM=%d FP16_ARITH=%d DOT_MACRO=%d/%d\n",
           F_NEON, F_DOT, F_I8MM, F_FP16, F_DOT_A, F_DOT_B);
    printf("threads asked=%d  omp_get_max_threads=%d\n", T, omp_get_max_threads());
    omp_set_num_threads(T);
    if (F_DOT == 0)
        printf("WARN no dotprod in this binary: SDOT line would be meaningless, rebuild with -march=armv8.2-a+dotprod+i8mm+fp16\n");

    t0 = now_s(); r = run_f32(secs, &it); t1 = now_s(); w = t1 - t0;
    say("f32", r, it, w, T); ran++;
#if F_DOT
    t0 = now_s(); r = run_sdot(secs, &it); t1 = now_s(); w = t1 - t0;
    say("sdot", r, it, w, T); ran++;
#endif
#if F_I8MM
    t0 = now_s(); r = run_smmla(secs, &it); t1 = now_s(); w = t1 - t0;
    say("smmla", r, it, w, T); ran++;
#endif

    printf("kernels run=%d  wanted=%d\n", ran, 1 + F_DOT + F_I8MM);
    if (ran != 1 + F_DOT + F_I8MM)
        printf("SELF-CHECK FAILED: binary did not run every kernel its own ISA claims to support\n");
    printf("then: ridge_AI = peak_ops_s / measured_bytes_per_s\n");
    printf("      decode_AI = 2 / bytes_per_weight  (Q4_K_M: 2.4973 GB / 4.02e9 = 0.621 B/param)\n");
    printf("      if decode_AI is below ridge_AI, decode is bandwidth bound -- with a measured ceiling\n");
    return 0;
}