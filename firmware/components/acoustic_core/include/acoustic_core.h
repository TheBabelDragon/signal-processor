#pragma once
#include <stdint.h>
#include <stddef.h>
#ifdef __cplusplus
extern "C" {
#endif
#define ACOUSTIC_SCHEMA_VERSION 2
#define ACOUSTIC_FRAME_VERSION  1
#define ACOUSTIC_PING_ID_MAX    96
#define ACOUSTIC_NODE_ID_MAX    48
#define ACOUSTIC_BOOT_ID_MAX    48
typedef struct {
    char node_id[ACOUSTIC_NODE_ID_MAX];
    char boot_id[ACOUSTIC_BOOT_ID_MAX];
    char clock_id[ACOUSTIC_NODE_ID_MAX + ACOUSTIC_BOOT_ID_MAX + 2];
    uint32_t sequence;
} acoustic_session_t;
void acoustic_make_ping_id(char *out, size_t out_len,
                           const char *node_id, const char *boot_id, uint32_t sequence);
#ifdef __cplusplus
}
#endif
