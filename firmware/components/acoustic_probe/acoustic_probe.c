#include "acoustic_probe.h"
static int armed;
void acoustic_probe_init(void) { armed = 0; }
void acoustic_probe_arm(int a) { armed = a ? 1 : 0; }
int acoustic_probe_is_armed(void) { return armed; }
