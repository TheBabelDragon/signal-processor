#pragma once
#include <stdint.h>
#ifdef __cplusplus
extern "C" {
#endif
void acoustic_clock_init(void);
uint64_t acoustic_clock_now_us(void);
int acoustic_clock_sample_counter(uint64_t *out_frames);
#ifdef __cplusplus
}
#endif
