#include "acoustic_clock.h"
void acoustic_clock_init(void) {}
uint64_t acoustic_clock_now_us(void) { return 0; }
int acoustic_clock_sample_counter(uint64_t *out_frames) { if (out_frames) *out_frames = 0; return 0; }
