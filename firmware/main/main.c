/**
 * Acoustic grid node entry — receive-only by default.
 * No automatic transmission at boot.
 */
#include <stdio.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "acoustic_identity.h"
#include "acoustic_clock.h"
#include "acoustic_transport.h"
#include "acoustic_probe.h"
#include "acoustic_observer.h"

void app_main(void)
{
    acoustic_identity_init();
    acoustic_clock_init();
    acoustic_transport_init();
    acoustic_probe_init();
    acoustic_observer_init();
    acoustic_identity_send_hello();
    printf("acoustic_grid_node: receive-only default, node ready\n");
    while (1) {
        acoustic_transport_poll();
        acoustic_observer_poll();
        vTaskDelay(pdMS_TO_TICKS(10));
    }
}
