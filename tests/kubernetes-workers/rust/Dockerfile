FROM rust:1.90.0-slim-bookworm AS build
WORKDIR /app
COPY Cargo.toml Cargo.lock ./
COPY src ./src
RUN cargo build --release --locked -j 2

FROM debian:bookworm-slim
# No APT download retries before the first networked apt-get: CVE-2026-109518
# (durable-workflow/.github#295).
RUN echo 'Acquire::Retries "0";' > /etc/apt/apt.conf.d/99-no-retries
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
    && rm -r /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /app/target/release/website-kubernetes-worker /app/worker
COPY --from=build /app/Cargo.lock /app/Cargo.lock
ENTRYPOINT ["/app/worker"]
