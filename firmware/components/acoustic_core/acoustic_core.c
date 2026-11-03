#include "acoustic_core.h"
#include <stdio.h>
void acoustic_make_ping_id(char *out, size_t out_len,
                           const char *node_id, const char *boot_id, uint32_t sequence)
{
    if (!out || out_len == 0) return;
    snprintf(out, out_len, "%s:%s:%lu",
             node_id ? node_id : "unknown",
             boot_id ? boot_id : "unknown",
             (unsigned long)sequence);
}
