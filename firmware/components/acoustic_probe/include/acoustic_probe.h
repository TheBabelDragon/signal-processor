#pragma once
#ifdef __cplusplus
extern "C" {
#endif
void acoustic_probe_init(void);
void acoustic_probe_arm(int armed);
int acoustic_probe_is_armed(void);
#ifdef __cplusplus
}
#endif
