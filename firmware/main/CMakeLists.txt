idf_component_register(
    SRCS "main.c"
    INCLUDE_DIRS "."
    REQUIRES acoustic_core acoustic_identity acoustic_clock acoustic_audio acoustic_transport acoustic_probe acoustic_observer
)
