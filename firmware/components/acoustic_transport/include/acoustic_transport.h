#pragma once
#ifdef __cplusplus
extern "C" {
#endif
void acoustic_transport_init(void);
void acoustic_transport_poll(void);
int acoustic_transport_send_json(const char *json);
#ifdef __cplusplus
}
#endif
