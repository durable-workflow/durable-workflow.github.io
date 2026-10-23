FROM rust:1.90.0-slim-bookworm AS build
WORKDIR /app
COPY Cargo.toml .
COPY src ./src
RUN cargo build --release -j 2

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
    && rm -r /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /app/target/release/website-kubernetes-worker /app/worker
COPY --from=build /app/Cargo.lock /app/Cargo.lock
ENTRYPOINT ["/app/worker"]
