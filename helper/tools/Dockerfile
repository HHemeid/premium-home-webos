# Offline build + test image for the Premium Home Home Helper fork.
# Debian bookworm (arm64 host). Only Debian packages; no upstream binaries.
FROM debian:bookworm-slim
RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
      gcc libc6-dev make file binutils \
      gcc-arm-linux-gnueabihf libc6-dev-armhf-cross binutils-arm-linux-gnueabihf \
      qemu-user \
      nodejs node-acorn \
      python3 python3-evdev evtest procps psmisc util-linux kmod ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /work
